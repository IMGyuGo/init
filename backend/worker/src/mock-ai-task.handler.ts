import {
  AiResultRepository,
  CommunicationAnalysisRecord,
  GeneratedDraftRecord,
  GeneratedQuestionEvaluationRecord,
  GeneratedReportRecord,
  GeneratedReportConfidenceRecord,
  GeneratedReportScoreRecord,
  hashSourceText
} from "./ai-result.repository";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import { AiTaskHandler, AiTaskResult, AiWorkerJob } from "./worker.types";
import { SttProvider } from "./stt-provider";

interface WorkerInput {
  kind?: string;
  payload?: Record<string, unknown>;
}

interface StructuredReportEvaluation {
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
}

const MOCK_HIRING_DECISION_TERMS = [
  "합격",
  "불합격",
  "탈락",
  "채용 적합",
  "채용 부적합",
  "선별",
  "hiring decision",
  "pass/fail"
];

export class MockAiTaskHandler implements AiTaskHandler {
  constructor(
    private readonly results: AiResultRepository,
    private readonly options: { sttProvider?: SttProvider } = {}
  ) {}

  async handle(job: AiWorkerJob): Promise<AiTaskResult> {
    const input = parseInput(job.inputRef);
    const payload = input.payload ?? {};

    switch (job.processType) {
      case "DOCUMENT_EXTRACT":
        return this.documentExtract(payload);
      case "STT":
        return this.stt(payload);
      case "FOLLOW_UP":
        return this.followUp(input.kind ?? "RECRUITING_FOLLOW_UP", payload);
      case "REPORT_GENERATE":
        return this.reportGenerate(input.kind ?? "RECRUITING_REPORT_GENERATE", payload, job.processLogId);
      case "CRITERIA_SUGGEST":
        return this.criteriaSuggest(payload, job.processLogId);
      case "QUESTION_GENERATE":
        return this.questionGenerate(input.kind ?? "RECRUITING_QUESTION_GENERATE", payload, job.processLogId);
      case "QUESTION_SET_GENERATE":
        return this.questionSetGenerate(payload, job.processLogId);
      case "EMBEDDING":
        return this.embedding(payload);
      default:
        throw new NonRetryableAiWorkerFailure(`unsupported process type: ${job.processType}`);
    }
  }

  private documentExtract(payload: Record<string, unknown>): AiTaskResult {
    if ("fileContent" in payload) {
      throw new NonRetryableAiWorkerFailure("raw file content must not be sent to document extraction worker");
    }

    const documentId = positiveNumber(payload.documentId, "documentId");
    const fileId = positiveNumber(payload.fileId, "fileId");
    const s3Key = requiredText(payload.s3Key, "s3Key");
    const extractedText = `Extracted text from ${s3Key}`;

    return {
      outputRef: JSON.stringify({
        documentId,
        fileAsset: fileAssetRef(fileId, s3Key)
      }),
      guardrail: { result: "PASS", reason: null },
      finalSave: () =>
        this.results.saveDocumentExtraction({
          documentId,
          fileId,
          s3Key,
          extractedText
        })
    };
  }

  private async stt(payload: Record<string, unknown>): Promise<AiTaskResult> {
    const answerId = positiveNumber(payload.answerId, "answerId");
    const audioFileId = positiveNumber(payload.audioFileId, "audioFileId");
    const audioS3Key = requiredText(payload.audioS3Key, "audioS3Key");
    const providerResult = this.options.sttProvider
      ? await this.options.sttProvider.transcribe({ audioFileId, audioS3Key })
      : {
          transcript: `Transcript generated from ${audioS3Key}`,
          transcriptSource: "MOCK_AUDIO_PLACEHOLDER" as const
        };

    return {
      outputRef: JSON.stringify({
        answerId,
        fileAsset: fileAssetRef(audioFileId, audioS3Key),
        transcript: providerResult.transcript,
        transcriptSource: providerResult.transcriptSource,
        model: providerResult.model,
        transcriptTarget: "interview_answers.transcript",
        dedupeKey: `answer:${answerId}:transcript`,
        duplicatePolicy: "KEEP_EXISTING_TRANSCRIPT"
      }),
      guardrail: { result: "PASS", reason: null },
      finalSave: () =>
        this.results.saveTranscript({
          answerId,
          audioFileId,
          audioS3Key,
          transcript: providerResult.transcript
        })
    };
  }

  private followUp(kind: string, payload: Record<string, unknown>): AiTaskResult {
    const sessionId = positiveNumber(payload.sessionId, "sessionId");
    const answerId = positiveNumber(payload.answerId, "answerId");
    const previousQuestion = requiredText(payload.previousQuestion, "previousQuestion");
    const transcript = requiredText(payload.transcript, "transcript");
    const policy = kind.startsWith("MOCK") ? "MOCK" : "RECRUITING";
    const jobDescription = typeof payload.jobDescription === "string" ? payload.jobDescription : undefined;
    const documentSummary = typeof payload.documentSummary === "string" ? payload.documentSummary : undefined;
    if (policy === "RECRUITING" && !hasText(jobDescription) && !hasText(documentSummary)) {
      throw new NonRetryableAiWorkerFailure("jobDescription or documentSummary is required");
    }
    const context =
      policy === "MOCK"
        ? previousQuestion
        : [previousQuestion, jobDescription, documentSummary]
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .map(shorten)
            .join(" | ");
    const content = buildFollowUpQuestion({
      policy,
      previousQuestion,
      transcript,
      context,
      jobDescription,
      documentSummary
    });

    return {
      outputRef: JSON.stringify({
        sessionId,
        answerId,
        policy,
        previousQuestion,
        content,
        jobDescription,
        documentSummary,
        dedupeKey: `${policy}:${sessionId}:${answerId}`,
        duplicatePolicy: "KEEP_EXISTING_FOLLOW_UP"
      }),
      guardrail: this.validateMockPolicy(policy, content),
      finalSave: () => this.results.saveFollowUpQuestion({ sessionId, answerId, content, policy })
    };
  }

  private criteriaSuggest(payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const postingId = positiveNumber(payload.postingId, "postingId");
    const jobDescription = requiredText(payload.jobDescription, "jobDescription");
    const talentProfile = requiredText(payload.talentProfile, "talentProfile");
    const evaluationPolicy = requiredText(payload.evaluationPolicy, "evaluationPolicy");
    const criteriaSuggestions = [
      {
        title: "문제 해결력",
        description: `JD 맥락: ${shorten(jobDescription)}`,
        weight: 40,
        order: 1,
        suggestionReason: "직무 요구사항에서 문제 분석과 해결 역량 검증이 필요합니다.",
        category: "직무 역량"
      },
      {
        title: "조직 적합도",
        description: `인재상 맥락: ${shorten(talentProfile)}`,
        weight: 30,
        order: 2,
        suggestionReason: "팀 협업 방식과 인재상 부합 여부를 확인해야 합니다.",
        category: "태도"
      },
      {
        title: "근거 기반 판단",
        description: `평가 정책: ${shorten(evaluationPolicy)}`,
        weight: 30,
        order: 3,
        suggestionReason: "평가 정책에 맞춰 답변 근거와 의사결정 과정을 확인합니다.",
        category: "커뮤니케이션"
      }
    ];
    const items = criteriaSuggestions.map((candidate) => candidate.title);

    return this.generatedDraft("CRITERIA_SUGGEST", items, {
      sourceProcessLogId: processLogId,
      postingId,
      targetTables: ["criterion_tags", "evaluation_criteria"],
      criteriaSuggestions
    });
  }

  private reportGenerate(kind: string, payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    switch (payload.step) {
      case "EVALUATION_CONTEXT":
        return this.evaluationContext(payload, processLogId);
      case "ANSWER_EVALUATION":
        return this.answerEvaluation(payload, processLogId);
      case "COMMUNICATION_ANALYSIS":
        return this.communicationAnalysis(payload, processLogId);
      default:
        return this.finalReportGenerate(kind, payload, processLogId);
    }
  }

  private evaluationContext(payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const reportType = reportTypeOf(payload.reportType);
    const reportId = optionalPositiveNumber(payload.reportId, "reportId") ?? processLogId;
    const company = requiredObject(payload.company, "company");
    const posting = requiredObject(payload.posting, "posting");
    const application = requiredObject(payload.application, "application");
    const context = {
      reportType,
      companyId: positiveNumber(company.companyId, "company.companyId"),
      postingId: positiveNumber(posting.postingId, "posting.postingId"),
      applicationId: positiveNumber(application.applicationId, "application.applicationId"),
      candidateId: positiveNumber(application.candidateId, "application.candidateId"),
      jobDescription: requiredText(posting.jobDescription, "posting.jobDescription"),
      criteria: criteriaOf(payload.criteria),
      answers: answersOf(payload.answers),
      documentText: typeof application.documentText === "string" ? application.documentText : undefined,
      manualEvaluations: Array.isArray(payload.manualEvaluations) ? payload.manualEvaluations : []
    };
    const inputSources = {
      company: true,
      posting: true,
      criteriaCount: context.criteria.length,
      application: true,
      answersCount: context.answers.length,
      manualEvaluationCount: context.manualEvaluations.length
    };

    return {
      outputRef: JSON.stringify({
        processLogId,
        report: reportSnapshot(reportId, reportType),
        context,
        inputSources
      }),
      guardrail: { result: "PASS", reason: null }
    };
  }

  private answerEvaluation(payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const reportType = reportTypeOf(payload.reportType);
    const reportId = optionalPositiveNumber(payload.reportId, "reportId") ?? processLogId;
    const { scores, questionEvaluations } = this.scoreReport(
      criteriaOf(payload.criteria),
      answersOf(payload.answers),
      typeof payload.documentText === "string" ? payload.documentText : undefined
    );
    const guardrail = this.validateScores(reportType, scores);
    const evidences = scores.flatMap((score) => score.evidences);

    return {
      outputRef: JSON.stringify({
        processLogId,
        report: reportSnapshot(reportId, reportType),
        scores,
        questionEvaluations,
        evidences,
        guardrail,
        stored: {
          scoreCount: scores.length,
          evidenceCount: evidences.length
        }
      }),
      guardrail,
      finalSave: () => this.results.saveReportScoresAndEvidences({ reportId, scores })
    };
  }

  private communicationAnalysis(payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const reportType = reportTypeOf(payload.reportType);
    const reportId = optionalPositiveNumber(payload.reportId, "reportId") ?? processLogId;
    if (payload.consentConfirmed !== true) {
      throw new NonRetryableAiWorkerFailure("consentConfirmed is required for communication analysis");
    }

    const metrics = payload.metrics && typeof payload.metrics === "object" && !Array.isArray(payload.metrics)
      ? (payload.metrics as Record<string, unknown>)
      : {};
    const communicationAnalysis: CommunicationAnalysisRecord["analysis"] = {
      usage: "AUXILIARY_ONLY" as const,
      mediaQuality: requiredText(payload.mediaQuality, "mediaQuality"),
      metrics,
      notes: [
        "Communication metrics are auxiliary only and must not be used as a decisive hiring signal.",
        ...stringArrayOf(payload.notes)
      ],
      decisionWeight: 0
    };
    const output = {
      processLogId,
      report: reportSnapshot(reportId, reportType),
      communicationAnalysis
    };
    const record: CommunicationAnalysisRecord = {
      processLogId,
      reportId,
      reportType,
      analysis: communicationAnalysis
    };

    return {
      outputRef: JSON.stringify(output),
      guardrail: { result: "PASS", reason: null },
      finalSave: () => this.results.saveCommunicationAnalysis(record)
    };
  }

  private finalReportGenerate(kind: string, payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const reportId = optionalPositiveNumber(payload.reportId, "reportId") ?? processLogId;
    const reportType = reportTypeOf(payload.reportType);
    const generatedSummary = typeof payload.summary === "string" && payload.summary.trim() ? payload.summary : undefined;
    const jobDescription = generatedSummary
      ? typeof payload.jobDescription === "string" && payload.jobDescription.trim()
        ? payload.jobDescription
        : "generated report content"
      : requiredText(payload.jobDescription, "jobDescription");
    const criteria = Array.isArray(payload.criteria)
      ? criteriaOf(payload.criteria)
      : generatedSummary
        ? [{ criterionId: 1, name: "Expression policy", weight: 0 }]
        : criteriaOf(payload.criteria);
    const answers = Array.isArray(payload.answers)
      ? answersOf(payload.answers)
      : generatedSummary
        ? [{ answerId: 1, transcript: generatedSummary }]
        : answersOf(payload.answers);
    const documentText = typeof payload.documentText === "string" ? payload.documentText : undefined;
    const { scores, questionEvaluations } = this.scoreReport(criteria, answers, documentText);
    const totalScore = Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length);
    const summary = generatedSummary ?? (reportType === "RECRUITING_REPORT"
        ? `Recruiting report generated from ${answers.length} answer(s) for ${shorten(jobDescription)}.`
        : `Mock interview feedback generated from ${answers.length} answer(s).`);
    const report: GeneratedReportRecord = {
      reportId,
      reportType,
      summary,
      totalScore,
      scores,
      questionEvaluations
    };
    const guardrail = this.validateReport(report);

    return {
      outputRef: JSON.stringify({
        reportId,
        reportType,
        summary,
        totalScore,
        scores,
        questionEvaluations,
        evidences: scores.flatMap((score) => score.evidences),
        guardrail
      }),
      guardrail,
      finalSave: () => this.results.saveGeneratedReport(report)
    };
  }

  private questionGenerate(kind: string, payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const questionCount = Number(payload.questionCount ?? 2);
    if (!Number.isInteger(questionCount) || questionCount <= 0) {
      throw new NonRetryableAiWorkerFailure("questionCount must be a positive integer");
    }
    const postingId = kind.startsWith("MOCK") ? undefined : positiveNumber(payload.postingId, "postingId");

    const items = Array.from({ length: questionCount }, (_, index) =>
      kind.startsWith("MOCK")
        ? `Mock interview practice question ${index + 1}`
        : `Recruiting interview question ${index + 1}: ${shorten(requiredText(payload.jobDescription, "jobDescription"))}`
    );
    const questionCandidates = items.map((content, index) => ({
      content,
      category: kind.startsWith("MOCK") ? "모의면접" : "채용면접",
      difficulty: index % 3 === 0 ? "MEDIUM" as const : "HARD" as const,
      criterionTitle: "",
      expectedKeywords: ["경험", "근거", "성과"],
      suggestionReason: "JD와 평가 기준을 기준으로 검증 가능한 답변을 유도합니다.",
      questionType: index % 2 === 0 ? "TECHNICAL" : "EXPERIENCE"
    }));

    return this.generatedDraft(kind, items, {
      sourceProcessLogId: processLogId,
      postingId,
      targetTables: ["question_bank"],
      questionCandidates
    });
  }

  private questionSetGenerate(payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const postingId = positiveNumber(payload.postingId, "postingId");
    const questionCount = positiveNumber(payload.questionCount, "questionCount");
    const criteria = criteriaOf(payload.criteria);
    const questionTypes = nonEmptyStringArrayOf(payload.questionTypes, "questionTypes");
    const items = Array.from({ length: questionCount }, (_, index) => {
      const criterion = criteria[index % criteria.length];
      const questionType = questionTypes[index % questionTypes.length];
      return `${questionType} question ${index + 1} for ${criterion.name}`;
    });
    const questionCandidates = items.map((content, index) => {
      const criterion = criteria[index % criteria.length];
      const questionType = questionTypes[index % questionTypes.length];
      return {
        content,
        category: "질문 세트",
        difficulty: "MEDIUM" as const,
        criterionId: criterion.criterionId,
        criterionTitle: criterion.name,
        expectedKeywords: ["상황", "행동", "결과"],
        suggestionReason: "평가 기준별 질문 세트 구성을 위해 선택된 후보입니다.",
        questionType
      };
    });
    const questionSetPreview = criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      criterionTitle: criterion.name,
      questions: questionCandidates.filter((question) => question.criterionId === criterion.criterionId)
    }));

    return this.generatedDraft("QUESTION_SET_GENERATE", items, {
      sourceProcessLogId: processLogId,
      postingId,
      targetTables: ["question_bank"],
      questionCandidates,
      questionSetPreview
    });
  }

  private embedding(payload: Record<string, unknown>): AiTaskResult {
    const sourceType = requiredText(payload.sourceType, "sourceType");
    const sourceText = requiredText(payload.sourceText, "sourceText");
    const embeddingModel = typeof payload.embeddingModel === "string" ? payload.embeddingModel : "text-embedding-3-small";
    const embeddingDimension = Number(payload.embeddingDimension ?? 1536);
    const sourceTextHash = hashSourceText(sourceText);
    if (!Number.isInteger(embeddingDimension) || embeddingDimension <= 0) {
      throw new NonRetryableAiWorkerFailure("embeddingDimension must be a positive integer");
    }

    return {
      outputRef: JSON.stringify({
        sourceType,
        sourceTextHash,
        embeddingModel,
        embeddingDimension,
        targetTable: "embeddings",
        dedupeKey: `embedding:${sourceType}:${sourceTextHash}`,
        duplicatePolicy: "UPSERT_BY_SOURCE_TEXT_HASH"
      }),
      guardrail: { result: "PASS", reason: null },
      finalSave: async () => {
        const embedding = await this.results.upsertEmbedding({
          sourceType,
          sourceText,
          embeddingModel,
          embeddingDimension,
          metadataJson: typeof payload.metadataJson === "string" ? payload.metadataJson : undefined
        });
        return void embedding;
      }
    };
  }

  private generatedDraft(
    kind: string,
    items: string[],
    options: {
      sourceProcessLogId: number;
      targetTables: GeneratedDraftRecord["targetTables"];
      postingId?: number;
      criteriaSuggestions?: GeneratedDraftRecord["criteriaSuggestions"];
      questionCandidates?: GeneratedDraftRecord["questionCandidates"];
      questionSetPreview?: GeneratedDraftRecord["questionSetPreview"];
    }
  ): AiTaskResult {
    const guardrail = this.validateMockPolicy(kind.startsWith("MOCK") ? "MOCK" : "RECRUITING", items.join("\n"));
    const draft = {
      kind,
      sourceProcessLogId: options.sourceProcessLogId,
      items,
      criteriaSuggestions: options.criteriaSuggestions,
      questionCandidates: options.questionCandidates,
      questionSetPreview: options.questionSetPreview,
      reviewRequired: true as const,
      reviewStatus: "PENDING_REVIEW" as const,
      targetTables: options.targetTables,
      postingId: options.postingId
    };
    return {
      outputRef: JSON.stringify(draft),
      guardrail,
      finalSave: () =>
        this.results.saveGeneratedDraft(draft)
    };
  }

  private validateMockPolicy(policy: "MOCK" | "RECRUITING", text: string) {
    if (policy !== "MOCK") {
      return { result: "PASS" as const, reason: null };
    }

    const banned = MOCK_HIRING_DECISION_TERMS.find((term) => text.includes(term));
    return banned
      ? {
          result: "BLOCKED" as const,
          reason: `mock interview output cannot include hiring decision expression: ${banned}`,
          failureCategory: "NON_RETRYABLE" as const
        }
      : { result: "PASS" as const, reason: null };
  }

  private scoreReport(
    criteria: Array<{ criterionId: number; name: string; weight: number; description?: string }>,
    answers: Array<{ answerId: number; question?: string; transcript: string }>,
    documentText?: string
  ): StructuredReportEvaluation {
    const scores: GeneratedReportScoreRecord[] = [];
    const questionEvaluations: GeneratedQuestionEvaluationRecord[] = [];

    criteria.forEach((criterion, index) => {
      const answer = answers[index % answers.length];
      const evidenceText = pickEvidence(answer.transcript, documentText);
      const score = Math.min(95, 70 + Math.min(10, Math.round(criterion.weight / 10)) + Math.min(10, Math.floor(evidenceText.length / 30)));
      const structured = structuredAssessment(answer.transcript, documentText, criterion.description);
      const criterionName = localizedCriterionName(criterion.name);
      const evidences: GeneratedReportScoreRecord["evidences"] = [
        {
          sourceType: "INTERVIEW_ANSWER",
          answerId: answer.answerId,
          text: pickEvidence(answer.transcript)
        },
        ...(documentText?.trim()
          ? [
              {
                sourceType: "APPLICATION_DOCUMENT" as const,
                documentRef: "payload.documentText",
                text: pickEvidence(documentText)
              }
            ]
          : [])
      ];
      const reportScore: GeneratedReportScoreRecord = {
        criterionId: criterion.criterionId,
        criterionName,
        score,
        rationale: scoreRationale(criterionName, score, answer.transcript, structured),
        rubricAnchor: structured.rubricAnchor,
        confidence: structured.confidence,
        uncertaintyReasons: structured.uncertaintyReasons,
        evidences
      };

      scores.push(reportScore);
      questionEvaluations.push({
        criterionId: criterion.criterionId,
        criterionName,
        answerId: answer.answerId,
        question: answer.question ?? `Answer ${answer.answerId}`,
        rubricAnchor: structured.rubricAnchor,
        confidence: structured.confidence,
        uncertaintyReasons: structured.uncertaintyReasons,
        evidences
      });
    });

    return { scores, questionEvaluations };
  }

  private validateReport(report: GeneratedReportRecord) {
    const scoreDecision = this.validateScores(report.reportType, report.scores, report.summary);
    if (scoreDecision.result === "BLOCKED") {
      return scoreDecision;
    }
    return this.validateQuestionEvaluations(report.questionEvaluations);
  }

  private validateScores(
    reportType: GeneratedReportRecord["reportType"],
    scores: GeneratedReportScoreRecord[],
    summary = ""
  ) {
    for (const score of scores) {
      if (!score.rubricAnchor?.trim()) {
        return {
          result: "BLOCKED" as const,
          reason: `rubric anchor is required for criterion ${score.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!["HIGH", "MEDIUM", "LOW"].includes(score.confidence)) {
        return {
          result: "BLOCKED" as const,
          reason: `confidence is required for criterion ${score.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!Array.isArray(score.uncertaintyReasons)) {
        return {
          result: "BLOCKED" as const,
          reason: `uncertainty reasons are required for criterion ${score.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!score.rationale.trim()) {
        return {
          result: "BLOCKED" as const,
          reason: `rationale is required for criterion ${score.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (score.evidences.length === 0 || score.evidences.some((evidence) => !evidence.text.trim())) {
        return {
          result: "BLOCKED" as const,
          reason: `evidence is required for criterion ${score.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
    }

    if (reportType === "MOCK_INTERVIEW_REPORT") {
      const combinedText = [
        summary,
        ...scores.map((score) => score.rationale),
        ...scores.map((score) => score.rubricAnchor),
        ...scores.flatMap((score) => score.uncertaintyReasons),
        ...scores.flatMap((score) => score.evidences.map((evidence) => evidence.text))
      ].join("\n");
      return this.validateMockPolicy("MOCK", combinedText);
    }

    return { result: "PASS" as const, reason: null };
  }

  private validateQuestionEvaluations(questionEvaluations: GeneratedQuestionEvaluationRecord[]) {
    if (!Array.isArray(questionEvaluations) || questionEvaluations.length === 0) {
      return {
        result: "BLOCKED" as const,
        reason: "question evaluations are required",
        failureCategory: "NON_RETRYABLE" as const
      };
    }

    for (const evaluation of questionEvaluations) {
      if (!evaluation.answerId || !evaluation.question?.trim()) {
        return {
          result: "BLOCKED" as const,
          reason: `question evaluation source is required for criterion ${evaluation.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!evaluation.rubricAnchor?.trim()) {
        return {
          result: "BLOCKED" as const,
          reason: `question evaluation rubric anchor is required for criterion ${evaluation.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!["HIGH", "MEDIUM", "LOW"].includes(evaluation.confidence)) {
        return {
          result: "BLOCKED" as const,
          reason: `question evaluation confidence is required for criterion ${evaluation.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!Array.isArray(evaluation.uncertaintyReasons)) {
        return {
          result: "BLOCKED" as const,
          reason: `question evaluation uncertainty reasons are required for criterion ${evaluation.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (evaluation.uncertaintyReasons.some((reason) => !reason.trim())) {
        return {
          result: "BLOCKED" as const,
          reason: `question evaluation uncertainty reasons must be non-empty for criterion ${evaluation.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
      if (!Array.isArray(evaluation.evidences) || evaluation.evidences.length === 0) {
        return {
          result: "BLOCKED" as const,
          reason: `question evaluation evidence is required for criterion ${evaluation.criterionId}`,
          failureCategory: "NON_RETRYABLE" as const
        };
      }
    }

    return { result: "PASS" as const, reason: null };
  }
}

function parseInput(inputRef: string): WorkerInput {
  try {
    const parsed = JSON.parse(inputRef) as WorkerInput;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("inputRef must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new NonRetryableAiWorkerFailure(error instanceof Error ? error.message : "invalid inputRef");
  }
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new NonRetryableAiWorkerFailure(`${name} must be a positive integer`);
  }
  return parsed;
}

function optionalPositiveNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return positiveNumber(value, name);
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new NonRetryableAiWorkerFailure(`${name} is required`);
  }
  return value;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NonRetryableAiWorkerFailure(`${name} is required`);
  }
  return value as Record<string, unknown>;
}

function stringArrayOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function nonEmptyStringArrayOf(value: unknown, name: string): string[] {
  const values = stringArrayOf(value);
  if (values.length === 0) {
    throw new NonRetryableAiWorkerFailure(`${name} is required`);
  }
  return values;
}

function reportSnapshot(reportId: number, reportType: GeneratedReportRecord["reportType"]) {
  return {
    reportId,
    reportType,
    status: "GENERATING"
  };
}

function fileAssetRef(fileId: number, storageKey: string) {
  return {
    fileId,
    storageKey
  };
}

function reportTypeOf(value: unknown): GeneratedReportRecord["reportType"] {
  if (value === "RECRUITING_REPORT" || value === "MOCK_INTERVIEW_REPORT") {
    return value;
  }
  throw new NonRetryableAiWorkerFailure("reportType is invalid");
}

function criteriaOf(value: unknown): Array<{ criterionId: number; name: string; weight: number; description?: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NonRetryableAiWorkerFailure("criteria is required");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new NonRetryableAiWorkerFailure("criteria item must be an object");
    }
    const record = item as Record<string, unknown>;
    return {
      criterionId: positiveNumber(record.criterionId, "criterionId"),
      name: requiredText(record.name, "criterion name"),
      description: typeof record.description === "string" ? record.description : undefined,
      weight: Number.isFinite(Number(record.weight)) ? Number(record.weight) : 0
    };
  });
}

function answersOf(value: unknown): Array<{ answerId: number; question?: string; transcript: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NonRetryableAiWorkerFailure("answers is required");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new NonRetryableAiWorkerFailure("answers item must be an object");
    }
    const record = item as Record<string, unknown>;
    return {
      answerId: positiveNumber(record.answerId, "answerId"),
      question: typeof record.question === "string" ? record.question : undefined,
      transcript: requiredText(record.transcript, "transcript")
    };
  });
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = normalizeSpace(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildFollowUpQuestion(input: {
  policy: "MOCK" | "RECRUITING";
  previousQuestion: string;
  transcript: string;
  context: string;
  jobDescription?: string;
  documentSummary?: string;
}): string {
  const transcript = normalizeSpace(input.transcript);
  const lower = transcript.toLowerCase();

  if (input.policy === "MOCK") {
    return buildPracticeFollowUp(input.previousQuestion, transcript);
  }

  if (lower.includes("nestjs") || lower.includes("postgresql") || lower.includes("stt") || transcript.includes("꼬리질문")) {
    return "NestJS와 PostgreSQL 기반 프로젝트에서 답변 저장, STT 결과, 꼬리질문 표시가 연결되는 흐름을 구현했다고 했는데, 사용자가 답변 완료를 누른 뒤 DB 저장과 지원자 화면 표시까지의 데이터 흐름을 구체적으로 설명해 주세요.";
  }

  if (transcript.includes("로그") || transcript.includes("데이터 흐름") || lower.includes("log")) {
    return "문제가 생기면 로그와 데이터 흐름을 먼저 확인한다고 했는데, 실제로 마주친 오류 하나를 예로 들어 원인을 어떻게 좁히고 어떤 단위로 검증했는지 설명해 주세요.";
  }

  if (lower.includes("redis") || lower.includes("cache") || transcript.includes("캐시")) {
    return "캐시를 활용해 성능이나 안정성을 개선했다고 했는데, 캐시 무효화나 TTL 정책을 어떻게 설계했고 어떤 지표로 효과를 확인했는지 설명해 주세요.";
  }

  if (lower.includes("performance") || transcript.includes("성능") || transcript.includes("최적화")) {
    return "성능 개선 경험을 언급했는데, 병목을 어떻게 찾았고 개선 전후를 어떤 기준으로 비교했는지 구체적으로 설명해 주세요.";
  }

  const topic = extractFollowUpTopic(transcript, input.jobDescription, input.documentSummary, input.context);
  return `방금 답변에서 ${topic}을 언급했는데, 그 경험에서 본인이 직접 맡은 역할과 가장 어려웠던 의사결정을 구체적으로 설명해 주세요.`;
}

function buildPracticeFollowUp(previousQuestion: string, transcript: string): string {
  const topic = extractFollowUpTopic(transcript, previousQuestion);
  const questionContext = normalizeSpace(previousQuestion);
  const answerContext = normalizeSpace(transcript).toLowerCase();

  if (questionContext.includes("자기소개") || questionContext.includes("직무")) {
    return `방금 소개한 ${topic} 경험 중 본인이 가장 주도적으로 맡았던 부분 하나를 골라, 맡은 역할과 결과를 구체적으로 설명해 주세요.`;
  }

  if (questionContext.includes("문제") || questionContext.includes("어려")) {
    return `문제를 해결할 때 로그와 데이터 흐름을 본다고 했는데, 실제 오류 하나를 예로 들어 원인을 좁힌 순서와 검증 방법을 설명해 주세요.`;
  }

  if (questionContext.includes("기술") || questionContext.includes("구현")) {
    return `${topic}을 구현하면서 가장 신경 쓴 설계 선택은 무엇이었고, 다른 방식 대신 그 방법을 선택한 이유를 설명해 주세요.`;
  }

  if (answerContext.includes("로그") || answerContext.includes("데이터 흐름")) {
    return `문제를 해결할 때 로그와 데이터 흐름을 본다고 했는데, 실제 오류 하나를 예로 들어 원인을 좁힌 순서와 검증 방법을 설명해 주세요.`;
  }

  if (answerContext.includes("nestjs") || answerContext.includes("postgresql") || answerContext.includes("stt")) {
    return `${topic}을 구현하면서 가장 신경 쓴 설계 선택은 무엇이었고, 다른 방식 대신 그 방법을 선택한 이유를 설명해 주세요.`;
  }

  if (questionContext.includes("협업") || questionContext.includes("상황") || questionContext.includes("갈등")) {
    return `그 상황에서 혼자 판단하기 어려웠던 지점은 무엇이었고, 팀원이나 이해관계자와 어떻게 맞춰 해결했는지 설명해 주세요.`;
  }

  if (questionContext.includes("성과") || questionContext.includes("결과")) {
    return `${topic} 경험의 결과를 어떤 기준으로 확인했고, 다시 한다면 개선하고 싶은 점은 무엇인지 설명해 주세요.`;
  }

  return `방금 답변한 ${topic} 경험에서 가장 중요한 판단 한 가지와 그 판단이 결과에 준 영향을 구체적으로 설명해 주세요.`;
}

function extractFollowUpTopic(...values: Array<string | undefined>): string {
  const source = normalizeSpace(values.find((value) => value && value.trim().length > 0) ?? "");
  if (!source) {
    return "핵심 경험";
  }

  const keyword = [
    "NestJS",
    "PostgreSQL",
    "STT",
    "꼬리질문",
    "로그",
    "데이터 흐름",
    "Redis",
    "캐시",
    "성능",
    "최적화"
  ].find((candidate) => source.toLowerCase().includes(candidate.toLowerCase()));

  return keyword ?? `"${shorten(source)}"`;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function pickEvidence(transcript: string, documentText?: string): string {
  const source = transcript.trim() || documentText?.trim() || "";
  return shorten(source);
}

function localizedCriterionName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("role") || normalized.includes("fit")) {
    return "직무 적합성";
  }
  if (normalized.includes("problem") || normalized.includes("solving")) {
    return "문제 해결력";
  }
  if (normalized.includes("communication")) {
    return "커뮤니케이션";
  }
  if (normalized.includes("technical")) {
    return "기술 이해도";
  }
  return name;
}

function scoreRationale(
  criterionName: string,
  score: number,
  transcript: string,
  assessment: ReturnType<typeof structuredAssessment>
): string {
  const evidence = pickEvidence(transcript);
  const improvement = assessment.uncertaintyReasons.includes("No explicit measurable outcome was provided.")
    ? "성과나 결과를 수치 또는 전후 비교로 보강하면 더 설득력 있는 답변이 됩니다."
    : "행동과 결과가 함께 제시되어 답변의 신뢰도가 비교적 높습니다.";

  if (criterionName === "직무 적합성") {
    return `${criterionName}은 ${score}점입니다. 답변에서 "${evidence}"를 통해 지원 직무와 연결되는 경험과 관심 분야가 확인됩니다. ${improvement}`;
  }

  if (criterionName === "문제 해결력") {
    return `${criterionName}은 ${score}점입니다. 문제 상황을 확인 가능한 단위로 나누고 원인을 좁혀 가는 접근이 드러납니다. ${improvement}`;
  }

  if (criterionName === "커뮤니케이션") {
    return `${criterionName}은 ${score}점입니다. 경험을 차분하게 설명해 흐름은 이해하기 쉽지만, 상황-행동-결과 순서로 조금 더 압축하면 전달력이 좋아집니다. ${improvement}`;
  }

  return `${criterionName}은 ${score}점입니다. 답변에서 "${evidence}"를 근거로 관련 역량을 확인할 수 있습니다. ${improvement}`;
}

function structuredAssessment(
  transcript: string,
  documentText?: string,
  criterionDescription?: string
): {
  rubricAnchor: string;
  confidence: GeneratedReportConfidenceRecord;
  uncertaintyReasons: string[];
} {
  const combined = `${transcript}\n${documentText ?? ""}`.toLowerCase();
  const hasAction = /\b(found|analyzed|improved|optimized|built|designed|implemented|resolved|added|reduced)\b/.test(
    combined
  );
  const hasResult = /\b(result|performance|latency|cache|ttl|policy|policies|reduced|improved|increased)\b/.test(
    combined
  );
  const hasMetric = /\d|%|ms|sec|minute|hour|x\b/.test(combined);
  const hasDocumentContext = Boolean(documentText?.trim());
  const uncertaintyReasons = [
    ...(hasMetric ? [] : ["No explicit measurable outcome was provided."]),
    ...(hasDocumentContext ? [] : ["Application document evidence was not provided."]),
    ...(hasAction ? [] : ["Candidate action is not explicit in the answer."]),
    ...(hasResult ? [] : ["Result or impact is not explicit in the answer."])
  ];
  const confidence: GeneratedReportConfidenceRecord =
    hasAction && hasResult && hasDocumentContext
      ? "HIGH"
      : hasAction && (hasResult || hasDocumentContext)
        ? "MEDIUM"
        : "LOW";

  return {
    rubricAnchor: criterionDescription?.trim()
      ? `Matches criterion: ${shorten(criterionDescription)}`
      : "Structured interview evidence is mapped to the requested evaluation criterion.",
    confidence,
    uncertaintyReasons
  };
}

function shorten(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

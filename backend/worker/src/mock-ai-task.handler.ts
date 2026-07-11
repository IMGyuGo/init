import {
  AiResultRepository,
  CommunicationAnalysisRecord,
  GeneratedDraftRecord,
  GeneratedQuestionEvaluationRecord,
  GeneratedReportRecord,
  GeneratedReportScoreRecord,
  ReportAnswerEvaluationStatusRecord,
  STT_UNAVAILABLE_TEMP_ZERO_REASON,
  hashSourceText
} from "./ai-result.repository";
import { createAiProcessUsage } from "./ai-usage";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import { AiTaskHandler, AiTaskResult, AiWorkerJob } from "./worker.types";
import { SttProvider } from "./stt-provider";
import {
  assessReportEvidence,
  normalizeReportCriterionName,
  scoreBandFor,
  SERVICE_INTERVIEW_RUBRIC,
  weightedTotalScore
} from "./service-interview-rubric";

interface WorkerInput {
  kind?: string;
  payload?: Record<string, unknown>;
}

interface StructuredReportEvaluation {
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
}

interface ReportAnswerForScoring {
  answerId: number;
  questionId?: number;
  question?: string;
  questionType?: "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
  sortOrder?: number;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
  transcript: string;
  evaluationStatus: ReportAnswerEvaluationStatusRecord;
  transcriptUnavailableReason?: string;
  nonverbalMetadata?: ReportAnswerNonverbalMetadata;
}

interface ReportScoringContext {
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  jobDescription?: string;
}

interface ReportAnswerNonverbalMetadata {
  cameraWarnings?: number;
  microphoneWarnings?: number;
  longSilenceCount?: number;
  shortAnswerCount?: number;
  testModeUsed?: boolean;
  voicePeakLevel?: number;
  lowAudioFrameCount?: number;
  observedAudioFrameCount?: number;
  cameraDisconnectedCount?: number;
  integrityEvents?: unknown[];
  integritySummary?: {
    screenAwayCount?: number;
    cameraLostCount?: number;
    faceMissingCount?: number;
    faceOutOfFrameCount?: number;
    multipleFacesCount?: number;
    facePositionShiftCount?: number;
    gazeAwayCount?: number;
    voiceMouthMismatchCount?: number;
    voiceWithoutFaceCount?: number;
    staticVideoFrameCount?: number;
    earlyScreenAwayCount?: number;
    suspicionLevel?: string;
  };
  [key: string]: unknown;
}

interface NonverbalSignalSummary {
  cameraWarnings: number;
  microphoneWarnings: number;
  longSilenceCount: number;
  shortAnswerCount: number;
  testModeUsed: boolean;
  screenAwayCount: number;
  cameraLostCount: number;
  faceMissingCount: number;
  faceOutOfFrameCount: number;
  multipleFacesCount: number;
  facePositionShiftCount: number;
  gazeAwayCount: number;
  voiceMouthMismatchCount: number;
  voiceWithoutFaceCount: number;
  staticVideoFrameCount: number;
  earlyScreenAwayCount: number;
  highSuspicionCount: number;
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
      case "POSTING_DRAFT_GENERATE":
        return this.postingDraftGenerate(payload, job.processLogId);
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
    const audioSeconds = optionalPositiveNumber(payload.durationSeconds, "durationSeconds");
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
        audioSeconds,
        transcriptTarget: "interview_answers.transcript",
        dedupeKey: `answer:${answerId}:transcript`,
        duplicatePolicy: "KEEP_EXISTING_TRANSCRIPT"
      }),
      guardrail: { result: "PASS", reason: null },
      usage: createAiProcessUsage({
        modelName: providerResult.model,
        audioSeconds,
        metadata: { processType: "STT" }
      }),
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
    const criteriaSuggestions = SERVICE_INTERVIEW_RUBRIC.map((criterion, index) => ({
      title: criterion.name,
      description: `${criterion.description} JD: ${shorten(jobDescription)}`,
      weight: criterion.weight,
      order: index + 1,
      suggestionReason: `인재상(${shorten(talentProfile)})과 평가 정책(${shorten(evaluationPolicy)})을 답변 근거 중심으로 검증하기 위한 기본 기준입니다.`,
      category: "서비스 기본 평가"
    }));
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
      typeof payload.documentText === "string" ? payload.documentText : undefined,
      {
        reportType,
        jobDescription: typeof payload.jobDescription === "string" ? payload.jobDescription : undefined
      }
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
        ? [{ answerId: 1, transcript: generatedSummary, evaluationStatus: "EVALUATED" as const }]
        : answersOf(payload.answers);
    const documentText = typeof payload.documentText === "string" ? payload.documentText : undefined;
    const { scores, questionEvaluations } = this.scoreReport(criteria, answers, documentText, {
      reportType,
      jobDescription
    });
    const totalScore = weightedTotalScore(scores, criteria);
    const companyName = typeof payload.companyName === "string" && payload.companyName.trim() ? payload.companyName.trim() : undefined;
    const jobTitle = typeof payload.jobTitle === "string" && payload.jobTitle.trim() ? payload.jobTitle.trim() : undefined;
    const summary = generatedSummary ?? (reportType === "RECRUITING_REPORT"
        ? `${companyName ? `${companyName} ` : ""}${jobTitle ?? "채용 공고"} 면접 리포트는 ${answers.length}개 답변, 확정 질문 세트, JD(${shorten(jobDescription)})를 바탕으로 생성되었습니다. 최종 채용 판단은 사람이 함께 검토해야 합니다.`
        : `모의면접 피드백은 ${answers.length}개 답변과 서비스 기본 평가 기준을 바탕으로 생성되었습니다.`);
    const report: GeneratedReportRecord = {
      reportId,
      reportType,
      applicationId: optionalPositiveNumber(payload.applicationId, "applicationId"),
      sessionId: optionalPositiveNumber(payload.sessionId, "sessionId"),
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
    const criteria = kind.startsWith("MOCK") ? [] : criteriaOf(payload.criteria);
    const jobDescription = kind.startsWith("MOCK") ? undefined : requiredText(payload.jobDescription, "jobDescription");

    const questionCandidates = Array.from({ length: questionCount }, (_, index) => {
      const criterion = criteria[index % Math.max(criteria.length, 1)];
      const content = kind.startsWith("MOCK")
        ? `Mock interview practice question ${index + 1}`
        : `${criterion.name} 기준으로 ${shorten(jobDescription ?? "")} 경험을 검증할 수 있는 사례를 설명해주세요.`;

      return {
        content,
        category: kind.startsWith("MOCK") ? "모의면접" : criterion.category ?? "채용면접",
        difficulty: index % 3 === 0 ? "MEDIUM" as const : "HARD" as const,
        criterionId: criterion?.criterionId,
        criterionTitle: criterion?.name ?? "",
        expectedKeywords: ["경험", "근거", "성과"],
        suggestionReason: criterion
          ? `${criterion.name} 평가 기준과 JD 맥락을 함께 확인하기 위한 공통 질문 후보입니다.`
          : "면접 연습을 위해 검증 가능한 답변을 유도합니다.",
        questionType: index % 2 === 0 ? "TECHNICAL" : "EXPERIENCE"
      };
    });
    const items = questionCandidates.map((candidate) => candidate.content);

    return this.generatedDraft(kind, items, {
      sourceProcessLogId: processLogId,
      postingId,
      targetTables: ["question_bank"],
      questionCandidates
    });
  }

  private postingDraftGenerate(payload: Record<string, unknown>, processLogId: number): AiTaskResult {
    const title = requiredText(payload.title, "title");
    const jobRole = requiredText(payload.jobRole, "jobRole");
    const keywords = stringArrayOf(payload.keywords);
    const tags = keywords.length > 0 ? keywords : [jobRole];
    const summary = typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : `${jobRole} 포지션의 핵심 역할과 협업 방식을 정리한 공고입니다.`;
    const careerRequirement = typeof payload.careerRequirement === "string" && payload.careerRequirement.trim()
      ? payload.careerRequirement.trim()
      : "경력무관";
    const employmentType = typeof payload.employmentType === "string" && payload.employmentType.trim()
      ? payload.employmentType.trim()
      : "정규직";
    const workLocation = typeof payload.workLocation === "string" && payload.workLocation.trim()
      ? payload.workLocation.trim()
      : "협의";
    const sections = {
      positionDetail: [
        `<p>${escapeHtml(title)} — ${escapeHtml(jobRole)} 포지션입니다.</p>`,
        `<p>${escapeHtml(summary)}</p>`,
        `<p>근무 형태: ${escapeHtml(employmentType)} / 경력 조건: ${escapeHtml(careerRequirement)} / 근무지: ${escapeHtml(workLocation)}</p>`
      ].join(""),
      responsibilities: bulletList(
        tags.map((tag) => `${tag} 기반 서비스 개발과 운영 품질 개선을 주도합니다.`)
      ),
      requirements: bulletList([
        `${jobRole} 직무에 필요한 기본기를 갖춘 분`,
        ...tags.map((tag) => `${tag}에 대한 실무 경험 또는 학습 경험`),
        "문제를 구조화하고 동료와 명확하게 소통할 수 있는 분"
      ]),
      preferredQualifications: bulletList([
        "채용, 평가, 인터뷰 도메인에 관심이 있는 분",
        "데이터 기반으로 제품과 운영 프로세스를 개선한 경험",
        `${tags[0]} 관련 성능 개선 또는 장애 대응 경험`
      ]),
      benefits: bulletList([
        "업무에 몰입할 수 있는 장비와 도구 지원",
        "동료와 함께 배우는 코드 리뷰와 스터디 문화",
        "성장 단계에 맞춘 역할 확장 기회"
      ]),
      hiringProcess: bulletList(["서류 검토", "직무 인터뷰", "최종 인터뷰", "처우 협의 및 입사"])
    };
    const items = ["포지션 상세", "주요 업무", "자격 요건", "우대 사항", "복지 및 혜택", "채용 절차"];

    return this.generatedDraft("POSTING_DRAFT_GENERATE", items, {
      sourceProcessLogId: processLogId,
      targetTables: ["postings"],
      postingDraft: {
        title,
        jobRole,
        sections,
        tags
      }
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
      postingDraft?: GeneratedDraftRecord["postingDraft"];
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
      postingDraft: options.postingDraft,
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
    answers: ReportAnswerForScoring[],
    documentText?: string,
    context: ReportScoringContext = { reportType: "RECRUITING_REPORT" }
  ): StructuredReportEvaluation {
    const scores: GeneratedReportScoreRecord[] = [];
    const questionEvaluations: GeneratedQuestionEvaluationRecord[] = [];
    const evaluatedAnswerIds = new Set<number>();
    const childAnswersByParent = groupFollowUpAnswersByParent(answers);
    const primaryEvaluatedAnswers = answers
      .filter((answer) => answer.evaluationStatus !== "STT_UNAVAILABLE" && !answer.isFollowUpAnswer)
      .sort(compareReportAnswersForScoring);
    const fallbackEvaluatedAnswers = answers
      .filter((answer) => answer.evaluationStatus !== "STT_UNAVAILABLE")
      .sort(compareReportAnswersForScoring);
    const usedPrimaryAnswerIds = new Set<number>();

    criteria.forEach((criterion, index) => {
      const criterionName = localizedCriterionName(criterion.name);
      const answer =
        selectAnswerForCriterion(criterionName, criterion, primaryEvaluatedAnswers, usedPrimaryAnswerIds) ??
        primaryEvaluatedAnswers[index % Math.max(primaryEvaluatedAnswers.length, 1)] ??
        fallbackEvaluatedAnswers[index % Math.max(fallbackEvaluatedAnswers.length, 1)] ??
        answers[index % answers.length];
      if (answer.evaluationStatus === "STT_UNAVAILABLE") {
        const zeroEvaluation = zeroScoreForUnavailableTranscript(criterion, answer);
        scores.push(zeroEvaluation.score);
        questionEvaluations.push(zeroEvaluation.questionEvaluation);
        evaluatedAnswerIds.add(answer.answerId);
        return;
      }

      usedPrimaryAnswerIds.add(answer.answerId);
      const supportingFollowUps = childAnswersByParent.get(answer.answerId) ?? [];
      const transcriptForScoring = answerTranscriptWithFollowUps(answer, supportingFollowUps);
      const nonverbalSignals = nonverbalSignalsForAnswers([answer, ...supportingFollowUps]);
      const structured = structuredAssessment(transcriptForScoring, documentText, criterion.description, context.jobDescription);
      const quality = answerQualityAdjustment(criterionName, transcriptForScoring, context, nonverbalSignals);
      const score = Math.min(structured.score, quality.maxScore);
      const uncertaintyReasons = uniqueStrings([...structured.uncertaintyReasons, ...quality.reasons]);
      const confidence = quality.forceLowConfidence ? "LOW" : structured.confidence;
      const evidences: GeneratedReportScoreRecord["evidences"] = [
        {
          sourceType: "INTERVIEW_ANSWER",
          answerId: answer.answerId,
          text: answerEvidenceText(answer, "면접 답변", context.reportType)
        },
        ...supportingFollowUps.map((followUp) => ({
          sourceType: "INTERVIEW_ANSWER" as const,
          answerId: followUp.answerId,
          text: answerEvidenceText(followUp, "꼬리질문 답변", context.reportType)
        })),
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
        rationale: scoreRationale(criterionName, score, transcriptForScoring, structured, quality.reasons, context.reportType),
        rubricAnchor: structured.rubricAnchor,
        confidence,
        uncertaintyReasons,
        evidences
      };

      scores.push(reportScore);
      questionEvaluations.push({
        criterionId: criterion.criterionId,
        criterionName,
        answerId: answer.answerId,
        question: answer.question ?? `Answer ${answer.answerId}`,
        rubricAnchor: structured.rubricAnchor,
        confidence,
        uncertaintyReasons,
        evidences
      });
      evaluatedAnswerIds.add(answer.answerId);
    });

    answers
      .filter((answer) => answer.evaluationStatus === "STT_UNAVAILABLE" && !evaluatedAnswerIds.has(answer.answerId))
      .forEach((answer) => {
        const criterion = criteria[scores.length % criteria.length];
        const zeroEvaluation = zeroScoreForUnavailableTranscript(criterion, answer);
        scores.push(zeroEvaluation.score);
        questionEvaluations.push(zeroEvaluation.questionEvaluation);
        evaluatedAnswerIds.add(answer.answerId);
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bulletList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
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

function criteriaOf(value: unknown): Array<{ criterionId: number; name: string; weight: number; category?: string; description?: string }> {
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
      category: typeof record.category === "string" ? record.category : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      weight: Number.isFinite(Number(record.weight)) ? Number(record.weight) : 0
    };
  });
}

function answersOf(value: unknown): ReportAnswerForScoring[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NonRetryableAiWorkerFailure("answers is required");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new NonRetryableAiWorkerFailure("answers item must be an object");
    }
    const record = item as Record<string, unknown>;
    const evaluationStatus: ReportAnswerEvaluationStatusRecord =
      record.evaluationStatus === "STT_UNAVAILABLE" ? "STT_UNAVAILABLE" : "EVALUATED";
    const transcriptUnavailableReason =
      optionalText(record.transcriptUnavailableReason) ?? STT_UNAVAILABLE_TEMP_ZERO_REASON;
    const transcript =
      evaluationStatus === "STT_UNAVAILABLE"
        ? optionalText(record.transcript) ?? ""
        : requiredText(record.transcript, "transcript");

    return {
      answerId: positiveNumber(record.answerId, "answerId"),
      questionId: optionalPositiveNumber(record.questionId, "questionId"),
      question: typeof record.question === "string" ? record.question : undefined,
      questionType: questionTypeOf(record.questionType),
      sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : undefined,
      isFollowUpAnswer: record.isFollowUpAnswer === true,
      parentAnswerId: optionalPositiveNumber(record.parentAnswerId, "parentAnswerId"),
      transcript,
      evaluationStatus,
      transcriptUnavailableReason: evaluationStatus === "STT_UNAVAILABLE" ? transcriptUnavailableReason : undefined,
      nonverbalMetadata: optionalNonverbalMetadata(record.nonverbalMetadata)
    };
  });
}

function optionalNonverbalMetadata(value: unknown): ReportAnswerNonverbalMetadata | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ReportAnswerNonverbalMetadata
    : undefined;
}

function questionTypeOf(value: unknown): ReportAnswerForScoring["questionType"] | undefined {
  return value === "INTRO" ||
    value === "TECHNICAL" ||
    value === "EXPERIENCE" ||
    value === "SITUATION" ||
    value === "FOLLOW_UP" ||
    value === "CLOSING"
    ? value
    : undefined;
}

function groupFollowUpAnswersByParent(answers: ReportAnswerForScoring[]): Map<number, ReportAnswerForScoring[]> {
  const grouped = new Map<number, ReportAnswerForScoring[]>();
  for (const answer of answers) {
    if (!answer.isFollowUpAnswer || !answer.parentAnswerId || answer.evaluationStatus === "STT_UNAVAILABLE") {
      continue;
    }
    const items = grouped.get(answer.parentAnswerId) ?? [];
    items.push(answer);
    grouped.set(answer.parentAnswerId, items.sort(compareReportAnswersForScoring));
  }
  return grouped;
}

function compareReportAnswersForScoring(left: ReportAnswerForScoring, right: ReportAnswerForScoring): number {
  return (left.sortOrder ?? left.answerId) - (right.sortOrder ?? right.answerId);
}

function selectAnswerForCriterion(
  criterionName: string,
  criterion: { description?: string },
  answers: ReportAnswerForScoring[],
  usedAnswerIds: Set<number>
): ReportAnswerForScoring | undefined {
  const candidates = answers.length > usedAnswerIds.size
    ? answers.filter((answer) => !usedAnswerIds.has(answer.answerId))
    : answers;

  return candidates
    .map((answer) => ({
      answer,
      score: answerCriterionMatchScore(criterionName, criterion.description, answer)
    }))
    .sort((left, right) => right.score - left.score || compareReportAnswersForScoring(left.answer, right.answer))[0]?.answer;
}

function answerCriterionMatchScore(
  criterionName: string,
  criterionDescription: string | undefined,
  answer: ReportAnswerForScoring
): number {
  const question = normalizeSpace(answer.question ?? "").toLowerCase();
  const transcript = normalizeSpace(answer.transcript).toLowerCase();
  const source = `${question} ${transcript} ${criterionDescription ?? ""}`;
  let score = Math.min(40, transcript.length / 4);

  if (criterionName === "직무 적합성") {
    score += answer.questionType === "TECHNICAL" || answer.questionType === "INTRO" ? 30 : 0;
    score += /(직무|지원|기술|구현|설계|api|db|backend|frontend|nestjs|postgresql|react|java|spring)/i.test(source) ? 30 : 0;
  } else if (criterionName === "문제 해결력") {
    score += answer.questionType === "SITUATION" || answer.questionType === "TECHNICAL" ? 25 : 0;
    score += /(문제|어려|원인|해결|분석|검증|장애|오류|트러블슈팅|debug|issue)/i.test(source) ? 35 : 0;
  } else if (criterionName === "실행력과 성과") {
    score += /(맡|담당|구현|완료|개선|성과|결과|수치|전후|배포|운영)/i.test(source) ? 40 : 0;
  } else if (criterionName === "학습 민첩성") {
    score += answer.questionType === "EXPERIENCE" ? 20 : 0;
    score += /(학습|익혔|새로운|적용|처음|빠르게|도입|러닝|learn)/i.test(source) ? 40 : 0;
  } else if (criterionName === "커뮤니케이션") {
    score += /(설명|공유|협업|조율|커뮤니케이션|팀|동료|논의|전달)/i.test(source) ? 35 : 0;
  } else if (criterionName === "성장 가능성") {
    score += answer.questionType === "CLOSING" ? 20 : 0;
    score += /(강점|개선|회고|재발|다음|검증|책임|신뢰|성장|반복)/i.test(source) ? 40 : 0;
  }

  return score;
}

function answerTranscriptWithFollowUps(answer: ReportAnswerForScoring, followUps: ReportAnswerForScoring[]): string {
  return [
    answer.transcript,
    ...followUps.map((followUp) => `꼬리질문 답변: ${followUp.transcript}`)
  ].join("\n");
}

function nonverbalSignalsForAnswers(answers: ReportAnswerForScoring[]): NonverbalSignalSummary | undefined {
  let found = false;
  const summary: NonverbalSignalSummary = {
    cameraWarnings: 0,
    microphoneWarnings: 0,
    longSilenceCount: 0,
    shortAnswerCount: 0,
    testModeUsed: false,
    screenAwayCount: 0,
    cameraLostCount: 0,
    faceMissingCount: 0,
    faceOutOfFrameCount: 0,
    multipleFacesCount: 0,
    facePositionShiftCount: 0,
    gazeAwayCount: 0,
    voiceMouthMismatchCount: 0,
    voiceWithoutFaceCount: 0,
    staticVideoFrameCount: 0,
    earlyScreenAwayCount: 0,
    highSuspicionCount: 0
  };

  for (const answer of answers) {
    const metadata = answer.nonverbalMetadata;
    if (!metadata) continue;
    found = true;
    summary.cameraWarnings += nonverbalNumber(metadata.cameraWarnings);
    summary.microphoneWarnings += nonverbalNumber(metadata.microphoneWarnings);
    summary.longSilenceCount += nonverbalNumber(metadata.longSilenceCount);
    summary.shortAnswerCount += nonverbalNumber(metadata.shortAnswerCount);
    summary.testModeUsed = summary.testModeUsed || metadata.testModeUsed === true;
    summary.screenAwayCount += nonverbalScreenAwayCount(metadata);
    summary.cameraLostCount += nonverbalCameraLostCount(metadata);
    summary.faceMissingCount += nonverbalFaceMissingCount(metadata);
    summary.faceOutOfFrameCount += nonverbalFaceOutOfFrameCount(metadata);
    summary.multipleFacesCount += nonverbalMultipleFacesCount(metadata);
    summary.facePositionShiftCount += nonverbalFacePositionShiftCount(metadata);
    summary.gazeAwayCount += nonverbalGazeAwayCount(metadata);
    summary.voiceMouthMismatchCount += nonverbalVoiceMouthMismatchCount(metadata);
    summary.voiceWithoutFaceCount += nonverbalVoiceWithoutFaceCount(metadata);
    summary.staticVideoFrameCount += nonverbalStaticVideoFrameCount(metadata);
    summary.earlyScreenAwayCount += nonverbalEarlyScreenAwayCount(metadata);
    summary.highSuspicionCount += nonverbalSuspicionLevel(metadata) === "HIGH" ? 1 : 0;
  }

  return found ? summary : undefined;
}

function nonverbalNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonverbalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonverbalEventCount(metadata: ReportAnswerNonverbalMetadata, types: string[]): number {
  const events = Array.isArray(metadata.integrityEvents) ? metadata.integrityEvents : [];
  return events.filter((event) => {
    const record = nonverbalRecord(event);
    return typeof record?.type === "string" && types.includes(record.type);
  }).length;
}

function nonverbalScreenAwayCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.screenAwayCount) || nonverbalEventCount(metadata, ["TAB_HIDDEN", "WINDOW_BLUR"]);
}

function nonverbalCameraLostCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.cameraLostCount) || nonverbalEventCount(metadata, ["CAMERA_LOST"]);
}

function nonverbalFaceMissingCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.faceMissingCount) || nonverbalEventCount(metadata, ["FACE_MISSING"]);
}

function nonverbalFaceOutOfFrameCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.faceOutOfFrameCount) || nonverbalEventCount(metadata, ["FACE_OUT_OF_FRAME"]);
}

function nonverbalMultipleFacesCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.multipleFacesCount) || nonverbalEventCount(metadata, ["MULTIPLE_FACES"]);
}

function nonverbalFacePositionShiftCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.facePositionShiftCount) || nonverbalEventCount(metadata, ["FACE_POSITION_SHIFT"]);
}

function nonverbalGazeAwayCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.gazeAwayCount) || nonverbalEventCount(metadata, ["GAZE_AWAY"]);
}

function nonverbalVoiceMouthMismatchCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.voiceMouthMismatchCount) || nonverbalEventCount(metadata, ["VOICE_MOUTH_MISMATCH"]);
}

function nonverbalVoiceWithoutFaceCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.voiceWithoutFaceCount) || nonverbalEventCount(metadata, ["VOICE_WITHOUT_FACE"]);
}

function nonverbalStaticVideoFrameCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.staticVideoFrameCount) || nonverbalEventCount(metadata, ["STATIC_VIDEO_FRAME"]);
}

function nonverbalEarlyScreenAwayCount(metadata: ReportAnswerNonverbalMetadata): number {
  const summary = metadata.integritySummary;
  return nonverbalNumber(summary?.earlyScreenAwayCount) || nonverbalEventCount(metadata, ["EARLY_SCREEN_AWAY"]);
}

function nonverbalSuspicionLevel(metadata: ReportAnswerNonverbalMetadata): string {
  const level = metadata.integritySummary?.suspicionLevel;
  return typeof level === "string" ? level : "NONE";
}

function answerQualityAdjustment(
  criterionName: string,
  transcript: string,
  context: ReportScoringContext,
  nonverbalSignals?: NonverbalSignalSummary
): { maxScore: number; reasons: string[]; forceLowConfidence: boolean } {
  const normalized = normalizeSpace(transcript);
  const reasons: string[] = [];
  const isRecruitingReport = context.reportType === "RECRUITING_REPORT";
  let maxScore = isRecruitingReport ? 82 : 86;
  let forceLowConfidence = false;
  const hasConcreteResult = /(결과|성과|완료|통과|해결했|해결했습니다|안정화|확인했|확인했습니다|줄였|감소|증가|수치|전후|%|\d)/.test(normalized);
  const hasOwnedAction = /(제가|저는|직접|맡았|맡고|담당했|담당하고|구현했|구현했습니다|설계했|설계했습니다|분석했|분석했습니다|확인했|확인했습니다|검증했|검증했습니다|수정했|수정했습니다|연결했|연결했습니다|나누었|나눴|비교했|비교했습니다|도입했|도입했습니다|처리했|처리했습니다)/.test(normalized);

  if (normalized.length < 30) {
    maxScore = Math.min(maxScore, isRecruitingReport ? 50 : 55);
    reasons.push("답변이 매우 짧아 평가 근거가 부족합니다.");
    forceLowConfidence = true;
  } else if (normalized.length < 80) {
    maxScore = Math.min(maxScore, isRecruitingReport ? 62 : 68);
    reasons.push("답변 길이가 짧아 상황, 행동, 결과를 모두 확인하기 어렵습니다.");
  }

  if (looksLikeNoisyTranscript(normalized)) {
    maxScore = Math.min(maxScore, isRecruitingReport ? 62 : 72);
    reasons.push("STT에서 어색하게 인식된 표현이 있어 핵심 근거를 보수적으로 평가했습니다.");
    forceLowConfidence = isRecruitingReport || forceLowConfidence;
  }

  if (isRecruitingReport && looksLowInformationRecruitingAnswer(normalized, hasOwnedAction, hasConcreteResult)) {
    maxScore = Math.min(maxScore, 58);
    reasons.push("답변이 모호해 직무 역량을 판단할 수 있는 구체 근거가 제한적입니다.");
    forceLowConfidence = true;
  }

  if (isRecruitingReport && !hasOwnedAction) {
    maxScore = Math.min(maxScore, 66);
    reasons.push("본인이 직접 맡은 행동이 충분히 구체적으로 드러나지 않습니다.");
  }

  if (isRecruitingReport && !hasConcreteResult) {
    maxScore = Math.min(maxScore, 72);
    reasons.push("성과나 결과가 수치, 전후 비교, 완료 기준으로 충분히 제시되지 않았습니다.");
  }

  if (
    context.reportType === "RECRUITING_REPORT" &&
    criterionName === "직무 적합성" &&
    !hasKeywordOverlap(normalized, context.jobDescription)
  ) {
    maxScore = Math.min(maxScore, 64);
    reasons.push("JD와 직접 연결되는 기술, 역할, 업무 키워드가 충분히 드러나지 않았습니다.");
  }

  if (context.reportType === "MOCK_INTERVIEW_REPORT" && nonverbalSignals) {
    if (
      nonverbalSignals.screenAwayCount > 0 ||
      nonverbalSignals.cameraLostCount > 0 ||
      nonverbalSignals.faceMissingCount > 0 ||
      nonverbalSignals.faceOutOfFrameCount > 0 ||
      nonverbalSignals.multipleFacesCount > 0 ||
      nonverbalSignals.facePositionShiftCount > 0 ||
      nonverbalSignals.gazeAwayCount > 0 ||
      nonverbalSignals.voiceMouthMismatchCount > 0 ||
      nonverbalSignals.voiceWithoutFaceCount > 0 ||
      nonverbalSignals.staticVideoFrameCount > 0 ||
      nonverbalSignals.earlyScreenAwayCount > 0 ||
      nonverbalSignals.highSuspicionCount > 0
    ) {
      reasons.push("화면 이탈, 얼굴 화면 밖, 여러 사람 감지, 시선 이탈 같은 응시 무결성 확인 신호가 있어 실제 면접에서는 주의가 필요합니다.");
    }

    if (nonverbalSignals.shortAnswerCount > 0) {
      maxScore = Math.min(maxScore, 74);
      reasons.push("답변 시간이 짧게 기록되어 상황, 행동, 결과 근거를 더 보강하면 좋습니다.");
    }

    if (nonverbalSignals.microphoneWarnings > 0 || nonverbalSignals.longSilenceCount > 0) {
      maxScore = Math.min(maxScore, 78);
      reasons.push("음성 입력이 낮거나 긴 무음 구간이 있어 핵심 문장을 더 또렷하고 이어서 말하는 연습이 필요합니다.");
    }

    if (nonverbalSignals.cameraWarnings > 0 || nonverbalSignals.testModeUsed) {
      reasons.push("카메라 연결 또는 화면 상태 확인 신호가 있어 다음 연습에서는 화면 구도와 장치 상태를 먼저 점검해 보세요.");
    }
  }

  return { maxScore, reasons, forceLowConfidence };
}

function looksLikeNoisyTranscript(value: string): boolean {
  const fillerCount = (value.match(/(저기|그거|이거|그럼|음|어|뭐|그냥|약간|좀)/g) ?? []).length;
  return fillerCount >= 4 || STT_NOISE_TERMS.some((term) => value.includes(term));
}

function looksLowInformationRecruitingAnswer(value: string, hasOwnedAction: boolean, hasConcreteResult: boolean): boolean {
  const vaguePhraseCount = (value.match(/(것 같습니다|잘 모르|아무튼|그런 것|이런 상황|그냥|약간|좀|뭐)/g) ?? []).length;
  const shortWithoutStructure = value.length < 120 && (!hasOwnedAction || !hasConcreteResult);
  const noActionAndNoResult = !hasOwnedAction && !hasConcreteResult;
  return noActionAndNoResult || (shortWithoutStructure && (looksLikeNoisyTranscript(value) || vaguePhraseCount > 0));
}

function hasKeywordOverlap(transcript: string, jobDescription?: string): boolean {
  if (!jobDescription?.trim()) {
    return false;
  }
  const transcriptTokens = new Set(keywordTokens(transcript));
  return keywordTokens(jobDescription).some((token) => transcriptTokens.has(token));
}

function keywordTokens(value: string): string[] {
  return normalizeSpace(value)
    .toLowerCase()
    .split(/[^a-z0-9가-힣+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !COMMON_KEYWORDS.has(token));
}

function answerEvidenceText(
  answer: ReportAnswerForScoring,
  label = "면접 답변",
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT" = "MOCK_INTERVIEW_REPORT"
): string {
  const question = answer.question ? `질문: ${answer.question}` : undefined;
  if (reportType !== "RECRUITING_REPORT") {
    return [question, `${label}: ${answer.transcript}`].filter((value): value is string => Boolean(value)).join("\n");
  }

  return [
    question,
    `${label}: 답변 #${answer.answerId}에서 ${evidenceFocus(answer.transcript)} 확인했습니다.`,
    "원문과 녹화는 기업 평가 상세의 답변 영역에서 확인할 수 있습니다."
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function evidenceFocus(transcript: string): string {
  const normalized = normalizeSpace(transcript);
  const parts = [
    /(맡|담당|제가|저는)/.test(normalized) ? "본인 역할" : undefined,
    /(구현|설계|분석|확인|검증|수정|연결|비교|분리)/.test(normalized) ? "수행 과정" : undefined,
    /(결과|완료|통과|개선|안정화|수치|전후|\d)/.test(normalized) ? "결과 근거" : undefined,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(", ") : "질문과 연결되는 답변 근거";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

const STT_NOISE_TERMS = [
  "블랍",
  "마인 타입",
  "로컬 스틱",
  "오퍼 처리",
  "힐름",
  "인적 답변",
  "인터뷰 애널",
  "파일 레스셋",
  "동계",
  "인진",
  "전자인",
  "익사구",
  "제이콥",
  "못해주지마",
  "자기 나이",
  "수능까지",
  "하위로",
  "조서",
];

const COMMON_KEYWORDS = new Set([
  "및",
  "또는",
  "그리고",
  "에서",
  "으로",
  "하는",
  "있습니다",
  "경험",
  "프로젝트",
  "업무",
  "지원자",
  "개발자",
  "the",
  "and",
  "with",
  "for",
]);

function zeroScoreForUnavailableTranscript(
  criterion: { criterionId: number; name: string },
  answer: ReportAnswerForScoring
): { score: GeneratedReportScoreRecord; questionEvaluation: GeneratedQuestionEvaluationRecord } {
  const reason = answer.transcriptUnavailableReason ?? STT_UNAVAILABLE_TEMP_ZERO_REASON;
  const evidences: GeneratedReportScoreRecord["evidences"] = [
    {
      sourceType: "INTERVIEW_ANSWER",
      answerId: answer.answerId,
      text: reason
    }
  ];
  const score: GeneratedReportScoreRecord = {
    criterionId: criterion.criterionId,
    criterionName: criterion.name,
    score: 0,
    rationale: reason,
    rubricAnchor: "STT_UNAVAILABLE_TEMP_ZERO",
    confidence: "LOW",
    uncertaintyReasons: [reason],
    evidences
  };
  return {
    score,
    questionEvaluation: {
      criterionId: criterion.criterionId,
      criterionName: criterion.name,
      answerId: answer.answerId,
      question: answer.question ?? `Answer ${answer.answerId}`,
      rubricAnchor: score.rubricAnchor,
      confidence: score.confidence,
      uncertaintyReasons: score.uncertaintyReasons,
      evidences
    }
  };
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
  return normalizeReportCriterionName(name);
}

function scoreRationale(
  criterionName: string,
  score: number,
  _transcript: string,
  assessment: ReturnType<typeof structuredAssessment>,
  qualityReasons: string[] = [],
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT" = "MOCK_INTERVIEW_REPORT"
): string {
  const band = scoreBandFor(score);
  const primaryCaveat = qualityReasons[0] ?? assessment.uncertaintyReasons[0];
  const trailingNote = reportType === "RECRUITING_REPORT"
    ? companyReviewPoint(criterionName, primaryCaveat)
    : primaryCaveat
      ? `${primaryCaveat} 다음 답변에서는 상황, 본인 행동, 결과를 한 번 더 분리해서 말하면 좋습니다.`
      : "행동과 결과가 함께 제시되어 답변 근거의 신뢰도가 비교적 높습니다.";
  const subject = `${criterionName}${topicParticle(criterionName)}`;

  if (reportType !== "RECRUITING_REPORT") {
    if (criterionName === "직무 적합성") {
      return `${subject} ${score}점(${band.label})입니다. JD와 연결되는 기술 경험과 역할 이해를 답변 근거로 확인했습니다. ${trailingNote}`;
    }

    if (criterionName === "문제 해결력") {
      return `${subject} ${score}점(${band.label})입니다. 문제를 확인 가능한 단위로 나누고 원인을 좁혀 가는 접근이 보입니다. ${trailingNote}`;
    }

    if (criterionName === "실행력과 성과") {
      return `${subject} ${score}점(${band.label})입니다. 직접 실행한 작업과 그 결과를 답변에서 확인했습니다. ${trailingNote}`;
    }

    if (criterionName === "학습 민첩성") {
      return `${subject} ${score}점(${band.label})입니다. 새로 익힌 내용을 실제 문제에 적용한 흐름을 답변에서 확인했습니다. ${trailingNote}`;
    }

    if (criterionName === "커뮤니케이션") {
      return `${subject} ${score}점(${band.label})입니다. 상황과 역할을 설명하는 흐름을 답변에서 확인했습니다. ${trailingNote}`;
    }

    if (criterionName === "성장 가능성") {
      return `${subject} ${score}점(${band.label})입니다. 문제를 검증하고 다음 개선으로 이어가려는 태도를 답변 근거로 확인했습니다. ${trailingNote}`;
    }

    return `${subject} ${score}점(${band.label})입니다. 답변 흐름을 바탕으로 관련 역량을 평가했습니다. ${trailingNote}`;
  }

  if (criterionName === "직무 적합성") {
    return `${subject} ${score}점(${band.label})입니다. JD 요구사항과 연결되는 기술 경험, 역할 범위, 업무 맥락을 중심으로 평가했습니다. ${trailingNote}`;
  }

  if (criterionName === "문제 해결력") {
    return `${subject} ${score}점(${band.label})입니다. 문제를 나누어 원인을 좁힌 과정과 검증 방식의 구체성을 중심으로 평가했습니다. ${trailingNote}`;
  }

  if (criterionName === "실행력과 성과") {
    return `${subject} ${score}점(${band.label})입니다. 본인이 실행한 작업, 완료 기준, 결과나 개선 효과가 얼마나 분명한지 평가했습니다. ${trailingNote}`;
  }

  if (criterionName === "학습 민첩성") {
    return `${subject} ${score}점(${band.label})입니다. 새로 익힌 내용을 실제 문제에 적용하고 재사용 가능한 방식으로 정리했는지 평가했습니다. ${trailingNote}`;
  }

  if (criterionName === "커뮤니케이션") {
    return `${subject} ${score}점(${band.label})입니다. 상황, 본인 역할, 조율 방식이 듣는 사람이 이해하기 쉬운 구조로 전달됐는지 평가했습니다. ${trailingNote}`;
  }

  if (criterionName === "성장 가능성") {
    return `${subject} ${score}점(${band.label})입니다. 문제를 검증하고 회고와 다음 개선으로 이어가는 태도가 드러나는지 평가했습니다. ${trailingNote}`;
  }

  return `${subject} ${score}점(${band.label})입니다. 답변 흐름을 바탕으로 관련 역량을 평가했습니다. ${trailingNote}`;
}

function companyReviewPoint(criterionName: string, caveat?: string): string {
  const prefix = caveat ? `${caveat} ` : "";
  if (criterionName === "직무 적합성") {
    return `${prefix}기업 검토 포인트는 JD 핵심 요구와 실제 담당 범위가 어느 정도 직접 연결되는지입니다.`;
  }
  if (criterionName === "문제 해결력") {
    return `${prefix}기업 검토 포인트는 문제 원인 파악 방식과 재현 가능한 검증 절차가 충분한지입니다.`;
  }
  if (criterionName === "실행력과 성과") {
    return `${prefix}기업 검토 포인트는 본인이 실행한 작업의 완료 기준과 결과 근거가 분명한지입니다.`;
  }
  if (criterionName === "학습 민첩성") {
    return `${prefix}기업 검토 포인트는 새로 익힌 내용을 실제 업무 흐름에 적용하고 반복 가능하게 만들었는지입니다.`;
  }
  if (criterionName === "커뮤니케이션") {
    return `${prefix}기업 검토 포인트는 상황, 역할, 협업 또는 조율 방식이 평가자가 이해할 수 있게 정리됐는지입니다.`;
  }
  if (criterionName === "성장 가능성") {
    return `${prefix}기업 검토 포인트는 문제 해결 이후 회고와 재발 방지 관점까지 드러나는지입니다.`;
  }
  return `${prefix}기업 검토 포인트는 답변의 상황, 본인 행동, 결과 근거가 분리되어 확인되는지입니다.`;
}

function topicParticle(value: string): "은" | "는" {
  const lastChar = value.trim().at(-1);
  if (!lastChar) return "은";
  const charCode = lastChar.charCodeAt(0);
  if (charCode < 0xac00 || charCode > 0xd7a3) return "은";
  return (charCode - 0xac00) % 28 === 0 ? "는" : "은";
}

function structuredAssessment(
  transcript: string,
  documentText?: string,
  criterionDescription?: string,
  jobDescription?: string
): ReturnType<typeof assessReportEvidence> {
  return assessReportEvidence(transcript, documentText, criterionDescription, jobDescription);
}

function shorten(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

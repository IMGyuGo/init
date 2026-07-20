import {
  AiResultRepository,
  DEFAULT_STT_UNAVAILABLE_REASON,
  PersonalizedQuestionRecord,
  ResumeQuestionGenerationContext,
  ResumeQuestionJobReference,
} from "./ai-result.repository";
import { createAiProcessUsage, mergeAiProcessUsage } from "./ai-usage";
import {
  factCheckContextOf,
  type FactCheckContextOptions,
} from "./answer-fact-check-context";
import { FollowUpAiProvider } from "./openai-follow-up.provider";
import {
  FACTUAL_ANCHOR_MISSING,
  buildAnswerAnchoredDemoFollowUp,
  buildAnchoredDemoQuestion,
  demoQuestionUnsafeReason,
  extractDemoFollowUpAnchor,
  questionContainsFactualAnchor,
} from "./demo-preset-personalization";
import { planFactClarification, planNcsFollowUp } from "./ncs-report-evaluation.adapter";
import { PostingDraftAiProvider, PostingDraftGenerationResult } from "./openai-posting-draft.provider";
import {
  QuestionAiProvider,
  QuestionGenerationCriterion,
  QuestionGenerationInput,
  QuestionGenerationResult,
  questionQualityIssue,
  type QuestionGenerationType,
} from "./openai-question.provider";
import { ReportAiProvider, ReportGenerationResult } from "./openai-report.provider";
import {
  alignNcsQuestion,
  canonicalNcsProfileIdOf,
  NcsApiProfileId,
  NcsQuestionMode,
} from "./ncs-question-alignment.adapter";
import { sanitizePostingDraftHtml } from "./posting-draft-html";
import {
  NonRetryableAiWorkerFailure,
  ReanswerRequiredAiWorkerFailure,
  RegenerationRequiredAiWorkerFailure,
} from "./worker-errors";
import { AiTaskHandler, AiTaskResult, AiWorkerJob } from "./worker.types";
import {
  SALTLUX_FIXED_PRESENTATION_FIXTURE_ID,
  shouldUseSaltluxFixedPresentationReport,
} from "./fixed-presentation-report";
import { transcriptHardGateFailureReason } from "./transcript-usability";

interface WorkerInput {
  kind?: string;
  payload?: Record<string, unknown>;
}

const MOCK_HIRING_DECISION_TERMS = ["합격", "탈락", "채용 적합", "채용 부적합", "선별", "hiring decision", "pass/fail"];
const FOLLOW_UP_UNSAFE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /https?:\/\/|www\./i, reason: "URL" },
  { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, reason: "contact information" },
  { pattern: /(?:\+?82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/, reason: "contact information" },
  { pattern: /(?:나이|연령|생년월일|성별|남성|여성|주소|거주지|장애|건강|연봉|급여)/i, reason: "discriminatory personal attribute" },
  { pattern: /(?:명문대|상위권\s*대학|학벌|회사\s*명성|대기업\s*출신)/i, reason: "school or company prestige" },
];
const POSTING_DRAFT_UNSAFE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /젊(?:은|고|음|게|은층|은\s*인재)/i, reason: "age preference" },
  { pattern: /\b(?:20대|30대)\b/i, reason: "age preference" },
  { pattern: /\d{2}\s*세\s*(?:이하|미만|우대|선호)/i, reason: "age preference" },
  { pattern: /(?:남성|여성|남자|여자)\s*(?:우대|선호|만|지원 가능)/i, reason: "gender preference" },
  { pattern: /명문대|상위권\s*대학|학벌/i, reason: "school prestige preference" },
  { pattern: /사진\s*첨부|외모|용모/i, reason: "appearance or photo request" },
  { pattern: /(?:미혼|기혼|결혼|임신|출산\s*계획)/i, reason: "family status preference" },
  { pattern: /(?:장애\s*없|신체\s*건강|건강한\s*신체)/i, reason: "disability-related preference" },
  { pattern: /(?:합격|채용)\s*보장/i, reason: "hiring outcome guarantee" },
  { pattern: /최종\s*선발\s*확정|무조건\s*채용/i, reason: "final hiring decision wording" },
  { pattern: /무조건\s*성장|100%\s*성장|최고의\s*회사/i, reason: "exaggerated benefit claim" }
];

export class OpenAiAiTaskHandler implements AiTaskHandler {
  constructor(
    private readonly fallback: AiTaskHandler,
    private readonly results: AiResultRepository,
    private readonly followUpProvider: FollowUpAiProvider,
    private readonly reportProvider?: ReportAiProvider,
    private readonly postingDraftProvider?: PostingDraftAiProvider,
    private readonly questionProvider?: QuestionAiProvider,
    private readonly factCheckOptions: FactCheckContextOptions = {},
  ) {}

  async handle(job: AiWorkerJob): Promise<AiTaskResult> {
    if (
      job.processType !== "FOLLOW_UP" &&
      job.processType !== "REPORT_GENERATE" &&
      job.processType !== "POSTING_DRAFT_GENERATE" &&
      job.processType !== "QUESTION_GENERATE" &&
      job.processType !== "RESUME_QUESTION_GENERATE"
    ) {
      return this.fallback.handle(job);
    }

    const input = parseInput(job.inputRef);
    const payload = input.payload ?? {};
    const kind = input.kind ?? (job.processType === "FOLLOW_UP" ? "RECRUITING_FOLLOW_UP" : "RECRUITING_REPORT_GENERATE");

    if (job.processType === "POSTING_DRAFT_GENERATE") {
      return this.postingDraftGenerate(job, payload);
    }

    if (job.processType === "REPORT_GENERATE") {
      return this.reportGenerate(job, kind, payload);
    }

    if (job.processType === "QUESTION_GENERATE") {
      return this.questionGenerate(job, kind, payload);
    }

    if (job.processType === "RESUME_QUESTION_GENERATE") {
      return this.resumeQuestionGenerate(job);
    }

    return this.followUp(kind, payload);
  }

  private async postingDraftGenerate(job: AiWorkerJob, payload: Record<string, unknown>): Promise<AiTaskResult> {
    if (!this.postingDraftProvider) {
      return this.fallback.handle(job);
    }

    const generatedDraft = await this.postingDraftProvider.generatePostingDraft({
      title: requiredText(payload.title, "title"),
      jobRole: requiredText(payload.jobRole, "jobRole"),
      keywords: stringArrayOf(payload.keywords, "keywords"),
      summary: optionalText(payload.summary),
      careerRequirement: optionalText(payload.careerRequirement),
      employmentType: optionalText(payload.employmentType),
      workLocation: optionalText(payload.workLocation)
    });
    const generated = sanitizePostingDraftResult(generatedDraft);
    const items = ["포지션 상세", "주요 업무", "자격 요건", "우대 사항", "복지 및 혜택", "채용 절차"];
    const savedDraft = {
      kind: "POSTING_DRAFT_GENERATE",
      sourceProcessLogId: job.processLogId,
      providerMode: "openai" as const,
      providerSource: "OPENAI_POSTING_DRAFT_GENERATION",
      model: generated.model,
      items,
      postingDraft: {
        title: generated.title,
        jobRole: generated.jobRole,
        sections: generated.sections,
        tags: generated.tags
      },
      reviewRequired: true as const,
      reviewStatus: "PENDING_REVIEW" as const,
      targetTables: ["postings" as const]
    };

    return {
      outputRef: JSON.stringify({
        ...savedDraft,
        draftSource: "OPENAI_POSTING_DRAFT_GENERATION",
      }),
      guardrail: validatePostingDraft(generated),
      finalSave: () => this.results.saveGeneratedDraft(savedDraft)
    };
  }

  private async followUp(kind: string, payload: Record<string, unknown>): Promise<AiTaskResult> {
    const sessionId = positiveNumber(payload.sessionId, "sessionId");
    const answerId = positiveNumber(payload.answerId, "answerId");
    const previousQuestion = requiredText(payload.previousQuestion, "previousQuestion");
    const transcript = requiredText(payload.transcript, "transcript");
    const hardGateFailureReason = transcriptHardGateFailureReason(transcript);
    if (hardGateFailureReason) {
      throw new ReanswerRequiredAiWorkerFailure(hardGateFailureReason);
    }
    const policy = kind.startsWith("MOCK") ? "MOCK" : "RECRUITING";
    const jobDescription = typeof payload.jobDescription === "string" ? payload.jobDescription : undefined;
    const documentSummary = typeof payload.documentSummary === "string" ? payload.documentSummary : undefined;
    const profileContext = profileContextOf(payload.profileContext);
    const usageScope = payload.usageScope === "DEMO_PRESET" ? "DEMO_PRESET" : "STANDARD";
    const generationSource = optionalText(payload.generationSource);
    const qualityCheckOnly = payload.qualityCheckOnly === true;
    const fixedPresentationFixture =
      payload.presentationFixtureId === SALTLUX_FIXED_PRESENTATION_FIXTURE_ID;
    if (policy === "RECRUITING" && !hasText(jobDescription) && !hasText(documentSummary)) {
      throw new NonRetryableAiWorkerFailure("jobDescription or documentSummary is required");
    }

    const ncsPlan = policy === "RECRUITING" ? planNcsFollowUp(payload) : undefined;
    const fixedFollowUpQuestion = fixedPresentationFixture
      ? optionalText(payload.fixedFollowUpQuestion)
      : undefined;
    if (fixedPresentationFixture && qualityCheckOnly) {
      return {
        outputRef: JSON.stringify({
          sessionId,
          answerId,
          policy,
          usageScope,
          providerMode: "fixed",
          providerSource: "PRESENTATION_FIXTURE",
          qualityCheckOnly: true,
          transcriptUsability: "USABLE",
          followUpRequired: false,
        }),
        guardrail: { result: "PASS", reason: null },
        finalSave: async () => undefined,
      };
    }
    if (fixedFollowUpQuestion) {
      const guardrail = this.validateMockPolicy(policy, fixedFollowUpQuestion);
      return {
        outputRef: JSON.stringify({
          sessionId,
          answerId,
          providerMode: "fixed",
          providerSource: "PRESENTATION_FIXTURE",
          policy,
          previousQuestion,
          content: fixedFollowUpQuestion,
          model: "fixed-demo-fixture-v1",
          followUpRequired: true,
          usageScope,
          attempts: 0,
          fallbackUsed: false,
          questionMode: ncsPlan?.questionMode,
          answerTimeSec: ncsPlan?.answerTimeSec ?? optionalPositiveNumber(payload.answerTimeSec, "answerTimeSec"),
          baseScores: ncsPlan?.baseScores,
          dedupeKey: `${policy}:${sessionId}:${answerId}`,
          duplicatePolicy: "KEEP_EXISTING_FOLLOW_UP",
        }),
        guardrail,
        finalSave: () => this.results.saveFollowUpQuestion({
          sessionId,
          answerId,
          required: true,
          content: fixedFollowUpQuestion,
          policy,
          reason: "NCS_EVIDENCE_GAP",
          questionMode: ncsPlan?.questionMode,
          answerTimeSec: ncsPlan?.answerTimeSec ?? optionalPositiveNumber(payload.answerTimeSec, "answerTimeSec"),
          usageScope,
        }),
      };
    }
    const factPlan = ncsPlan
      ? await planFactClarification(payload, factCheckContextOf(payload.factCheckContext, {
          ...this.factCheckOptions,
          jobDescription,
          documentSummary,
        }))
      : undefined;
    if (factPlan?.transcriptUsability === "UNUSABLE") {
      throw new ReanswerRequiredAiWorkerFailure(
        "음성 인식 결과의 문맥을 신뢰하기 어려워 답변을 평가할 수 없습니다.",
      );
    }
    if (qualityCheckOnly) {
      return {
        outputRef: JSON.stringify({
          sessionId,
          answerId,
          policy,
          usageScope,
          qualityCheckOnly: true,
          transcriptUsability: factPlan?.transcriptUsability ?? "CHECK_UNAVAILABLE",
          followUpRequired: false,
        }),
        guardrail: { result: "PASS", reason: null },
        usage: factPlan?.usage ? createAiProcessUsage({
          modelName: factPlan.usage.modelName,
          inputTokens: factPlan.usage.inputTokens,
          outputTokens: factPlan.usage.outputTokens,
          metadata: { processType: "FOLLOW_UP", stage: "TRANSCRIPT_QUALITY_CHECK" },
        }) : undefined,
        finalSave: async () => undefined,
      };
    }
    if (usageScope === "DEMO_PRESET" && generationSource && generationSource !== "RESUME_PERSONALIZED") {
      return {
        outputRef: JSON.stringify({ sessionId, answerId, policy, usageScope, followUpRequired: false }),
        guardrail: { result: "PASS", reason: null },
        finalSave: () => this.results.saveFollowUpQuestion({
          sessionId, answerId, required: false, policy, usageScope,
        }),
      };
    }
    if (usageScope !== "DEMO_PRESET" && ncsPlan && !ncsPlan.required && !factPlan?.required) {
      return {
        outputRef: JSON.stringify({
          sessionId,
          answerId,
          policy,
          followUpRequired: false,
          questionMode: ncsPlan.questionMode,
          answerTimeSec: ncsPlan.answerTimeSec,
          baseScores: ncsPlan.baseScores,
          factCheck: factPlan ? factCheckFollowUpSummary(factPlan) : undefined,
          dedupeKey: `${policy}:${sessionId}:${answerId}`,
          duplicatePolicy: "KEEP_EXISTING_FOLLOW_UP",
        }),
        guardrail: { result: "PASS", reason: null },
        finalSave: () =>
          this.results.saveFollowUpQuestion({
            sessionId,
            answerId,
            required: false,
            policy,
            reason: "NCS_EVIDENCE_GAP",
            questionMode: ncsPlan.questionMode,
            answerTimeSec: ncsPlan.answerTimeSec,
            usageScope,
          }),
      };
    }

    const followUpInput = {
      kind,
      previousQuestion,
      transcript,
      jobDescription,
      documentSummary,
      questionMode: ncsPlan?.questionMode,
      focusPoints: ncsPlan?.focusPoints,
      logicalStructureGap: ncsPlan?.logicalStructureGap,
      alreadyConfirmedEvidence: ncsPlan?.alreadyConfirmedEvidence,
      factClarificationClaims: factPlan?.required ? factPlan.clarificationClaims : undefined,
      factSupportedClaims: factPlan?.supportedClaims,
      profileContext,
    };
    let generated: Awaited<ReturnType<FollowUpAiProvider["generateFollowUpQuestion"]>> | undefined;
    let followUpAttempts = 0;
    if (usageScope === "DEMO_PRESET") {
      const answerAnchor = extractDemoFollowUpAnchor(transcript);
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        followUpAttempts = attempt;
        try {
          const candidate = await this.followUpProvider.generateFollowUpQuestion(followUpInput);
          if (
            !demoQuestionUnsafeReason(candidate.content) &&
            (!answerAnchor || questionContainsFactualAnchor(candidate.content, answerAnchor))
          ) {
            generated = candidate;
            break;
          }
        } catch {
          // DEMO_PRESET retries once and then falls back to an answer-grounded safe question.
        }
      }
      generated ??= {
        content: buildAnswerAnchoredDemoFollowUp(transcript),
        model: "answer-anchored-safe-template",
      };
    } else {
      generated = await this.followUpProvider.generateFollowUpQuestion(followUpInput);
      followUpAttempts = 1;
    }
    const guardrail = this.validateMockPolicy(policy, generated.content);

    return {
      outputRef: JSON.stringify({
        sessionId,
        answerId,
        providerMode: "openai",
        providerSource: "OPENAI_FOLLOW_UP_GENERATION",
        policy,
        previousQuestion,
        content: generated.content,
        model: generated.model,
        jobDescription,
        documentSummary,
        followUpRequired: true,
        usageScope,
        attempts: followUpAttempts,
        fallbackUsed: generated.model === "answer-anchored-safe-template",
        questionMode: ncsPlan?.questionMode,
        answerTimeSec: ncsPlan?.answerTimeSec,
        baseScores: ncsPlan?.baseScores,
        focusPoints: ncsPlan?.focusPoints,
        factCheck: factPlan ? factCheckFollowUpSummary(factPlan) : undefined,
        dedupeKey: `${policy}:${sessionId}:${answerId}`,
        duplicatePolicy: "KEEP_EXISTING_FOLLOW_UP"
      }),
      guardrail,
      usage: mergeAiProcessUsage(
        createAiProcessUsage({
          modelName: generated.model,
          inputTokens: generated.usage?.inputTokens,
          outputTokens: generated.usage?.outputTokens,
          metadata: { processType: "FOLLOW_UP", stage: "QUESTION_GENERATION" },
        }),
        factPlan?.usage ? createAiProcessUsage({
          modelName: factPlan.usage.modelName,
          inputTokens: factPlan.usage.inputTokens,
          outputTokens: factPlan.usage.outputTokens,
          metadata: { processType: "FOLLOW_UP", stage: "FACT_PRECHECK" },
        }) : undefined,
        { processType: "FOLLOW_UP" },
      ),
      finalSave: () =>
        this.results.saveFollowUpQuestion({
          sessionId,
          answerId,
          required: true,
          content: generated.content,
          policy,
          reason: factPlan?.required
            ? "FACT_CLARIFICATION"
            : ncsPlan ? "NCS_EVIDENCE_GAP" : "GENERAL_EVIDENCE_GAP",
          questionMode: ncsPlan?.questionMode,
          answerTimeSec: ncsPlan?.answerTimeSec,
          usageScope,
        })
    };
  }

  private async questionGenerate(
    job: AiWorkerJob,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<AiTaskResult> {
    if (!this.questionProvider) {
      throw new NonRetryableAiWorkerFailure("OpenAI question provider is required for QUESTION_GENERATE");
    }

    const mock = kind.startsWith("MOCK");
    const postingId = mock ? undefined : positiveNumber(payload.postingId, "postingId");
    const questionCount = positiveNumber(payload.questionCount, "questionCount");
    const criteria = mock ? [] : criteriaOf(payload.criteria);
    const generationInput: QuestionGenerationInput = {
      kind,
      jobRole: mock ? optionalText(payload.jobRole) : undefined,
      requestedDifficulty: mock ? mockDifficultyOf(payload.difficulty) : undefined,
      postingId,
      jobDescription: mock ? undefined : requiredText(payload.jobDescription, "jobDescription"),
      questionCount,
      criteria,
      profileContext: mock ? scrubMockContext(profileContextOf(payload.profileContext)) : undefined,
      folderContext: mock ? scrubMockContext(optionalObject(payload.folderContext, "folderContext"), true) : undefined,
      questionTypes: mock ? questionTypesOf(payload.questionTypes) : undefined,
    };
    const ncsGeneration = !mock && isNcsCriteria(criteria);
    const generated = ncsGeneration
      ? await generateAlignedNcsQuestions(this.questionProvider, generationInput)
      : await this.questionProvider.generateQuestions(generationInput);
    const questionCandidates = ncsGeneration
      ? generated.questionCandidates
      : mock
        ? sanitizeQuestionGenerationResult(generated, false)
        : sanitizeQuestionGenerationResult(generated).map((candidate) => ({
          ...candidate,
          source: "JD_CRITERIA" as const,
          ncsProfileId: null,
          ncsQuestionMode: null,
          ncsProfileVersion: null,
          alignmentStatus: "NOT_EVALUATED" as const,
          alignmentScore: null,
          alignmentReason: null,
          evaluatorVersion: null,
        }));
    const savedDraft = {
      kind: mock ? "MOCK_QUESTION_GENERATE" : "RECRUITING_QUESTION_GENERATE",
      sourceProcessLogId: job.processLogId,
      providerMode: "openai" as const,
      providerSource: "OPENAI_QUESTION_GENERATION",
      model: generated.model,
      items: questionCandidates.map((candidate) => candidate.content),
      questionCandidates,
      reviewRequired: true as const,
      reviewStatus: "PENDING_REVIEW" as const,
      targetTables: mock ? [] : ["question_bank" as const],
      postingId
    };

    return {
      outputRef: JSON.stringify({
        ...savedDraft,
        draftSource: "OPENAI_QUESTION_GENERATION",
      }),
      guardrail: mock ? validateMockQuestionCandidates(questionCandidates) : { result: "PASS", reason: null },
      usage: createAiProcessUsage({
        modelName: generated.model,
        inputTokens: generated.usage?.inputTokens,
        outputTokens: generated.usage?.outputTokens,
        metadata: { processType: "QUESTION_GENERATE" }
      }),
      finalSave: () => this.results.saveGeneratedDraft(savedDraft)
    };
  }

  private async resumeQuestionGenerate(job: AiWorkerJob): Promise<AiTaskResult> {
    const reference = resumeQuestionReferenceOf(job);
    const context = await this.results.loadResumeQuestionGenerationContext(reference);
    if (reference.usageScope === "DEMO_PRESET") {
      return this.demoPresetResumeQuestionGenerate(context);
    }
    if (!this.questionProvider) {
      throw new NonRetryableAiWorkerFailure("OpenAI question provider is required for RESUME_QUESTION_GENERATE");
    }
    const generated = await generateAlignedNcsQuestions(this.questionProvider, {
      kind: "RESUME_PERSONALIZED_QUESTION_GENERATE",
      postingId: context.postingId,
      jobDescription: context.jobDescription,
      questionCount: context.questionCount,
      criteria: context.criteria,
      source: "RESUME_PERSONALIZED",
      resumeText: scrubResumeTextForAi(context.resumeText),
    }, "RESUME_PERSONALIZED");
    const candidates = generated.questionCandidates;
    const unsafe = candidates.find((candidate) => personalizedQuestionUnsafeReason(candidate.content));
    if (unsafe) {
      return {
        outputRef: JSON.stringify({
          kind: "RESUME_PERSONALIZED_QUESTION_GENERATE",
          applicationId: context.applicationId,
          inputVersion: context.inputVersion,
          reviewStatus: "BLOCKED",
        }),
        guardrail: {
          result: "BLOCKED",
          reason: personalizedQuestionUnsafeReason(unsafe.content),
          failureCategory: "NON_RETRYABLE",
        },
      };
    }

    const questions = toPersonalizedQuestionRecords(candidates, context);
    const ready = questions.length === context.questionCount && questions.every((question) => question.alignmentStatus === "ALIGNED");
    const result = {
      reference,
      status: ready ? "READY" as const : "REVIEW_REQUIRED" as const,
      evaluatorVersion: questions.find((question) => question.evaluatorVersion)?.evaluatorVersion ?? null,
      failureReason: ready ? null : "One or more personalized questions require alignment review.",
      questions,
    };

    return {
      outputRef: JSON.stringify({
        kind: "RESUME_PERSONALIZED_QUESTION_GENERATE",
        providerMode: "openai",
        providerSource: "OPENAI_QUESTION_GENERATION",
        applicationId: context.applicationId,
        postingId: context.postingId,
        inputVersion: context.inputVersion,
        status: result.status,
        questions,
        model: generated.model,
      }),
      guardrail: { result: "PASS", reason: null },
      usage: createAiProcessUsage({
        modelName: generated.model,
        inputTokens: generated.usage?.inputTokens,
        outputTokens: generated.usage?.outputTokens,
        metadata: { processType: "RESUME_QUESTION_GENERATE" },
      }),
      finalSave: () => this.results.saveResumeQuestionGeneration(result),
    };
  }

  private async demoPresetResumeQuestionGenerate(context: ResumeQuestionGenerationContext): Promise<AiTaskResult> {
    const anchor = context.factualAnchor;
    if (!anchor) {
      const result = {
        reference: context,
        status: "FAILED" as const,
        evaluatorVersion: null,
        failureReason: FACTUAL_ANCHOR_MISSING,
        questions: [],
      };
      return {
        outputRef: JSON.stringify({
          kind: "DEMO_PRESET_RESUME_PERSONALIZED_QUESTION_GENERATE",
          applicationId: context.applicationId,
          usageScope: context.usageScope,
          inputVersion: context.inputVersion,
          status: result.status,
          reasonCode: FACTUAL_ANCHOR_MISSING,
        }),
        guardrail: { result: "PASS", reason: null },
        finalSave: () => this.results.saveResumeQuestionGeneration(result),
      };
    }

    if (!this.questionProvider) {
      throw new NonRetryableAiWorkerFailure("OpenAI question provider is required for DEMO_PRESET generation");
    }

    const generated = await generateDemoPresetQuestion(this.questionProvider, context, anchor);
    const result = {
      reference: context,
      status: "READY" as const,
      evaluatorVersion: generated.question.evaluatorVersion,
      failureReason: null,
      questions: [generated.question],
    };
    return {
      outputRef: JSON.stringify({
        kind: "DEMO_PRESET_RESUME_PERSONALIZED_QUESTION_GENERATE",
        providerMode: generated.fallbackUsed ? "local" : "openai",
        providerSource: generated.fallbackUsed ? "ANCHORED_SAFE_TEMPLATE" : "OPENAI_QUESTION_GENERATION",
        applicationId: context.applicationId,
        postingId: context.postingId,
        usageScope: context.usageScope,
        inputVersion: context.inputVersion,
        status: result.status,
        attempts: generated.attempts,
        fallbackUsed: generated.fallbackUsed,
        questions: result.questions,
        model: generated.model,
      }),
      guardrail: { result: "PASS", reason: null },
      usage: generated.usage,
      finalSave: () => this.results.saveResumeQuestionGeneration(result),
    };
  }

  private async reportGenerate(
    job: AiWorkerJob,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<AiTaskResult> {
    const sanitizedPayload = payload.reportType === "RECRUITING_REPORT"
      ? { ...payload, answers: stripNonverbalMetadata(payload.answers) }
      : payload;
    const sanitizedJob = {
      ...job,
      inputRef: JSON.stringify({ kind, payload: sanitizedPayload })
    };
    if (shouldUseSaltluxFixedPresentationReport(sanitizedPayload)) {
      return this.fallback.handle({
        ...sanitizedJob,
        inputRef: JSON.stringify({
          kind,
          payload: {
            ...sanitizedPayload,
            presentationFixtureId: SALTLUX_FIXED_PRESENTATION_FIXTURE_ID,
          },
        }),
      });
    }
    if (!this.reportProvider || payload.step || !isFinalReportKind(kind)) {
      return this.fallback.handle(sanitizedJob);
    }

    const reportType = reportTypeOf(sanitizedPayload.reportType);
    const policy = reportType === "MOCK_INTERVIEW_REPORT" ? "MOCK" : "RECRUITING";
    const reportAnswers = answersOf(sanitizedPayload.answers);
    const generated = await this.reportProvider.generateReport({
      kind,
      reportType,
      policy,
      companyName: optionalText(payload.companyName),
      jobTitle: optionalText(payload.jobTitle),
      jobRole: optionalText(payload.jobRole),
      postingId: optionalPositiveNumber(payload.postingId, "postingId"),
      jobDescription: requiredText(payload.jobDescription, "jobDescription"),
      criteria: criteriaOf(payload.criteria),
      answers: reportAnswers,
      documentText: typeof payload.documentText === "string" ? payload.documentText : undefined
    });
    const fallbackResult = await this.fallback.handle({
      ...sanitizedJob,
      inputRef: JSON.stringify({
        kind,
        payload: {
          ...sanitizedPayload,
          summary: formatReportSummary(generated, reportType)
        }
      })
    });

    const reportUsage = createAiProcessUsage({
      modelName: generated.model,
      inputTokens: generated.usage?.inputTokens,
      outputTokens: generated.usage?.outputTokens,
      metadata: { processType: "REPORT_GENERATE", stage: "REPORT_SUMMARY" }
    });
    return {
      ...fallbackResult,
      outputRef: appendReportProviderMetadata(fallbackResult.outputRef, generated, reportType),
      usage: mergeAiProcessUsage(reportUsage, fallbackResult.usage, {
        processType: "REPORT_GENERATE",
        includesNcsEvaluation: Boolean(fallbackResult.usage),
      })
    };
  }

  private validateMockPolicy(policy: "MOCK" | "RECRUITING", text: string) {
    const unsafe = FOLLOW_UP_UNSAFE_PATTERNS.find(({ pattern }) => pattern.test(text));
    if (unsafe) {
      return {
        result: "BLOCKED" as const,
        reason: `follow-up output cannot include ${unsafe.reason}`,
        failureCategory: "NON_RETRYABLE" as const,
      };
    }
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
}

function factCheckFollowUpSummary(plan: {
  required: boolean;
  providerStatus: string;
  gateStatus: string | null;
  clarificationClaims: unknown[];
}): Record<string, unknown> {
  return {
    providerStatus: plan.providerStatus,
    gateStatus: plan.gateStatus,
    clarificationRequired: plan.required,
    clarificationClaimCount: plan.clarificationClaims.length,
  };
}

function profileContextOf(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NonRetryableAiWorkerFailure("profileContext must be an object");
  }
  const context = value as Record<string, unknown>;
  if (context.schemaVersion !== 1) {
    throw new NonRetryableAiWorkerFailure("profileContext schemaVersion must be 1");
  }
  return context;
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NonRetryableAiWorkerFailure(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function questionTypesOf(value: unknown): QuestionGenerationType[] | undefined {
  if (value === undefined || value === null) return undefined;
  const supported: QuestionGenerationType[] = ["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "FOLLOW_UP", "CLOSING"];
  if (!Array.isArray(value) || value.some((item) => !supported.includes(item as QuestionGenerationType))) {
    throw new NonRetryableAiWorkerFailure("questionTypes must contain supported question types");
  }
  return value as QuestionGenerationType[];
}

function stripNonverbalMetadata(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const { nonverbalMetadata: _nonverbalMetadata, ...answer } = item as Record<string, unknown>;
    return answer;
  });
}

function isFinalReportKind(kind: string): boolean {
  return kind === "MOCK_REPORT_GENERATE" || kind === "RECRUITING_REPORT_GENERATE";
}

function reportTypeOf(value: unknown): "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT" {
  if (value === "RECRUITING_REPORT" || value === "MOCK_INTERVIEW_REPORT") {
    return value;
  }
  throw new NonRetryableAiWorkerFailure("reportType is invalid");
}

function criteriaOf(value: unknown): QuestionGenerationCriterion[] {
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
      category: optionalText(record.category),
      description: typeof record.description === "string" ? record.description : undefined,
      weight: Number.isFinite(Number(record.weight)) ? Number(record.weight) : undefined,
      questionCount: optionalPositiveNumber(record.questionCount, "questionCount"),
      ncsProfileId: ncsProfileIdOf(record.ncsProfileId),
      ncsQuestionMode: ncsQuestionModeOf(record.ncsQuestionMode),
      ncsProfileVersion: optionalText(record.ncsProfileVersion),
    };
  });
}

type NcsGenerationCriterion = QuestionGenerationCriterion & {
  questionCount: number;
  ncsProfileId: NcsApiProfileId;
  ncsQuestionMode: NcsQuestionMode;
  ncsProfileVersion: string;
};

type SanitizedQuestionCandidate = ReturnType<typeof sanitizeQuestionGenerationResult>[number];

async function generateAlignedNcsQuestions(
  provider: QuestionAiProvider,
  input: QuestionGenerationInput,
  source: "JD_CRITERIA" | "RESUME_PERSONALIZED" = "JD_CRITERIA",
): Promise<QuestionGenerationResult> {
  const criteria = input.criteria as NcsGenerationCriterion[];
  const allocatedTotal = criteria.reduce((sum, criterion) => sum + criterion.questionCount, 0);
  if (allocatedTotal !== input.questionCount) {
    throw new NonRetryableAiWorkerFailure("NCS criterion allocation must equal questionCount");
  }

  const remaining = new Map(criteria.map((criterion) => [criterion.criterionId, criterion.questionCount]));
  const accepted: Array<SanitizedQuestionCandidate & Record<string, unknown>> = [];
  const rejectedQuestions: string[] = [];
  const rejectionCounts = new Map<string, number>();
  let latestModel = "unknown";
  let inputTokens = 0;
  let outputTokens = 0;
  let primaryAttempts = 0;
  let fallbackAttempts = 0;

  const recordRejection = (reason: string) => {
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
  };

  const collect = async (
    requestedCriteria: NcsGenerationCriterion[],
    attemptKind: "PRIMARY" | "FALLBACK",
  ) => {
    const requestedCount = requestedCriteria.reduce(
      (sum, criterion) => sum + (remaining.get(criterion.criterionId) ?? 0) + 1,
      0,
    );
    if (requestedCount === 0) return;
    if (attemptKind === "PRIMARY") primaryAttempts += 1;
    else fallbackAttempts += 1;

    const generated = await provider.generateQuestions({
      ...input,
      questionCount: requestedCount,
      criteria: requestedCriteria.map((criterion) => ({
        ...criterion,
        questionCount: (remaining.get(criterion.criterionId) ?? 0) + 1,
      })),
      avoidQuestions: [...accepted.map((candidate) => candidate.content), ...rejectedQuestions].slice(-30),
    });
    latestModel = generated.model;
    inputTokens += generated.usage?.inputTokens ?? 0;
    outputTokens += generated.usage?.outputTokens ?? 0;

    for (const candidate of sanitizeQuestionGenerationResult(generated)) {
      const candidateCriterionId = candidate.criterionId;
      if (candidateCriterionId === undefined) {
        throw new NonRetryableAiWorkerFailure("NCS question candidate criterionId is required");
      }
      const criterion = requestedCriteria.find((item) => item.criterionId === candidateCriterionId);
      const slots = remaining.get(candidateCriterionId) ?? 0;
      if (!criterion || slots === 0) continue;

      const qualityIssue = questionQualityIssue(
        candidate.content,
        accepted.map((acceptedCandidate) => acceptedCandidate.content),
      );
      if (qualityIssue) {
        rejectedQuestions.push(candidate.content);
        recordRejection(qualityIssue);
        continue;
      }

      const alignment = alignNcsQuestion({
        question: candidate.content,
        profileId: criterion.ncsProfileId,
        questionMode: criterion.ncsQuestionMode,
        profileVersion: criterion.ncsProfileVersion,
      });
      const decorated = {
        ...candidate,
        questionType: questionTypeForMode(criterion.ncsQuestionMode),
        source,
        ncsProfileId: criterion.ncsProfileId,
        ncsQuestionMode: criterion.ncsQuestionMode,
        ncsProfileVersion: alignment.profileVersion,
        alignmentStatus: alignment.status,
        alignmentScore: alignment.score,
        alignmentReason: alignment.reason,
        evaluatorVersion: alignment.evaluatorVersion,
      };

      if (alignment.status === "ALIGNED") {
        accepted.push(decorated);
        remaining.set(candidateCriterionId, slots - 1);
      } else {
        rejectedQuestions.push(candidate.content);
        recordRejection(alignment.status);
      }
    }
  };

  for (let attempt = 0; attempt < 3 && totalRemaining(remaining) > 0; attempt += 1) {
    await collect(
      criteria.filter((criterion) => (remaining.get(criterion.criterionId) ?? 0) > 0),
      "PRIMARY",
    );
  }

  const fallbackCriteria = criteria
    .filter((criterion) => (remaining.get(criterion.criterionId) ?? 0) > 0)
    .map((criterion) => fallbackCriterion(criterion))
    .filter((criterion): criterion is NcsGenerationCriterion => criterion !== null);
  await collect(fallbackCriteria, "FALLBACK");

  if (totalRemaining(remaining) > 0) {
    const missing = criteria
      .filter((criterion) => (remaining.get(criterion.criterionId) ?? 0) > 0)
      .map((criterion) => `${criterion.criterionId}:${remaining.get(criterion.criterionId)}`)
      .join(", ");
    const rejections = [...rejectionCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, count]) => `${reason}:${count}`)
      .join(",") || "none";
    throw new RegenerationRequiredAiWorkerFailure(
      `aligned candidates exhausted; missing=${missing}; primaryAttempts=${primaryAttempts}; fallbackAttempts=${fallbackAttempts}; rejections=${rejections}`,
    );
  }

  return {
    questionCandidates: accepted.slice(0, input.questionCount),
    model: latestModel,
    usage: {
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
    },
  };
}

function scrubResumeTextForAi(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 비공개]")
    .replace(/(?:\+?82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g, "[연락처 비공개]")
    .slice(0, 50_000)
    .trim();
}

function isNcsCriteria(criteria: QuestionGenerationCriterion[]): criteria is NcsGenerationCriterion[] {
  return (
    criteria.length > 0 &&
    criteria.every(
      (criterion) =>
        criterion.questionCount !== undefined &&
        criterion.ncsProfileId !== undefined &&
        criterion.ncsQuestionMode !== undefined &&
        criterion.ncsProfileVersion !== undefined,
    )
  );
}

function resumeQuestionReferenceOf(job: AiWorkerJob): ResumeQuestionJobReference {
  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(job.inputRef) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid input");
    input = parsed as Record<string, unknown>;
  } catch {
    throw new NonRetryableAiWorkerFailure("resume question job inputRef is invalid");
  }

  return {
    processLogId: job.processLogId,
    applicationId: positiveNumber(input.applicationId, "applicationId"),
    postingId: positiveNumber(input.postingId, "postingId"),
    documentId: positiveNumber(input.documentId, "documentId"),
    policyVersion: positiveNumber(input.policyVersion, "policyVersion"),
    criteriaVersion: positiveNumber(input.criteriaVersion, "criteriaVersion"),
    inputVersion: requiredText(input.inputVersion, "inputVersion"),
    resumeDocumentHash: requiredText(input.resumeDocumentHash, "resumeDocumentHash"),
    jdSnapshotHash: requiredText(input.jdSnapshotHash, "jdSnapshotHash"),
    usageScope: input.usageScope === "DEMO_PRESET" ? "DEMO_PRESET" : "STANDARD",
  };
}

function toPersonalizedQuestionRecords(
  candidates: QuestionGenerationResult["questionCandidates"],
  context: ResumeQuestionGenerationContext,
): PersonalizedQuestionRecord[] {
  return candidates.slice(0, context.questionCount).map((candidate, index) => {
    const criterion = context.criteria.find((item) => item.criterionId === candidate.criterionId);
    if (!criterion || !candidate.content.trim()) {
      throw new NonRetryableAiWorkerFailure("personalized question criterion binding is invalid");
    }
    const metadata = candidate as QuestionGenerationResult["questionCandidates"][number] & {
      ncsProfileId?: unknown;
      ncsQuestionMode?: unknown;
      ncsProfileVersion?: unknown;
      alignmentStatus?: unknown;
      alignmentScore?: unknown;
      alignmentReason?: unknown;
      evaluatorVersion?: unknown;
    };
    const alignmentStatus = metadata.alignmentStatus === "ALIGNED" ? "ALIGNED" : "REVIEW_REQUIRED";
    const effectiveQuestionMode =
      metadata.ncsQuestionMode === "TECHNICAL_KNOWLEDGE" ||
      metadata.ncsQuestionMode === "EXPERIENCE_BEHAVIOR" ||
      metadata.ncsQuestionMode === "SITUATIONAL_DESIGN"
        ? metadata.ncsQuestionMode
        : criterion.ncsQuestionMode;
    return {
      criterionId: criterion.criterionId,
      criterionTitleSnapshot: criterion.name,
      questionType: questionTypeForMode(effectiveQuestionMode),
      content: candidate.content.trim(),
      ncsProfileId: criterion.ncsProfileId,
      ncsQuestionMode: effectiveQuestionMode,
      ncsProfileVersion: typeof metadata.ncsProfileVersion === "string" ? metadata.ncsProfileVersion : criterion.ncsProfileVersion,
      alignmentStatus,
      alignmentScore: typeof metadata.alignmentScore === "number" ? metadata.alignmentScore : null,
      alignmentReason: typeof metadata.alignmentReason === "string" ? metadata.alignmentReason : null,
      evaluatorVersion: typeof metadata.evaluatorVersion === "string" ? metadata.evaluatorVersion : null,
      sortOrder: index + 1,
      ncsBindings: [{
        criterionId: criterion.criterionId,
        criterionTitleSnapshot: criterion.name,
        ncsProfileId: criterion.ncsProfileId,
        ncsProfileVersion: typeof metadata.ncsProfileVersion === "string" ? metadata.ncsProfileVersion : criterion.ncsProfileVersion,
        alignmentStatus,
        alignmentScore: typeof metadata.alignmentScore === "number" ? metadata.alignmentScore : null,
        alignmentReason: typeof metadata.alignmentReason === "string" ? metadata.alignmentReason : null,
        evaluatorVersion: typeof metadata.evaluatorVersion === "string" ? metadata.evaluatorVersion : null,
        bindingOrder: 1,
      }],
    };
  });
}

async function generateDemoPresetQuestion(
  provider: QuestionAiProvider,
  context: ResumeQuestionGenerationContext,
  anchor: string,
): Promise<{
  question: PersonalizedQuestionRecord;
  attempts: number;
  fallbackUsed: boolean;
  model: string;
  usage?: ReturnType<typeof createAiProcessUsage>;
}> {
  const jobCriterion = context.criteria.find((criterion) => criterion.ncsProfileId === "JOB_TECHNICAL");
  const problemCriterion = context.criteria.find((criterion) => criterion.ncsProfileId === "PROBLEM_SOLVING");
  if (!jobCriterion || !problemCriterion) {
    throw new NonRetryableAiWorkerFailure("DEMO_PRESET job and problem criteria are required");
  }

  let attempts = 0;
  let model = "anchored-safe-template";
  let inputTokens = 0;
  let outputTokens = 0;
  let content: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      const generated = await provider.generateQuestions({
        kind: "DEMO_PRESET_RESUME_PERSONALIZED_QUESTION_GENERATE",
        postingId: context.postingId,
        jobDescription: context.jobDescription,
        questionCount: 1,
        criteria: [{ ...jobCriterion, questionCount: 1 }],
        source: "RESUME_PERSONALIZED",
        resumeText: scrubResumeTextForAi(context.resumeText),
        requiredFactualAnchor: anchor,
        requiredNcsProfileIds: ["JOB_TECHNICAL", "PROBLEM_SOLVING"],
      });
      model = generated.model;
      inputTokens += generated.usage?.inputTokens ?? 0;
      outputTokens += generated.usage?.outputTokens ?? 0;
      const candidate = generated.questionCandidates[0]?.content?.trim();
      if (
        candidate &&
        !questionQualityIssue(candidate) &&
        !personalizedQuestionUnsafeReason(candidate) &&
        !demoQuestionUnsafeReason(candidate) &&
        questionContainsFactualAnchor(candidate, anchor) &&
        demoAlignments(candidate, jobCriterion.ncsProfileVersion, problemCriterion.ncsProfileVersion).every((item) => item.status === "ALIGNED")
      ) {
        content = candidate;
        break;
      }
    } catch {
      // The DEMO_PRESET contract permits one retry, then requires the anchored safe template.
    }
  }

  const fallbackUsed = content === null;
  content ??= buildAnchoredDemoQuestion(anchor);
  const [jobAlignment, problemAlignment] = demoAlignments(
    content,
    jobCriterion.ncsProfileVersion,
    problemCriterion.ncsProfileVersion,
  );
  if (jobAlignment.status !== "ALIGNED" || problemAlignment.status !== "ALIGNED") {
    throw new NonRetryableAiWorkerFailure("anchored DEMO_PRESET safe template must align to job and problem profiles");
  }
  const question: PersonalizedQuestionRecord = {
    criterionId: jobCriterion.criterionId,
    criterionTitleSnapshot: jobCriterion.name,
    questionType: "TECHNICAL",
    content,
    ncsProfileId: "JOB_TECHNICAL",
    ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
    ncsProfileVersion: jobAlignment.profileVersion,
    alignmentStatus: "ALIGNED",
    alignmentScore: Math.min(jobAlignment.score ?? 0, problemAlignment.score ?? 0),
    alignmentReason: null,
    evaluatorVersion: jobAlignment.evaluatorVersion,
    sortOrder: 1,
    ncsBindings: [
      {
        criterionId: jobCriterion.criterionId,
        criterionTitleSnapshot: jobCriterion.name,
        ncsProfileId: "JOB_TECHNICAL",
        ncsProfileVersion: jobAlignment.profileVersion,
        alignmentStatus: "ALIGNED",
        alignmentScore: jobAlignment.score,
        alignmentReason: null,
        evaluatorVersion: jobAlignment.evaluatorVersion,
        bindingOrder: 1,
      },
      {
        criterionId: problemCriterion.criterionId,
        criterionTitleSnapshot: problemCriterion.name,
        ncsProfileId: "PROBLEM_SOLVING",
        ncsProfileVersion: problemAlignment.profileVersion,
        alignmentStatus: "ALIGNED",
        alignmentScore: problemAlignment.score,
        alignmentReason: null,
        evaluatorVersion: problemAlignment.evaluatorVersion,
        bindingOrder: 2,
      },
    ],
  };
  return {
    question,
    attempts,
    fallbackUsed,
    model,
    usage: inputTokens || outputTokens
      ? createAiProcessUsage({
          modelName: model,
          inputTokens: inputTokens || undefined,
          outputTokens: outputTokens || undefined,
          metadata: { processType: "RESUME_QUESTION_GENERATE", usageScope: "DEMO_PRESET" },
        })
      : undefined,
  };
}

function demoAlignments(question: string, jobVersion: string, problemVersion: string) {
  return [
    alignNcsQuestion({
      question,
      profileId: "JOB_TECHNICAL",
      questionMode: "TECHNICAL_KNOWLEDGE",
      profileVersion: jobVersion,
    }),
    alignNcsQuestion({
      question,
      profileId: "PROBLEM_SOLVING",
      questionMode: "TECHNICAL_KNOWLEDGE",
      profileVersion: problemVersion,
    }),
  ] as const;
}

function questionTypeForMode(mode: ResumeQuestionGenerationContext["criteria"][number]["ncsQuestionMode"]): PersonalizedQuestionRecord["questionType"] {
  if (mode === "TECHNICAL_KNOWLEDGE") return "TECHNICAL";
  if (mode === "SITUATIONAL_DESIGN") return "SITUATION";
  return "EXPERIENCE";
}

function personalizedQuestionUnsafeReason(content: string): string | null {
  const unsafePatterns: Array<[RegExp, string]> = [
    [/(나이|생년|연령|몇\s*살)/i, "age attribute"],
    [/(성별|남성|여성|남자|여자)/i, "gender attribute"],
    [/(외모|용모|사진)/i, "appearance attribute"],
    [/(가족|부모|결혼|임신|출산)/i, "family attribute"],
    [/(장애인|장애\s*(?:여부|등급)|(?:신체|정신|발달|시각|청각)\s*장애|질병|건강 상태)/i, "health attribute"],
    [/(학교명|출신 학교|학벌)/i, "school attribute"],
  ];
  return unsafePatterns.find(([pattern]) => pattern.test(content))?.[1] ?? null;
}

function fallbackCriterion(criterion: NcsGenerationCriterion): NcsGenerationCriterion | null {
  if (criterion.ncsProfileId === "PROBLEM_SOLVING" && criterion.ncsQuestionMode === "EXPERIENCE_BEHAVIOR") {
    return { ...criterion, ncsQuestionMode: "SITUATIONAL_DESIGN" };
  }
  if (criterion.ncsProfileId === "JOB_TECHNICAL" && criterion.ncsQuestionMode === "TECHNICAL_KNOWLEDGE") {
    return { ...criterion, ncsQuestionMode: "EXPERIENCE_BEHAVIOR" };
  }
  return null;
}

function totalRemaining(remaining: Map<number, number>): number {
  return [...remaining.values()].reduce((sum, count) => sum + count, 0);
}

function ncsProfileIdOf(value: unknown): NcsApiProfileId | undefined {
  return canonicalNcsProfileIdOf(value);
}

function ncsQuestionModeOf(value: unknown): NcsQuestionMode | undefined {
  return value === "EXPERIENCE_BEHAVIOR" || value === "TECHNICAL_KNOWLEDGE" || value === "SITUATIONAL_DESIGN"
    ? value
    : undefined;
}

function sanitizeQuestionGenerationResult(generated: QuestionGenerationResult, requireCriterion = true) {
  if (!Array.isArray(generated.questionCandidates) || generated.questionCandidates.length === 0) {
    throw new NonRetryableAiWorkerFailure("question candidates are required");
  }

  return generated.questionCandidates.map((candidate) => {
    if (requireCriterion && (!candidate.criterionId || !candidate.criterionTitle?.trim())) {
      throw new NonRetryableAiWorkerFailure("question candidate criterionId and criterionTitle are required");
    }
    if (!candidate.content.trim()) {
      throw new NonRetryableAiWorkerFailure(`question candidate content is required for criterion ${candidate.criterionId ?? "mock"}`);
    }
    return {
      content: candidate.content,
      category: candidate.category,
      difficulty: candidate.difficulty,
      criterionId: candidate.criterionId,
      criterionTitle: candidate.criterionTitle,
      expectedKeywords: candidate.expectedKeywords,
      suggestionReason: candidate.suggestionReason,
      questionType: candidate.questionType
    };
  });
}

function validateMockQuestionCandidates(candidates: QuestionGenerationResult["questionCandidates"]) {
  const text = candidates.flatMap((candidate) => [
    candidate.content,
    candidate.category,
    candidate.suggestionReason,
    ...candidate.expectedKeywords,
  ]).join("\n");
  const hiringDecision = MOCK_HIRING_DECISION_TERMS.find((term) => text.includes(term));
  if (hiringDecision) {
    return {
      result: "BLOCKED" as const,
      reason: `mock interview output cannot include hiring decision expression: ${hiringDecision}`,
      failureCategory: "NON_RETRYABLE" as const,
    };
  }
  const unsafe = FOLLOW_UP_UNSAFE_PATTERNS.find(({ pattern }) => pattern.test(text));
  const identifier = [
    { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, reason: "email address" },
    { pattern: /(?:\+?82[-.\s]?)?(?:0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/, reason: "phone number" },
    { pattern: /https?:\/\/|www\./i, reason: "URL" },
  ].find(({ pattern }) => pattern.test(text));
  if (identifier) {
    return {
      result: "BLOCKED" as const,
      reason: `mock interview output cannot include candidate contact information (${identifier.reason})`,
      failureCategory: "NON_RETRYABLE" as const,
    };
  }
  return unsafe
    ? {
        result: "BLOCKED" as const,
        reason: `mock interview question contains unsafe ${unsafe.reason}`,
        failureCategory: "NON_RETRYABLE" as const,
      }
    : { result: "PASS" as const, reason: null };
}

function mockDifficultyOf(value: unknown): "EASY" | "MEDIUM" | "HARD" | undefined {
  if (value === "NORMAL") return "MEDIUM";
  return value === "EASY" || value === "HARD" ? value : undefined;
}

function scrubMockContext(value: Record<string, unknown> | undefined, redactUrls = false): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === "originalName") return [key, "[파일명 제거]"];
    if (typeof item === "string") {
      const shouldRedactUrl = redactUrls && key === "resumeExtractedText";
      return [key, redactMockIdentifiers(item, shouldRedactUrl)];
    }
    if (Array.isArray(item)) {
      return [key, item.map((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
        ? scrubMockContext(entry as Record<string, unknown>, redactUrls)
        : typeof entry === "string" ? redactMockIdentifiers(entry, false) : entry)];
    }
    if (item && typeof item === "object") return [key, scrubMockContext(item as Record<string, unknown>, redactUrls)];
    return [key, item];
  }));
}

function redactMockIdentifiers(value: string, redactUrls: boolean): string {
  let redacted = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 제거]")
    .replace(/(?:\+?82[-.\s]?)?(?:0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[전화번호 제거]")
    .replace(/^(?:성명|이름|name|생년월일|나이|성별|주소)\s*[:：].*$/gim, "[식별정보 제거]");
  if (redactUrls) redacted = redacted.replace(/https?:\/\/\S+|www\.\S+/gi, "[URL 제거]");
  return redacted;
}

function answersOf(value: unknown): Array<{
  answerId: number;
  questionId?: number;
  question?: string;
  questionType?: "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
  sortOrder?: number;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
  followUpReason?: "NCS_EVIDENCE_GAP" | "FACT_CLARIFICATION" | "GENERAL_EVIDENCE_GAP";
  transcript: string;
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
  nonverbalMetadata?: Record<string, unknown>;
}> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NonRetryableAiWorkerFailure("answers is required");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new NonRetryableAiWorkerFailure("answers item must be an object");
    }
    const record = item as Record<string, unknown>;
    const evaluationStatus = record.evaluationStatus === "STT_UNAVAILABLE" ? "STT_UNAVAILABLE" : "EVALUATED";
    const transcriptUnavailableReason =
      optionalText(record.transcriptUnavailableReason) ?? DEFAULT_STT_UNAVAILABLE_REASON;
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
      followUpReason: followUpReasonOf(record.followUpReason),
      transcript,
      evaluationStatus,
      transcriptUnavailableReason: evaluationStatus === "STT_UNAVAILABLE" ? transcriptUnavailableReason : undefined,
      nonverbalMetadata: optionalRecord(record.nonverbalMetadata)
    };
  });
}

function stringArrayOf(value: unknown, name: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new NonRetryableAiWorkerFailure(`${name} must be an array`);
  }
  return value
    .map((item, index) => {
      if (typeof item !== "string") {
        throw new NonRetryableAiWorkerFailure(`${name}[${index}] must be a string`);
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
}

function formatReportSummary(
  generated: ReportGenerationResult,
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT"
): string {
  const trailingNote = generated.feedback
    ? reportType === "RECRUITING_REPORT"
      ? `기업 검토 포인트: ${generated.feedback}`
      : `다음 연습 피드백: ${generated.feedback}`
    : undefined;

  return [generated.summary, trailingNote]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

function appendReportProviderMetadata(
  outputRef: string | undefined,
  generated: ReportGenerationResult,
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT"
): string | undefined {
  if (!outputRef) {
    return outputRef;
  }

  try {
    const output = JSON.parse(outputRef) as Record<string, unknown>;
    return JSON.stringify({
      ...output,
      providerMode: "openai",
      providerSource: "OPENAI_REPORT_GENERATION",
      summarySource: "OPENAI_REPORT_GENERATION",
      model: generated.model,
      ...(reportType === "RECRUITING_REPORT"
        ? { reportReviewNote: generated.feedback }
        : { reportFeedback: generated.feedback })
    });
  } catch {
    return outputRef;
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

function questionTypeOf(value: unknown): "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING" | undefined {
  return value === "INTRO" ||
    value === "TECHNICAL" ||
    value === "EXPERIENCE" ||
    value === "SITUATION" ||
    value === "FOLLOW_UP" ||
    value === "CLOSING"
    ? value
    : undefined;
}

function followUpReasonOf(
  value: unknown,
): "NCS_EVIDENCE_GAP" | "FACT_CLARIFICATION" | "GENERAL_EVIDENCE_GAP" | undefined {
  return value === "NCS_EVIDENCE_GAP" || value === "FACT_CLARIFICATION" || value === "GENERAL_EVIDENCE_GAP"
    ? value
    : undefined;
}

function optionalPositiveNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return positiveNumber(value, name);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
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

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function validatePostingDraft(generated: PostingDraftGenerationResult) {
  if (!generated.title.trim() || !generated.jobRole.trim()) {
    return {
      result: "BLOCKED" as const,
      reason: "posting draft title and jobRole are required",
      failureCategory: "NON_RETRYABLE" as const
    };
  }
  if (Object.values(generated.sections).some((section) => !section.trim())) {
    return {
      result: "BLOCKED" as const,
      reason: "posting draft sections must be non-empty",
      failureCategory: "NON_RETRYABLE" as const
    };
  }
  const unsafeReason = findUnsafePostingDraftReason(generated);
  if (unsafeReason) {
    return {
      result: "BLOCKED" as const,
      reason: `posting draft contains unsafe hiring language: ${unsafeReason}`,
      failureCategory: "NON_RETRYABLE" as const
    };
  }
  return { result: "PASS" as const, reason: null };
}

function findUnsafePostingDraftReason(generated: PostingDraftGenerationResult): string | null {
  const text = [
    generated.title,
    generated.jobRole,
    ...Object.values(generated.sections),
    ...generated.tags
  ].join("\n");
  const normalized = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const matched = POSTING_DRAFT_UNSAFE_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return matched?.reason ?? null;
}

function sanitizePostingDraftResult(generated: PostingDraftGenerationResult): PostingDraftGenerationResult {
  const sections = Object.fromEntries(
    Object.entries(generated.sections).map(([key, section]) => [key, sanitizePostingDraftHtml(section)])
  ) as PostingDraftGenerationResult["sections"];
  return {
    ...generated,
    sections
  };
}

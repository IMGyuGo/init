import {
  AiResultRepository,
  PersonalizedQuestionRecord,
  ResumeQuestionGenerationContext,
  ResumeQuestionJobReference,
} from "./ai-result.repository";
import { createAiProcessUsage, mergeAiProcessUsage } from "./ai-usage";
import { FollowUpAiProvider } from "./openai-follow-up.provider";
import { PostingDraftAiProvider, PostingDraftGenerationResult } from "./openai-posting-draft.provider";
import {
  QuestionAiProvider,
  QuestionGenerationCriterion,
  QuestionGenerationInput,
  QuestionGenerationResult,
} from "./openai-question.provider";
import { ReportAiProvider, ReportGenerationResult } from "./openai-report.provider";
import {
  alignNcsQuestion,
  markQuestionReviewRequired,
  NcsApiProfileId,
  NcsQuestionMode,
} from "./ncs-question-alignment.adapter";
import { sanitizePostingDraftHtml } from "./posting-draft-html";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import { AiTaskHandler, AiTaskResult, AiWorkerJob } from "./worker.types";

const STT_UNAVAILABLE_TEMP_ZERO_REASON =
  "STT transcript is unavailable; this answer is temporarily scored as 0 because speech recognition failed, not because of answer quality.";

interface WorkerInput {
  kind?: string;
  payload?: Record<string, unknown>;
}

const MOCK_HIRING_DECISION_TERMS = ["합격", "탈락", "채용 적합", "채용 부적합", "선별", "hiring decision", "pass/fail"];
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
    private readonly questionProvider?: QuestionAiProvider
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
        model: generated.model
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
    const policy = kind.startsWith("MOCK") ? "MOCK" : "RECRUITING";
    const jobDescription = typeof payload.jobDescription === "string" ? payload.jobDescription : undefined;
    const documentSummary = typeof payload.documentSummary === "string" ? payload.documentSummary : undefined;
    if (policy === "RECRUITING" && !hasText(jobDescription) && !hasText(documentSummary)) {
      throw new NonRetryableAiWorkerFailure("jobDescription or documentSummary is required");
    }

    const generated = await this.followUpProvider.generateFollowUpQuestion({
      kind,
      previousQuestion,
      transcript,
      jobDescription,
      documentSummary
    });
    const guardrail = this.validateMockPolicy(policy, generated.content);

    return {
      outputRef: JSON.stringify({
        sessionId,
        answerId,
        policy,
        previousQuestion,
        content: generated.content,
        model: generated.model,
        jobDescription,
        documentSummary,
        dedupeKey: `${policy}:${sessionId}:${answerId}`,
        duplicatePolicy: "KEEP_EXISTING_FOLLOW_UP"
      }),
      guardrail,
      usage: createAiProcessUsage({
        modelName: generated.model,
        inputTokens: generated.usage?.inputTokens,
        outputTokens: generated.usage?.outputTokens,
        metadata: { processType: "FOLLOW_UP" }
      }),
      finalSave: () => this.results.saveFollowUpQuestion({ sessionId, answerId, content: generated.content, policy })
    };
  }

  private async questionGenerate(
    job: AiWorkerJob,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<AiTaskResult> {
    if (!this.questionProvider || kind.startsWith("MOCK")) {
      return this.fallback.handle(job);
    }

    const postingId = positiveNumber(payload.postingId, "postingId");
    const questionCount = positiveNumber(payload.questionCount, "questionCount");
    const criteria = criteriaOf(payload.criteria);
    const generationInput: QuestionGenerationInput = {
      kind,
      postingId,
      jobDescription: requiredText(payload.jobDescription, "jobDescription"),
      questionCount,
      criteria,
    };
    const generated = isNcsCriteria(criteria)
      ? await generateAlignedNcsQuestions(this.questionProvider, generationInput)
      : await this.questionProvider.generateQuestions(generationInput);
    const questionCandidates = isNcsCriteria(criteria)
      ? generated.questionCandidates
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
      kind: "RECRUITING_QUESTION_GENERATE",
      sourceProcessLogId: job.processLogId,
      items: questionCandidates.map((candidate) => candidate.content),
      questionCandidates,
      reviewRequired: true as const,
      reviewStatus: "PENDING_REVIEW" as const,
      targetTables: ["question_bank" as const],
      postingId
    };

    return {
      outputRef: JSON.stringify({
        ...savedDraft,
        draftSource: "OPENAI_QUESTION_GENERATION",
        model: generated.model
      }),
      guardrail: { result: "PASS", reason: null },
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
    if (!this.questionProvider) {
      return this.fallback.handle(job);
    }

    const reference = resumeQuestionReferenceOf(job);
    const context = await this.results.loadResumeQuestionGenerationContext(reference);
    const generated = await generateAlignedNcsQuestions(this.questionProvider, {
      kind: "RESUME_PERSONALIZED_QUESTION_GENERATE",
      postingId: context.postingId,
      jobDescription: context.jobDescription,
      questionCount: context.questionCount,
      criteria: context.criteria,
      source: "RESUME_PERSONALIZED",
      resumeText: context.resumeText,
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
  const reviewCandidates = new Map<number, Array<SanitizedQuestionCandidate & Record<string, unknown>>>();
  let latestModel = "unknown";
  let inputTokens = 0;
  let outputTokens = 0;

  const collect = async (requestedCriteria: NcsGenerationCriterion[]) => {
    const requestedCount = requestedCriteria.reduce(
      (sum, criterion) => sum + (remaining.get(criterion.criterionId) ?? 0),
      0,
    );
    if (requestedCount === 0) return;

    const generated = await provider.generateQuestions({
      ...input,
      questionCount: requestedCount,
      criteria: requestedCriteria.map((criterion) => ({
        ...criterion,
        questionCount: remaining.get(criterion.criterionId) ?? 0,
      })),
    });
    latestModel = generated.model;
    inputTokens += generated.usage?.inputTokens ?? 0;
    outputTokens += generated.usage?.outputTokens ?? 0;

    for (const candidate of sanitizeQuestionGenerationResult(generated)) {
      const criterion = requestedCriteria.find((item) => item.criterionId === candidate.criterionId);
      const slots = remaining.get(candidate.criterionId) ?? 0;
      if (!criterion || slots === 0) continue;

      const alignment = alignNcsQuestion({
        question: candidate.content,
        profileId: criterion.ncsProfileId,
        questionMode: criterion.ncsQuestionMode,
        profileVersion: criterion.ncsProfileVersion,
      });
      const decorated = {
        ...candidate,
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
        remaining.set(candidate.criterionId, slots - 1);
      } else {
        const current = reviewCandidates.get(candidate.criterionId) ?? [];
        current.push(decorated);
        reviewCandidates.set(candidate.criterionId, current);
      }
    }
  };

  for (let attempt = 0; attempt < 3 && totalRemaining(remaining) > 0; attempt += 1) {
    await collect(criteria.filter((criterion) => (remaining.get(criterion.criterionId) ?? 0) > 0));
  }

  const fallbackCriteria = criteria
    .filter((criterion) => (remaining.get(criterion.criterionId) ?? 0) > 0)
    .map((criterion) => fallbackCriterion(criterion))
    .filter((criterion): criterion is NcsGenerationCriterion => criterion !== null);
  await collect(fallbackCriteria);

  for (const criterion of criteria) {
    const missing = remaining.get(criterion.criterionId) ?? 0;
    if (missing === 0) continue;
    const candidates = reviewCandidates.get(criterion.criterionId) ?? [];
    if (candidates.length < missing) {
      throw new NonRetryableAiWorkerFailure(
        `question provider did not return enough candidates for criterion ${criterion.criterionId}`,
      );
    }
    accepted.push(
      ...candidates.slice(-missing).map((candidate) => {
        const review = markQuestionReviewRequired({
          status: candidate.alignmentStatus as "LOW_ALIGNMENT" | "REVIEW_REQUIRED",
          score: candidate.alignmentScore as number | null,
          reason: candidate.alignmentReason as string | null,
          evaluatorVersion: candidate.evaluatorVersion as "ncs-question-alignment-v1",
          profileVersion: candidate.ncsProfileVersion as "2025.12-v1",
        });
        return {
          ...candidate,
          alignmentStatus: review.status,
          alignmentReason: review.reason,
        };
      }),
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
    return {
      criterionId: criterion.criterionId,
      criterionTitleSnapshot: criterion.name,
      questionType: candidate.questionType ?? questionTypeForMode(criterion.ncsQuestionMode),
      content: candidate.content.trim(),
      ncsProfileId: criterion.ncsProfileId,
      ncsQuestionMode: criterion.ncsQuestionMode,
      ncsProfileVersion: typeof metadata.ncsProfileVersion === "string" ? metadata.ncsProfileVersion : criterion.ncsProfileVersion,
      alignmentStatus,
      alignmentScore: typeof metadata.alignmentScore === "number" ? metadata.alignmentScore : null,
      alignmentReason: typeof metadata.alignmentReason === "string" ? metadata.alignmentReason : null,
      evaluatorVersion: typeof metadata.evaluatorVersion === "string" ? metadata.evaluatorVersion : null,
      sortOrder: index + 1,
    };
  });
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
    [/(장애|질병|건강 상태)/i, "health attribute"],
    [/(학교명|출신 학교|학벌)/i, "school attribute"],
  ];
  return unsafePatterns.find(([pattern]) => pattern.test(content))?.[1] ?? null;
}

function fallbackCriterion(criterion: NcsGenerationCriterion): NcsGenerationCriterion | null {
  if (criterion.ncsProfileId === "PROBLEM_SOLVING" && criterion.ncsQuestionMode === "EXPERIENCE_BEHAVIOR") {
    return { ...criterion, ncsQuestionMode: "SITUATIONAL_DESIGN" };
  }
  if (criterion.ncsProfileId === "DIGITAL" && criterion.ncsQuestionMode === "TECHNICAL_KNOWLEDGE") {
    return { ...criterion, ncsQuestionMode: "EXPERIENCE_BEHAVIOR" };
  }
  return null;
}

function totalRemaining(remaining: Map<number, number>): number {
  return [...remaining.values()].reduce((sum, count) => sum + count, 0);
}

function ncsProfileIdOf(value: unknown): NcsApiProfileId | undefined {
  return value === "PROBLEM_SOLVING" || value === "COMMUNICATION" || value === "DIGITAL"
    ? value
    : undefined;
}

function ncsQuestionModeOf(value: unknown): NcsQuestionMode | undefined {
  return value === "EXPERIENCE_BEHAVIOR" || value === "TECHNICAL_KNOWLEDGE" || value === "SITUATIONAL_DESIGN"
    ? value
    : undefined;
}

function sanitizeQuestionGenerationResult(generated: QuestionGenerationResult) {
  if (!Array.isArray(generated.questionCandidates) || generated.questionCandidates.length === 0) {
    throw new NonRetryableAiWorkerFailure("question candidates are required");
  }

  return generated.questionCandidates.map((candidate) => {
    if (!candidate.criterionId || !candidate.criterionTitle.trim()) {
      throw new NonRetryableAiWorkerFailure("question candidate criterionId and criterionTitle are required");
    }
    if (!candidate.content.trim()) {
      throw new NonRetryableAiWorkerFailure(`question candidate content is required for criterion ${candidate.criterionId}`);
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

function answersOf(value: unknown): Array<{
  answerId: number;
  questionId?: number;
  question?: string;
  questionType?: "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
  sortOrder?: number;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
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

import { AiResultRepository } from "./ai-result.repository";
import { createAiProcessUsage } from "./ai-usage";
import { FollowUpAiProvider } from "./openai-follow-up.provider";
import { PostingDraftAiProvider, PostingDraftGenerationResult } from "./openai-posting-draft.provider";
import { ReportAiProvider, ReportGenerationResult } from "./openai-report.provider";
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
    private readonly postingDraftProvider?: PostingDraftAiProvider
  ) {}

  async handle(job: AiWorkerJob): Promise<AiTaskResult> {
    if (job.processType !== "FOLLOW_UP" && job.processType !== "REPORT_GENERATE" && job.processType !== "POSTING_DRAFT_GENERATE") {
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

  private async reportGenerate(
    job: AiWorkerJob,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<AiTaskResult> {
    if (!this.reportProvider || payload.step || !isFinalReportKind(kind)) {
      return this.fallback.handle(job);
    }

    const reportType = reportTypeOf(payload.reportType);
    const policy = reportType === "MOCK_INTERVIEW_REPORT" ? "MOCK" : "RECRUITING";
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
      answers: answersOf(payload.answers),
      documentText: typeof payload.documentText === "string" ? payload.documentText : undefined
    });
    const fallbackResult = await this.fallback.handle({
      ...job,
      inputRef: JSON.stringify({
        kind,
        payload: {
          ...payload,
          summary: formatReportSummary(generated)
        }
      })
    });

    return {
      ...fallbackResult,
      outputRef: appendReportProviderMetadata(fallbackResult.outputRef, generated),
      usage: createAiProcessUsage({
        modelName: generated.model,
        inputTokens: generated.usage?.inputTokens,
        outputTokens: generated.usage?.outputTokens,
        metadata: { processType: "REPORT_GENERATE" }
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

function isFinalReportKind(kind: string): boolean {
  return kind === "MOCK_REPORT_GENERATE" || kind === "RECRUITING_REPORT_GENERATE";
}

function reportTypeOf(value: unknown): "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT" {
  if (value === "RECRUITING_REPORT" || value === "MOCK_INTERVIEW_REPORT") {
    return value;
  }
  throw new NonRetryableAiWorkerFailure("reportType is invalid");
}

function criteriaOf(value: unknown): Array<{ criterionId: number; name: string; weight?: number; description?: string }> {
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
      weight: Number.isFinite(Number(record.weight)) ? Number(record.weight) : undefined
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
      transcriptUnavailableReason: evaluationStatus === "STT_UNAVAILABLE" ? transcriptUnavailableReason : undefined
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

function formatReportSummary(generated: ReportGenerationResult): string {
  return [generated.summary, generated.feedback ? `다음 연습 피드백: ${generated.feedback}` : undefined]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

function appendReportProviderMetadata(outputRef: string | undefined, generated: ReportGenerationResult): string | undefined {
  if (!outputRef) {
    return outputRef;
  }

  try {
    const output = JSON.parse(outputRef) as Record<string, unknown>;
    return JSON.stringify({
      ...output,
      summarySource: "OPENAI_REPORT_GENERATION",
      model: generated.model,
      reportFeedback: generated.feedback
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

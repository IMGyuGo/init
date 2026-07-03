import { AiResultRepository } from "./ai-result.repository";
import { FollowUpAiProvider } from "./openai-follow-up.provider";
import { ReportAiProvider, ReportGenerationResult } from "./openai-report.provider";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import { AiTaskHandler, AiTaskResult, AiWorkerJob } from "./worker.types";

interface WorkerInput {
  kind?: string;
  payload?: Record<string, unknown>;
}

const MOCK_HIRING_DECISION_TERMS = ["합격", "탈락", "채용 적합", "채용 부적합", "선별", "hiring decision", "pass/fail"];

export class OpenAiAiTaskHandler implements AiTaskHandler {
  constructor(
    private readonly fallback: AiTaskHandler,
    private readonly results: AiResultRepository,
    private readonly followUpProvider: FollowUpAiProvider,
    private readonly reportProvider?: ReportAiProvider
  ) {}

  async handle(job: AiWorkerJob): Promise<AiTaskResult> {
    if (job.processType !== "FOLLOW_UP" && job.processType !== "REPORT_GENERATE") {
      return this.fallback.handle(job);
    }

    const input = parseInput(job.inputRef);
    const payload = input.payload ?? {};
    const kind = input.kind ?? (job.processType === "FOLLOW_UP" ? "RECRUITING_FOLLOW_UP" : "RECRUITING_REPORT_GENERATE");

    if (job.processType === "REPORT_GENERATE") {
      return this.reportGenerate(job, kind, payload);
    }

    return this.followUp(kind, payload);
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
      outputRef: appendReportProviderMetadata(fallbackResult.outputRef, generated)
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

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new NonRetryableAiWorkerFailure(`${name} is required`);
  }
  return value;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

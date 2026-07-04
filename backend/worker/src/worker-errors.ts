import { FailureCategory, FailureReason } from "./worker.types";

export class AiWorkerFailure extends Error {
  constructor(
    readonly category: FailureCategory,
    message: string
  ) {
    super(message);
    this.name = "AiWorkerFailure";
  }
}

export class RetryableAiWorkerFailure extends AiWorkerFailure {
  constructor(message: string) {
    super("RETRYABLE", message);
    this.name = "RetryableAiWorkerFailure";
  }
}

export class NonRetryableAiWorkerFailure extends AiWorkerFailure {
  constructor(message: string) {
    super("NON_RETRYABLE", message);
    this.name = "NonRetryableAiWorkerFailure";
  }
}

export class SttRetryableAiWorkerFailure extends AiWorkerFailure {
  constructor(message: string) {
    super("STT_RETRYABLE", message);
    this.name = "SttRetryableAiWorkerFailure";
  }
}

export class ReanswerRequiredAiWorkerFailure extends AiWorkerFailure {
  constructor(message: string) {
    super("REANSWER_REQUIRED", message);
    this.name = "ReanswerRequiredAiWorkerFailure";
  }
}

export function toFailureReason(error: unknown): FailureReason {
  if (error instanceof AiWorkerFailure) {
    return {
      category: error.category,
      reason: error.message,
      retryable: isRetryableFailureCategory(error.category)
    };
  }

  return {
    category: "RETRYABLE",
    reason: error instanceof Error ? error.message : "unknown worker failure",
    retryable: true
  };
}

export function isRetryableFailureCategory(category: FailureCategory): boolean {
  return category === "RETRYABLE" || category === "STT_RETRYABLE";
}

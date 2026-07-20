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

export class RegenerationRequiredAiWorkerFailure extends AiWorkerFailure {
  constructor(message: string) {
    super("REGENERATION_REQUIRED", message);
    this.name = "RegenerationRequiredAiWorkerFailure";
  }
}

export function toFailureReason(error: unknown): FailureReason {
  if (error instanceof AiWorkerFailure) {
    return {
      category: error.category,
      reason: error.message,
      retryable: isUserRetryableFailureCategory(error.category)
    };
  }

  return {
    category: "RETRYABLE",
    reason: error instanceof Error ? error.message : "unknown worker failure",
    retryable: true
  };
}

export function isAutomaticRetryFailureCategory(category: FailureCategory): boolean {
  return category === "RETRYABLE" || category === "STT_RETRYABLE";
}

export function isUserRetryableFailureCategory(category: FailureCategory): boolean {
  return isAutomaticRetryFailureCategory(category) || category === "REGENERATION_REQUIRED";
}

export function automaticRetryExhaustedFailure(maxAttempts: number): FailureReason {
  return {
    category: "RETRY_EXHAUSTED",
    reason: `Automatic retry limit exhausted after ${maxAttempts} total attempts.`,
    retryable: false,
  };
}

export function toPersistedFailureReason(failure: FailureReason): FailureReason {
  const reasonByCategory: Record<FailureCategory, string> = {
    RETRYABLE: "Temporary AI processing failure.",
    STT_RETRYABLE: "Temporary STT processing failure.",
    NON_RETRYABLE: "AI processing failed with a non-retryable error.",
    REANSWER_REQUIRED: "STT recognition unavailable; candidate reanswer required.",
    REGENERATION_REQUIRED: "AI output regeneration requires an explicit retry.",
    RETRY_EXHAUSTED: "Automatic retry limit exhausted after 3 total attempts.",
  };
  return { ...failure, reason: reasonByCategory[failure.category] };
}

export type AiProcessType =
  | "DOCUMENT_EXTRACT"
  | "STT"
  | "FOLLOW_UP"
  | "REPORT_GENERATE"
  | "EMBEDDING"
  | "GUARDRAIL_VALIDATE"
  | "CRITERIA_SUGGEST"
  | "QUESTION_GENERATE"
  | "QUESTION_SET_GENERATE"
  | "POSTING_DRAFT_GENERATE";

export type AiProcessStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type FailureCategory = "RETRYABLE" | "NON_RETRYABLE" | "STT_RETRYABLE" | "REANSWER_REQUIRED";
export type GuardrailResult = "PASS" | "BLOCKED" | "REGENERATED";

export interface AiWorkerJob {
  processLogId: number;
  processType: AiProcessType;
  inputRef: string;
  attempt: number;
}

export interface AiQueueMessage {
  messageId: string;
  receiptHandle: string;
  job: AiWorkerJob;
  receiveCount?: number;
}

export interface GuardrailDecision {
  result: GuardrailResult;
  reason: string | null;
  failureCategory?: FailureCategory | null;
}

export interface FailureReason {
  category: FailureCategory;
  reason: string;
  retryable: boolean;
}

export interface AiTaskResult {
  outputRef?: string;
  guardrail?: GuardrailDecision;
  finalSave?: () => Promise<void>;
}

export interface AiTaskHandler {
  handle(job: AiWorkerJob): Promise<AiTaskResult>;
}

export interface AiProcessLogSnapshot {
  processLogId: number;
  processType: AiProcessType;
  status: AiProcessStatus;
  inputRef: string;
  outputRef?: string;
  failure?: FailureReason;
}

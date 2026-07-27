import { AiProcessStatus, AiProcessType } from "../report.types";

export const SCREENING_RETRY_REPOSITORY = Symbol("SCREENING_RETRY_REPOSITORY");

export class ScreeningRetryNotFoundError extends Error {}
export class ScreeningRetryConflictError extends Error {}

export interface ScreeningRetryProcess {
  processLogId: number;
  processType: AiProcessType;
  status: AiProcessStatus;
  inputRef: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: string;
}

export type ScreeningRetryPreparation =
  | { action: "CANDIDATE_REANSWER_REQUIRED" }
  | {
      action: "REPORT_RETRY";
      created: boolean;
      process: ScreeningRetryProcess;
    };

export interface ScreeningRetryRepository {
  prepare(applicationId: number): Promise<ScreeningRetryPreparation>;
  markPublishFailed(processLogId: number, reason: string): Promise<void>;
}

import type { ApiErrorEnvelope, ApiValidationDetail } from "./types";
import { getPostingDraftApiValidationMessage } from "./posting-draft-summary";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: ApiValidationDetail[],
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function createApiRequestError(error: ApiErrorEnvelope["error"]): ApiRequestError {
  const message = error.code === "COMMON_VALIDATION_FAILED"
    ? getPostingDraftApiValidationMessage(error.details) ?? error.message
    : error.message;
  return new ApiRequestError(message, error.code, error.details);
}

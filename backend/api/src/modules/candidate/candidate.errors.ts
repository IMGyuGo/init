export class CandidateDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

export interface CandidateErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  meta: {
    traceId: string;
    timestamp: string;
  };
}

export function createCandidateErrorResponse(
  error: CandidateDomainError,
  traceId = "local-candidate-module",
): CandidateErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
    meta: {
      traceId,
      timestamp: new Date().toISOString(),
    },
  };
}

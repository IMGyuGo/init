import { BadRequestException, ValidationError } from "@nestjs/common";

export function createCandidateValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    error: {
      code: "COMMON_VALIDATION_FAILED",
      message: "입력값을 확인해주세요.",
      details: flattenValidationErrors(errors),
    },
    meta: {
      traceId: "local-candidate-module",
      timestamp: new Date().toISOString(),
    },
  });
}

function flattenValidationErrors(errors: ValidationError[], parentPath = ""): Array<{ field: string; reason: string }> {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const current = Object.values(error.constraints ?? {}).map((reason) => ({ field, reason }));
    const children = flattenValidationErrors(error.children ?? [], field);
    return [...current, ...children];
  });
}

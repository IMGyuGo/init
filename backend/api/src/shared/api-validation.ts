import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import { ERROR_CODES } from "@init/common";

export type ApiValidationDetail = {
  field: string;
  reason: string;
  limit?: number;
  actualLength?: number;
  message: string;
};

type ValidationContext = {
  reason?: string;
  limit?: number;
  message?: string;
  measure?: "EACH_STRING";
};

const CONSTRAINT_REASONS: Record<string, string> = {
  arrayMaxSize: "MAX_ITEMS",
  isArray: "INVALID_TYPE",
  isDefined: "REQUIRED",
  isNotEmpty: "REQUIRED",
  isString: "INVALID_TYPE",
  maxLength: "MAX_LENGTH",
  whitelistValidation: "UNKNOWN_FIELD",
};

export function createApiValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.COMMON_VALIDATION_FAILED,
    message: "입력값을 확인해주세요.",
    details: errors.flatMap((error) => validationDetails(error)),
  });
}

function validationDetails(error: ValidationError, parentPath = ""): ApiValidationDetail[] {
  const field = parentPath ? `${parentPath}.${error.property}` : error.property;
  const ownDetails = Object.entries(error.constraints ?? {}).map(([constraint, defaultMessage]) => {
    const context = (error.contexts?.[constraint] ?? {}) as ValidationContext;
    const actualLength = context.measure === "EACH_STRING"
      ? maxStringLength(error.value)
      : lengthOf(error.value);

    return {
      field,
      reason: context.reason ?? CONSTRAINT_REASONS[constraint] ?? "INVALID_VALUE",
      ...(context.limit === undefined ? {} : { limit: context.limit }),
      ...(actualLength === undefined ? {} : { actualLength }),
      message: context.message ?? defaultMessage,
    };
  });
  const childDetails = (error.children ?? []).flatMap((child) => validationDetails(child, field));

  return [...ownDetails, ...childDetails];
}

function lengthOf(value: unknown): number | undefined {
  if (typeof value === "string") {
    return getValidationTextLength(value);
  }
  return Array.isArray(value) ? value.length : undefined;
}

function maxStringLength(value: unknown): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const lengths = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => getValidationTextLength(item));
  return lengths.length > 0 ? Math.max(...lengths) : undefined;
}

// class-validator의 MaxLength가 사용하는 validator.js의 문자 계산 규칙과 맞춘다.
export function getValidationTextLength(value: string): number {
  const presentationSequences = value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g)?.length ?? 0;
  const surrogatePairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0;
  return value.length - presentationSequences - surrogatePairs;
}

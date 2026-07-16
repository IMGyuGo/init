export const AI_DRAFT_SUMMARY_MAX_LENGTH = 3000;

export function getPostingDraftSummaryLength(value: string): number {
  const presentationSequences = value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g)?.length ?? 0;
  const surrogatePairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0;
  return value.length - presentationSequences - surrogatePairs;
}

export function getPostingDraftSummaryValidation(value: string): string | null {
  const currentLength = getPostingDraftSummaryLength(value);
  if (currentLength <= AI_DRAFT_SUMMARY_MAX_LENGTH) {
    return null;
  }

  return `핵심 내용은 최대 ${AI_DRAFT_SUMMARY_MAX_LENGTH.toLocaleString("ko-KR")}자까지 입력할 수 있습니다. 현재 ${currentLength.toLocaleString("ko-KR")}자입니다.`;
}

export function getPostingDraftSummaryUiState(
  validationMessage: string | null,
  draftMessage: string,
  generating: boolean,
): { generateDisabled: boolean; visibleDraftMessage: string | null } {
  return {
    generateDisabled: generating || Boolean(validationMessage),
    visibleDraftMessage: draftMessage && draftMessage !== validationMessage ? draftMessage : null,
  };
}

export function getPostingDraftApiValidationMessage(details: unknown[]): string | null {
  const messages = details
    .filter((detail): detail is Record<string, unknown> => Boolean(detail) && typeof detail === "object" && !Array.isArray(detail))
    .filter((detail) => typeof detail.message === "string" && detail.message.trim().length > 0)
    .sort((left, right) => validationReasonPriority(left.reason) - validationReasonPriority(right.reason));
  const firstMessage = messages[0]?.message;
  return typeof firstMessage === "string" ? firstMessage : null;
}

function validationReasonPriority(reason: unknown): number {
  switch (reason) {
    case "REQUIRED":
      return 0;
    case "INVALID_TYPE":
      return 1;
    case "UNKNOWN_FIELD":
      return 2;
    default:
      return 3;
  }
}

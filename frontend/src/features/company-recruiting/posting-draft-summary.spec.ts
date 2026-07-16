import assert from "node:assert/strict";
import {
  AI_DRAFT_SUMMARY_MAX_LENGTH,
  getPostingDraftApiValidationMessage,
  getPostingDraftSummaryValidation,
  getPostingDraftSummaryUiState,
} from "./posting-draft-summary";
import { ApiRequestError, createApiRequestError } from "./api-error";

assert.equal(AI_DRAFT_SUMMARY_MAX_LENGTH, 3000);
assert.equal(getPostingDraftSummaryValidation("a".repeat(3000)), null);
assert.equal(
  getPostingDraftSummaryValidation("a".repeat(3001)),
  "핵심 내용은 최대 3,000자까지 입력할 수 있습니다. 현재 3,001자입니다.",
);
assert.equal(
  getPostingDraftSummaryValidation("😀".repeat(3001)),
  "핵심 내용은 최대 3,000자까지 입력할 수 있습니다. 현재 3,001자입니다.",
);
assert.equal(getPostingDraftSummaryValidation("❤️".repeat(3000)), null);
assert.equal(
  getPostingDraftSummaryValidation("❤️".repeat(3001)),
  "핵심 내용은 최대 3,000자까지 입력할 수 있습니다. 현재 3,001자입니다.",
);
assert.equal(getPostingDraftSummaryValidation("👩‍💻".repeat(1000)), null);
assert.equal(
  getPostingDraftSummaryValidation(`${"👩‍💻".repeat(1000)}a`),
  "핵심 내용은 최대 3,000자까지 입력할 수 있습니다. 현재 3,001자입니다.",
);

assert.equal(
  getPostingDraftApiValidationMessage([
    {
      field: "summary",
      reason: "MAX_LENGTH",
      limit: 3000,
      actualLength: 3001,
      message: "핵심 내용은 최대 3,000자까지 입력할 수 있습니다.",
    },
  ]),
  "핵심 내용은 최대 3,000자까지 입력할 수 있습니다.",
);
assert.equal(
  getPostingDraftApiValidationMessage([
    { field: "title", reason: "REQUIRED", message: "공고 제목을 입력해주세요." },
  ]),
  "공고 제목을 입력해주세요.",
);
assert.equal(
  getPostingDraftApiValidationMessage([
    { field: "title", reason: "MAX_LENGTH", message: "title must be shorter" },
    { field: "title", reason: "REQUIRED", message: "공고 제목을 입력해주세요." },
  ]),
  "공고 제목을 입력해주세요.",
);
assert.equal(getPostingDraftApiValidationMessage([]), null);

const requestError = createApiRequestError({
  code: "COMMON_VALIDATION_FAILED",
  message: "입력값을 확인해주세요.",
  details: [
    {
      field: "summary",
      reason: "MAX_LENGTH",
      limit: 3000,
      actualLength: 3001,
      message: "핵심 내용은 최대 3,000자까지 입력할 수 있습니다.",
    },
  ],
});
assert.ok(requestError instanceof ApiRequestError);
assert.equal(requestError.code, "COMMON_VALIDATION_FAILED");
assert.equal(requestError.details[0]?.field, "summary");
assert.equal(requestError.message, "핵심 내용은 최대 3,000자까지 입력할 수 있습니다.");

const overLimitMessage = "핵심 내용은 최대 3,000자까지 입력할 수 있습니다. 현재 3,020자입니다.";
assert.deepEqual(
  getPostingDraftSummaryUiState(overLimitMessage, overLimitMessage, false),
  { generateDisabled: true, visibleDraftMessage: null },
);
assert.deepEqual(
  getPostingDraftSummaryUiState(overLimitMessage, "AI 초안 생성에 실패했습니다.", false),
  { generateDisabled: true, visibleDraftMessage: "AI 초안 생성에 실패했습니다." },
);
assert.deepEqual(
  getPostingDraftSummaryUiState(null, "AI 초안 생성을 요청하고 있어요.", true),
  { generateDisabled: true, visibleDraftMessage: "AI 초안 생성을 요청하고 있어요." },
);
assert.deepEqual(
  getPostingDraftSummaryUiState(null, "", false),
  { generateDisabled: false, visibleDraftMessage: null },
);

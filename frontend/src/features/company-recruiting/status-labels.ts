const STATUS_LABELS: Record<string, string> = {
  OPEN: "모집중",
  DRAFT: "대기중",
  CLOSING_SOON: "마감임박",
  CLOSED: "마감",
  ARCHIVED: "보관",
  SUBMITTED: "지원 완료",
  INVITED: "초대 완료",
  IN_REVIEW: "검토 중",
  SCREENING: "검토 중",
  INTERVIEW_WAITING: "면접 대기",
  INTERVIEW_DONE: "면접 완료",
  COMPLETED: "완료",
  DONE: "완료",
  CANCELED: "취소",
  WITHDRAWN: "지원 철회",
  NOT_SUBMITTED: "미제출",
  EXTRACTING: "추출 중",
  EXTRACTED: "추출 완료",
  NOT_READY: "준비 전",
  READY: "준비 완료",
  IN_PROGRESS: "진행 중",
  FAILED: "실패",
  PENDING: "대기 중",
  GENERATING: "생성 중",
  GENERATED: "생성 완료",
  SENT: "발송 완료",
  DELIVERED: "전달 완료",
  REQUESTED: "요청됨",
  PASSED: "통과",
  REJECTED: "반려",
  NONE_OR_GENERATING: "없음/생성 중",
  UNDECIDED: "미정",
  PASS: "합격",
  HOLD: "보류",
  FAIL: "불합격",
  RETRY: "재처리 중",
  D_PUBLIC_CONTEXT_PENDING: "면접 진입 준비 중",
};

const SUCCESS_STATUSES = new Set([
  "OPEN",
  "SUBMITTED",
  "INVITED",
  "READY",
  "COMPLETED",
  "DONE",
  "INTERVIEW_DONE",
  "EXTRACTED",
  "GENERATED",
  "SENT",
  "DELIVERED",
  "PASSED",
  "PASS",
]);
const WARNING_STATUSES = new Set([
  "CLOSING_SOON",
  "IN_REVIEW",
  "SCREENING",
  "INTERVIEW_WAITING",
  "IN_PROGRESS",
  "EXTRACTING",
  "GENERATING",
  "PENDING",
  "HOLD",
  "RETRY",
  "REQUESTED",
  "NONE_OR_GENERATING",
  "D_PUBLIC_CONTEXT_PENDING",
]);
const DANGER_STATUSES = new Set(["FAIL", "CLOSED", "FAILED", "CANCELED", "WITHDRAWN", "REJECTED"]);
const NEUTRAL_STATUSES = new Set(["DRAFT", "ARCHIVED", "UNDECIDED", "NOT_SUBMITTED", "NOT_READY"]);

export function formatRecruitingStatusLabel(value?: string | null) {
  if (!value) return "-";
  return STATUS_LABELS[value] ?? value;
}

export function getRecruitingStatusTone(value?: string | null) {
  const key = value ?? "";
  if (SUCCESS_STATUSES.has(key)) return "success";
  if (DANGER_STATUSES.has(key)) return "danger";
  if (WARNING_STATUSES.has(key)) return "warning";
  if (NEUTRAL_STATUSES.has(key)) return "neutral";
  return "info";
}

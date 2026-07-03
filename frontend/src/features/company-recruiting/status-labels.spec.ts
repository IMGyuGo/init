import { formatRecruitingStatusLabel } from "./status-labels";

const expectedLabels = new Map<string, string>([
  ["SUBMITTED", "지원 완료"],
  ["IN_REVIEW", "검토 중"],
  ["INTERVIEW_WAITING", "면접 대기"],
  ["INTERVIEW_DONE", "면접 완료"],
  ["CANCELED", "취소"],
  ["NOT_SUBMITTED", "미제출"],
  ["EXTRACTING", "추출 중"],
  ["EXTRACTED", "추출 완료"],
  ["NOT_READY", "준비 전"],
  ["READY", "준비 완료"],
  ["IN_PROGRESS", "진행 중"],
  ["PENDING", "대기 중"],
  ["GENERATING", "생성 중"],
  ["UNDECIDED", "미정"],
  ["PASS", "합격"],
  ["HOLD", "보류"],
  ["FAIL", "불합격"],
  ["NONE_OR_GENERATING", "없음/생성 중"],
]);

for (const [status, label] of expectedLabels) {
  if (formatRecruitingStatusLabel(status) !== label) {
    throw new Error(`${status} should render as ${label}.`);
  }
}

if (formatRecruitingStatusLabel("UNKNOWN_STATUS") !== "UNKNOWN_STATUS") {
  throw new Error("Unknown statuses should remain visible for contract drift detection.");
}

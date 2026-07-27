import type { ApplicantSummary } from "./types";

export const APPLICANTS_PAGE_SIZE = 20;

export type ApplicantSort = "recent" | "score" | "applicationStatus" | "interviewStatus" | "reportStatus";

export const DEFAULT_APPLICANT_SORT: ApplicantSort = "score";

export const APPLICANT_SORT_OPTIONS: ReadonlyArray<{ value: ApplicantSort; label: string }> = [
  { value: "recent", label: "최신순" },
  { value: "score", label: "점수 높은순" },
  { value: "applicationStatus", label: "지원 상태순" },
  { value: "interviewStatus", label: "면접 상태순" },
  { value: "reportStatus", label: "리포트 상태순" },
];

export function getApplicantSortQuery(sort: ApplicantSort) {
  return {
    sort: sort === "recent" ? "updatedAt" as const : sort,
    order: sort === "recent" || sort === "score" ? "desc" as const : "asc" as const,
  };
}

export function getApplicantSummaryMetrics(summary: ApplicantSummary | null) {
  const activeTotal = summary?.activeTotal ?? 0;
  const completedInterviews = summary?.interviewStatusCounts.COMPLETED ?? 0;
  return {
    activeTotal,
    completedInterviews,
    reportCompleted: summary?.reportStatusCounts.COMPLETED ?? 0,
    completionRate: activeTotal === 0 ? 0 : Math.round((completedInterviews / activeTotal) * 100),
  };
}

export function getScreeningConfirmationPreview(summary: ApplicantSummary | null) {
  return {
    eligibleTotal: summary?.confirmationEligibleTotal ?? 0,
    eligibleDecisionCounts: summary?.confirmationEligibleDecisionCounts ?? { PASS: 0, HOLD: 0, FAIL: 0 },
    excludedDecisionCounts: {
      UNDECIDED: summary?.effectiveScreeningDecisionCounts.UNDECIDED ?? 0,
      RETRY: summary?.effectiveScreeningDecisionCounts.RETRY ?? 0,
    },
  };
}

export function getPassMailTargetLimit(summary: ApplicantSummary | null) {
  if (!summary) return 0;
  return Math.min(
    summary.confirmationEligibleTotal,
    summary.reportStatusCounts.COMPLETED ?? 0,
  );
}

export function applyScreeningDecisionCountChange(
  summary: ApplicantSummary | null,
  previousDecision: string | null | undefined,
  nextDecision: string | null | undefined,
) {
  const previous = previousDecision ?? "UNDECIDED";
  const next = nextDecision ?? "UNDECIDED";
  if (!summary || previous === next) {
    return summary;
  }

  const effectiveScreeningDecisionCounts = { ...summary.effectiveScreeningDecisionCounts };
  effectiveScreeningDecisionCounts[previous] = Math.max(0, (effectiveScreeningDecisionCounts[previous] ?? 0) - 1);
  effectiveScreeningDecisionCounts[next] = (effectiveScreeningDecisionCounts[next] ?? 0) + 1;
  const confirmationEligibleDecisionCounts = { ...summary.confirmationEligibleDecisionCounts };
  if (previous === "PASS" || previous === "HOLD" || previous === "FAIL") {
    confirmationEligibleDecisionCounts[previous] = Math.max(0, confirmationEligibleDecisionCounts[previous] - 1);
  }
  if (next === "PASS" || next === "HOLD" || next === "FAIL") {
    confirmationEligibleDecisionCounts[next] += 1;
  }

  return {
    ...summary,
    effectiveScreeningDecisionCounts,
    confirmationEligibleDecisionCounts,
  };
}

export function canEditScreeningDecision(input: {
  autoScreeningPolicyEnabled: boolean;
  reportStatus: string;
  screeningDecision: string | null;
  screeningResultConfirmationStatus?: "PENDING" | "CONFIRMED";
}) {
  return input.screeningResultConfirmationStatus !== "CONFIRMED" &&
    input.reportStatus === "COMPLETED" &&
    ["PASS", "HOLD", "FAIL"].includes(input.screeningDecision ?? "");
}

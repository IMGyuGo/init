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

export function getPassMailTargetLimit(summary: ApplicantSummary | null) {
  return (summary?.screeningDecisionCounts.PASS ?? 0) + (summary?.screeningDecisionCounts.FAIL ?? 0);
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

  const screeningDecisionCounts = { ...summary.screeningDecisionCounts };
  screeningDecisionCounts[previous] = Math.max(0, (screeningDecisionCounts[previous] ?? 0) - 1);
  screeningDecisionCounts[next] = (screeningDecisionCounts[next] ?? 0) + 1;

  return {
    ...summary,
    screeningDecisionCounts,
  };
}

export function canEditScreeningDecision(input: {
  autoScreeningPolicyEnabled: boolean;
  reportStatus: string;
  screeningDecision: string | null;
}) {
  if (!input.autoScreeningPolicyEnabled) {
    return true;
  }
  return input.reportStatus === "COMPLETED" && ["PASS", "HOLD", "FAIL"].includes(input.screeningDecision ?? "");
}

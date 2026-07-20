import type { ApplicantSummary } from "./types";

export const APPLICANTS_PAGE_SIZE = 20;

export type ApplicantSort = "recent" | "applicationStatus" | "interviewStatus" | "reportStatus";

export const APPLICANT_SORT_OPTIONS: ReadonlyArray<{ value: ApplicantSort; label: string }> = [
  { value: "recent", label: "최신순" },
  { value: "applicationStatus", label: "지원 상태순" },
  { value: "interviewStatus", label: "면접 상태순" },
  { value: "reportStatus", label: "리포트 상태순" },
];

export function getApplicantSortQuery(sort: ApplicantSort) {
  return {
    sort: sort === "recent" ? "updatedAt" as const : sort,
    order: sort === "recent" ? "desc" as const : "asc" as const,
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

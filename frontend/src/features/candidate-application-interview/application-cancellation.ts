import type { CandidateApplicationSummary } from "./api";

export function isCandidateApplicationCancelable(application: CandidateApplicationSummary): boolean {
  return (
    ["SUBMITTED", "IN_REVIEW"].includes(application.applicationStatus) &&
    ["NOT_READY", "READY"].includes(application.interviewStatus)
  );
}

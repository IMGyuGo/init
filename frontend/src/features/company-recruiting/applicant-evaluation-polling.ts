import type { ApplicantEvaluation } from "./types";

const ACTIVE_REPORT_STATUSES = new Set(["PENDING", "GENERATING"]);

export function shouldPollApplicantEvaluation(evaluation: ApplicantEvaluation | null): boolean {
  if (!evaluation) return false;
  return ACTIVE_REPORT_STATUSES.has(evaluation.statuses.reportStatus) ||
    ACTIVE_REPORT_STATUSES.has(evaluation.report?.status ?? "");
}

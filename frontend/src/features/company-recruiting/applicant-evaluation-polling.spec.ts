import assert from "node:assert/strict";
import { shouldPollApplicantEvaluation } from "./applicant-evaluation-polling";
import type { ApplicantEvaluation } from "./types";

function evaluation(statusesReportStatus: string, reportStatus?: string): ApplicantEvaluation {
  return {
    statuses: { reportStatus: statusesReportStatus },
    report: reportStatus ? { status: reportStatus } : null,
  } as ApplicantEvaluation;
}

assert.equal(shouldPollApplicantEvaluation(null), false);
assert.equal(shouldPollApplicantEvaluation(evaluation("PENDING")), true);
assert.equal(shouldPollApplicantEvaluation(evaluation("GENERATING", "GENERATING")), true);
assert.equal(shouldPollApplicantEvaluation(evaluation("COMPLETED", "GENERATING")), true);
assert.equal(shouldPollApplicantEvaluation(evaluation("COMPLETED", "COMPLETED")), false);
assert.equal(shouldPollApplicantEvaluation(evaluation("FAILED", "FAILED")), false);

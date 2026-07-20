import assert from "node:assert/strict";

import { getApplicantSortQuery, getApplicantSummaryMetrics } from "./applicant-list";

assert.deepEqual(getApplicantSortQuery("recent"), { sort: "updatedAt", order: "desc" });
assert.deepEqual(getApplicantSortQuery("interviewStatus"), { sort: "interviewStatus", order: "asc" });

assert.deepEqual(
  getApplicantSummaryMetrics({
    activeTotal: 1250,
    canceledHistoryTotal: 10,
    applicationStatusCounts: { SUBMITTED: 1250 },
    documentStatusCounts: { EXTRACTED: 1250 },
    interviewStatusCounts: { COMPLETED: 875 },
    reportStatusCounts: { COMPLETED: 800 },
    screeningDecisionCounts: { UNDECIDED: 1000 },
    attentionRequiredTotal: 1000,
  }),
  { activeTotal: 1250, completedInterviews: 875, reportCompleted: 800, completionRate: 70 },
);

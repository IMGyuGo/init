import assert from "node:assert/strict";

import {
  DEFAULT_APPLICANT_SORT,
  applyScreeningDecisionCountChange,
  canEditScreeningDecision,
  getApplicantSortQuery,
  getPassMailTargetLimit,
  getApplicantSummaryMetrics,
} from "./applicant-list";

assert.equal(DEFAULT_APPLICANT_SORT, "score");
assert.deepEqual(getApplicantSortQuery(DEFAULT_APPLICANT_SORT), { sort: "score", order: "desc" });
assert.deepEqual(getApplicantSortQuery("recent"), { sort: "updatedAt", order: "desc" });
assert.deepEqual(getApplicantSortQuery("interviewStatus"), { sort: "interviewStatus", order: "asc" });
assert.deepEqual(getApplicantSortQuery("score"), { sort: "score", order: "desc" });

assert.equal(
  canEditScreeningDecision({
    autoScreeningPolicyEnabled: true,
    reportStatus: "COMPLETED",
    screeningDecision: "FAIL",
  }),
  true,
);

assert.equal(
  canEditScreeningDecision({
    autoScreeningPolicyEnabled: true,
    reportStatus: "GENERATING",
    screeningDecision: "UNDECIDED",
  }),
  false,
);

assert.equal(
  canEditScreeningDecision({
    autoScreeningPolicyEnabled: false,
    reportStatus: "PENDING",
    screeningDecision: "UNDECIDED",
  }),
  true,
);

assert.deepEqual(
  applyScreeningDecisionCountChange(
    {
      activeTotal: 100,
      canceledHistoryTotal: 0,
      applicationStatusCounts: { COMPLETED: 12 },
      documentStatusCounts: { EXTRACTED: 100 },
      interviewStatusCounts: { COMPLETED: 12 },
      reportStatusCounts: { COMPLETED: 12 },
      screeningDecisionCounts: { PASS: 10, HOLD: 4, FAIL: 2 },
      attentionRequiredTotal: 0,
    },
    "PASS",
    "FAIL",
  )?.screeningDecisionCounts,
  { PASS: 9, HOLD: 4, FAIL: 3 },
);

assert.equal(
  getPassMailTargetLimit({
    activeTotal: 100,
    canceledHistoryTotal: 0,
    applicationStatusCounts: { COMPLETED: 100 },
    documentStatusCounts: { EXTRACTED: 100 },
    interviewStatusCounts: { COMPLETED: 100 },
    reportStatusCounts: { COMPLETED: 100 },
    screeningDecisionCounts: { PASS: 10, HOLD: 30, FAIL: 7, UNDECIDED: 53 },
    attentionRequiredTotal: 0,
  }),
  17,
);

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

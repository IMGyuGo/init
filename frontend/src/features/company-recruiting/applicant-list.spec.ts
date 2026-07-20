import assert from "node:assert/strict";

import {
  applyScreeningDecisionCountChange,
  canEditScreeningDecision,
  getApplicantSortQuery,
  getPassMailTargetLimit,
  getApplicantSummaryMetrics,
} from "./applicant-list";

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
  false,
);

assert.equal(
  canEditScreeningDecision({
    autoScreeningPolicyEnabled: true,
    reportStatus: "COMPLETED",
    screeningDecision: "PASS",
    screeningResultConfirmationStatus: "CONFIRMED",
  }),
  false,
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
      effectiveScreeningDecisionCounts: { PASS: 10, HOLD: 4, FAIL: 2 },
      confirmationEligibleTotal: 16,
      confirmedTotal: 0,
      excludedTotal: 0,
      attentionRequiredTotal: 0,
    },
    "PASS",
    "FAIL",
  )?.effectiveScreeningDecisionCounts,
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
    effectiveScreeningDecisionCounts: { PASS: 10, HOLD: 30, FAIL: 7, UNDECIDED: 53 },
    confirmationEligibleTotal: 47,
    confirmedTotal: 0,
    excludedTotal: 53,
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
    effectiveScreeningDecisionCounts: { UNDECIDED: 1000 },
    confirmationEligibleTotal: 0,
    confirmedTotal: 0,
    excludedTotal: 1250,
    attentionRequiredTotal: 1000,
  }),
  { activeTotal: 1250, completedInterviews: 875, reportCompleted: 800, completionRate: 70 },
);

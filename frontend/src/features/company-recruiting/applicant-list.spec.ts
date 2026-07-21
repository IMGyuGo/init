import assert from "node:assert/strict";

import {
  DEFAULT_APPLICANT_SORT,
  applyScreeningDecisionCountChange,
  canEditScreeningDecision,
  getApplicantSortQuery,
  getPassMailTargetLimit,
  getApplicantSummaryMetrics,
  getScreeningConfirmationPreview,
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
      confirmationEligibleDecisionCounts: { PASS: 10, HOLD: 4, FAIL: 2 },
      confirmedTotal: 0,
      excludedTotal: 0,
      attentionRequiredTotal: 0,
    },
    "PASS",
    "FAIL",
  )?.effectiveScreeningDecisionCounts,
  { PASS: 9, HOLD: 4, FAIL: 3 },
);

assert.deepEqual(
  applyScreeningDecisionCountChange(
    {
      activeTotal: 16,
      canceledHistoryTotal: 0,
      applicationStatusCounts: { COMPLETED: 16 },
      documentStatusCounts: { EXTRACTED: 16 },
      interviewStatusCounts: { COMPLETED: 16 },
      reportStatusCounts: { COMPLETED: 16 },
      screeningDecisionCounts: { PASS: 10, HOLD: 4, FAIL: 2 },
      effectiveScreeningDecisionCounts: { PASS: 10, HOLD: 4, FAIL: 2 },
      confirmationEligibleTotal: 16,
      confirmationEligibleDecisionCounts: { PASS: 10, HOLD: 4, FAIL: 2 },
      confirmedTotal: 0,
      excludedTotal: 0,
      attentionRequiredTotal: 0,
    },
    "PASS",
    "FAIL",
  )?.confirmationEligibleDecisionCounts,
  { PASS: 9, HOLD: 4, FAIL: 3 },
);

assert.deepEqual(
  getScreeningConfirmationPreview({
    activeTotal: 10,
    canceledHistoryTotal: 0,
    applicationStatusCounts: { COMPLETED: 10 },
    documentStatusCounts: { EXTRACTED: 10 },
    interviewStatusCounts: { COMPLETED: 10 },
    reportStatusCounts: { COMPLETED: 10 },
    screeningDecisionCounts: { PASS: 4, HOLD: 2, FAIL: 3, RETRY: 1 },
    effectiveScreeningDecisionCounts: { PASS: 4, HOLD: 2, FAIL: 3, RETRY: 1 },
    confirmationEligibleTotal: 3,
    confirmationEligibleDecisionCounts: { PASS: 1, HOLD: 1, FAIL: 1 },
    confirmedTotal: 6,
    excludedTotal: 1,
    attentionRequiredTotal: 1,
  }),
  {
    eligibleTotal: 3,
    eligibleDecisionCounts: { PASS: 1, HOLD: 1, FAIL: 1 },
    excludedDecisionCounts: { UNDECIDED: 0, RETRY: 1 },
  },
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
    confirmationEligibleDecisionCounts: { PASS: 10, HOLD: 30, FAIL: 7 },
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
    confirmationEligibleDecisionCounts: { PASS: 0, HOLD: 0, FAIL: 0 },
    confirmedTotal: 0,
    excludedTotal: 1250,
    attentionRequiredTotal: 1000,
  }),
  { activeTotal: 1250, completedInterviews: 875, reportCompleted: 800, completionRate: 70 },
);

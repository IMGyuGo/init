export const AUTO_SCREENING_DECISION_POLICY_VERSION = "AUTO_SCREENING_DECISION_V1" as const;

export type ScreeningDecision = "UNDECIDED" | "PASS" | "HOLD" | "FAIL" | "RETRY";

export type ScreeningDecisionReasonCode =
  | "PASS_TOTAL_AND_CRITERIA_MET"
  | "HOLD_TOTAL_BAND"
  | "HOLD_CRITERION_BELOW_PASS_SCORE"
  | "FAIL_BELOW_HOLD_THRESHOLD"
  | "RETRY_REPORT_FAILED"
  | "RETRY_STT_UNAVAILABLE"
  | "RETRY_EVALUATION_INCOMPLETE"
  | "RETRY_SCORE_MISSING";

export interface AutoScreeningPolicySnapshot {
  enabled: boolean;
  passMinTotalScore: number;
  holdMinTotalScore: number;
  requireAllCriteriaPass: true;
  policyVersion: number;
  decisionPolicyVersion: typeof AUTO_SCREENING_DECISION_POLICY_VERSION;
}

export interface AutoScreeningReportSnapshot {
  reportId: number;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  totalScore: number | null;
}

export interface AutoScreeningCriterionSnapshot {
  criterionId: number;
  active: boolean;
  evaluationComplete: boolean;
  passScore: number | null;
  score: number | null;
}

export interface AutoScreeningDecisionInput {
  policy: AutoScreeningPolicySnapshot | null;
  report: AutoScreeningReportSnapshot;
  hasTerminalSttUnavailable: boolean;
  evaluationComplete: boolean;
  criteria: AutoScreeningCriterionSnapshot[];
}

export type AutoScreeningDecisionResult =
  | { decision: "UNDECIDED"; reasonCode: null }
  | {
      decision: Exclude<ScreeningDecision, "UNDECIDED">;
      reasonCode: ScreeningDecisionReasonCode;
    };

const isValidScore = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 0 && value <= 100;

export const decideAutoScreening = (
  input: AutoScreeningDecisionInput,
): AutoScreeningDecisionResult => {
  if (!input.policy?.enabled) {
    return { decision: "UNDECIDED", reasonCode: null };
  }

  if (
    input.policy.decisionPolicyVersion !== AUTO_SCREENING_DECISION_POLICY_VERSION ||
    input.policy.requireAllCriteriaPass !== true
  ) {
    throw new Error("Unsupported automatic screening policy snapshot");
  }

  if (input.report.status === "PENDING" || input.report.status === "GENERATING") {
    return { decision: "UNDECIDED", reasonCode: null };
  }

  if (input.report.status === "FAILED") {
    return { decision: "RETRY", reasonCode: "RETRY_REPORT_FAILED" };
  }

  if (input.hasTerminalSttUnavailable) {
    return { decision: "RETRY", reasonCode: "RETRY_STT_UNAVAILABLE" };
  }

  const activeCriteria = input.criteria.filter((criterion) => criterion.active);
  if (
    !input.evaluationComplete ||
    activeCriteria.some((criterion) => !criterion.evaluationComplete)
  ) {
    return { decision: "RETRY", reasonCode: "RETRY_EVALUATION_INCOMPLETE" };
  }

  if (
    !isValidScore(input.report.totalScore) ||
    activeCriteria.some(
      (criterion) => !isValidScore(criterion.passScore) || !isValidScore(criterion.score),
    )
  ) {
    return { decision: "RETRY", reasonCode: "RETRY_SCORE_MISSING" };
  }

  if (input.report.totalScore < input.policy.holdMinTotalScore) {
    return { decision: "FAIL", reasonCode: "FAIL_BELOW_HOLD_THRESHOLD" };
  }

  const allCriteriaMet = activeCriteria.every(
    (criterion) => criterion.score! >= criterion.passScore!,
  );
  if (input.report.totalScore >= input.policy.passMinTotalScore && allCriteriaMet) {
    return { decision: "PASS", reasonCode: "PASS_TOTAL_AND_CRITERIA_MET" };
  }

  if (input.report.totalScore < input.policy.passMinTotalScore) {
    return { decision: "HOLD", reasonCode: "HOLD_TOTAL_BAND" };
  }

  return { decision: "HOLD", reasonCode: "HOLD_CRITERION_BELOW_PASS_SCORE" };
};

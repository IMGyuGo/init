export const AUTO_SCREENING_DECISION_POLICY_VERSION = "AUTO_SCREENING_DECISION_V1" as const;
export const AUTO_SCREENING_DECISION_POLICY_VERSION_V1 = AUTO_SCREENING_DECISION_POLICY_VERSION;
export type AutoScreeningDecisionPolicyVersion = typeof AUTO_SCREENING_DECISION_POLICY_VERSION;

export type ScreeningDecision = "UNDECIDED" | "PASS" | "HOLD" | "FAIL" | "RETRY";

export interface AutoScreeningPolicySnapshot {
  enabled: boolean;
  passMinTotalScore: number;
  holdMinTotalScore: number;
  requireAllCriteriaPass: true;
  policyVersion: number;
  decisionPolicyVersion: AutoScreeningDecisionPolicyVersion;
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

export type AutoScreeningDecisionResult = {
  decision: ScreeningDecision;
  reasonCode: null;
};

const isValidIntegerScore = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 0 && value <= 100;

const isValidWeightedScore = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0 && value <= 100;

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
    return { decision: "RETRY", reasonCode: null };
  }

  if (input.hasTerminalSttUnavailable) {
    return { decision: "RETRY", reasonCode: null };
  }

  const activeCriteria = input.criteria.filter((criterion) => criterion.active);
  if (
    !input.evaluationComplete ||
    activeCriteria.some((criterion) => !criterion.evaluationComplete)
  ) {
    return { decision: "RETRY", reasonCode: null };
  }

  if (
    !isValidIntegerScore(input.report.totalScore) ||
    activeCriteria.some(
      (criterion) =>
        !isValidIntegerScore(criterion.passScore) ||
        !isValidWeightedScore(criterion.score),
    )
  ) {
    return { decision: "RETRY", reasonCode: null };
  }

  const allCriteriaMet = activeCriteria.every(
    (criterion) => criterion.score! >= criterion.passScore!,
  );
  if (!allCriteriaMet) {
    return { decision: "FAIL", reasonCode: null };
  }
  if (input.report.totalScore < input.policy.passMinTotalScore) {
    return { decision: "HOLD", reasonCode: null };
  }
  return { decision: "PASS", reasonCode: null };
};
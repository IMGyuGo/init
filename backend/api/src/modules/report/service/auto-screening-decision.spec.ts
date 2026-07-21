import { decideAutoScreening } from "./auto-screening-decision";

const policy = {
  enabled: true,
  passMinTotalScore: 80,
  holdMinTotalScore: 50,
  requireAllCriteriaPass: true as const,
  policyVersion: 1,
  decisionPolicyVersion: "AUTO_SCREENING_DECISION_V1" as const,
};

const criteria = [
  { active: true, score: 82, passScore: 70, evaluationComplete: true },
  { active: true, score: 75, passScore: 70, evaluationComplete: true },
];

describe("Saltlux synchronous automatic screening decision", () => {
  it.each([
    [85, 80, 50, "PASS", "PASS_TOTAL_AND_CRITERIA_MET"],
    [85, 80, 80, "PASS", "PASS_TOTAL_AND_CRITERIA_MET"],
    [85, 90, 50, "HOLD", "HOLD_TOTAL_BAND"],
    [85, 90, 90, "FAIL", "FAIL_BELOW_HOLD_THRESHOLD"],
    [49, 80, 50, "FAIL", "FAIL_BELOW_HOLD_THRESHOLD"],
  ] as const)(
    "maps score %i with pass %i and hold %i to %s",
    (totalScore, passMinTotalScore, holdMinTotalScore, decision, reasonCode) => {
      expect(decideAutoScreening({
        policy: { ...policy, passMinTotalScore, holdMinTotalScore },
        report: { status: "COMPLETED", totalScore },
        hasTerminalSttUnavailable: false,
        evaluationComplete: true,
        criteria,
      })).toEqual({ decision, reasonCode });
    },
  );

  it("uses RETRY instead of FAIL when a required score is missing", () => {
    expect(decideAutoScreening({
      policy,
      report: { status: "COMPLETED", totalScore: null },
      hasTerminalSttUnavailable: false,
      evaluationComplete: true,
      criteria,
    })).toEqual({ decision: "RETRY", reasonCode: "RETRY_SCORE_MISSING" });
  });

  it("holds a pass-band total when an active criterion misses its threshold", () => {
    expect(decideAutoScreening({
      policy,
      report: { status: "COMPLETED", totalScore: 85 },
      hasTerminalSttUnavailable: false,
      evaluationComplete: true,
      criteria: [{ active: true, score: 69, passScore: 70, evaluationComplete: true }],
    })).toEqual({ decision: "HOLD", reasonCode: "HOLD_CRITERION_BELOW_PASS_SCORE" });
  });
});

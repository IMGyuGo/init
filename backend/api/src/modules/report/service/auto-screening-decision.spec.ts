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
    [85, 80, 50, "PASS", null],
    [85, 80, 80, "PASS", null],
    [85, 90, 50, "HOLD", null],
    [85, 90, 90, "HOLD", null],
    [49, 80, 50, "HOLD", null],
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
    })).toEqual({ decision: "RETRY", reasonCode: null });
  });

  it("fails when an active criterion misses its threshold", () => {
    expect(decideAutoScreening({
      policy,
      report: { status: "COMPLETED", totalScore: 85 },
      hasTerminalSttUnavailable: false,
      evaluationComplete: true,
      criteria: [{ active: true, score: 69, passScore: 70, evaluationComplete: true }],
    })).toEqual({ decision: "FAIL", reasonCode: null });
  });
});
describe("NCS automatic screening decision", () => {
  const policyWithWeightedCutoffs = {
    enabled: true,
    passMinTotalScore: 80,
    holdMinTotalScore: 0,
    requireAllCriteriaPass: true as const,
    policyVersion: 1,
    decisionPolicyVersion: "AUTO_SCREENING_DECISION_V1" as const,
  };

  it("fails an applicant when a weighted competency score is below its cutoff", () => {
    expect(decideAutoScreening({
      policy: policyWithWeightedCutoffs,
      report: { status: "COMPLETED", totalScore: 90 },
      hasTerminalSttUnavailable: false,
      evaluationComplete: true,
      criteria: [
        { active: true, score: 24, passScore: 25, evaluationComplete: true },
        { active: true, score: 35, passScore: 35, evaluationComplete: true },
      ],
    })).toEqual({ decision: "FAIL", reasonCode: null });
  });

  it("holds an applicant only when competency cutoffs pass and the total cutoff is missed", () => {
    expect(decideAutoScreening({
      policy: policyWithWeightedCutoffs,
      report: { status: "COMPLETED", totalScore: 79 },
      hasTerminalSttUnavailable: false,
      evaluationComplete: true,
      criteria: [
        { active: true, score: 25, passScore: 25, evaluationComplete: true },
        { active: true, score: 35, passScore: 35, evaluationComplete: true },
      ],
    })).toEqual({ decision: "HOLD", reasonCode: null });
  });
});

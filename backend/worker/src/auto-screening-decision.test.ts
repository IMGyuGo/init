import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  AUTO_SCREENING_DECISION_POLICY_VERSION,
  decideAutoScreening,
  type AutoScreeningDecisionInput,
} from "./auto-screening-decision";

const completeInput = (
  overrides: Partial<AutoScreeningDecisionInput> = {},
): AutoScreeningDecisionInput => ({
  policy: {
    enabled: true,
    passMinTotalScore: 70,
    holdMinTotalScore: 50,
    requireAllCriteriaPass: true,
    policyVersion: 3,
    decisionPolicyVersion: AUTO_SCREENING_DECISION_POLICY_VERSION,
  },
  report: {
    reportId: 41,
    status: "COMPLETED",
    totalScore: 70,
  },
  hasTerminalSttUnavailable: false,
  evaluationComplete: true,
  criteria: [
    { criterionId: 1, active: true, evaluationComplete: true, passScore: 60, score: 60 },
    { criterionId: 2, active: true, evaluationComplete: true, passScore: 65, score: 80 },
  ],
  ...overrides,
});

describe("AUTO_SCREENING_DECISION_V1", () => {
  it("keeps UNDECIDED when the policy is missing or disabled before inspecting report failures", () => {
    const failedReport = { reportId: 41, status: "FAILED" as const, totalScore: null };

    assert.deepEqual(
      decideAutoScreening(completeInput({ policy: null, report: failedReport })),
      { decision: "UNDECIDED", reasonCode: null },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          policy: { ...completeInput().policy!, enabled: false },
          report: failedReport,
        }),
      ),
      { decision: "UNDECIDED", reasonCode: null },
    );
  });

  it("keeps UNDECIDED while the report is pending or generating", () => {
    for (const status of ["PENDING", "GENERATING"] as const) {
      assert.deepEqual(
        decideAutoScreening(
          completeInput({
            report: { reportId: 41, status, totalScore: null },
            hasTerminalSttUnavailable: true,
          }),
        ),
        { decision: "UNDECIDED", reasonCode: null },
      );
    }
  });

  it("applies RETRY reasons in the required priority order", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          report: { reportId: 41, status: "FAILED", totalScore: null },
          hasTerminalSttUnavailable: true,
          evaluationComplete: false,
        }),
      ),
      { decision: "RETRY", reasonCode: "RETRY_REPORT_FAILED" },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ hasTerminalSttUnavailable: true, evaluationComplete: false }),
      ),
      { decision: "RETRY", reasonCode: "RETRY_STT_UNAVAILABLE" },
    );
    assert.deepEqual(
      decideAutoScreening(completeInput({ evaluationComplete: false })),
      { decision: "RETRY", reasonCode: "RETRY_EVALUATION_INCOMPLETE" },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          criteria: [
            {
              criterionId: 1,
              active: true,
              evaluationComplete: false,
              passScore: 60,
              score: null,
            },
          ],
        }),
      ),
      { decision: "RETRY", reasonCode: "RETRY_EVALUATION_INCOMPLETE" },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ report: { reportId: 41, status: "COMPLETED", totalScore: null } }),
      ),
      { decision: "RETRY", reasonCode: "RETRY_SCORE_MISSING" },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          criteria: [
            {
              criterionId: 1,
              active: true,
              evaluationComplete: true,
              passScore: 60,
              score: null,
            },
          ],
        }),
      ),
      { decision: "RETRY", reasonCode: "RETRY_SCORE_MISSING" },
    );
  });

  it("uses exact total-score boundaries", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ report: { reportId: 41, status: "COMPLETED", totalScore: 49 } }),
      ),
      { decision: "FAIL", reasonCode: "FAIL_BELOW_HOLD_THRESHOLD" },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ report: { reportId: 41, status: "COMPLETED", totalScore: 50 } }),
      ),
      { decision: "HOLD", reasonCode: "HOLD_TOTAL_BAND" },
    );
    assert.deepEqual(decideAutoScreening(completeInput()), {
      decision: "PASS",
      reasonCode: "PASS_TOTAL_AND_CRITERIA_MET",
    });
  });

  it("holds a pass-band total when any active criterion is below its pass score", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          criteria: [
            { criterionId: 1, active: true, evaluationComplete: true, passScore: 61, score: 60 },
            { criterionId: 2, active: false, evaluationComplete: false, passScore: null, score: null },
          ],
        }),
      ),
      { decision: "HOLD", reasonCode: "HOLD_CRITERION_BELOW_PASS_SCORE" },
    );
  });
});

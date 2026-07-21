import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  AUTO_SCREENING_DECISION_POLICY_VERSION_V1,
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
    decisionPolicyVersion: AUTO_SCREENING_DECISION_POLICY_VERSION_V1,
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

  it("returns RETRY in the required priority order", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          report: { reportId: 41, status: "FAILED", totalScore: null },
          hasTerminalSttUnavailable: true,
          evaluationComplete: false,
        }),
      ),
      { decision: "RETRY", reasonCode: null },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ hasTerminalSttUnavailable: true, evaluationComplete: false }),
      ),
      { decision: "RETRY", reasonCode: null },
    );
    assert.deepEqual(
      decideAutoScreening(completeInput({ evaluationComplete: false })),
      { decision: "RETRY", reasonCode: null },
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
      { decision: "RETRY", reasonCode: null },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ report: { reportId: 41, status: "COMPLETED", totalScore: null } }),
      ),
      { decision: "RETRY", reasonCode: null },
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
      { decision: "RETRY", reasonCode: null },
    );
  });

  it("uses exact total-score boundaries", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ report: { reportId: 41, status: "COMPLETED", totalScore: 49 } }),
      ),
      { decision: "HOLD", reasonCode: null },
    );
    assert.deepEqual(
      decideAutoScreening(
        completeInput({ report: { reportId: 41, status: "COMPLETED", totalScore: 50 } }),
      ),
      { decision: "HOLD", reasonCode: null },
    );
    assert.deepEqual(decideAutoScreening(completeInput()), {
      decision: "PASS",
      reasonCode: null,
    });
  });

  it("fails when any active criterion is below its pass score", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          criteria: [
            { criterionId: 1, active: true, evaluationComplete: true, passScore: 61, score: 60 },
            { criterionId: 2, active: false, evaluationComplete: false, passScore: null, score: null },
          ],
        }),
      ),
      { decision: "FAIL", reasonCode: null },
    );
  });
});

describe("automatic screening cutoff rules", () => {
  const v2Policy = {
    enabled: true,
    passMinTotalScore: 80,
    holdMinTotalScore: 0,
    requireAllCriteriaPass: true as const,
    policyVersion: 1,
    decisionPolicyVersion: "AUTO_SCREENING_DECISION_V1" as const,
  };

  it("fails when any weighted competency score is below its cutoff", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          policy: v2Policy,
          report: { reportId: 41, status: "COMPLETED", totalScore: 90 },
          criteria: [
            { criterionId: 1, active: true, evaluationComplete: true, passScore: 25, score: 24 },
            { criterionId: 2, active: true, evaluationComplete: true, passScore: 25, score: 29 },
          ],
        }),
      ),
      { decision: "FAIL", reasonCode: null },
    );
  });

  it("holds only when every competency cutoff is met but the total cutoff is missed", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          policy: v2Policy,
          report: { reportId: 41, status: "COMPLETED", totalScore: 79 },
          criteria: [
            { criterionId: 1, active: true, evaluationComplete: true, passScore: 25, score: 25 },
            { criterionId: 2, active: true, evaluationComplete: true, passScore: 30, score: 30 },
          ],
        }),
      ),
      { decision: "HOLD", reasonCode: null },
    );
  });

  it("accepts decimal weighted competency scores", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          policy: v2Policy,
          report: { reportId: 41, status: "COMPLETED", totalScore: 80 },
          criteria: [
            { criterionId: 1, active: true, evaluationComplete: true, passScore: 24, score: 24.6 },
            { criterionId: 2, active: true, evaluationComplete: true, passScore: 30, score: 30.4 },
          ],
        }),
      ),
      { decision: "PASS", reasonCode: null },
    );
  });
  it("passes when every competency cutoff and the total cutoff are met", () => {
    assert.deepEqual(
      decideAutoScreening(
        completeInput({
          policy: v2Policy,
          report: { reportId: 41, status: "COMPLETED", totalScore: 80 },
          criteria: [
            { criterionId: 1, active: true, evaluationComplete: true, passScore: 25, score: 25 },
            { criterionId: 2, active: true, evaluationComplete: true, passScore: 30, score: 30 },
          ],
        }),
      ),
      { decision: "PASS", reasonCode: null },
    );
  });
});

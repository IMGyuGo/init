import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateNcsFinalEvaluation,
  type NcsEvaluationForAggregation,
  type NcsSessionPolicyInput,
} from "./ncs-final-evaluation";

const policies: NcsSessionPolicyInput[] = [
  policy("JOB_TECHNICAL", 30),
  policy("COLLABORATION_COMMUNICATION", 30),
  policy("PROBLEM_SOLVING", 40),
];

test("aggregateNcsFinalEvaluation returns weighted PASS for three complete profiles", () => {
  const result = aggregateNcsFinalEvaluation(policies, [
    scored(1, 101, "JOB_TECHNICAL", 5),
    scored(2, 102, "JOB_TECHNICAL", 4),
    scored(3, 103, "COLLABORATION_COMMUNICATION", 4),
    scored(4, 104, "COLLABORATION_COMMUNICATION", 4),
    scored(5, 105, "PROBLEM_SOLVING", 4),
    scored(6, 106, "PROBLEM_SOLVING", 4),
  ]);

  assert.equal(result.completionStatus, "COMPLETE");
  assert.equal(result.totalScore, 83);
  assert.equal(result.thresholdResult, "MEETS_THRESHOLD");
  assert.equal(result.aiDecision, "PASS");
  assert.deepEqual(result.profiles.map((profile) => profile.weightedScore), [27, 24, 32]);
});

test("aggregateNcsFinalEvaluation fails when one profile is below its minimum", () => {
  const result = aggregateNcsFinalEvaluation(policies, [
    scored(1, 101, "JOB_TECHNICAL", 5),
    scored(2, 102, "JOB_TECHNICAL", 5),
    scored(3, 103, "COLLABORATION_COMMUNICATION", 5),
    scored(4, 104, "COLLABORATION_COMMUNICATION", 5),
    scored(5, 105, "PROBLEM_SOLVING", 2),
    scored(6, 106, "PROBLEM_SOLVING", 2),
  ]);

  assert.equal(result.completionStatus, "COMPLETE");
  assert.equal(result.thresholdResult, "BELOW_THRESHOLD");
  assert.equal(result.aiDecision, "FAIL");
  assert.equal(result.decisionReasonCode, "PROFILE_SCORE_BELOW_THRESHOLD");
  assert.equal(result.totalScore, 76);
});

test("aggregateNcsFinalEvaluation keeps incomplete scores null and fails closed", () => {
  const result = aggregateNcsFinalEvaluation(policies, [
    scored(1, 101, "JOB_TECHNICAL", 5),
    scored(2, 102, "JOB_TECHNICAL", 4),
    scored(3, 103, "COLLABORATION_COMMUNICATION", 4),
    { ...scored(4, 104, "COLLABORATION_COMMUNICATION", 4), scoreStatus: "INSUFFICIENT_INPUT", effectiveScore: null, evidenceCount: 0 },
    scored(5, 105, "PROBLEM_SOLVING", 4),
    scored(6, 106, "PROBLEM_SOLVING", 4),
  ]);

  assert.equal(result.completionStatus, "INCOMPLETE");
  assert.equal(result.thresholdResult, "INCOMPLETE");
  assert.equal(result.aiDecision, "FAIL");
  assert.equal(result.decisionReasonCode, "EVALUATION_INCOMPLETE");
  assert.equal(result.totalScore, null);
  assert.equal(result.profiles[1]?.averageScore, null);
  assert.equal(result.incompleteReasons.some((reason) => reason.code === "INSUFFICIENT_INPUT"), true);
});

test("aggregateNcsFinalEvaluation rejects a missing profile policy and invalid total weight", () => {
  const result = aggregateNcsFinalEvaluation(policies.slice(0, 2), []);

  assert.equal(result.completionStatus, "INCOMPLETE");
  assert.equal(result.totalScore, null);
  assert.equal(result.incompleteReasons.some((reason) => reason.code === "SESSION_SNAPSHOT_MISSING"), true);
});

function policy(ncsProfileId: NcsSessionPolicyInput["ncsProfileId"], weight: number): NcsSessionPolicyInput {
  return {
    ncsProfileId,
    criterionId: weight,
    criterionTitleSnapshot: ncsProfileId,
    weight,
    minimumAverageScore: 3,
    requiredQuestionCount: 2,
    ncsProfileVersion: "2025.12-v1",
  };
}

function scored(
  answerId: number,
  sessionQuestionId: number,
  ncsProfileId: NcsEvaluationForAggregation["ncsProfileId"],
  effectiveScore: number,
): NcsEvaluationForAggregation {
  return {
    answerId,
    sessionQuestionId,
    ncsProfileId,
    scoreStatus: "SCORED",
    effectiveScore,
    evidenceCount: 1,
  };
}

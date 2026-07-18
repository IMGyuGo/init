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

test("V2 emits only active profiles and accepts one scored question per active profile", () => {
  const activePolicies = [
    { ...policy("JOB_TECHNICAL", 60), requiredQuestionCount: 1 },
    { ...policy("PROBLEM_SOLVING", 40), requiredQuestionCount: 1 },
  ];
  const result = aggregateNcsFinalEvaluation(
    activePolicies,
    [
      scored(1, 201, "JOB_TECHNICAL", 5),
      scored(1, 201, "PROBLEM_SOLVING", 4),
    ],
    [],
    "NCS_RECRUITING_SCORING_V2",
  );

  assert.equal(result.scoringVersion, "NCS_RECRUITING_SCORING_V2");
  assert.equal(result.completionStatus, "COMPLETE");
  assert.deepEqual(result.profiles.map((profile) => profile.ncsProfileId), [
    "JOB_TECHNICAL",
    "PROBLEM_SOLVING",
  ]);
  assert.equal(result.profiles.some((profile) => profile.ncsProfileId === "COLLABORATION_COMMUNICATION"), false);
});

test("V2 supports one and three active profile snapshots", () => {
  for (const activePolicies of [
    [{ ...policy("JOB_TECHNICAL", 100), requiredQuestionCount: 1 }],
    [
      { ...policy("JOB_TECHNICAL", 30), requiredQuestionCount: 1 },
      { ...policy("COLLABORATION_COMMUNICATION", 30), requiredQuestionCount: 1 },
      { ...policy("PROBLEM_SOLVING", 40), requiredQuestionCount: 1 },
    ],
  ]) {
    const result = aggregateNcsFinalEvaluation(
      activePolicies,
      activePolicies.map((item, index) => scored(index + 20, index + 220, item.ncsProfileId, 5)),
      [],
      "NCS_RECRUITING_SCORING_V2",
    );
    assert.equal(result.completionStatus, "COMPLETE");
    assert.equal(result.profiles.length, activePolicies.length);
  }
});

test("V2 keeps an incomplete active profile total null", () => {
  const result = aggregateNcsFinalEvaluation(
    [{ ...policy("JOB_TECHNICAL", 100), requiredQuestionCount: 1 }],
    [],
    [],
    "NCS_RECRUITING_SCORING_V2",
  );
  assert.equal(result.completionStatus, "INCOMPLETE");
  assert.equal(result.totalScore, null);
  assert.equal(result.aiDecision, "FAIL");
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

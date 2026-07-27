const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateDemoFollowUpBindingInheritance,
  validateDemoPresetQuestions,
  validateNcsProfileWeights,
  validateNcsQuestionBindings,
  validateNcsQuestionCoverage,
  validateStandardQuestionCounts,
} = require("../dist/validation");

const allActive = [
  { ncsProfileId: "JOB_TECHNICAL", weight: 30 },
  { ncsProfileId: "COLLABORATION_COMMUNICATION", weight: 30 },
  { ncsProfileId: "PROBLEM_SOLVING", weight: 40 },
];

test("V1 remains exact-three with two BASE questions per profile", () => {
  assert.deepEqual(validateNcsProfileWeights("NCS_3_PROFILE_V1", allActive), []);
  const questions = [
    ["JOB_TECHNICAL", "PROBLEM_SOLVING"],
    ["COLLABORATION_COMMUNICATION"],
    ["JOB_TECHNICAL", "COLLABORATION_COMMUNICATION"],
    ["PROBLEM_SOLVING"],
  ].map((ncsProfileIds) => ({
    kind: "BASE",
    isScoring: true,
    source: "JD_CRITERIA",
    usageScope: "STANDARD",
    ncsProfileIds,
  }));
  assert.deepEqual(validateNcsQuestionCoverage("NCS_3_PROFILE_V1", allActive, questions), []);
  assert.equal(
    validateNcsQuestionCoverage("NCS_3_PROFILE_V1", allActive, questions.slice(0, 3))
      .some((issue) => issue.code === "QUESTION_COVERAGE_INVALID"),
    true,
  );
});

test("V2 accepts one active profile and excludes follow-up from coverage", () => {
  const criteria = [
    { ncsProfileId: "JOB_TECHNICAL", weight: 100 },
    { ncsProfileId: "COLLABORATION_COMMUNICATION", weight: 0 },
    { ncsProfileId: "PROBLEM_SOLVING", weight: 0 },
  ];
  assert.deepEqual(validateNcsProfileWeights("NCS_ACTIVE_PROFILE_V2", criteria), []);
  const followUpOnly = [{
    kind: "FOLLOW_UP",
    isScoring: true,
    source: "RESUME_PERSONALIZED",
    usageScope: "STANDARD",
    ncsProfileIds: ["JOB_TECHNICAL"],
  }];
  assert.equal(validateNcsQuestionCoverage("NCS_ACTIVE_PROFILE_V2", criteria, followUpOnly)[0].code, "QUESTION_COVERAGE_INVALID");
  const base = [{ ...followUpOnly[0], kind: "BASE" }];
  assert.deepEqual(validateNcsQuestionCoverage("NCS_ACTIVE_PROFILE_V2", criteria, base), []);
  assert.equal(
    validateNcsQuestionCoverage("NCS_ACTIVE_PROFILE_V2", criteria, [{ ...base[0], usageScope: "DEMO_PRESET" }])[0].code,
    "QUESTION_COVERAGE_INVALID",
  );
});

test("V2 accepts exactly one, two or three active canonical profiles", () => {
  const cases = [
    [100, 0, 0],
    [60, 40, 0],
    [30, 30, 40],
  ];
  for (const weights of cases) {
    assert.deepEqual(
      validateNcsProfileWeights("NCS_ACTIVE_PROFILE_V2", allActive.map((criterion, index) => ({
        ...criterion,
        weight: weights[index],
      }))),
      [],
    );
  }
});

test("weights, canonical profiles and question bindings fail closed", () => {
  assert.equal(
    validateNcsProfileWeights("NCS_ACTIVE_PROFILE_V2", [
      { ncsProfileId: "JOB_TECHNICAL", weight: 50 },
      { ncsProfileId: "JOB_TECHNICAL", weight: 50 },
    ]).some((issue) => issue.code === "CANONICAL_PROFILE_CONFIGURATION_INVALID"),
    true,
  );
  assert.equal(validateNcsQuestionBindings([])[0].code, "QUESTION_BINDING_CARDINALITY_INVALID");
  assert.equal(validateNcsQuestionBindings(["DIGITAL"])[0].code, "QUESTION_BINDING_PROFILE_INVALID");
  assert.equal(validateNcsQuestionBindings(["JOB_TECHNICAL", "JOB_TECHNICAL"])[0].code, "QUESTION_BINDING_DUPLICATE");
  assert.equal(validateNcsQuestionBindings(["JOB_TECHNICAL"], ["PROBLEM_SOLVING"])[0].code, "INACTIVE_PROFILE_BOUND");
  assert.equal(
    validateNcsQuestionBindings(["JOB_TECHNICAL", "COLLABORATION_COMMUNICATION", "PROBLEM_SOLVING"])[0].code,
    "QUESTION_BINDING_CARDINALITY_INVALID",
  );
});

test("V2 STANDARD counts and demo preset shape are deterministic", () => {
  assert.deepEqual(validateStandardQuestionCounts("NCS_ACTIVE_PROFILE_V2", 3, 1), []);
  assert.equal(validateStandardQuestionCounts("NCS_ACTIVE_PROFILE_V2", 2, 0).length, 2);
  assert.deepEqual(
    validateDemoPresetQuestions(
      allActive,
      { usageScope: "STANDARD", ncsProfileIds: ["COLLABORATION_COMMUNICATION"] },
      { usageScope: "DEMO_PRESET", ncsProfileIds: ["PROBLEM_SOLVING", "JOB_TECHNICAL"] },
    ),
    [],
  );
  assert.equal(
    validateDemoPresetQuestions(
      allActive.map((criterion) => ({ ...criterion, weight: 100 })),
      { usageScope: "STANDARD", ncsProfileIds: ["COLLABORATION_COMMUNICATION"] },
      { usageScope: "DEMO_PRESET", ncsProfileIds: ["JOB_TECHNICAL", "PROBLEM_SOLVING"] },
    ).some((issue) => issue.code === "WEIGHT_SUM_INVALID"),
    true,
  );
  assert.deepEqual(
    validateDemoFollowUpBindingInheritance(
      ["JOB_TECHNICAL", "PROBLEM_SOLVING"],
      ["PROBLEM_SOLVING", "JOB_TECHNICAL"],
    ),
    [],
  );
  assert.equal(
    validateDemoFollowUpBindingInheritance(["JOB_TECHNICAL", "PROBLEM_SOLVING"], ["JOB_TECHNICAL"])[0].code,
    "DEMO_FOLLOW_UP_BINDING_INVALID",
  );
});

import { strict as assert } from "node:assert";

import {
  buildAutoApplyQuestionPlan,
  buildCommonQuestionSetPlan,
  findStaleGeneratedQuestionIds,
} from "./question-set-workflow";
import type { InterviewSettings, NcsProfileId } from "./types";

const profiles: NcsProfileId[] = ["JOB_TECHNICAL", "COLLABORATION_COMMUNICATION", "PROBLEM_SOLVING"];

function createSettings(): InterviewSettings {
  const criteria = profiles.map((ncsProfileId, index) => ({
    criterionId: index + 1,
    tagId: index + 1,
    tagName: ncsProfileId,
    category: "NCS",
    description: null,
    weight: index === 0 ? 30 : 35,
    passScore: null,
    sortOrder: index + 1,
    ncsProfileId,
    ncsQuestionMode: "EXPERIENCE_BEHAVIOR" as const,
    ncsProfileVersion: "2025.12-v1",
    isActive: true,
  }));
  const questions = criteria.flatMap((criterion, criterionIndex) =>
    [0, 1].map((questionIndex) => ({
      questionId: criterionIndex * 2 + questionIndex + 1,
      criterionId: criterion.criterionId,
      questionType: "EXPERIENCE" as const,
      content: `${criterion.tagName} 질문 ${questionIndex + 1}`,
      origin: "AI_GENERATED" as const,
      isAiEdited: false,
      isActive: true,
      usageScope: "STANDARD" as const,
      generationSource: "JD_CRITERIA" as const,
      ncsProfileId: criterion.ncsProfileId,
      ncsQuestionMode: criterion.ncsQuestionMode,
      ncsProfileVersion: criterion.ncsProfileVersion,
      alignmentStatus: "ALIGNED" as const,
      alignmentScore: 0.9,
      alignmentReason: "aligned",
      evaluatorVersion: "ncs-question-alignment-v1",
      sourceProcessLogId: 100,
      ncsBindings: [{
        criterionId: criterion.criterionId,
        ncsProfileId: criterion.ncsProfileId,
        ncsProfileVersion: criterion.ncsProfileVersion,
        alignmentStatus: "ALIGNED" as const,
        alignmentScore: 0.9,
        alignmentReason: "aligned",
        evaluatorVersion: "ncs-question-alignment-v1",
        bindingOrder: 1,
      }],
    })),
  );

  return {
    posting: { postingId: 1, title: "NCS 채용", status: "OPEN" },
    availableTags: [],
    criteria,
    questions,
    timePolicy: { preparationTimeSec: 0, answerTimeSec: 90, retryAllowed: false },
    evaluationFramework: "NCS_3_PROFILE_V1",
    questionGenerationPolicy: {
      postingId: 1,
      jdCriteriaQuestionCount: 6,
      resumeQuestionCount: 2,
      policyVersion: 1,
      criteriaVersion: 1,
      allocations: [],
      activeProfileCoverage: [],
      questionSetRequiresReconfirmation: false,
    },
    configurationLocked: false,
    configurationLockedReason: null,
    questionImpactByProfile: [],
    questionSetRequiresReconfirmation: false,
  };
}

function testBuildsAllSixQuestionsInsteadOfOnePerCriterion() {
  const plan = buildCommonQuestionSetPlan(createSettings(), 6);
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.items.map((item) => item.questionId), [1, 2, 3, 4, 5, 6]);
  assert.equal(plan.sourceProcessLogId, 100);
}

function testRejectsIncompleteProfileCoverage() {
  const settings = createSettings();
  settings.questions[5] = { ...settings.questions[5], isActive: false };
  const plan = buildCommonQuestionSetPlan(settings, 5);
  assert.equal(plan.items.length, 0);
  assert.match(plan.error ?? "", /최소 2개/);
}

function testPlansOnlyNewAlignedCandidates() {
  const settings = createSettings();
  const plan = buildAutoApplyQuestionPlan(settings, [
    {
      content: settings.questions[0].content,
      category: "NCS",
      difficulty: "MEDIUM",
      criterionId: 1,
      expectedKeywords: [],
      suggestionReason: "duplicate",
      alignmentStatus: "ALIGNED",
    },
    {
      content: "새로운 기술 질문입니다.",
      category: "NCS",
      difficulty: "MEDIUM",
      criterionId: 1,
      expectedKeywords: [],
      suggestionReason: "new",
      alignmentStatus: "ALIGNED",
    },
    {
      content: "정렬되지 않은 질문입니다.",
      category: "NCS",
      difficulty: "MEDIUM",
      criterionId: 1,
      expectedKeywords: [],
      suggestionReason: "rejected",
      alignmentStatus: "LOW_ALIGNMENT",
    },
  ]);

  assert.equal(plan.alreadySavedCount, 1);
  assert.equal(plan.rejectedCount, 1);
  assert.deepEqual(plan.applicable.map((item) => item.criterionId), [1]);
}

function testV2RequiresCoverageOnlyForActiveProfiles() {
  const settings = createSettings();
  settings.evaluationFramework = "NCS_ACTIVE_PROFILE_V2";
  settings.criteria[1] = { ...settings.criteria[1], weight: 0, isActive: false };
  settings.questions = [settings.questions[0], settings.questions[4]];
  settings.questionGenerationPolicy.jdCriteriaQuestionCount = 2;

  const plan = buildCommonQuestionSetPlan(settings, 2);
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.items.map((item) => item.questionId), [1, 5]);
}

function testFindsOnlyOldGeneratedQuestionsMissingFromNewBatch() {
  const settings = createSettings();
  settings.questions.push({
    ...settings.questions[0],
    questionId: 7,
    content: "기업 면접관이 직접 작성한 질문",
    origin: "MANUAL",
    sourceProcessLogId: null,
  });

  const staleIds = findStaleGeneratedQuestionIds(settings, [
    {
      content: settings.questions[0].content,
      category: "NCS",
      difficulty: "MEDIUM",
      criterionId: 1,
      expectedKeywords: [],
      suggestionReason: "kept",
      alignmentStatus: "ALIGNED",
    },
  ], 200);

  assert.deepEqual(staleIds, [2, 3, 4, 5, 6]);
}

testBuildsAllSixQuestionsInsteadOfOnePerCriterion();
testRejectsIncompleteProfileCoverage();
testPlansOnlyNewAlignedCandidates();
testV2RequiresCoverageOnlyForActiveProfiles();
testFindsOnlyOldGeneratedQuestionsMissingFromNewBatch();

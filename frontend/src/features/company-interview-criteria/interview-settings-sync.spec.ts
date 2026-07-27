import { strict as assert } from "node:assert";

import {
  reconcileSettingsAfterCriteriaSave,
  reconcileSettingsAfterQuestionSetConfirm,
} from "./interview-settings-sync";
import type { InterviewSettings } from "./types";

const oldCriterion = {
  criterionId: 141,
  tagId: 1,
  tagName: "직무 적합성",
  category: "서비스 기본 평가",
  description: null,
  weight: 100,
  passScore: null,
  sortOrder: 1,
  ncsProfileId: null,
  ncsQuestionMode: null,
  ncsProfileVersion: null,
  isActive: true,
};

const newCriterion = {
  ...oldCriterion,
  criterionId: 207,
};

function createSettings(): InterviewSettings {
  return {
    posting: {
      postingId: 15,
      title: "프론트엔드 개발자",
      status: "OPEN",
    },
    availableTags: [],
    criteria: [oldCriterion],
    questions: [
      {
        questionId: 1,
        criterionId: oldCriterion.criterionId,
        questionType: "EXPERIENCE",
        content: "기존 평가 기준에 연결된 질문",
        origin: "AI_GENERATED",
        isAiEdited: false,
        isActive: true,
        usageScope: "STANDARD",
        generationSource: null,
        ncsProfileId: null,
        ncsQuestionMode: null,
        ncsProfileVersion: null,
        alignmentStatus: null,
        alignmentScore: null,
        alignmentReason: null,
        evaluatorVersion: null,
        sourceProcessLogId: null,
        ncsBindings: [],
      },
      {
        questionId: 2,
        criterionId: null,
        questionType: "INTRO",
        content: "평가 기준에 연결되지 않은 질문",
        origin: "MANUAL",
        isAiEdited: false,
        isActive: true,
        usageScope: "STANDARD",
        generationSource: null,
        ncsProfileId: null,
        ncsQuestionMode: null,
        ncsProfileVersion: null,
        alignmentStatus: null,
        alignmentScore: null,
        alignmentReason: null,
        evaluatorVersion: null,
        sourceProcessLogId: null,
        ncsBindings: [],
      },
    ],
    timePolicy: {
      preparationTimeSec: 30,
      answerTimeSec: 120,
      retryAllowed: false,
    },
    evaluationFramework: "LEGACY",
    questionGenerationPolicy: {
      postingId: 15,
      jdCriteriaQuestionCount: 0,
      resumeQuestionCount: 0,
      policyVersion: 0,
      criteriaVersion: 0,
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

function testRemovesQuestionsLinkedToReplacedCriteria() {
  const current = createSettings();

  const result = reconcileSettingsAfterCriteriaSave(current, [newCriterion]);

  assert.deepEqual(result.criteria, [newCriterion]);
  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    [2],
  );
}

function testKeepsQuestionsLinkedToRetainedCriteria() {
  const current = createSettings();

  const result = reconcileSettingsAfterCriteriaSave(current, [oldCriterion]);

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    [1, 2],
  );
}

function testDoesNotMutateCurrentSettings() {
  const current = createSettings();
  const original = structuredClone(current);

  reconcileSettingsAfterCriteriaSave(current, [newCriterion]);

  assert.deepEqual(current, original);
}

function testClearsQuestionSetReconfirmationAfterConfirm() {
  const current = createSettings();
  current.questionGenerationPolicy.questionSetRequiresReconfirmation = true;
  current.questionSetRequiresReconfirmation = true;

  const result = reconcileSettingsAfterQuestionSetConfirm(current);

  assert.equal(result.questionGenerationPolicy.questionSetRequiresReconfirmation, false);
  assert.equal(result.questionSetRequiresReconfirmation, false);
  assert.equal(current.questionGenerationPolicy.questionSetRequiresReconfirmation, true);
  assert.equal(current.questionSetRequiresReconfirmation, true);
}

testRemovesQuestionsLinkedToReplacedCriteria();
testKeepsQuestionsLinkedToRetainedCriteria();
testDoesNotMutateCurrentSettings();
testClearsQuestionSetReconfirmationAfterConfirm();

console.log("interview-settings-sync.spec: all assertions passed");

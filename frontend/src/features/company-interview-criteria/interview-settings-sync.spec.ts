import { strict as assert } from "node:assert";

import { reconcileSettingsAfterCriteriaSave } from "./interview-settings-sync";
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
      },
      {
        questionId: 2,
        criterionId: null,
        questionType: "INTRO",
        content: "평가 기준에 연결되지 않은 질문",
        origin: "MANUAL",
        isAiEdited: false,
        isActive: true,
      },
    ],
    timePolicy: {
      preparationTimeSec: 30,
      answerTimeSec: 120,
      retryAllowed: false,
    },
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

testRemovesQuestionsLinkedToReplacedCriteria();
testKeepsQuestionsLinkedToRetainedCriteria();
testDoesNotMutateCurrentSettings();

console.log("interview-settings-sync.spec: all assertions passed");

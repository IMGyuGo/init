import { strict as assert } from "node:assert";

import { resolveClientNextStepType } from "./client-next-step";

const questions = [
  { questionId: 10, questionType: "TECHNICAL" },
  { questionId: 11, questionType: "FOLLOW_UP" },
  { questionId: 12, questionType: "BEHAVIORAL" },
];

assert.equal(
  resolveClientNextStepType({
    sourceQuestionId: 10,
    outcome: "FOLLOW_UP_READY",
    nextReady: true,
    questions: [],
    totalQuestions: 1,
  }),
  "FOLLOW_UP_QUESTION",
);

assert.equal(
  resolveClientNextStepType({
    sourceQuestionId: 11,
    outcome: "NEXT_QUESTION_READY",
    nextReady: true,
    questions,
    totalQuestions: questions.length,
  }),
  "STANDARD_QUESTION",
);

assert.equal(
  resolveClientNextStepType({
    sourceQuestionId: 12,
    outcome: "PIPELINE_ERROR_CONTINUE",
    nextReady: true,
    questions,
    totalQuestions: questions.length,
  }),
  "INTERVIEW_COMPLETE",
);

assert.equal(
  resolveClientNextStepType({
    sourceQuestionId: 10,
    outcome: "FOLLOW_UP_FAILED_BLOCKED",
    nextReady: false,
    questions,
    totalQuestions: questions.length,
  }),
  "NOT_READY",
);

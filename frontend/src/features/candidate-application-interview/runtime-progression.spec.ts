import assert from "node:assert/strict";
import { getInterviewRuntimeProgressionState } from "./view-model";

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: true,
    isCurrentQuestionLast: false,
    generatedFollowUpReady: false,
    answerProcessingBusy: true,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 1,
    totalQuestions: 4,
  }),
  {
    canMoveNextQuestion: true,
    canCompleteInterview: false,
  },
);

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: false,
    isCurrentQuestionLast: false,
    generatedFollowUpReady: false,
    answerProcessingBusy: true,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 4,
    totalQuestions: 4,
  }),
  {
    canMoveNextQuestion: false,
    canCompleteInterview: true,
  },
);

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: false,
    isCurrentQuestionLast: false,
    generatedFollowUpReady: false,
    answerProcessingBusy: false,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 1,
    totalQuestions: 4,
  }),
  {
    canMoveNextQuestion: false,
    canCompleteInterview: false,
  },
);

console.log("interview runtime progression: ok");

import assert from "node:assert/strict";
import {
  getInterviewRuntimeProgressionState,
  getInterviewerSessionState,
  shouldDeferQuestionTransitionForFollowUp,
  shouldPreserveDemoQuestionUntilManualAdvance,
} from "./view-model";

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: true,
    isCurrentQuestionLast: false,
    answerProcessingBusy: true,
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

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: true,
    isCurrentQuestionLast: false,
    answerProcessingBusy: false,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 1,
    totalQuestions: 3,
  }),
  {
    canMoveNextQuestion: true,
    canCompleteInterview: false,
  },
);

assert.equal(
  getInterviewerSessionState({
    setupCompleted: true,
    completionReady: true,
    hasCurrentQuestion: false,
    questionSpeechPlaying: false,
    questionSpeechSupported: true,
    recording: false,
    answerProcessingBusy: false,
    busy: false,
    currentQuestionLocked: false,
  }).label,
  "면접 종료 준비",
);

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    completionReady: true,
    currentQuestionAnswered: false,
    isCurrentQuestionLast: false,
    answerProcessingBusy: false,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 2,
    totalQuestions: 3,
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
    answerProcessingBusy: true,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 4,
    totalQuestions: 4,
  }),
  {
    canMoveNextQuestion: false,
    canCompleteInterview: false,
  },
);

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: false,
    isCurrentQuestionLast: false,
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

assert.deepEqual(
  getInterviewRuntimeProgressionState({
    hasRuntimeData: true,
    currentQuestionAnswered: true,
    isCurrentQuestionLast: true,
    answerProcessingBusy: false,
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
    isCurrentQuestionLast: true,
    answerProcessingBusy: false,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 4,
    totalQuestions: 5,
  }),
  {
    canMoveNextQuestion: false,
    canCompleteInterview: false,
  },
);

assert.equal(shouldDeferQuestionTransitionForFollowUp("TECHNICAL"), true);
assert.equal(shouldDeferQuestionTransitionForFollowUp("EXPERIENCE"), true);
assert.equal(shouldDeferQuestionTransitionForFollowUp("FOLLOW_UP"), false);
assert.equal(shouldDeferQuestionTransitionForFollowUp(undefined), false);

assert.equal(shouldPreserveDemoQuestionUntilManualAdvance({
  interviewMode: "recruiting",
  sessionMode: "DEMO_PRESET",
  questionType: "EXPERIENCE",
}), true);
assert.equal(shouldPreserveDemoQuestionUntilManualAdvance({
  interviewMode: "recruiting",
  sessionMode: "DEMO_PRESET",
  questionType: "FOLLOW_UP",
}), false);
assert.equal(shouldPreserveDemoQuestionUntilManualAdvance({
  interviewMode: "recruiting",
  sessionMode: "STANDARD",
  questionType: "EXPERIENCE",
}), false);
assert.equal(shouldPreserveDemoQuestionUntilManualAdvance({
  interviewMode: "mock",
  sessionMode: "DEMO_PRESET",
  questionType: "EXPERIENCE",
}), false);

console.log("interview runtime progression: ok");

import { strict as assert } from "node:assert";
import { CandidateApiError, isInterviewGazeDataInvalidError } from "./api";
import { normalizeGazeTimelineOffset } from "./nonverbal-analysis";
import { getInterviewRuntimeProgressionState, getInvalidRecordingRecoveryAction } from "./view-model";

const preservedOffsets = [-1, -0.999_999, -0.5, -0, 0, 0.5, 0.999_999, 1];
for (const offset of preservedOffsets) {
  assert.equal(normalizeGazeTimelineOffset(offset), offset, `preserves in-range offset ${offset}`);
}

const clampedOffsets = [
  { input: -Number.MAX_VALUE, expected: -1 },
  { input: -Number.MAX_SAFE_INTEGER, expected: -1 },
  { input: -10_000, expected: -1 },
  { input: -1.252, expected: -1 },
  { input: -1.000_001, expected: -1 },
  { input: 1.000_001, expected: 1 },
  { input: 1.252, expected: 1 },
  { input: 10_000, expected: 1 },
  { input: Number.MAX_SAFE_INTEGER, expected: 1 },
  { input: Number.MAX_VALUE, expected: 1 },
];
for (const { input, expected } of clampedOffsets) {
  assert.equal(normalizeGazeTimelineOffset(input), expected, `clamps finite offset ${input}`);
}

for (const offset of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assert.equal(normalizeGazeTimelineOffset(offset), undefined, `drops non-finite offset ${offset}`);
}

for (let step = -2_000; step <= 2_000; step += 1) {
  const input = step / 100;
  const normalized = normalizeGazeTimelineOffset(input);
  assert.notEqual(normalized, undefined, `normalizes finite sweep input ${input}`);
  assert.equal(Number.isFinite(normalized), true, `returns a finite value for ${input}`);
  assert.equal(normalized! >= -1 && normalized! <= 1, true, `keeps ${input} inside the API range`);
  assert.equal(normalizeGazeTimelineOffset(normalized!), normalized, `is idempotent for ${input}`);
}

const gazeErrorBody = {
  error: {
    code: "INTERVIEW_GAZE_DATA_INVALID",
    message: "Gaze timeline data is invalid. Retake the answer.",
    details: [{
      field: "nonverbalMetadata.gazeTimeline[0].horizontalOffset",
      reason: "must be a finite number between -1 and 1",
    }],
  },
  meta: { traceId: "test-trace", timestamp: "2026-07-15T00:00:00.000Z" },
};

assert.equal(isInterviewGazeDataInvalidError(new CandidateApiError(422, gazeErrorBody)), true);
assert.equal(isInterviewGazeDataInvalidError(new CandidateApiError(400, gazeErrorBody)), false);
assert.equal(isInterviewGazeDataInvalidError(new CandidateApiError(422, {
  ...gazeErrorBody,
  error: { ...gazeErrorBody.error, code: "COMMON_VALIDATION_FAILED" },
})), false);
assert.equal(isInterviewGazeDataInvalidError(new Error("network failed")), false);

assert.deepEqual(getInterviewRuntimeProgressionState({
  hasRuntimeData: true,
  currentQuestionAnswered: true,
  isCurrentQuestionLast: false,
  generatedFollowUpReady: false,
  answerProcessingBusy: false,
  isReansweringCurrentQuestion: false,
  recording: false,
  answeredQuestionCount: 1,
  totalQuestions: 4,
  gazeRetakeRequired: true,
}), {
  canMoveNextQuestion: false,
  canCompleteInterview: false,
});

assert.deepEqual(getInterviewRuntimeProgressionState({
  hasRuntimeData: true,
  currentQuestionAnswered: true,
  isCurrentQuestionLast: false,
  generatedFollowUpReady: false,
  answerProcessingBusy: false,
  isReansweringCurrentQuestion: false,
  recording: false,
  answeredQuestionCount: 1,
  totalQuestions: 4,
  gazeRetakeRequired: false,
}), {
  canMoveNextQuestion: true,
  canCompleteInterview: false,
});

assert.deepEqual(getInterviewRuntimeProgressionState({
  hasRuntimeData: true,
  currentQuestionAnswered: true,
  isCurrentQuestionLast: true,
  generatedFollowUpReady: false,
  answerProcessingBusy: false,
  isReansweringCurrentQuestion: false,
  recording: false,
  answeredQuestionCount: 4,
  totalQuestions: 4,
  gazeRetakeRequired: true,
}), {
  canMoveNextQuestion: false,
  canCompleteInterview: false,
});

assert.deepEqual(getInterviewRuntimeProgressionState({
  hasRuntimeData: true,
  currentQuestionAnswered: true,
  isCurrentQuestionLast: true,
  generatedFollowUpReady: false,
  answerProcessingBusy: false,
  isReansweringCurrentQuestion: false,
  recording: false,
  answeredQuestionCount: 4,
  totalQuestions: 4,
  gazeRetakeRequired: false,
}), {
  canMoveNextQuestion: false,
  canCompleteInterview: true,
});

for (const failedAttemptCount of [1, 2, 10, Number.MAX_SAFE_INTEGER]) {
  assert.equal(getInvalidRecordingRecoveryAction({
    failedAttemptCount,
    maxAutoRetryCount: 1,
    gazeRetakeRequired: true,
  }), "retry");
}
assert.equal(getInvalidRecordingRecoveryAction({
  failedAttemptCount: 2,
  maxAutoRetryCount: 1,
  gazeRetakeRequired: false,
}), "hold");

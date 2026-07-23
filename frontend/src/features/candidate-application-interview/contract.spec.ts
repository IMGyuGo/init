import { strict as assert } from "node:assert";
import type {
  ApiErrorBody,
  CandidateApplicationSummary,
  CandidateJobDetail,
  CandidateJobListPostingStatus,
  CandidateJobQuery,
  CandidateJobSummary,
  CandidateMockReportFeedback,
  CandidateMockReportSummary,
  CandidateRecruitingReportView,
  CreatePortfolioLinkRequest,
  InterviewDeviceCheckRequest,
  RuntimeFileAssetRequest,
  SaveInterviewAnswerRequest,
  SaveInterviewConsentRequest,
  StartMockInterviewRequest,
  SubmitApplicationRequest,
  UploadResumeRequest,
} from "./api";
import { candidateApiPaths } from "./api";
import { isCandidateApplicationCancelable } from "./application-cancellation";
import {
  createRealtimeInterviewWebRtcConnection,
  type RealtimePeerConnectionLike,
} from "./realtime-webrtc";
import {
  classifyIrisGazeDirection,
  countPersonDetections,
  isFacePositionShifted,
  estimateHeadPoseAngles,
  isReliableGazeCalibrationFrame,
  isWithinDetectionGrace,
  resolveCombinedGazeSignal,
  smoothIrisGazePosition,
  updateFacePositionBaseline,
  updateMultiplePeopleDetectionState,
  updateSustainedDetectionState,
} from "./nonverbal-integrity";
import {
  evaluateTimelineAnalysisQuality,
  readGazeAwayIntervals,
  readGazeTimeline,
  readHeadPoseTimeline,
  summarizeGazeTimeline,
  summarizeHeadPoseTimeline,
} from "./nonverbal-analysis";
import {
  createNonverbalDeviceQaRun,
  detectNonverbalDeviceQaBrowser,
  finishNonverbalDeviceQaScenario,
  startNonverbalDeviceQaScenario,
  summarizeNonverbalDeviceQaRun,
} from "./nonverbal-device-qa";
import {
  canSubmitInterviewAnswer,
  clampCameraPipPosition,
  createInterviewAnswerFormStateForQuestion,
  createCameralessInterviewTestDeviceCheckState,
  createInterviewerSessionActionEvent,
  createInterviewerSessionEvent,
  buildCandidateReportCompleteNotifications,
  buildCandidateScreeningResultNotifications,
  countUnreadCandidateNotifications,
  defaultApplicationFormState,
  formatAiInterviewerQuestionPrompt,
  getRecruitingReportPollingIntervalMs,
  getAiInterviewerProfile,
  getCandidateApplicationInterviewActionHref,
  getCandidateApplicationReportHref,
  getCandidateJobDetailActionHref,
  getDefaultCameraPipPosition,
  getInterviewRuntimeFullscreenActive,
  getInterviewAiPollingPolicy,
  getInterviewRuntimeLayoutState,
  getInterviewRuntimePipShortcutState,
  getInterviewRuntimeScreenSwapState,
  getInterviewRuntimeShortcutHints,
  getRuntimeDeviceRecheckState,
  hasRequiredConsents,
  getInterviewRuntimeProgressionState,
  getInterviewRuntimeStatusChips,
  getInterviewerSessionState,
  getInterviewIntroPlaybackAction,
  getInvalidRecordingRecoveryAction,
  getRealtimeSilenceEncouragementDecision,
  getRealtimeSessionUserNotice,
  getTimedOutAiJobStatus,
  hasAvailableMockInterviewPass,
  hasMeaningfulInterviewRecordingVoice,
  getCandidatePassRevealStorageKey,
  getCandidateScreeningResultPresentation,
  isInterviewSpeechPlaybackEventCurrent,
  resolveInterviewerSessionMode,
  shouldAutoStartInterviewRecording,
  shouldContinueInterviewWithoutFollowUp,
  shouldPollRecruitingReportCompletion,
  shouldEnableManualInterviewRecording,
  shouldHandleInterviewAnswerTimeout,
  shouldOpenRealtimeMicrophoneForRecordingStart,
  shouldRunInterviewRuntimeCountdown,
  shouldShowCandidatePassReveal,
  shouldShowPaymentDevTools,
  trimInterviewerSessionEvents,
  getInterviewMediaFileExtension,
  getMockInterviewDeviceCheckHref,
  getMockInterviewHref,
  getMockReportHref,
  isCandidateFacingMockFeedbackSafe,
  isCandidateInterviewStartEnabled,
  isCandidateRecruitingReportLimited,
  resolveRecordedMimeType,
  requiredApplicationConsents,
  shouldShowInterviewDeviceSetup,
  toRuntimeQuestionSpeechText,
  toDeviceCheckRequest,
  toCreatePortfolioLinkRequest,
  toRecordingValidationSkipRequest,
  toSaveInterviewAnswerRequest,
  toSaveInterviewConsentRequest,
  toStartMockInterviewRequest,
  toSubmitApplicationRequest,
  toUploadResumeRequest,
} from "./view-model";

assert.equal(hasAvailableMockInterviewPass(0), false);
assert.equal(hasAvailableMockInterviewPass(-1), false);
assert.equal(hasAvailableMockInterviewPass(1), true);

const detectedPersonCount = countPersonDetections([
  {
    categories: [{ categoryName: "person", displayName: "", index: 0, score: 0.92 }],
    keypoints: [],
  },
  {
    categories: [{ categoryName: "person", displayName: "", index: 0, score: 0.68 }],
    keypoints: [],
  },
  {
    categories: [{ categoryName: "cat", displayName: "", index: 16, score: 0.99 }],
    keypoints: [],
  },
]);
assert.equal(detectedPersonCount, 2);
assert.equal(countPersonDetections([
  {
    categories: [{ categoryName: "person", displayName: "", index: 0, score: 0.34 }],
    keypoints: [],
  },
], 0.35), 0);

let multiplePeopleState = updateMultiplePeopleDetectionState({
  detected: true,
  nowMs: 0,
  positiveSampleTimesMs: [],
  active: false,
});
assert.equal(multiplePeopleState.active, false);

multiplePeopleState = updateMultiplePeopleDetectionState({
  ...multiplePeopleState,
  detected: false,
  nowMs: 500,
});
assert.equal(multiplePeopleState.active, false);

multiplePeopleState = updateMultiplePeopleDetectionState({
  ...multiplePeopleState,
  detected: true,
  nowMs: 1000,
});
assert.equal(multiplePeopleState.active, true);

multiplePeopleState = updateMultiplePeopleDetectionState({
  ...multiplePeopleState,
  detected: false,
  nowMs: 1500,
});
assert.equal(multiplePeopleState.active, true);

multiplePeopleState = updateMultiplePeopleDetectionState({
  ...multiplePeopleState,
  detected: false,
  nowMs: 3000,
});
assert.equal(multiplePeopleState.active, false);

let facePositionBaseline = updateFacePositionBaseline(undefined, 0, {
  centerX: 0.48,
  centerY: 0.49,
  areaRatio: 0.1,
});
facePositionBaseline = updateFacePositionBaseline(facePositionBaseline, 1, {
  centerX: 0.52,
  centerY: 0.51,
  areaRatio: 0.12,
});
assert.ok(Math.abs(facePositionBaseline.centerX - 0.5) < 0.001);
assert.ok(Math.abs(facePositionBaseline.centerY - 0.5) < 0.001);
assert.ok(Math.abs(facePositionBaseline.areaRatio - 0.11) < 0.001);
assert.equal(isFacePositionShifted(facePositionBaseline, {
  centerX: 0.75,
  centerY: 0.5,
  areaRatio: 0.19,
}), false);
assert.equal(isFacePositionShifted(facePositionBaseline, {
  centerX: 0.79,
  centerY: 0.5,
  areaRatio: 0.11,
}), true);

let faceShiftState = updateSustainedDetectionState({
  detected: true,
  nowMs: 0,
  confirmationMs: 1000,
});
assert.equal(faceShiftState.active, false);
faceShiftState = updateSustainedDetectionState({
  detected: true,
  nowMs: 500,
  candidateStartedAtMs: faceShiftState.candidateStartedAtMs,
  confirmationMs: 1000,
});
assert.equal(faceShiftState.active, false);
faceShiftState = updateSustainedDetectionState({
  detected: true,
  nowMs: 1000,
  candidateStartedAtMs: faceShiftState.candidateStartedAtMs,
  confirmationMs: 1000,
});
assert.equal(faceShiftState.active, true);
faceShiftState = updateSustainedDetectionState({
  detected: false,
  nowMs: 1500,
  candidateStartedAtMs: faceShiftState.candidateStartedAtMs,
  confirmationMs: 1000,
});
assert.equal(faceShiftState.active, false);

const identityHeadPose = estimateHeadPoseAngles({
  rows: 4,
  columns: 4,
  data: [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ],
});
assert.ok(identityHeadPose);
assert.ok(Math.abs(identityHeadPose.yawDegrees) < 0.001);
assert.ok(Math.abs(identityHeadPose.pitchDegrees) < 0.001);
assert.ok(Math.abs(identityHeadPose.rollDegrees ?? 0) < 0.001);

const yawRadians = 30 * Math.PI / 180;
const turnedHeadPose = estimateHeadPoseAngles({
  rows: 4,
  columns: 4,
  data: [
    Math.cos(yawRadians), 0, -Math.sin(yawRadians), 0,
    0, 1, 0, 0,
    Math.sin(yawRadians), 0, Math.cos(yawRadians), 0,
    0, 0, 0, 1,
  ],
});
assert.ok(turnedHeadPose);
assert.ok(Math.abs(turnedHeadPose.yawDegrees - 30) < 0.001);

const rollRadians = 20 * Math.PI / 180;
const tiltedHeadPose = estimateHeadPoseAngles({
  rows: 4,
  columns: 4,
  data: [
    Math.cos(rollRadians), -Math.sin(rollRadians), 0, 0,
    Math.sin(rollRadians), Math.cos(rollRadians), 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ],
});
assert.ok(tiltedHeadPose);
assert.ok(Math.abs((tiltedHeadPose.rollDegrees ?? 0) - 20) < 0.001);

const gazeTimeline = readGazeTimeline({
  gazeTimeline: [
    { tMs: 1000, horizontalOffset: 0.01, verticalOffset: -0.01, direction: "CENTER" },
    { tMs: 2000, horizontalOffset: 0.2, verticalOffset: 0.02, direction: "RIGHT" },
    { tMs: -1, horizontalOffset: 0, verticalOffset: 0, direction: "CENTER" },
  ],
});
assert.equal(gazeTimeline.length, 2);
assert.deepEqual(summarizeGazeTimeline(gazeTimeline), {
  sampleCount: 2,
  centeredRatio: 0.5,
  horizontalRange: 0.19,
  verticalRange: 0.03,
  dominantAwayDirection: "RIGHT",
});

assert.deepEqual(
  readGazeAwayIntervals({
    integrityEvents: [
      { type: "GAZE_AWAY", offsetMs: 4000, durationMs: 1800, direction: "RIGHT" },
      { type: "GAZE_AWAY", occurredAt: "2026-07-10T10:00:00.000Z" },
      { type: "TAB_HIDDEN", offsetMs: 7000, durationMs: 1000 },
      { type: "GAZE_AWAY", offsetMs: 9500, durationMs: 2000, direction: "DOWN" },
    ],
  }, 10000),
  [
    { startMs: 4000, endMs: 5800, direction: "RIGHT" },
    { startMs: 9500, endMs: 10000, direction: "DOWN" },
  ],
);

assert.deepEqual(evaluateTimelineAnalysisQuality(0, 30000), {
  status: "INSUFFICIENT",
  reason: "NO_SAMPLES",
  sampleCount: 0,
  requiredSampleCount: 10,
});
assert.deepEqual(evaluateTimelineAnalysisQuality(9, 30000), {
  status: "INSUFFICIENT",
  reason: "LOW_COVERAGE",
  sampleCount: 9,
  requiredSampleCount: 10,
});
assert.deepEqual(evaluateTimelineAnalysisQuality(10, 30000), {
  status: "AVAILABLE",
  sampleCount: 10,
  requiredSampleCount: 10,
});
assert.equal(evaluateTimelineAnalysisQuality(2, 5000).status, "INSUFFICIENT");
assert.equal(evaluateTimelineAnalysisQuality(3, 5000).status, "AVAILABLE");

assert.equal(detectNonverbalDeviceQaBrowser("Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36"), "CHROME");
assert.equal(detectNonverbalDeviceQaBrowser("Mozilla/5.0 Edg/126.0.0.0 Chrome/126.0.0.0"), "EDGE");
assert.equal(detectNonverbalDeviceQaBrowser("Mozilla/5.0 Version/17.5 Safari/605.1.15"), "SAFARI");

const deviceQaRun = createNonverbalDeviceQaRun({
  questionId: 1,
  startedAtMs: 1000,
  sampleIntervalMs: 500,
  environment: {
    browser: "CHROME",
    userAgent: "Chrome test",
    platform: "Win32",
    hardwareConcurrency: 8,
  },
  camera: { width: 1280, height: 720, frameRate: 30 },
});
deviceQaRun.sampleAttempts = 20;
deviceQaRun.sampleCompleted = 20;
deviceQaRun.sampleProcessingDurationsMs = Array.from({ length: 20 }, () => 100);
deviceQaRun.facePresentSampleCount = 20;
deviceQaRun.irisSampleCount = 19;
deviceQaRun.headPoseSampleCount = 20;
deviceQaRun.firstCompletedSampleAtMs = 1400;
deviceQaRun.videoFrameCallbackSupported = true;
deviceQaRun.videoPresentedFrameCount = 270;
deviceQaRun.firstVideoFrameAtMs = 1000;
deviceQaRun.lastVideoFrameAtMs = 10000;
assert.deepEqual(summarizeNonverbalDeviceQaRun(deviceQaRun, 11000), {
  elapsedMs: 10000,
  performanceStatus: "GOOD",
  completedSamplesPerSecond: 2,
  sampleCompletionRate: 1,
  averageProcessingMs: 100,
  p95ProcessingMs: 100,
  maxProcessingMs: 100,
  firstSampleLatencyMs: 400,
  faceCoverageRate: 1,
  irisCoverageRate: 0.95,
  headPoseCoverageRate: 1,
  measuredVideoFps: 30,
  estimatedVideoDropRate: 0,
});

startNonverbalDeviceQaScenario(deviceQaRun, "NEUTRAL", 0, 12000);
assert.equal(finishNonverbalDeviceQaScenario(deviceQaRun, [], 17000)?.status, "PASS");
startNonverbalDeviceQaScenario(deviceQaRun, "EYE_AWAY", 0, 18000);
assert.equal(
  finishNonverbalDeviceQaScenario(deviceQaRun, [{ type: "GAZE_AWAY", source: "IRIS" }], 23000)?.status,
  "PASS",
);
startNonverbalDeviceQaScenario(deviceQaRun, "HEAD_AWAY", 0, 24000);
assert.equal(
  finishNonverbalDeviceQaScenario(deviceQaRun, [{ type: "GAZE_AWAY", source: "IRIS" }], 29000)?.status,
  "FAIL",
);
startNonverbalDeviceQaScenario(deviceQaRun, "NEUTRAL", 0, 30000);
assert.equal(finishNonverbalDeviceQaScenario(deviceQaRun, [], 31000)?.status, "INCOMPLETE");

const headPoseTimeline = readHeadPoseTimeline({
  headPoseTimeline: [
    { tMs: 1000, yawDegrees: 2, pitchDegrees: -3, rollDegrees: 1 },
    { tMs: 2000, yawDegrees: 22, pitchDegrees: 4, rollDegrees: -5 },
  ],
});
assert.deepEqual(summarizeHeadPoseTimeline(headPoseTimeline), {
  sampleCount: 2,
  frontalRatio: 0.5,
  maxYawDegrees: 22,
  maxPitchDegrees: 4,
  maxRollDegrees: 5,
});

const normalCombinedGazeSignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.55, verticalRatio: 0.53 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 8, pitchDegrees: 6 },
});
assert.equal(normalCombinedGazeSignal, undefined);

assert.equal(
  classifyIrisGazeDirection(
    { horizontalRatio: 0.53, verticalRatio: 0.54 },
    { horizontalRatio: 0.5, verticalRatio: 0.5 },
  ),
  "CENTER",
);
assert.equal(
  classifyIrisGazeDirection(
    { horizontalRatio: 0.565, verticalRatio: 0.51 },
    { horizontalRatio: 0.5, verticalRatio: 0.5 },
  ),
  "RIGHT",
);
assert.equal(
  classifyIrisGazeDirection(
    { horizontalRatio: 0.49, verticalRatio: 0.57 },
    { horizontalRatio: 0.5, verticalRatio: 0.5 },
  ),
  "DOWN",
);

const smoothedIrisPosition = smoothIrisGazePosition(
  { horizontalRatio: 0.5, verticalRatio: 0.5 },
  { horizontalRatio: 0.7, verticalRatio: 0.6 },
);
assert.ok(Math.abs(smoothedIrisPosition.horizontalRatio - 0.61) < 0.000001);
assert.ok(Math.abs(smoothedIrisPosition.verticalRatio - 0.555) < 0.000001);

const moderateIrisOnlySignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.59, verticalRatio: 0.51 },
});
assert.equal(moderateIrisOnlySignal?.source, "IRIS");
assert.equal(moderateIrisOnlySignal?.direction, "RIGHT");

assert.equal(isWithinDetectionGrace(1000, 1650, 650), true);
assert.equal(isWithinDetectionGrace(1000, 1651, 650), false);

const centeredCalibrationFrame = {
  irisPosition: { horizontalRatio: 0.5, verticalRatio: 0.52 },
  headPose: { yawDegrees: 4, pitchDegrees: -3, rollDegrees: 2 },
  detectedFaceCount: 1,
  faceInFrame: true,
};
assert.equal(isReliableGazeCalibrationFrame(centeredCalibrationFrame), true);
assert.equal(isReliableGazeCalibrationFrame({ ...centeredCalibrationFrame, detectedFaceCount: 2 }), false);
assert.equal(isReliableGazeCalibrationFrame({ ...centeredCalibrationFrame, faceInFrame: false }), false);
assert.equal(
  isReliableGazeCalibrationFrame({
    ...centeredCalibrationFrame,
    irisPosition: { horizontalRatio: 0.9, verticalRatio: 0.52 },
  }),
  false,
);
assert.equal(
  isReliableGazeCalibrationFrame({
    ...centeredCalibrationFrame,
    headPose: { yawDegrees: 24, pitchDegrees: -3, rollDegrees: 2 },
  }),
  false,
);
assert.equal(isReliableGazeCalibrationFrame({ ...centeredCalibrationFrame, irisPosition: undefined }), false);

const horizontalIrisOnlySignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.63, verticalRatio: 0.52 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 2, pitchDegrees: 1 },
});
assert.equal(horizontalIrisOnlySignal?.source, "IRIS");
assert.equal(horizontalIrisOnlySignal?.direction, "RIGHT");

const downwardIrisOnlySignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.52, verticalRatio: 0.65 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 1, pitchDegrees: 2 },
});
assert.equal(downwardIrisOnlySignal?.source, "IRIS");
assert.equal(downwardIrisOnlySignal?.direction, "DOWN");

const phoneLookupHeadSignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.52, verticalRatio: 0.52 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 25, pitchDegrees: 20 },
});
assert.equal(phoneLookupHeadSignal?.source, "HEAD_POSE");
assert.equal(phoneLookupHeadSignal?.direction, "RIGHT");

const subtlePhoneLookupCombinedSignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.6, verticalRatio: 0.52 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 12, pitchDegrees: 4 },
});
assert.equal(subtlePhoneLookupCombinedSignal?.source, "COMBINED");
assert.equal(subtlePhoneLookupCombinedSignal?.direction, "RIGHT");

const downwardPhoneLookupCombinedSignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.52, verticalRatio: 0.62 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 4, pitchDegrees: 10 },
});
assert.equal(downwardPhoneLookupCombinedSignal?.source, "COMBINED");
assert.equal(downwardPhoneLookupCombinedSignal?.direction, "DOWN");

const phoneLookupCombinedSignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.75, verticalRatio: 0.72 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 25, pitchDegrees: 20 },
});
assert.equal(phoneLookupCombinedSignal?.source, "COMBINED");
assert.equal(phoneLookupCombinedSignal?.direction, "RIGHT");

const listPostingStatus: CandidateJobListPostingStatus = "OPEN";
const query: CandidateJobQuery = {
  page: 1,
  limit: 20,
  q: "android",
  jobRole: "Android",
  jobGroup: "Engineering",
  location: "Pangyo",
  careerLevel: "Entry",
  postingStatus: listPostingStatus,
  sort: "endsOn",
  order: "asc",
};

// @ts-expect-error Closed postings are not a valid candidate list filter value.
const closedFilterQuery: CandidateJobQuery = { postingStatus: "CLOSED" };

assert.deepEqual(defaultApplicationFormState.consentTypes, requiredApplicationConsents);
assert.equal(hasRequiredConsents(defaultApplicationFormState.consentTypes), true);

const submitRequest: SubmitApplicationRequest = toSubmitApplicationRequest({
  candidateName: " Kim Applicant ",
  email: " kim@example.com ",
  phone: " 010-0000-0000 ",
  githubUrl: " https://github.com/kim ",
  blogUrl: " https://blog.example.com/kim ",
  resumeFileId: 1,
  portfolioUrl: " https://portfolio.example.com/kim ",
  motivation: " 지원 동기 ",
  additionalInfo: " 추가 설명 ",
  profileSnapshot: {
    schemaVersion: 1,
    name: "Kim Applicant",
    email: "kim@example.com",
    phone: "010-0000-0000",
    githubUrl: "https://github.com/kim",
    blogUrl: "https://blog.example.com/kim",
    portfolioUrl: "https://portfolio.example.com/kim",
    summary: "백엔드 개발자",
    coverLetter: "지원 동기",
    educations: [],
    careers: [],
    activities: [],
    credentials: [],
  },
  consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"],
});

const resumeRequest: UploadResumeRequest = toUploadResumeRequest({
  candidateId: 1,
  storageKey: "candidate/1/resume.pdf",
  originalName: " resume.pdf ",
  mimeType: "application/pdf",
  sizeBytes: 1024,
});

const portfolioRequest: CreatePortfolioLinkRequest = toCreatePortfolioLinkRequest({
  linkType: "GITHUB",
  url: "https://github.com/example",
  description: " GitHub ",
});

const interviewConsentRequest: SaveInterviewConsentRequest = toSaveInterviewConsentRequest({
  consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"],
});

const deviceCheckRequest: InterviewDeviceCheckRequest = toDeviceCheckRequest({
  cameraGranted: true,
  microphoneGranted: true,
  networkStable: true,
});
const cameralessTestDeviceCheckState = createCameralessInterviewTestDeviceCheckState();
const cameralessTestDeviceCheckRequest: InterviewDeviceCheckRequest = toDeviceCheckRequest(
  cameralessTestDeviceCheckState,
);
assert.equal(shouldShowPaymentDevTools({ nodeEnv: "production" }), true);
assert.deepEqual(cameralessTestDeviceCheckRequest, {
  cameraGranted: true,
  microphoneGranted: true,
  networkStable: true,
});

const startMockRequest: StartMockInterviewRequest = toStartMockInterviewRequest({
  jobRole: " Android ",
  difficulty: "NORMAL",
  questionTypes: ["INTRO", "TECHNICAL"],
  showQuestionText: false,
  folderId: null,
});

const answerRequest: SaveInterviewAnswerRequest = toSaveInterviewAnswerRequest({
  questionId: 1,
  videoFile: {
    storageKey: "candidate/1/mock-answer.webm",
    originalName: "mock-answer.webm",
    mimeType: "video/webm",
    sizeBytes: 1024,
  },
  durationSeconds: 30,
});

const skippedAnswerMetadata = {
  integrityEvents: [
    {
      type: "TAB_HIDDEN",
      occurredAt: "2026-07-10T10:00:00.000Z",
      durationMs: 3200,
    },
  ],
};
assert.deepEqual(
  toRecordingValidationSkipRequest({
    questionId: 3,
    retryAnswerId: 99,
    nonverbalMetadata: skippedAnswerMetadata,
  }),
  {
    questionId: 3,
    durationSeconds: 0,
    skipReason: "RECORDING_VALIDATION_FAILED",
    retryAnswerId: 99,
    nonverbalMetadata: skippedAnswerMetadata,
  },
);

const macosAudioAnswerRequest: SaveInterviewAnswerRequest = toSaveInterviewAnswerRequest({
  questionId: 2,
  audioFile: {
    storageKey: "candidate/1/mock-answer.m4a",
    originalName: "mock-answer.m4a",
    mimeType: "audio/mp4",
    sizeBytes: 12 * 1024,
  },
  durationSeconds: 30,
});

const macosChunkFallbackMimeType: RuntimeFileAssetRequest["mimeType"] = resolveRecordedMimeType({
  chunkMimeTypes: ["audio/mp4;codecs=opus"],
  recorderMimeType: "",
  requestedMimeType: "video/webm",
}) as RuntimeFileAssetRequest["mimeType"];
assert.equal(macosChunkFallbackMimeType, "audio/mp4");
assert.equal(getInterviewMediaFileExtension(macosChunkFallbackMimeType), "m4a");

const requestedMimeTypeFallback: RuntimeFileAssetRequest["mimeType"] = resolveRecordedMimeType({
  chunkMimeTypes: [""],
  recorderMimeType: "",
  requestedMimeType: "video/mp4",
}) as RuntimeFileAssetRequest["mimeType"];
assert.equal(requestedMimeTypeFallback, "video/mp4");

const unsupportedRecordedMimeType = resolveRecordedMimeType({
  chunkMimeTypes: [""],
  recorderMimeType: "",
  requestedMimeType: "",
});
assert.equal(unsupportedRecordedMimeType, "");

const questionSpeechText = toRuntimeQuestionSpeechText({
  content: "최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?",
  audioPrompt: "audio://candidate/mock-question/1",
});

const audioPromptSpeechText = toRuntimeQuestionSpeechText({
  audioPrompt: "자기소개를 1분 안에 들려주세요.",
});
const mockInterviewerProfile = getAiInterviewerProfile("mock");
assert.deepEqual(mockInterviewerProfile, {
  displayName: "AI 면접관",
  toneLabel: "연습 코치형",
  voiceGuide: "편안하고 차분한 목소리",
  disclosure: "이 면접관의 음성은 AI로 생성됩니다.",
  infoButtonLabel: "AI 면접관 설명",
  infoShortcutKey: "M",
});
const mockInterviewerInfoShortcutKey: "M" = mockInterviewerProfile.infoShortcutKey;
const recruitingInterviewerProfile = getAiInterviewerProfile("recruiting");
assert.deepEqual(recruitingInterviewerProfile, {
  displayName: "AI 면접관",
  toneLabel: "공식 진행형",
  voiceGuide: "중립적이고 공식적인 목소리",
  disclosure: "이 면접관의 음성은 AI로 생성됩니다.",
  infoButtonLabel: "AI 면접관 설명",
  infoShortcutKey: "M",
});
assert.equal(
  formatAiInterviewerQuestionPrompt({
    question: {
      content: "최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?",
      audioPrompt: "audio://candidate/mock-question/1",
    },
    questionVisible: false,
  }),
  "질문 음성을 듣고 답변해주세요.",
);
assert.equal(
  formatAiInterviewerQuestionPrompt({
    question: {
      content: "최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?",
      audioPrompt: "audio://candidate/mock-question/1",
    },
    questionVisible: true,
  }),
  "최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?",
);
assert.equal(
  formatAiInterviewerQuestionPrompt({
    questionVisible: true,
    completionReady: true,
  }),
  "모든 질문에 답변했습니다.",
);
assert.deepEqual(
  clampCameraPipPosition(
    { x: 820, y: 640 },
    { stageWidth: 900, stageHeight: 700, pipWidth: 220, pipHeight: 150, padding: 16 },
  ),
  { x: 664, y: 534 },
);
assert.deepEqual(
  clampCameraPipPosition(
    { x: 240, y: 24 },
    { stageWidth: 900, stageHeight: 700, pipWidth: 220, pipHeight: 150, padding: 16, reservedTopHeight: 92 },
  ),
  { x: 240, y: 108 },
);
assert.deepEqual(
  getDefaultCameraPipPosition({
    stageWidth: 1920,
    stageHeight: 1030,
    pipWidth: 320,
    pipHeight: 278,
    padding: 32,
    reservedTopHeight: 112,
  }),
  { x: 1568, y: 376 },
);
assert.deepEqual(
  getDefaultCameraPipPosition({
    stageWidth: 520,
    stageHeight: 360,
    pipWidth: 240,
    pipHeight: 220,
    padding: 16,
    reservedTopHeight: 180,
  }),
  { x: 264, y: 196 },
);
const healthyRuntimeStatusChips = getInterviewRuntimeStatusChips({
  microphoneReady: true,
  microphoneLevel: 42,
  cameraReady: true,
  networkReady: true,
  networkStatus: "네트워크 정상 · 평균 42ms",
});
const healthyMicrophoneTone: Exclude<(typeof healthyRuntimeStatusChips)[number]["tone"], "ok"> =
  healthyRuntimeStatusChips[0].tone;
assert.deepEqual(
  healthyRuntimeStatusChips,
  [
    {
      id: "microphone",
      label: "음성 입력 42%",
      tone: "success",
      visible: true,
    },
  ],
);
assert.deepEqual(
  getInterviewRuntimeStatusChips({
    microphoneReady: false,
    microphoneLevel: 0,
    cameraReady: false,
    networkReady: false,
    networkStatus: "네트워크 확인이 불안정합니다.",
  }),
  [
    {
      id: "microphone",
      label: "음성 확인 필요",
      tone: "warning",
      visible: true,
    },
    {
      id: "camera",
      label: "카메라 확인 필요",
      tone: "warning",
      visible: true,
    },
    {
      id: "network",
      label: "네트워크 확인이 불안정합니다.",
      tone: "warning",
      visible: true,
    },
  ],
);
assert.deepEqual(
  getRuntimeDeviceRecheckState({
    setupCompleted: true,
    recording: false,
    cameraReady: true,
    microphoneReady: false,
    networkReady: true,
  }),
  {
    visible: true,
    label: "마이크 다시 점검",
    reason: "MICROPHONE",
  },
);
assert.deepEqual(
  getRuntimeDeviceRecheckState({
    setupCompleted: true,
    recording: false,
    cameraReady: true,
    microphoneReady: true,
    networkReady: true,
  }),
  {
    visible: false,
    label: "장치 다시 점검",
    reason: "NONE",
  },
);
const visibleRuntimeShortcutHints: Array<{ key: "F"; label: string }> = getInterviewRuntimeShortcutHints();
assert.deepEqual(visibleRuntimeShortcutHints, [
  { key: "F", label: "전체화면" },
]);
const compactRuntimeLayoutState = getInterviewRuntimeLayoutState({ fullscreenActive: false });
assert.deepEqual(compactRuntimeLayoutState, {
  mode: "compact",
  showShortcutHints: true,
  fullscreenButtonLabel: "전체화면",
  stageClassName: "ai-interviewer-stage",
  viewportLockClassName: "ai-interviewer-stage--viewport-lock",
  infoGapClassName: "ai-interviewer-stage--reserved-info-gap",
});
assert.equal(compactRuntimeLayoutState.stageClassName, "ai-interviewer-stage");
const compactViewportLockClassName: "ai-interviewer-stage--viewport-lock" =
  compactRuntimeLayoutState.viewportLockClassName;
assert.equal(compactViewportLockClassName, "ai-interviewer-stage--viewport-lock");
const compactInfoGapClassName: "ai-interviewer-stage--reserved-info-gap" =
  compactRuntimeLayoutState.infoGapClassName;
assert.equal(compactInfoGapClassName, "ai-interviewer-stage--reserved-info-gap");
const immersiveRuntimeLayoutState = getInterviewRuntimeLayoutState({ fullscreenActive: true });
assert.deepEqual(immersiveRuntimeLayoutState, {
  mode: "immersive",
  showShortcutHints: false,
  fullscreenButtonLabel: "전체화면 해제",
  stageClassName: "ai-interviewer-stage",
  viewportLockClassName: "ai-interviewer-stage--viewport-lock",
  infoGapClassName: "ai-interviewer-stage--reserved-info-gap",
});
assert.equal(immersiveRuntimeLayoutState.stageClassName, "ai-interviewer-stage");
const immersiveViewportLockClassName: "ai-interviewer-stage--viewport-lock" =
  immersiveRuntimeLayoutState.viewportLockClassName;
assert.equal(immersiveViewportLockClassName, "ai-interviewer-stage--viewport-lock");
const immersiveInfoGapClassName: "ai-interviewer-stage--reserved-info-gap" =
  immersiveRuntimeLayoutState.infoGapClassName;
assert.equal(immersiveInfoGapClassName, "ai-interviewer-stage--reserved-info-gap");
assert.equal(
  getInterviewRuntimeFullscreenActive({ fullscreenElement: null, stageElement: null }),
  false,
);
const fakeStageElement = { nodeType: 1 } as Element;
assert.equal(
  getInterviewRuntimeFullscreenActive({ fullscreenElement: fakeStageElement, stageElement: fakeStageElement }),
  true,
);
const interviewerPrimaryScreenState = getInterviewRuntimeScreenSwapState({ primaryScreen: "interviewer" });
assert.deepEqual(interviewerPrimaryScreenState, {
  primaryScreen: "interviewer",
  stageClassName: "",
  cameraPanelClassName: "",
  interviewerPanelClassName: "",
  swapButtonLabel: "전환",
  swapShortcutKey: "S",
  swapButtonAriaLabel: "내 화면을 큰 화면으로 전환",
});
const interviewerPrimarySwapShortcutKey: "S" = interviewerPrimaryScreenState.swapShortcutKey;
assert.equal(interviewerPrimarySwapShortcutKey, "S");
const candidatePrimaryScreenState = getInterviewRuntimeScreenSwapState({ primaryScreen: "candidate" });
assert.deepEqual(candidatePrimaryScreenState, {
  primaryScreen: "candidate",
  stageClassName: "ai-interviewer-stage--candidate-primary",
  cameraPanelClassName: "candidate-camera-pip--primary",
  interviewerPanelClassName: "ai-interviewer-figure--pip",
  swapButtonLabel: "전환",
  swapShortcutKey: "S",
  swapButtonAriaLabel: "AI 면접관을 큰 화면으로 전환",
});
const candidatePrimarySwapShortcutKey: "S" = candidatePrimaryScreenState.swapShortcutKey;
assert.equal(candidatePrimarySwapShortcutKey, "S");
assert.deepEqual(
  getInterviewRuntimePipShortcutState({
    primaryScreen: "candidate",
    cameraPreviewVisible: true,
    interviewerPipVisible: true,
  }),
  {
    primaryScreen: "candidate",
    cameraPreviewVisible: true,
    interviewerPipVisible: false,
  },
);
assert.deepEqual(
  getInterviewRuntimePipShortcutState({
    primaryScreen: "interviewer",
    cameraPreviewVisible: true,
    interviewerPipVisible: true,
  }),
  {
    primaryScreen: "interviewer",
    cameraPreviewVisible: false,
    interviewerPipVisible: true,
  },
);
assert.deepEqual(
  getTimedOutAiJobStatus({
    processLogId: 77,
    processType: "STT",
    status: "RUNNING",
  }),
  {
    processLogId: 77,
    processType: "STT",
    status: "FAILED",
    failure: {
      category: "TIMEOUT",
      reason: "AI 작업 응답 시간이 초과되었습니다. 잠시 후 상태를 다시 확인해주세요.",
      retryable: true,
    },
  },
);
assert.deepEqual(getInterviewAiPollingPolicy({ timedAutoAdvance: false }), {
  attempts: 90,
  intervalMs: 1000,
});

assert.deepEqual(getInterviewAiPollingPolicy({ timedAutoAdvance: true }), {
  attempts: 40,
  intervalMs: 500,
});
assert.equal(shouldContinueInterviewWithoutFollowUp({ failureCategory: "TIMEOUT" }), true);
assert.equal(shouldContinueInterviewWithoutFollowUp({ pipelineError: new Error("worker unavailable") }), true);
assert.equal(shouldContinueInterviewWithoutFollowUp({ failureCategory: "REANSWER_REQUIRED" }), false);
assert.equal(
  shouldContinueInterviewWithoutFollowUp({ failureCategory: "REANSWER_REQUIRED", reanswerAlreadyUsed: true }),
  true,
);
assert.equal(getRealtimeSessionUserNotice({ provider: "mock" }), "");
assert.equal(getRealtimeSessionUserNotice({ provider: "openai" }), "실시간 AI 면접 연결을 준비했습니다.");
assert.equal(
  getInterviewIntroPlaybackAction({
    sessionId: 11,
    startedSessionId: null,
    playbackInFlight: false,
    introCompleted: false,
  }),
  "start",
);
assert.equal(
  getInterviewIntroPlaybackAction({
    sessionId: 11,
    startedSessionId: 11,
    playbackInFlight: true,
    introCompleted: false,
  }),
  "wait",
);
assert.equal(
  getInterviewIntroPlaybackAction({
    sessionId: 11,
    startedSessionId: 11,
    playbackInFlight: false,
    introCompleted: false,
  }),
  "complete",
);
assert.equal(
  getInterviewIntroPlaybackAction({
    sessionId: 11,
    startedSessionId: 11,
    playbackInFlight: false,
    introCompleted: true,
  }),
  "none",
);
assert.equal(
  isInterviewSpeechPlaybackEventCurrent({
    playbackId: 3,
    activePlaybackId: 3,
    questionId: 100,
    currentQuestionId: 100,
    sessionId: 1,
    currentSessionId: 1,
  }),
  true,
);
assert.equal(
  isInterviewSpeechPlaybackEventCurrent({
    playbackId: 2,
    activePlaybackId: 3,
    questionId: 100,
    currentQuestionId: 100,
    sessionId: 1,
    currentSessionId: 1,
  }),
  false,
);
assert.equal(
  isInterviewSpeechPlaybackEventCurrent({
    playbackId: 3,
    activePlaybackId: 3,
    questionId: 100,
    currentQuestionId: 101,
    sessionId: 1,
    currentSessionId: 1,
  }),
  false,
);
assert.equal(
  hasMeaningfulInterviewRecordingVoice({
    peakLevel: 1,
    activeFrameCount: 0,
    minPeakLevel: 5,
    minActiveFrameCount: 12,
  }),
  false,
);
assert.equal(
  hasMeaningfulInterviewRecordingVoice({
    peakLevel: 14,
    activeFrameCount: 18,
    minPeakLevel: 5,
    minActiveFrameCount: 12,
  }),
  true,
);
assert.deepEqual(createInterviewAnswerFormStateForQuestion(101), {
  questionId: 101,
  durationSeconds: 0,
});
const recordedAnswerForQuestion = {
  questionId: 100,
  videoFile: {
    storageKey: "candidate/1/mock-answer.webm",
    originalName: "mock-answer.webm",
    mimeType: "video/webm" as const,
    sizeBytes: 1024,
  },
  durationSeconds: 30,
};
assert.equal(
  canSubmitInterviewAnswer({
    currentQuestionId: 100,
    answer: recordedAnswerForQuestion,
    recording: false,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasMeaningfulVoice: true,
  }),
  true,
);
assert.equal(
  canSubmitInterviewAnswer({
    currentQuestionId: 101,
    answer: recordedAnswerForQuestion,
    recording: false,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasMeaningfulVoice: true,
  }),
  false,
);
assert.equal(
  canSubmitInterviewAnswer({
    currentQuestionId: 100,
    answer: recordedAnswerForQuestion,
    recording: false,
    questionSpeechCompleted: false,
    questionSpeechPlaying: true,
    hasMeaningfulVoice: true,
  }),
  false,
);
assert.equal(
  canSubmitInterviewAnswer({
    currentQuestionId: 100,
    answer: recordedAnswerForQuestion,
    recording: false,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasMeaningfulVoice: false,
  }),
  false,
);
assert.equal(
  shouldAutoStartInterviewRecording({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: false,
    hasAnswerFile: false,
    microphoneLevel: 0,
  }),
  true,
);
assert.equal(
  shouldAutoStartInterviewRecording({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: false,
    hasAnswerFile: false,
    microphoneLevel: 80,
  }),
  true,
);
assert.equal(
  shouldAutoStartInterviewRecording({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: true,
    cameraReady: true,
    microphoneReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: false,
    hasAnswerFile: false,
    microphoneLevel: 0,
  }),
  false,
);
assert.equal(
  shouldAutoStartInterviewRecording({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "PREPARING",
    recording: false,
    hasAnswerFile: false,
    microphoneLevel: 20,
  }),
  false,
);
assert.equal(
  shouldAutoStartInterviewRecording({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: true,
    hasAnswerFile: false,
    microphoneLevel: 20,
  }),
  false,
);
assert.equal(
  shouldAutoStartInterviewRecording({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: false,
    hasAnswerFile: true,
    microphoneLevel: 20,
  }),
  false,
);
assert.equal(
  shouldEnableManualInterviewRecording({
    canRecord: true,
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: false,
    networkReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: false,
    canSubmitAnswer: false,
    busy: false,
  }),
  false,
);
assert.equal(
  shouldEnableManualInterviewRecording({
    canRecord: true,
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    cameraReady: true,
    microphoneReady: true,
    networkReady: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    timerPhase: "ANSWERING",
    recording: false,
    canSubmitAnswer: false,
    busy: false,
  }),
  true,
);
assert.equal(
  shouldOpenRealtimeMicrophoneForRecordingStart({
    realtimeSpeechReady: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    timerPhase: "ANSWERING",
  }),
  true,
);
assert.equal(
  shouldOpenRealtimeMicrophoneForRecordingStart({
    realtimeSpeechReady: true,
    questionSpeechCompleted: false,
    questionSpeechPlaying: true,
    timerPhase: "ANSWERING",
  }),
  false,
);
assert.equal(
  shouldOpenRealtimeMicrophoneForRecordingStart({
    realtimeSpeechReady: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    timerPhase: "PREPARING",
  }),
  false,
);
assert.equal(
  shouldRunInterviewRuntimeCountdown({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    busy: false,
    timerPhase: "PREPARING",
  }),
  true,
);
assert.equal(
  shouldRunInterviewRuntimeCountdown({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    busy: false,
    timerPhase: "ANSWERING",
  }),
  true,
);
assert.equal(
  shouldRunInterviewRuntimeCountdown({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    busy: false,
    timerPhase: "ANSWERING",
  }),
  true,
);
assert.equal(
  shouldRunInterviewRuntimeCountdown({
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: true,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    busy: false,
    timerPhase: "ANSWERING",
  }),
  false,
);
assert.equal(
  shouldHandleInterviewAnswerTimeout({
    remainingSeconds: 0,
    timerPhase: "ANSWERING",
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    busy: false,
  }),
  true,
);
assert.equal(
  shouldHandleInterviewAnswerTimeout({
    remainingSeconds: 1,
    timerPhase: "ANSWERING",
    setupCompleted: true,
    introCompleted: true,
    questionSpeechCompleted: true,
    questionSpeechPlaying: false,
    hasCurrentQuestion: true,
    currentQuestionLocked: false,
    busy: false,
  }),
  false,
);
assert.equal(
  getInvalidRecordingRecoveryAction({ failedAttemptCount: 1, maxAutoRetryCount: 1 }),
  "retry",
);
assert.equal(
  getInvalidRecordingRecoveryAction({ failedAttemptCount: 2, maxAutoRetryCount: 1 }),
  "hold",
);
assert.deepEqual(
  getRealtimeSilenceEncouragementDecision({
    nowMs: 15000,
    silenceStartedAtMs: 1000,
    currentMicrophoneLevel: 0,
    minimumVoiceLevel: 5,
    hasDetectedVoiceDuringAnswer: false,
    alreadyEncouraged: false,
    remainingSeconds: 60,
  }),
  {
    shouldEncourage: false,
    nextSilenceStartedAtMs: 1000,
  },
);
assert.deepEqual(
  getRealtimeSilenceEncouragementDecision({
    nowMs: 16000,
    silenceStartedAtMs: 1000,
    currentMicrophoneLevel: 0,
    minimumVoiceLevel: 5,
    hasDetectedVoiceDuringAnswer: false,
    alreadyEncouraged: false,
    remainingSeconds: 60,
  }),
  {
    shouldEncourage: true,
    nextSilenceStartedAtMs: 1000,
    text: "괜찮습니다. 천천히 생각하고 말씀해보세요.",
  },
);
assert.deepEqual(
  getRealtimeSilenceEncouragementDecision({
    nowMs: 16000,
    silenceStartedAtMs: 1000,
    currentMicrophoneLevel: 0,
    minimumVoiceLevel: 5,
    hasDetectedVoiceDuringAnswer: false,
    alreadyEncouraged: false,
    remainingSeconds: 60,
    silenceGraceMs: 2000,
  }),
  {
    shouldEncourage: false,
    nextSilenceStartedAtMs: 1000,
  },
);
assert.deepEqual(
  getRealtimeSilenceEncouragementDecision({
    nowMs: 18000,
    silenceStartedAtMs: 1000,
    currentMicrophoneLevel: 0,
    minimumVoiceLevel: 5,
    hasDetectedVoiceDuringAnswer: false,
    alreadyEncouraged: false,
    remainingSeconds: 60,
    silenceGraceMs: 2000,
  }),
  {
    shouldEncourage: true,
    nextSilenceStartedAtMs: 1000,
    text: "괜찮습니다. 천천히 생각하고 말씀해보세요.",
  },
);
assert.deepEqual(
  getRealtimeSilenceEncouragementDecision({
    nowMs: 21000,
    silenceStartedAtMs: 1000,
    currentMicrophoneLevel: 0,
    minimumVoiceLevel: 5,
    hasDetectedVoiceDuringAnswer: true,
    alreadyEncouraged: false,
    remainingSeconds: 60,
  }),
  {
    shouldEncourage: true,
    nextSilenceStartedAtMs: 1000,
    text: "좋습니다. 이어서 말씀해주셔도 됩니다.",
  },
);
assert.deepEqual(
  getRealtimeSilenceEncouragementDecision({
    nowMs: 16000,
    silenceStartedAtMs: 1000,
    currentMicrophoneLevel: 0,
    minimumVoiceLevel: 5,
    hasDetectedVoiceDuringAnswer: false,
    alreadyEncouraged: false,
    remainingSeconds: 15,
  }),
  {
    shouldEncourage: false,
    nextSilenceStartedAtMs: 1000,
  },
);
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
    currentQuestionAnswered: true,
    isCurrentQuestionLast: false,
    generatedFollowUpReady: false,
    answerProcessingBusy: false,
    isReansweringCurrentQuestion: false,
    recording: false,
    answeredQuestionCount: 1,
    totalQuestions: 4,
    gazeRetakeRequired: true,
  }),
  {
    canMoveNextQuestion: false,
    canCompleteInterview: false,
  },
);
const defaultInterviewerSessionModePolicy = resolveInterviewerSessionMode({});
assert.deepEqual(defaultInterviewerSessionModePolicy, {
  requestedMode: "tts-file",
  activeMode: "tts-file",
});
const realtimeDisabledInterviewerSessionModePolicy = resolveInterviewerSessionMode({
  requestedMode: "realtime-voice",
  realtimeVoiceEnabled: false,
});
assert.deepEqual(realtimeDisabledInterviewerSessionModePolicy, {
  requestedMode: "realtime-voice",
  activeMode: "tts-file",
  fallbackReason: "REALTIME_VOICE_DISABLED",
});
const realtimeEnabledInterviewerSessionModePolicy = resolveInterviewerSessionMode({
  requestedMode: "realtime-voice",
  realtimeVoiceEnabled: true,
});
assert.deepEqual(realtimeEnabledInterviewerSessionModePolicy, {
  requestedMode: "realtime-voice",
  activeMode: "realtime-voice",
});
const avatarDisabledInterviewerSessionModePolicy = resolveInterviewerSessionMode({
  requestedMode: "avatar-stream",
  avatarStreamEnabled: false,
});
assert.deepEqual(avatarDisabledInterviewerSessionModePolicy, {
  requestedMode: "avatar-stream",
  activeMode: "tts-file",
  fallbackReason: "AVATAR_STREAM_DISABLED",
});
const invalidInterviewerSessionModePolicy = resolveInterviewerSessionMode({
  requestedMode: "unknown-mode",
});
assert.deepEqual(invalidInterviewerSessionModePolicy, {
  requestedMode: "tts-file",
  activeMode: "tts-file",
  fallbackReason: "INVALID_MODE",
});
const disconnectedInterviewerSessionState = getInterviewerSessionState({
  setupCompleted: false,
  hasCurrentQuestion: false,
  questionSpeechPlaying: false,
  questionSpeechSupported: true,
  recording: false,
  answerProcessingBusy: false,
  busy: false,
  currentQuestionLocked: false,
});
assert.deepEqual(disconnectedInterviewerSessionState, {
  mode: "tts-file",
  phase: "DISCONNECTED",
  label: "면접 준비 중",
  description: "장치 점검과 면접 시작을 기다리고 있습니다.",
  tone: "neutral",
  stageClassName: "",
  avatarClassName: "",
});
const speakingInterviewerSessionState = getInterviewerSessionState({
  setupCompleted: true,
  hasCurrentQuestion: true,
  questionSpeechPlaying: true,
  questionSpeechSupported: true,
  recording: false,
  answerProcessingBusy: false,
  busy: false,
  currentQuestionLocked: false,
  mode: realtimeEnabledInterviewerSessionModePolicy.activeMode,
});
assert.deepEqual(speakingInterviewerSessionState, {
  mode: "realtime-voice",
  phase: "AI_SPEAKING",
  label: "AI 안내 중",
  description: "AI 면접관이 질문 음성을 안내하고 있습니다.",
  tone: "speaking",
  stageClassName: "ai-interviewer-stage--ai-speaking",
  avatarClassName: "speaking",
});
const recordingInterviewerSessionState = getInterviewerSessionState({
  setupCompleted: true,
  hasCurrentQuestion: true,
  questionSpeechPlaying: false,
  questionSpeechSupported: true,
  recording: true,
  answerProcessingBusy: false,
  busy: false,
  currentQuestionLocked: false,
});
assert.deepEqual(recordingInterviewerSessionState, {
  mode: "tts-file",
  phase: "USER_SPEAKING",
  label: "답변 녹화 중",
  description: "지원자의 답변 녹화가 진행 중입니다.",
  tone: "recording",
  stageClassName: "ai-interviewer-stage--user-speaking",
  avatarClassName: "",
});
const fallbackInterviewerSessionState = getInterviewerSessionState({
  setupCompleted: true,
  hasCurrentQuestion: true,
  questionSpeechPlaying: false,
  questionSpeechSupported: false,
  recording: false,
  answerProcessingBusy: false,
  busy: false,
  currentQuestionLocked: false,
});
assert.deepEqual(fallbackInterviewerSessionState, {
  mode: "tts-file",
  phase: "FALLBACK_TTS",
  label: "질문 보기 필요",
  description: "질문 음성 재생을 사용할 수 없어 텍스트 질문으로 진행합니다.",
  tone: "warning",
  stageClassName: "ai-interviewer-stage--fallback",
  avatarClassName: "",
});
const thinkingInterviewerSessionState = getInterviewerSessionState({
  setupCompleted: true,
  hasCurrentQuestion: true,
  questionSpeechPlaying: false,
  questionSpeechSupported: true,
  recording: false,
  answerProcessingBusy: true,
  busy: true,
  currentQuestionLocked: true,
});
assert.deepEqual(thinkingInterviewerSessionState, {
  mode: "tts-file",
  phase: "AI_THINKING",
  label: "답변 처리 중",
  description: "AI 면접관이 답변 처리 결과를 기다리고 있습니다.",
  tone: "thinking",
  stageClassName: "ai-interviewer-stage--ai-thinking",
  avatarClassName: "",
});
const firstInterviewerSessionEvent = createInterviewerSessionEvent({
  sessionId: 10001,
  questionId: 1,
  state: speakingInterviewerSessionState,
  sequence: 1,
  occurredAt: "2026-07-06T00:00:00.000Z",
});
assert.deepEqual(firstInterviewerSessionEvent, {
  id: "interviewer-session-10001-1",
  sequence: 1,
  sessionId: 10001,
  questionId: 1,
  mode: "realtime-voice",
  phase: "AI_SPEAKING",
  label: "AI 안내 중",
  occurredAt: "2026-07-06T00:00:00.000Z",
  source: "runtime-state",
});
const realtimeQuestionSpeechStartedEvent = createInterviewerSessionActionEvent({
  sessionId: 10001,
  questionId: 1,
  mode: "realtime-voice",
  phase: "AI_SPEAKING",
  action: "speech:start",
  label: "Realtime 질문 음성 시작",
  sequence: 2,
  occurredAt: "2026-07-06T00:00:01.000Z",
});
assert.deepEqual(realtimeQuestionSpeechStartedEvent, {
  id: "interviewer-session-10001-2",
  sequence: 2,
  sessionId: 10001,
  questionId: 1,
  mode: "realtime-voice",
  phase: "AI_SPEAKING",
  action: "speech:start",
  label: "Realtime 질문 음성 시작",
  occurredAt: "2026-07-06T00:00:01.000Z",
  source: "runtime-action",
});
assert.equal(
  createInterviewerSessionEvent({
    sessionId: 10001,
    questionId: 1,
    state: speakingInterviewerSessionState,
    sequence: 2,
    occurredAt: "2026-07-06T00:00:01.000Z",
    previousEvent: firstInterviewerSessionEvent,
  }),
  undefined,
);
const secondInterviewerSessionEvent = createInterviewerSessionEvent({
  sessionId: 10001,
  questionId: 1,
  state: recordingInterviewerSessionState,
  sequence: 2,
  occurredAt: "2026-07-06T00:00:02.000Z",
  previousEvent: firstInterviewerSessionEvent,
});
assert.deepEqual(secondInterviewerSessionEvent, {
  id: "interviewer-session-10001-2",
  sequence: 2,
  sessionId: 10001,
  questionId: 1,
  mode: "tts-file",
  phase: "USER_SPEAKING",
  label: "답변 녹화 중",
  occurredAt: "2026-07-06T00:00:02.000Z",
  source: "runtime-state",
});
assert.deepEqual(
  trimInterviewerSessionEvents(
    [
      firstInterviewerSessionEvent,
      secondInterviewerSessionEvent,
    ],
    1,
  ),
  [secondInterviewerSessionEvent],
);

const applicationSummary: CandidateApplicationSummary = {
  applicationId: 1,
  postingId: 1,
  candidateId: 1,
  availabilityStatus: "AVAILABLE",
  unavailableReason: null,
  companyName: "Init Labs",
  jobTitle: "Backend Developer",
  jobRole: "Backend",
  location: "Seoul",
  applicationStatus: "SUBMITTED",
  documentStatus: "SUBMITTED",
  interviewStatus: "READY",
  reportStatus: "PENDING",
  submittedAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z",
  sessionId: 1,
  interviewType: "RECRUITING",
  interviewSessionStatus: "READY",
  interviewWindowStartsAt: "2026-06-29T00:00:00.000Z",
  interviewWindowEndsAt: "2026-07-06T00:00:00.000Z",
  consentCompleted: true,
  deviceCheckCompleted: true,
  canStartInterview: true,
};

const unavailableApplicationSummary: CandidateApplicationSummary = {
  ...applicationSummary,
  applicationId: 99,
  availabilityStatus: "UNAVAILABLE",
  unavailableReason: "INTERVIEW_SESSION_NOT_FOUND",
  companyName: null,
  jobTitle: null,
  jobRole: null,
  location: null,
  sessionId: null,
  interviewType: null,
  interviewSessionStatus: null,
  interviewWindowStartsAt: null,
  interviewWindowEndsAt: null,
  canStartInterview: false,
  reportStatus: "COMPLETED",
};

const completedReportApplicationSummary: CandidateApplicationSummary = {
  ...applicationSummary,
  applicationId: 12,
  companyName: "Init Labs",
  jobTitle: "Backend Developer",
  reportStatus: "COMPLETED",
  updatedAt: "2026-07-09T10:00:00.000Z",
};
const laterCompletedReportApplicationSummary: CandidateApplicationSummary = {
  ...applicationSummary,
  applicationId: 14,
  companyName: "Jungle Cloud",
  jobTitle: "Data Engineer",
  reportStatus: "COMPLETED",
  updatedAt: "2026-07-09T11:00:00.000Z",
};
const generatingReportApplicationSummary: CandidateApplicationSummary = {
  ...applicationSummary,
  applicationId: 13,
  companyName: "Other Labs",
  jobTitle: "Frontend Developer",
  reportStatus: "GENERATING",
  updatedAt: "2026-07-09T10:01:00.000Z",
};
const unreadReportNotifications = buildCandidateReportCompleteNotifications(
  [generatingReportApplicationSummary, completedReportApplicationSummary, unavailableApplicationSummary],
  new Set(),
);
assert.deepEqual(unreadReportNotifications, [
  {
    id: "candidate-report-complete-12",
    applicationId: 12,
    title: "채용 리포트 전송 완료",
    message: "\"Init Labs\" 면접 결과 전송이 정상적으로 이루어졌습니다. 합격을 빕니다.",
    href: "/candidate/applications/12/report",
    createdAt: "2026-07-09T10:00:00.000Z",
    read: false,
  },
]);
assert.equal(countUnreadCandidateNotifications(unreadReportNotifications), 1);
assert.equal(
  countUnreadCandidateNotifications(
    buildCandidateReportCompleteNotifications(
      [completedReportApplicationSummary],
      new Set(["candidate-report-complete-12"]),
    ),
  ),
  0,
);
assert.deepEqual(
  buildCandidateReportCompleteNotifications(
    [completedReportApplicationSummary],
    new Set(),
    new Set(["candidate-report-complete-12"]),
  ),
  [],
);
assert.deepEqual(
  buildCandidateReportCompleteNotifications(
    [completedReportApplicationSummary, laterCompletedReportApplicationSummary],
    new Set(["candidate-report-complete-12"]),
  ).map((notification) => ({
    id: notification.id,
    message: notification.message,
    read: notification.read,
  })),
  [
    {
      id: "candidate-report-complete-14",
      message: "\"Jungle Cloud\" 면접 결과 전송이 정상적으로 이루어졌습니다. 합격을 빕니다.",
      read: false,
    },
    {
      id: "candidate-report-complete-12",
      message: "\"Init Labs\" 면접 결과 전송이 정상적으로 이루어졌습니다. 합격을 빕니다.",
      read: true,
    },
  ],
);
assert.deepEqual(
  buildCandidateScreeningResultNotifications([
    {
      notificationId: 501,
      applicationId: 12,
      postingId: 7,
      companyName: "Init Labs",
      jobTitle: "Backend Developer",
      screeningDecision: "PASS",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    },
  ], new Set()),
  [{
    id: "candidate-screening-result-501",
    applicationId: 12,
    title: "기업 전형 결과가 확정되었습니다",
    message: "Init Labs Backend Developer 전형 결과는 합격입니다.",
    href: "/candidate/applications/12/report",
    createdAt: "2026-07-10T09:00:00.000Z",
    read: false,
  }],
);
assert.equal(
  shouldPollRecruitingReportCompletion({
    interviewStatus: "COMPLETED",
    interviewSessionStatus: "COMPLETED",
    reportStatus: "PENDING",
  }),
  true,
);
assert.equal(
  shouldPollRecruitingReportCompletion({
    interviewStatus: "COMPLETED",
    interviewSessionStatus: "COMPLETED",
    reportStatus: "GENERATING",
  }),
  true,
);
assert.equal(
  shouldPollRecruitingReportCompletion({
    interviewStatus: "COMPLETED",
    interviewSessionStatus: "COMPLETED",
    reportStatus: "COMPLETED",
  }),
  false,
);
assert.equal(getRecruitingReportPollingIntervalMs(119_999), 10_000);
assert.equal(getRecruitingReportPollingIntervalMs(120_000), 30_000);

const candidateJobSummary: CandidateJobSummary = {
  jobId: 1,
  companyName: "Init Labs",
  companyLogoUrl: "https://cdn.example.com/assets/company/1/profile-logo/init.png",
  title: "Backend Developer",
  jobGroup: "Engineering",
  jobRole: "Backend",
  location: "Seoul",
  careerLevel: "Junior",
  employmentType: "Full-time",
  tags: ["Node.js", "NestJS"],
  postingStatus: "OPEN",
  startsOn: "2026-07-01",
  endsOn: "2026-07-31",
  canApply: true,
  alreadyApplied: false,
};

const candidateJobDetail: CandidateJobDetail = {
  ...candidateJobSummary,
  companyId: 1,
  isPublic: true,
  companyIndustry: "SaaS",
  companyProfile: "AI recruiting workflow",
  jobDescription: "NestJS API",
  techStacks: ["Node.js", "NestJS"],
  createdAt: "2026-07-01T00:00:00.000Z",
  jobRoleCode: "서버·백엔드",
  workplaceAddress: null,
  workplaceLat: null,
  workplaceLng: null,
};

const mockReport: CandidateMockReportSummary = {
  sessionId: 10001,
  reportId: 10001,
  interviewType: "MOCK",
  title: null,
  status: "COMPLETED",
  reportStatus: "COMPLETED",
  startedAt: "2026-06-29T00:00:00.000Z",
  completedAt: "2026-06-29T00:10:00.000Z",
  updatedAt: "2026-06-29T00:10:00.000Z",
  totalQuestions: 2,
  answeredCount: 2,
  reportType: "MOCK_INTERVIEW_REPORT",
  feedbackEndpoint: "/api/v1/candidate/mock-interview/reports/10001/feedback",
  mediaEndpoint: "/api/v1/candidate/mock-interview/reports/10001/media",
  generateEndpoint: "/api/v1/candidate/mock-interview/reports/10001/generate",
};

const mockFeedback: CandidateMockReportFeedback = {
  reportId: 10001,
  sessionId: 10001,
  reportType: "MOCK_INTERVIEW_REPORT",
  status: "COMPLETED",
  totalScore: 82,
  summary: "연습 피드백이 준비되었습니다.",
  strengths: ["질문 순서에 맞춰 답변을 제출했습니다."],
  improvements: ["예시는 더 간결하게 정리해보세요."],
  nextPractice: ["녹화된 답변을 다시 확인하세요."],
  scores: [],
  visibilityPolicy: {
    candidateFacingOnly: true,
    excludesHiringDecision: true,
    excludesInternalScores: true,
    excludesCompanyMemo: true,
  },
};

const recruitingReport: CandidateRecruitingReportView = {
  applicationId: 1,
  sessionId: 1,
  reportType: "RECRUITING_REPORT",
  status: "GENERATING",
  applicationStatus: "SUBMITTED",
  interviewStatus: "COMPLETED",
  resultPublicationStatus: "PENDING",
  screeningDecision: "UNDECIDED",
  screeningResultConfirmedAt: null,
  companyName: "Init Labs",
  jobTitle: "Backend Developer",
  candidateMessage: "면접 분석이 진행 중입니다.",
  nextStepLabel: "분석 진행 중",
  scores: [],
  answers: [],
  visibilityPolicy: {
    candidateFacingOnly: true,
    excludesDetailedScores: true,
    excludesEvaluationEvidence: true,
    excludesInternalMemo: true,
    excludesManualEvaluation: true,
  },
};

const applicationInterviewHref = getCandidateApplicationInterviewActionHref(applicationSummary);
const applicationReportHref = getCandidateApplicationReportHref(applicationSummary);
const applicationCanStart = isCandidateInterviewStartEnabled(applicationSummary);
assert.equal(isCandidateApplicationCancelable(applicationSummary), true);
assert.equal(
  isCandidateApplicationCancelable({ ...applicationSummary, applicationStatus: "CANCELED" }),
  false,
);
assert.equal(
  isCandidateApplicationCancelable({ ...applicationSummary, interviewStatus: "IN_PROGRESS" }),
  false,
);
const mockInterviewHref = getMockInterviewHref({ sessionId: 10001 });
const mockInterviewDeviceCheckHref = getMockInterviewDeviceCheckHref({ sessionId: 10001 });
const mockReportHref = getMockReportHref(mockReport);
const mockFeedbackIsSafe = isCandidateFacingMockFeedbackSafe(mockFeedback);
const recruitingReportIsLimited = isCandidateRecruitingReportLimited(recruitingReport);
assert.equal(recruitingReport.screeningDecision, "UNDECIDED");
const generatingResult = getCandidateScreeningResultPresentation(recruitingReport);
assert.deepEqual(
  {
    badge: generatingResult.badge,
    tone: generatingResult.tone,
    actionHref: generatingResult.actionHref,
  },
  {
    badge: "분석 중",
    tone: "undecided",
    actionHref: "/candidate/applications",
  },
);
const passResult = getCandidateScreeningResultPresentation({ status: "COMPLETED", screeningDecision: "PASS" });
assert.equal(passResult.badge, "합격");
assert.equal(passResult.nextStepTitle, "기업의 후속 안내를 확인해주세요.");
assert.equal(passResult.actionHref, "/candidate/applications");
const holdResult = getCandidateScreeningResultPresentation({ status: "COMPLETED", screeningDecision: "HOLD" });
assert.equal(holdResult.badge, "보류");
assert.equal(holdResult.tone, "hold");
const undecidedResult = getCandidateScreeningResultPresentation({ status: "COMPLETED", screeningDecision: "UNDECIDED" });
assert.equal(undecidedResult.badge, "검토 중");
assert.equal(undecidedResult.tone, "undecided");
const failResult = getCandidateScreeningResultPresentation({ status: "COMPLETED", screeningDecision: "FAIL" });
assert.equal(failResult.badge, "불합격");
assert.equal(failResult.title, "이번 지원 결과는 불합격입니다.");
assert.equal(failResult.actionHref, "/candidate/jobs");
const retryResult = getCandidateScreeningResultPresentation({ status: "FAILED", screeningDecision: "RETRY" });
assert.equal(retryResult.badge, "결과 확인 중");
assert.equal(retryResult.tone, "retry");
assert.equal(retryResult.showGeneratedAt, false);
const unknownScreeningResult = getCandidateScreeningResultPresentation({ status: "COMPLETED", screeningDecision: "PENDING_REVIEW" });
assert.equal(unknownScreeningResult.badge, "결과 확인 중");
assert.equal(unknownScreeningResult.showGeneratedAt, false);
assert.equal(getCandidatePassRevealStorageKey(17), "candidate-screening-result-seen:17:PASS");
assert.equal(
  shouldShowCandidatePassReveal({ status: "COMPLETED", screeningDecision: "PASS" }, null),
  true,
);
assert.equal(
  shouldShowCandidatePassReveal({ status: "COMPLETED", screeningDecision: "PASS" }, "true"),
  false,
);
assert.equal(
  shouldShowCandidatePassReveal({ status: "GENERATING", screeningDecision: "PASS" }, null),
  false,
);
const recruitingReadyShowsDeviceSetup = shouldShowInterviewDeviceSetup({
  mode: "recruiting",
  setupCompleted: false,
  runtimeStatus: "READY",
});
const recruitingInProgressSkipsDeviceSetup = shouldShowInterviewDeviceSetup({
  mode: "recruiting",
  setupCompleted: false,
  runtimeStatus: "IN_PROGRESS",
});
const completedInterviewSkipsDeviceSetup = shouldShowInterviewDeviceSetup({
  mode: "recruiting",
  setupCompleted: false,
  runtimeStatus: "COMPLETED",
});

const mockInterviewsPath = candidateApiPaths.mockInterviews;
const mockRuntimePath = candidateApiPaths.mockRuntime(10001);
const mockQuestionsPath = candidateApiPaths.mockQuestions(10001);
const mockAnswerPath = candidateApiPaths.mockAnswers(10001);
const mockNextQuestionPath = candidateApiPaths.mockNextQuestion(10001);
const mockCompletePath = candidateApiPaths.mockComplete(10001);
const mockSttPath = candidateApiPaths.mockStt(10001);
const mockFollowUpPath = candidateApiPaths.mockFollowUpQuestion(10001);
const mockRealtimeSessionPath = candidateApiPaths.mockRealtimeSession(10001);
const mockReportsPath = candidateApiPaths.mockReports;
const mockHistoryPath = candidateApiPaths.mockHistory;
const mockReportFeedbackPath = candidateApiPaths.mockReportFeedback(10001);
const mockReportMediaPath = candidateApiPaths.mockReportMedia(10001);
const mockReportGeneratePath = candidateApiPaths.mockReportGenerate(10001);
const applicationsPath = candidateApiPaths.applications;
const cancelApplicationPath = candidateApiPaths.cancelApplication(1);
assert.equal(cancelApplicationPath, "/api/v1/candidate/applications/1/cancel");
const interviewGuidePath = candidateApiPaths.interviewGuide(1);
const applicationReportPath = candidateApiPaths.applicationReport(1);
const applicationReportGeneratePath = candidateApiPaths.applicationReportGenerate(1);
const applicationStatusPath = candidateApiPaths.applicationStatus(1);
const deviceCheckPath = candidateApiPaths.deviceCheck(1);
const startInterviewPath = candidateApiPaths.startInterview(1);
const runtimePath = candidateApiPaths.interviewRuntime(1);
const recruitingQuestionsPath = candidateApiPaths.recruitingQuestions(1);
const recruitingAnswerPath = candidateApiPaths.recruitingAnswers(1);
const recruitingNextQuestionPath = candidateApiPaths.recruitingNextQuestion(1);
const recruitingCompletePath = candidateApiPaths.recruitingComplete(1);
const recruitingSttPath = candidateApiPaths.recruitingStt(1);
const recruitingFollowUpPath = candidateApiPaths.recruitingFollowUpQuestion(1);
const recruitingRealtimeSessionPath = candidateApiPaths.recruitingRealtimeSession(1);
assert.equal(mockRealtimeSessionPath, "/api/v1/candidate/mock-interviews/10001/realtime-session");
assert.equal(recruitingRealtimeSessionPath, "/api/v1/candidate/interviews/1/realtime-session");

function createContractRealtimeAudioTrack(enabled = true): MediaStreamTrack {
  const track = {
    kind: "audio",
    readyState: "live" as MediaStreamTrackState,
    enabled,
    clone() {
      return createContractRealtimeAudioTrack(track.enabled);
    },
    stop() {
      track.readyState = "ended";
    },
  };
  return track as MediaStreamTrack;
}

const realtimeConnectionStates: RTCPeerConnectionState[] = [];
const realtimeDataChannelStates: RTCDataChannelState[] = [];
const realtimeWebRtcConnectionPromise = createRealtimeInterviewWebRtcConnection({
  session: {
    accepted: true,
    sessionId: 1,
    interviewType: "MOCK",
    mode: "realtime-voice",
    provider: "openai",
    model: "gpt-realtime-2",
    voice: "marin",
    transport: "webrtc",
    clientSecret: "ephemeral-client-secret",
    clientSecretType: "ephemeral",
    expiresAt: "2026-07-06T00:00:00.000Z",
    endpoint: "https://api.openai.com/v1/realtime/calls",
  },
  localStream: {
    getAudioTracks: () => [createContractRealtimeAudioTrack()],
  } as MediaStream,
  onConnectionStateChange: (state) => realtimeConnectionStates.push(state),
  onDataChannelStateChange: (state) => realtimeDataChannelStates.push(state),
  fetcher: async (_input, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, "local-offer-sdp");
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer ephemeral-client-secret",
      "Content-Type": "application/sdp",
    });
    return new Response("remote-answer-sdp", { status: 200 });
  },
  peerConnectionFactory: () =>
    ({
      connectionState: "new",
      onconnectionstatechange: null,
      ontrack: null,
      addTrack: () => ({} as RTCRtpSender),
      createDataChannel: (label) => {
        assert.equal(label, "oai-events");
        const dataChannel: ReturnType<RealtimePeerConnectionLike["createDataChannel"]> = {
          readyState: "connecting",
          close: () => undefined,
          send: () => undefined,
          onmessage: null,
          onopen: null,
          onclose: null,
          onerror: null,
        };
        queueMicrotask(() => {
          dataChannel.readyState = "open";
          dataChannel.onopen?.call(dataChannel as unknown as RTCDataChannel, {} as Event);
        });
        return dataChannel;
      },
      createOffer: async () => ({ type: "offer", sdp: "local-offer-sdp" }),
      setLocalDescription: async (description) => {
        assert.equal(description.sdp, "local-offer-sdp");
      },
      setRemoteDescription: async (description) => {
        assert.equal(description.type, "answer");
        assert.equal(description.sdp, "remote-answer-sdp");
      },
      close: () => undefined,
    }) satisfies RealtimePeerConnectionLike,
});

const applyActionHref = getCandidateJobDetailActionHref({
  jobId: 1,
  canApply: true,
  alreadyApplied: false,
});

const appliedActionHref = getCandidateJobDetailActionHref({
  jobId: 1,
  canApply: false,
  alreadyApplied: true,
});

const disabledActionHref = getCandidateJobDetailActionHref({
  jobId: 1,
  canApply: false,
  alreadyApplied: false,
});

const errorBody: ApiErrorBody = {
  error: {
    code: "COMMON_VALIDATION_FAILED",
    message: "입력값을 확인해주세요.",
    details: [{ field: "email", reason: "INVALID_FORMAT" }],
  },
  meta: {
    traceId: "trace-test",
    timestamp: "2026-06-29T00:00:00.000Z",
  },
};

void query;
void closedFilterQuery;
void submitRequest;
void resumeRequest;
void portfolioRequest;
void interviewConsentRequest;
void deviceCheckRequest;
void cameralessTestDeviceCheckState;
void cameralessTestDeviceCheckRequest;
void mockInterviewerProfile;
void mockInterviewerInfoShortcutKey;
void recruitingInterviewerProfile;
void healthyMicrophoneTone;
void compactViewportLockClassName;
void immersiveViewportLockClassName;
void startMockRequest;
void answerRequest;
void macosAudioAnswerRequest;
void macosChunkFallbackMimeType;
void requestedMimeTypeFallback;
void unsupportedRecordedMimeType;
void questionSpeechText;
void audioPromptSpeechText;
void applicationSummary;
void candidateJobSummary;
void candidateJobDetail;
void mockReport;
void mockFeedback;
void recruitingReport;
void applicationInterviewHref;
void applicationReportHref;
void applicationCanStart;
void mockInterviewHref;
void mockInterviewDeviceCheckHref;
void mockReportHref;
void mockFeedbackIsSafe;
void recruitingReportIsLimited;
void recruitingReadyShowsDeviceSetup;
void recruitingInProgressSkipsDeviceSetup;
void completedInterviewSkipsDeviceSetup;
void mockInterviewsPath;
void mockRuntimePath;
void mockQuestionsPath;
void mockAnswerPath;
void mockNextQuestionPath;
void mockCompletePath;
void mockSttPath;
void mockFollowUpPath;
void mockRealtimeSessionPath;
void realtimeWebRtcConnectionPromise;
void mockReportsPath;
void mockHistoryPath;
void mockReportFeedbackPath;
void mockReportMediaPath;
void mockReportGeneratePath;
void applicationsPath;
void cancelApplicationPath;
void interviewGuidePath;
void applicationReportPath;
void applicationReportGeneratePath;
void applicationStatusPath;
void deviceCheckPath;
void startInterviewPath;
void runtimePath;
void recruitingQuestionsPath;
void recruitingAnswerPath;
void recruitingNextQuestionPath;
void recruitingCompletePath;
void recruitingSttPath;
void recruitingFollowUpPath;
void recruitingRealtimeSessionPath;
void applyActionHref;
void appliedActionHref;
void disabledActionHref;
void errorBody;

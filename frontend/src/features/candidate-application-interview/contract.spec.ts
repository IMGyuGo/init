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
import {
  createRealtimeInterviewWebRtcConnection,
  type RealtimePeerConnectionLike,
} from "./realtime-webrtc";
import {
  estimateHeadPoseAngles,
  resolveCombinedGazeSignal,
} from "./nonverbal-integrity";
import {
  clampCameraPipPosition,
  createCameralessInterviewTestDeviceCheckState,
  createInterviewerSessionActionEvent,
  createInterviewerSessionEvent,
  buildCandidateReportCompleteNotifications,
  countUnreadCandidateNotifications,
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
  getInterviewRuntimeProgressionState,
  getInterviewRuntimeStatusChips,
  getInterviewerSessionState,
  getInvalidRecordingRecoveryAction,
  getRealtimeSilenceEncouragementDecision,
  getRealtimeSessionUserNotice,
  getTimedOutAiJobStatus,
  hasMeaningfulInterviewRecordingVoice,
  isInterviewSpeechPlaybackEventCurrent,
  resolveInterviewerSessionMode,
  shouldAutoStartInterviewRecording,
  shouldContinueInterviewWithoutFollowUp,
  shouldPollRecruitingReportCompletion,
  shouldEnableManualInterviewRecording,
  shouldOpenRealtimeMicrophoneForRecordingStart,
  shouldRunInterviewRuntimeCountdown,
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

const normalCombinedGazeSignal = resolveCombinedGazeSignal({
  irisBaseline: { horizontalRatio: 0.5, verticalRatio: 0.5 },
  irisPosition: { horizontalRatio: 0.55, verticalRatio: 0.53 },
  headPoseBaseline: { yawDegrees: 0, pitchDegrees: 0 },
  headPose: { yawDegrees: 8, pitchDegrees: 6 },
});
assert.equal(normalCombinedGazeSignal, undefined);

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

const submitRequest: SubmitApplicationRequest = toSubmitApplicationRequest({
  candidateName: " Kim ",
  email: " kim@example.com ",
  phone: " 010-0000-0000 ",
  resumeFileId: 1,
  portfolioUrl: " https://portfolio.example.com/kim ",
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
  attempts: 8,
  intervalMs: 500,
});
assert.equal(shouldContinueInterviewWithoutFollowUp({ failureCategory: "TIMEOUT" }), true);
assert.equal(shouldContinueInterviewWithoutFollowUp({ pipelineError: new Error("worker unavailable") }), true);
assert.equal(shouldContinueInterviewWithoutFollowUp({ failureCategory: "REANSWER_REQUIRED" }), false);
assert.equal(getRealtimeSessionUserNotice({ provider: "mock" }), "");
assert.equal(getRealtimeSessionUserNotice({ provider: "openai" }), "실시간 AI 면접 연결을 준비했습니다.");
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
    recording: false,
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
    recording: false,
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
    timerPhase: "ANSWERING",
    recording: true,
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
    recording: true,
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
    generatedFollowUpReady: false,
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
    generatedFollowUpReady: false,
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
    generatedFollowUpReady: false,
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
  [generatingReportApplicationSummary, completedReportApplicationSummary],
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
};

const mockReport: CandidateMockReportSummary = {
  sessionId: 10001,
  reportId: 10001,
  interviewType: "MOCK",
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
const mockInterviewHref = getMockInterviewHref({ sessionId: 10001 });
const mockInterviewDeviceCheckHref = getMockInterviewDeviceCheckHref({ sessionId: 10001 });
const mockReportHref = getMockReportHref(mockReport);
const mockFeedbackIsSafe = isCandidateFacingMockFeedbackSafe(mockFeedback);
const recruitingReportIsLimited = isCandidateRecruitingReportLimited(recruitingReport);
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
const mockFollowUpInsertPath = candidateApiPaths.mockFollowUpQuestionInsert(10001);
const mockRealtimeSessionPath = candidateApiPaths.mockRealtimeSession(10001);
const mockReportsPath = candidateApiPaths.mockReports;
const mockHistoryPath = candidateApiPaths.mockHistory;
const mockReportFeedbackPath = candidateApiPaths.mockReportFeedback(10001);
const mockReportMediaPath = candidateApiPaths.mockReportMedia(10001);
const mockReportGeneratePath = candidateApiPaths.mockReportGenerate(10001);
const applicationsPath = candidateApiPaths.applications;
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
const recruitingFollowUpInsertPath = candidateApiPaths.recruitingFollowUpQuestionInsert(1);
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
void mockFollowUpInsertPath;
void mockRealtimeSessionPath;
void realtimeWebRtcConnectionPromise;
void mockReportsPath;
void mockHistoryPath;
void mockReportFeedbackPath;
void mockReportMediaPath;
void mockReportGeneratePath;
void applicationsPath;
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
void recruitingFollowUpInsertPath;
void recruitingRealtimeSessionPath;
void applyActionHref;
void appliedActionHref;
void disabledActionHref;
void errorBody;

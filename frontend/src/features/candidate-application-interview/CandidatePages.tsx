"use client";

import "./CandidatePages.module.css";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DependencyList, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarker as MediaPipeFaceLandmarker, NormalizedLandmark, ObjectDetector as MediaPipeObjectDetector } from "@mediapipe/tasks-vision";

import {
  clampPercent,
  competencyBand,
  CompetencyRadar,
  ReportGauge,
  scoreBand,
} from "../interview-report/report-visuals";

import { getApiBaseUrl } from "../../api/api-base-url";
import { getAccessToken } from "../../api/client";
import { sendClientPerformanceLog } from "../ai-performance/api";
import { resolveClientNextStepType } from "../ai-performance/client-next-step";
import { GnbAvatar, GnbLogoutButton } from "../auth/GnbAccountControls";
import { useAuth } from "../auth/AuthProvider";
import { createPaymentOrder, getCandidateMockInterviewPassSummary, grantCandidateMockInterviewDevPasses, listPaymentOrders } from "../payment/api";
import { PaymentOrderPagination, formatDateTime as formatPaymentDateTime, formatWon } from "../payment/CompanyBillingPage";
import { requestTossCardPayment } from "../payment/toss-sdk";
import {
  CANDIDATE_FREE_MOCK_INTERVIEW_POLICY,
  CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT,
  EMPTY_PAYMENT_ORDER_PAGE,
  PAYMENT_HISTORY_PAGE_LIMIT,
  type CandidateMockInterviewPassSummary,
  type PaymentOrder,
  type PaymentOrderPageMeta,
} from "../payment/types";
import {
  CandidateApiError,
  type AiInterviewHandoffResponse,
  type AiInterviewRequest,
  type AiJobStatusResponse,
  type CandidateApplicationStatusView,
  type CandidateApplicationSummary,
  type CandidateFileAsset,
  type CandidateFolder,
  type CandidateFolderInput,
  type CandidateProfileSnapshotV1,
  type CandidateFollowUpQuestionView,
  type CandidateInterviewRuntimeView,
  type CandidateJobQuery,
  type CandidateJobSummary,
  type CandidateMockInterviewHistoryItem,
  type CandidateMockReportSummary,
  type CandidateMockReportFeedback,
  type CandidateMockReportMedia,
  type CandidateReportAnswerView,
  type CandidateReportEvidenceView,
  type CandidateReportScoreView,
  type CandidateRecruitingReportView,
  type InterviewRuntimeSessionView,
  type QuestionType,
  type RuntimeFileAssetRequest,
  type RuntimeQuestionListResponse,
  type RuntimeQuestionView,
  type SaveInterviewAnswerRequest,
  type RealtimeInterviewSessionResponse,
  createCandidateApiClient,
  createPublicInterviewApiClient,
  isInterviewGazeDataInvalidError,
  publicCandidateApiPaths,
  type InterviewRuntimeApiClient,
} from "./api";
import { CandidateProfileSection } from "./CandidateProfileSection";
import { CandidateProfileSnapshotEditor } from "./CandidateProfileSnapshotEditor";
import { isCandidateApplicationCancelable } from "./application-cancellation";
import { isCandidateDemoCommandShortcut } from "./candidate-demo-tools";
import { getRecruitingRuntimeTotalQuestions } from "./demo-preset-runtime";
import {
  createRealtimeInterviewSpeechResponseEvent,
  createRealtimeInterviewWebRtcConnection,
  getRealtimeAudioCompletedResponseId,
  getRealtimeResponseMetadata,
  sendRealtimeSpeechClientEvent,
  setRealtimeInterviewMicrophoneEnabled,
  shouldRestoreRealtimeMicrophoneAfterSpeechResponse,
  shouldStartRealtimeSession,
  type RealtimeInterviewWebRtcConnection,
  type RealtimeResponseMetadata,
} from "./realtime-webrtc";
import {
  createRealtimeSttRelaySession,
  type RealtimeSttRelayMetric,
  type RealtimeSttRelaySession,
} from "./realtime-stt-relay";
import { InterviewAvatar } from "./InterviewAvatar";
import { candidateApplicationInterviewRoutes } from "./routes";
import {
  GAZE_CALIBRATION_REQUIRED_SAMPLES,
  classifyIrisGazeDirection,
  countPersonDetections,
  isFacePositionShifted,
  estimateHeadPoseAngles,
  estimateIrisGazePosition,
  isReliableGazeCalibrationFrame,
  isWithinDetectionGrace,
  resolveCombinedGazeSignal,
  smoothIrisGazePosition,
  updateFacePositionBaseline,
  updateMultiplePeopleDetectionState,
  updateSustainedDetectionState,
  type FacePositionSnapshot,
  type GazeDirection,
  type GazeSignalSource,
  type HeadPoseAngles,
  type IrisGazePosition,
} from "./nonverbal-integrity";
import {
  INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES,
  evaluateTimelineAnalysisQuality,
  normalizeGazeTimelineOffset,
  readGazeAwayIntervals,
  readGazeTimeline,
  readHeadPoseTimeline,
  summarizeGazeTimeline,
  summarizeHeadPoseTimeline,
  type InterviewGazeAwayInterval,
  type InterviewGazeTimelineSample,
  type InterviewHeadPoseTimelineSample,
} from "./nonverbal-analysis";
import {
  buildNonverbalDeviceQaExport,
  collectNonverbalDeviceQaEnvironment,
  createNonverbalDeviceQaRun,
  finishNonverbalDeviceQaScenario,
  readNonverbalDeviceQaCamera,
  startNonverbalDeviceQaScenario,
  summarizeNonverbalDeviceQaRun,
  type NonverbalDeviceQaRun,
  type NonverbalDeviceQaScenarioKind,
  type NonverbalDeviceQaSummary,
} from "./nonverbal-device-qa";
import {
  type CameraPipPosition,
  type CandidateApplicationFormState,
  applyFolderToApplicationForm,
  canSubmitInterviewAnswer,
  type CandidateDeviceCheckState,
  type CandidateInterviewConsentState,
  type CandidateNotificationItem,
  type InterviewAnswerFormState,
  type InterviewRuntimePrimaryScreen,
  type InterviewerSessionEvent,
  type StartMockInterviewState,
  buildCandidateReportCompleteNotification,
  buildCandidateReportCompleteNotifications,
  clampCameraPipPosition,
  countUnreadCandidateNotifications,
  createInterviewAnswerFormStateForQuestion,
  createInterviewerSessionActionEvent,
  defaultApplicationFormState,
  defaultCandidateJobQuery,
  defaultDeviceCheckState,
  defaultInterviewAnswerFormState,
  defaultInterviewConsentState,
  defaultStartMockInterviewState,
  createCameralessInterviewTestDeviceCheckState,
  createInterviewerSessionEvent,
  formatAiInterviewerQuestionPrompt,
  getAiInterviewerProfile,
  getDefaultCameraPipPosition,
  getInterviewMediaFileExtension,
  getInterviewRuntimeFullscreenActive,
  getInterviewRuntimeLayoutState,
  getInterviewAiPollingPolicy,
  getInterviewRuntimePipShortcutState,
  getInterviewRuntimeProgressionState,
  getInterviewRuntimeScreenSwapState,
  getInterviewRuntimeStatusChips,
  getInterviewerSessionState,
  getInvalidRecordingRecoveryAction,
  getRecruitingReportPollingIntervalMs,
  getRealtimeSilenceEncouragementDecision,
  getRealtimeSessionUserNotice,
  getRuntimeDeviceRecheckState,
  getTimedOutAiJobStatus,
  hasMeaningfulInterviewRecordingVoice,
  getCandidateApplicationReportHref,
  getMockInterviewDeviceCheckHref,
  isInterviewSpeechPlaybackEventCurrent,
  normalizeInterviewMediaMimeType,
  requiredInterviewConsents,
  resolveRecordedMimeType,
  resolveInterviewerSessionMode,
  shouldAutoStartInterviewRecording,
  shouldContinueInterviewWithoutFollowUp,
  shouldDeferQuestionTransitionForFollowUp,
  shouldEnableManualInterviewRecording,
  shouldHandleInterviewAnswerTimeout,
  shouldOpenRealtimeMicrophoneForRecordingStart,
  shouldPollRecruitingReportCompletion,
  shouldRunInterviewRuntimeCountdown,
  shouldShowPaymentDevTools,
  shouldShowInterviewDeviceSetup,
  trimInterviewerSessionEvents,
  toDeviceCheckRequest,
  toRuntimeQuestionSpeechText,
  toRecordingValidationSkipRequest,
  toSaveInterviewAnswerRequest,
  toSaveInterviewConsentRequest,
  toStartMockInterviewRequest,
} from "./view-model";
import { candidateAccountBillingNav, candidateNavLabels, isCandidateAccountBillingPath } from "./candidate-nav-config";
import { toCandidateApplicationError, type CandidateApplicationErrorState } from "./candidate-application-error";
import { CandidateApplicationView, CandidateApplyModal, CandidateJobDetailView, CandidateJobsView } from "./views";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
const AI_INTERVIEWER_SESSION_MODE_POLICY = resolveInterviewerSessionMode({
  requestedMode: process.env.NEXT_PUBLIC_AI_INTERVIEWER_SESSION_MODE,
  realtimeVoiceEnabled: process.env.NEXT_PUBLIC_AI_INTERVIEWER_REALTIME_ENABLED === "true",
  avatarStreamEnabled: process.env.NEXT_PUBLIC_AI_INTERVIEWER_AVATAR_STREAM_ENABLED === "true",
});
const SHOW_PAYMENT_DEV_TOOLS = shouldShowPaymentDevTools({ nodeEnv: process.env.NODE_ENV });
// DEV-ONLY camera bypass: remove this flag, storage helpers, and matching buttons together when it is no longer needed.
const ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY = process.env.NODE_ENV !== "production";
const CAMERALESS_INTERVIEW_TEST_ENTRY_STORAGE_KEY_PREFIX = "init.cameralessInterviewTestEntry";
const CANDIDATE_NOTIFICATION_READ_IDS_STORAGE_KEY = "init.candidateNotificationReadIds";
const CANDIDATE_NOTIFICATION_DISMISSED_IDS_STORAGE_KEY = "init.candidateNotificationDismissedIds";
const CANDIDATE_REPORT_NOTIFICATION_EVENT = "init:candidate-report-complete";
const CANDIDATE_APPLY_DRAFT_STORAGE_KEY = "init.candidateApplyDraft.v1";
const DEMO_CANDIDATE_ID = 1;
export const PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY = "init.publicInterviewAccessToken";
const DEFAULT_INTERVIEW_QUESTION_TIME_LIMIT_SECONDS = 90;
const DEFAULT_MOCK_INTERVIEW_PREPARATION_TIME_LIMIT_SECONDS = 0;
const REALTIME_STT_RELAY_ENABLED = process.env.NEXT_PUBLIC_OPENAI_REALTIME_STT_RELAY_ENABLED !== "false";
const MIN_INTERVIEW_RECORDING_DURATION_SECONDS = 3;
const MIN_INTERVIEW_RECORDING_BLOB_SIZE_BYTES = 10 * 1024;
const MIN_INTERVIEW_RECORDING_VOICE_LEVEL = 3;
const MIN_INTERVIEW_RECORDING_VOICE_FRAME_COUNT = 6;
const MAX_INVALID_RECORDING_AUTO_RETRY_COUNT = 1;
const GAZE_DATA_RETAKE_GUIDANCE = "시선 데이터가 정상 범위를 벗어났습니다. 얼굴 전체가 보이도록 카메라를 눈높이에 두고 화면 중앙을 바라본 뒤 다시 촬영해 주세요.";
const REALTIME_SILENCE_GRACE_MS = 2000;
const NONVERBAL_SHORT_ANSWER_SECONDS = 10;
const NONVERBAL_CAMERA_SAMPLE_INTERVAL_MS = 500;
const NONVERBAL_FACE_SAMPLE_SIZE = 240;
const NONVERBAL_FACE_EDGE_MARGIN_RATIO = 0.08;
const NONVERBAL_FACE_MIN_AREA_RATIO = 0.04;
const NONVERBAL_FACE_BASELINE_REQUIRED_SAMPLES = 4;
const NONVERBAL_FACE_SHIFT_RATIO = 0.28;
const NONVERBAL_FACE_SHIFT_MINIMUM_AREA_DELTA = 0.1;
const NONVERBAL_FACE_SHIFT_RELATIVE_AREA_MULTIPLIER = 1.6;
const NONVERBAL_FACE_SHIFT_CONFIRMATION_MS = 1000;
const NONVERBAL_GAZE_AWAY_CONFIRMATION_MS = 1500;
const NONVERBAL_GAZE_CENTERED_CONFIRMATION_MS = 750;
const NONVERBAL_GAZE_SIGNAL_DROPOUT_GRACE_MS = 650;
const NONVERBAL_TIMELINE_SAMPLE_INTERVAL_MS = 1000;
const NONVERBAL_AUDIO_SPEAKING_LEVEL = 6;
const NONVERBAL_AUDIO_SPEAKING_RATIO_THRESHOLD = 0.35;
const NONVERBAL_MOUTH_OPEN_RATIO_THRESHOLD = 0.06;
const NONVERBAL_MOUTH_MOVEMENT_DELTA_THRESHOLD = 0.015;
const NONVERBAL_MOUTH_SYNC_MISMATCH_GRACE_MS = 2500;
const NONVERBAL_VOICE_WITHOUT_FACE_GRACE_MS = 2500;
const NONVERBAL_EARLY_SCREEN_AWAY_WINDOW_MS = 10000;
const NONVERBAL_STATIC_FRAME_SAMPLE_WIDTH = 32;
const NONVERBAL_STATIC_FRAME_SAMPLE_HEIGHT = 18;
const NONVERBAL_STATIC_FRAME_DIFF_THRESHOLD = 2.5;
const NONVERBAL_STATIC_FRAME_GRACE_MS = 5000;
const RUNTIME_INTEGRITY_WARNING_DURATION_MS = 5000;
const RUNTIME_INTEGRITY_WARNING_REPEAT_COOLDOWN_MS = 3500;
const MEDIAPIPE_TASKS_VISION_VERSION = "0.10.35";
const MEDIAPIPE_TASKS_VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VISION_VERSION}/wasm`;
const MEDIAPIPE_FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const MEDIAPIPE_PERSON_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";
const NONVERBAL_PERSON_DETECTION_SCORE_THRESHOLD = 0.35;
const NONVERBAL_PERSON_SAMPLE_INTERVAL_MS = 500;
const NONVERBAL_MULTIPLE_PEOPLE_CONFIRMATION_WINDOW_MS = 1500;
const NONVERBAL_MULTIPLE_PEOPLE_REQUIRED_SAMPLES = 2;
const NONVERBAL_MULTIPLE_PEOPLE_RELEASE_GRACE_MS = 1500;
const REALTIME_SPEECH_RESPONSE_TIMEOUT_MS = 30000;
const BROWSER_SPEECH_START_TIMEOUT_MS = 2500;
const BROWSER_SPEECH_MIN_COMPLETION_TIMEOUT_MS = 8000;
const BROWSER_SPEECH_MAX_COMPLETION_TIMEOUT_MS = 45000;
const MIN_STT_TRANSCRIPT_MEANINGFUL_LENGTH = 10;
const RUNTIME_PIP_RESERVED_TOP_HEIGHT = 96;
const MAX_INTERVIEWER_SESSION_EVENTS = 40;
const questionTypeOptions: QuestionType[] = ["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "CLOSING"];

type CandidateNavSection = "jobs" | "applications" | "interview" | "reports" | "accountBilling" | "performance";
type AsyncState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};
type RuntimeMode = "mock" | "recruiting";
type RuntimeTimerPhase = "PREPARING" | "ANSWERING";
type RealtimeSessionStatus = "idle" | "requesting" | "connecting" | "ready" | "failed";
type RealtimeProviderState = RealtimeInterviewSessionResponse["provider"] | "none";
type InterviewIntegrityEventType =
  | "TAB_HIDDEN"
  | "WINDOW_BLUR"
  | "CAMERA_LOST"
  | "FACE_MISSING"
  | "FACE_OUT_OF_FRAME"
  | "MULTIPLE_FACES"
  | "FACE_POSITION_SHIFT"
  | "GAZE_AWAY"
  | "VOICE_MOUTH_MISMATCH"
  | "VOICE_WITHOUT_FACE"
  | "STATIC_VIDEO_FRAME"
  | "EARLY_SCREEN_AWAY";
type InterviewIntegritySuspicionLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";
type InterviewIntegrityEvent = {
  type: InterviewIntegrityEventType;
  occurredAt: string;
  offsetMs?: number;
  durationMs?: number;
  direction?: GazeDirection;
  source?: GazeSignalSource;
};
type RuntimeIntegrityWarning = {
  type: InterviewIntegrityEventType;
  message: string;
  occurredAt: string;
};
type NonverbalDeviceQaPanelSnapshot = {
  run: NonverbalDeviceQaRun;
  summary: NonverbalDeviceQaSummary;
};
type NonverbalQaVideoFrameMetadata = {
  presentedFrames: number;
};
type NonverbalQaVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: NonverbalQaVideoFrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};
type BrowserDetectedFace = {
  boundingBox: DOMRectReadOnly;
};
type BrowserFaceDetector = {
  detect(image: CanvasImageSource): Promise<BrowserDetectedFace[]>;
};
type BrowserFaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetector;

type MediaPipeFaceLandmarkerModule = typeof import("@mediapipe/tasks-vision");
type MediaPipeVisionRuntime = {
  tasks: MediaPipeFaceLandmarkerModule;
  vision: Awaited<ReturnType<MediaPipeFaceLandmarkerModule["FilesetResolver"]["forVisionTasks"]>>;
};

let mediaPipeVisionRuntimePromise: Promise<MediaPipeVisionRuntime> | null = null;
let mediaPipeDiagnosticFilterDepth = 0;
let restoreMediaPipeConsole: (() => void) | null = null;

function isBenignMediaPipeDiagnostic(args: unknown[]): boolean {
  const message = args.map((value) => String(value)).join(" ");
  return (
    message.includes("Created TensorFlow Lite XNNPACK delegate for CPU") ||
    message.includes("OpenGL error checking is disabled") ||
    message.includes("GL version:")
  );
}

function beginMediaPipeDiagnosticFilter(): () => void {
  if (mediaPipeDiagnosticFilterDepth === 0) {
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => {
      if (!isBenignMediaPipeDiagnostic(args)) originalError(...args);
    };
    console.warn = (...args: unknown[]) => {
      if (!isBenignMediaPipeDiagnostic(args)) originalWarn(...args);
    };
    restoreMediaPipeConsole = () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }

  mediaPipeDiagnosticFilterDepth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mediaPipeDiagnosticFilterDepth = Math.max(0, mediaPipeDiagnosticFilterDepth - 1);
    if (mediaPipeDiagnosticFilterDepth === 0) {
      restoreMediaPipeConsole?.();
      restoreMediaPipeConsole = null;
    }
  };
}

async function withFilteredMediaPipeDiagnostics<T>(task: () => Promise<T>): Promise<T> {
  const release = beginMediaPipeDiagnosticFilter();
  try {
    return await task();
  } finally {
    release();
  }
}

function getMediaPipeVisionRuntime(): Promise<MediaPipeVisionRuntime> {
  if (mediaPipeVisionRuntimePromise) return mediaPipeVisionRuntimePromise;

  const loading = withFilteredMediaPipeDiagnostics(async () => {
    const tasks = await import("@mediapipe/tasks-vision") as MediaPipeFaceLandmarkerModule;
    const vision = await tasks.FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM_URL);
    return { tasks, vision };
  });
  mediaPipeVisionRuntimePromise = loading.catch((error) => {
    mediaPipeVisionRuntimePromise = null;
    throw error;
  });
  return mediaPipeVisionRuntimePromise;
}

type InterviewIntegritySummary = {
  screenAwayCount: number;
  tabHiddenCount: number;
  windowBlurCount: number;
  cameraLostCount: number;
  faceMissingCount: number;
  faceOutOfFrameCount: number;
  multipleFacesCount: number;
  facePositionShiftCount: number;
  gazeAwayCount: number;
  voiceMouthMismatchCount: number;
  voiceWithoutFaceCount: number;
  staticVideoFrameCount: number;
  earlyScreenAwayCount: number;
  faceDetectionSupported: boolean;
  faceDetectionFrameCount: number;
  personDetectionSupported: boolean;
  personDetectionFrameCount: number;
  gazeDetectionSupported: boolean;
  gazeDetectionFrameCount: number;
  headPoseDetectionSupported: boolean;
  headPoseDetectionFrameCount: number;
  mouthSyncSupported: boolean;
  mouthSyncFrameCount: number;
  mouthSyncMismatchFrameCount: number;
  videoFrameMotionSupported: boolean;
  videoFrameSampleCount: number;
  staticVideoFrameSampleCount: number;
  totalAwayDurationMs: number;
  maxAwayDurationMs: number;
  suspicionLevel: InterviewIntegritySuspicionLevel;
};
type InterviewAnswerNonverbalMetadata = {
  cameraWarnings: number;
  microphoneWarnings: number;
  longSilenceCount: number;
  shortAnswerCount: number;
  testModeUsed: boolean;
  voicePeakLevel: number;
  lowAudioFrameCount: number;
  observedAudioFrameCount: number;
  cameraDisconnectedCount: number;
  integrityEvents?: InterviewIntegrityEvent[];
  integritySummary?: InterviewIntegritySummary;
  gazeTimeline?: InterviewGazeTimelineSample[];
  headPoseTimeline?: InterviewHeadPoseTimelineSample[];
};
type RecordingNonverbalTracker = InterviewAnswerNonverbalMetadata & {
  questionId: number;
  recordingStartedAtMs: number;
  silenceStartedAtMs?: number;
  silenceSegmentCounted: boolean;
  tabHiddenStartedAtMs?: number;
  windowBlurStartedAtMs?: number;
  cameraLostStartedAtMs?: number;
  faceMissingStartedAtMs?: number;
  faceOutOfFrameStartedAtMs?: number;
  multipleFacesStartedAtMs?: number;
  multiplePeoplePositiveSampleTimesMs: number[];
  multiplePeopleLastDetectedAtMs?: number;
  lastPersonDetectionAtMs?: number;
  facePositionShiftStartedAtMs?: number;
  facePositionShiftCandidateStartedAtMs?: number;
  gazeAwayStartedAtMs?: number;
  gazeAwayCandidateStartedAtMs?: number;
  gazeCenteredCandidateStartedAtMs?: number;
  lastGazeSignalAtMs?: number;
  voiceMouthMismatchStartedAtMs?: number;
  voiceMouthMismatchCandidateStartedAtMs?: number;
  voiceWithoutFaceStartedAtMs?: number;
  voiceWithoutFaceCandidateStartedAtMs?: number;
  staticVideoFrameStartedAtMs?: number;
  staticVideoFrameCandidateStartedAtMs?: number;
  earlyScreenAwayRecorded: boolean;
  lastGazeDirection?: GazeDirection;
  lastGazeSource?: GazeSignalSource;
  gazeCalibrationSampleCount: number;
  gazeBaselineHorizontalRatio?: number;
  gazeBaselineVerticalRatio?: number;
  smoothedGazeHorizontalRatio?: number;
  smoothedGazeVerticalRatio?: number;
  headPoseCalibrationSampleCount: number;
  headPoseBaselineYawDegrees?: number;
  headPoseBaselinePitchDegrees?: number;
  headPoseBaselineRollDegrees?: number;
  gazeTimeline: InterviewGazeTimelineSample[];
  headPoseTimeline: InterviewHeadPoseTimelineSample[];
  lastGazeTimelineSampleAtMs?: number;
  lastHeadPoseTimelineSampleAtMs?: number;
  faceBaseline?: FacePositionSnapshot;
  faceBaselineSampleCount: number;
  lastVideoFrameSample?: number[];
  faceDetectionSupported: boolean;
  faceDetectionFrameCount: number;
  personDetectionSupported: boolean;
  personDetectionFrameCount: number;
  gazeDetectionSupported: boolean;
  gazeDetectionFrameCount: number;
  headPoseDetectionSupported: boolean;
  headPoseDetectionFrameCount: number;
  mouthSyncSupported: boolean;
  mouthSyncFrameCount: number;
  mouthSyncMismatchFrameCount: number;
  videoFrameMotionSupported: boolean;
  videoFrameSampleCount: number;
  staticVideoFrameSampleCount: number;
  lastMouthOpenRatio?: number;
  audioFramesSinceLastMouthSample: number;
  speakingAudioFramesSinceLastMouthSample: number;
  totalAwayDurationMs: number;
  maxAwayDurationMs: number;
  integrityEvents: InterviewIntegrityEvent[];
  deviceQa?: NonverbalDeviceQaRun;
};
type CandidateApplicationStatusFilter = "ALL" | "WAITING" | "IN_PROGRESS" | "COMPLETED" | "REPORTING";
type ApplicationBadgeTone = "green" | "yellow" | "purple" | "neutral";
type RuntimePageData = {
  runtime: RuntimePageSession;
  questions: RuntimeQuestionListResponse;
};
type RuntimePageSession = {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewRuntimeSessionView["interviewType"];
  sessionMode?: "STANDARD" | "DEMO_PRESET";
  status: InterviewRuntimeSessionView["status"];
  showQuestionText: boolean;
  canRecord: boolean;
  jobDescription?: string;
  timePolicy?: CandidateInterviewRuntimeView["timePolicy"];
  totalQuestions: number;
  answeredCount: number;
  completionReady?: boolean;
  currentQuestion?: RuntimeQuestionView;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
};
type MockReportDetailData = {
  feedback?: CandidateMockReportFeedback;
  feedbackError?: string;
  media?: CandidateMockReportMedia;
  mediaError?: string;
};
type ApplicationReportData = {
  status?: CandidateApplicationStatusView;
  statusError?: string;
  report?: CandidateRecruitingReportView;
  reportError?: string;
};

function shouldAutoRequestApplicationReport(data?: ApplicationReportData): boolean {
  const status = data?.status;
  if (!status) {
    return false;
  }

  if (data.reportError && !isReportNotReadyMessage(data.reportError)) {
    return false;
  }

  const interviewCompleted =
    status.interviewStatus === "COMPLETED" || status.interviewSessionStatus === "COMPLETED";
  if (!interviewCompleted || status.reportAvailable) {
    return false;
  }

  const reportStatus = data.report?.status ?? status.reportStatus;
  return reportStatus !== "GENERATING" && reportStatus !== "COMPLETED";
}

type LastSavedAnswer = {
  answerId: number;
  questionId: number;
  questionText: string;
  transcript: string;
  durationSeconds: number;
  fileAssetId?: number;
  audioFileId?: number;
  audioS3Key?: string;
  videoFileId?: number;
  videoS3Key?: string;
  transcriptSource?: "OPENAI_REALTIME_STT_RELAY";
};
type AutoAiStepStatus = "IDLE" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
type AutoAiPipelineState = {
  answerId: number;
  sttStatus: AutoAiStepStatus;
  followUpStatus: AutoAiStepStatus;
  followUpSkipped?: boolean;
  sttProcessLogId?: number;
  followUpProcessLogId?: number;
  transcript?: string;
  followUpQuestion?: string;
  failureCategory?: string;
  failureReason?: string;
  failureRetryable?: boolean;
  error?: string;
};
type CandidateRecordingCacheEntry = {
  url: string;
  blob: Blob;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  createdAt: number;
};
type CandidateRecordingCacheWindow = Window & {
  __candidateRecordingCache?: Map<string, CandidateRecordingCacheEntry>;
};
type CameraPreviewInfo = {
  width: number;
  height: number;
  trackLabel?: string;
  trackState?: MediaStreamTrackState;
};
type CameraStreamResult = {
  stream: MediaStream;
  audioEnabled: boolean;
  audioLabel?: string;
  audioState?: MediaStreamTrackState;
  audioError?: unknown;
  fallbackLabel?: string;
};
type MicrophoneProbeResult = {
  ok: boolean;
  label?: string;
  state?: MediaStreamTrackState;
  error?: unknown;
};
type CameraQualityResult = {
  ok: boolean;
  brightness?: number;
  message: string;
};
type MicrophoneQualityResult = {
  ok: boolean;
  peakLevel: number;
  message: string;
};
type NetworkQualityResult = {
  ok: boolean;
  message: string;
};
type CameraFramingState = "idle" | "ok" | "warn" | "unsupported";
type CameraFramingResult = {
  state: CameraFramingState;
  blocking: boolean;
  message: string;
};

type CameraPipDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

function getCameralessInterviewTestEntryStorageKey(mode: RuntimeMode, sessionId: number): string {
  return `${CAMERALESS_INTERVIEW_TEST_ENTRY_STORAGE_KEY_PREFIX}:${mode}:${sessionId}`;
}

function rememberCameralessInterviewTestEntry(mode: RuntimeMode, sessionId: number) {
  if (!ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY || typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getCameralessInterviewTestEntryStorageKey(mode, sessionId), "1");
  } catch {
    // Session storage can be unavailable in private or locked-down browsers.
  }
}

function consumeCameralessInterviewTestEntry(mode: RuntimeMode, sessionId: number): boolean {
  if (!ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY || typeof window === "undefined") return false;

  try {
    const key = getCameralessInterviewTestEntryStorageKey(mode, sessionId);
    const enabled = window.sessionStorage.getItem(key) === "1";
    if (enabled) window.sessionStorage.removeItem(key);
    return enabled;
  } catch {
    return false;
  }
}

const DEVICE_TEST_SENTENCES = [
  "나는 차분하게 듣고, 나의 생각을 분명하게 답할 수 있다.",
  "나는 준비한 만큼 침착하게 말하고, 끝까지 답할 수 있다.",
  "긴장해도 괜찮다. 나는 천천히 생각하고 분명하게 말한다.",
  "나는 오늘의 경험을 믿고, 차분하게 나를 보여줄 수 있다.",
  "나는 질문을 끝까지 듣고, 내 언어로 또렷하게 답한다.",
  "완벽하지 않아도 괜찮다. 나는 침착하게 끝까지 말한다.",
  "나는 지금 이 순간에도 차분하게 호흡하고 또렷하게 말한다.",
  "나는 나의 경험을 믿고, 한 문장씩 분명하게 답할 수 있다.",
  "나는 서두르지 않고 질문을 이해한 뒤 차분하게 대답한다.",
  "나는 오늘 준비한 시간을 믿고 자신 있게 나를 표현한다.",
  "나는 긴장 속에서도 중심을 잡고, 끝까지 내 생각을 전한다.",
  "나는 천천히 숨을 고르고, 내가 가진 강점을 분명히 말한다.",
  "나는 질문을 잘 듣고, 나의 경험을 바탕으로 답할 수 있다.",
  "나는 침착한 목소리로 나의 생각과 태도를 또렷하게 전한다.",
  "나는 실수해도 다시 차분하게 이어가며 끝까지 답할 수 있다.",
  "나는 지금까지 해온 노력을 믿고, 자신 있게 면접에 임한다.",
  "나는 흔들리지 않고 나의 생각을 차근차근 설명할 수 있다.",
  "나는 오늘 나의 가능성과 경험을 분명한 목소리로 보여준다.",
  "나는 마음을 가다듬고, 질문마다 성실하게 답할 준비가 됐다.",
  "나는 천천히 말해도 괜찮다. 중요한 것은 끝까지 전하는 것이다.",
  "나는 나답게 생각하고, 나답게 말하며, 끝까지 집중할 수 있다.",
  "나는 차분한 태도로 듣고, 또렷한 목소리로 나를 설명한다.",
  "나는 준비된 사람이다. 지금 이 자리에서 침착하게 답할 수 있다.",
  "나는 나의 속도로 말하고, 나의 경험으로 충분히 답할 수 있다.",
  "나는 끝까지 집중하며, 오늘의 면접을 차분하게 마무리할 수 있다.",
] as const;

export function CandidateJobsPage({ publicEntry = false }: { publicEntry?: boolean } = {}) {
  const [query, setQuery] = useState<CandidateJobQuery>(defaultCandidateJobQuery);
  const load = useCallback(
    () => (publicEntry ? getPublicCandidateApi() : getCandidateApi()).listJobs(query),
    [publicEntry, query],
  );
  const { data, loading, error } = useCandidateResource(load, [publicEntry, query]);

  return (
    <CandidatePageShell active="jobs" publicEntry={publicEntry}>
      <section className="candidate-jobs-page glass-page notion" aria-label="채용공고">
        <StatusNotice loading={loading} error={error} />
        <CandidateJobsView
          jobs={data?.data.items ?? []}
          query={query}
          totalItems={data?.meta.page.totalItems ?? 0}
          pageMeta={data?.meta.page}
          onQueryChange={setQuery}
        />
      </section>
    </CandidatePageShell>
  );
}

export function CandidateJobDetailPage({ jobId }: { jobId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const load = useCallback(() => getCandidateApi().getJobDetail(jobId), [jobId]);
  const { data, loading, error, refresh } = useCandidateResource(load, [jobId]);

  // 지원서 제출 모달(이슈 #207): 공고 상세 위에서 단계별로 작성하고, 성공 시 상세를 갱신한다.
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState<CandidateApplicationFormState>(defaultApplicationFormState);
  const [latestResumeFile, setLatestResumeFile] = useState<CandidateFileAsset>();
  const [latestPortfolioFile, setLatestPortfolioFile] = useState<CandidateFileAsset>();
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<CandidateApplicationErrorState | null>(null);
  const [message, setMessage] = useState("");
  // #272 지원 모달을 열 때 회원 기본정보 자동 입력 + 지원서 세트 목록을 지연 로딩한다.
  const [applyFolders, setApplyFolders] = useState<CandidateFolder[]>([]);
  const [applyPrefilled, setApplyPrefilled] = useState(false);
  const [restoredEditedSet, setRestoredEditedSet] = useState(false);
  useEffect(() => {
    if (searchParams.get("apply") === "1") setApplyOpen(true);
  }, [searchParams]);
  useEffect(() => {
    if (!applyOpen || applyPrefilled) {
      return;
    }
    let active = true;
    // 프로필 자동입력과 세트 목록은 독립적으로 처리한다. 세트 조회가 실패해도 자동입력은 유지한다. (#272 보완)
    getCandidateApi()
      .getApplyView(jobId)
      .then((applyView) => {
        if (!active) {
          return;
        }
        const applicant = applyView.data.applicant;
        const profileSnapshot = applyView.data.profileSnapshot ?? {
          schemaVersion: 1 as const,
          name: applicant.name,
          email: applicant.email,
          phone: applicant.phone,
          githubUrl: applicant.githubUrl,
          blogUrl: applicant.blogUrl,
          portfolioUrl: applicant.portfolioUrl,
          summary: null,
          coverLetter: null,
          educations: [],
          careers: [],
          activities: [],
          credentials: [],
        };
        setApplyForm((current) => ({
          ...current,
          candidateName: profileSnapshot.name || applicant.name,
          email: profileSnapshot.email || applicant.email,
          phone: profileSnapshot.phone ?? applicant.phone ?? "",
          githubUrl: profileSnapshot.githubUrl ?? applicant.githubUrl ?? "",
          blogUrl: profileSnapshot.blogUrl ?? applicant.blogUrl ?? "",
          portfolioUrl: profileSnapshot.portfolioUrl ?? applicant.portfolioUrl ?? undefined,
          profileSnapshot,
        }));
        setApplyPrefilled(true);
      })
      .catch(() => undefined);
    getCandidateApi()
      .listFolders()
      .then((folderRes) => {
        if (active) {
          setApplyFolders(folderRes.data.items);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [applyOpen, applyPrefilled, jobId]);

  useEffect(() => {
    if (!applyOpen || !applyPrefilled || restoredEditedSet) return;
    const restoreDraftOnly = searchParams.get("restoreDraft") === "1";
    const editedSetId = Number(searchParams.get("applySet"));
    const editedFolder = applyFolders.find((folder) => folder.id === editedSetId);
    if (!restoreDraftOnly && !editedFolder) return;
    let baseline = applyForm;
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(CANDIDATE_APPLY_DRAFT_STORAGE_KEY) ?? "null") as { jobId?: number; form?: CandidateApplicationFormState } | null;
      if (draft?.jobId === jobId && draft.form) baseline = draft.form;
      window.sessionStorage.removeItem(CANDIDATE_APPLY_DRAFT_STORAGE_KEY);
    } catch {
      window.sessionStorage.removeItem(CANDIDATE_APPLY_DRAFT_STORAGE_KEY);
    }
    setApplyForm(restoreDraftOnly ? baseline : applyFolderToApplicationForm(baseline, baseline, editedFolder!));
    setRestoredEditedSet(true);
  }, [applyFolders, applyForm, applyOpen, applyPrefilled, jobId, restoredEditedSet, searchParams]);

  function handleEditApplyFolder(folder: CandidateFolder) {
    window.sessionStorage.setItem(CANDIDATE_APPLY_DRAFT_STORAGE_KEY, JSON.stringify({ jobId, form: applyForm }));
    window.history.replaceState(null, "", `/candidate/jobs/${jobId}?apply=1&restoreDraft=1`);
    router.push(`/candidate/application-sets/${folder.id}/edit?returnTo=${encodeURIComponent(`/candidate/jobs/${jobId}`)}`);
  }

  // 같은 직무의 다른 공고를 추천으로 노출한다(우측 사이드). 별도 추천 API 없이 목록 API 재사용.
  // 목록 jobRoles 필터는 jobRoleCode 와 매칭하므로 표시명(jobRole)이 아닌 jobRoleCode 로 조회한다.
  const [relatedJobs, setRelatedJobs] = useState<CandidateJobSummary[]>([]);
  const relatedRoleCode = data?.data.jobRoleCode ?? undefined;
  const currentJobId = data?.data.jobId;
  useEffect(() => {
    if (!relatedRoleCode || !currentJobId) {
      setRelatedJobs([]);
      return;
    }
    let active = true;
    getCandidateApi()
      .listJobs({ jobRoles: [relatedRoleCode], limit: 8, sort: "createdAt", order: "desc" })
      .then((res) => {
        if (active) setRelatedJobs(res.data.items.filter((item) => item.jobId !== currentJobId).slice(0, 5));
      })
      .catch(() => {
        if (active) setRelatedJobs([]);
      });
    return () => {
      active = false;
    };
  }, [relatedRoleCode, currentJobId]);

  async function handleResumeFileSelect(file: File) {
    setApplyBusy(true);
    setApplyError(null);
    try {
      const result = await getCandidateApi().uploadResume(file);
      setLatestResumeFile(result.data);
      setApplyForm((current) => ({ ...current, resumeFileId: result.data.fileId }));
    } catch (submitError) {
      setApplyError(toCandidateApplicationError(submitError, { fallbackField: "resumeFileId", operation: "이력서 업로드" }));
    } finally {
      setApplyBusy(false);
    }
  }

  async function handlePortfolioFileSelect(file: File) {
    setApplyBusy(true);
    setApplyError(null);
    try {
      const result = await getCandidateApi().uploadResume(file);
      setLatestPortfolioFile(result.data);
      setApplyForm((current) => ({ ...current, portfolioFileId: result.data.fileId }));
    } catch (submitError) {
      setApplyError(toCandidateApplicationError(submitError, { fallbackField: "portfolio", operation: "포트폴리오 업로드" }));
    } finally {
      setApplyBusy(false);
    }
  }

  async function handleApplicationSubmit(request: Parameters<ReturnType<typeof getCandidateApi>["submitApplication"]>[1]) {
    setApplyBusy(true);
    setApplyError(null);
    try {
      const result = await getCandidateApi().submitApplication(jobId, request);
      setApplyOpen(false);
      setMessage(`지원서가 제출되었습니다. 접수 번호는 ${result.data.application.applicationId}번입니다.`);
      void refresh().catch(() => undefined);
    } catch (submitError) {
      // 실패 시 모달을 유지하고 입력값을 보존한 채 에러만 보여준다.
      setApplyError(toCandidateApplicationError(submitError, { operation: "지원서 제출" }));
    } finally {
      setApplyBusy(false);
    }
  }

  return (
    <CandidatePageShell active="jobs">
      <StatusNotice loading={loading} error={error} message={message} />
      {data ? <CandidateJobDetailView job={data.data} relatedJobs={relatedJobs} onApplyClick={() => setApplyOpen(true)} /> : null}
      {applyOpen && data ? (
        <CandidateApplyModal
          job={data.data}
          state={applyForm}
          latestResumeFile={latestResumeFile}
          latestPortfolioFile={latestPortfolioFile}
          folders={applyFolders}
          busy={applyBusy}
          submissionError={applyError}
          onResumeFileSelect={handleResumeFileSelect}
          onPortfolioFileSelect={handlePortfolioFileSelect}
          onStateChange={(nextState) => {
            setApplyError(null);
            setApplyForm(nextState);
          }}
          onSubmit={handleApplicationSubmit}
          onClose={() => {
            setApplyError(null);
            setApplyOpen(false);
          }}
          onEditFolder={handleEditApplyFolder}
        />
      ) : null}
    </CandidatePageShell>
  );
}

export function CandidateJobApplyPage({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [form, setForm] = useState<CandidateApplicationFormState>(defaultApplicationFormState);
  const [latestResumeFile, setLatestResumeFile] = useState<CandidateFileAsset>();
  const [latestPortfolioFile, setLatestPortfolioFile] = useState<CandidateFileAsset>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getCandidateApi().getApplyView(jobId), [jobId]);
  const { data, loading, error } = useCandidateResource(load, [jobId]);

  // #272 회원 기본정보 자동 입력: 지원 화면 진입 시 프로필의 이름/이메일/연락처/GitHub/블로그/포트폴리오를 채운다(빈 칸만).
  const applicant = data?.data.applicant;
  const profileSnapshot = useMemo(() => {
    if (data?.data.profileSnapshot) return data.data.profileSnapshot;
    if (!applicant) return undefined;
    return {
      schemaVersion: 1 as const,
      name: applicant.name,
      email: applicant.email,
      phone: applicant.phone,
      githubUrl: applicant.githubUrl,
      blogUrl: applicant.blogUrl,
      portfolioUrl: applicant.portfolioUrl,
      summary: null,
      coverLetter: null,
      educations: [],
      careers: [],
      activities: [],
      credentials: [],
    };
  }, [applicant, data?.data.profileSnapshot]);
  useEffect(() => {
    if (!applicant || !profileSnapshot) {
      return;
    }
    setForm((current) => ({
      ...current,
      candidateName: profileSnapshot.name || applicant.name,
      email: profileSnapshot.email || applicant.email,
      phone: profileSnapshot.phone ?? applicant.phone ?? "",
      githubUrl: profileSnapshot.githubUrl ?? applicant.githubUrl ?? "",
      blogUrl: profileSnapshot.blogUrl ?? applicant.blogUrl ?? "",
      portfolioUrl: profileSnapshot.portfolioUrl ?? applicant.portfolioUrl ?? undefined,
      profileSnapshot,
    }));
  }, [applicant, profileSnapshot]);

  // #272 지원서 세트 불러오기용 폴더 목록.
  const foldersLoad = useCallback(() => getCandidateApi().listFolders(), []);
  const foldersResource = useCandidateResource(foldersLoad, []);
  const folders = foldersResource.data?.data.items ?? [];

  async function handleResumeFileSelect(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const result = await getCandidateApi().uploadResume(file);
      setLatestResumeFile(result.data);
      setForm((current) => ({ ...current, resumeFileId: result.data.fileId }));
      setMessage("이력서 파일이 업로드되었습니다.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handlePortfolioFileSelect(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const result = await getCandidateApi().uploadResume(file);
      setLatestPortfolioFile(result.data);
      setForm((current) => ({ ...current, portfolioFileId: result.data.fileId }));
      setMessage("포트폴리오 PDF가 업로드되었습니다.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleApplicationSubmit(request: Parameters<ReturnType<typeof getCandidateApi>["submitApplication"]>[1]) {
    setBusy(true);
    setMessage("");
    try {
      const result = await getCandidateApi().submitApplication(jobId, request);
      setMessage(`지원서가 제출되었습니다. 접수 번호는 ${result.data.application.applicationId}번입니다.`);
      router.push(candidateApplicationInterviewRoutes.applications);
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="jobs">
      <section className="candidate-apply-shell glass-page notion">
        {data ? (
          <CandidatePageHead
            eyebrow=""
            title="지원서 제출"
            description={`${data.data.job.companyName} · ${data.data.job.title}`}
            actions={
              <Link className="btn secondary" href={candidateApplicationInterviewRoutes.jobDetail(jobId)}>
                채용공고
              </Link>
            }
          />
        ) : null}
        <StatusNotice loading={loading || busy} error={error} message={message} />
        {data ? (
          <CandidateApplicationView
            busy={busy}
            job={data.data.job}
            latestResumeFile={latestResumeFile}
            latestPortfolioFile={latestPortfolioFile}
            state={form}
            folders={folders}
            onResumeFileSelect={handleResumeFileSelect}
            onPortfolioFileSelect={handlePortfolioFileSelect}
            onStateChange={setForm}
            onSubmit={handleApplicationSubmit}
          />
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

const APPLICATION_STATUS_FILTERS: { value: CandidateApplicationStatusFilter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WAITING", label: "응시 대기" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "COMPLETED", label: "응시 완료" },
  { value: "REPORTING", label: "리포트" },
];

const APPLICATIONS_PAGE_SIZE = 8;
type CandidateDemoResetTarget = CandidateApplicationSummary | "ALL";

// 마이페이지 '지원 내역' 탭 — 지원 요약 + 지원한 공고 목록(페이지네이션). (#272 마이페이지 탭 재편)
export function CandidateApplicationsPage() {
  const router = useRouter();
  const load = useCallback(() => getCandidateApi().listApplications(), []);
  const { data, loading, error, refresh, updateData } = useCandidateResource(load, []);
  const applications = data?.data.items ?? [];
  const availableApplications = applications.filter((application) => application.availabilityStatus !== "UNAVAILABLE");
  const [statusFilter, setStatusFilter] = useState<CandidateApplicationStatusFilter>("ALL");
  const [demoCommandOpen, setDemoCommandOpen] = useState(false);
  const [demoCommand, setDemoCommand] = useState("");
  const [demoCommandError, setDemoCommandError] = useState("");
  const [demoCommandBusy, setDemoCommandBusy] = useState(false);
  const [demoResetEnabled, setDemoResetEnabled] = useState(false);
  const [demoResetTarget, setDemoResetTarget] = useState<CandidateDemoResetTarget | null>(null);
  const [demoResetError, setDemoResetError] = useState("");
  const [demoResetNotice, setDemoResetNotice] = useState("");
  const [demoResetBusy, setDemoResetBusy] = useState(false);
  // 면접 안내 모달을 지원 내역 위에서 연다. 완료 시 장치 점검 라우트로 이동. (#288)
  const [guideAppId, setGuideAppId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CandidateApplicationSummary | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelMessage, setCancelMessage] = useState("");
  // /interview-guide 라우트로 직접 진입한 경우 ?guide=id 로 리다이렉트되어 여기서 모달을 연다.
  const searchParams = useSearchParams();
  const guideParam = searchParams.get("guide");
  useEffect(() => {
    if (guideParam) {
      const parsed = Number(guideParam);
      if (Number.isInteger(parsed) && parsed > 0) {
        setGuideAppId(parsed);
      }
    }
  }, [guideParam]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isCandidateDemoCommandShortcut(event) || isRuntimeShortcutIgnoredTarget(event.target)) return;
      event.preventDefault();
      setDemoCommand("");
      setDemoCommandError("");
      setDemoCommandOpen(true);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!demoCommandOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !demoCommandBusy) setDemoCommandOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [demoCommandBusy, demoCommandOpen]);

  const [page, setPage] = useState(1);
  const summary = {
    total: applications.length,
    waiting: availableApplications.filter(
      (application) =>
        application.applicationStatus !== "CANCELED" &&
        (application.interviewStatus === "READY" || application.interviewStatus === "NOT_READY"),
    ).length,
    completed: availableApplications.filter((application) => application.interviewStatus === "COMPLETED").length,
    reports: availableApplications.filter((application) => application.reportStatus === "COMPLETED").length,
  };
  const filteredApplications = applications.filter((application) =>
    matchesCandidateApplicationStatusFilter(application, statusFilter),
  );
  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / APPLICATIONS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedApplications = filteredApplications.slice(
    (currentPage - 1) * APPLICATIONS_PAGE_SIZE,
    currentPage * APPLICATIONS_PAGE_SIZE,
  );

  // 상태 필터가 바뀌면 첫 페이지로 되돌린다.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (!cancelMessage) return;
    const timeoutId = window.setTimeout(() => setCancelMessage(""), 3_000);
    return () => window.clearTimeout(timeoutId);
  }, [cancelMessage]);

  async function confirmApplicationCancellation() {
    if (!cancelTarget || cancelBusy) return;
    setCancelBusy(true);
    setCancelError("");
    try {
      const response = await getCandidateApi().cancelApplication(cancelTarget.applicationId);
      updateData((current) => ({
        ...current,
        data: {
          ...current.data,
          items: current.data.items.map((application) =>
            application.applicationId === response.data.applicationId
              ? {
                  ...application,
                  applicationStatus: response.data.applicationStatus,
                  updatedAt: response.data.canceledAt,
                  canStartInterview: false,
                }
              : application,
          ),
        },
      }));
      setCancelTarget(null);
      setCancelMessage("지원이 취소되었습니다.");
    } catch (cancelRequestError) {
      setCancelError(
        cancelRequestError instanceof CandidateApiError && cancelRequestError.status === 409
          ? "면접이 이미 시작되었거나 종료되어 지원을 취소할 수 없습니다."
          : toErrorMessage(cancelRequestError),
      );
    } finally {
      setCancelBusy(false);
    }
  }

  async function handleDemoCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDemoCommandBusy(true);
    setDemoCommandError("");
    try {
      await getCandidateApi().unlockDemoApplicationReset(demoCommand);
      setDemoResetEnabled(true);
      setDemoCommandOpen(false);
      setDemoCommand("");
    } catch (commandError) {
      setDemoCommandError(toErrorMessage(commandError));
    } finally {
      setDemoCommandBusy(false);
    }
  }

  async function handleDemoResetConfirmed() {
    if (!demoResetTarget) return;
    setDemoResetBusy(true);
    setDemoResetError("");
    setDemoResetNotice("");
    try {
      const response =
        demoResetTarget === "ALL"
          ? await getCandidateApi().resetAllDemoApplications()
          : await getCandidateApi().resetDemoApplication(demoResetTarget.applicationId);
      const successMessage =
        response.data.storageCleanupFailedCount > 0
          ? `${response.data.resetCount}건을 초기화했습니다. 일부 녹화 파일 정리는 확인이 필요합니다.`
          : `${response.data.resetCount}건의 지원 내역을 초기화했습니다.`;
      setDemoResetTarget(null);
      setPage(1);
      try {
        await refresh();
        setDemoResetNotice(successMessage);
      } catch {
        setDemoResetNotice(`${successMessage} 목록은 페이지를 새로고침해 확인해주세요.`);
      }
    } catch (resetError) {
      setDemoResetError(toErrorMessage(resetError));
    } finally {
      setDemoResetBusy(false);
    }
  }

  return (
    <CandidatePageShell active="accountBilling">
      <section className="candidate-mypage candidate-applications-page glass-page notion">
        <header className="candidate-mypage__head">
          <h1>지원 내역</h1>
        </header>
        <CandidateMypageTabs />
        <StatusNotice loading={loading} error={error} />

        <section className="mypage-stats" aria-label="지원 요약">
          <MypageStat name="applications" label="전체 지원" value={summary.total} />
          <MypageStat name="waiting" label="응시 대기" value={summary.waiting} />
          <MypageStat name="completed" label="응시 완료" value={summary.completed} />
          <MypageStat name="reports" label="리포트 확인" value={summary.reports} />
        </section>

        <section className="mypage-block">
          <div className="applications-toolbar">
            <div className="mypage-block__title">
              <h2>지원한 공고</h2>
              <p>지원한 공고의 진행 상태를 확인하고 면접을 이어가세요.</p>
            </div>
            <div className="applications-filter" role="tablist" aria-label="지원 상태 필터">
              {APPLICATION_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === filter.value}
                  className={`applications-filter__chip${statusFilter === filter.value ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {demoResetEnabled ? (
            <div className="demo-reset-toolbar">
              <strong>시연 데이터 관리</strong>
              <button
                className="demo-reset-toolbar__button"
                type="button"
                disabled={applications.length === 0 || demoResetBusy}
                onClick={() => {
                  setDemoResetError("");
                  setDemoResetTarget("ALL");
                }}
              >
                전체 초기화
              </button>
            </div>
          ) : null}
          {demoResetNotice ? <p className="notice success demo-reset-notice">{demoResetNotice}</p> : null}

          {loading ? (
            <p className="applications-empty">지원 내역을 불러오는 중이에요.</p>
          ) : filteredApplications.length ? (
            <ul className="applications-list">
              {pagedApplications.map((application) => {
                const action = getSelectedApplicationAction(application);
                const isUnavailable = application.availabilityStatus === "UNAVAILABLE";
                return (
                  <li key={application.applicationId} className="application-row">
                    <div className="application-row__main">
                      <strong>{application.jobTitle ?? "삭제된 공고"}</strong>
                      <span className="application-row__company">
                        {application.companyName ?? "알 수 없는 기업"}
                        <em>·</em>
                        {formatShortDate(application.updatedAt)} 업데이트
                      </span>
                      {isUnavailable ? (
                        <span className="application-row__company">더 이상 조회할 수 없는 지원입니다.</span>
                      ) : null}
                    </div>
                    <div className="application-row__badges">
                      {isUnavailable ? <ApplicationStatusBadge label="정보 확인 필요" tone="neutral" /> : null}
                      <ApplicationStatusBadge
                        label={formatCandidateApplicationStatusLabel(application.applicationStatus)}
                        tone={getCandidateApplicationStatusTone(application.applicationStatus)}
                      />
                      <ApplicationStatusBadge
                        label={formatCandidateInterviewStatusLabel(application.interviewStatus)}
                        tone={getCandidateInterviewStatusTone(application.interviewStatus)}
                      />
                      {renderCandidateReportStatus(application.reportStatus)}
                    </div>
                    <div className="application-row__actions">
                      {action.href === candidateApplicationInterviewRoutes.interviewGuide(application.applicationId) ? (
                        <button
                          className="application-row__cta"
                          type="button"
                          onClick={() => setGuideAppId(application.applicationId)}
                        >
                          {action.label}
                        </button>
                      ) : action.href ? (
                        <Link className="application-row__cta" href={action.href}>
                          {action.label}
                        </Link>
                      ) : (
                        <span className="application-row__cta is-disabled" aria-disabled="true">
                          {action.label}
                        </span>
                      )}
                      {isCandidateApplicationCancelable(application) ? (
                        <button
                          className="application-row__cancel"
                          type="button"
                          onClick={() => {
                            setCancelError("");
                            setCancelTarget(application);
                          }}
                        >
                          지원 취소
                        </button>
                      ) : null}
                      {demoResetEnabled ? (
                        <button
                          className="application-row__reset"
                          type="button"
                          disabled={demoResetBusy}
                          aria-label={`${application.jobTitle ?? "삭제된 공고"} 지원 내역 초기화`}
                          onClick={() => {
                            setDemoResetError("");
                            setDemoResetTarget(application);
                          }}
                        >
                          초기화
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="applications-empty is-block">
              {statusFilter === "ALL" ? "아직 지원한 공고가 없어요." : "조건에 맞는 지원 건이 없어요."}
              <Link className="applications-empty__cta" href={candidateApplicationInterviewRoutes.jobs}>
                채용공고 둘러보기 →
              </Link>
            </div>
          )}

          {!loading && totalPages > 1 ? (
            <nav className="applications-pagination" aria-label="지원 내역 페이지">
              <button
                type="button"
                className="applications-pagination__nav"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  aria-current={pageNumber === currentPage ? "page" : undefined}
                  className={`applications-pagination__page${pageNumber === currentPage ? " is-active" : ""}`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                className="applications-pagination__nav"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                다음
              </button>
            </nav>
          ) : null}
        </section>
      </section>

      {demoCommandOpen ? (
        <div
          className="modal-backdrop demo-command-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !demoCommandBusy) setDemoCommandOpen(false);
          }}
        >
          <form
            className="modal demo-command-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-command-title"
            onSubmit={(event) => void handleDemoCommandSubmit(event)}
          >
            <div className="modal-head">
              <div>
                <h2 id="demo-command-title">명령 실행</h2>
              </div>
            </div>
            <label className="demo-command-field" htmlFor="candidate-demo-command">
              <span>명령어</span>
              <input
                id="candidate-demo-command"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={demoCommand}
                disabled={demoCommandBusy}
                onChange={(event) => setDemoCommand(event.target.value)}
              />
            </label>
            {demoCommandError ? <p className="notice danger" role="alert">{demoCommandError}</p> : null}
            <div className="modal-actions">
              <button
                className="btn secondary"
                type="button"
                disabled={demoCommandBusy}
                onClick={() => setDemoCommandOpen(false)}
              >
                취소
              </button>
              <button className="btn primary" type="submit" disabled={demoCommandBusy || !demoCommand.trim()}>
                {demoCommandBusy ? "확인 중" : "실행"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {demoResetTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !demoResetBusy) setDemoResetTarget(null);
          }}
        >
          <section
            className="modal demo-reset-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-reset-confirm-title"
            aria-describedby="demo-reset-confirm-description"
          >
            <div className="modal-head">
              <div>
                <h2 id="demo-reset-confirm-title">지원 내역 초기화</h2>
                <p id="demo-reset-confirm-description">
                  면접 답변, 리포트, 녹화 데이터가 함께 삭제되며 되돌릴 수 없습니다.
                </p>
              </div>
            </div>
            <div className="confirm-box">
              <strong>{demoResetTarget === "ALL" ? "전체 지원 내역" : demoResetTarget.jobTitle ?? "삭제된 공고"}</strong>
              <span>
                {demoResetTarget === "ALL"
                  ? `${applications.length}건`
                  : demoResetTarget.companyName ?? "알 수 없는 기업"}
              </span>
            </div>
            {demoResetError ? <p className="notice danger" role="alert">{demoResetError}</p> : null}
            <div className="modal-actions split-actions">
              <button
                autoFocus
                className="btn secondary"
                type="button"
                disabled={demoResetBusy}
                onClick={() => setDemoResetTarget(null)}
              >
                취소
              </button>
              <button
                className="btn primary danger"
                type="button"
                disabled={demoResetBusy}
                onClick={() => void handleDemoResetConfirmed()}
              >
                {demoResetBusy ? "초기화 중" : "초기화"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {guideAppId != null ? (
        <InterviewGuideModal
          applicationId={guideAppId}
          onClose={() => setGuideAppId(null)}
          onProceed={() => {
            const targetId = guideAppId;
            setGuideAppId(null);
            router.push(candidateApplicationInterviewRoutes.interviewGuide(targetId));
          }}
        />
      ) : null}
      {cancelTarget ? (
        <ApplicationCancelDialog
          application={cancelTarget}
          busy={cancelBusy}
          error={cancelError}
          onClose={() => {
            if (!cancelBusy) setCancelTarget(null);
          }}
          onConfirm={confirmApplicationCancellation}
        />
      ) : null}
      {cancelMessage ? <div className="candidate-toast" role="status" aria-live="polite">{cancelMessage}</div> : null}
    </CandidatePageShell>
  );
}

function ApplicationCancelDialog({
  application,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  application: CandidateApplicationSummary;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="modal-backdrop application-cancel-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <section
        className="modal application-cancel-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="application-cancel-title"
        aria-describedby="application-cancel-description"
        aria-busy={busy}
      >
        <div className="application-cancel-modal__body">
          <h2 id="application-cancel-title">지원을 취소할까요?</h2>
          <p id="application-cancel-description">
            <strong>{application.jobTitle ?? "해당 공고"}</strong> 지원을 취소하면 이 지원 건으로 면접을 진행할 수 없습니다.
            제출 기록은 지원 내역에 남습니다.
          </p>
          {error ? <p className="application-cancel-modal__error" role="alert">{error}</p> : null}
        </div>
        <div className="application-cancel-modal__actions">
          <button type="button" className="application-cancel-modal__keep" onClick={onClose} disabled={busy} autoFocus>
            계속 지원
          </button>
          <button type="button" className="application-cancel-modal__confirm" onClick={onConfirm} disabled={busy}>
            {busy ? "취소하는 중" : "지원 취소"}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(value));
}

// 면접 안내(응시 안내) 모달 위저드. 지원 내역 위에서 떠서, 완료 시 장치 점검으로 이동한다. (#288)
function InterviewGuideModal({
  applicationId,
  onClose,
  onProceed,
}: {
  applicationId: number;
  onClose: () => void;
  onProceed: () => void;
}) {
  const load = useCallback(() => getCandidateApi().getInterviewGuide(applicationId), [applicationId]);
  const { data, loading, error } = useCandidateResource(load, [applicationId]);
  const guide = data?.data;
  const [subStep, setSubStep] = useState(0);
  // 서브스텝 전환 방향(다음=오른쪽에서, 이전=왼쪽에서 슬라이드 인). (#288)
  const [stepDir, setStepDir] = useState<"next" | "prev">("next");
  const goNextStep = () => {
    setStepDir("next");
    setSubStep((prev) => prev + 1);
  };
  const goPrevStep = () => {
    setStepDir("prev");
    setSubStep((prev) => prev - 1);
  };
  const [consentState, setConsentState] = useState<CandidateInterviewConsentState>(defaultInterviewConsentState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const primaryLabel = guide?.interviewSessionStatus === "IN_PROGRESS" ? "면접 재개" : "면접 시작";
  // 이미 필수 동의를 완료한 사용자는 다시 체크하지 않아도 되도록 체크박스를 미리 채운다. (#288)
  useEffect(() => {
    if (guide?.consentCompleted) {
      setConsentState((prev) => ({ ...prev, consentTypes: [...guide.requiredConsentTypes] }));
    }
  }, [guide]);
  const consentComplete = guide
    ? guide.consentCompleted ||
      guide.requiredConsentTypes.every((consentType) => consentState.consentTypes.includes(consentType))
    : false;

  async function handleProceed() {
    if (!guide) return;
    if (!consentComplete) {
      setMessage("필수 동의 항목을 모두 체크한 뒤 이동해주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (!guide.consentCompleted) {
        await getCandidateApi().saveInterviewConsent(applicationId, toSaveInterviewConsentRequest(consentState));
      }
      onProceed();
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="ivg-modal-overlay candidate-interview-guide notion"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ivg-modal" role="dialog" aria-modal="true" aria-label="채용 AI 면접 안내">
        <header className="ivg-modal-head">
          <div className="ivg-modal-heading">
            <p className="ivg-modal-eyebrow">면접 안내</p>
            <h2>채용 AI 면접 안내</h2>
          </div>
          <button type="button" className="ivg-modal-close" aria-label="닫기" onClick={onClose}>✕</button>
        </header>

        <ol className="ivg-track" aria-label="채용 AI 면접 준비 단계">
          <li className="ivg-track-step is-current"><span className="ivg-track-no">1</span>응시 안내</li>
          <li className="ivg-track-step"><span className="ivg-track-no">2</span>장치 점검</li>
          <li className="ivg-track-step"><span className="ivg-track-no">3</span>{primaryLabel}</li>
        </ol>

        <div className="ivg-modal-body">
          {loading || !guide ? (
            <p className="empty">면접 안내를 불러오는 중이에요.</p>
          ) : (
            <div key={subStep} className={`ivg-step-panel${stepDir === "prev" ? " ivg-step-prev" : ""}`}>
              <div className="ivg-substep-head">
                <span className="ivg-substep-count">{subStep + 1} / 3</span>
                <h3>{["진행 방식", "필수 준비 사항", "응시 무결성 안내"][subStep]}</h3>
              </div>

              {subStep === 0 ? (
                <ul className="ivg-flow">
                  {guide.method.map((item, index) => (
                    <li key={`method-${index}`}>
                      <span className="ivg-flow-no">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {subStep === 1 ? (
                <ul className="ivg-check">
                  {guide.requiredPreparations.map((item, index) => (
                    <li key={`prep-${index}`}>
                      <span className="ivg-check-icon" aria-hidden="true">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {subStep === 2 ? (
                <>
                  <div className="ivg-callout">
                    <div className="ivg-callout-head">
                      <span className="ivg-callout-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                      </span>
                      <strong>면접 중 응시 환경 신호가 기록됩니다</strong>
                    </div>
                    <ul>
                      <li>화면·탭 이탈, 얼굴 미검출·복수 얼굴, 카메라 연결, 시선 이탈, 음성과 입 모양의 불일치 등을 답변별 참고 신호로 확인합니다.</li>
                      <li>감지 신호는 브라우저에서 수집된 미검증 참고 정보로 채용 담당자 검토 화면에 표시되며 평가 점수에는 반영되지 않습니다.</li>
                      <li>감지 신호만으로 부정행위를 확정하거나 자동 탈락 처리하지 않으며, 채용 담당자가 답변 내용과 녹화 영상을 함께 검토합니다.</li>
                    </ul>
                  </div>

                  <div className="ivg-consent-block">
                    <h4 className="ivg-consent-title">필수 동의</h4>
                    <p className="ivg-consent-sub">개인정보·AI 분석·녹화/녹음 안내를 확인하고 모두 동의해야 시작할 수 있어요.</p>
                    <div className="ivg-consent-grid">
                      {requiredInterviewConsents.map((consentType) => {
                        const checked = consentState.consentTypes.includes(consentType);
                        return (
                          <label key={consentType} className={`ivg-consent-item${checked ? " is-checked" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setConsentState((current) => ({
                                  consentTypes: toggleValue(current.consentTypes, consentType),
                                }))
                              }
                            />
                            <span>{formatConsentTypeLabel(consentType)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              {message ? <p className="notice danger ivg-modal-message">{message}</p> : null}
            </div>
          )}
          {error ? <p className="notice danger">{toErrorMessage(error)}</p> : null}
        </div>

        <footer className="ivg-modal-foot">
          {subStep > 0 ? (
            <button className="btn secondary" type="button" onClick={goPrevStep}>
              이전
            </button>
          ) : (
            <span className="ivg-modal-window">
              {guide ? `응시 가능 ${formatDateTime(guide.interviewWindowEndsAt)}까지` : ""}
            </span>
          )}
          {subStep < 2 ? (
            <button className="btn primary" type="button" disabled={!guide} onClick={goNextStep}>
              다음
            </button>
          ) : (
            <button className="btn primary" type="button" disabled={busy || !consentComplete} onClick={() => void handleProceed()}>
              장치 점검으로
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function CandidateInterviewGuidePage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneFrameRef = useRef<number | null>(null);
  const cameraQualityIntervalRef = useRef<number | null>(null);
  const [deviceState, setDeviceState] = useState<CandidateDeviceCheckState>(defaultDeviceCheckState);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [, setCameraPreviewStatus] = useState("카메라 대기");
  const [cameraFramingState, setCameraFramingState] = useState<CameraFramingState>("idle");
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("마이크 대기");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [networkStatus, setNetworkStatus] = useState("네트워크 대기");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getCandidateApi().getInterviewGuide(applicationId), [applicationId]);
  const { data, loading, error } = useCandidateResource(load, [applicationId]);
  const guide = data?.data;
  const guideInterviewAlreadyInProgress = guide?.interviewSessionStatus === "IN_PROGRESS";
  const guidePrimaryActionLabel = guideInterviewAlreadyInProgress ? "면접 재개" : "면접 시작";
  const demoPresetActionLabel = guide?.demoPreset.reasonCode === "OFFICIAL_SESSION_EXISTS"
    ? guide.demoPreset.status === "READY"
      ? "공식 3문항 시연 이어하기"
      : "공식 3문항 시연 이용 불가"
    : "공식 3문항 시연 시작";
  const deviceTestSentence = useMemo(() => pickDeviceTestSentence(), []);

  // 동의 전(면접 안내 필요) 상태로 이 라우트에 직접 진입하면, 지원 내역 위에서 안내 모달이 뜨도록 리다이렉트한다. (#288)
  useEffect(() => {
    if (guide && !guide.consentCompleted) {
      router.replace(`${candidateApplicationInterviewRoutes.applications}?guide=${applicationId}`);
    }
  }, [guide, applicationId, router]);

  useEffect(() => {
    void refreshGuideCameraDevices();
    return () => {
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
    };
    // Device enumeration is intentionally run once when entering the guide flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (guide) {
      setDeviceState({
        cameraGranted: guide.deviceCheckCompleted,
        microphoneGranted: guide.deviceCheckCompleted,
        networkStable: guide.deviceCheckCompleted,
      });
      if (guide.deviceCheckCompleted) {
        setCameraPreviewStatus("이전 장치 점검 완료 · 현재 장치를 다시 확인해주세요");
        setMicrophoneStatus("이전 마이크 점검 완료 · 현재 장치를 다시 확인해주세요");
      }
    }
  }, [guide]);

  async function refreshGuideCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const audioDevices = devices.filter((device) => device.kind === "audioinput");
    setCameraDevices(videoDevices);
    setMicrophoneDevices(audioDevices);
    if (!selectedCameraId && videoDevices.length === 1) {
      setSelectedCameraId(videoDevices[0]?.deviceId ?? "");
    }
    if (!selectedMicrophoneId && audioDevices.length === 1) {
      setSelectedMicrophoneId(audioDevices[0]?.deviceId ?? "");
    }
  }

  function stopGuideMicrophoneMeter() {
    if (microphoneFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneFrameRef.current);
      microphoneFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicrophoneLevel(0);
  }

  function stopGuideCameraQualityMonitor() {
    if (cameraQualityIntervalRef.current !== null) {
      window.clearInterval(cameraQualityIntervalRef.current);
      cameraQualityIntervalRef.current = null;
    }
  }

  function startGuideCameraQualityMonitor(previewInfo: CameraPreviewInfo, fallbackLabel?: string) {
    stopGuideCameraQualityMonitor();
    const video = videoRef.current;
    if (!video) return;

    cameraQualityIntervalRef.current = startCameraQualityMonitor(video, previewInfo, fallbackLabel, (quality, framing, status) => {
      const cameraOk = quality.ok && !framing.blocking;
      setCameraReady(cameraOk);
      setCameraFramingState(framing.state);
      setCameraPreviewStatus(status);
      setDeviceState((current) => ({ ...current, cameraGranted: cameraOk }));
    });
  }

  function startGuideMicrophoneMeter(stream: MediaStream) {
    stopGuideMicrophoneMeter();
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) return;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    const samples = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      samples.forEach((sample) => {
        peak = Math.max(peak, Math.abs(sample - 128));
      });
      const level = Math.min(100, Math.round((peak / 128) * 100));
      setMicrophoneLevel(level);
      microphoneFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  async function handleDevicePreview() {
    warmUpInterviewAudioOutput();
    setMessage("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("현재 브라우저에서 카메라/마이크 점검을 사용할 수 없습니다.");
      }
      stopGuideMicrophoneMeter();
      stopGuideCameraQualityMonitor();
      stopMediaStream(mediaStreamRef.current);
      setCameraReady(false);
      setCameraFramingState("idle");
      setMicrophoneReady(false);
      setCameraPreviewStatus("카메라 연결 중");
      setMicrophoneStatus(`테스트 문장을 읽어주세요. 예: ${deviceTestSentence}`);
      setNetworkStatus("네트워크 확인 중");
      const streamResult = await getCameraMediaStream(selectedCameraId, selectedMicrophoneId);
      const { stream, audioEnabled, fallbackLabel } = streamResult;
      mediaStreamRef.current = stream;
      let previewInfo: CameraPreviewInfo | undefined;
      if (videoRef.current) {
        previewInfo = await attachMediaStreamToVideo(videoRef.current, stream);
      }
      assertCameraPreviewHasFrame(previewInfo);
      const cameraQuality = assessCameraQuality(videoRef.current);
      const cameraFraming = getCameraFramingNotice();
      const microphoneQuality = audioEnabled
        ? await measureMicrophoneQuality(stream, setMicrophoneLevel)
        : { ok: false, peakLevel: 0, message: formatMicrophoneStatus(streamResult) };
      const networkQuality = await checkInterviewNetworkQuality();
      const cameraOk = cameraQuality.ok && !cameraFraming.blocking;
      const microphoneOk = audioEnabled && isMicrophoneTrackReady(stream);
      setCameraReady(cameraOk);
      setCameraFramingState(cameraFraming.state);
      setMicrophoneReady(microphoneOk);
      setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, fallbackLabel, cameraQuality, cameraFraming));
      setMicrophoneStatus(audioEnabled ? formatMicrophoneQualityStatus(streamResult, microphoneQuality) : microphoneQuality.message);
      setNetworkStatus(networkQuality.message);
      setDeviceState({
        cameraGranted: cameraOk,
        microphoneGranted: microphoneOk,
        networkStable: networkQuality.ok,
      });
      startGuideCameraQualityMonitor(previewInfo, fallbackLabel);
      if (audioEnabled) {
        startGuideMicrophoneMeter(stream);
      } else {
        setMicrophoneLevel(0);
      }
      await refreshGuideCameraDevices();
      setMessage(
        fallbackLabel
          ? `카메라를 연결했습니다. ${fallbackLabel} 마이크 권한을 확인한 뒤 면접을 시작해주세요.`
          : cameraOk && microphoneOk && networkQuality.ok
            ? "카메라 밝기, 마이크 입력, 네트워크 상태가 적정합니다. 면접 시작을 눌러주세요."
            : "장치 점검 기준을 통과하지 못했습니다. 안내에 따라 카메라 위치, 조명, 마이크 입력을 조정해주세요.",
      );
    } catch (previewError) {
      setCameraReady(false);
      setCameraFramingState("idle");
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      const microphoneProbe = await probeMicrophone(selectedMicrophoneId);
      setMicrophoneReady(microphoneProbe.ok);
      setMicrophoneStatus(formatMicrophoneProbeStatus(microphoneProbe));
      setCameraPreviewStatus(`카메라 연결 실패: ${formatMediaError(previewError)}`);
      const networkQuality = await checkInterviewNetworkQuality();
      setNetworkStatus(networkQuality.message);
      setDeviceState((current) => ({ ...current, networkStable: networkQuality.ok }));
      setMessage(
        microphoneProbe.ok
          ? `${formatMediaError(previewError)} 마이크는 연결되지만 녹화를 위해 카메라 권한도 필요합니다.`
          : `${formatMediaError(previewError)} ${formatMicrophoneProbeStatus(microphoneProbe)}`,
      );
    }
  }

  async function handleStartInterview(mode: "STANDARD" | "DEMO_PRESET" = "STANDARD") {
    warmUpInterviewAudioOutput();
    if (!guide) return;
    if (!cameraReady || !microphoneReady || !deviceState.networkStable) {
      setMessage("카메라, 마이크, 네트워크 점검을 완료한 뒤 면접을 시작해주세요.");
      return;
    }
    const stream = mediaStreamRef.current;
    const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    if (!hasLiveVideo || !hasLiveAudio) {
      setCameraReady(false);
      setMicrophoneReady(false);
      setMessage("현재 브라우저의 카메라와 마이크가 연결되어 있지 않습니다. 카메라/마이크 점검을 다시 눌러주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      if (!guide.deviceCheckCompleted) {
        await getCandidateApi().saveDeviceCheck(guide.sessionId, toDeviceCheckRequest(deviceState));
      }
      await getCandidateApi().startInterview(applicationId, mode);
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      router.push(candidateApplicationInterviewRoutes.interview(applicationId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleCameralessGuideEntry() {
    if (!guide || !ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY) return;

    warmUpInterviewAudioOutput();
    const testDeviceState = createCameralessInterviewTestDeviceCheckState();
    setBusy(true);
    setMessage("");
    try {
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      setDeviceState(testDeviceState);
      setCameraReady(true);
      setCameraFramingState("unsupported");
      setMicrophoneReady(true);
      setMicrophoneLevel(0);
      setCameraPreviewStatus("개발 테스트 모드: 카메라 점검 우회");
      setMicrophoneStatus("개발 테스트 모드: 마이크 점검 우회");
      setNetworkStatus("개발 테스트 모드: 네트워크 점검 우회");

      const api = getCandidateApi();
      if (!guide.deviceCheckCompleted) {
        await api.saveDeviceCheck(guide.sessionId, toDeviceCheckRequest(testDeviceState));
      }
      if (!guideInterviewAlreadyInProgress) {
        await api.startInterview(applicationId, guide.sessionMode ?? "STANDARD");
      }
      rememberCameralessInterviewTestEntry("recruiting", guide.sessionId);
      router.push(candidateApplicationInterviewRoutes.interview(applicationId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="applications">
      <StatusNotice loading={loading || busy} error={error} message={message} />
      {guide ? (
        <>
          {guide.consentCompleted ? (
            <section className="dvc">
              <header className="dvc__head">
                <p className="dvc__eyebrow">장치 점검</p>
                <h1 className="dvc__title">카메라와 마이크를 확인해주세요</h1>
                <p className="dvc__sub">준비가 모두 완료되면 면접을 시작할 수 있어요.</p>
              </header>

              <div className="dvc__progress" role="list" aria-label="채용 AI 면접 준비 단계">
                <span className="dvc__step is-done" role="listitem"><i className="dvc__pnode">✓</i>응시 안내</span>
                <span className="dvc__pbar" aria-hidden="true" />
                <span className="dvc__step is-now" role="listitem"><i className="dvc__pnode">2</i>장치 점검</span>
                <span className="dvc__pbar" aria-hidden="true" />
                <span className="dvc__step" role="listitem"><i className="dvc__pnode">3</i>{guidePrimaryActionLabel}</span>
              </div>

              <div className="dvc__grid">
                <div className="dvc__cam video-box">
                  <video ref={videoRef} autoPlay muted playsInline />
                  <CameraFramingOverlay state={cameraFramingState} testSentence={deviceTestSentence} />
                  <span className="dvc__cam-chip">
                    <i className={`dvc__cam-dot${cameraReady ? " is-on" : ""}`} aria-hidden="true" />
                    {cameraReady ? "카메라 연결됨" : "카메라 연결 확인 필요"}
                  </span>
                </div>

                <aside className="dvc__side">
                  {guide.demoPreset ? (
                    <div className="dvc__card" aria-live="polite">
                      <h3>공식 3문항 시연</h3>
                      <p>{getDemoPresetReadinessMessage(guide.demoPreset.reasonCode, guide.demoPreset.status)}</p>
                    </div>
                  ) : null}
                  <div className="dvc__card">
                    <h3>준비 상태</h3>
                    <ul className="dvc__check">
                      <li className="dvc__crow">
                        <span className={`dvc__ic ${cameraReady ? "is-ok" : "is-warn"}`}>{cameraReady ? "✓" : "!"}</span>
                        <div className="dvc__cmain">
                          <b>카메라</b>
                          <span>{cameraReady ? "정상 연결됨" : "연결을 확인해주세요"}</span>
                        </div>
                        <span className={`dvc__pill ${cameraReady ? "is-ok" : "is-warn"}`}>{cameraReady ? "정상" : "확인 필요"}</span>
                      </li>
                      <li className="dvc__crow">
                        <span className={`dvc__ic ${microphoneReady ? "is-ok" : "is-warn"}`}>{microphoneReady ? "✓" : "!"}</span>
                        <div className="dvc__cmain">
                          <b>마이크</b>
                          <span>{microphoneStatus}</span>
                          <div className="dvc__meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                            <i style={{ width: `${microphoneLevel}%` }} />
                          </div>
                        </div>
                      </li>
                      <li className="dvc__crow">
                        <span className={`dvc__ic ${deviceState.networkStable ? "is-ok" : "is-warn"}`}>{deviceState.networkStable ? "✓" : "!"}</span>
                        <div className="dvc__cmain">
                          <b>네트워크</b>
                          <span>{networkStatus}</span>
                        </div>
                        <span className={`dvc__pill ${deviceState.networkStable ? "is-ok" : "is-warn"}`}>{deviceState.networkStable ? "정상" : "확인 중"}</span>
                      </li>
                    </ul>
                  </div>

                  <div className="dvc__card">
                    <h3>장치 선택</h3>
                    <div className="dvc__fields">
                      <label className="dvc__field">
                        <span>카메라</span>
                        <select
                          aria-label="카메라 선택"
                          value={selectedCameraId}
                          onChange={(event) => setSelectedCameraId(event.target.value)}
                        >
                          <option value="">기본 카메라</option>
                          {cameraDevices.map((device, index) => (
                            <option key={device.deviceId || index} value={device.deviceId}>
                              {device.label || `카메라 ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="dvc__field">
                        <span>마이크</span>
                        <select
                          aria-label="마이크 선택"
                          value={selectedMicrophoneId}
                          onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                        >
                          <option value="">기본 마이크</option>
                          {microphoneDevices.map((device, index) => (
                            <option key={device.deviceId || index} value={device.deviceId}>
                              {device.label || `마이크 ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="dvc__relinks">
                        <button type="button" className="dvc__link" disabled={busy} onClick={() => void refreshGuideCameraDevices()}>
                          장치 새로고침
                        </button>
                        <button type="button" className="dvc__link" disabled={busy} onClick={() => void handleDevicePreview()}>
                          다시 점검
                        </button>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>

              <div className="dvc__foot">
                <p className="dvc__note">카메라·마이크 권한을 허용해야 면접을 진행할 수 있어요.</p>
                <div className="dvc__actions">
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => router.push(candidateApplicationInterviewRoutes.applications)}
                  >
                    이전
                  </button>
                  {ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY ? (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCameralessGuideEntry()}
                    >
                      카메라 없이 테스트 진입
                    </button>
                  ) : null}
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy || !guide.demoPreset?.canStart || !cameraReady || !microphoneReady || !deviceState.networkStable}
                    onClick={() => void handleStartInterview("DEMO_PRESET")}
                  >
                    {demoPresetActionLabel}
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={busy || !cameraReady || !microphoneReady || !deviceState.networkStable}
                    onClick={() => void handleStartInterview("STANDARD")}
                  >
                    {guidePrimaryActionLabel}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </CandidatePageShell>
  );
}

export function CandidateInterviewPage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const load = useCallback(async (): Promise<RuntimePageData> => {
    const api = getCandidateApi();
    const runtimeResult = await api.getInterviewRuntime(applicationId);
    if (runtimeResult.data.status !== "IN_PROGRESS") {
      const emptyQuestions: RuntimeQuestionListResponse = {
        sessionId: runtimeResult.data.sessionId,
        interviewType: runtimeResult.data.interviewType,
        showQuestionText: runtimeResult.data.showQuestionText,
        questions: [],
      };

      return {
        runtime: toRecruitingRuntimeSession(runtimeResult.data, emptyQuestions),
        questions: emptyQuestions,
      };
    }

    const questionsResult = await api.listRecruitingQuestions(runtimeResult.data.sessionId);
    return {
      runtime: toRecruitingRuntimeSession(runtimeResult.data, questionsResult.data),
      questions: questionsResult.data,
    };
  }, [applicationId]);
  const resource = useCandidateResource(load, [applicationId]);
  const runtimeStatus = resource.data?.runtime.status;
  const shouldRedirectToReport = runtimeStatus === "COMPLETED";
  const shouldRedirectToGuide =
    (runtimeStatus !== undefined && runtimeStatus !== "IN_PROGRESS" && runtimeStatus !== "COMPLETED") ||
    resource.error === "Interview has not been started.";

  useEffect(() => {
    if (!shouldRedirectToReport) return;
    router.replace(candidateApplicationInterviewRoutes.applicationReport(applicationId));
  }, [applicationId, router, shouldRedirectToReport]);

  useEffect(() => {
    if (!shouldRedirectToGuide) return;
    router.replace(candidateApplicationInterviewRoutes.interviewGuide(applicationId));
  }, [applicationId, router, shouldRedirectToGuide]);

  if (shouldRedirectToReport) {
    return (
      <CandidatePageShell active="applications">
        <StatusNotice loading message="면접 결과 화면으로 이동합니다." />
      </CandidatePageShell>
    );
  }

  if (shouldRedirectToGuide) {
    return (
      <CandidatePageShell active="applications">
        <StatusNotice loading message="면접 안내 화면으로 이동합니다." />
      </CandidatePageShell>
    );
  }

  return <InterviewRuntimePanel mode="recruiting" resource={resource} />;
}

export function PublicCandidateInterviewPage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const api = useMemo(() => getPublicInterviewApi(), []);
  const load = useCallback(async (): Promise<RuntimePageData> => {
    const runtimeResult = await api.getInterviewRuntime(applicationId);
    if (runtimeResult.data.status !== "IN_PROGRESS") {
      const emptyQuestions: RuntimeQuestionListResponse = {
        sessionId: runtimeResult.data.sessionId,
        interviewType: runtimeResult.data.interviewType,
        showQuestionText: runtimeResult.data.showQuestionText,
        questions: [],
      };

      return {
        runtime: toRecruitingRuntimeSession(runtimeResult.data, emptyQuestions),
        questions: emptyQuestions,
      };
    }

    const questionsResult = await api.listRecruitingQuestions(runtimeResult.data.sessionId);
    return {
      runtime: toRecruitingRuntimeSession(runtimeResult.data, questionsResult.data),
      questions: questionsResult.data,
    };
  }, [api, applicationId]);
  const resource = useCandidateResource(load, [applicationId]);

  return (
    <InterviewRuntimePanel
      mode="recruiting"
      resource={resource}
      apiClient={api}
      onRecruitingComplete={(completedApplicationId) => {
        router.push(candidateApplicationInterviewRoutes.publicInterviewComplete(completedApplicationId));
      }}
    />
  );
}

const MOCK_GUIDE_STEPS = [
  {
    image: "/mock-step-settings.png",
    step: "STEP 1",
    title: "설정 선택",
    description: "직무·난이도·질문 유형을 골라 연습을 준비해요.",
  },
  {
    image: "/mock-step-device.png",
    step: "STEP 2",
    title: "장치 점검",
    description: "카메라와 마이크 입력을 미리 확인해요.",
  },
  {
    image: "/mock-step-answer.png",
    step: "STEP 3",
    title: "답변 진행",
    description: "질문을 듣고 정해진 시간 안에 답변을 녹화해요.",
  },
] as const;

const MOCK_JOB_ROLES: { value: string; label: string }[] = [
  { value: "Backend", label: "백엔드" },
  { value: "Frontend", label: "프론트엔드" },
  { value: "Full Stack", label: "풀스택" },
  { value: "Android", label: "안드로이드" },
  { value: "iOS", label: "iOS" },
  { value: "Cross Platform", label: "크로스플랫폼" },
  { value: "AI", label: "AI/ML" },
  { value: "Data Engineer", label: "데이터 엔지니어" },
  { value: "DevOps", label: "DevOps·SRE" },
  { value: "QA", label: "QA·테스트" },
  { value: "Security", label: "보안" },
  { value: "Embedded", label: "임베디드" },
  { value: "Game", label: "게임 개발" },
  { value: "Blockchain", label: "블록체인" },
  { value: "System Network", label: "시스템·네트워크" },
];

const MOCK_DIFFICULTIES: { value: StartMockInterviewState["difficulty"]; label: string; description: string }[] = [
  { value: "EASY", label: "초급", description: "기초 개념을 확인하는 질문" },
  { value: "NORMAL", label: "중급", description: "실무 경험 중심의 질문" },
  { value: "HARD", label: "고급", description: "심화 개념과 설계 질문" },
];

export function CandidateMockInterviewStartPage() {
  const router = useRouter();
  const [state, setState] = useState<StartMockInterviewState>(defaultStartMockInterviewState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const historyLoad = useCallback(() => getCandidateApi().listMockInterviewHistory(), []);
  const historyResource = useCandidateResource(historyLoad, []);
  const foldersLoad = useCallback(() => getCandidateApi().listFolders(), []);
  const foldersResource = useCandidateResource(foldersLoad, []);
  const folders = foldersResource.data?.data.items ?? [];

  // 직무 캐러셀: 스크롤 위치에 따라 좌/우 넘김 버튼과 페이드를 토글한다.
  const roleRowRef = useRef<HTMLDivElement>(null);
  const [roleEdge, setRoleEdge] = useState({ start: true, end: false });
  useEffect(() => {
    if (!settingsOpen) return;
    const el = roleRowRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setRoleEdge({
        start: el.scrollLeft <= 1,
        end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 1,
      });
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [settingsOpen]);

  function slideRoles(direction: 1 | -1) {
    const el = roleRowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const startRequest = toStartMockInterviewRequest(state);
      let questionProcessLogId: number | undefined;
      try {
        setMessage("프로필과 지원서 세트를 바탕으로 맞춤형 질문을 만들고 있습니다.");
        const generation = await getCandidateApi().generateMockQuestions({
          questionCount: Math.max(1, state.questionTypes?.length ?? 4),
          folderId: state.folderId ?? undefined,
          jobRole: state.jobRole || undefined,
          difficulty: state.difficulty,
          questionTypes: state.questionTypes,
        });
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          const status = await getCandidateApi().getAiJobStatus(generation.data.processLogId);
          if (status.data.status === "COMPLETED") {
            questionProcessLogId = generation.data.processLogId;
            break;
          }
          if (status.data.status === "FAILED") break;
          await new Promise((resolve) => window.setTimeout(resolve, 750));
        }
      } catch {
        // 질문 생성 실패·시간 초과 시 기존 공통/규칙 기반 질문으로 안전하게 시작한다.
      }
      let result;
      try {
        result = await getCandidateApi().startMockInterview({ ...startRequest, questionProcessLogId });
      } catch (startError) {
        if (!questionProcessLogId) throw startError;
        result = await getCandidateApi().startMockInterview(startRequest);
      }
      router.push(getMockInterviewDeviceCheckHref(result.data));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="interview">
      <section className="candidate-mock-start-page glass-page notion">
        <CandidatePageHead
          eyebrow=""
          title="개인 연습용 AI 모의면접"
          description="합격/탈락 판단 없이 연습 피드백만 제공합니다."
          actions={
            <Link className="btn secondary" href={candidateApplicationInterviewRoutes.mockReports}>
              연습 이력
            </Link>
          }
        />
        <StatusNotice loading={busy && !settingsOpen} message={message && !settingsOpen ? message : undefined} />
        <section className="mock-guide">
          <div className="mock-guide-head">
            <h2>이렇게 진행돼요</h2>
          </div>
          <ol className="mock-guide-cards" aria-label="모의면접 진행 순서">
            {MOCK_GUIDE_STEPS.map((item) => (
              <li className="mock-guide-card" key={item.step}>
                <span className="mock-guide-step">{item.step}</span>
                <Image
                  className="mock-guide-art"
                  src={item.image}
                  alt=""
                  width={180}
                  height={180}
                  loading="eager"
                  aria-hidden="true"
                />
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </li>
            ))}
          </ol>
          <div className="mock-guide-actions">
            <button className="btn secondary" type="button" onClick={() => setHistoryOpen(true)}>
              이어하기
            </button>
            <button className="btn primary" type="button" onClick={() => setSettingsOpen(true)}>
              모의면접 설정하기
            </button>
          </div>
        </section>
        {historyOpen ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setHistoryOpen(false);
            }}
          >
            <div className="modal wide-modal candidate-mock-history-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-mock-history-title">
              <div className="modal-head">
                <div>
                  <h2 id="candidate-mock-history-title">연습 이력</h2>
                  <p>진행 중인 연습은 이어서 하고, 완료된 연습은 리포트를 확인할 수 있어요.</p>
                </div>
                <button className="btn secondary compact" type="button" onClick={() => setHistoryOpen(false)}>
                  닫기
                </button>
              </div>
              <StatusNotice loading={historyResource.loading} error={historyResource.error} />
              {historyResource.data?.data.items.length ? (
                <MockHistoryTable history={historyResource.data.data.items} />
              ) : (
                <p className="empty">아직 모의면접 이력이 없어요.</p>
              )}
            </div>
          </div>
        ) : null}
        {settingsOpen ? (
          <div
            className="mocksettings-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busy) setSettingsOpen(false);
            }}
          >
            <form
              className="mocksettings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="candidate-mock-settings-title"
              onSubmit={handleSubmit}
            >
              <header className="mocksettings-head">
                <div>
                  <h2 id="candidate-mock-settings-title">모의면접 설정</h2>
                  <p>설정을 마치면 카메라·마이크 점검 화면으로 이동해요.</p>
                </div>
                <button type="button" className="mocksettings-close" aria-label="닫기" disabled={busy} onClick={() => setSettingsOpen(false)}>
                  ✕
                </button>
              </header>

              <div className="mocksettings-body">
                {message ? <p className="notice danger">{message}</p> : null}

                {folders.length > 0 ? (
                  <div className="mocksettings-field">
                    <span className="mocksettings-label">지원서 세트 <em className="mocksettings-optional">(선택)</em></span>
                    <div className="mocksettings-folders">
                      <button
                        type="button"
                        className={`mocksettings-pill${state.folderId === null ? " is-active" : ""}`}
                        onClick={() => setState((current) => ({ ...current, folderId: null }))}
                      >
                        선택 안 함
                      </button>
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          className={`mocksettings-pill${state.folderId === folder.id ? " is-active" : ""}`}
                          onClick={() => setState((current) => ({ ...current, folderId: folder.id }))}
                        >
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mocksettings-field">
                  <span className="mocksettings-label">직무</span>
                  <div className={`mocksettings-rolewrap${roleEdge.start ? " is-start" : ""}${roleEdge.end ? " is-end" : ""}`}>
                    <div className="mocksettings-roles" ref={roleRowRef}>
                      {MOCK_JOB_ROLES.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`mocksettings-pill${state.jobRole === option.value ? " is-active" : ""}`}
                          onClick={() => setState((current) => ({ ...current, jobRole: option.value }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {roleEdge.start ? null : (
                      <button type="button" className="mocksettings-role-nav prev" aria-label="이전 직무" onClick={() => slideRoles(-1)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </button>
                    )}
                    {roleEdge.end ? null : (
                      <button type="button" className="mocksettings-role-nav next" aria-label="다음 직무" onClick={() => slideRoles(1)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="mocksettings-field">
                  <span className="mocksettings-label">난이도</span>
                  <div className="mocksettings-levels" role="radiogroup" aria-label="난이도">
                    {MOCK_DIFFICULTIES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={state.difficulty === option.value}
                        className={`mocksettings-level${state.difficulty === option.value ? " is-active" : ""}`}
                        onClick={() => setState((current) => ({ ...current, difficulty: option.value }))}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mocksettings-field">
                  <div className="mocksettings-label-row">
                    <span className="mocksettings-label">질문 유형</span>
                    <span className="mocksettings-hint">선택하지 않으면 전체 유형에서 출제돼요</span>
                  </div>
                  <div className="mocksettings-pills">
                    {questionTypeOptions.map((questionType) => (
                      <button
                        key={questionType}
                        type="button"
                        aria-pressed={state.questionTypes?.includes(questionType) ?? false}
                        className={`mocksettings-pill${state.questionTypes?.includes(questionType) ? " is-active" : ""}`}
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            questionTypes: toggleValue(current.questionTypes ?? [], questionType),
                          }))
                        }
                      >
                        {formatQuestionTypeLabel(questionType)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <footer className="mocksettings-foot">
                <p className="mocksettings-summary" aria-live="polite">
                  {MOCK_JOB_ROLES.find((option) => option.value === state.jobRole)?.label ?? state.jobRole}
                  {" · "}
                  {MOCK_DIFFICULTIES.find((option) => option.value === state.difficulty)?.label}
                  {" · "}
                  {state.questionTypes?.length
                    ? `질문 유형 ${state.questionTypes.length}개`
                    : "전체 유형"}
                </p>
                <button className="btn primary mocksettings-start" type="submit" disabled={busy}>
                  {busy ? "시작하는 중…" : "모의면접 시작"}
                </button>
              </footer>
            </form>
          </div>
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateMockInterviewRuntimePage({ sessionId }: { sessionId: number }) {
  const load = useCallback(async (): Promise<RuntimePageData> => {
    const api = getCandidateApi();
    const [runtimeResult, questionsResult] = await Promise.all([
      api.getMockRuntime(sessionId),
      api.listMockQuestions(sessionId),
    ]);
    return {
      runtime: runtimeResult.data,
      questions: questionsResult.data,
    };
  }, [sessionId]);
  const resource = useCandidateResource(load, [sessionId]);

  return <InterviewRuntimePanel mode="mock" resource={resource} />;
}

export function CandidateMockReportsPage() {
  const load = useCallback(async () => {
    const api = getCandidateApi();
    const [history, reports] = await Promise.all([
      api.listMockInterviewHistory(),
      api.listMockReports(),
    ]);
    return { history: mergeMockHistoryWithReports(history.data.items, reports.data.items) };
  }, []);
  const { data, loading, error, refresh } = useCandidateResource(load, []);

  return (
    <CandidatePageShell active="reports">
      <CandidatePageHead
        eyebrow="모의면접"
        title="연습 이력"
        description="진행 중인 연습은 이어서 하고, 완료된 연습은 리포트를 확인할 수 있어요."
        actions={
          <>
            <button className="btn secondary" type="button" onClick={() => void refresh().catch(() => undefined)}>새로고침</button>
            <Link className="btn primary" href={candidateApplicationInterviewRoutes.mockInterviewStart}>모의면접 시작</Link>
          </>
        }
      />
      <StatusNotice loading={loading} error={error} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>연습 이력</h2>
            <p>모의면접 세션별 진행 상태와 피드백 리포트를 확인합니다.</p>
          </div>
        </div>
        {data?.history.length ? <MockHistoryTable history={data.history} /> : <p className="empty">아직 모의면접 이력이 없어요.</p>}
      </section>
    </CandidatePageShell>
  );
}

function mergeMockHistoryWithReports(
  history: CandidateMockInterviewHistoryItem[],
  reports: CandidateMockReportSummary[],
): CandidateMockInterviewHistoryItem[] {
  const reportsBySessionId = new Map(reports.map((report) => [report.sessionId, report]));

  return history.map((item) => {
    const report = reportsBySessionId.get(item.sessionId);
    if (!report) return item;

    return {
      ...item,
      reportId: report.reportId,
      reportStatus: report.reportStatus,
    };
  });
}

export function CandidateMockReportDetailPage({ reportId }: { reportId: number }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generationRequested, setGenerationRequested] = useState(false);
  // 실전 리포트처럼 종합/답변 탭으로 분리해 스크롤 부담을 줄인다. (#289)
  const [tab, setTab] = useState<"overview" | "answers">("overview");
  const load = useCallback(async (): Promise<MockReportDetailData> => {
    const api = getCandidateApi();
    const [feedbackResult, mediaResult] = await Promise.allSettled([
      api.getMockReportFeedback(reportId),
      api.getMockReportMedia(reportId),
    ]);
    return {
      feedback: feedbackResult.status === "fulfilled" ? feedbackResult.value.data : undefined,
      feedbackError: feedbackResult.status === "rejected" ? toErrorMessage(feedbackResult.reason) : undefined,
      media: mediaResult.status === "fulfilled" ? mediaResult.value.data : undefined,
      mediaError: mediaResult.status === "rejected" ? toErrorMessage(mediaResult.reason) : undefined,
    };
  }, [reportId]);
  const { data, loading, error, refresh } = useCandidateResource(load, [reportId]);
  const reportStatus = data?.feedback?.status ?? data?.media?.status ?? (generationRequested ? "GENERATING" : undefined);
  const reportStatusView = getMockReportStatusView(reportStatus, data?.feedbackError);
  const canRequestReport = !busy && reportStatus !== "GENERATING" && reportStatus !== "COMPLETED";
  const showReportRequestButton = reportStatus !== "COMPLETED";

  useEffect(() => {
    if (reportStatus !== "GENERATING") return;
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh, reportStatus]);

  async function handleGenerate() {
    setBusy(true);
    setMessage("");
    try {
      await getCandidateApi().requestMockReportGeneration(reportId);
      setGenerationRequested(true);
      setMessage("AI 분석 요청이 접수되었습니다. 분석이 완료되면 리포트가 자동으로 갱신됩니다.");
      void refresh().catch(() => undefined);
    } catch (generateError) {
      setMessage(toErrorMessage(generateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="reports">
      <CandidatePageHead
        eyebrow="리포트 상세"
        title="모의면접 리포트"
        description="분석 결과를 지원자 연습용 피드백으로 확인합니다."
        actions={<Link className="btn secondary" href={candidateApplicationInterviewRoutes.mockReports}>목록</Link>}
      />
      <StatusNotice loading={loading || busy} error={error} message={message} />

      <nav className="report-tabs" role="tablist" aria-label="모의면접 리포트 탭">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className={`report-tab${tab === "overview" ? " is-active" : ""}`}
          onClick={() => setTab("overview")}
        >
          종합 피드백
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "answers"}
          className={`report-tab${tab === "answers" ? " is-active" : ""}`}
          onClick={() => setTab("answers")}
        >
          답변 스크립트
        </button>
      </nav>

      {tab === "overview" ? (
        <div className="report-tabpanel" role="tabpanel">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>종합 피드백</h2>
                <p>합격/탈락 판단이나 내부 점수는 노출하지 않습니다.</p>
              </div>
              {showReportRequestButton ? (
                <button className="btn secondary" type="button" disabled={!canRequestReport} onClick={() => void handleGenerate()}>
                  {reportStatus === "FAILED" ? "분석 다시 요청" : "AI 분석 시작"}
                </button>
              ) : null}
            </div>
            {data?.feedback && data.feedback.status === "COMPLETED"
              ? <MockFeedbackView feedback={data.feedback} />
              : <MockReportStatusPanel view={reportStatusView} />}
          </section>
        </div>
      ) : null}

      {tab === "answers" ? (
        <div className="report-tabpanel" role="tabpanel">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>답변 스크립트</h2>
                <p>녹음 답변에서 변환된 텍스트·비언어(아이트래킹) 분석과 생성된 꼬리질문을 확인합니다.</p>
              </div>
            </div>
            {data?.media ? <MockMediaView media={data.media} /> : <p className="notice danger">{data?.mediaError ?? "미디어를 불러오지 못했습니다."}</p>}
          </section>
        </div>
      ) : null}
    </CandidatePageShell>
  );
}

export function CandidateApplicationReportPage({ applicationId }: { applicationId: number }) {
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const requestedReportApplicationRef = useRef<number | null>(null);
  const notifiedReportApplicationRef = useRef<number | null>(null);
  const load = useCallback(async (): Promise<ApplicationReportData> => {
    const api = getCandidateApi();
    const [statusResult, reportResult] = await Promise.allSettled([
      api.getApplicationStatus(applicationId),
      api.getApplicationReport(applicationId),
    ]);
    return {
      status: statusResult.status === "fulfilled" ? statusResult.value.data : undefined,
      statusError: statusResult.status === "rejected" ? toErrorMessage(statusResult.reason) : undefined,
      report: reportResult.status === "fulfilled" ? reportResult.value.data : undefined,
      reportError: reportResult.status === "rejected" ? toErrorMessage(reportResult.reason) : undefined,
    };
  }, [applicationId]);
  const { data, loading, error, refresh } = useCandidateResource(load, [applicationId]);
  const pollingInterviewStatus = data?.status?.interviewStatus;
  const pollingInterviewSessionStatus = data?.status?.interviewSessionStatus;
  const pollingReportStatus = data?.status?.reportStatus;

  useEffect(() => {
    if (!shouldAutoRequestApplicationReport(data)) {
      return;
    }

    if (requestedReportApplicationRef.current === applicationId) {
      return;
    }

    let cancelled = false;
    requestedReportApplicationRef.current = applicationId;
    setGenerationBusy(true);
    setGenerationMessage("");

    getCandidateApi()
      .requestApplicationReportGeneration(applicationId)
      .then(() => {
        if (cancelled) {
          return;
        }
        setGenerationMessage("AI 분석 요청이 접수되었습니다. 완료되면 기업 검토 화면에 반영됩니다.");
        void refresh().catch(() => undefined);
      })
      .catch((reportGenerationError) => {
        if (cancelled) {
          return;
        }
        requestedReportApplicationRef.current = null;
        setGenerationMessage(toErrorMessage(reportGenerationError));
      })
      .finally(() => {
        if (!cancelled) {
          setGenerationBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId, data, refresh]);

  useEffect(() => {
    const pollingStatus = pollingReportStatus
      ? {
          interviewStatus: pollingInterviewStatus ?? "",
          interviewSessionStatus: pollingInterviewSessionStatus ?? "",
          reportStatus: pollingReportStatus,
        }
      : undefined;

    if (!shouldPollRecruitingReportCompletion(pollingStatus)) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function pollReportCompletion() {
      while (!cancelled) {
        await sleep(getRecruitingReportPollingIntervalMs(Date.now() - startedAt));
        if (cancelled) {
          return;
        }

        try {
          const latest = await refresh();
          if (cancelled) {
            return;
          }

          if (latest.status?.reportStatus === "COMPLETED") {
            const notification = buildCandidateReportCompleteNotification(latest.status, new Set());
            if (notification) {
              setToastMessage(notification.message);
              if (notifiedReportApplicationRef.current !== latest.status.applicationId) {
                emitCandidateReportNotification(notification);
                notifiedReportApplicationRef.current = latest.status.applicationId;
              }
            }
            setGenerationMessage("");
            return;
          }

          if (latest.status?.reportStatus === "FAILED") {
            setGenerationMessage("리포트 생성에 실패했습니다. 잠시 후 새로고침하거나 기업 담당자에게 문의해주세요.");
            return;
          }
        } catch (pollError) {
          if (!cancelled) {
            setGenerationMessage(toErrorMessage(pollError));
          }
          return;
        }
      }
    }

    void pollReportCompletion();

    return () => {
      cancelled = true;
    };
  }, [
    applicationId,
    pollingInterviewStatus,
    pollingInterviewSessionStatus,
    pollingReportStatus,
    load,
    refresh,
  ]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timer = window.setTimeout(() => setToastMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  return (
    <CandidatePageShell active="applications">
      <CandidatePageHead
        eyebrow="채용 결과"
        title="채용 AI 면접 결과"
        description={data?.status ? `${data.status.companyName} · ${data.status.jobTitle}` : "면접 제출 여부와 전형 진행 상태를 확인합니다."}
        actions={
          <div className="toolbar">
            <StatusPill value="채용면접" />
            <StatusPill value="기업 검토" />
            <button className="btn secondary" type="button" onClick={() => void refresh().catch(() => undefined)}>새로고침</button>
          </div>
        }
      />
      <StatusNotice loading={loading || generationBusy} error={error} message={generationMessage} />
      {toastMessage ? <div className="candidate-toast" role="status" aria-live="polite">{toastMessage}</div> : null}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>전형 상태</h2>
            <p>지원서와 면접 세션 진행 상태를 확인합니다.</p>
          </div>
        </div>
        {data?.status ? <ApplicationStatusView status={data.status} /> : <p className="notice danger">{data?.statusError ?? "전형 상태를 불러오지 못했습니다."}</p>}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>지원자용 결과</h2>
            <p>면접 제출과 분석 진행 상태를 안내합니다.</p>
          </div>
        </div>
        {data?.report ? (
          <RecruitingReportView report={data.report} />
        ) : (
          <RecruitingReportFallbackView status={data?.status} reportError={data?.reportError} />
        )}
      </section>
      <Link className="btn primary" href={candidateApplicationInterviewRoutes.applications}>지원현황으로 돌아가기</Link>
    </CandidatePageShell>
  );
}

// 마이페이지 '프로필' 탭 — 내 정보 수정 전용. (#272 마이페이지 탭 재편)
export function CandidateMyPage() {
  return (
    <CandidatePageShell active="accountBilling">
      <section className="candidate-mypage glass-page notion">
        <header className="candidate-mypage__head">
          <h1>프로필</h1>
        </header>
        <CandidateMypageTabs />

        <CandidateProfileSection />
      </section>
    </CandidatePageShell>
  );
}

// 마이페이지 '지원서 세트' 탭 — 지원서 세트(폴더) 관리 전용. (#272 마이페이지 탭 재편)
export function CandidateApplicationSetsPage() {
  return (
    <CandidatePageShell active="accountBilling">
      <section className="candidate-mypage glass-page notion">
        <header className="candidate-mypage__head">
          <h1>지원서 세트</h1>
        </header>
        <CandidateMypageTabs />

        <CandidateFoldersSection />
      </section>
    </CandidatePageShell>
  );
}

function MypageStat({
  name,
  label,
  value,
}: {
  name: "applications" | "waiting" | "completed" | "reports";
  label: string;
  value: number;
}) {
  const icons: Record<typeof name, string> = {
    applications: "/candidate-stat-applications-v2.png",
    waiting: "/candidate-stat-waiting-v2.png",
    completed: "/candidate-stat-completed-v2.png",
    reports: "/candidate-stat-reports-v2.png",
  };
  return (
    <article className="mypage-stat">
      <span className="mypage-stat__icon">
        <Image src={icons[name]} alt="" width={22} height={22} aria-hidden="true" />
      </span>
      <span className="mypage-stat__label">{label}</span>
      <strong className="mypage-stat__value">{value}</strong>
    </article>
  );
}

export function CandidateBillingPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [orderPage, setOrderPage] = useState<PaymentOrderPageMeta>(EMPTY_PAYMENT_ORDER_PAGE);
  const [passSummary, setPassSummary] = useState<CandidateMockInterviewPassSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const notifyAlert = useCallback((text: string) => {
    if (typeof window !== "undefined") window.alert(text);
  }, []);

  const loadBillingData = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const [orderData, passData] = await Promise.all([
          listPaymentOrders({ page, limit: PAYMENT_HISTORY_PAGE_LIMIT }),
          getCandidateMockInterviewPassSummary(),
        ]);
        setOrders(orderData.items);
        setOrderPage(orderData.page);
        setPassSummary(passData);
      } catch (error) {
        notifyAlert(error instanceof Error ? error.message : "결제 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [notifyAlert],
  );

  useEffect(() => {
    void loadBillingData();
  }, [loadBillingData]);

  async function handlePayment() {
    setPaying(true);
    try {
      const order = await createPaymentOrder({
        productCode: CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.productCode,
        quantity: 1,
      });
      await requestTossCardPayment(TOSS_CLIENT_KEY, order);
    } catch (error) {
      notifyAlert(error instanceof Error ? error.message : "결제창을 열지 못했습니다.");
      setPaying(false);
    }
  }

  async function handleDevelopmentPassGrant() {
    setLoading(true);
    try {
      const summary = await grantCandidateMockInterviewDevPasses({ passAmount: 5 });
      setPassSummary(summary);
      notifyAlert(`테스트용 모의면접 이용권 5회를 추가했습니다. 현재 사용 가능 ${summary.availablePasses}회`);
    } catch (error) {
      notifyAlert(error instanceof Error ? error.message : "테스트 이용권을 추가하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CandidatePageShell active="accountBilling">
      <section className="candidate-mypage glass-page notion">
        <header className="candidate-mypage__head billing-head">
          <h1>결제 정보</h1>
          <button className="billing-history-open" type="button" onClick={() => setHistoryOpen(true)}>
            최근 결제 내역
          </button>
        </header>
        <CandidateMypageTabs />

        <section className="mypage-block">
          <div className="mypage-block__title">
            <h2>모의면접 이용권</h2>
            <p>무료 이용권 현황을 확인하고 추가 이용권을 구매하세요.</p>
          </div>
          <div className="billing-plan-cards">
            <div className="billing-plan-card">
              <span className="badge success billing-plan-badge">보유 {passSummary?.availablePasses ?? CANDIDATE_FREE_MOCK_INTERVIEW_POLICY.freePasses}회</span>
              <Image className="billing-plan-art" src="/billing-free-pass-v2.png" alt="" width={200} height={200} aria-hidden="true" />
              <strong>신규 지원자 무료 이용권</strong>
              <p className="billing-plan-desc">
                가입 또는 첫 로그인 시 AI 모의면접 {CANDIDATE_FREE_MOCK_INTERVIEW_POLICY.freePasses}회를 무료로 제공합니다. 지급일로부터 {CANDIDATE_FREE_MOCK_INTERVIEW_POLICY.expiresInDays}일 동안 사용할 수 있어요.
              </p>
              {passSummary ? (
                <p className="billing-plan-meta">
                  사용 가능 {passSummary.availablePasses}회 · 사용 {passSummary.usedPasses}회
                  {passSummary.freeExpiresAt ? ` · 만료 ${formatPaymentDateTime(passSummary.freeExpiresAt)}` : ""}
                </p>
              ) : null}
              {SHOW_PAYMENT_DEV_TOOLS ? (
                <button
                  className="btn secondary billing-plan-action"
                  type="button"
                  onClick={() => void handleDevelopmentPassGrant()}
                  disabled={loading || paying}
                >
                  테스트 이용권 5회 추가
                </button>
              ) : null}
            </div>
            <div className="billing-plan-card">
              <span className="badge info billing-plan-badge">{CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.label}</span>
              <Image className="billing-plan-art" src="/billing-buy-pass-v2.png" alt="" width={200} height={200} aria-hidden="true" />
              <strong>{CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.orderName}</strong>
              <p className="billing-plan-price">{formatWon(CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.amount)}</p>
              <p className="billing-plan-desc">모의면접 1회 응시와 AI 피드백 리포트를 포함합니다.</p>
              <button className="btn primary billing-plan-action" type="button" onClick={() => void handlePayment()} disabled={paying}>
                {paying ? "결제창 여는 중" : "토스페이먼츠로 결제"}
              </button>
            </div>
          </div>
        </section>
      </section>

      {historyOpen ? (
        <div className="billing-modal-overlay" role="dialog" aria-modal="true" onClick={() => setHistoryOpen(false)}>
          <div className="billing-modal" onClick={(event) => event.stopPropagation()}>
            <div className="billing-modal__head">
              <div className="billing-modal__title">
                <h2>최근 결제 내역</h2>
                <p>모의면접 이용권 결제 상태를 확인합니다.</p>
              </div>
              <div className="billing-modal__head-actions">
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => void loadBillingData(orderPage.page)}
                  disabled={loading || paying}
                >
                  새로고침
                </button>
                <button className="billing-modal__close" type="button" aria-label="닫기" onClick={() => setHistoryOpen(false)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="billing-modal__body">
              {loading ? <p className="empty">결제 내역을 불러오는 중입니다.</p> : <CandidatePaymentOrderList orders={orders} />}
              {!loading ? (
                <PaymentOrderPagination page={orderPage} disabled={paying} onPageChange={(nextPage) => void loadBillingData(nextPage)} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </CandidatePageShell>
  );
}

function CandidatePaymentOrderList({ orders }: { orders: PaymentOrder[] }) {
  if (orders.length === 0) {
    return <p className="empty">아직 결제 내역이 없습니다.</p>;
  }

  return (
    <div className="candidate-alert-table" role="table" aria-label="지원자 결제 내역">
      <div className="candidate-alert-row candidate-alert-row--head" role="row">
        <span role="columnheader">상품</span>
        <span role="columnheader">금액</span>
        <span role="columnheader">상태</span>
        <span role="columnheader">일시</span>
      </div>
      {orders.map((order) => (
        <div className="candidate-alert-row" role="row" key={order.orderId}>
          <span role="cell">{order.orderName}</span>
          <span role="cell">{formatWon(order.amount)}</span>
          <span role="cell">
            <span className={`badge ${paymentStatusTone(order.status)}`}>{paymentStatusLabel(order.status)}</span>
          </span>
          <span role="cell">{formatPaymentDateTime(order.approvedAt ?? order.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function InterviewRuntimePanel({
  mode,
  resource,
  apiClient,
  onRecruitingComplete,
}: {
  mode: RuntimeMode;
  resource: ReturnType<typeof useCandidateResource<RuntimePageData>>;
  apiClient?: InterviewRuntimeApiClient;
  onRecruitingComplete?: (applicationId: number, sessionId: number) => void;
}) {
  const { data, loading, error, refresh, updateData } = resource;
  const router = useRouter();
  const runtimeApi = apiClient ?? getCandidateApi();
  const currentQuestion = data?.runtime.currentQuestion;
  const runtimeInterviewType = data?.runtime.interviewType;
  const runtimePreparationTimeSec = data?.runtime.timePolicy?.preparationTimeSec;
  const runtimeAnswerTimeSec = data?.runtime.timePolicy?.answerTimeSec;
  const runtimeRetryAllowed = data?.runtime.timePolicy?.retryAllowed ?? false;
  const [answer, setAnswer] = useState<InterviewAnswerFormState>(() => createInterviewAnswerFormStateForQuestion());
  const [retryAnswerId, setRetryAnswerId] = useState<number>();
  const [retryingQuestionId, setRetryingQuestionId] = useState<number>();
  const [gazeRetakeQuestionId, setGazeRetakeQuestionId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [integrityWarning, setIntegrityWarning] = useState<RuntimeIntegrityWarning | null>(null);
  const [nonverbalDeviceQaEnabled, setNonverbalDeviceQaEnabled] = useState(false);
  const [nonverbalDeviceQaSnapshot, setNonverbalDeviceQaSnapshot] = useState<NonverbalDeviceQaPanelSnapshot>();
  const [nonverbalDeviceQaScenarioKind, setNonverbalDeviceQaScenarioKind] = useState<NonverbalDeviceQaScenarioKind>("NEUTRAL");
  const [nonverbalDeviceQaMessage, setNonverbalDeviceQaMessage] = useState("녹화를 시작하면 기기 성능 측정을 시작합니다.");
  const [busy, setBusy] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<LastSavedAnswer>();
  const [autoAiPipeline, setAutoAiPipeline] = useState<AutoAiPipelineState>();
  const [pendingAiPipelineCount, setPendingAiPipelineCount] = useState(0);
  const [runtimeQuestionSyncRequired, setRuntimeQuestionSyncRequired] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [, setCameraPreviewStatus] = useState("카메라 대기");
  const [cameraFramingState, setCameraFramingState] = useState<CameraFramingState>("idle");
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("마이크 대기");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [networkReady, setNetworkReady] = useState(false);
  const [networkStatus, setNetworkStatus] = useState("네트워크 대기");
  const [recording, setRecording] = useState(false);
  const [recordedFileName, setRecordedFileName] = useState("");
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [cameralessTestEntry, setCameralessTestEntry] = useState(false);
  const [cameraPreviewVisible, setCameraPreviewVisible] = useState(true);
  const [cameraPipPosition, setCameraPipPosition] = useState<CameraPipPosition>();
  const [runtimePrimaryScreen, setRuntimePrimaryScreen] = useState<InterviewRuntimePrimaryScreen>("interviewer");
  const [interviewerPipVisible, setInterviewerPipVisible] = useState(true);
  const [interviewerPipPosition, setInterviewerPipPosition] = useState<CameraPipPosition>();
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [interviewerInfoOpen, setInterviewerInfoOpen] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_INTERVIEW_QUESTION_TIME_LIMIT_SECONDS);
  const [timerPhase, setTimerPhase] = useState<RuntimeTimerPhase>("ANSWERING");
  const [introCompleted, setIntroCompleted] = useState(false);
  const [questionSpeechCompleted, setQuestionSpeechCompleted] = useState(false);
  const [questionSpeechPlaying, setQuestionSpeechPlaying] = useState(false);
  const [questionSpeechStatus, setQuestionSpeechStatus] = useState("AI 안내 대기");
  const [questionSpeechSupported, setQuestionSpeechSupported] = useState(true);
  const [interviewerSessionEventCount, setInterviewerSessionEventCount] = useState(0);
  const [realtimeSessionStatus, setRealtimeSessionStatus] = useState<RealtimeSessionStatus>("idle");
  const [realtimeProvider, setRealtimeProvider] = useState<RealtimeProviderState>("none");
  const [realtimeModel, setRealtimeModel] = useState("");
  const [realtimeVoice, setRealtimeVoice] = useState("");
  const [realtimeLastError, setRealtimeLastError] = useState("");
  const [realtimeConnectionState, setRealtimeConnectionState] = useState<RTCPeerConnectionState>("new");
  const [realtimeDataChannelState, setRealtimeDataChannelState] = useState<RTCDataChannelState>("closed");
  const [realtimeDataEventCount, setRealtimeDataEventCount] = useState(0);
  const [realtimeRemoteAudioReady, setRealtimeRemoteAudioReady] = useState(false);
  const [realtimeRemoteAudioElement, setRealtimeRemoteAudioElement] = useState<HTMLAudioElement | null>(null);
  const [realtimeRemoteAudioStream, setRealtimeRemoteAudioStream] = useState<MediaStream | null>(null);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<number>>(() => new Set());
  const [replayedQuestionIds, setReplayedQuestionIds] = useState<Set<number>>(() => new Set());
  const [reansweringQuestionId, setReansweringQuestionId] = useState<number | null>(null);
  const [reansweredQuestionIds, setReansweredQuestionIds] = useState<Set<number>>(() => new Set());
  const answeredQuestionIdsRef = useRef<Set<number>>(new Set());
  const savingQuestionIdsRef = useRef<Set<number>>(new Set());
  const interviewerStageRef = useRef<HTMLDivElement | null>(null);
  const cameraPipRef = useRef<HTMLDivElement | null>(null);
  const cameraPipDragRef = useRef<CameraPipDragState | null>(null);
  const interviewerPipRef = useRef<HTMLDivElement | null>(null);
  const interviewerPipDragRef = useRef<CameraPipDragState | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneFrameRef = useRef<number | null>(null);
  const cameraQualityIntervalRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const realtimeSttRelayRef = useRef<RealtimeSttRelaySession | null>(null);
  const realtimeSttTranscriptByQuestionRef = useRef<Map<number, string>>(new Map());
  const submitAfterRecordingStopRef = useRef(false);
  const autoAdvanceAfterAnswerSubmitRef = useRef(false);
  const answerCompleteShortcutRef = useRef<() => void>(() => undefined);
  const nextQuestionShortcutRef = useRef<() => void>(() => undefined);
  const startRuntimeAfterRefreshRef = useRef(false);
  const autoRecordingQuestionRef = useRef<number | null>(null);
  const autoSpokenQuestionRef = useRef<number | null>(null);
  const introSpokenSessionRef = useRef<number | null>(null);
  const timeExpiredQuestionRef = useRef<number | null>(null);
  const answerStartCueQuestionRef = useRef<number | null>(null);
  const invalidRecordingRetryCountsRef = useRef<Map<number, number>>(new Map());
  const recordingNonverbalTrackerRef = useRef<RecordingNonverbalTracker | null>(null);
  const nonverbalCameraMonitorRef = useRef<number | null>(null);
  const nonverbalVideoFrameCallbackRef = useRef<number | null>(null);
  const nonverbalVideoFrameElementRef = useRef<NonverbalQaVideoElement | null>(null);
  const nonverbalIntegrityCleanupRef = useRef<(() => void) | null>(null);
  const nonverbalFaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nonverbalFaceDetectorRef = useRef<BrowserFaceDetector | null | undefined>(undefined);
  const nonverbalFaceLandmarkerRef = useRef<MediaPipeFaceLandmarker | null | undefined>(undefined);
  const nonverbalFaceLandmarkerPromiseRef = useRef<Promise<MediaPipeFaceLandmarker | null> | null>(null);
  const nonverbalPersonDetectorRef = useRef<MediaPipeObjectDetector | null | undefined>(undefined);
  const nonverbalPersonDetectorPromiseRef = useRef<Promise<MediaPipeObjectDetector | null> | null>(null);
  const nonverbalFaceDetectionPendingRef = useRef(false);
  const integrityWarningTimeoutRef = useRef<number | null>(null);
  const integrityWarningLastShownAtRef = useRef<Map<InterviewIntegrityEventType, number>>(new Map());
  const lastInvalidRecordingMetadataRef = useRef<Map<number, InterviewAnswerNonverbalMetadata>>(new Map());
  const nonverbalDeviceQaRunsRef = useRef<NonverbalDeviceQaRun[]>([]);
  const answerToNextQuestionPerfRef = useRef<{
    startedAt: number;
    startedAtIso: string;
    sourceQuestionId: number;
    sessionId: number;
    applicationId?: number;
    processLogId?: number;
  } | null>(null);
  const answerSubmitToNextReadyPerfRef = useRef<{
    startedAt: number;
    startedAtIso: string;
    sourceQuestionId: number;
    sessionId: number;
    applicationId?: number;
    origin: string;
  } | null>(null);
  const interviewerSessionEventsRef = useRef<InterviewerSessionEvent[]>([]);
  const interviewerSessionEventSequenceRef = useRef(0);
  const interviewerSessionIdRef = useRef<number | undefined>(undefined);
  const currentRuntimeSessionIdRef = useRef<number | undefined>(undefined);
  const currentRuntimeQuestionIdRef = useRef<number | undefined>(undefined);
  const realtimeSessionRequestKeyRef = useRef<string | null>(null);
  const realtimeConnectionRef = useRef<RealtimeInterviewWebRtcConnection | null>(null);
  const realtimeRemoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeSpeechTimeoutRef = useRef<number | null>(null);
  const realtimeSpeechResponseMetadataByIdRef = useRef<Map<string, RealtimeResponseMetadata>>(new Map());
  const realtimeAudioCompletedResponseIdsRef = useRef<Set<string>>(new Set());
  const speechPlaybackIdRef = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const browserSpeechStartTimeoutRef = useRef<number | null>(null);
  const browserSpeechCompletionTimeoutRef = useRef<number | null>(null);
  const microphoneLevelRef = useRef(0);
  const recordingVoicePeakRef = useRef(0);
  const recordingVoiceFrameCountRef = useRef(0);
  const initializedQuestionIdRef = useRef<number | undefined>(undefined);
  const realtimeSilenceStartedAtRef = useRef<number | null>(null);
  const realtimeEncouragedQuestionRef = useRef<number | null>(null);
  const videoAttachRunRef = useRef(0);
  const bindRealtimeRemoteAudio = useCallback((element: HTMLAudioElement | null) => {
    realtimeRemoteAudioRef.current = element;
    setRealtimeRemoteAudioElement(element);
  }, []);
  const currentQuestionId = currentQuestion?.questionId;
  const currentQuestionStateReady = typeof currentQuestionId === "number" && answer.questionId === currentQuestionId;
  const hasAnswerFile = Boolean(answer.videoFile || answer.audioFile || answer.videoFileId || answer.audioFileId);
  const hasMeaningfulAnswerVoice = hasMeaningfulInterviewRecordingVoice({
    peakLevel: recordingVoicePeakRef.current,
    activeFrameCount: recordingVoiceFrameCountRef.current,
    minPeakLevel: MIN_INTERVIEW_RECORDING_VOICE_LEVEL,
    minActiveFrameCount: MIN_INTERVIEW_RECORDING_VOICE_FRAME_COUNT,
  });
  const canSubmitAnswer = canSubmitInterviewAnswer({
    currentQuestionId,
    answer,
    recording,
    questionSpeechCompleted,
    questionSpeechPlaying,
    hasMeaningfulVoice: hasMeaningfulAnswerVoice,
  });
  const retryingCurrentQuestion = Boolean(currentQuestion && retryingQuestionId === currentQuestion.questionId);
  const currentQuestionAnswered = Boolean(
    currentQuestion &&
      !retryingCurrentQuestion &&
      (answeredQuestionIds.has(currentQuestion.questionId) ||
        data?.questions.questions.some((question) => question.questionId === currentQuestion.questionId && question.answered)),
  );
  const isReansweringCurrentQuestion = Boolean(currentQuestion && reansweringQuestionId === currentQuestion.questionId);
  const currentQuestionLocked = currentQuestionAnswered && !isReansweringCurrentQuestion;
  const gazeRetakeRequired = Boolean(currentQuestion && gazeRetakeQuestionId === currentQuestion.questionId);
  const realtimeSpeechReady =
    AI_INTERVIEWER_SESSION_MODE_POLICY.activeMode === "realtime-voice" &&
    realtimeProvider === "openai" &&
    realtimeSessionStatus === "ready" &&
    realtimeDataChannelState === "open" &&
    Boolean(realtimeConnectionRef.current);
  const shouldWaitForRealtimeSpeech =
    AI_INTERVIEWER_SESSION_MODE_POLICY.activeMode === "realtime-voice" &&
    realtimeProvider !== "mock" &&
    realtimeSessionStatus !== "failed" &&
    !realtimeSpeechReady;
  const canStartManualRecording = shouldEnableManualInterviewRecording({
    canRecord: Boolean(data?.runtime.canRecord),
    setupCompleted,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    cameraReady,
    microphoneReady,
    networkReady,
    hasCurrentQuestion: currentQuestionStateReady,
    currentQuestionLocked,
    timerPhase,
    recording,
    canSubmitAnswer,
    busy,
  });
  const shouldShowRecordingStartLabel = Boolean(
    data?.runtime.canRecord &&
      currentQuestion &&
      currentQuestionStateReady &&
      setupCompleted &&
      introCompleted &&
      questionSpeechCompleted &&
      !questionSpeechPlaying &&
      timerPhase === "ANSWERING" &&
      !currentQuestionLocked &&
      !recording &&
      !canSubmitAnswer,
  );
  const currentQuestionReplayUsed = Boolean(currentQuestion && replayedQuestionIds.has(currentQuestion.questionId));
  const deviceTestSentence = useMemo(() => pickDeviceTestSentence(), []);
  currentRuntimeSessionIdRef.current = data?.runtime.sessionId;
  currentRuntimeQuestionIdRef.current = currentQuestion?.questionId;

  const appendInterviewerSessionActionEvent = useCallback((input: {
    action: NonNullable<InterviewerSessionEvent["action"]>;
    phase: InterviewerSessionEvent["phase"];
    label: string;
    questionId?: number;
  }) => {
    const sessionId = currentRuntimeSessionIdRef.current;
    if (typeof sessionId !== "number") return;

    const event = createInterviewerSessionActionEvent({
      sessionId,
      questionId: input.questionId ?? currentRuntimeQuestionIdRef.current,
      mode: AI_INTERVIEWER_SESSION_MODE_POLICY.activeMode,
      phase: input.phase,
      action: input.action,
      label: input.label,
      sequence: interviewerSessionEventSequenceRef.current + 1,
      occurredAt: new Date().toISOString(),
    });

    interviewerSessionEventSequenceRef.current = event.sequence;
    interviewerSessionEventsRef.current = trimInterviewerSessionEvents(
      [
        ...interviewerSessionEventsRef.current,
        event,
      ],
      MAX_INTERVIEWER_SESSION_EVENTS,
    );
    setInterviewerSessionEventCount(interviewerSessionEventsRef.current.length);
  }, []);

  const clearRealtimeSpeechTimeout = useCallback(() => {
    if (realtimeSpeechTimeoutRef.current === null) return;
    window.clearTimeout(realtimeSpeechTimeoutRef.current);
    realtimeSpeechTimeoutRef.current = null;
  }, []);

  const clearBrowserSpeechTimeouts = useCallback(() => {
    if (browserSpeechStartTimeoutRef.current !== null) {
      window.clearTimeout(browserSpeechStartTimeoutRef.current);
      browserSpeechStartTimeoutRef.current = null;
    }
    if (browserSpeechCompletionTimeoutRef.current !== null) {
      window.clearTimeout(browserSpeechCompletionTimeoutRef.current);
      browserSpeechCompletionTimeoutRef.current = null;
    }
  }, []);

  const clearRealtimeSpeechCompletionState = useCallback(() => {
    realtimeSpeechResponseMetadataByIdRef.current.clear();
    realtimeAudioCompletedResponseIdsRef.current.clear();
  }, []);

  const closeRealtimeConnection = useCallback(() => {
    clearRealtimeSpeechTimeout();
    clearRealtimeSpeechCompletionState();
    const connection = realtimeConnectionRef.current;
    setRealtimeInterviewMicrophoneEnabled(connection, true);
    connection?.close();
    realtimeConnectionRef.current = null;
    if (connection) {
      setRealtimeConnectionState("closed");
      setRealtimeDataChannelState("closed");
      setRealtimeRemoteAudioReady(false);
      setRealtimeRemoteAudioStream(null);
    }
  }, [clearRealtimeSpeechCompletionState, clearRealtimeSpeechTimeout]);

  const setRealtimeMicrophoneOpen = useCallback((open: boolean) => {
    setRealtimeInterviewMicrophoneEnabled(realtimeConnectionRef.current, open);
  }, []);

  function isQuestionAlreadyAnswered(questionId: number): boolean {
    return (
      answeredQuestionIdsRef.current.has(questionId) ||
      Boolean(data?.questions.questions.some((question) => question.questionId === questionId && question.answered))
    );
  }

  function markQuestionAnswered(questionId: number) {
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      next.add(questionId);
      answeredQuestionIdsRef.current = next;
      return next;
    });
  }

  function applyAuthoritativeQuestionTransition(
    answeredQuestionId: number | undefined,
    nextQuestion: RuntimeQuestionView | undefined,
    completionReady: boolean,
  ) {
    updateData((current) => {
      const questions = current.questions.questions.map((question) => {
        if (nextQuestion && question.questionId === nextQuestion.questionId) {
          return { ...question, ...nextQuestion, current: true, answered: false };
        }
        if (answeredQuestionId && question.questionId === answeredQuestionId) {
          return { ...question, current: false, answered: true };
        }
        return { ...question, current: false };
      });
      const answeredCount = questions.filter((question) => question.answered).length;
      return {
        ...current,
        runtime: {
          ...current.runtime,
          answeredCount,
          completionReady,
          totalQuestions: completionReady && answeredCount > 0
            ? Math.max(answeredCount, questions.length)
            : current.runtime.totalQuestions,
          currentQuestion: completionReady ? undefined : nextQuestion,
        },
        questions: {
          ...current.questions,
          currentQuestionId: completionReady ? undefined : nextQuestion?.questionId,
          questions,
        },
      };
    });
  }

  function prepareAuthoritativeNextQuestion(nextQuestion: RuntimeQuestionView | undefined) {
    stopQuestionSpeech();
    setAnswer(createInterviewAnswerFormStateForQuestion(nextQuestion?.questionId));
    recordingVoicePeakRef.current = 0;
    recordingVoiceFrameCountRef.current = 0;
    setRecordedFileName("");
    setQuestionSpeechStatus(nextQuestion ? "다음 질문 음성 대기" : "면접 답변 완료");
    setQuestionSpeechCompleted(false);
    setQuestionSpeechPlaying(false);
    resetRuntimeQuestionTimer(data?.runtime, setTimerPhase, setRemainingSeconds);
    timeExpiredQuestionRef.current = null;
    autoRecordingQuestionRef.current = null;
  }

  function isQuestionStateConflict(error: unknown): boolean {
    if (!(error instanceof CandidateApiError)) return false;
    if (error.status !== 409 || error.body?.error.code !== "COMMON_CONFLICT") return false;
    return error.body.error.details.some((detail) =>
      ["current question", "question already answered"].some((reason) => detail.reason.includes(reason)),
    );
  }

  const isCurrentSpeechPlayback = useCallback((playbackId: number, questionId?: number, sessionId?: number): boolean => {
    return isInterviewSpeechPlaybackEventCurrent({
      playbackId,
      activePlaybackId: speechPlaybackIdRef.current,
      questionId,
      currentQuestionId: currentRuntimeQuestionIdRef.current,
      sessionId,
      currentSessionId: currentRuntimeSessionIdRef.current,
    });
  }, []);

  const stopQuestionSpeech = useCallback((options: { restoreRealtimeMicrophone?: boolean } = {}) => {
    const restoreRealtimeMicrophone = options.restoreRealtimeMicrophone ?? true;
    clearRealtimeSpeechTimeout();
    clearBrowserSpeechTimeouts();
    clearRealtimeSpeechCompletionState();
    speechPlaybackIdRef.current += 1;
    if (restoreRealtimeMicrophone) {
      setRealtimeMicrophoneOpen(true);
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setQuestionSpeechPlaying(false);
  }, [clearBrowserSpeechTimeouts, clearRealtimeSpeechCompletionState, clearRealtimeSpeechTimeout, setRealtimeMicrophoneOpen]);

  const speakInterviewIntro = useCallback((options: { forceBrowserSpeech?: boolean } = {}) => {
    if (!data) return;
    if (introSpokenSessionRef.current === data.runtime.sessionId) {
      setIntroCompleted(true);
      return;
    }

    const preparationTimeSec = getRuntimePreparationTimeLimitSeconds(data.runtime);
    const timingGuide =
      preparationTimeSec > 0
        ? `질문 안내가 끝나면 먼저 ${preparationTimeSec}초의 준비 시간이 흐르고, 준비 시간이 끝나면 알림음과 함께 답변 시간이 시작됩니다.`
        : "질문 안내가 끝나면 바로 답변 시간이 시작됩니다.";
    const text =
      mode === "recruiting"
        ? `안녕하세요. 지금부터 채용 AI 면접을 시작하겠습니다. ${timingGuide}`
        : `안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다. ${timingGuide}`;

    const forceBrowserSpeech = options.forceBrowserSpeech ?? false;
    stopQuestionSpeech({ restoreRealtimeMicrophone: !realtimeSpeechReady && !forceBrowserSpeech });
    const playbackId = ++speechPlaybackIdRef.current;
    const sessionId = data.runtime.sessionId;

    if (realtimeSpeechReady && !forceBrowserSpeech) {
      setRealtimeMicrophoneOpen(false);
      const sent = sendRealtimeSpeechClientEvent(
        realtimeConnectionRef.current,
        createRealtimeInterviewSpeechResponseEvent({
          purpose: "interview_intro",
          text,
          playbackId,
        }),
      );
      if (sent) {
        setQuestionSpeechSupported(true);
        setQuestionSpeechPlaying(true);
        setQuestionSpeechStatus("Realtime AI 안내를 재생 중입니다.");
        appendInterviewerSessionActionEvent({
          action: "speech:start",
          phase: "AI_SPEAKING",
          label: "Realtime AI 안내 시작",
        });
        realtimeSpeechTimeoutRef.current = window.setTimeout(() => {
          realtimeSpeechTimeoutRef.current = null;
          if (!isCurrentSpeechPlayback(playbackId, undefined, sessionId)) return;
          appendInterviewerSessionActionEvent({
            action: "speech:fallback",
            phase: "FALLBACK_TTS",
            label: "Realtime AI 안내 완료 이벤트 timeout",
          });
          setQuestionSpeechPlaying(false);
          setQuestionSpeechStatus("Realtime AI 안내 완료 이벤트를 받지 못해 브라우저 음성으로 전환합니다.");
          speakInterviewIntro({ forceBrowserSpeech: true });
        }, REALTIME_SPEECH_RESPONSE_TIMEOUT_MS);
        return;
      }
      appendInterviewerSessionActionEvent({
        action: "speech:fallback",
        phase: "FALLBACK_TTS",
        label: "Realtime AI 안내 전송 실패",
      });
      setQuestionSpeechStatus("Realtime AI 안내를 시작하지 못해 브라우저 음성으로 전환합니다.");
    }

    if (!isQuestionSpeechSupported()) {
      setQuestionSpeechSupported(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("이 브라우저에서는 AI 음성 안내를 지원하지 않아 질문으로 바로 이동합니다.");
      appendInterviewerSessionActionEvent({
        action: "speech:fallback",
        phase: "FALLBACK_TTS",
        label: "AI 안내 음성 미지원",
      });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const koreanVoice = findKoreanSpeechVoice(window.speechSynthesis.getVoices());
    utterance.lang = "ko-KR";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.onstart = () => {
      if (!isCurrentSpeechPlayback(playbackId, undefined, sessionId)) return;
      setQuestionSpeechPlaying(true);
      setQuestionSpeechStatus("AI 안내를 재생 중입니다.");
      appendInterviewerSessionActionEvent({
        action: "speech:start",
        phase: "AI_SPEAKING",
        label: forceBrowserSpeech ? "브라우저 fallback AI 안내 시작" : "브라우저 AI 안내 시작",
      });
    };
    utterance.onend = () => {
      if (speechUtteranceRef.current !== utterance || !isCurrentSpeechPlayback(playbackId, undefined, sessionId)) return;
      speechUtteranceRef.current = null;
      introSpokenSessionRef.current = data.runtime.sessionId;
      setQuestionSpeechPlaying(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("AI 안내 완료. 질문 음성을 준비합니다.");
      appendInterviewerSessionActionEvent({
        action: "speech:completed",
        phase: "CONNECTING",
        label: forceBrowserSpeech ? "브라우저 fallback AI 안내 완료" : "브라우저 AI 안내 완료",
      });
    };
    utterance.onerror = () => {
      if (speechUtteranceRef.current !== utterance || !isCurrentSpeechPlayback(playbackId, undefined, sessionId)) return;
      speechUtteranceRef.current = null;
      introSpokenSessionRef.current = data.runtime.sessionId;
      setQuestionSpeechPlaying(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("AI 안내를 재생할 수 없어 질문 음성으로 이동합니다.");
    };

    speechUtteranceRef.current = utterance;
    setQuestionSpeechSupported(true);
    setQuestionSpeechStatus("AI 안내 재생 준비 중입니다.");
    window.speechSynthesis.speak(utterance);
  }, [appendInterviewerSessionActionEvent, data, isCurrentSpeechPlayback, mode, realtimeSpeechReady, setRealtimeMicrophoneOpen, stopQuestionSpeech]);

  const speakCurrentQuestion = useCallback(
    (source: "auto" | "manual", options: { forceBrowserSpeech?: boolean; browserRetryCount?: number } = {}) => {
      if (!currentQuestion) {
        setQuestionSpeechStatus("현재 질문을 불러올 수 없습니다.");
        setQuestionSpeechCompleted(true);
        return;
      }

      const text = toRuntimeQuestionSpeechText(currentQuestion);
      if (!text.trim()) {
        setQuestionSpeechStatus("재생할 질문 음성이 없습니다.");
        setQuestionSpeechCompleted(true);
        return;
      }

      const forceBrowserSpeech = options.forceBrowserSpeech ?? false;
      const browserRetryCount = options.browserRetryCount ?? 0;
      stopQuestionSpeech({ restoreRealtimeMicrophone: !realtimeSpeechReady && !forceBrowserSpeech });
      const playbackId = ++speechPlaybackIdRef.current;
      const questionId = currentQuestion.questionId;
      const sessionId = data?.runtime.sessionId;
      const realtimeQuestionSpeechPurpose =
        currentQuestion.questionType === "FOLLOW_UP" ? "interview_follow_up_question" : "interview_question";
      const realtimeQuestionSpeechLabel =
        currentQuestion.questionType === "FOLLOW_UP" ? "Realtime 꼬리질문 음성" : "Realtime 질문 음성";
      setQuestionSpeechCompleted(false);

      if (realtimeSpeechReady && !forceBrowserSpeech) {
        setRealtimeMicrophoneOpen(false);
        const sent = sendRealtimeSpeechClientEvent(
          realtimeConnectionRef.current,
          createRealtimeInterviewSpeechResponseEvent({
            purpose: realtimeQuestionSpeechPurpose,
            text,
            questionId,
            playbackId,
          }),
        );
        if (sent) {
          setQuestionSpeechSupported(true);
          setQuestionSpeechPlaying(true);
          setQuestionSpeechStatus(source === "manual" ? `${realtimeQuestionSpeechLabel}을 다시 재생 중입니다.` : `${realtimeQuestionSpeechLabel}을 재생 중입니다.`);
          appendInterviewerSessionActionEvent({
            action: "speech:start",
            phase: "AI_SPEAKING",
            label: source === "manual" ? `${realtimeQuestionSpeechLabel} 재생 시작` : `${realtimeQuestionSpeechLabel} 시작`,
            questionId,
          });
          realtimeSpeechTimeoutRef.current = window.setTimeout(() => {
            realtimeSpeechTimeoutRef.current = null;
            if (!isCurrentSpeechPlayback(playbackId, questionId, sessionId)) return;
            appendInterviewerSessionActionEvent({
              action: "speech:fallback",
              phase: "FALLBACK_TTS",
              label: `${realtimeQuestionSpeechLabel} 완료 이벤트 timeout`,
              questionId,
            });
            setQuestionSpeechPlaying(false);
            setQuestionSpeechCompleted(false);
            setQuestionSpeechStatus(`${realtimeQuestionSpeechLabel} 완료 이벤트를 받지 못해 브라우저 음성으로 전환합니다.`);
            speakCurrentQuestion(source, { forceBrowserSpeech: true });
          }, REALTIME_SPEECH_RESPONSE_TIMEOUT_MS);
          return;
        }
        appendInterviewerSessionActionEvent({
          action: "speech:fallback",
          phase: "FALLBACK_TTS",
          label: `${realtimeQuestionSpeechLabel} 전송 실패`,
          questionId,
        });
        setQuestionSpeechStatus(`${realtimeQuestionSpeechLabel}을 시작하지 못해 브라우저 음성으로 전환합니다.`);
      }

      if (!isQuestionSpeechSupported()) {
        setQuestionSpeechSupported(false);
        setQuestionSpeechStatus("이 브라우저에서는 질문 음성 안내를 지원하지 않습니다.");
        setQuestionSpeechCompleted(true);
        appendInterviewerSessionActionEvent({
          action: "speech:fallback",
          phase: "FALLBACK_TTS",
          label: "질문 음성 미지원",
          questionId,
        });
        if (source === "manual") {
          setMessage("이 브라우저에서는 질문 음성 안내를 지원하지 않습니다.");
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const retryOrCompleteBrowserSpeech = (reason: string) => {
        if (speechUtteranceRef.current !== utterance || !isCurrentSpeechPlayback(playbackId, questionId, sessionId)) return;
        speechUtteranceRef.current = null;
        clearBrowserSpeechTimeouts();
        window.speechSynthesis.cancel();
        setQuestionSpeechPlaying(false);
        appendInterviewerSessionActionEvent({
          action: "speech:fallback",
          phase: "FALLBACK_TTS",
          label: browserRetryCount < 1 ? `${reason} 질문 음성 재시도` : `${reason} 답변 단계 전환`,
          questionId,
        });

        if (browserRetryCount < 1) {
          setQuestionSpeechCompleted(false);
          setQuestionSpeechStatus(`${reason} 질문 음성을 다시 시도합니다.`);
          window.setTimeout(() => {
            if (!isCurrentSpeechPlayback(playbackId, questionId, sessionId)) return;
            speakCurrentQuestion(source, { forceBrowserSpeech: true, browserRetryCount: browserRetryCount + 1 });
          }, 150);
          return;
        }

        setQuestionSpeechCompleted(true);
        setQuestionSpeechStatus(`${reason} 답변을 시작할 수 있습니다.`);
      };

      const koreanVoice = findKoreanSpeechVoice(window.speechSynthesis.getVoices());
      utterance.lang = "ko-KR";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      if (koreanVoice) utterance.voice = koreanVoice;
      utterance.onstart = () => {
        if (!isCurrentSpeechPlayback(playbackId, questionId, sessionId)) return;
        clearBrowserSpeechTimeouts();
        setQuestionSpeechPlaying(true);
        setQuestionSpeechStatus(source === "manual" ? "질문 음성을 다시 재생 중입니다." : "질문 음성을 재생 중입니다.");
        appendInterviewerSessionActionEvent({
          action: "speech:start",
          phase: "AI_SPEAKING",
          label: forceBrowserSpeech ? "브라우저 fallback 질문 음성 시작" : "브라우저 질문 음성 시작",
          questionId,
        });
        browserSpeechCompletionTimeoutRef.current = window.setTimeout(() => {
          if (speechUtteranceRef.current !== utterance || !isCurrentSpeechPlayback(playbackId, questionId, sessionId)) return;
          speechUtteranceRef.current = null;
          clearBrowserSpeechTimeouts();
          window.speechSynthesis.cancel();
          setQuestionSpeechPlaying(false);
          setQuestionSpeechCompleted(true);
          setQuestionSpeechStatus("질문 음성 완료 확인이 지연되어 답변 단계로 전환합니다.");
          appendInterviewerSessionActionEvent({
            action: "speech:fallback",
            phase: "FALLBACK_TTS",
            label: "브라우저 질문 음성 완료 이벤트 timeout",
            questionId,
          });
        }, getBrowserSpeechCompletionTimeoutMs(text));
      };
      utterance.onend = () => {
        if (speechUtteranceRef.current !== utterance || !isCurrentSpeechPlayback(playbackId, questionId, sessionId)) return;
        clearBrowserSpeechTimeouts();
        speechUtteranceRef.current = null;
        setQuestionSpeechPlaying(false);
        setQuestionSpeechCompleted(true);
        setQuestionSpeechStatus("질문 음성 재생 완료");
        appendInterviewerSessionActionEvent({
          action: "speech:completed",
          phase: "CONNECTING",
          label: forceBrowserSpeech ? "브라우저 fallback 질문 음성 완료" : "브라우저 질문 음성 완료",
          questionId,
        });
      };
      utterance.onerror = () => {
        retryOrCompleteBrowserSpeech("질문 음성을 재생하지 못했습니다.");
      };

      speechUtteranceRef.current = utterance;
      setQuestionSpeechSupported(true);
      setQuestionSpeechStatus("질문 음성 재생 준비 중입니다.");
      browserSpeechStartTimeoutRef.current = window.setTimeout(() => {
        retryOrCompleteBrowserSpeech("질문 음성 시작 이벤트를 받지 못했습니다.");
      }, BROWSER_SPEECH_START_TIMEOUT_MS);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        retryOrCompleteBrowserSpeech("질문 음성을 시작하지 못했습니다.");
      }
    },
    [appendInterviewerSessionActionEvent, clearBrowserSpeechTimeouts, currentQuestion, data?.runtime.sessionId, isCurrentSpeechPlayback, realtimeSpeechReady, setRealtimeMicrophoneOpen, stopQuestionSpeech],
  );

  const completeRealtimeSpeechPlayback = useCallback((metadata: RealtimeResponseMetadata) => {
    const sessionId = currentRuntimeSessionIdRef.current;

    if (metadata.purpose === "interview_intro") {
      clearRealtimeSpeechTimeout();
      if (typeof metadata.responseId === "string") {
        realtimeSpeechResponseMetadataByIdRef.current.delete(metadata.responseId);
        realtimeAudioCompletedResponseIdsRef.current.delete(metadata.responseId);
      }
      if (typeof sessionId === "number") {
        introSpokenSessionRef.current = sessionId;
      }
      setQuestionSpeechPlaying(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("Realtime AI 안내 완료. 질문 음성을 준비합니다.");
      appendInterviewerSessionActionEvent({
        action: "speech:completed",
        phase: "CONNECTING",
        label: "Realtime AI 안내 완료",
      });
      return;
    }

    if (isRealtimeQuestionSpeechPurpose(metadata.purpose)) {
      clearRealtimeSpeechTimeout();
      if (typeof metadata.responseId === "string") {
        realtimeSpeechResponseMetadataByIdRef.current.delete(metadata.responseId);
        realtimeAudioCompletedResponseIdsRef.current.delete(metadata.responseId);
      }
      setQuestionSpeechPlaying(false);
      setQuestionSpeechCompleted(true);
      setQuestionSpeechStatus(
        metadata.purpose === "interview_follow_up_question"
          ? "Realtime 꼬리질문 음성 재생 완료"
          : "Realtime 질문 음성 재생 완료",
      );
      appendInterviewerSessionActionEvent({
        action: "speech:completed",
        phase: "CONNECTING",
        label: metadata.purpose === "interview_follow_up_question" ? "Realtime 꼬리질문 음성 완료" : "Realtime 질문 음성 완료",
        questionId: metadata.questionId,
      });
      return;
    }

    setQuestionSpeechStatus("Realtime 격려 안내를 재생했습니다.");
  }, [appendInterviewerSessionActionEvent, clearRealtimeSpeechTimeout]);

  const handleRealtimeDataEvent = useCallback(
    (event: unknown) => {
      setRealtimeDataEventCount((count) => count + 1);
      const audioCompletedResponseId = getRealtimeAudioCompletedResponseId(event);
      if (audioCompletedResponseId) {
        realtimeAudioCompletedResponseIdsRef.current.add(audioCompletedResponseId);
        const completedMetadata = realtimeSpeechResponseMetadataByIdRef.current.get(audioCompletedResponseId);
        if (!completedMetadata) return;

        const sessionId = currentRuntimeSessionIdRef.current;
        if (!isCurrentSpeechPlayback(completedMetadata.playbackId, completedMetadata.questionId, sessionId)) return;
        completeRealtimeSpeechPlayback(completedMetadata);
        return;
      }

      const metadata = getRealtimeResponseMetadata(event);
      if (!metadata) return;

      const sessionId = currentRuntimeSessionIdRef.current;
      if (!isCurrentSpeechPlayback(metadata.playbackId, metadata.questionId, sessionId)) return;
      if (shouldRestoreRealtimeMicrophoneAfterSpeechResponse(metadata)) {
        setRealtimeMicrophoneOpen(true);
      }

      if (!metadata.completed) {
        if (metadata.purpose === "interview_intro" || isRealtimeQuestionSpeechPurpose(metadata.purpose)) {
          clearRealtimeSpeechTimeout();
        }
        setQuestionSpeechPlaying(false);
        setQuestionSpeechCompleted(false);

        if (metadata.purpose === "interview_intro") {
          setIntroCompleted(false);
          appendInterviewerSessionActionEvent({
            action: "speech:fallback",
            phase: "FALLBACK_TTS",
            label: `Realtime AI 안내 중단 (${metadata.status})`,
          });
          setQuestionSpeechStatus(`Realtime AI 안내가 중단되어 브라우저 음성으로 전환합니다. (${metadata.status})`);
          window.setTimeout(() => speakInterviewIntro({ forceBrowserSpeech: true }), 250);
          return;
        }

        if (isRealtimeQuestionSpeechPurpose(metadata.purpose)) {
          const realtimeQuestionSpeechLabel =
            metadata.purpose === "interview_follow_up_question" ? "Realtime 꼬리질문 음성" : "Realtime 질문 음성";
          appendInterviewerSessionActionEvent({
            action: "speech:fallback",
            phase: "FALLBACK_TTS",
            label: `${realtimeQuestionSpeechLabel} 중단 (${metadata.status})`,
            questionId: metadata.questionId,
          });
          setQuestionSpeechStatus(`${realtimeQuestionSpeechLabel}이 중단되어 브라우저 음성으로 전환합니다. (${metadata.status})`);
          window.setTimeout(() => speakCurrentQuestion("auto", { forceBrowserSpeech: true }), 250);
          return;
        }

        setQuestionSpeechStatus(`Realtime 격려 안내가 중단되었습니다. (${metadata.status})`);
        return;
      }

      if ((metadata.purpose === "interview_intro" || isRealtimeQuestionSpeechPurpose(metadata.purpose)) && metadata.responseId) {
        realtimeSpeechResponseMetadataByIdRef.current.set(metadata.responseId, metadata);
        if (!realtimeAudioCompletedResponseIdsRef.current.has(metadata.responseId)) {
          setQuestionSpeechStatus("Realtime 질문 음성 출력 완료를 기다리는 중입니다.");
          return;
        }
      }

      if (metadata.purpose === "interview_intro" || isRealtimeQuestionSpeechPurpose(metadata.purpose)) {
        completeRealtimeSpeechPlayback(metadata);
        return;
      }

      clearRealtimeSpeechTimeout();
      setQuestionSpeechStatus("Realtime 격려 안내를 재생했습니다.");
    },
    [appendInterviewerSessionActionEvent, clearRealtimeSpeechTimeout, completeRealtimeSpeechPlayback, isCurrentSpeechPlayback, setRealtimeMicrophoneOpen, speakCurrentQuestion, speakInterviewIntro],
  );

  const attachRuntimeVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node || !streamRef.current) {
      stopRuntimeCameraQualityMonitor();
      return;
    }

    const attachRun = ++videoAttachRunRef.current;
    stopRuntimeCameraQualityMonitor();
    setCameraPreviewStatus("카메라 화면 연결 중");
    void (async () => {
      try {
        const stream = streamRef.current;
        if (!stream) return;
        const skipRuntimeQualityCheck = mode === "recruiting";
        const previewInfo = await attachMediaStreamToVideo(node, stream);
        if (!skipRuntimeQualityCheck) {
          assertCameraPreviewHasFrame(previewInfo);
        }
        if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
        const cameraQuality = skipRuntimeQualityCheck
          ? { ok: true, message: "초기 장치 점검 완료" }
          : assessCameraQuality(node);
        const cameraFraming = skipRuntimeQualityCheck
          ? { state: "unsupported" as const, blocking: false, message: "초기 장치 점검 결과를 사용합니다." }
          : getCameraFramingNotice();
        const cameraOk = skipRuntimeQualityCheck ? isCameraTrackReady(stream) : cameraQuality.ok && !cameraFraming.blocking;
        setCameraReady(cameraOk);
        setCameraFramingState(cameraFraming.state);
        setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, undefined, cameraQuality, cameraFraming));
        if (!skipRuntimeQualityCheck) {
          cameraQualityIntervalRef.current = startCameraQualityMonitor(node, previewInfo, undefined, (quality, framing, status) => {
            if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
            setCameraReady(quality.ok);
            setCameraFramingState(framing.state);
            setCameraPreviewStatus(status);
          });
        }
      } catch (previewError) {
        if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
        setCameraReady(false);
        setCameraFramingState("idle");
        if (mode !== "recruiting") {
          setSetupCompleted(false);
        }
        setCameraPreviewStatus(`카메라 연결 실패: ${formatMediaError(previewError)}`);
        setMessage(formatMediaError(previewError));
      }
    })();
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined" || mode !== "mock") {
      setNonverbalDeviceQaEnabled(false);
      return;
    }
    setNonverbalDeviceQaEnabled(new URLSearchParams(window.location.search).get("nonverbalQa") === "1");
  }, [mode]);

  useEffect(() => {
    if (typeof currentQuestionId !== "number") {
      initializedQuestionIdRef.current = undefined;
      return;
    }
    if (initializedQuestionIdRef.current === currentQuestionId) return;
    initializedQuestionIdRef.current = currentQuestionId;

    setAnswer(createInterviewAnswerFormStateForQuestion(currentQuestionId));
    recordingVoicePeakRef.current = 0;
    recordingVoiceFrameCountRef.current = 0;
    setReansweringQuestionId((current) => (current === currentQuestionId ? current : null));
    setRecordedFileName("");
    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    timeExpiredQuestionRef.current = null;
    autoRecordingQuestionRef.current = null;
    answerStartCueQuestionRef.current = null;
    invalidRecordingRetryCountsRef.current.delete(currentQuestionId);
    realtimeSilenceStartedAtRef.current = null;
    realtimeEncouragedQuestionRef.current = null;
    setRetryAnswerId(undefined);
    setRetryingQuestionId(undefined);
    setQuestionSpeechCompleted(false);
    setQuestionSpeechPlaying(false);
    resetRuntimeQuestionTimer(
      runtimeInterviewType
        ? {
            interviewType: runtimeInterviewType,
            timePolicy:
              typeof runtimePreparationTimeSec === "number" && typeof runtimeAnswerTimeSec === "number"
                ? {
                    preparationTimeSec: runtimePreparationTimeSec,
                    answerTimeSec: runtimeAnswerTimeSec,
                    retryAllowed: runtimeRetryAllowed,
                  }
                : undefined,
          }
        : undefined,
      setTimerPhase,
      setRemainingSeconds,
    );
  }, [currentQuestionId, runtimeAnswerTimeSec, runtimeInterviewType, runtimePreparationTimeSec, runtimeRetryAllowed]);

  useEffect(() => {
    const metric = answerToNextQuestionPerfRef.current;
    if (!metric || !currentQuestion || currentQuestion.questionId === metric.sourceQuestionId) {
      return;
    }

    answerToNextQuestionPerfRef.current = null;
    void sendClientPerformanceLog({
      eventName: "ANSWER_TO_NEXT_QUESTION",
      durationMs: Math.max(0, Math.round(performance.now() - metric.startedAt)),
      processLogId: metric.processLogId,
      sessionId: metric.sessionId,
      applicationId: metric.applicationId,
      questionId: currentQuestion.questionId,
      startedAt: metric.startedAtIso,
      completedAt: new Date().toISOString(),
      metadata: {
        mode,
        sourceQuestionId: metric.sourceQuestionId
      }
    });
  }, [currentQuestion, mode]);

  useEffect(() => {
    void refreshCameraDevices();
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      discardRealtimeSttRelay();
      stopQuestionSpeech();
      stopRuntimeCameraQualityMonitor();
      stopNonverbalCameraMonitor();
      stopNonverbalVideoFrameMonitor();
      stopNonverbalIntegrityListeners();
      recordingNonverbalTrackerRef.current = null;
      if (integrityWarningTimeoutRef.current !== null) {
        window.clearTimeout(integrityWarningTimeoutRef.current);
        integrityWarningTimeoutRef.current = null;
      }
      stopMicrophoneMeter();
      stopMediaStream(streamRef.current);
    };
    // Camera/device probing is intentionally run once when the runtime panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopQuestionSpeech]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleFullscreenChange = () => {
      setFullscreenActive(
        getInterviewRuntimeFullscreenActive({
          fullscreenElement: document.fullscreenElement,
          stageElement: interviewerStageRef.current,
        }),
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !setupCompleted || !cameraPreviewVisible || runtimePrimaryScreen !== "interviewer") return;

    const syncCameraPipPosition = () => {
      const stage = interviewerStageRef.current;
      const pip = cameraPipRef.current;
      if (!stage || !pip) return;

      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const padding = fullscreenActive ? 32 : 20;
      const bounds = {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      };

      setCameraPipPosition((current) => (
        current
          ? clampCameraPipPosition(current, bounds)
          : getDefaultCameraPipPosition(bounds)
      ));
    };

    const animationFrameId = window.requestAnimationFrame(syncCameraPipPosition);
    window.addEventListener("resize", syncCameraPipPosition);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", syncCameraPipPosition);
    };
  }, [cameraPreviewVisible, fullscreenActive, runtimePrimaryScreen, setupCompleted]);

  useEffect(() => {
    if (typeof window === "undefined" || !setupCompleted || !interviewerPipVisible || runtimePrimaryScreen !== "candidate") return;

    const syncInterviewerPipPosition = () => {
      const stage = interviewerStageRef.current;
      const pip = interviewerPipRef.current;
      if (!stage || !pip) return;

      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const padding = fullscreenActive ? 32 : 20;
      const bounds = {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      };

      setInterviewerPipPosition((current) => (
        current
          ? clampCameraPipPosition(current, bounds)
          : getDefaultCameraPipPosition(bounds)
      ));
    };

    const animationFrameId = window.requestAnimationFrame(syncInterviewerPipPosition);
    window.addEventListener("resize", syncInterviewerPipPosition);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", syncInterviewerPipPosition);
    };
  }, [fullscreenActive, interviewerPipVisible, runtimePrimaryScreen, setupCompleted]);

  useEffect(() => {
    if (!data) return;
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      data.questions.questions.forEach((question) => {
        if (question.answered) next.add(question.questionId);
      });
      answeredQuestionIdsRef.current = next;
      return next.size === current.size ? current : next;
    });
  }, [data]);

  useEffect(() => {
    if (!data || !consumeCameralessInterviewTestEntry(mode, data.runtime.sessionId)) return;
    completeCameralessRuntimeSetup(
      "카메라 없이 테스트 모드로 면접 화면에 진입했습니다. 녹화와 답변 제출은 장치 연결 후 가능합니다.",
    );
    // Camera-less test entry intentionally consumes a one-shot session flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.runtime.sessionId, mode]);

  useEffect(() => {
    if (!data || data.runtime.status !== "IN_PROGRESS" || !startRuntimeAfterRefreshRef.current) return;
    startRuntimeAfterRefreshRef.current = false;
    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setMessage("면접을 시작했습니다. AI 안내 후 답변 녹화가 자동으로 진행됩니다.");
    autoRecordingQuestionRef.current = null;
  }, [data]);

  useEffect(() => {
    if (!setupCompleted || !streamRef.current || !videoRef.current) return;
    attachRuntimeVideoRef(videoRef.current);
  }, [attachRuntimeVideoRef, setupCompleted]);

  useEffect(() => {
    if (!data || mode !== "recruiting" || data.runtime.status !== "IN_PROGRESS" || setupCompleted) return;
    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setMessage("채용 AI 면접 화면으로 이동했습니다. 카메라와 마이크를 연결하는 중입니다.");
    autoRecordingQuestionRef.current = null;
  }, [data, mode, setupCompleted]);

  useEffect(() => {
    const supported = AI_INTERVIEWER_SESSION_MODE_POLICY.activeMode === "realtime-voice" || isQuestionSpeechSupported();
    setQuestionSpeechSupported(supported);
    setQuestionSpeechStatus(supported ? "AI 안내 대기" : "이 브라우저에서는 질문 음성 안내를 지원하지 않습니다.");
  }, [mode]);

  useEffect(() => {
    if (
      !data ||
      !setupCompleted ||
      data.runtime.status !== "IN_PROGRESS" ||
      !cameraReady ||
      !microphoneReady ||
      !currentQuestion ||
      currentQuestionLocked
    ) {
      return;
    }
    if (introCompleted) return;
    if (shouldWaitForRealtimeSpeech) {
      setQuestionSpeechStatus("실시간 AI 음성 연결을 준비 중입니다.");
      return;
    }
    const timer = window.setTimeout(() => speakInterviewIntro(), 250);
    return () => window.clearTimeout(timer);
  }, [
    cameraReady,
    currentQuestion,
    currentQuestionLocked,
    data,
    introCompleted,
    microphoneReady,
    shouldWaitForRealtimeSpeech,
    setupCompleted,
    speakInterviewIntro,
  ]);

  useEffect(() => {
    if (!setupCompleted || !currentQuestion || currentQuestionLocked) {
      stopQuestionSpeech();
      return;
    }
    if (!introCompleted) return;
    if (autoSpokenQuestionRef.current === currentQuestion.questionId) return;
    if (shouldWaitForRealtimeSpeech) {
      setQuestionSpeechStatus("질문 음성을 위한 실시간 AI 연결을 준비 중입니다.");
      return;
    }
    stopQuestionSpeech({ restoreRealtimeMicrophone: !realtimeSpeechReady });
    autoSpokenQuestionRef.current = currentQuestion.questionId;
    const timer = window.setTimeout(() => speakCurrentQuestion("auto"), 250);
    return () => window.clearTimeout(timer);
  }, [
    currentQuestion,
    currentQuestionLocked,
    introCompleted,
    realtimeSpeechReady,
    setupCompleted,
    shouldWaitForRealtimeSpeech,
    speakCurrentQuestion,
    stopQuestionSpeech,
  ]);

  useEffect(() => {
    if (!shouldRunInterviewRuntimeCountdown({
      setupCompleted,
      introCompleted,
      questionSpeechCompleted,
      questionSpeechPlaying,
      hasCurrentQuestion: currentQuestionStateReady,
      currentQuestionLocked,
      busy,
      timerPhase,
    })) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    busy,
    currentQuestionStateReady,
    currentQuestionLocked,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    setupCompleted,
    timerPhase,
  ]);

  useEffect(() => {
    if (
      remainingSeconds > 0 ||
      timerPhase !== "PREPARING" ||
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      !currentQuestion ||
      !currentQuestionStateReady ||
      currentQuestionAnswered ||
      busy
    ) {
      return;
    }

    if (answerStartCueQuestionRef.current !== currentQuestion.questionId) {
      answerStartCueQuestionRef.current = currentQuestion.questionId;
      playAnswerStartCue();
    }
    setTimerPhase("ANSWERING");
    setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
  }, [
    busy,
    currentQuestion,
    currentQuestionAnswered,
    currentQuestionStateReady,
    data?.runtime,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    remainingSeconds,
    setupCompleted,
    timerPhase,
  ]);

  useEffect(() => {
    if (
      !currentQuestion ||
      !shouldHandleInterviewAnswerTimeout({
        remainingSeconds,
        timerPhase,
        setupCompleted,
        introCompleted,
        questionSpeechCompleted,
        questionSpeechPlaying,
        hasCurrentQuestion: currentQuestionStateReady,
        currentQuestionLocked,
        busy,
      })
    ) {
      return;
    }
    if (timeExpiredQuestionRef.current === currentQuestion.questionId) return;
    timeExpiredQuestionRef.current = currentQuestion.questionId;
    void handleQuestionTimeExpired();
    // The timeout action intentionally reads the latest runtime state when the counter reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    busy,
    currentQuestion,
    currentQuestionLocked,
    currentQuestionStateReady,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    remainingSeconds,
    setupCompleted,
    timerPhase,
  ]);

  useEffect(() => {
    if (
      !data ||
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      cameralessTestEntry ||
      !cameraReady ||
      !microphoneReady ||
      !currentQuestion ||
      currentQuestionLocked ||
      timerPhase !== "ANSWERING"
    ) {
      return;
    }
    if (
      !shouldAutoStartInterviewRecording({
        setupCompleted,
        introCompleted,
        questionSpeechCompleted,
        questionSpeechPlaying,
        cameraReady,
        microphoneReady,
        hasCurrentQuestion: currentQuestionStateReady,
        currentQuestionLocked,
        timerPhase,
        recording,
        hasAnswerFile,
        microphoneLevel: microphoneLevelRef.current,
      })
    ) {
      return;
    }
    if (recording || hasAnswerFile) return;
    if (autoRecordingQuestionRef.current === currentQuestion.questionId) return;
    autoRecordingQuestionRef.current = currentQuestion.questionId;
    void handleStartRecording();
    // Auto-start only after the interviewer speech and preparation timer have both finished.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data?.runtime.sessionId,
    setupCompleted,
    cameralessTestEntry,
    cameraReady,
    microphoneReady,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    currentQuestion?.questionId,
    currentQuestionStateReady,
    currentQuestionLocked,
    timerPhase,
    recording,
    hasAnswerFile,
  ]);

  useEffect(() => {
    if (
      !realtimeSpeechReady ||
      !recording ||
      !currentQuestion ||
      currentQuestionLocked ||
      timerPhase !== "ANSWERING" ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      busy
    ) {
      realtimeSilenceStartedAtRef.current = null;
      return;
    }

    const questionId = currentQuestion.questionId;
    if (realtimeEncouragedQuestionRef.current === questionId) return;

    const intervalId = window.setInterval(() => {
      const decision = getRealtimeSilenceEncouragementDecision({
        nowMs: Date.now(),
        silenceStartedAtMs: realtimeSilenceStartedAtRef.current,
        currentMicrophoneLevel: microphoneLevelRef.current,
        minimumVoiceLevel: MIN_INTERVIEW_RECORDING_VOICE_LEVEL,
        hasDetectedVoiceDuringAnswer: recordingVoiceFrameCountRef.current >= MIN_INTERVIEW_RECORDING_VOICE_FRAME_COUNT,
        alreadyEncouraged: realtimeEncouragedQuestionRef.current === questionId,
        remainingSeconds,
        silenceGraceMs: REALTIME_SILENCE_GRACE_MS,
      });
      realtimeSilenceStartedAtRef.current = decision.nextSilenceStartedAtMs;
      if (!decision.shouldEncourage) {
        return;
      }

      const playbackId = ++speechPlaybackIdRef.current;
      const sent = sendRealtimeSpeechClientEvent(
        realtimeConnectionRef.current,
        createRealtimeInterviewSpeechResponseEvent({
          purpose: "interview_encouragement",
          text: decision.text,
          questionId,
          playbackId,
        }),
      );
      if (!sent) return;

      realtimeEncouragedQuestionRef.current = questionId;
      setQuestionSpeechStatus("답변을 기다리며 짧은 격려 안내를 재생합니다.");
      window.clearInterval(intervalId);
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [
    busy,
    currentQuestion,
    currentQuestionLocked,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    realtimeSpeechReady,
    recording,
    remainingSeconds,
    timerPhase,
  ]);

  async function refreshCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const audioDevices = devices.filter((device) => device.kind === "audioinput");
    setCameraDevices(videoDevices);
    setMicrophoneDevices(audioDevices);
    if (!selectedCameraId && videoDevices.length === 1) {
      setSelectedCameraId(videoDevices[0]?.deviceId ?? "");
    }
    if (!selectedMicrophoneId && audioDevices.length === 1) {
      setSelectedMicrophoneId(audioDevices[0]?.deviceId ?? "");
    }
  }

  function stopMicrophoneMeter() {
    if (microphoneFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneFrameRef.current);
      microphoneFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    microphoneLevelRef.current = 0;
    setMicrophoneLevel(0);
  }

  function stopRuntimeCameraQualityMonitor() {
    if (cameraQualityIntervalRef.current !== null) {
      window.clearInterval(cameraQualityIntervalRef.current);
      cameraQualityIntervalRef.current = null;
    }
  }

  function stopNonverbalCameraMonitor() {
    if (nonverbalCameraMonitorRef.current !== null) {
      window.clearInterval(nonverbalCameraMonitorRef.current);
      nonverbalCameraMonitorRef.current = null;
    }
  }

  function refreshNonverbalDeviceQaSnapshot(run = recordingNonverbalTrackerRef.current?.deviceQa) {
    if (!run || !nonverbalDeviceQaEnabled) return;
    setNonverbalDeviceQaSnapshot({
      run,
      summary: summarizeNonverbalDeviceQaRun(run),
    });
  }

  function stopNonverbalVideoFrameMonitor() {
    const video = nonverbalVideoFrameElementRef.current;
    if (video && nonverbalVideoFrameCallbackRef.current !== null) {
      video.cancelVideoFrameCallback?.(nonverbalVideoFrameCallbackRef.current);
    }
    nonverbalVideoFrameCallbackRef.current = null;
    nonverbalVideoFrameElementRef.current = null;
  }

  function startNonverbalVideoFrameMonitor(tracker: RecordingNonverbalTracker) {
    stopNonverbalVideoFrameMonitor();
    const run = tracker.deviceQa;
    const video = videoRef.current as NonverbalQaVideoElement | null;
    if (!run || !video?.requestVideoFrameCallback) return;

    run.videoFrameCallbackSupported = true;
    nonverbalVideoFrameElementRef.current = video;
    const onVideoFrame = (_now: number, metadata: NonverbalQaVideoFrameMetadata) => {
      const current = recordingNonverbalTrackerRef.current;
      if (!current || current !== tracker || current.deviceQa !== run) return;

      const nowMs = Date.now();
      const presentedFrameDelta = run.lastPresentedFrames === undefined
        ? 1
        : Math.max(1, metadata.presentedFrames - run.lastPresentedFrames);
      run.videoDroppedFrameEstimate += Math.max(0, presentedFrameDelta - 1);
      run.videoPresentedFrameCount += 1;
      run.lastPresentedFrames = metadata.presentedFrames;
      run.firstVideoFrameAtMs ??= nowMs;
      run.lastVideoFrameAtMs = nowMs;

      nonverbalVideoFrameCallbackRef.current = video.requestVideoFrameCallback?.(onVideoFrame) ?? null;
    };
    nonverbalVideoFrameCallbackRef.current = video.requestVideoFrameCallback(onVideoFrame);
  }

  function recordCompletedNonverbalDeviceQaSample(
    tracker: RecordingNonverbalTracker,
    input: { facePresent: boolean; irisDetected: boolean; headPoseDetected: boolean },
  ) {
    const run = tracker.deviceQa;
    if (!run) return;
    run.sampleCompleted += 1;
    run.firstCompletedSampleAtMs ??= Date.now();
    if (input.facePresent) run.facePresentSampleCount += 1;
    if (input.irisDetected) run.irisSampleCount += 1;
    if (input.headPoseDetected) run.headPoseSampleCount += 1;
  }

  function handleStartNonverbalDeviceQaScenario() {
    const tracker = recordingNonverbalTrackerRef.current;
    const run = tracker?.deviceQa;
    if (!recording || !tracker || !run) {
      setNonverbalDeviceQaMessage("답변 녹화를 시작한 뒤 시나리오를 측정해 주세요.");
      return;
    }
    if (run.activeScenario) {
      setNonverbalDeviceQaMessage("진행 중인 시나리오를 먼저 종료해 주세요.");
      return;
    }

    startNonverbalDeviceQaScenario(run, nonverbalDeviceQaScenarioKind, tracker.integrityEvents.length);
    const instruction = nonverbalDeviceQaScenarioKind === "NEUTRAL"
      ? "정면을 자연스럽게 바라본 뒤 5초 이상 유지해 주세요."
      : nonverbalDeviceQaScenarioKind === "EYE_AWAY"
        ? "고개는 정면에 두고 눈동자만 옆으로 3~5초 움직인 뒤 정면으로 돌아오세요."
        : "눈은 자연스럽게 두고 고개를 옆으로 3~5초 돌린 뒤 정면으로 돌아오세요.";
    setNonverbalDeviceQaMessage(instruction);
    refreshNonverbalDeviceQaSnapshot(run);
  }

  function handleFinishNonverbalDeviceQaScenario() {
    const tracker = recordingNonverbalTrackerRef.current;
    const run = tracker?.deviceQa;
    if (!tracker || !run?.activeScenario) {
      setNonverbalDeviceQaMessage("진행 중인 QA 시나리오가 없습니다.");
      return;
    }

    const result = finishNonverbalDeviceQaScenario(run, tracker.integrityEvents);
    setNonverbalDeviceQaMessage(result?.message ?? "시나리오 결과를 만들지 못했습니다.");
    refreshNonverbalDeviceQaSnapshot(run);
  }

  function handleDownloadNonverbalDeviceQaResult() {
    if (typeof window === "undefined" || nonverbalDeviceQaRunsRef.current.length === 0) {
      setNonverbalDeviceQaMessage("다운로드할 측정 결과가 없습니다.");
      return;
    }

    const payload = buildNonverbalDeviceQaExport(nonverbalDeviceQaRunsRef.current);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nonverbal-device-qa-${payload.generatedAt.replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNonverbalDeviceQaMessage("QA 결과 JSON을 저장했습니다.");
  }

  function stopNonverbalIntegrityListeners() {
    nonverbalIntegrityCleanupRef.current?.();
    nonverbalIntegrityCleanupRef.current = null;
  }

  function formatRuntimeIntegrityWarning(type: InterviewIntegrityEventType, direction?: GazeDirection): string {
    switch (type) {
      case "TAB_HIDDEN":
      case "WINDOW_BLUR":
        return "면접 화면을 벗어난 신호가 감지되었습니다.";
      case "CAMERA_LOST":
        return "카메라 연결이 끊기거나 비활성화된 신호가 감지되었습니다.";
      case "FACE_MISSING":
        return "얼굴이 화면에서 감지되지 않습니다.";
      case "FACE_OUT_OF_FRAME":
        return "얼굴이 화면 밖이나 가장자리로 벗어난 신호가 감지되었습니다.";
      case "MULTIPLE_FACES":
        return "여러 사람이 감지되었습니다.";
      case "FACE_POSITION_SHIFT":
        return "얼굴 위치가 기준 위치와 크게 달라졌습니다.";
      case "GAZE_AWAY": {
        const directionLabel =
          direction === "LEFT" ? "왼쪽" :
          direction === "RIGHT" ? "오른쪽" :
          direction === "UP" ? "위쪽" :
          direction === "DOWN" ? "아래쪽" :
          "화면 밖";
        return `시선 또는 고개 방향이 ${directionLabel}으로 오래 벗어난 신호가 감지되었습니다.`;
      }
      case "VOICE_MOUTH_MISMATCH":
        return "음성은 감지되지만 화면 속 입 움직임이 거의 없는 신호가 감지되었습니다.";
      case "VOICE_WITHOUT_FACE":
        return "얼굴이 감지되지 않는 상태에서 음성 입력이 지속되는 신호가 감지되었습니다.";
      case "STATIC_VIDEO_FRAME":
        return "답변 중 영상 변화가 거의 없는 구간이 감지되었습니다.";
      case "EARLY_SCREEN_AWAY":
        return "질문 직후 면접 화면을 벗어난 신호가 감지되었습니다.";
      default:
        return "응시 무결성 확인이 필요한 신호가 감지되었습니다.";
    }
  }

  function showRuntimeIntegrityWarning(type: InterviewIntegrityEventType, options: { direction?: GazeDirection } = {}) {
    if (mode !== "mock" || typeof window === "undefined") return;

    const nowMs = Date.now();
    const lastShownAtMs = integrityWarningLastShownAtRef.current.get(type) ?? 0;
    if (nowMs - lastShownAtMs < RUNTIME_INTEGRITY_WARNING_REPEAT_COOLDOWN_MS) return;

    integrityWarningLastShownAtRef.current.set(type, nowMs);
    setIntegrityWarning({
      type,
      message: formatRuntimeIntegrityWarning(type, options.direction),
      occurredAt: new Date(nowMs).toISOString(),
    });

    if (integrityWarningTimeoutRef.current !== null) {
      window.clearTimeout(integrityWarningTimeoutRef.current);
    }
    integrityWarningTimeoutRef.current = window.setTimeout(() => {
      setIntegrityWarning(null);
      integrityWarningTimeoutRef.current = null;
    }, RUNTIME_INTEGRITY_WARNING_DURATION_MS);
  }

  function closeTimedIntegrityEvent(
    tracker: RecordingNonverbalTracker,
    type: Extract<
      InterviewIntegrityEventType,
      | "TAB_HIDDEN"
      | "WINDOW_BLUR"
      | "CAMERA_LOST"
      | "FACE_MISSING"
      | "FACE_OUT_OF_FRAME"
      | "MULTIPLE_FACES"
      | "FACE_POSITION_SHIFT"
      | "GAZE_AWAY"
      | "VOICE_MOUTH_MISMATCH"
      | "VOICE_WITHOUT_FACE"
      | "STATIC_VIDEO_FRAME"
    >,
    startedAtMs: number | undefined,
    nowMs = Date.now(),
    options: { direction?: GazeDirection; source?: GazeSignalSource } = {},
  ) {
    if (startedAtMs === undefined) return;

    const durationMs = Math.max(0, nowMs - startedAtMs);
    tracker.integrityEvents.push({
      type,
      occurredAt: new Date(startedAtMs).toISOString(),
      offsetMs: Math.max(0, Math.round(startedAtMs - tracker.recordingStartedAtMs)),
      durationMs: Math.round(durationMs),
      ...(options.direction ? { direction: options.direction } : {}),
      ...(options.source ? { source: options.source } : {}),
    });

    if (type === "TAB_HIDDEN" || type === "WINDOW_BLUR") {
      tracker.totalAwayDurationMs += durationMs;
      tracker.maxAwayDurationMs = Math.max(tracker.maxAwayDurationMs, durationMs);
    }
  }

  async function getMediaPipeFaceLandmarker(): Promise<MediaPipeFaceLandmarker | null> {
    if (nonverbalFaceLandmarkerRef.current !== undefined) return nonverbalFaceLandmarkerRef.current;
    if (nonverbalFaceLandmarkerPromiseRef.current) return nonverbalFaceLandmarkerPromiseRef.current;

    nonverbalFaceLandmarkerPromiseRef.current = (async () => {
      try {
        const { tasks, vision } = await getMediaPipeVisionRuntime();
        const landmarker = await withFilteredMediaPipeDiagnostics(() =>
          tasks.FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_MODEL_URL,
            },
            runningMode: "VIDEO",
            numFaces: 3,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFacialTransformationMatrixes: true,
          }),
        );
        nonverbalFaceLandmarkerRef.current = landmarker;
        return landmarker;
      } catch {
        nonverbalFaceLandmarkerRef.current = null;
        return null;
      } finally {
        nonverbalFaceLandmarkerPromiseRef.current = null;
      }
    })();

    return nonverbalFaceLandmarkerPromiseRef.current;
  }

  async function getMediaPipePersonDetector(): Promise<MediaPipeObjectDetector | null> {
    if (nonverbalPersonDetectorRef.current !== undefined) return nonverbalPersonDetectorRef.current;
    if (nonverbalPersonDetectorPromiseRef.current) return nonverbalPersonDetectorPromiseRef.current;

    nonverbalPersonDetectorPromiseRef.current = (async () => {
      try {
        const { tasks, vision } = await getMediaPipeVisionRuntime();
        const detector = await withFilteredMediaPipeDiagnostics(() =>
          tasks.ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_PERSON_DETECTOR_MODEL_URL,
            },
            runningMode: "VIDEO",
            maxResults: 4,
            scoreThreshold: NONVERBAL_PERSON_DETECTION_SCORE_THRESHOLD,
            categoryAllowlist: ["person"],
          }),
        );
        nonverbalPersonDetectorRef.current = detector;
        return detector;
      } catch {
        nonverbalPersonDetectorRef.current = null;
        return null;
      } finally {
        nonverbalPersonDetectorPromiseRef.current = null;
      }
    })();

    return nonverbalPersonDetectorPromiseRef.current;
  }

  function getBrowserFaceDetector(): BrowserFaceDetector | null {
    if (nonverbalFaceDetectorRef.current !== undefined) return nonverbalFaceDetectorRef.current;

    const FaceDetectorConstructor = (window as unknown as { FaceDetector?: BrowserFaceDetectorConstructor }).FaceDetector;
    if (!FaceDetectorConstructor) {
      nonverbalFaceDetectorRef.current = null;
      return null;
    }

    try {
      nonverbalFaceDetectorRef.current = new FaceDetectorConstructor({ fastMode: true, maxDetectedFaces: 4 });
    } catch {
      nonverbalFaceDetectorRef.current = null;
    }
    return nonverbalFaceDetectorRef.current;
  }

  function getNonverbalFaceCanvas(): HTMLCanvasElement {
    if (!nonverbalFaceCanvasRef.current) {
      nonverbalFaceCanvasRef.current = document.createElement("canvas");
    }
    return nonverbalFaceCanvasRef.current;
  }

  function toFaceSnapshot(face: BrowserDetectedFace, width: number, height: number): FacePositionSnapshot {
    const box = face.boundingBox;
    return {
      centerX: (box.x + box.width / 2) / width,
      centerY: (box.y + box.height / 2) / height,
      areaRatio: (box.width * box.height) / (width * height),
    };
  }

  function toFaceSnapshotFromLandmarks(landmarks: NormalizedLandmark[]): FacePositionSnapshot | undefined {
    if (!landmarks.length) return undefined;

    const xs = landmarks.map((landmark) => landmark.x).filter((value) => Number.isFinite(value));
    const ys = landmarks.map((landmark) => landmark.y).filter((value) => Number.isFinite(value));
    if (!xs.length || !ys.length) return undefined;

    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(1, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(1, Math.max(...ys));
    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      areaRatio: Math.max(0, maxX - minX) * Math.max(0, maxY - minY),
    };
  }

  function isFaceOutOfFrame(snapshot: FacePositionSnapshot): boolean {
    return (
      snapshot.areaRatio < NONVERBAL_FACE_MIN_AREA_RATIO ||
      snapshot.centerX < NONVERBAL_FACE_EDGE_MARGIN_RATIO ||
      snapshot.centerX > 1 - NONVERBAL_FACE_EDGE_MARGIN_RATIO ||
      snapshot.centerY < NONVERBAL_FACE_EDGE_MARGIN_RATIO ||
      snapshot.centerY > 1 - NONVERBAL_FACE_EDGE_MARGIN_RATIO
    );
  }

  function registerFaceBaselineSample(
    tracker: RecordingNonverbalTracker,
    snapshot: FacePositionSnapshot | undefined,
  ) {
    if (
      !snapshot ||
      isFaceOutOfFrame(snapshot) ||
      tracker.faceBaselineSampleCount >= NONVERBAL_FACE_BASELINE_REQUIRED_SAMPLES
    ) {
      return;
    }
    tracker.faceBaseline = updateFacePositionBaseline(
      tracker.faceBaseline,
      tracker.faceBaselineSampleCount,
      snapshot,
    );
    tracker.faceBaselineSampleCount += 1;
  }

  function updateFacePositionShiftSignal(
    tracker: RecordingNonverbalTracker,
    positionShifted: boolean,
  ) {
    const state = updateSustainedDetectionState({
      detected: positionShifted,
      nowMs: Date.now(),
      candidateStartedAtMs: tracker.facePositionShiftCandidateStartedAtMs,
      confirmationMs: NONVERBAL_FACE_SHIFT_CONFIRMATION_MS,
    });
    tracker.facePositionShiftCandidateStartedAtMs = state.candidateStartedAtMs;
    updateTimedFaceSignal(
      tracker,
      "facePositionShiftStartedAtMs",
      "FACE_POSITION_SHIFT",
      state.active,
    );
  }

  function landmarkDistance(left: NormalizedLandmark, right: NormalizedLandmark): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function estimateMouthOpenRatio(landmarks: NormalizedLandmark[]): number | undefined {
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftCorner = landmarks[61];
    const rightCorner = landmarks[291];
    if (!upperLip || !lowerLip || !leftCorner || !rightCorner) return undefined;

    const mouthWidth = landmarkDistance(leftCorner, rightCorner);
    if (mouthWidth <= 0) return undefined;
    return landmarkDistance(upperLip, lowerLip) / mouthWidth;
  }

  function recentAudioSpeakingRatio(tracker: RecordingNonverbalTracker): number {
    return tracker.audioFramesSinceLastMouthSample > 0
      ? tracker.speakingAudioFramesSinceLastMouthSample / tracker.audioFramesSinceLastMouthSample
      : 0;
  }

  function resetRecentAudioSpeechWindow(tracker: RecordingNonverbalTracker) {
    tracker.audioFramesSinceLastMouthSample = 0;
    tracker.speakingAudioFramesSinceLastMouthSample = 0;
  }

  function registerEarlyScreenAwaySignal(tracker: RecordingNonverbalTracker) {
    if (tracker.earlyScreenAwayRecorded) return;

    const nowMs = Date.now();
    if (nowMs - tracker.recordingStartedAtMs > NONVERBAL_EARLY_SCREEN_AWAY_WINDOW_MS) return;

    tracker.earlyScreenAwayRecorded = true;
    tracker.integrityEvents.push({
      type: "EARLY_SCREEN_AWAY",
      occurredAt: new Date(nowMs).toISOString(),
      offsetMs: Math.max(0, Math.round(nowMs - tracker.recordingStartedAtMs)),
    });
    showRuntimeIntegrityWarning("EARLY_SCREEN_AWAY");
  }

  function registerVoiceWithoutFaceSample(tracker: RecordingNonverbalTracker, faceMissing: boolean) {
    const nowMs = Date.now();
    const audioSpeaking = recentAudioSpeakingRatio(tracker) >= NONVERBAL_AUDIO_SPEAKING_RATIO_THRESHOLD;
    if (faceMissing && audioSpeaking) {
      tracker.voiceWithoutFaceCandidateStartedAtMs ??= nowMs;
    } else {
      tracker.voiceWithoutFaceCandidateStartedAtMs = undefined;
    }

    const mismatchActive =
      tracker.voiceWithoutFaceCandidateStartedAtMs !== undefined &&
      nowMs - tracker.voiceWithoutFaceCandidateStartedAtMs >= NONVERBAL_VOICE_WITHOUT_FACE_GRACE_MS;
    updateTimedFaceSignal(tracker, "voiceWithoutFaceStartedAtMs", "VOICE_WITHOUT_FACE", mismatchActive);
  }

  function sampleStaticVideoFrame(tracker: RecordingNonverbalTracker, video: HTMLVideoElement) {
    const canvas = getNonverbalFaceCanvas();
    canvas.width = NONVERBAL_STATIC_FRAME_SAMPLE_WIDTH;
    canvas.height = NONVERBAL_STATIC_FRAME_SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const currentSample: number[] = [];
    for (let index = 0; index < imageData.length; index += 4) {
      currentSample.push(Math.round((imageData[index] + imageData[index + 1] + imageData[index + 2]) / 3));
    }

    tracker.videoFrameMotionSupported = true;
    tracker.videoFrameSampleCount += 1;

    const previousSample = tracker.lastVideoFrameSample;
    tracker.lastVideoFrameSample = currentSample;
    if (!previousSample || previousSample.length !== currentSample.length) return;

    const averageDiff = currentSample.reduce((sum, value, index) => sum + Math.abs(value - previousSample[index]), 0) / currentSample.length;
    const nowMs = Date.now();
    if (averageDiff <= NONVERBAL_STATIC_FRAME_DIFF_THRESHOLD) {
      tracker.staticVideoFrameSampleCount += 1;
      tracker.staticVideoFrameCandidateStartedAtMs ??= nowMs;
    } else {
      tracker.staticVideoFrameCandidateStartedAtMs = undefined;
    }

    const staticFrameActive =
      tracker.staticVideoFrameCandidateStartedAtMs !== undefined &&
      nowMs - tracker.staticVideoFrameCandidateStartedAtMs >= NONVERBAL_STATIC_FRAME_GRACE_MS;
    updateTimedFaceSignal(tracker, "staticVideoFrameStartedAtMs", "STATIC_VIDEO_FRAME", staticFrameActive);
  }

  function updateCalibrationAverage(current: number | undefined, sampleCount: number, next: number) {
    return current === undefined ? next : (current * sampleCount + next) / (sampleCount + 1);
  }

  function roundTimelineValue(value: number, precision: number) {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
  }

  function normalizeTimelineAngle(value: number) {
    let normalized = value;
    while (normalized > 180) normalized -= 360;
    while (normalized < -180) normalized += 360;
    return normalized;
  }

  function canAppendTimelineSample(lastSampleAtMs: number | undefined, nowMs: number) {
    return lastSampleAtMs === undefined || nowMs - lastSampleAtMs >= NONVERBAL_TIMELINE_SAMPLE_INTERVAL_MS;
  }

  function registerCombinedGazeSample(
    tracker: RecordingNonverbalTracker,
    irisPosition: IrisGazePosition | undefined,
    headPose: HeadPoseAngles | undefined,
    calibrationEligible: boolean,
  ) {
    const irisCalibrated = tracker.gazeCalibrationSampleCount >= GAZE_CALIBRATION_REQUIRED_SAMPLES;
    const headPoseCalibrated = tracker.headPoseCalibrationSampleCount >= GAZE_CALIBRATION_REQUIRED_SAMPLES;
    let calibrationUpdated = false;

    if (irisPosition) {
      tracker.gazeDetectionSupported = true;
      tracker.gazeDetectionFrameCount += 1;
      if (!irisCalibrated && calibrationEligible) {
        const sampleCount = tracker.gazeCalibrationSampleCount;
        tracker.gazeBaselineHorizontalRatio = updateCalibrationAverage(
          tracker.gazeBaselineHorizontalRatio,
          sampleCount,
          irisPosition.horizontalRatio,
        );
        tracker.gazeBaselineVerticalRatio = updateCalibrationAverage(
          tracker.gazeBaselineVerticalRatio,
          sampleCount,
          irisPosition.verticalRatio,
        );
        tracker.gazeCalibrationSampleCount += 1;
        calibrationUpdated = true;
      }
    }

    if (headPose) {
      tracker.headPoseDetectionSupported = true;
      tracker.headPoseDetectionFrameCount += 1;
      if (!headPoseCalibrated && calibrationEligible) {
        const sampleCount = tracker.headPoseCalibrationSampleCount;
        tracker.headPoseBaselineYawDegrees = updateCalibrationAverage(
          tracker.headPoseBaselineYawDegrees,
          sampleCount,
          headPose.yawDegrees,
        );
        tracker.headPoseBaselinePitchDegrees = updateCalibrationAverage(
          tracker.headPoseBaselinePitchDegrees,
          sampleCount,
          headPose.pitchDegrees,
        );
        if (headPose.rollDegrees !== undefined) {
          tracker.headPoseBaselineRollDegrees = updateCalibrationAverage(
            tracker.headPoseBaselineRollDegrees,
            sampleCount,
            headPose.rollDegrees,
          );
        }
        tracker.headPoseCalibrationSampleCount += 1;
        calibrationUpdated = true;
      }
    }

    if (calibrationUpdated) {
      updateCombinedGazeSignal(tracker, undefined);
      return;
    }

    const irisBaseline =
      tracker.gazeCalibrationSampleCount >= GAZE_CALIBRATION_REQUIRED_SAMPLES &&
      tracker.gazeBaselineHorizontalRatio !== undefined &&
      tracker.gazeBaselineVerticalRatio !== undefined
        ? {
            horizontalRatio: tracker.gazeBaselineHorizontalRatio,
            verticalRatio: tracker.gazeBaselineVerticalRatio,
          }
        : undefined;
    const headPoseBaseline =
      tracker.headPoseCalibrationSampleCount >= GAZE_CALIBRATION_REQUIRED_SAMPLES &&
      tracker.headPoseBaselineYawDegrees !== undefined &&
      tracker.headPoseBaselinePitchDegrees !== undefined
        ? {
            yawDegrees: tracker.headPoseBaselineYawDegrees,
            pitchDegrees: tracker.headPoseBaselinePitchDegrees,
          }
        : undefined;
    const previousSmoothedIrisPosition =
      tracker.smoothedGazeHorizontalRatio !== undefined && tracker.smoothedGazeVerticalRatio !== undefined
        ? {
            horizontalRatio: tracker.smoothedGazeHorizontalRatio,
            verticalRatio: tracker.smoothedGazeVerticalRatio,
          }
        : irisBaseline;
    const smoothedIrisPosition = irisPosition
      ? smoothIrisGazePosition(previousSmoothedIrisPosition, irisPosition)
      : undefined;
    if (smoothedIrisPosition) {
      tracker.smoothedGazeHorizontalRatio = smoothedIrisPosition.horizontalRatio;
      tracker.smoothedGazeVerticalRatio = smoothedIrisPosition.verticalRatio;
    }
    const signal = resolveCombinedGazeSignal({
      irisPosition: smoothedIrisPosition,
      irisBaseline,
      headPose,
      headPoseBaseline,
    });
    const nowMs = Date.now();
    if (
      mode === "mock" &&
      smoothedIrisPosition &&
      irisBaseline &&
      tracker.gazeTimeline.length < INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES &&
      canAppendTimelineSample(tracker.lastGazeTimelineSampleAtMs, nowMs)
    ) {
      const horizontalOffset = normalizeGazeTimelineOffset(
        smoothedIrisPosition.horizontalRatio - irisBaseline.horizontalRatio,
      );
      const verticalOffset = normalizeGazeTimelineOffset(
        smoothedIrisPosition.verticalRatio - irisBaseline.verticalRatio,
      );
      if (horizontalOffset !== undefined && verticalOffset !== undefined) {
        tracker.gazeTimeline.push({
          tMs: Math.max(0, nowMs - tracker.recordingStartedAtMs),
          horizontalOffset: roundTimelineValue(horizontalOffset, 3),
          verticalOffset: roundTimelineValue(verticalOffset, 3),
          direction: classifyIrisGazeDirection(smoothedIrisPosition, irisBaseline),
        });
        tracker.lastGazeTimelineSampleAtMs = nowMs;
      }
    }
    if (
      mode === "mock" &&
      headPose &&
      headPoseBaseline &&
      tracker.headPoseTimeline.length < INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES &&
      canAppendTimelineSample(tracker.lastHeadPoseTimelineSampleAtMs, nowMs)
    ) {
      tracker.headPoseTimeline.push({
        tMs: Math.max(0, nowMs - tracker.recordingStartedAtMs),
        yawDegrees: roundTimelineValue(normalizeTimelineAngle(headPose.yawDegrees - headPoseBaseline.yawDegrees), 1),
        pitchDegrees: roundTimelineValue(normalizeTimelineAngle(headPose.pitchDegrees - headPoseBaseline.pitchDegrees), 1),
        rollDegrees: roundTimelineValue(
          normalizeTimelineAngle((headPose.rollDegrees ?? 0) - (tracker.headPoseBaselineRollDegrees ?? 0)),
          1,
        ),
      });
      tracker.lastHeadPoseTimelineSampleAtMs = nowMs;
    }
    updateCombinedGazeSignal(tracker, signal);
  }

  function updateCombinedGazeSignal(
    tracker: RecordingNonverbalTracker,
    signal: ReturnType<typeof resolveCombinedGazeSignal>,
  ) {
    const nowMs = Date.now();
    if (signal) {
      tracker.lastGazeSignalAtMs = nowMs;
      tracker.gazeCenteredCandidateStartedAtMs = undefined;
      tracker.gazeAwayCandidateStartedAtMs ??= nowMs;
      tracker.lastGazeDirection = signal.direction;
      tracker.lastGazeSource = mergeGazeSignalSource(tracker.lastGazeSource, signal.source);

      if (
        tracker.gazeAwayStartedAtMs === undefined &&
        nowMs - tracker.gazeAwayCandidateStartedAtMs >= NONVERBAL_GAZE_AWAY_CONFIRMATION_MS
      ) {
        tracker.gazeAwayStartedAtMs = tracker.gazeAwayCandidateStartedAtMs;
        showRuntimeIntegrityWarning("GAZE_AWAY", { direction: tracker.lastGazeDirection });
      }
      return;
    }

    if (tracker.gazeAwayStartedAtMs === undefined) {
      if (
        tracker.gazeAwayCandidateStartedAtMs !== undefined &&
        isWithinDetectionGrace(
          tracker.lastGazeSignalAtMs,
          nowMs,
          NONVERBAL_GAZE_SIGNAL_DROPOUT_GRACE_MS,
        )
      ) {
        return;
      }
      tracker.gazeAwayCandidateStartedAtMs = undefined;
      tracker.gazeCenteredCandidateStartedAtMs = undefined;
      tracker.lastGazeSignalAtMs = undefined;
      tracker.lastGazeDirection = undefined;
      tracker.lastGazeSource = undefined;
      return;
    }

    tracker.gazeCenteredCandidateStartedAtMs ??= nowMs;
    if (nowMs - tracker.gazeCenteredCandidateStartedAtMs < NONVERBAL_GAZE_CENTERED_CONFIRMATION_MS) return;

    closeTimedIntegrityEvent(
      tracker,
      "GAZE_AWAY",
      tracker.gazeAwayStartedAtMs,
      tracker.gazeCenteredCandidateStartedAtMs,
      { direction: tracker.lastGazeDirection, source: tracker.lastGazeSource },
    );
    tracker.gazeAwayStartedAtMs = undefined;
    tracker.gazeCenteredCandidateStartedAtMs = undefined;
    tracker.lastGazeSignalAtMs = undefined;
    tracker.lastGazeDirection = undefined;
    tracker.lastGazeSource = undefined;
  }

  function mergeGazeSignalSource(current: GazeSignalSource | undefined, next: GazeSignalSource): GazeSignalSource {
    if (!current || current === next) return next;
    return "COMBINED";
  }

  function updateTimedFaceSignal(
    tracker: RecordingNonverbalTracker,
    key:
      | "faceMissingStartedAtMs"
      | "faceOutOfFrameStartedAtMs"
      | "multipleFacesStartedAtMs"
      | "facePositionShiftStartedAtMs"
      | "gazeAwayStartedAtMs"
      | "voiceMouthMismatchStartedAtMs"
      | "voiceWithoutFaceStartedAtMs"
      | "staticVideoFrameStartedAtMs",
    type: Extract<
      InterviewIntegrityEventType,
      | "FACE_MISSING"
      | "FACE_OUT_OF_FRAME"
      | "MULTIPLE_FACES"
      | "FACE_POSITION_SHIFT"
      | "GAZE_AWAY"
      | "VOICE_MOUTH_MISMATCH"
      | "VOICE_WITHOUT_FACE"
      | "STATIC_VIDEO_FRAME"
    >,
    active: boolean,
    options: { direction?: GazeDirection } = {},
  ) {
    if (active) {
      if (tracker[key] === undefined) {
        tracker[key] = Date.now();
        showRuntimeIntegrityWarning(type, options);
      }
      return;
    }
    closeTimedIntegrityEvent(tracker, type, tracker[key], Date.now(), options);
    tracker[key] = undefined;
  }

  function registerVoiceMouthSyncSample(tracker: RecordingNonverbalTracker, landmarks: NormalizedLandmark[]) {
    const mouthOpenRatio = estimateMouthOpenRatio(landmarks);
    if (mouthOpenRatio === undefined) return;

    tracker.mouthSyncSupported = true;
    tracker.mouthSyncFrameCount += 1;

    const previousMouthOpenRatio = tracker.lastMouthOpenRatio;
    const speakingRatio = recentAudioSpeakingRatio(tracker);
    const audioSpeaking = speakingRatio >= NONVERBAL_AUDIO_SPEAKING_RATIO_THRESHOLD;
    const mouthMoving = previousMouthOpenRatio === undefined
      ? true
      : mouthOpenRatio >= NONVERBAL_MOUTH_OPEN_RATIO_THRESHOLD ||
        Math.abs(mouthOpenRatio - previousMouthOpenRatio) >= NONVERBAL_MOUTH_MOVEMENT_DELTA_THRESHOLD;

    const nowMs = Date.now();
    const mismatchCandidate = previousMouthOpenRatio !== undefined && audioSpeaking && !mouthMoving;
    if (mismatchCandidate) {
      tracker.mouthSyncMismatchFrameCount += 1;
      tracker.voiceMouthMismatchCandidateStartedAtMs ??= nowMs;
    } else {
      tracker.voiceMouthMismatchCandidateStartedAtMs = undefined;
    }

    const mismatchActive =
      tracker.voiceMouthMismatchCandidateStartedAtMs !== undefined &&
      nowMs - tracker.voiceMouthMismatchCandidateStartedAtMs >= NONVERBAL_MOUTH_SYNC_MISMATCH_GRACE_MS;
    updateTimedFaceSignal(tracker, "voiceMouthMismatchStartedAtMs", "VOICE_MOUTH_MISMATCH", mismatchActive);

    tracker.lastMouthOpenRatio = mouthOpenRatio;
    resetRecentAudioSpeechWindow(tracker);
  }

  async function detectMultiplePeople(
    tracker: RecordingNonverbalTracker,
    questionId: number,
    video: HTMLVideoElement,
    detectedFaceCount: number,
  ): Promise<boolean | undefined> {
    if (detectedFaceCount > 1) return true;

    const nowMs = Date.now();
    if (
      tracker.lastPersonDetectionAtMs !== undefined &&
      nowMs - tracker.lastPersonDetectionAtMs < NONVERBAL_PERSON_SAMPLE_INTERVAL_MS
    ) {
      return undefined;
    }
    tracker.lastPersonDetectionAtMs = nowMs;

    const detector = await getMediaPipePersonDetector();
    const current = recordingNonverbalTrackerRef.current;
    if (!current || current !== tracker || current.questionId !== questionId) return undefined;
    if (!detector) {
      current.personDetectionSupported = false;
      return false;
    }

    try {
      const result = detector.detectForVideo(video, performance.now());
      current.personDetectionSupported = true;
      current.personDetectionFrameCount += 1;
      return countPersonDetections(result.detections, NONVERBAL_PERSON_DETECTION_SCORE_THRESHOLD) > 1;
    } catch {
      return undefined;
    }
  }

  function updateMultiplePeopleSignal(
    tracker: RecordingNonverbalTracker,
    multiplePeopleDetected: boolean | undefined,
  ) {
    if (multiplePeopleDetected === undefined) return;

    const state = updateMultiplePeopleDetectionState({
      detected: multiplePeopleDetected,
      nowMs: Date.now(),
      positiveSampleTimesMs: tracker.multiplePeoplePositiveSampleTimesMs,
      lastDetectedAtMs: tracker.multiplePeopleLastDetectedAtMs,
      active: tracker.multipleFacesStartedAtMs !== undefined,
      confirmationWindowMs: NONVERBAL_MULTIPLE_PEOPLE_CONFIRMATION_WINDOW_MS,
      requiredPositiveSamples: NONVERBAL_MULTIPLE_PEOPLE_REQUIRED_SAMPLES,
      releaseGraceMs: NONVERBAL_MULTIPLE_PEOPLE_RELEASE_GRACE_MS,
    });
    tracker.multiplePeoplePositiveSampleTimesMs = state.positiveSampleTimesMs;
    tracker.multiplePeopleLastDetectedAtMs = state.lastDetectedAtMs;
    updateTimedFaceSignal(tracker, "multipleFacesStartedAtMs", "MULTIPLE_FACES", state.active);
  }

  async function sampleFaceIntegrity(tracker: RecordingNonverbalTracker, questionId: number) {
    const qaRun = tracker.deviceQa;
    if (qaRun) qaRun.sampleAttempts += 1;
    if (nonverbalFaceDetectionPendingRef.current) {
      if (qaRun) {
        qaRun.sampleSkippedBusy += 1;
        refreshNonverbalDeviceQaSnapshot(qaRun);
      }
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
      if (qaRun) {
        qaRun.sampleSkippedVideoNotReady += 1;
        refreshNonverbalDeviceQaSnapshot(qaRun);
      }
      return;
    }

    nonverbalFaceDetectionPendingRef.current = true;
    const qaSampleStartedAt = performance.now();
    try {
      const activeTracker = recordingNonverbalTrackerRef.current;
      if (activeTracker && activeTracker === tracker && activeTracker.questionId === questionId) {
        sampleStaticVideoFrame(activeTracker, video);
      }

      const landmarker = await getMediaPipeFaceLandmarker();
      if (landmarker) {
        tracker.faceDetectionSupported = true;
        const result = landmarker.detectForVideo(video, performance.now());
        const current = recordingNonverbalTrackerRef.current;
        if (!current || current !== tracker || current.questionId !== questionId) return;

        const faces = result.faceLandmarks ?? [];
        current.faceDetectionFrameCount += 1;
        const primaryLandmarks = faces[0];
        const primaryTransformationMatrix = result.facialTransformationMatrixes?.[0];
        const snapshot = primaryLandmarks ? toFaceSnapshotFromLandmarks(primaryLandmarks) : undefined;
        registerFaceBaselineSample(current, snapshot);

        const irisPosition = primaryLandmarks ? estimateIrisGazePosition(primaryLandmarks) : undefined;
        const headPose = estimateHeadPoseAngles(primaryTransformationMatrix);
        const calibrationEligible = isReliableGazeCalibrationFrame({
          irisPosition,
          headPose,
          detectedFaceCount: faces.length,
          faceInFrame: Boolean(snapshot && !isFaceOutOfFrame(snapshot)),
        });
        registerCombinedGazeSample(current, irisPosition, headPose, calibrationEligible);
        registerVoiceWithoutFaceSample(current, faces.length === 0);
        if (primaryLandmarks) {
          registerVoiceMouthSyncSample(current, primaryLandmarks);
        } else {
          updateTimedFaceSignal(current, "voiceMouthMismatchStartedAtMs", "VOICE_MOUTH_MISMATCH", false);
          current.voiceMouthMismatchCandidateStartedAtMs = undefined;
          current.lastMouthOpenRatio = undefined;
          resetRecentAudioSpeechWindow(current);
        }

        updateTimedFaceSignal(current, "faceMissingStartedAtMs", "FACE_MISSING", faces.length === 0);

        updateTimedFaceSignal(current, "faceOutOfFrameStartedAtMs", "FACE_OUT_OF_FRAME", Boolean(snapshot && isFaceOutOfFrame(snapshot)));
        updateFacePositionShiftSignal(
          current,
          Boolean(
            snapshot &&
            current.faceBaseline &&
            current.faceBaselineSampleCount >= NONVERBAL_FACE_BASELINE_REQUIRED_SAMPLES &&
            isFacePositionShifted(current.faceBaseline, snapshot, {
              centerShiftRatio: NONVERBAL_FACE_SHIFT_RATIO,
              minimumAreaDelta: NONVERBAL_FACE_SHIFT_MINIMUM_AREA_DELTA,
              relativeAreaDeltaMultiplier: NONVERBAL_FACE_SHIFT_RELATIVE_AREA_MULTIPLIER,
            }),
          ),
        );
        const multiplePeopleDetected = await detectMultiplePeople(current, questionId, video, faces.length);
        const currentAfterPersonDetection = recordingNonverbalTrackerRef.current;
        if (!currentAfterPersonDetection || currentAfterPersonDetection !== tracker || currentAfterPersonDetection.questionId !== questionId) return;
        updateMultiplePeopleSignal(currentAfterPersonDetection, multiplePeopleDetected);
        recordCompletedNonverbalDeviceQaSample(currentAfterPersonDetection, {
          facePresent: faces.length > 0,
          irisDetected: Boolean(irisPosition),
          headPoseDetected: Boolean(headPose),
        });
        return;
      }

      const detector = getBrowserFaceDetector();
      tracker.faceDetectionSupported = Boolean(detector);
      tracker.gazeDetectionSupported = false;
      tracker.headPoseDetectionSupported = false;
      if (!detector) {
        if (qaRun) qaRun.sampleUnsupported += 1;
        return;
      }

      const canvas = getNonverbalFaceCanvas();
      const width = NONVERBAL_FACE_SAMPLE_SIZE;
      const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(video, 0, 0, width, height);
      const faces = await detector.detect(canvas);
      const current = recordingNonverbalTrackerRef.current;
      if (!current || current !== tracker || current.questionId !== questionId) return;

      current.faceDetectionFrameCount += 1;
      updateCombinedGazeSignal(current, undefined);
      const primaryFace = faces[0];
      const snapshot = primaryFace ? toFaceSnapshot(primaryFace, width, height) : undefined;
      registerFaceBaselineSample(current, snapshot);
      registerVoiceWithoutFaceSample(current, faces.length === 0);
      resetRecentAudioSpeechWindow(current);

      updateTimedFaceSignal(current, "faceMissingStartedAtMs", "FACE_MISSING", faces.length === 0);

      updateTimedFaceSignal(current, "faceOutOfFrameStartedAtMs", "FACE_OUT_OF_FRAME", Boolean(snapshot && isFaceOutOfFrame(snapshot)));
      updateFacePositionShiftSignal(
        current,
        Boolean(
          snapshot &&
          current.faceBaseline &&
          current.faceBaselineSampleCount >= NONVERBAL_FACE_BASELINE_REQUIRED_SAMPLES &&
          isFacePositionShifted(current.faceBaseline, snapshot, {
            centerShiftRatio: NONVERBAL_FACE_SHIFT_RATIO,
            minimumAreaDelta: NONVERBAL_FACE_SHIFT_MINIMUM_AREA_DELTA,
            relativeAreaDeltaMultiplier: NONVERBAL_FACE_SHIFT_RELATIVE_AREA_MULTIPLIER,
          }),
        ),
      );
      const multiplePeopleDetected = await detectMultiplePeople(current, questionId, video, faces.length);
      const currentAfterPersonDetection = recordingNonverbalTrackerRef.current;
      if (!currentAfterPersonDetection || currentAfterPersonDetection !== tracker || currentAfterPersonDetection.questionId !== questionId) return;
      updateMultiplePeopleSignal(currentAfterPersonDetection, multiplePeopleDetected);
      recordCompletedNonverbalDeviceQaSample(currentAfterPersonDetection, {
        facePresent: faces.length > 0,
        irisDetected: false,
        headPoseDetected: false,
      });
    } catch {
      tracker.faceDetectionSupported = false;
      if (qaRun) qaRun.sampleErrors += 1;
    } finally {
      if (qaRun) {
        qaRun.sampleProcessingDurationsMs.push(Math.max(0, performance.now() - qaSampleStartedAt));
        if (qaRun.sampleProcessingDurationsMs.length > 600) {
          qaRun.sampleProcessingDurationsMs.splice(0, qaRun.sampleProcessingDurationsMs.length - 600);
        }
        refreshNonverbalDeviceQaSnapshot(qaRun);
      }
      nonverbalFaceDetectionPendingRef.current = false;
    }
  }

  function startNonverbalIntegrityListeners(questionId: number) {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    stopNonverbalIntegrityListeners();

    const currentTracker = () => {
      const tracker = recordingNonverbalTrackerRef.current;
      return tracker?.questionId === questionId ? tracker : undefined;
    };
    const handleVisibilityChange = () => {
      const tracker = currentTracker();
      if (!tracker) return;

      if (document.visibilityState === "hidden") {
        if (tracker.tabHiddenStartedAtMs === undefined) {
          tracker.tabHiddenStartedAtMs = Date.now();
          registerEarlyScreenAwaySignal(tracker);
          showRuntimeIntegrityWarning("TAB_HIDDEN");
        }
        return;
      }

      if (tracker.tabHiddenStartedAtMs !== undefined) {
        showRuntimeIntegrityWarning("TAB_HIDDEN");
      }
      closeTimedIntegrityEvent(tracker, "TAB_HIDDEN", tracker.tabHiddenStartedAtMs);
      tracker.tabHiddenStartedAtMs = undefined;
    };
    const handleBlur = () => {
      const tracker = currentTracker();
      if (!tracker) return;
      if (tracker.windowBlurStartedAtMs === undefined) {
        tracker.windowBlurStartedAtMs = Date.now();
        registerEarlyScreenAwaySignal(tracker);
        showRuntimeIntegrityWarning("WINDOW_BLUR");
      }
    };
    const handleFocus = () => {
      const tracker = currentTracker();
      if (!tracker) return;
      if (tracker.windowBlurStartedAtMs !== undefined) {
        showRuntimeIntegrityWarning("WINDOW_BLUR");
      }
      closeTimedIntegrityEvent(tracker, "WINDOW_BLUR", tracker.windowBlurStartedAtMs);
      tracker.windowBlurStartedAtMs = undefined;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    const tracker = currentTracker();
    if (document.visibilityState === "hidden" && tracker) {
      tracker.tabHiddenStartedAtMs = Date.now();
      registerEarlyScreenAwaySignal(tracker);
      showRuntimeIntegrityWarning("TAB_HIDDEN");
    }

    nonverbalIntegrityCleanupRef.current = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }

  function startNonverbalTracking(questionId: number, stream: MediaStream) {
    if (mode !== "mock" && mode !== "recruiting") return;

    stopNonverbalCameraMonitor();
    stopNonverbalIntegrityListeners();
    const tracker: RecordingNonverbalTracker = {
      questionId,
      recordingStartedAtMs: Date.now(),
      cameraWarnings: cameralessTestEntry ? 1 : 0,
      microphoneWarnings: 0,
      longSilenceCount: 0,
      shortAnswerCount: 0,
      testModeUsed: cameralessTestEntry,
      voicePeakLevel: 0,
      lowAudioFrameCount: 0,
      observedAudioFrameCount: 0,
      cameraDisconnectedCount: 0,
      silenceSegmentCounted: false,
      multiplePeoplePositiveSampleTimesMs: [],
      faceDetectionSupported: false,
      faceDetectionFrameCount: 0,
      personDetectionSupported: false,
      personDetectionFrameCount: 0,
      gazeDetectionSupported: false,
      gazeDetectionFrameCount: 0,
      headPoseDetectionSupported: false,
      headPoseDetectionFrameCount: 0,
      gazeCalibrationSampleCount: 0,
      headPoseCalibrationSampleCount: 0,
      faceBaselineSampleCount: 0,
      mouthSyncSupported: false,
      mouthSyncFrameCount: 0,
      mouthSyncMismatchFrameCount: 0,
      videoFrameMotionSupported: false,
      videoFrameSampleCount: 0,
      staticVideoFrameSampleCount: 0,
      audioFramesSinceLastMouthSample: 0,
      speakingAudioFramesSinceLastMouthSample: 0,
      earlyScreenAwayRecorded: false,
      totalAwayDurationMs: 0,
      maxAwayDurationMs: 0,
      integrityEvents: [],
      gazeTimeline: [],
      headPoseTimeline: [],
    };
    if (nonverbalDeviceQaEnabled) {
      const run = createNonverbalDeviceQaRun({
        questionId,
        startedAtMs: tracker.recordingStartedAtMs,
        sampleIntervalMs: NONVERBAL_CAMERA_SAMPLE_INTERVAL_MS,
        environment: collectNonverbalDeviceQaEnvironment(),
        camera: readNonverbalDeviceQaCamera(stream),
      });
      tracker.deviceQa = run;
      nonverbalDeviceQaRunsRef.current.push(run);
      setNonverbalDeviceQaMessage("성능 측정 중입니다. 원하는 QA 시나리오를 선택해 구간을 기록해 주세요.");
      refreshNonverbalDeviceQaSnapshot(run);
    }
    recordingNonverbalTrackerRef.current = tracker;
    startNonverbalIntegrityListeners(questionId);
    startNonverbalVideoFrameMonitor(tracker);
    void getMediaPipePersonDetector();

    const sampleCamera = () => {
      const current = recordingNonverbalTrackerRef.current;
      if (!current || current.questionId !== questionId) return;

      const videoTracks = stream.getVideoTracks();
      const cameraLive = videoTracks.length === 0
        ? cameralessTestEntry
        : videoTracks.some((track) => track.readyState === "live" && track.enabled);
      if (!cameraLive) {
        current.cameraWarnings += 1;
        current.cameraDisconnectedCount += 1;
        if (current.cameraLostStartedAtMs === undefined) {
          current.cameraLostStartedAtMs = Date.now();
          showRuntimeIntegrityWarning("CAMERA_LOST");
        }
        return;
      }

      closeTimedIntegrityEvent(current, "CAMERA_LOST", current.cameraLostStartedAtMs);
      current.cameraLostStartedAtMs = undefined;
      void sampleFaceIntegrity(current, questionId);
    };

    sampleCamera();
    nonverbalCameraMonitorRef.current = window.setInterval(sampleCamera, NONVERBAL_CAMERA_SAMPLE_INTERVAL_MS);
  }

  function registerNonverbalAudioLevel(level: number) {
    const tracker = recordingNonverbalTrackerRef.current;
    if (!tracker) return;

    tracker.observedAudioFrameCount += 1;
    tracker.voicePeakLevel = Math.max(tracker.voicePeakLevel, level);
    tracker.audioFramesSinceLastMouthSample += 1;
    if (level >= NONVERBAL_AUDIO_SPEAKING_LEVEL) {
      tracker.speakingAudioFramesSinceLastMouthSample += 1;
    }

    if (level < MIN_INTERVIEW_RECORDING_VOICE_LEVEL) {
      tracker.lowAudioFrameCount += 1;
      const now = Date.now();
      if (tracker.silenceStartedAtMs === undefined) {
        tracker.silenceStartedAtMs = now;
        tracker.silenceSegmentCounted = false;
      } else if (!tracker.silenceSegmentCounted && now - tracker.silenceStartedAtMs >= REALTIME_SILENCE_GRACE_MS) {
        tracker.longSilenceCount += 1;
        tracker.silenceSegmentCounted = true;
      }
      return;
    }

    tracker.silenceStartedAtMs = undefined;
    tracker.silenceSegmentCounted = false;
  }

  function finishNonverbalTracking(
    questionId: number,
    durationSeconds: number,
  ): InterviewAnswerNonverbalMetadata | undefined {
    stopNonverbalCameraMonitor();
    stopNonverbalVideoFrameMonitor();
    stopNonverbalIntegrityListeners();
    const tracker = recordingNonverbalTrackerRef.current;
    recordingNonverbalTrackerRef.current = null;

    if (!tracker || tracker.questionId !== questionId) return undefined;

    const nowMs = Date.now();
    closeTimedIntegrityEvent(tracker, "TAB_HIDDEN", tracker.tabHiddenStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "WINDOW_BLUR", tracker.windowBlurStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "CAMERA_LOST", tracker.cameraLostStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "FACE_MISSING", tracker.faceMissingStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "FACE_OUT_OF_FRAME", tracker.faceOutOfFrameStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "MULTIPLE_FACES", tracker.multipleFacesStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "FACE_POSITION_SHIFT", tracker.facePositionShiftStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "GAZE_AWAY", tracker.gazeAwayStartedAtMs, nowMs, {
      direction: tracker.lastGazeDirection,
      source: tracker.lastGazeSource,
    });
    closeTimedIntegrityEvent(tracker, "VOICE_MOUTH_MISMATCH", tracker.voiceMouthMismatchStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "VOICE_WITHOUT_FACE", tracker.voiceWithoutFaceStartedAtMs, nowMs);
    closeTimedIntegrityEvent(tracker, "STATIC_VIDEO_FRAME", tracker.staticVideoFrameStartedAtMs, nowMs);
    if (tracker.deviceQa?.activeScenario) {
      const result = finishNonverbalDeviceQaScenario(tracker.deviceQa, tracker.integrityEvents, nowMs);
      setNonverbalDeviceQaMessage(result?.message ?? "진행 중인 QA 시나리오를 종료했습니다.");
    }
    refreshNonverbalDeviceQaSnapshot(tracker.deviceQa);

    const observedFrameCount = tracker.observedAudioFrameCount;
    const lowAudioRatio = observedFrameCount > 0 ? tracker.lowAudioFrameCount / observedFrameCount : 1;
    const microphoneWarnings =
      tracker.microphoneWarnings +
      (recordingVoiceFrameCountRef.current < MIN_INTERVIEW_RECORDING_VOICE_FRAME_COUNT ? 1 : 0) +
      (observedFrameCount > 0 && lowAudioRatio > 0.8 ? 1 : 0);

    return {
      cameraWarnings: tracker.cameraWarnings,
      microphoneWarnings,
      longSilenceCount: tracker.longSilenceCount,
      shortAnswerCount: durationSeconds < NONVERBAL_SHORT_ANSWER_SECONDS ? 1 : 0,
      testModeUsed: tracker.testModeUsed,
      voicePeakLevel: Math.round(Math.max(tracker.voicePeakLevel, recordingVoicePeakRef.current)),
      lowAudioFrameCount: tracker.lowAudioFrameCount,
      observedAudioFrameCount: observedFrameCount,
      cameraDisconnectedCount: tracker.cameraDisconnectedCount,
      integrityEvents: tracker.integrityEvents,
      integritySummary: buildInterviewIntegritySummary(tracker),
      gazeTimeline: tracker.gazeTimeline.length > 0 ? tracker.gazeTimeline : undefined,
      headPoseTimeline: tracker.headPoseTimeline.length > 0 ? tracker.headPoseTimeline : undefined,
    };
  }

  function buildInterviewIntegritySummary(tracker: RecordingNonverbalTracker): InterviewIntegritySummary {
    const tabHiddenCount = tracker.integrityEvents.filter((event) => event.type === "TAB_HIDDEN").length;
    const windowBlurCount = tracker.integrityEvents.filter((event) => event.type === "WINDOW_BLUR").length;
    const cameraLostCount = tracker.integrityEvents.filter((event) => event.type === "CAMERA_LOST").length;
    const faceMissingCount = tracker.integrityEvents.filter((event) => event.type === "FACE_MISSING").length;
    const faceOutOfFrameCount = tracker.integrityEvents.filter((event) => event.type === "FACE_OUT_OF_FRAME").length;
    const multipleFacesCount = tracker.integrityEvents.filter((event) => event.type === "MULTIPLE_FACES").length;
    const facePositionShiftCount = tracker.integrityEvents.filter((event) => event.type === "FACE_POSITION_SHIFT").length;
    const gazeAwayCount = tracker.integrityEvents.filter((event) => event.type === "GAZE_AWAY").length;
    const voiceMouthMismatchCount = tracker.integrityEvents.filter((event) => event.type === "VOICE_MOUTH_MISMATCH").length;
    const voiceWithoutFaceCount = tracker.integrityEvents.filter((event) => event.type === "VOICE_WITHOUT_FACE").length;
    const staticVideoFrameCount = tracker.integrityEvents.filter((event) => event.type === "STATIC_VIDEO_FRAME").length;
    const earlyScreenAwayCount = tracker.integrityEvents.filter((event) => event.type === "EARLY_SCREEN_AWAY").length;
    const screenAwayCount = tabHiddenCount + windowBlurCount;
    const severeAwaySignal = tracker.maxAwayDurationMs >= 5000 || tracker.totalAwayDurationMs >= 10000;
    const faceSignalCount =
      faceMissingCount +
      faceOutOfFrameCount +
      multipleFacesCount +
      facePositionShiftCount +
      gazeAwayCount +
      voiceMouthMismatchCount +
      voiceWithoutFaceCount +
      staticVideoFrameCount +
      earlyScreenAwayCount;
    const integritySignalGroups = [
      screenAwayCount > 0,
      cameraLostCount > 0,
      faceSignalCount > 0,
      tracker.testModeUsed,
    ].filter(Boolean).length;
    const suspicionLevel: InterviewIntegritySuspicionLevel =
      integritySignalGroups >= 2 ||
      tracker.totalAwayDurationMs >= 30000 ||
      multipleFacesCount > 0 ||
      facePositionShiftCount > 0 ||
      voiceMouthMismatchCount > 0 ||
      voiceWithoutFaceCount > 0 ||
      staticVideoFrameCount > 0 ||
      earlyScreenAwayCount > 0
        ? "HIGH"
        : cameraLostCount > 0 ||
            severeAwaySignal ||
            faceMissingCount > 0 ||
            faceOutOfFrameCount > 0 ||
            gazeAwayCount >= 2
          ? "MEDIUM"
          : screenAwayCount > 0 || gazeAwayCount > 0 || tracker.testModeUsed
            ? "LOW"
            : "NONE";

    return {
      screenAwayCount,
      tabHiddenCount,
      windowBlurCount,
      cameraLostCount,
      faceMissingCount,
      faceOutOfFrameCount,
      multipleFacesCount,
      facePositionShiftCount,
      gazeAwayCount,
      voiceMouthMismatchCount,
      voiceWithoutFaceCount,
      staticVideoFrameCount,
      earlyScreenAwayCount,
      faceDetectionSupported: tracker.faceDetectionSupported,
      faceDetectionFrameCount: tracker.faceDetectionFrameCount,
      personDetectionSupported: tracker.personDetectionSupported,
      personDetectionFrameCount: tracker.personDetectionFrameCount,
      gazeDetectionSupported: tracker.gazeDetectionSupported,
      gazeDetectionFrameCount: tracker.gazeDetectionFrameCount,
      headPoseDetectionSupported: tracker.headPoseDetectionSupported,
      headPoseDetectionFrameCount: tracker.headPoseDetectionFrameCount,
      mouthSyncSupported: tracker.mouthSyncSupported,
      mouthSyncFrameCount: tracker.mouthSyncFrameCount,
      mouthSyncMismatchFrameCount: tracker.mouthSyncMismatchFrameCount,
      videoFrameMotionSupported: tracker.videoFrameMotionSupported,
      videoFrameSampleCount: tracker.videoFrameSampleCount,
      staticVideoFrameSampleCount: tracker.staticVideoFrameSampleCount,
      totalAwayDurationMs: Math.round(tracker.totalAwayDurationMs),
      maxAwayDurationMs: Math.round(tracker.maxAwayDurationMs),
      suspicionLevel,
    };
  }

  function startRuntimeCameraQualityMonitor(previewInfo: CameraPreviewInfo, fallbackLabel?: string) {
    stopRuntimeCameraQualityMonitor();
    const video = videoRef.current;
    if (!video) return;

    cameraQualityIntervalRef.current = startCameraQualityMonitor(video, previewInfo, fallbackLabel, (quality, framing, status) => {
      setCameraReady(quality.ok && !framing.blocking);
      setCameraFramingState(framing.state);
      setCameraPreviewStatus(status);
    });
  }

  function startMicrophoneMeter(stream: MediaStream) {
    stopMicrophoneMeter();
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) return;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    const samples = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      samples.forEach((sample) => {
        peak = Math.max(peak, Math.abs(sample - 128));
      });
      const level = Math.min(100, Math.round((peak / 128) * 100));
      microphoneLevelRef.current = level;
      setMicrophoneLevel(level);
      if (recorderRef.current?.state === "recording") {
        recordingVoicePeakRef.current = Math.max(recordingVoicePeakRef.current, level);
        registerNonverbalAudioLevel(level);
        if (level >= MIN_INTERVIEW_RECORDING_VOICE_LEVEL) {
          recordingVoiceFrameCountRef.current += 1;
        }
      }
      microphoneFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  function completeCameralessRuntimeSetup(nextMessage: string) {
    warmUpInterviewAudioOutput();
    stopQuestionSpeech();
    stopRuntimeCameraQualityMonitor();
    stopMicrophoneMeter();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCameraReady(true);
    setCameraFramingState("unsupported");
    setMicrophoneReady(true);
    setMicrophoneLevel(0);
    setNetworkReady(true);
    setCameraPreviewStatus("개발 테스트 모드: 카메라 점검 우회");
    setMicrophoneStatus("개발 테스트 모드: 마이크 점검 우회");
    setNetworkStatus("개발 테스트 모드: 네트워크 점검 우회");
    setCameralessTestEntry(true);
    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setQuestionSpeechPlaying(false);
    setQuestionSpeechStatus("AI 안내 대기");
    setMessage(nextMessage);
    autoRecordingQuestionRef.current = null;
  }

  function moveCameraPip(clientX: number, clientY: number, dragState: CameraPipDragState) {
    const stage = interviewerStageRef.current;
    const pip = cameraPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    setCameraPipPosition(clampCameraPipPosition(
      {
        x: clientX - stageRect.left - dragState.offsetX,
        y: clientY - stageRect.top - dragState.offsetY,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleCameraPipPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (runtimePrimaryScreen !== "interviewer") return;
    if (event.button !== 0) return;

    const stage = interviewerStageRef.current;
    const pip = cameraPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    const dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - pipRect.left,
      offsetY: event.clientY - pipRect.top,
    };

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cameraPipDragRef.current = dragState;
    setCameraPipPosition(clampCameraPipPosition(
      {
        x: pipRect.left - stageRect.left,
        y: pipRect.top - stageRect.top,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleCameraPipPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = cameraPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    moveCameraPip(event.clientX, event.clientY, dragState);
  }

  function handleCameraPipPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = cameraPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already release capture after pointer cancellation.
    }
    cameraPipDragRef.current = null;
  }

  function moveInterviewerPip(clientX: number, clientY: number, dragState: CameraPipDragState) {
    const stage = interviewerStageRef.current;
    const pip = interviewerPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    setInterviewerPipPosition(clampCameraPipPosition(
      {
        x: clientX - stageRect.left - dragState.offsetX,
        y: clientY - stageRect.top - dragState.offsetY,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleInterviewerPipPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (runtimePrimaryScreen !== "candidate") return;
    if (event.button !== 0) return;

    const stage = interviewerStageRef.current;
    const pip = interviewerPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    const dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - pipRect.left,
      offsetY: event.clientY - pipRect.top,
    };

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interviewerPipDragRef.current = dragState;
    setInterviewerPipPosition(clampCameraPipPosition(
      {
        x: pipRect.left - stageRect.left,
        y: pipRect.top - stageRect.top,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleInterviewerPipPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = interviewerPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    moveInterviewerPip(event.clientX, event.clientY, dragState);
  }

  function handleInterviewerPipPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = interviewerPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already release capture after pointer cancellation.
    }
    interviewerPipDragRef.current = null;
  }

  async function handleCameralessRuntimeEntry() {
    if (!data || !ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY) return;

    const testDeviceState = createCameralessInterviewTestDeviceCheckState();
    if (mode === "recruiting" && data.runtime.status !== "IN_PROGRESS") {
      if (!data.runtime.applicationId) {
        setMessage("지원서 정보를 확인할 수 없습니다.");
        return;
      }

      setBusy(true);
      setMessage("");
      try {
        await runtimeApi.saveDeviceCheck(data.runtime.sessionId, toDeviceCheckRequest(testDeviceState));
        await runtimeApi.startInterview(data.runtime.applicationId);
        rememberCameralessInterviewTestEntry("recruiting", data.runtime.sessionId);
        startRuntimeAfterRefreshRef.current = true;
        setMessage("카메라 없이 테스트 모드로 면접 화면으로 이동합니다.");
        void refresh().catch(() => undefined);
      } catch (submitError) {
        startRuntimeAfterRefreshRef.current = false;
        setMessage(toErrorMessage(submitError));
      } finally {
        setBusy(false);
      }
      return;
    }

    completeCameralessRuntimeSetup(
      "카메라 없이 테스트 모드로 면접 화면에 진입했습니다. 녹화와 답변 제출은 장치 연결 후 가능합니다.",
    );
  }

  async function handleEnableCamera(options: { skipQualityCheck?: boolean } = {}) {
    warmUpInterviewAudioOutput();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("이 브라우저에서는 카메라/마이크를 사용할 수 없습니다.");
      return;
    }

    try {
      stopMicrophoneMeter();
      stopRuntimeCameraQualityMonitor();
      stopMediaStream(streamRef.current);
      setCameraReady(false);
      setCameraFramingState("idle");
      setMicrophoneReady(false);
      setCameraPreviewStatus("카메라 연결 중");
      setMicrophoneStatus(`테스트 문장을 읽어주세요. 예: ${deviceTestSentence}`);
      setNetworkStatus("네트워크 확인 중");
      const streamResult = await getCameraMediaStream(selectedCameraId, selectedMicrophoneId);
      const { stream, fallbackLabel } = streamResult;
      streamRef.current = stream;
      setCameralessTestEntry(false);

      let previewInfo: CameraPreviewInfo | undefined;
      if (videoRef.current) {
        previewInfo = await attachMediaStreamToVideo(videoRef.current, stream);
      }
      if (!options.skipQualityCheck) {
        assertCameraPreviewHasFrame(previewInfo);
      }

      const cameraQuality = options.skipQualityCheck
        ? { ok: true, message: "초기 장치 점검 완료" }
        : assessCameraQuality(videoRef.current);
      const cameraFraming = options.skipQualityCheck
        ? { state: "unsupported" as const, blocking: false, message: "초기 장치 점검 결과를 사용합니다." }
        : getCameraFramingNotice();
      const microphoneQuality = streamResult.audioEnabled
        ? options.skipQualityCheck
          ? { ok: true, peakLevel: 0, message: "초기 장치 점검 완료" }
          : await measureMicrophoneQuality(stream, setMicrophoneLevel)
        : { ok: false, peakLevel: 0, message: formatMicrophoneStatus(streamResult) };
      const networkQuality = options.skipQualityCheck
        ? { ok: true, message: "초기 장치 점검 결과를 사용합니다." }
        : await checkInterviewNetworkQuality();
      const cameraOk = options.skipQualityCheck ? isCameraTrackReady(stream) : cameraQuality.ok && !cameraFraming.blocking;
      const microphoneOk = streamResult.audioEnabled && isMicrophoneTrackReady(stream);
      setCameraReady(cameraOk);
      setCameraFramingState(cameraFraming.state);
      setMicrophoneReady(microphoneOk);
      setNetworkReady(networkQuality.ok);
      setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, fallbackLabel, cameraQuality, cameraFraming));
      setMicrophoneStatus(
        streamResult.audioEnabled ? formatMicrophoneQualityStatus(streamResult, microphoneQuality) : microphoneQuality.message,
      );
      setNetworkStatus(networkQuality.message);
      if (!options.skipQualityCheck && previewInfo) {
        startRuntimeCameraQualityMonitor(previewInfo, fallbackLabel);
      }
      if (streamResult.audioEnabled) {
        startMicrophoneMeter(stream);
      } else {
        setMicrophoneLevel(0);
      }
      await refreshCameraDevices();
      setMessage(
        fallbackLabel
          ? `카메라가 연결되었습니다. ${fallbackLabel}`
          : cameraOk && microphoneOk && networkQuality.ok
            ? "카메라 밝기, 마이크 입력, 네트워크 상태가 적정합니다."
            : "장치 점검 기준을 통과하지 못했습니다. 안내에 따라 카메라 위치, 조명, 마이크 입력을 조정해주세요.",
      );
    } catch (cameraError) {
      setCameraReady(false);
      setCameraFramingState("idle");
      setNetworkReady(false);
      stopRuntimeCameraQualityMonitor();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      stopMicrophoneMeter();
      const errorMessage = formatMediaError(cameraError);
      const microphoneProbe = await probeMicrophone(selectedMicrophoneId);
      setCameraPreviewStatus(`카메라 연결 실패: ${errorMessage}`);
      setMicrophoneReady(microphoneProbe.ok);
      setMicrophoneStatus(formatMicrophoneProbeStatus(microphoneProbe));
      const networkQuality = await checkInterviewNetworkQuality();
      setNetworkReady(networkQuality.ok);
      setNetworkStatus(networkQuality.message);
      setMessage(
        microphoneProbe.ok
          ? `${errorMessage} 마이크는 연결되지만 녹화를 위해 카메라 권한도 필요합니다.`
          : `${errorMessage} ${formatMicrophoneProbeStatus(microphoneProbe)}`,
      );
    }
  }

  useEffect(() => {
    if (!data || data.runtime.status !== "IN_PROGRESS" || !setupCompleted || streamRef.current || cameraReady || microphoneReady) {
      return;
    }

    void handleEnableCamera({ skipQualityCheck: mode === "recruiting" });
    // Runtime camera binding should run once after the interview screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.runtime.sessionId, setupCompleted]);

  async function handleEnterInterview() {
    warmUpInterviewAudioOutput();
    if (!data) return;
    if (!streamRef.current || !cameraReady || !microphoneReady || !networkReady) {
      await handleEnableCamera({ skipQualityCheck: mode === "recruiting" });
    }

    const stream = streamRef.current;
    const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    if (!hasLiveVideo || !hasLiveAudio || !networkReady) {
      setMessage("카메라, 마이크, 네트워크 점검을 완료한 뒤 면접을 시작해주세요.");
      return;
    }

    if (mode === "recruiting" && data.runtime.status !== "IN_PROGRESS") {
      if (!data.runtime.applicationId) {
        setMessage("지원서 정보를 확인할 수 없습니다.");
        return;
      }

      setBusy(true);
      setMessage("");
      try {
        const api = runtimeApi;
        await api.saveDeviceCheck(
          data.runtime.sessionId,
          toDeviceCheckRequest({
            cameraGranted: true,
            microphoneGranted: true,
            networkStable: networkReady,
          }),
        );
        await api.startInterview(data.runtime.applicationId);
        startRuntimeAfterRefreshRef.current = true;
        setMessage("장치 점검이 완료되었습니다. 면접 화면으로 이동합니다.");
        void refresh().catch(() => undefined);
      } catch (submitError) {
        startRuntimeAfterRefreshRef.current = false;
        setMessage(toErrorMessage(submitError));
      } finally {
        setBusy(false);
      }
      return;
    }

    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setMessage("면접이 시작되었습니다. AI 안내 후 답변 녹화가 자동으로 진행됩니다.");
    autoRecordingQuestionRef.current = null;
  }

  async function startRealtimeSttRelayForRecording(stream: MediaStream, questionId: number) {
    if (!REALTIME_STT_RELAY_ENABLED) return;
    if (!stream.getAudioTracks().some((track) => track.readyState === "live")) return;

    discardRealtimeSttRelay();
    realtimeSttTranscriptByQuestionRef.current.delete(questionId);
    try {
      realtimeSttRelayRef.current = await createRealtimeSttRelaySession({
        mode,
        sessionId: data?.runtime.sessionId ?? 0,
        stream,
        publicAccessToken: readPublicInterviewAccessToken(),
        onMetric: (metric) => recordRealtimeSttRelayMetric(questionId, metric),
      });
    } catch (relayError) {
      realtimeSttRelayRef.current = null;
      recordRealtimeSttRelayMetric(questionId, {
        eventName: "REALTIME_STT_ERROR",
        durationMs: 0,
        metadata: {
          stage: "browser_audio_worklet",
          message: relayError instanceof Error ? relayError.message : "Realtime STT audio capture failed.",
        },
      });
    }
  }

  async function finishRealtimeSttRelay(questionId: number): Promise<string | undefined> {
    const relay = realtimeSttRelayRef.current;
    realtimeSttRelayRef.current = null;
    if (!relay) return undefined;

    try {
      const transcript = (await relay.stopAndGetTranscript())?.trim();
      if (transcript) {
        realtimeSttTranscriptByQuestionRef.current.set(questionId, transcript);
        return transcript;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  function discardRealtimeSttRelay() {
    realtimeSttRelayRef.current?.discard();
    realtimeSttRelayRef.current = null;
  }

  function attachRealtimeTranscriptToRequest(request: SaveInterviewAnswerRequest): SaveInterviewAnswerRequest {
    const transcript = request.transcript?.trim() || realtimeSttTranscriptByQuestionRef.current.get(request.questionId)?.trim();
    return transcript ? { ...request, transcript } : request;
  }

  function recordRealtimeSttRelayMetric(questionId: number, metric: RealtimeSttRelayMetric) {
    if (!data) return;
    void sendClientPerformanceLog({
      eventName: metric.eventName,
      durationMs: Math.max(0, Math.round(metric.durationMs)),
      sessionId: data.runtime.sessionId,
      applicationId: data.runtime.applicationId,
      questionId,
      metadata: {
        mode,
        sourceQuestionId: questionId,
        ...metric.metadata,
      },
    });
  }

  async function handleStartRecording() {
    if (!data || !currentQuestion) return;
    if (!questionSpeechCompleted || questionSpeechPlaying || timerPhase !== "ANSWERING") {
      setMessage("질문 음성 안내가 끝난 뒤 녹화를 시작해주세요.");
      return;
    }
    if (!data.runtime.canRecord) {
      setMessage("이 세션은 녹화를 시작할 수 없는 상태입니다.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setMessage("이 브라우저에서는 녹화를 사용할 수 없습니다.");
      return;
    }
    if (cameralessTestEntry && !streamRef.current) {
      setMessage("카메라 없이 테스트 모드에서는 면접 화면 확인만 가능합니다. 녹화와 제출은 장치 연결 후 진행해주세요.");
      return;
    }

    if (!streamRef.current) {
      await handleEnableCamera({ skipQualityCheck: mode === "recruiting" });
    }

    const stream = streamRef.current;
    if (!stream) return;
    if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
      setMessage("마이크가 연결되지 않았습니다. 마이크 장치를 선택한 뒤 카메라 점검을 다시 눌러주세요.");
      setMicrophoneReady(false);
      return;
    }

    let realtimeMicrophoneOpenedForRecording = false;
    try {
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingVoicePeakRef.current = 0;
      recordingVoiceFrameCountRef.current = 0;
      recordingStartedAtRef.current = Date.now();
      timeExpiredQuestionRef.current = null;
      startNonverbalTracking(currentQuestion.questionId, stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setRealtimeMicrophoneOpen(false);
        const recordedMimeType = resolveRecordedMimeType({
          chunkMimeTypes: recordingChunksRef.current.map((chunk) => chunk instanceof Blob ? chunk.type : ""),
          recorderMimeType: recorder.mimeType,
          requestedMimeType: mimeType,
        });
        const blob = new Blob(recordingChunksRef.current, { type: recordedMimeType });
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const nonverbalMetadata = finishNonverbalTracking(currentQuestion.questionId, durationSeconds);
        const fileName = `${mode}-answer-${data.runtime.sessionId}-${currentQuestion.questionId}.${getInterviewMediaFileExtension(recordedMimeType)}`;

        if (durationSeconds < MIN_INTERVIEW_RECORDING_DURATION_SECONDS) {
          handleInvalidRecordingResult(
            currentQuestion.questionId,
            nonverbalMetadata,
            `답변 녹음이 너무 짧습니다. 최소 ${MIN_INTERVIEW_RECORDING_DURATION_SECONDS}초 이상 답변한 뒤 다시 제출해주세요.`,
          );
          return;
        }

        if (blob.size < MIN_INTERVIEW_RECORDING_BLOB_SIZE_BYTES) {
          handleInvalidRecordingResult(
            currentQuestion.questionId,
            nonverbalMetadata,
            "녹음 파일이 너무 작아 저장되지 않았습니다. 마이크 입력을 확인한 뒤 다시 답변해주세요.",
          );
          return;
        }

        if (!hasMeaningfulInterviewRecordingVoice({
          peakLevel: recordingVoicePeakRef.current,
          activeFrameCount: recordingVoiceFrameCountRef.current,
          minPeakLevel: MIN_INTERVIEW_RECORDING_VOICE_LEVEL,
          minActiveFrameCount: MIN_INTERVIEW_RECORDING_VOICE_FRAME_COUNT,
        })) {
          handleInvalidRecordingResult(
            currentQuestion.questionId,
            nonverbalMetadata,
            "마이크에서 답변 음성이 감지되지 않았습니다. 마이크 상태를 확인하고 다시 답변해주세요.",
          );
          return;
        }

        const videoFile = createRuntimeFileAssetFromMetadata(fileName, recordedMimeType, blob.size);

        if (!videoFile) {
          discardRealtimeSttRelay();
          setMessage("지원하지 않는 녹화 파일 형식입니다.");
          setRecording(false);
          return;
        }

        cacheRecordedInterviewBlob(videoFile, blob);
        lastInvalidRecordingMetadataRef.current.delete(currentQuestion.questionId);
        await finishRealtimeSttRelay(currentQuestion.questionId);

        setAnswer((current) => ({
          ...current,
          questionId: currentQuestion.questionId,
          durationSeconds,
          videoFile,
          videoFileId: undefined,
          audioFile: undefined,
          audioFileId: undefined,
          nonverbalMetadata,
        }));
        setRecordedFileName(fileName);
        setRecording(false);
        if (submitAfterRecordingStopRef.current) {
          submitAfterRecordingStopRef.current = false;
          void submitAnswerRequest(
            withReanswerFlag(toSaveInterviewAnswerRequest({
              questionId: currentQuestion.questionId,
              durationSeconds,
              videoFile,
              nonverbalMetadata,
            })),
            currentQuestion,
            "answer_complete_button",
          );
          return;
        }
        setMessage("녹화가 준비되었습니다. 답변 제출을 눌러 저장하세요.");
      };

      realtimeMicrophoneOpenedForRecording = shouldOpenRealtimeMicrophoneForRecordingStart({
        realtimeSpeechReady,
        questionSpeechCompleted,
        questionSpeechPlaying,
        timerPhase,
      });
      if (realtimeMicrophoneOpenedForRecording) {
        setRealtimeMicrophoneOpen(true);
      }
      await startRealtimeSttRelayForRecording(stream, currentQuestion.questionId);
      recorder.start();
      setRecordedFileName("");
      setRecording(true);
      appendInterviewerSessionActionEvent({
        action: "recording:start",
        phase: "USER_SPEAKING",
        label: "답변 녹화 시작",
        questionId: currentQuestion.questionId,
      });
      setMessage("녹화 중입니다. 답변을 마치면 녹화 종료를 눌러주세요.");
    } catch (recordError) {
      discardRealtimeSttRelay();
      if (realtimeMicrophoneOpenedForRecording) {
        setRealtimeMicrophoneOpen(false);
      }
      stopNonverbalCameraMonitor();
      stopNonverbalIntegrityListeners();
      recordingNonverbalTrackerRef.current = null;
      setRecording(false);
      setMessage(toErrorMessage(recordError));
    }
  }

  function handleStopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      setRealtimeMicrophoneOpen(false);
      recorder.stop();
      return;
    }
    setRealtimeMicrophoneOpen(false);
    setRecording(false);
  }

  function handleInvalidRecordingResult(
    questionId: number,
    nonverbalMetadata: InterviewAnswerNonverbalMetadata | undefined,
    message: string,
  ) {
    if (nonverbalMetadata) {
      lastInvalidRecordingMetadataRef.current.set(questionId, nonverbalMetadata);
    }
    discardRealtimeSttRelay();

    if (autoAdvanceAfterAnswerSubmitRef.current) {
      clearAnswerSubmitToNextReadyMetric(questionId);
      submitAfterRecordingStopRef.current = false;
      autoAdvanceAfterAnswerSubmitRef.current = false;
      setRecording(false);
      void submitSkippedAnswerAndMoveNext(questionId, message);
      return;
    }

    clearInvalidRecordingDraft(questionId, message);
  }

  function clearGazeInvalidRecordingDraft(questionId: number) {
    clearAnswerSubmitToNextReadyMetric(questionId);
    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    realtimeSttTranscriptByQuestionRef.current.delete(questionId);
    lastInvalidRecordingMetadataRef.current.delete(questionId);
    setGazeRetakeQuestionId(questionId);
    setRecordedFileName("");
    setAnswer((current) => ({
      ...current,
      questionId,
      durationSeconds: 0,
      videoFile: undefined,
      videoFileId: undefined,
      audioFile: undefined,
      audioFileId: undefined,
      nonverbalMetadata: undefined,
    }));
    setRecording(false);
    autoRecordingQuestionRef.current = questionId;
    timeExpiredQuestionRef.current = null;
    setTimerPhase("ANSWERING");
    setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
    setMessage("");
  }

  function clearInvalidRecordingDraft(questionId: number, message: string) {
    const retryCount = invalidRecordingRetryCountsRef.current.get(questionId) ?? 0;
    const nextRetryCount = retryCount + 1;
    const gazeRetakeActive = gazeRetakeQuestionId === questionId;
    const recoveryAction = getInvalidRecordingRecoveryAction({
      failedAttemptCount: nextRetryCount,
      maxAutoRetryCount: MAX_INVALID_RECORDING_AUTO_RETRY_COUNT,
      gazeRetakeRequired: gazeRetakeActive,
    });
    if (gazeRetakeActive) {
      clearGazeInvalidRecordingDraft(questionId);
      return;
    }

    invalidRecordingRetryCountsRef.current.set(questionId, nextRetryCount);

    clearAnswerSubmitToNextReadyMetric(questionId);
    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    setRecordedFileName("");
    setAnswer((current) => ({
      ...current,
      questionId,
      durationSeconds: 0,
      videoFile: undefined,
      videoFileId: undefined,
      audioFile: undefined,
      audioFileId: undefined,
      nonverbalMetadata: undefined,
    }));
    setRecording(false);

    if (recoveryAction === "retry") {
      autoRecordingQuestionRef.current = questionId;
      timeExpiredQuestionRef.current = null;
      setTimerPhase("ANSWERING");
      setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
      setMessage(`${message} 한 번 더 녹음 기회를 드릴게요. 녹화 시작을 눌러 다시 답변해주세요.`);
      return;
    }

    void submitSkippedAnswerAndMoveNext(questionId, message);
  }

  async function submitSkippedAnswerAndMoveNext(questionId: number, reasonMessage: string) {
    if (!data) return;

    setBusy(true);
    setMessage("녹음 품질 문제로 현재 질문을 미답변 처리하고 다음 질문으로 이동합니다.");
    try {
      const api = runtimeApi;
      const skippedNonverbalMetadata = lastInvalidRecordingMetadataRef.current.get(questionId);
      const skipRequest = toRecordingValidationSkipRequest({
        questionId,
        retryAnswerId,
        nonverbalMetadata: skippedNonverbalMetadata,
      });
      const result = await (mode === "mock"
        ? api.saveMockAnswer(data.runtime.sessionId, skipRequest)
        : api.saveRecruitingAnswer(data.runtime.sessionId, skipRequest));
      const skippedQuestion =
        data.questions.questions.find((candidateQuestion) => candidateQuestion.questionId === questionId) ?? currentQuestion;

      setAnsweredQuestionIds((current) => {
        const next = new Set(current);
        next.add(questionId);
        return next;
      });
      setLastAnswer({
        answerId: result.data.answer.answerId,
        questionId,
        questionText: skippedQuestion?.content ?? skippedQuestion?.audioPrompt ?? "이전 질문",
        transcript: "녹음 품질 문제로 미답변 처리되었습니다.",
        durationSeconds: result.data.answer.durationSeconds ?? 0,
      });
      setAutoAiPipeline({
        answerId: result.data.answer.answerId,
        sttStatus: "IDLE",
        followUpStatus: "IDLE",
        followUpSkipped: true,
      });
      setRetryAnswerId(undefined);
      setRetryingQuestionId(undefined);
      lastInvalidRecordingMetadataRef.current.delete(questionId);
      applyAuthoritativeQuestionTransition(questionId, result.data.currentQuestion, result.data.completionReady);
      prepareAuthoritativeNextQuestion(result.data.currentQuestion);
      if (result.data.completionReady) {
        setMessage(`${reasonMessage} 현재 질문은 미답변 처리되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요.`);
        return;
      }
      setMessage(`${reasonMessage} 현재 질문은 미답변 처리하고 다음 질문으로 이동했습니다.`);
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  function handleReplayPrompt() {
    if (!currentQuestion || currentQuestionReplayUsed || !questionSpeechSupported) return;
    warmUpInterviewAudioOutput();
    setReplayedQuestionIds((current) => {
      const next = new Set(current);
      next.add(currentQuestion.questionId);
      return next;
    });
    speakCurrentQuestion("manual");
  }

  async function submitAnswerRequest(
    request: SaveInterviewAnswerRequest,
    question = currentQuestion,
    metricOrigin = "answer_submit",
  ) {
    if (!data) return;
    if (savingQuestionIdsRef.current.has(request.questionId)) {
      setMessage("답변 저장이 이미 진행 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!request.allowReanswer && !retryAnswerId && isQuestionAlreadyAnswered(request.questionId)) {
      setMessage("이미 저장된 답변입니다. 질문 상태를 새로고침합니다.");
      void refresh().catch(() => undefined);
      return;
    }
    savingQuestionIdsRef.current.add(request.questionId);
    beginAnswerSubmitToNextReadyMetric(request.questionId, metricOrigin);
    setBusy(true);
    setMessage("");
    try {
      const api = runtimeApi;
      const requestWithTranscript = attachRealtimeTranscriptToRequest(request);
      const requestWithRetry =
        retryAnswerId && question?.questionId === request.questionId
          ? { ...requestWithTranscript, retryAnswerId }
          : requestWithTranscript;
      const preparedRequest = await prepareAnswerRequestWithUploadedMedia(api, data.runtime.sessionId, requestWithRetry);
      const result =
        mode === "mock"
          ? await api.saveMockAnswer(data.runtime.sessionId, preparedRequest)
          : await api.saveRecruitingAnswer(data.runtime.sessionId, preparedRequest);
      setGazeRetakeQuestionId((current) => current === preparedRequest.questionId ? null : current);
      realtimeSttTranscriptByQuestionRef.current.delete(preparedRequest.questionId);
      const audioFileId = result.data.audioFile?.fileId ?? result.data.answer.audioFileId;
      const videoFileId = result.data.videoFile?.fileId ?? result.data.answer.videoFileId;
      const answerFileAssetId = audioFileId ?? videoFileId;
      const savedAnswer: LastSavedAnswer = {
        answerId: result.data.answer.answerId,
        questionId: result.data.answer.questionId,
        questionText: question?.content ?? question?.audioPrompt ?? "이전 질문",
        transcript: `${formatQuestionTypeLabel(question?.questionType)} 답변 파일이 저장되었습니다.`,
        durationSeconds: result.data.answer.durationSeconds,
        fileAssetId: answerFileAssetId,
        audioFileId,
        audioS3Key: result.data.audioFile?.storageKey,
        videoFileId,
        videoS3Key: result.data.videoFile?.storageKey,
      };
      if (preparedRequest.transcript) {
        savedAnswer.transcript = preparedRequest.transcript;
        savedAnswer.transcriptSource = "OPENAI_REALTIME_STT_RELAY";
      }
      setLastAnswer(savedAnswer);
      setAutoAiPipeline({
        answerId: savedAnswer.answerId,
        sttStatus: savedAnswer.transcriptSource === "OPENAI_REALTIME_STT_RELAY" ? "COMPLETED" : "PENDING",
        followUpStatus: "IDLE",
        transcript: savedAnswer.transcriptSource === "OPENAI_REALTIME_STT_RELAY" ? savedAnswer.transcript : undefined,
      });
      if (preparedRequest.allowReanswer || preparedRequest.retryAnswerId) {
        setReansweringQuestionId(null);
        setReansweredQuestionIds((current) => {
          const next = new Set(current);
          next.add(preparedRequest.questionId);
          return next;
        });
      }
      markQuestionAnswered(preparedRequest.questionId);
      const shouldPrepareFollowUp = shouldDeferQuestionTransitionForFollowUp(question?.questionType);
      if (shouldPrepareFollowUp) {
        stopQuestionSpeech();
        setQuestionSpeechStatus("답변 분석 중");
      } else {
        applyAuthoritativeQuestionTransition(
          preparedRequest.questionId,
          result.data.currentQuestion,
          result.data.completionReady,
        );
        prepareAuthoritativeNextQuestion(result.data.currentQuestion);
      }
      setRetryAnswerId(undefined);
      setRetryingQuestionId(undefined);
      const shouldAutoAdvance = autoAdvanceAfterAnswerSubmitRef.current;
      autoAdvanceAfterAnswerSubmitRef.current = false;
      setMessage(
        shouldPrepareFollowUp
          ? "답변이 저장되었습니다. 답변에 이어질 꼬리질문을 준비하고 있습니다."
          : result.data.completionReady
          ? "답변이 저장되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요."
          : "답변이 저장되었습니다. 다음 질문으로 이동했습니다.",
      );
      void runAutomaticAiPipeline(
        savedAnswer,
        question,
        getInterviewAiPollingPolicy({ timedAutoAdvance: shouldAutoAdvance }),
      );
    } catch (submitError) {
      autoAdvanceAfterAnswerSubmitRef.current = false;
      completeAnswerSubmitToNextReadyMetric({
        questionId: request.questionId,
        outcome: "ANSWER_SAVE_FAILED",
        nextReady: false,
      });
      if (isQuestionStateConflict(submitError)) {
        setMessage("답변은 이미 반영된 상태입니다. 질문 상태를 새로고침합니다.");
        void refresh().catch(() => undefined);
        return;
      }
      if (isInterviewGazeDataInvalidError(submitError)) {
        clearGazeInvalidRecordingDraft(request.questionId);
        return;
      }
      setMessage(toErrorMessage(submitError));
    } finally {
      savingQuestionIdsRef.current.delete(request.questionId);
      setBusy(false);
    }
  }

  async function handleSaveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitAnswer) {
      setMessage("녹화 종료 후 답변 제출을 눌러주세요.");
      return;
    }
    await submitAnswerRequest(withReanswerFlag(toSaveInterviewAnswerRequest(answer)), currentQuestion, "answer_form_submit");
  }

  function handleAnswerComplete() {
    if (currentQuestionLocked) {
      setMessage("이미 저장된 답변입니다. 다음 질문으로 이동해주세요.");
      return;
    }

    if (!currentQuestionStateReady) {
      setMessage("다음 질문을 준비하고 있습니다. 잠시만 기다려주세요.");
      return;
    }

    if (!questionSpeechCompleted || questionSpeechPlaying) {
      setMessage("질문 음성 안내가 끝난 뒤 답변해주세요.");
      return;
    }

    if (recording) {
      if (currentQuestion) {
        beginAnswerSubmitToNextReadyMetric(currentQuestion.questionId, "answer_complete_button");
      }
      submitAfterRecordingStopRef.current = true;
      handleStopRecording();
      return;
    }

    if (canSubmitAnswer) {
      if (currentQuestion) {
        beginAnswerSubmitToNextReadyMetric(currentQuestion.questionId, "answer_complete_button");
      }
      void submitAnswerRequest(withReanswerFlag(toSaveInterviewAnswerRequest(answer)), currentQuestion, "answer_complete_button");
      return;
    }

    if (canStartManualRecording) {
      void handleStartRecording();
      return;
    }

    setMessage("답변 녹화가 아직 준비되지 않았습니다.");
  }

  function withReanswerFlag(request: SaveInterviewAnswerRequest): SaveInterviewAnswerRequest {
    return request;
  }

  function handleStartReanswer(question: RuntimeQuestionView | undefined) {
    if (!question?.answerId) return;
    stopQuestionSpeech();
    setRetryAnswerId(question.answerId);
    setRetryingQuestionId(question.questionId);
    setReansweringQuestionId(question.questionId);
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      next.delete(question.questionId);
      answeredQuestionIdsRef.current = next;
      return next;
    });
    updateData((current) => ({
      ...current,
      runtime: {
        ...current.runtime,
        currentQuestion: question,
      },
      questions: {
        ...current.questions,
        currentQuestionId: question.questionId,
        questions: current.questions.questions.map((candidate) => ({
          ...candidate,
          current: candidate.questionId === question.questionId,
        })),
      },
    }));
    setAnswer({ ...defaultInterviewAnswerFormState, questionId: question.questionId });
    setRecordedFileName("");
    setQuestionSpeechCompleted(true);
    setQuestionSpeechPlaying(false);
    setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
    timeExpiredQuestionRef.current = null;
    autoRecordingQuestionRef.current = null;
    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    setMessage(question.sttFailureReason ?? "음성 인식에 실패해 같은 질문에 한 번 더 답변할 수 있습니다.");
  }

  async function syncRuntimeAfterFollowUpDecision() {
    setRuntimeQuestionSyncRequired(true);
    try {
      await refresh();
    } finally {
      setRuntimeQuestionSyncRequired(false);
    }
  }

  async function runAutomaticAiPipeline(
    savedAnswer: LastSavedAnswer,
    question = currentQuestion,
    pollingPolicy = getInterviewAiPollingPolicy({ timedAutoAdvance: false }),
  ) {
    if (!data) return;

    setPendingAiPipelineCount((count) => count + 1);
    let sttProcessLogId: number | undefined;
    let followUpProcessLogId: number | undefined;

    try {
      const realtimeTranscript =
        savedAnswer.transcriptSource === "OPENAI_REALTIME_STT_RELAY"
          ? savedAnswer.transcript.trim()
          : "";
      if (realtimeTranscript) {
        const transcriptRetryReason = getInterviewTranscriptRetryReason(realtimeTranscript);
        const answerWithTranscript = { ...savedAnswer, transcript: realtimeTranscript };
        if (transcriptRetryReason) {
          setLastAnswer(answerWithTranscript);
          setAutoAiPipeline((current) => ({
            answerId: savedAnswer.answerId,
            ...current,
            sttStatus: "COMPLETED",
            followUpStatus: "FAILED",
            transcript: realtimeTranscript,
            error: transcriptRetryReason,
          }));
          setMessage(`${transcriptRetryReason} 다시 답변하기를 눌러 현재 질문을 다시 녹음해주세요.`);
          completeAnswerSubmitToNextReadyMetric({
            questionId: savedAnswer.questionId,
            outcome: "REALTIME_STT_TRANSCRIPT_REANSWER_REQUIRED",
            nextReady: false,
          });
          return;
        }

        const isFollowUpAnswer = question?.questionType === "FOLLOW_UP";
        setLastAnswer(answerWithTranscript);
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: isFollowUpAnswer ? "IDLE" : "PENDING",
          transcript: realtimeTranscript,
          failureCategory: undefined,
          failureReason: undefined,
          failureRetryable: undefined,
          error: undefined,
        }));

        if (isFollowUpAnswer) {
          const questionIndex = question
            ? data.questions.questions.findIndex((candidateQuestion) => candidateQuestion.questionId === question.questionId)
            : -1;
          const isLastFollowUpQuestion = questionIndex >= 0
            ? questionIndex >= data.runtime.totalQuestions - 1
            : false;
          setMessage(
            isLastFollowUpQuestion
              ? "마지막 답변 처리가 완료되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요."
              : "답변 처리가 완료되었습니다. 다음 질문으로 이동해주세요.",
          );
          completeAnswerSubmitToNextReadyMetric({
            questionId: savedAnswer.questionId,
            outcome: isLastFollowUpQuestion ? "INTERVIEW_COMPLETE_READY" : "NEXT_QUESTION_READY",
            nextReady: true,
          });
          return;
        }

        const followUpHandoff = await requestAiPipeline("FOLLOW_UP", answerWithTranscript);
        followUpProcessLogId = followUpHandoff.processLogId;
        if (!followUpProcessLogId) {
          setAutoAiPipeline((current) => ({
            answerId: savedAnswer.answerId,
            ...current,
            sttStatus: "COMPLETED",
            followUpStatus: "FAILED",
            error: "꼬리질문 작업 ID를 받지 못했습니다.",
          }));
          completeAnswerSubmitToNextReadyMetric({
            questionId: savedAnswer.questionId,
            outcome: "REALTIME_STT_FOLLOW_UP_HANDOFF_MISSING",
            nextReady: false,
          });
          return;
        }

        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: "RUNNING",
          followUpProcessLogId,
          error: undefined,
        }));

        const followUpStatus = await pollAiJobUntilSettled(followUpProcessLogId, pollingPolicy);
        if (followUpStatus.status !== "COMPLETED") {
          const shouldSkipFollowUp = shouldContinueInterviewWithoutFollowUp({
            failureCategory: followUpStatus.failure?.category,
          });
          setAutoAiPipeline((current) => ({
            answerId: savedAnswer.answerId,
            ...current,
            sttStatus: "COMPLETED",
            followUpStatus: shouldSkipFollowUp ? "IDLE" : followUpStatus.status === "FAILED" ? "FAILED" : "RUNNING",
            followUpSkipped: shouldSkipFollowUp,
            error: shouldSkipFollowUp
              ? undefined
              : followUpStatus.status === "FAILED"
              ? followUpStatus.failure?.reason ?? "꼬리질문 생성에 실패했습니다."
              : undefined,
          }));
          if (shouldSkipFollowUp) {
            await syncRuntimeAfterFollowUpDecision();
          }
          completeAnswerSubmitToNextReadyMetric({
            questionId: savedAnswer.questionId,
            processLogId: followUpProcessLogId,
            followUpProcessLogId,
            outcome: shouldSkipFollowUp ? "REALTIME_STT_FOLLOW_UP_FAILED_CONTINUE" : "REALTIME_STT_FOLLOW_UP_FAILED_BLOCKED",
            nextReady: shouldSkipFollowUp,
          });
          return;
        }

        const followUpQuestion =
          extractAiJobText(followUpStatus.output, ["content", "followUpQuestion", "question"]) ??
          extractAiJobText(followUpStatus.outputRef, ["content", "followUpQuestion", "question"]);
        const followUpRequired =
          extractAiJobBoolean(followUpStatus.output, "followUpRequired") ??
          extractAiJobBoolean(followUpStatus.outputRef, "followUpRequired") ??
          Boolean(followUpQuestion);

        await syncRuntimeAfterFollowUpDecision();
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: "COMPLETED",
          followUpProcessLogId,
          followUpQuestion: followUpRequired ? followUpQuestion : undefined,
          followUpSkipped: !followUpRequired,
          error: followUpRequired && !followUpQuestion ? "꼬리질문 결과에서 content를 찾지 못했습니다." : undefined,
        }));

        setMessage(
          followUpRequired && followUpQuestion
            ? "답변에 이어질 꼬리질문이 바로 다음 질문으로 준비되었습니다."
            : "답변 처리가 완료되었습니다. 다음 기본 질문을 계속 진행해주세요.",
        );
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: followUpProcessLogId,
          followUpProcessLogId,
          outcome: followUpRequired ? "REALTIME_STT_FOLLOW_UP_READY" : "REALTIME_STT_FOLLOW_UP_SKIPPED",
          nextReady: true,
        });
        return;
      }

      const sttHandoff = await requestAiPipeline("STT", savedAnswer);
      sttProcessLogId = sttHandoff.processLogId;
      if (!sttProcessLogId) {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "FAILED",
          followUpStatus: "IDLE",
          failureCategory: undefined,
          failureReason: undefined,
          failureRetryable: undefined,
          error: "STT 작업 ID를 받지 못했습니다.",
        }));
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          outcome: "STT_HANDOFF_MISSING",
          nextReady: false,
        });
        return;
      }

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: "RUNNING",
        followUpStatus: "IDLE",
        sttProcessLogId,
        failureCategory: undefined,
        failureReason: undefined,
        failureRetryable: undefined,
        error: undefined,
      }));

      const sttStatus = await pollAiJobUntilSettled(sttProcessLogId, pollingPolicy);
      if (sttStatus.status !== "COMPLETED") {
        const shouldSkipFollowUp = shouldContinueInterviewWithoutFollowUp({
          failureCategory: sttStatus.failure?.category,
        });
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "FAILED",
          followUpStatus: "IDLE",
          followUpSkipped: shouldSkipFollowUp,
          failureCategory: sttStatus.failure?.category,
          failureReason: sttStatus.failure?.reason,
          failureRetryable: sttStatus.failure?.retryable,
          error: shouldSkipFollowUp
            ? undefined
            : sttStatus.status === "FAILED"
            ? sttStatus.failure?.reason ?? "STT 처리에 실패했습니다."
            : "STT 처리가 아직 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.",
        }));
        if (shouldSkipFollowUp) {
          await syncRuntimeAfterFollowUpDecision();
        }
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: sttProcessLogId,
          sttProcessLogId,
          outcome: shouldSkipFollowUp ? "STT_FAILED_CONTINUE" : "STT_FAILED_BLOCKED",
          nextReady: shouldSkipFollowUp,
        });
        return;
      }

      const transcript =
        extractAiJobText(sttStatus.output, ["transcript"]) ??
        extractAiJobText(sttStatus.outputRef, ["transcript"]);
      if (!transcript?.trim()) {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: "IDLE",
          followUpSkipped: true,
          sttProcessLogId,
          error: "STT 결과에서 transcript를 찾지 못했습니다.",
        }));
        await syncRuntimeAfterFollowUpDecision();
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: sttProcessLogId,
          sttProcessLogId,
          outcome: "STT_EMPTY_TRANSCRIPT",
          nextReady: true,
        });
        return;
      }

      const normalizedTranscript = transcript.trim();
      const transcriptRetryReason = getInterviewTranscriptRetryReason(normalizedTranscript);
      if (transcriptRetryReason) {
        const answerWithTranscript = { ...savedAnswer, transcript: normalizedTranscript };
        setLastAnswer(answerWithTranscript);
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: "FAILED",
          sttProcessLogId,
          transcript: normalizedTranscript,
          error: transcriptRetryReason,
        }));
        setMessage(`${transcriptRetryReason} 다시 답변하기를 눌러 해당 질문을 다시 녹음해주세요.`);
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: sttProcessLogId,
          sttProcessLogId,
          outcome: "STT_TRANSCRIPT_REANSWER_REQUIRED",
          nextReady: false,
        });
        return;
      }

      const answerWithTranscript = { ...savedAnswer, transcript: normalizedTranscript };
      const isFollowUpAnswer = question?.questionType === "FOLLOW_UP";
      const answeredQuestionIndex = question
        ? data.questions.questions.findIndex((candidateQuestion) => candidateQuestion.questionId === question.questionId)
        : -1;
      const skipDemoCommonFollowUp =
        mode === "recruiting" &&
        data.runtime.sessionMode === "DEMO_PRESET" &&
        answeredQuestionIndex === 0;
      setLastAnswer(answerWithTranscript);

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: "COMPLETED",
        followUpStatus: isFollowUpAnswer || skipDemoCommonFollowUp ? "IDLE" : "PENDING",
        sttProcessLogId,
        transcript: normalizedTranscript,
        failureCategory: undefined,
        failureReason: undefined,
        failureRetryable: undefined,
        error: undefined,
      }));

      if (isFollowUpAnswer || skipDemoCommonFollowUp) {
        const isLastFollowUpQuestion = answeredQuestionIndex >= 0
          ? answeredQuestionIndex >= data.runtime.totalQuestions - 1
          : false;
        setMessage(
          skipDemoCommonFollowUp
            ? "협업 공통 답변이 저장되었습니다. 개인화 질문으로 이동해주세요."
            : isLastFollowUpQuestion
            ? "마지막 답변 처리가 완료되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요."
            : "답변 처리가 완료되었습니다. 다음 질문으로 이동해주세요.",
        );
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: sttProcessLogId,
          sttProcessLogId,
          outcome: skipDemoCommonFollowUp ? "DEMO_COMMON_NEXT_READY" : isLastFollowUpQuestion ? "INTERVIEW_COMPLETE_READY" : "NEXT_QUESTION_READY",
          nextReady: true,
        });
        return;
      }

      const followUpHandoff = await requestAiPipeline("FOLLOW_UP", answerWithTranscript);
      followUpProcessLogId = followUpHandoff.processLogId;
      if (!followUpProcessLogId) {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: current?.sttStatus ?? "COMPLETED",
          followUpStatus: "FAILED",
          error: "꼬리질문 작업 ID를 받지 못했습니다.",
        }));
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: sttProcessLogId,
          sttProcessLogId,
          outcome: "FOLLOW_UP_HANDOFF_MISSING",
          nextReady: false,
        });
        return;
      }

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: current?.sttStatus ?? "COMPLETED",
        followUpStatus: "RUNNING",
        followUpProcessLogId,
        error: undefined,
      }));

      const followUpStatus = await pollAiJobUntilSettled(followUpProcessLogId, pollingPolicy);
      if (followUpStatus.status !== "COMPLETED") {
        const shouldSkipFollowUp = shouldContinueInterviewWithoutFollowUp({
          failureCategory: followUpStatus.failure?.category,
        });
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: current?.sttStatus ?? "COMPLETED",
          followUpStatus: shouldSkipFollowUp ? "IDLE" : followUpStatus.status === "FAILED" ? "FAILED" : "RUNNING",
          followUpSkipped: shouldSkipFollowUp,
          error: shouldSkipFollowUp
            ? undefined
            : followUpStatus.status === "FAILED"
            ? followUpStatus.failure?.reason ?? "꼬리질문 생성에 실패했습니다."
            : undefined,
        }));
        if (shouldSkipFollowUp) {
          await syncRuntimeAfterFollowUpDecision();
        }
        completeAnswerSubmitToNextReadyMetric({
          questionId: savedAnswer.questionId,
          processLogId: followUpProcessLogId,
          sttProcessLogId,
          followUpProcessLogId,
          outcome: shouldSkipFollowUp ? "FOLLOW_UP_FAILED_CONTINUE" : "FOLLOW_UP_FAILED_BLOCKED",
          nextReady: shouldSkipFollowUp,
        });
        return;
      }

      const followUpQuestion =
        extractAiJobText(followUpStatus.output, ["content", "followUpQuestion", "question"]) ??
        extractAiJobText(followUpStatus.outputRef, ["content", "followUpQuestion", "question"]);
      const followUpRequired =
        extractAiJobBoolean(followUpStatus.output, "followUpRequired") ??
        extractAiJobBoolean(followUpStatus.outputRef, "followUpRequired") ??
        Boolean(followUpQuestion);

      await syncRuntimeAfterFollowUpDecision();
      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: current?.sttStatus ?? "COMPLETED",
        followUpStatus: "COMPLETED",
        followUpProcessLogId,
        followUpQuestion: followUpRequired ? followUpQuestion : undefined,
        followUpSkipped: !followUpRequired,
        error: followUpRequired && !followUpQuestion ? "꼬리질문 결과에서 content를 찾지 못했습니다." : undefined,
      }));

      setMessage(
        followUpRequired && followUpQuestion
          ? "답변에 이어질 꼬리질문이 바로 다음 질문으로 준비되었습니다."
          : "답변 처리가 완료되었습니다. 다음 기본 질문을 계속 진행해주세요.",
      );
      completeAnswerSubmitToNextReadyMetric({
        questionId: savedAnswer.questionId,
        processLogId: followUpProcessLogId,
        sttProcessLogId,
        followUpProcessLogId,
        outcome: followUpRequired ? "FOLLOW_UP_READY" : "FOLLOW_UP_SKIPPED",
        nextReady: true,
      });
    } catch (pipelineError) {
      const shouldSkipFollowUp = shouldContinueInterviewWithoutFollowUp({ pipelineError });
      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: current?.sttStatus ?? "FAILED",
        followUpStatus: current?.followUpStatus ?? "IDLE",
        followUpSkipped: shouldSkipFollowUp,
        error: shouldSkipFollowUp ? undefined : toErrorMessage(pipelineError),
      }));
      if (shouldSkipFollowUp) {
        await syncRuntimeAfterFollowUpDecision();
      }
      completeAnswerSubmitToNextReadyMetric({
        questionId: savedAnswer.questionId,
        processLogId: followUpProcessLogId ?? sttProcessLogId,
        sttProcessLogId,
        followUpProcessLogId,
        outcome: shouldSkipFollowUp ? "PIPELINE_ERROR_CONTINUE" : "PIPELINE_ERROR_BLOCKED",
        nextReady: shouldSkipFollowUp,
      });
    } finally {
      setPendingAiPipelineCount((count) => Math.max(0, count - 1));
    }
  }

  async function requestAiPipeline(
    processType: "STT" | "FOLLOW_UP",
    targetAnswer: LastSavedAnswer,
  ): Promise<AiInterviewHandoffResponse> {
    if (!data) {
      throw new Error("면접 런타임 정보를 찾지 못했습니다.");
    }

    const api = runtimeApi;
    const request = buildAiInterviewRequest(processType, targetAnswer, data.runtime.jobDescription, mode);
    const result =
      processType === "STT"
        ? mode === "mock"
          ? await api.requestMockStt(data.runtime.sessionId, request)
          : await api.requestRecruitingStt(data.runtime.sessionId, request)
        : mode === "mock"
          ? await api.requestMockFollowUpQuestion(data.runtime.sessionId, request)
          : await api.requestRecruitingFollowUpQuestion(data.runtime.sessionId, request);

    return result.data;
  }

  function beginAnswerToNextQuestionMetric(processLogId?: number) {
    if (!data || !currentQuestion) return;
    answerToNextQuestionPerfRef.current = {
      startedAt: performance.now(),
      startedAtIso: new Date().toISOString(),
      sourceQuestionId: currentQuestion.questionId,
      sessionId: data.runtime.sessionId,
      applicationId: data.runtime.applicationId,
      processLogId
    };
  }

  function beginAnswerSubmitToNextReadyMetric(questionId: number, origin: string) {
    if (!data) return;
    const currentMetric = answerSubmitToNextReadyPerfRef.current;
    if (currentMetric?.sourceQuestionId === questionId) return;

    answerSubmitToNextReadyPerfRef.current = {
      startedAt: performance.now(),
      startedAtIso: new Date().toISOString(),
      sourceQuestionId: questionId,
      sessionId: data.runtime.sessionId,
      applicationId: data.runtime.applicationId,
      origin,
    };
  }

  function completeAnswerSubmitToNextReadyMetric({
    questionId,
    processLogId,
    sttProcessLogId,
    followUpProcessLogId,
    outcome,
    nextReady,
  }: {
    questionId: number;
    processLogId?: number;
    sttProcessLogId?: number;
    followUpProcessLogId?: number;
    outcome: string;
    nextReady: boolean;
  }) {
    const metric = answerSubmitToNextReadyPerfRef.current;
    if (!metric || metric.sourceQuestionId !== questionId) return;

    answerSubmitToNextReadyPerfRef.current = null;
    void sendClientPerformanceLog({
      eventName: "ANSWER_SUBMIT_TO_NEXT_READY",
      durationMs: Math.max(0, Math.round(performance.now() - metric.startedAt)),
      processLogId,
      sessionId: metric.sessionId,
      applicationId: metric.applicationId,
      questionId,
      startedAt: metric.startedAtIso,
      completedAt: new Date().toISOString(),
      metadata: {
        mode,
        origin: metric.origin,
        sourceQuestionId: metric.sourceQuestionId,
        outcome,
        nextReady,
        nextQuestionType: resolveClientNextStepType({
          sourceQuestionId: questionId,
          outcome,
          nextReady,
          questions: data?.questions.questions ?? [],
          totalQuestions: data?.runtime.totalQuestions ?? 0,
        }),
        sttProcessLogId,
        followUpProcessLogId,
      },
    });
  }

  function clearAnswerSubmitToNextReadyMetric(questionId: number) {
    if (answerSubmitToNextReadyPerfRef.current?.sourceQuestionId === questionId) {
      answerSubmitToNextReadyPerfRef.current = null;
    }
  }

  async function handleQuestionTimeExpired() {
    if (!data || !currentQuestion || currentQuestionLocked) return;
    setMessage("답변 시간이 종료되어 현재 답변을 자동 제출합니다.");
    autoAdvanceAfterAnswerSubmitRef.current = true;

    const recorder = recorderRef.current;
    if (recording) {
      beginAnswerSubmitToNextReadyMetric(currentQuestion.questionId, "time_expired");
      submitAfterRecordingStopRef.current = true;
      if (recorder?.state === "recording") {
        handleStopRecording();
      }
      return;
    }

    if (canSubmitAnswer) {
      await submitAnswerRequest(withReanswerFlag(toSaveInterviewAnswerRequest(answer)), currentQuestion, "time_expired");
      return;
    }

    autoAdvanceAfterAnswerSubmitRef.current = false;
    await submitSkippedAnswerAndMoveNext(
      currentQuestion.questionId,
      "답변 시간이 종료되었지만 제출 가능한 음성이 없어 미답변 처리했습니다.",
    );
  }

  async function handleNextQuestion() {
    if (!data) return;
    if (gazeRetakeRequired) {
      setMessage(GAZE_DATA_RETAKE_GUIDANCE);
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      beginAnswerToNextQuestionMetric();
      const api = runtimeApi;
      const result = await (mode === "mock"
        ? api.moveMockNextQuestion(data.runtime.sessionId)
        : api.moveRecruitingNextQuestion(data.runtime.sessionId));
      applyAuthoritativeQuestionTransition(
        result.data.previousQuestionId,
        result.data.currentQuestion,
        result.data.completionReady,
      );
      prepareAuthoritativeNextQuestion(result.data.currentQuestion);
      setMessage(result.data.completionReady ? "모든 기본 질문의 답변이 저장되었습니다." : "다음 질문으로 이동했습니다.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!data) return;
    setBusy(true);
    setMessage("");
    try {
      const api = runtimeApi;
      const result = await (mode === "mock"
        ? api.completeMockInterview(data.runtime.sessionId)
        : api.completeRecruitingInterview(data.runtime.sessionId));
      stopQuestionSpeech();
      setMessage(`면접이 완료되었습니다. ${result.data.answeredCount}/${result.data.totalQuestions} 답변 제출`);
      if (mode === "recruiting" && data.runtime.applicationId) {
        if (onRecruitingComplete) {
          onRecruitingComplete(data.runtime.applicationId, result.data.sessionId);
          return;
        }
        router.push(candidateApplicationInterviewRoutes.applicationReport(data.runtime.applicationId));
        return;
      }
      await requestMockReportGenerationAfterComplete(result.data.sessionId);
      router.push(candidateApplicationInterviewRoutes.mockReportDetail(result.data.sessionId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  const runtimeTitle = mode === "recruiting" ? "채용 AI 면접 진행" : "AI 모의면접 진행";
  const answeredQuestionCount = data
    ? data.questions.questions.filter((question) => question.answered || answeredQuestionIds.has(question.questionId)).length
    : 0;
  const currentQuestionIndex = data && currentQuestion
    ? data.questions.questions.findIndex((question) => question.questionId === currentQuestion.questionId)
    : -1;
  const questionNumber = data
    ? currentQuestionIndex >= 0
      ? currentQuestionIndex + 1
      : Math.min(answeredQuestionCount + 1, data.runtime.totalQuestions || 1)
    : 0;
  const isCurrentQuestionLast = Boolean(
    data && currentQuestionIndex >= 0 && currentQuestionIndex >= data.runtime.totalQuestions - 1,
  );
  const answerProcessingBusy = pendingAiPipelineCount > 0 || runtimeQuestionSyncRequired;
  const answerProcessingFailed = Boolean(
    !autoAiPipeline?.followUpSkipped &&
      (autoAiPipeline?.error ||
        autoAiPipeline?.sttStatus === "FAILED" ||
        autoAiPipeline?.followUpStatus === "FAILED"),
  );
  const answerProcessingLabel = answerProcessingFailed
    ? "답변 처리 확인 필요"
    : answerProcessingBusy
        ? "다음 질문 준비 중"
        : lastAnswer
          ? "답변 저장 완료"
          : "답변 대기";
  const answerProcessingReady = Boolean(lastAnswer && !answerProcessingBusy && !answerProcessingFailed);
  const reanswerCandidate = data?.questions.questions.find(
    (question) => question.reanswerAvailable && !reansweredQuestionIds.has(question.questionId),
  );
  const currentQuestionNeedsReanswer = Boolean(reanswerCandidate);
  const canStartCurrentQuestionReanswer = Boolean(
    reanswerCandidate && !isReansweringCurrentQuestion && !busy && !recording,
  );
  const runtimeProgressionState = getInterviewRuntimeProgressionState({
    hasRuntimeData: Boolean(data),
    completionReady: data?.runtime.completionReady,
    currentQuestionAnswered,
    isCurrentQuestionLast,
    answerProcessingBusy,
    isReansweringCurrentQuestion,
    recording,
    answeredQuestionCount,
    totalQuestions: data?.runtime.totalQuestions ?? 0,
    gazeRetakeRequired,
  });
  const canMoveNextQuestion = runtimeProgressionState.canMoveNextQuestion;
  const canCompleteInterview = runtimeProgressionState.canCompleteInterview;
  const showDeviceSetup = data
    ? shouldShowInterviewDeviceSetup({
        mode,
        setupCompleted,
        runtimeStatus: data.runtime.status,
      })
    : false;
  const formattedRemainingTime = formatInterviewCountdown(remainingSeconds);
  const timerLabel = timerPhase === "PREPARING" ? "준비 시간" : "남은 시간";
  const timerDanger = timerPhase === "ANSWERING" && remainingSeconds <= 10;
  const interviewerProfile = getAiInterviewerProfile(mode);
  const interviewerQuestionPrompt = formatAiInterviewerQuestionPrompt({
    question: currentQuestion,
    questionVisible: subtitlesEnabled,
  });
  const interviewerSpeechText = currentQuestion?.content ?? "";
  const cameraPipStyle = cameraPipPosition && runtimePrimaryScreen === "interviewer"
    ? {
        left: `${cameraPipPosition.x}px`,
        top: `${cameraPipPosition.y}px`,
      }
    : undefined;
  const interviewerPipStyle = interviewerPipPosition && runtimePrimaryScreen === "candidate"
    ? {
        left: `${interviewerPipPosition.x}px`,
        top: `${interviewerPipPosition.y}px`,
        right: "auto",
      }
    : undefined;
  const answerFileStatus = recordedFileName || answer.videoFile ? "답변 파일 준비 완료" : "답변 파일 대기";
  const runtimeAssistiveStatus = `${answerProcessingLabel}. ${answerProcessingReady ? "답변 처리 완료." : "답변 처리 대기."} ${answerFileStatus}`;
  const runtimeStatusChips = getInterviewRuntimeStatusChips({
    microphoneReady,
    microphoneLevel,
    cameraReady,
    networkReady,
    networkStatus,
  });
  const runtimeDeviceRecheckState = getRuntimeDeviceRecheckState({
    setupCompleted,
    recording,
    cameraReady,
    microphoneReady,
    networkReady,
  });
  const interviewerSessionState = getInterviewerSessionState({
    mode: AI_INTERVIEWER_SESSION_MODE_POLICY.activeMode,
    setupCompleted,
    completionReady: data?.runtime.completionReady,
    hasCurrentQuestion: Boolean(currentQuestion),
    questionSpeechPlaying,
    questionSpeechSupported,
    recording,
    answerProcessingBusy,
    busy,
    currentQuestionLocked,
  });
  const runtimeLayoutState = getInterviewRuntimeLayoutState({ fullscreenActive });
  const runtimeScreenSwapState = getInterviewRuntimeScreenSwapState({ primaryScreen: runtimePrimaryScreen });
  const runtimeStageClassName = [
    runtimeLayoutState.stageClassName,
    runtimeLayoutState.viewportLockClassName,
    runtimeLayoutState.infoGapClassName,
    runtimeScreenSwapState.stageClassName,
    interviewerSessionState.stageClassName,
  ].filter(Boolean).join(" ");
  const interviewerFigureClassName = [
    "ai-interviewer-figure",
    runtimeScreenSwapState.interviewerPanelClassName,
  ].filter(Boolean).join(" ");
  const interviewerAvatarClassName = [
    "ai-interviewer-avatar",
    interviewerSessionState.avatarClassName,
  ].filter(Boolean).join(" ");
  const showInterviewerPanel = runtimePrimaryScreen === "interviewer" || interviewerPipVisible;
  const candidateCameraPanelClassName = [
    "candidate-camera-pip",
    cameraPipPosition && runtimePrimaryScreen === "interviewer" ? "positioned" : "",
    runtimeScreenSwapState.cameraPanelClassName,
  ].filter(Boolean).join(" ");
  const interviewerInfoPanelId = "ai-interviewer-info-panel";

  useEffect(() => {
    if (!data) return;

    const sessionId = data.runtime.sessionId;
    if (interviewerSessionIdRef.current !== sessionId) {
      interviewerSessionIdRef.current = sessionId;
      interviewerSessionEventsRef.current = [];
      interviewerSessionEventSequenceRef.current = 0;
      setInterviewerSessionEventCount(0);
    }

    const previousEvent = interviewerSessionEventsRef.current.at(-1);
    const event = createInterviewerSessionEvent({
      sessionId,
      questionId: currentQuestion?.questionId,
      state: {
        mode: interviewerSessionState.mode,
        phase: interviewerSessionState.phase,
        label: interviewerSessionState.label,
      },
      sequence: interviewerSessionEventSequenceRef.current + 1,
      occurredAt: new Date().toISOString(),
      previousEvent,
    });
    if (!event) return;

    interviewerSessionEventSequenceRef.current = event.sequence;
    interviewerSessionEventsRef.current = trimInterviewerSessionEvents(
      [
        ...interviewerSessionEventsRef.current,
        event,
      ],
      MAX_INTERVIEWER_SESSION_EVENTS,
    );
    setInterviewerSessionEventCount(interviewerSessionEventsRef.current.length);
  }, [
    currentQuestion?.questionId,
    data,
    interviewerSessionState.label,
    interviewerSessionState.mode,
    interviewerSessionState.phase,
  ]);

  useEffect(() => closeRealtimeConnection, [closeRealtimeConnection]);

  useEffect(() => {
    if (!data) return;
    if (AI_INTERVIEWER_SESSION_MODE_POLICY.activeMode !== "realtime-voice") return;
    const localStream = streamRef.current;
    if (!localStream) return;
    if (!shouldStartRealtimeSession({
      setupCompleted,
      runtimeStatus: data.runtime.status,
      localStream,
    })) return;

    const requestKey = `${mode}:${data.runtime.sessionId}`;
    if (realtimeSessionRequestKeyRef.current === requestKey) return;
    closeRealtimeConnection();
    realtimeSessionRequestKeyRef.current = requestKey;
    setRealtimeSessionStatus("requesting");
    setRealtimeConnectionState("new");
    setRealtimeDataChannelState("closed");
    setRealtimeDataEventCount(0);
    setRealtimeRemoteAudioReady(false);
    setRealtimeRemoteAudioStream(null);
    setRealtimeProvider("none");
    setRealtimeModel("");
    setRealtimeVoice("");
    setRealtimeLastError("");

    const body = { mode: "realtime-voice" as const, transport: "webrtc" as const };
    const request =
      mode === "mock"
        ? runtimeApi.createMockRealtimeSession(data.runtime.sessionId, body)
        : runtimeApi.createRecruitingRealtimeSession(data.runtime.sessionId, body);

    void request
      .then(async (result) => {
        const realtimeSession = result.data;
        setRealtimeProvider(realtimeSession.provider);
        setRealtimeModel(realtimeSession.model);
        setRealtimeVoice(realtimeSession.voice);

        if (realtimeSession.provider === "openai") {
          setRealtimeSessionStatus("connecting");
          const connection = await createRealtimeInterviewWebRtcConnection({
            session: realtimeSession,
            localStream,
            remoteAudioElement: realtimeRemoteAudioRef.current,
            onConnectionStateChange: setRealtimeConnectionState,
            onDataChannelStateChange: setRealtimeDataChannelState,
            onRemoteStream: (stream) => {
              setRealtimeRemoteAudioReady(true);
              setRealtimeRemoteAudioStream(stream);
            },
            onEvent: handleRealtimeDataEvent,
            onConnectionFailure: (connectionError) => {
              const realtimeMessage = `실시간 AI 면접 연결이 끊겼습니다: ${connectionError.message}`;
              setRealtimeSessionStatus("failed");
              setRealtimeLastError(realtimeMessage);
              setMessage(realtimeMessage);
            },
          });
          realtimeConnectionRef.current = connection;
        }

        setRealtimeSessionStatus("ready");
        const realtimeUserNotice = getRealtimeSessionUserNotice({ provider: realtimeSession.provider });
        if (realtimeUserNotice) {
          setMessage(realtimeUserNotice);
        }
      })
      .catch((sessionError) => {
        realtimeSessionRequestKeyRef.current = null;
        closeRealtimeConnection();
        setRealtimeSessionStatus("failed");
        const realtimeMessage = toErrorMessage(sessionError);
        setRealtimeLastError(realtimeMessage);
        setMessage(realtimeMessage);
      });
  }, [
    closeRealtimeConnection,
    data,
    data?.runtime.sessionId,
    data?.runtime.status,
    handleRealtimeDataEvent,
    microphoneReady,
    mode,
    runtimeApi,
    setupCompleted,
  ]);

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const stage = interviewerStageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await stage.requestFullscreen();
    } catch {
      setMessage("이 브라우저에서는 전체화면 전환을 사용할 수 없습니다.");
    }
  }, []);

  const handleHideCameraPreview = useCallback(() => {
    setRuntimePrimaryScreen("interviewer");
    setCameraPreviewVisible(false);
  }, []);

  const handleToggleCameraPreview = useCallback(() => {
    const nextState = getInterviewRuntimePipShortcutState({
      primaryScreen: runtimePrimaryScreen,
      cameraPreviewVisible,
      interviewerPipVisible,
    });
    setRuntimePrimaryScreen(nextState.primaryScreen);
    setCameraPreviewVisible(nextState.cameraPreviewVisible);
    setInterviewerPipVisible(nextState.interviewerPipVisible);
  }, [cameraPreviewVisible, interviewerPipVisible, runtimePrimaryScreen]);

  const handleToggleRuntimePrimaryScreen = useCallback(() => {
    setCameraPreviewVisible(true);
    setInterviewerPipVisible(true);
    setRuntimePrimaryScreen((current) => (current === "candidate" ? "interviewer" : "candidate"));
  }, []);

  useEffect(() => {
    answerCompleteShortcutRef.current = handleAnswerComplete;
    nextQuestionShortcutRef.current = () => {
      void handleNextQuestion();
    };
  });

  useEffect(() => {
    if (!setupCompleted) return;

    const handleRuntimeShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isRuntimeShortcutIgnoredTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        handleToggleCameraPreview();
        return;
      }
      if (key === "q") {
        event.preventDefault();
        setSubtitlesEnabled((current) => !current);
        return;
      }
      if (key === "f") {
        event.preventDefault();
        void handleToggleFullscreen();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        handleToggleRuntimePrimaryScreen();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        setInterviewerInfoOpen((current) => !current);
        return;
      }
      if (event.key === "Enter") {
        if (busy || !currentQuestion || currentQuestionAnswered || (!recording && !canSubmitAnswer && !canStartManualRecording)) return;
        event.preventDefault();
        answerCompleteShortcutRef.current();
        return;
      }
      if (key === "n") {
        if (busy || recording || !canMoveNextQuestion) return;
        event.preventDefault();
        nextQuestionShortcutRef.current();
      }
    };

    window.addEventListener("keydown", handleRuntimeShortcut);
    return () => window.removeEventListener("keydown", handleRuntimeShortcut);
  }, [
    busy,
    canMoveNextQuestion,
    canStartManualRecording,
    canSubmitAnswer,
    currentQuestion,
    currentQuestionAnswered,
    handleToggleFullscreen,
    handleToggleCameraPreview,
    handleToggleRuntimePrimaryScreen,
    recording,
    setupCompleted,
  ]);

  return (
    <main className="candidate-interview-app">
      <header className="iv-top">
        <Link className="brand" href={candidateApplicationInterviewRoutes.mockInterviewStart}>
          <Image src="/logo-init.png" alt="init" width={1010} height={375} priority />
        </Link>
        <span className="center">{runtimeTitle}</span>
      </header>

      <section className="iv-body">
        <StatusNotice loading={loading || busy} error={error} message={message} />
        {gazeRetakeRequired ? (
          <p className="notice danger" role="alert">{GAZE_DATA_RETAKE_GUIDANCE}</p>
        ) : null}
        {showDeviceSetup ? (
          <section className="candidate-device-setup">
            <div className="candidate-device-setup__head">
              <div>
                <p className="candidate-feature__eyebrow">장치 점검</p>
                <h1>카메라와 마이크를 확인해주세요</h1>
                <p>
                  {mode === "mock"
                    ? "모의면접을 시작하면 답변 녹화가 자동으로 진행됩니다."
                    : "채용 AI 면접을 시작하거나 재개하기 전에 카메라와 마이크를 다시 점검합니다."}
                </p>
              </div>
              <div className="toolbar">
                {ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY ? (
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy || recording}
                    onClick={() => void handleCameralessRuntimeEntry()}
                  >
                    카메라 없이 테스트 진입
                  </button>
                ) : null}
                <button className="btn primary" type="button" disabled={busy || !cameraReady || !microphoneReady || !networkReady} onClick={() => void handleEnterInterview()}>
                  면접 시작
                </button>
              </div>
            </div>
            {mode === "recruiting" ? <RecruitingIntegrityNotice /> : null}
            <div className="candidate-device-setup__grid">
              <div className="candidate-device-main">
                <div className="video-box candidate-device-preview">
                  <video ref={attachRuntimeVideoRef} autoPlay muted playsInline />
                  <CameraFramingOverlay state={cameraFramingState} testSentence={deviceTestSentence} />
                </div>
              </div>
              <aside className="panel candidate-runtime-status-panel">
                <p className="panel-title">장치 상태</p>
                <div className="status-list">
                  <div className="status-line"><span className={cameraReady ? "ok" : "wait"}>{cameraReady ? "✓" : "!"}</span> 카메라 {cameraReady ? "정상" : "연결 확인 필요"}</div>
                  <div className="status-line"><span className={microphoneReady ? "ok" : "wait"}>{microphoneReady ? "✓" : "!"}</span> {microphoneStatus}</div>
                  <div className="mic-meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                    <span style={{ width: `${microphoneLevel}%` }} />
                  </div>
                  <div className="status-line"><span className={networkReady ? "ok" : "wait"}>{networkReady ? "✓" : "!"}</span> {networkStatus}</div>
                </div>
                <div className="candidate-device-controls">
                  <select
                    aria-label="카메라 선택"
                    className="camera-select"
                    value={selectedCameraId}
                    onChange={(event) => setSelectedCameraId(event.target.value)}
                  >
                    <option value="">기본 카메라</option>
                    {cameraDevices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `카메라 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="마이크 선택"
                    className="camera-select"
                    value={selectedMicrophoneId}
                    onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                  >
                    <option value="">기본 마이크</option>
                    {microphoneDevices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `마이크 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <button className="btn" type="button" disabled={busy || recording} onClick={() => void refreshCameraDevices()}>
                    장치 새로고침
                  </button>
                  <button className="btn" type="button" disabled={busy || recording} onClick={() => void handleEnableCamera()}>
                    카메라/마이크 점검
                  </button>
                </div>
              </aside>
            </div>
          </section>
        ) : null}
        {data && setupCompleted ? (
          <>
            <section
              className={runtimeStageClassName}
              ref={interviewerStageRef}
              aria-label="AI 면접관 진행 화면"
              data-session-mode={interviewerSessionState.mode}
              data-session-phase={interviewerSessionState.phase}
              data-session-event-count={interviewerSessionEventCount}
              data-realtime-session-status={realtimeSessionStatus}
              data-realtime-provider={realtimeProvider}
              data-realtime-model={realtimeModel}
              data-realtime-voice={realtimeVoice}
              data-realtime-last-error={realtimeLastError}
              data-realtime-connection-state={realtimeConnectionState}
              data-realtime-data-channel-state={realtimeDataChannelState}
              data-realtime-event-count={realtimeDataEventCount}
              data-realtime-remote-audio={realtimeRemoteAudioReady ? "ready" : "pending"}
              data-requested-session-mode={AI_INTERVIEWER_SESSION_MODE_POLICY.requestedMode}
              data-session-mode-fallback={AI_INTERVIEWER_SESSION_MODE_POLICY.fallbackReason ?? ""}
            >
              <audio ref={bindRealtimeRemoteAudio} className="sr-only" autoPlay aria-hidden="true" />
              <div className="ai-interviewer-stage__top">
                <div className="ai-interviewer-stage__meta">
                  <strong>질문 {questionNumber} / {data.runtime.totalQuestions}</strong>
                </div>
                <div className={`question-timer ${timerDanger ? "danger" : ""}`} aria-label={`${timerLabel} ${formattedRemainingTime}`}>
                  <span>{timerLabel}</span>
                  <strong>{formattedRemainingTime}</strong>
                </div>
                <div className="ai-interviewer-stage__actions">
                  <button className="stage-shortcut-button" type="button" onClick={() => void handleToggleFullscreen()}>
                    <span>{runtimeLayoutState.fullscreenButtonLabel}</span>
                    <kbd>F</kbd>
                  </button>
                </div>
              </div>

              <div className="runtime-status-hud" aria-label="실시간 면접 상태">
                {runtimeStatusChips.map((chip) => (
                  <span key={chip.id} className={`runtime-status-chip runtime-status-chip--${chip.id} runtime-status-chip--${chip.tone}`}>
                    {chip.label}
                  </span>
                ))}
              </div>

              {integrityWarning ? (
                <div className="runtime-integrity-warning" role="status" aria-live="polite">
                  <strong>응시 무결성 확인</strong>
                  <span>{integrityWarning.message}</span>
                </div>
              ) : null}

              {showInterviewerPanel ? (
                <div
                  className={interviewerFigureClassName}
                  ref={runtimePrimaryScreen === "candidate" ? interviewerPipRef : undefined}
                  style={interviewerPipStyle}
                  aria-label={`${interviewerProfile.displayName} ${interviewerProfile.toneLabel}`}
                >
                  {runtimePrimaryScreen === "candidate" ? (
                    <div
                      className="ai-interviewer-pip__bar"
                      onPointerDown={handleInterviewerPipPointerDown}
                      onPointerMove={handleInterviewerPipPointerMove}
                      onPointerUp={handleInterviewerPipPointerEnd}
                      onPointerCancel={handleInterviewerPipPointerEnd}
                    >
                      <span>AI 면접관</span>
                      <button
                        type="button"
                        aria-label={runtimeScreenSwapState.swapButtonAriaLabel}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={handleToggleRuntimePrimaryScreen}
                      >
                        <span>{runtimeScreenSwapState.swapButtonLabel}</span>
                        <kbd>{runtimeScreenSwapState.swapShortcutKey}</kbd>
                      </button>
                      <button
                        type="button"
                        aria-label="AI 면접관 PIP 숨기기"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setInterviewerPipVisible(false)}
                      >
                        <span>숨김</span>
                      </button>
                    </div>
                  ) : null}
                  <InterviewAvatar
                    className={interviewerAvatarClassName}
                    phase={interviewerSessionState.phase}
                    audioSource={realtimeRemoteAudioElement}
                    audioStream={realtimeRemoteAudioStream}
                    speechText={interviewerSpeechText}
                  />
                  <div className="ai-interviewer-copy">
                    <div className="ai-interviewer-title-row">
                      <h1>{interviewerProfile.displayName}</h1>
                      <button
                        className={`ai-interviewer-info-button ${interviewerInfoOpen ? "open" : ""}`}
                        type="button"
                        aria-label={`${interviewerProfile.infoButtonLabel} ${interviewerInfoOpen ? "닫기" : "열기"}`}
                        aria-expanded={interviewerInfoOpen}
                        aria-controls={interviewerInfoPanelId}
                        onClick={() => setInterviewerInfoOpen((current) => !current)}
                      >
                        <kbd>{interviewerProfile.infoShortcutKey}</kbd>
                      </button>
                    </div>
                    <span
                      className={`ai-interviewer-session-chip ai-interviewer-session-chip--${interviewerSessionState.tone}`}
                      title={interviewerSessionState.description}
                    >
                      {interviewerSessionState.label}
                    </span>
                    {interviewerInfoOpen ? (
                      <div className="ai-interviewer-info-panel" id={interviewerInfoPanelId} role="note">
                        <strong>{interviewerProfile.toneLabel}</strong>
                        <span>{interviewerProfile.voiceGuide}</span>
                        <p>{interviewerProfile.disclosure}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <button
                  className="ai-interviewer-pip-toggle"
                  type="button"
                  onClick={() => setInterviewerPipVisible(true)}
                >
                  AI 면접관 열기
                </button>
              )}

              <div className={`ai-interviewer-question ${subtitlesEnabled ? "" : "muted"}`}>
                <span>{subtitlesEnabled ? "질문 보기" : "질문 음성 안내"}</span>
                <strong>{interviewerQuestionPrompt}</strong>
              </div>

              <div className={`question-voice-status ${questionSpeechSupported ? "" : "unsupported"}`} aria-live="polite">
                {questionSpeechStatus}
              </div>

              {cameraPreviewVisible ? (
                <div
                  className={candidateCameraPanelClassName}
                  ref={cameraPipRef}
                  style={cameraPipStyle}
                >
                  <div
                    className="candidate-camera-pip__bar"
                    onPointerDown={handleCameraPipPointerDown}
                    onPointerMove={handleCameraPipPointerMove}
                    onPointerUp={handleCameraPipPointerEnd}
                    onPointerCancel={handleCameraPipPointerEnd}
                  >
                    <span>내 화면</span>
                    <button
                      type="button"
                      aria-label={runtimeScreenSwapState.swapButtonAriaLabel}
                      aria-pressed={runtimePrimaryScreen === "candidate"}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={handleToggleRuntimePrimaryScreen}
                    >
                      <span>{runtimeScreenSwapState.swapButtonLabel}</span>
                      <kbd>{runtimeScreenSwapState.swapShortcutKey}</kbd>
                    </button>
                    <button
                      type="button"
                      aria-label="내 화면 preview 숨기기"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={handleHideCameraPreview}
                    >
                      <span>숨김</span>
                      <kbd>P</kbd>
                    </button>
                  </div>
                  <div className="candidate-camera-pip__video">
                    <video ref={attachRuntimeVideoRef} autoPlay muted playsInline />
                    {recording ? (
                      <div className="recbadge"><span className="pulse" /> 녹화 중</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <button
                  className={`candidate-camera-pip-toggle ${recording ? "recording" : ""}`}
                  type="button"
                  onClick={() => setCameraPreviewVisible(true)}
                >
                  <span>내 화면 열기</span>
                  <kbd>P</kbd>
                  {recording ? <strong>녹화 중</strong> : null}
                </button>
              )}
            </section>

            {nonverbalDeviceQaEnabled ? (
              <NonverbalDeviceQaPanel
                snapshot={nonverbalDeviceQaSnapshot}
                recording={recording}
                scenarioKind={nonverbalDeviceQaScenarioKind}
                message={nonverbalDeviceQaMessage}
                runCount={nonverbalDeviceQaRunsRef.current.length}
                onScenarioKindChange={setNonverbalDeviceQaScenarioKind}
                onStartScenario={handleStartNonverbalDeviceQaScenario}
                onFinishScenario={handleFinishNonverbalDeviceQaScenario}
                onDownload={handleDownloadNonverbalDeviceQaResult}
              />
            ) : null}

            <form className="candidate-runtime-form" onSubmit={handleSaveAnswer}>
              <p className="sr-only" aria-live="polite">{runtimeAssistiveStatus}</p>
              <div className="toolbar candidate-interview-controls">
                <button className="btn" type="button" disabled={busy || !currentQuestion || !questionSpeechSupported || currentQuestionReplayUsed} onClick={handleReplayPrompt}>
                  {currentQuestionReplayUsed ? "다시 듣기 완료" : "질문 음성 다시 듣기"}
                </button>
                {runtimeDeviceRecheckState.visible ? (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || recording}
                    onClick={() => void handleEnableCamera()}
                  >
                    {runtimeDeviceRecheckState.label}
                  </button>
                ) : null}
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    busy ||
                    !currentQuestion ||
                    !currentQuestionStateReady ||
                    currentQuestionLocked ||
                    !questionSpeechCompleted ||
                    questionSpeechPlaying ||
                    (!recording && !canSubmitAnswer && !canStartManualRecording)
                  }
                  onClick={handleAnswerComplete}
                >
                  <span>{shouldShowRecordingStartLabel ? "녹화 시작" : "답변 완료"}</span>
                  <kbd>Enter</kbd>
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!canStartCurrentQuestionReanswer}
                  onClick={() => handleStartReanswer(reanswerCandidate)}
                  hidden={!currentQuestionNeedsReanswer}
                >
                  다시 답변
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy || recording || !canMoveNextQuestion}
                  onClick={() => void handleNextQuestion()}
                >
                  <span>다음 질문</span>
                  <kbd>N</kbd>
                </button>
                <button
                  className={`subtitle-toggle ${subtitlesEnabled ? "on" : ""}`}
                  type="button"
                  aria-pressed={subtitlesEnabled}
                  onClick={() => setSubtitlesEnabled((current) => !current)}
                >
                  <span>{subtitlesEnabled ? "질문 숨기기" : "질문 보기"}</span>
                  <kbd>Q</kbd>
                </button>
              </div>
              <p className="field-hint">STT 실패 시 재답변은 문항당 1회만 가능합니다.</p>
              <div className="candidate-interview-complete-action">
                <button
                  className="btn primary lg"
                  type="button"
                  disabled={busy || recording || !canCompleteInterview}
                  onClick={() => void handleComplete()}
                >
                  면접 완료
                </button>
              </div>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}

function NonverbalDeviceQaPanel({
  snapshot,
  recording,
  scenarioKind,
  message,
  runCount,
  onScenarioKindChange,
  onStartScenario,
  onFinishScenario,
  onDownload,
}: {
  snapshot?: NonverbalDeviceQaPanelSnapshot;
  recording: boolean;
  scenarioKind: NonverbalDeviceQaScenarioKind;
  message: string;
  runCount: number;
  onScenarioKindChange: (kind: NonverbalDeviceQaScenarioKind) => void;
  onStartScenario: () => void;
  onFinishScenario: () => void;
  onDownload: () => void;
}) {
  const run = snapshot?.run;
  const summary = snapshot?.summary;
  const activeScenario = run?.activeScenario;
  const performanceLabel = summary ? formatNonverbalDeviceQaPerformanceLabel(summary.performanceStatus) : "측정 대기";
  const performanceTone = summary?.performanceStatus.toLowerCase() ?? "measuring";

  return (
    <details className="nonverbal-device-qa" open>
      <summary>
        <span>실기기 QA</span>
        <strong className={`nonverbal-device-qa__status nonverbal-device-qa__status--${performanceTone}`}>
          {performanceLabel}
        </strong>
      </summary>
      <div className="nonverbal-device-qa__body">
        <p className="nonverbal-device-qa__message">{message}</p>
        {run && summary ? (
          <>
            <dl className="nonverbal-device-qa__environment">
              <div><dt>환경</dt><dd>{run.environment.browser} · {run.environment.platform}</dd></div>
              <div><dt>카메라</dt><dd>{formatNonverbalDeviceQaCamera(run)}</dd></div>
              <div><dt>감지 표본</dt><dd>{run.sampleCompleted}/{run.sampleAttempts} · {summary.completedSamplesPerSecond.toFixed(2)}회/s</dd></div>
              <div><dt>처리 시간</dt><dd>평균 {summary.averageProcessingMs.toFixed(0)}ms · p95 {summary.p95ProcessingMs.toFixed(0)}ms</dd></div>
              <div><dt>영상 FPS</dt><dd>{summary.measuredVideoFps?.toFixed(1) ?? "측정 미지원"}</dd></div>
              <div><dt>표본률</dt><dd>얼굴 {formatQaRate(summary.faceCoverageRate)} · 시선 {formatQaRate(summary.irisCoverageRate)} · 고개 {formatQaRate(summary.headPoseCoverageRate)}</dd></div>
            </dl>

            <div className="nonverbal-device-qa__scenario" aria-label="오탐 및 미탐 QA 시나리오">
              <span>측정 시나리오</span>
              <div className="nonverbal-device-qa__segments">
                {(["NEUTRAL", "EYE_AWAY", "HEAD_AWAY"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={scenarioKind === kind ? "active" : ""}
                    aria-pressed={scenarioKind === kind}
                    disabled={Boolean(activeScenario)}
                    onClick={() => onScenarioKindChange(kind)}
                  >
                    {formatNonverbalDeviceQaScenarioLabel(kind)}
                  </button>
                ))}
              </div>
              <div className="nonverbal-device-qa__actions">
                <button type="button" className="btn" disabled={!recording || Boolean(activeScenario)} onClick={onStartScenario}>
                  구간 시작
                </button>
                <button type="button" className="btn" disabled={!activeScenario} onClick={onFinishScenario}>
                  구간 종료
                </button>
                <button type="button" className="btn" disabled={runCount === 0} onClick={onDownload}>
                  JSON 저장
                </button>
              </div>
            </div>

            {run.scenarioResults.length > 0 ? (
              <ul className="nonverbal-device-qa__results" aria-label="QA 시나리오 결과">
                {run.scenarioResults.map((result, index) => (
                  <li key={`${result.kind}-${result.startedAtOffsetMs}-${index}`}>
                    <strong className={`nonverbal-device-qa__result nonverbal-device-qa__result--${result.status.toLowerCase()}`}>
                      {result.status}
                    </strong>
                    <span>{formatNonverbalDeviceQaScenarioLabel(result.kind)}</span>
                    <small>{result.message}</small>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="nonverbal-device-qa__empty">답변 녹화를 시작하면 현재 기기에서 측정합니다.</p>
        )}
      </div>
    </details>
  );
}

function formatNonverbalDeviceQaPerformanceLabel(status: NonverbalDeviceQaSummary["performanceStatus"]): string {
  switch (status) {
    case "GOOD": return "원활";
    case "DEGRADED": return "성능 저하";
    case "POOR": return "점검 필요";
    case "UNAVAILABLE": return "분석 불가";
    default: return "측정 중";
  }
}

function formatNonverbalDeviceQaScenarioLabel(kind: NonverbalDeviceQaScenarioKind): string {
  switch (kind) {
    case "EYE_AWAY": return "눈동자 이탈";
    case "HEAD_AWAY": return "고개 회전";
    default: return "정면 유지";
  }
}

function formatNonverbalDeviceQaCamera(run: NonverbalDeviceQaRun): string {
  const resolution = run.camera.width && run.camera.height ? `${run.camera.width}×${run.camera.height}` : "해상도 미확인";
  const frameRate = run.camera.frameRate ? `${Math.round(run.camera.frameRate)}fps` : "FPS 미확인";
  return `${resolution} · ${frameRate}`;
}

function formatQaRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function CandidatePageShell({
  active,
  children,
  publicEntry = false,
}: {
  active: CandidateNavSection;
  children: ReactNode;
  publicEntry?: boolean;
}) {
  return (
    <main className="app-shell candidate-app">
      <CandidateNav active={active} publicEntry={publicEntry} />
      <section className="app-page glass-page notion">{children}</section>
    </main>
  );
}

// 마이페이지 하위 탭: 마이페이지 / 결제 / 지원현황 / 지표(AI 지표 페이지로 이동)
function CandidateMypageTabs() {
  const pathname = usePathname();
  return (
    <nav className="candidate-mypage-tabs" aria-label="마이페이지 하위 탭">
      {candidateAccountBillingNav.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            className={`candidate-mypage-tab${isActive ? " is-active" : ""}`}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function CandidateNav({ active, publicEntry = false }: { active: CandidateNavSection; publicEntry?: boolean }) {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const mockActive = active === "interview" || active === "reports";
  const recruitingActive = active === "jobs";
  // 지표는 마이페이지 하위 흐름으로 배치되어 GNB 최상위 탭에서는 제외한다(마이페이지 활성으로 묶임).
  const accountBillingActive =
    active === "accountBilling" || active === "performance" || isCandidateAccountBillingPath(pathname);

  return (
    <header className="gnb">
      <div className="gnb-inner">
        <Link className="brand" href={publicEntry ? "/" : candidateApplicationInterviewRoutes.jobs}>
          <Image src="/logo-init-v4.png" alt="init" width={1900} height={580} priority />
        </Link>
        <nav className="gnb-menu" aria-label="지원자 메뉴">
          <div className={`gnb-item ${recruitingActive ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.jobs} aria-current={recruitingActive ? "page" : undefined}>
              채용공고
            </Link>
          </div>
          <div className={`gnb-item ${mockActive ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.mockInterviewStart} aria-current={mockActive ? "page" : undefined}>
              AI 모의면접
            </Link>
            <div className="gnb-panel">
              <Link className={active === "interview" ? "active" : ""} href={candidateApplicationInterviewRoutes.mockInterviewStart}>
                면접시작
              </Link>
              <Link className={active === "reports" ? "active" : ""} href={candidateApplicationInterviewRoutes.mockReports}>
                평가 리포트
              </Link>
            </div>
          </div>
          <div className={`gnb-item ${accountBillingActive ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.mypage} aria-current={accountBillingActive ? "page" : undefined}>
              {candidateNavLabels.accountBilling}
            </Link>
            <div className="gnb-panel">
              {candidateAccountBillingNav.map((item) => (
                <Link className={pathname?.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <div
          className={`gnb-right${
            publicEntry && (status !== "authenticated" || user?.userType !== "CANDIDATE")
              ? " candidate-guest-actions"
              : ""
          }`}
        >
          {publicEntry && (status !== "authenticated" || user?.userType !== "CANDIDATE") ? (
            <>
              <Link className="btn secondary" href="/login">
                로그인
              </Link>
              <Link className="btn primary" href="/company/login">
                기업 서비스
              </Link>
            </>
          ) : (
            <>
              <CandidateNotificationCenter />
              <GnbAvatar accountLabel="지원자 계정" />
              <GnbLogoutButton />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function CandidateNotificationCenter() {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => readCandidateNotificationReadIds());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => readCandidateNotificationDismissedIds());
  const [notifications, setNotifications] = useState<CandidateNotificationItem[]>([]);
  const notificationMountedRef = useRef(false);
  const unreadCount = countUnreadCandidateNotifications(notifications);

  const refreshNotifications = useCallback(async (options?: { clearOnError?: boolean; markReadAfterLoad?: boolean }) => {
    const nextReadIds = readCandidateNotificationReadIds();
    const nextDismissedIds = readCandidateNotificationDismissedIds();
    setReadIds(nextReadIds);
    setDismissedIds(nextDismissedIds);

    try {
      const response = await getCandidateApi().listApplications();
      if (!notificationMountedRef.current) {
        return;
      }

      const latestReadIds = readCandidateNotificationReadIds();
      const latestDismissedIds = readCandidateNotificationDismissedIds();
      let nextNotifications = buildCandidateReportCompleteNotifications(response.data.items, latestReadIds, latestDismissedIds);

      if (options?.markReadAfterLoad && nextNotifications.length) {
        const readAfterOpenIds = new Set(latestReadIds);
        nextNotifications.forEach((notification) => readAfterOpenIds.add(notification.id));
        setReadIds(readAfterOpenIds);
        writeCandidateNotificationReadIds(readAfterOpenIds);
        nextNotifications = nextNotifications.map((notification) => ({ ...notification, read: true }));
      } else {
        setReadIds(latestReadIds);
      }

      setDismissedIds(latestDismissedIds);
      setNotifications(nextNotifications);
    } catch {
      if (options?.clearOnError && notificationMountedRef.current) {
        setNotifications([]);
      }
    }
  }, []);

  useEffect(() => {
    notificationMountedRef.current = true;
    void refreshNotifications({ clearOnError: true });

    return () => {
      notificationMountedRef.current = false;
    };
  }, [refreshNotifications]);

  useEffect(() => {
    function handleWindowFocus() {
      void refreshNotifications();
    }

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [refreshNotifications]);

  useEffect(() => {
    function handleReportNotification(event: Event) {
      const notification = (event as CustomEvent<CandidateNotificationItem>).detail;
      if (!notification?.id || dismissedIds.has(notification.id)) {
        return;
      }

      setNotifications((current) =>
        mergeCandidateNotifications(current, [
          {
            ...notification,
            read: readIds.has(notification.id),
          },
        ]),
      );
    }

    window.addEventListener(CANDIDATE_REPORT_NOTIFICATION_EVENT, handleReportNotification);
    return () => window.removeEventListener(CANDIDATE_REPORT_NOTIFICATION_EVENT, handleReportNotification);
  }, [dismissedIds, readIds]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function handleToggle() {
    if (!open) {
      markNotificationsRead();
      void refreshNotifications({ markReadAfterLoad: true });
    }
    setOpen((current) => !current);
  }

  function markNotificationsRead() {
    if (!notifications.length) {
      return;
    }

    const nextReadIds = new Set(readIds);
    notifications.forEach((notification) => nextReadIds.add(notification.id));
    setReadIds(nextReadIds);
    writeCandidateNotificationReadIds(nextReadIds);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }

  function dismissNotification(notificationId: string) {
    const nextDismissedIds = new Set(dismissedIds);
    nextDismissedIds.add(notificationId);
    setDismissedIds(nextDismissedIds);
    writeCandidateNotificationDismissedIds(nextDismissedIds);

    const nextReadIds = new Set(readIds);
    nextReadIds.add(notificationId);
    setReadIds(nextReadIds);
    writeCandidateNotificationReadIds(nextReadIds);

    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
  }

  function dismissAllNotifications() {
    if (!notifications.length) {
      return;
    }

    const nextDismissedIds = new Set(dismissedIds);
    const nextReadIds = new Set(readIds);
    notifications.forEach((notification) => {
      nextDismissedIds.add(notification.id);
      nextReadIds.add(notification.id);
    });
    setDismissedIds(nextDismissedIds);
    setReadIds(nextReadIds);
    writeCandidateNotificationDismissedIds(nextDismissedIds);
    writeCandidateNotificationReadIds(nextReadIds);
    setNotifications([]);
  }

  return (
    <div className="candidate-notification-center">
      <button
        className="icon-btn candidate-notification-button"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}개` : "알림"}
        type="button"
        onClick={handleToggle}
      >
        <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
        {unreadCount > 0 ? <span className="candidate-notification-badge">{formatUnreadNotificationCount(unreadCount)}</span> : null}
      </button>
      {open ? (
        <div className="candidate-notification-popover" role="dialog" aria-modal="false" aria-labelledby="candidate-notification-title">
          <div className="candidate-notification-popover__head">
            <div>
              <h2 id="candidate-notification-title">알림</h2>
              <p>채용 면접과 리포트 진행 상태를 확인합니다.</p>
            </div>
            <div className="candidate-notification-popover__actions">
              {notifications.length ? (
                <button className="candidate-notification-clear" type="button" onClick={dismissAllNotifications}>
                  모두 지우기
                </button>
              ) : null}
              <button className="candidate-notification-close" type="button" aria-label="알림 닫기" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
          </div>
          {notifications.length ? (
            <ul className="candidate-notification-list">
              {notifications.map((notification) => (
                <li className="candidate-notification-item" key={notification.id}>
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    {notification.createdAt ? <small>{formatDateTime(notification.createdAt)}</small> : null}
                  </div>
                  <div className="candidate-notification-item__actions">
                    <Link className="text-link" href={notification.href} onClick={() => setOpen(false)}>
                      결과 확인
                    </Link>
                    <button
                      className="candidate-notification-delete"
                      type="button"
                      aria-label={`${notification.title} 삭제`}
                      onClick={() => dismissNotification(notification.id)}
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="candidate-notification-empty">새 알림이 없습니다.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CandidatePageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </div>
  );
}

function StatusNotice({ loading, error, message }: { loading?: boolean; error?: string; message?: string }) {
  if (error) {
    const loginRequired = error.includes("로그인");
    return (
      <div className="notice danger">
        <span>{error}</span>
        {loginRequired ? <Link className="btn secondary compact" href="/login">로그인으로 이동</Link> : null}
      </div>
    );
  }
  if (message) return <p className="notice">{message}</p>;
  if (loading) return <p className="notice">불러오는 중입니다.</p>;
  return null;
}

function ApplicationStatusBadge({ label, tone }: { label: string; tone: ApplicationBadgeTone }) {
  return <span className={`candidate-application-badge ${tone}`}>{label}</span>;
}

function renderCandidateReportStatus(status: CandidateApplicationSummary["reportStatus"]): ReactNode {
  if (status === "PENDING") return <span className="candidate-report-empty">-</span>;
  return (
    <ApplicationStatusBadge
      label={formatCandidateReportStatusLabel(status)}
      tone={getCandidateReportStatusTone(status)}
    />
  );
}

function formatCandidateApplicationStatusLabel(status: CandidateApplicationSummary["applicationStatus"]): string {
  const labels: Record<string, string> = {
    DRAFT: "작성중",
    SUBMITTED: "지원완료",
    IN_REVIEW: "검토중",
    INTERVIEW_WAITING: "면접대기",
    INTERVIEW_DONE: "면접완료",
    COMPLETED: "최종완료",
    CANCELED: "지원취소",
  };
  return labels[status] ?? status;
}

function getCandidateApplicationStatusTone(status: CandidateApplicationSummary["applicationStatus"]): ApplicationBadgeTone {
  if (status === "SUBMITTED" || status === "COMPLETED" || status === "INTERVIEW_DONE") return "green";
  if (status === "CANCELED") return "neutral";
  return "yellow";
}

function formatCandidateInterviewStatusLabel(status: CandidateApplicationSummary["interviewStatus"]): string {
  const labels: Record<string, string> = {
    NOT_READY: "응시대기",
    READY: "응시대기",
    IN_PROGRESS: "진행중",
    COMPLETED: "응시완료",
    FAILED: "확인필요",
  };
  return labels[status] ?? status;
}

function getCandidateInterviewStatusTone(status: CandidateApplicationSummary["interviewStatus"]): ApplicationBadgeTone {
  if (status === "COMPLETED") return "green";
  if (status === "FAILED") return "neutral";
  return "yellow";
}

function formatCandidateReportStatusLabel(status: CandidateApplicationSummary["reportStatus"]): string {
  const labels: Record<string, string> = {
    GENERATING: "분석중",
    PENDING: "-",
    COMPLETED: "완료",
    FAILED: "확인필요",
  };
  return labels[status] ?? status;
}

function getCandidateReportStatusTone(status: CandidateApplicationSummary["reportStatus"]): ApplicationBadgeTone {
  if (status === "GENERATING") return "purple";
  if (status === "COMPLETED") return "green";
  return "neutral";
}

function matchesCandidateApplicationStatusFilter(
  application: CandidateApplicationSummary,
  filter: CandidateApplicationStatusFilter,
): boolean {
  if (application.applicationStatus === "CANCELED") return filter === "ALL";
  if (application.availabilityStatus === "UNAVAILABLE") return filter === "ALL";
  if (filter === "ALL") return true;
  if (filter === "WAITING") return application.interviewStatus === "NOT_READY" || application.interviewStatus === "READY";
  if (filter === "IN_PROGRESS") return application.interviewStatus === "IN_PROGRESS";
  if (filter === "COMPLETED") return application.interviewStatus === "COMPLETED";
  return application.reportStatus === "GENERATING" || application.reportStatus === "COMPLETED";
}

function getSelectedApplicationAction(application: CandidateApplicationSummary): { href?: string; label: string } {
  if (application.applicationStatus === "CANCELED") {
    return { label: "지원 취소됨" };
  }
  if (application.availabilityStatus === "UNAVAILABLE") {
    return { label: "더 이상 조회할 수 없음" };
  }
  if (application.interviewStatus === "FAILED") {
    return { label: "면접 확인 필요" };
  }
  if (application.interviewStatus === "COMPLETED") {
    return {
      href: getCandidateApplicationReportHref(application),
      label: application.reportStatus === "COMPLETED" ? "결과 확인" : "분석 상태 확인",
    };
  }
  if (application.interviewStatus === "IN_PROGRESS") {
    return {
      href: candidateApplicationInterviewRoutes.interviewGuide(application.applicationId),
      label: "면접 재개",
    };
  }
  if (application.canStartInterview || application.interviewStatus === "READY") {
    return {
      href: candidateApplicationInterviewRoutes.interviewGuide(application.applicationId),
      label: "면접 시작",
    };
  }
  return {
    href: candidateApplicationInterviewRoutes.interviewGuide(application.applicationId),
    label: "면접 시작",
  };
}

function MockHistoryTable({ history }: { history: CandidateMockInterviewHistoryItem[] }) {
  // 연습 세션 제목은 사용자가 직접 지정. 저장한 값은 낙관적으로 즉시 반영한다. (#288)
  const [localTitles, setLocalTitles] = useState<Record<number, string | null>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<CandidateMockInterviewHistoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState("");

  const rawTitle = (item: CandidateMockInterviewHistoryItem) =>
    item.sessionId in localTitles ? localTitles[item.sessionId] : item.title;
  const displayTitle = (item: CandidateMockInterviewHistoryItem) => rawTitle(item) || `세션 #${item.sessionId}`;
  const visibleHistory = history.filter((item) => !deletedIds.has(item.sessionId));

  useEffect(() => {
    if (!deleteTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && deletingId === null) {
        setDeleteTarget(null);
        setDeleteError(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteTarget, deletingId]);

  function startEdit(item: CandidateMockInterviewHistoryItem) {
    setEditingId(item.sessionId);
    setDraft(rawTitle(item) ?? "");
    setSaveError(null);
  }

  async function saveTitle(sessionId: number) {
    setSavingId(sessionId);
    setSaveError(null);
    try {
      const result = await getCandidateApi().updateMockSessionTitle(sessionId, draft.trim());
      setLocalTitles((prev) => ({ ...prev, [sessionId]: result.data.title }));
      setEditingId(null);
    } catch (error) {
      // 실패 시 편집 상태 유지하고 오류 사유를 노출한다. (#288)
      setSaveError(toErrorMessage(error));
    } finally {
      setSavingId(null);
    }
  }

  function openDelete(item: CandidateMockInterviewHistoryItem) {
    setDeleteTarget(item);
    setDeleteError(null);
    setDeleteMessage("");
  }

  async function confirmDelete() {
    if (!deleteTarget || deletingId !== null) return;
    const sessionId = deleteTarget.sessionId;
    const title = displayTitle(deleteTarget);
    setDeletingId(sessionId);
    setDeleteError(null);
    try {
      await getCandidateApi().deleteMockInterview(sessionId);
      setDeletedIds((current) => new Set([...current, sessionId]));
      setDeleteMessage(`"${title}" 연습 이력이 삭제되었습니다.`);
      if (editingId === sessionId) {
        setEditingId(null);
      }
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(toErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {deleteMessage ? <p className="notice success mock-history-delete-notice" role="status">{deleteMessage}</p> : null}
      {visibleHistory.length > 0 ? (
        <div className="table-wrap">
          <table className="mock-history-table">
            <thead>
              <tr>
                <th>연습 제목</th>
                <th>면접 상태</th>
                <th>리포트 상태</th>
                <th>답변</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.map((item) => (
                <tr key={item.sessionId}>
                  <td>
                    {editingId === item.sessionId ? (
                      <span className="mock-title-edit">
                        <input
                          autoFocus
                          value={draft}
                          maxLength={100}
                          placeholder={`세션 #${item.sessionId}`}
                          onChange={(event) => setDraft(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void saveTitle(item.sessionId);
                            if (event.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button type="button" className="mock-title-btn" disabled={savingId === item.sessionId} onClick={() => void saveTitle(item.sessionId)}>
                          저장
                        </button>
                        <button type="button" className="mock-title-btn ghost" onClick={() => setEditingId(null)}>
                          취소
                        </button>
                        {saveError ? <span className="mock-title-error" role="alert">{saveError}</span> : null}
                      </span>
                    ) : (
                      <span className="mock-title-cell">
                        <button type="button" className="mock-title-name" title="제목 편집" onClick={() => startEdit(item)}>
                          {displayTitle(item)}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                        </button>
                        <span>{formatDateTime(item.updatedAt)}</span>
                      </span>
                    )}
                  </td>
                  <td><StatusPill value={item.status} /></td>
                  <td><StatusPill value={item.reportStatus} /></td>
                  <td>{item.answeredCount}/{item.totalQuestions}</td>
                  <td>
                    <div className="mock-history-actions">
                      {item.status === "IN_PROGRESS" ? (
                        <Link className="btn secondary compact" href={candidateApplicationInterviewRoutes.mockInterview(item.sessionId)}>이어하기</Link>
                      ) : item.reportId ? (
                        <Link className="btn secondary compact" href={candidateApplicationInterviewRoutes.mockReportDetail(item.reportId)}>
                          {formatMockHistoryActionLabel(item.reportStatus)}
                        </Link>
                      ) : (
                        <span className="btn secondary compact is-disabled" aria-disabled="true">준비 중</span>
                      )}
                      <button
                        className="btn secondary compact mock-history-delete-trigger"
                        type="button"
                        aria-label={`${displayTitle(item)} 삭제`}
                        disabled={deletingId === item.sessionId}
                        onClick={() => openDelete(item)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">남아 있는 모의면접 연습 이력이 없어요.</p>
      )}

      {deleteTarget ? (
        <div
          className="modal-backdrop mock-history-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && deletingId === null) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
        >
          <div
            className="modal mock-history-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mock-history-delete-title"
            aria-describedby="mock-history-delete-description"
          >
            <div className="modal-head">
              <div>
                <h2 id="mock-history-delete-title">연습 이력 삭제</h2>
                <p id="mock-history-delete-description">삭제하면 연습 이력과 리포트에서 더 이상 확인할 수 없습니다. 사용한 이용권은 복구되지 않습니다.</p>
              </div>
            </div>
            <div className="confirm-box mock-history-delete-summary">
              <strong>{displayTitle(deleteTarget)}</strong>
              <span>{formatDateTime(deleteTarget.updatedAt)}</span>
            </div>
            {deleteError ? <p className="notice danger" role="alert">{deleteError}</p> : null}
            <div className="modal-actions split-actions">
              <button
                autoFocus
                className="btn secondary"
                type="button"
                disabled={deletingId !== null}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
              >
                취소
              </button>
              <button
                className="btn primary danger"
                type="button"
                disabled={deletingId !== null}
                onClick={() => void confirmDelete()}
              >
                {deletingId !== null ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatMockHistoryActionLabel(status: CandidateMockInterviewHistoryItem["reportStatus"]): string {
  if (status === "COMPLETED") return "상세";
  if (status === "GENERATING") return "분석 중";
  if (status === "FAILED") return "다시 요청";
  return "AI 분석 시작";
}

// 기업별 지원서 세트(폴더) 관리 — 마이페이지 (#228)
const EMPTY_FOLDER_INPUT: CandidateFolderInput = {
  name: "",
  githubUrl: "",
  blogUrl: "",
  portfolioUrl: "",
  resumeFileId: null,
  motivation: "",
  extraNote: "",
};

function CandidateFoldersSection() {
  const router = useRouter();
  const load = useCallback(() => getCandidateApi().listFolders(), []);
  const { data, loading, error, refresh } = useCandidateResource(load, []);
  // 새로 만든 세트가 목록 맨 뒤(추가 버튼 앞)에 오도록 id 오름차순 정렬.
  const folders = [...(data?.data.items ?? [])].sort((a, b) => a.id - b.id);
  const [message, setMessage] = useState("");

  function openCreate() {
    router.push("/candidate/application-sets/new");
  }
  function openEdit(folder: CandidateFolder) {
    router.push(`/candidate/application-sets/${folder.id}/edit`);
  }
  async function handleDelete(folder: CandidateFolder) {
    if (!window.confirm(`'${folder.name}' 지원서 세트를 삭제할까요?`)) return;
    try {
      await getCandidateApi().deleteFolder(folder.id);
      setMessage("지원서 세트를 삭제했습니다.");
      refresh();
    } catch (deleteError) {
      setMessage(toErrorMessage(deleteError));
    }
  }

  return (
    <section className="mypage-block">
      <div className="mypage-block__title">
        <h2>지원서 세트</h2>
        <p>기업별로 이력서·링크·지원 동기를 세트로 저장해 두고, 모의면접에서 골라 연습할 수 있어요.</p>
      </div>
      <StatusNotice loading={loading} error={error} message={message} />
      <div className="folder-grid">
        {folders.map((folder) => {
          const links = [
            folder.githubUrl ? { label: "GitHub", url: folder.githubUrl } : null,
            folder.blogUrl ? { label: "블로그", url: folder.blogUrl } : null,
            folder.portfolioUrl ? { label: "포트폴리오", url: folder.portfolioUrl } : null,
          ].filter((link): link is { label: string; url: string } => link !== null);
          return (
            <article className="folder-card" key={folder.id}>
              <div className="folder-card__top">
                <span className="folder-card__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                  </svg>
                </span>
                <h3 className="folder-card__name">{folder.name}</h3>
                <div className="folder-card__actions">
                  <button type="button" className="folder-icon-btn" aria-label="편집" onClick={() => openEdit(folder)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button type="button" className="folder-icon-btn folder-icon-btn--danger" aria-label="삭제" onClick={() => void handleDelete(folder)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /></svg>
                  </button>
                </div>
              </div>

              <div className={`folder-card__resume${folder.resumeFileName ? "" : " is-empty"}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                <span>{folder.resumeFileName ?? "이력서 미첨부"}</span>
              </div>

              {folder.portfolioFileName ? (
                <div className="folder-card__resume">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  <span>{folder.portfolioFileName}</span>
                </div>
              ) : null}

              {links.length ? (
                <div className="folder-card__links">
                  {links.map((link) => (
                    <a key={link.label} className="folder-link" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                  ))}
                </div>
              ) : null}

              {folder.motivation ? <p className="folder-card__motivation">{folder.motivation}</p> : null}
            </article>
          );
        })}
        <button type="button" className="folder-add" onClick={openCreate}>
          <span className="folder-add__plus" aria-hidden="true">+</span>
          <span>새 지원서 세트</span>
        </button>
      </div>
    </section>
  );
}

export function CandidateApplicationSetEditorPage({ folderId }: { folderId?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [folder, setFolder] = useState<CandidateFolder | null>(null);
  const [initialProfileSnapshot, setInitialProfileSnapshot] = useState<CandidateProfileSnapshotV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getCandidateApi().getProfile(),
      folderId ? getCandidateApi().getFolder(folderId) : Promise.resolve(null),
    ])
      .then(([profileResponse, folderResponse]) => {
        if (!active) return;
        const profile = profileResponse.data;
        setInitialProfileSnapshot({ schemaVersion: 1, ...profile });
        setFolder(folderResponse?.data ?? null);
      })
      .catch((loadError) => active && setError(toErrorMessage(loadError)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [folderId]);

  function close() {
    const returnTo = searchParams.get("returnTo");
    if (returnTo?.startsWith("/candidate/jobs/")) {
      router.push(`${returnTo}?apply=1&restoreDraft=1`);
      return;
    }
    router.push(candidateApplicationInterviewRoutes.applicationSets);
  }

  function saved(savedFolder: CandidateFolder) {
    const returnTo = searchParams.get("returnTo");
    if (returnTo?.startsWith("/candidate/jobs/")) {
      router.push(`${returnTo}?apply=1&applySet=${savedFolder.id}`);
      return;
    }
    router.push(candidateApplicationInterviewRoutes.applicationSets);
  }

  return (
    <CandidatePageShell active="accountBilling">
      <section className="candidate-mypage glass-page notion">
        <header className="candidate-mypage__head"><h1>{folderId ? "지원서 세트 수정" : "새 지원서 세트"}</h1></header>
        <StatusNotice loading={loading} error={error} />
        {!loading && !error && initialProfileSnapshot ? (
          <FolderFormPage folder={folder} initialProfileSnapshot={initialProfileSnapshot} onClose={close} onSaved={saved} />
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

function FolderFormPage({
  folder,
  initialProfileSnapshot,
  onClose,
  onSaved,
}: {
  folder: CandidateFolder | null;
  initialProfileSnapshot: CandidateProfileSnapshotV1;
  onClose: () => void;
  onSaved: (folder: CandidateFolder) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const portfolioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<CandidateFolderInput>(() =>
    folder
      ? {
          name: folder.name,
          githubUrl: folder.githubUrl ?? "",
          blogUrl: folder.blogUrl ?? "",
          portfolioUrl: folder.portfolioUrl ?? "",
          resumeFileId: folder.resumeFileId,
          portfolioFileId: folder.portfolioFileId,
          motivation: folder.motivation ?? "",
          extraNote: folder.extraNote ?? "",
          profileSnapshot: folder.profileSnapshot ?? initialProfileSnapshot,
        }
      : { ...EMPTY_FOLDER_INPUT, profileSnapshot: initialProfileSnapshot },
  );
  const [resumeFileName, setResumeFileName] = useState(folder?.resumeFileName ?? "");
  const [portfolioFileName, setPortfolioFileName] = useState(folder?.portfolioFileName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof CandidateFolderInput>(key: K, value: CandidateFolderInput[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (prev.profileSnapshot && (key === "githubUrl" || key === "blogUrl" || key === "portfolioUrl")) {
        next.profileSnapshot = {
          ...prev.profileSnapshot,
          [key]: typeof value === "string" && value.trim() ? value.trim() : null,
        };
      }
      return next;
    });
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const result = await getCandidateApi().uploadResume(file);
      update("resumeFileId", result.data.fileId);
      setResumeFileName(file.name);
    } catch (uploadError) {
      setError(toErrorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  }

  async function handlePortfolioFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const result = await getCandidateApi().uploadResume(file);
      update("portfolioFileId", result.data.fileId);
      setPortfolioFileName(file.name);
    } catch (uploadError) {
      setError(toErrorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("지원서 세트 이름을 입력하세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (folder) {
        const response = await getCandidateApi().updateFolder(folder.id, form);
        onSaved(response.data);
      } else {
        const response = await getCandidateApi().createFolder(form);
        onSaved(response.data);
      }
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
      <form className="mypage-block folder-form-page" aria-labelledby="folder-form-title" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="page-eyebrow">지원서 세트</p>
            <h2 id="folder-form-title">{folder ? "세트 편집" : "새 지원서 세트"}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {error ? <p className="notice danger">{error}</p> : null}
        <label className="folder-field">
          <span>세트 이름</span>
          <input type="text" value={form.name} placeholder="예: 카카오 백엔드" onChange={(e) => update("name", e.target.value)} maxLength={100} />
        </label>
        <p className="folder-hint">아래 프로필은 이 세트에 독립적으로 저장됩니다. 비운 항목은 지원할 때도 빈 값으로 적용됩니다.</p>
        {form.profileSnapshot ? (
          <CandidateProfileSnapshotEditor
            value={form.profileSnapshot}
            onChange={(profileSnapshot) => setForm((current) => ({
              ...current,
              profileSnapshot,
              githubUrl: profileSnapshot.githubUrl,
              blogUrl: profileSnapshot.blogUrl,
              portfolioUrl: profileSnapshot.portfolioUrl,
            }))}
          />
        ) : null}
        <label className="folder-field">
          <span>이력서</span>
          <button type="button" className="candidate-upload-drop" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {resumeFileName || "PDF 파일을 선택하세요"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="candidate-hidden-file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        <label className="folder-field">
          <span>포트폴리오 PDF</span>
          <button type="button" className="candidate-upload-drop" onClick={() => portfolioFileInputRef.current?.click()} disabled={busy}>
            {portfolioFileName || "PDF 파일을 선택하세요"}
          </button>
          <input
            ref={portfolioFileInputRef}
            type="file"
            className="candidate-hidden-file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void handlePortfolioFile(file);
            }}
          />
        </label>
        <label className="folder-field">
          <span>지원 동기</span>
          <textarea rows={3} value={form.motivation ?? ""} placeholder="이 기업/직무에 지원하는 이유" onChange={(e) => update("motivation", e.target.value)} />
        </label>
        <label className="folder-field">
          <span>추가 설명</span>
          <textarea rows={3} value={form.extraNote ?? ""} placeholder="강조하고 싶은 경험·자기소개 등" onChange={(e) => update("extraNote", e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>취소</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </form>
  );
}

type MockReportStatusView = {
  badge: string;
  title: string;
  description: string;
  helper?: string;
  tone: "neutral" | "progress" | "blocked";
};

function MockReportStatusPanel({ view }: { view: MockReportStatusView }) {
  return (
    <div className={`candidate-pipeline-card ${view.tone === "progress" ? "muted" : ""}`}>
      <div className="candidate-pipeline-card__head">
        <div>
          <strong>{view.title}</strong>
          <p>{view.description}</p>
        </div>
        <StatusPill value={view.badge} />
      </div>
      {view.helper ? <p>{view.helper}</p> : null}
    </div>
  );
}

function getMockReportStatusView(
  status: CandidateMockReportFeedback["status"] | CandidateMockReportMedia["status"] | undefined,
  feedbackError?: string,
): MockReportStatusView {
  if (status === "COMPLETED") {
    return {
      badge: "완료",
      title: "리포트 결과를 불러오는 중입니다.",
      description: "AI 분석은 완료되었고 화면에 표시할 결과를 다시 확인하고 있습니다.",
      tone: "neutral",
    };
  }

  if (status === "GENERATING") {
    return {
      badge: "분석 중",
      title: "AI가 면접 답변을 분석하고 있습니다.",
      description: "STT 텍스트와 답변 근거를 바탕으로 종합 피드백과 역량별 점수를 생성 중입니다.",
      helper: "잠시 후 결과가 자동으로 갱신됩니다.",
      tone: "progress",
    };
  }

  if (status === "FAILED") {
    return {
      badge: "실패",
      title: "리포트 분석을 완료하지 못했습니다.",
      description: "일시적인 AI 처리 오류이거나 분석에 필요한 답변 데이터가 부족할 수 있습니다.",
      helper: feedbackError && !isReportNotReadyMessage(feedbackError) ? feedbackError : "분석 다시 요청을 눌러 재시도해 주세요.",
      tone: "blocked",
    };
  }

  return {
    badge: "대기",
    title: "리포트 분석을 시작할 수 있습니다.",
    description: "면접 답변과 STT 결과가 준비되면 AI 분석을 요청해 종합 피드백을 확인할 수 있습니다.",
    helper: feedbackError && !isReportNotReadyMessage(feedbackError) ? feedbackError : "AI 분석 시작을 눌러 리포트를 생성해 주세요.",
    tone: "neutral",
  };
}

function isReportNotReadyMessage(message: string): boolean {
  return message.includes("Report is not ready") || message.includes("REPORT_NOT_READY");
}

// 모의 리포트 종합 — 실전(기업) 리포트와 동일한 게이지+레이더+강점/보완 레이아웃. (#289)
// 연습용 정책(visibilityPolicy)에 따라 합격/탈락 판정·내부 점수는 노출하지 않는다.
function MockFeedbackView({ feedback }: { feedback: CandidateMockReportFeedback }) {
  const scores = feedback.scores ?? [];
  const [selectedScoreId, setSelectedScoreId] = useState<number>(-1);
  const improvementItems = feedback.improvements;
  const nextPracticeItems = feedback.nextPractice;

  const totalScore = feedback.totalScore ?? null;
  const band = scoreBand(totalScore);
  const topScore = scores.length > 0 ? [...scores].sort((a, b) => b.score - a.score)[0] : null;
  const selectedScore = scores.find((score) => score.scoreId === selectedScoreId) ?? topScore;
  const radarReady = scores.length >= 3;

  return (
    <div className="report-overview">
      <div className="report-score-hero">
        <ReportGauge score={totalScore} tone="accent" valueLabel="종합 점수" emptyLabel="점수 준비 중" />
        <div className="report-score-side">
          <span className="report-result-row">
            {band ? <span className={`report-score-band band-${band.tone}`}>{band.label}</span> : null}
            <span className="report-cutline-caption">연습용 리포트 · 합격/탈락 판정은 제공하지 않아요</span>
          </span>
          <p className="report-summary-text">{feedback.summary ?? "리포트 요약이 아직 없습니다."}</p>
        </div>
      </div>

      {scores.length ? (
        <div className="report-competency">
          <h3>역량별 평가</h3>
          {radarReady ? (
            <div className="report-competency-layout">
              <div className="report-radar-wrap">
                <CompetencyRadar
                  items={scores.map((score) => ({
                    id: score.scoreId,
                    name: score.criterionName ?? "역량",
                    value: clampPercent(score.score),
                    cutline: null,
                  }))}
                  selectedId={selectedScore?.scoreId ?? -1}
                  onSelect={setSelectedScoreId}
                />
                <p className="report-radar-hint">그래프의 역량을 클릭하면 오른쪽에서 근거를 볼 수 있어요.</p>
              </div>
              {selectedScore ? <MockCompetencyDetailCard score={selectedScore} /> : null}
            </div>
          ) : (
            <ReportScoreList scores={scores} />
          )}
        </div>
      ) : null}

      {feedback.strengths.length > 0 || improvementItems.length > 0 ? (
        <div className="mockfb-findings">
          {feedback.strengths.length > 0 ? (
            <div className="mockfb-card is-strength">
              <div className="mockfb-card-head">
                <span className="mockfb-card-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <h3>잘한 점</h3>
              </div>
              <ul>
                {feedback.strengths.map((text, index) => (
                  <li key={`strength-${index}`}>{text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {improvementItems.length > 0 ? (
            <div className="mockfb-card is-improve">
              <div className="mockfb-card-head">
                <span className="mockfb-card-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
                </span>
                <h3>보완할 점</h3>
              </div>
              <ul>
                {improvementItems.map((text, index) => (
                  <li key={`improve-${index}`}>{text}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {nextPracticeItems.length > 0 ? (
        <div className="mockfb-practice">
          <div className="mockfb-practice-head">
            <h3>다음 연습</h3>
            <span>다음 모의면접 전에 이것만 해보세요</span>
          </div>
          <ol className="mockfb-practice-steps">
            {nextPracticeItems.map((text, index) => (
              <li key={`practice-${index}`}>
                <span className="mockfb-step-number" aria-hidden="true">{index + 1}</span>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {feedback.strengths.length === 0 && improvementItems.length === 0 && nextPracticeItems.length === 0 ? (
        <div className="empty">AI가 제공한 연습 피드백이 없습니다.</div>
      ) : null}
    </div>
  );
}

// 모의 레이더에서 선택한 역량 상세. 실전 CompetencyDetailCard와 동일 톤(가중치·합격선 없는 연습용). (#289)
function MockCompetencyDetailCard({ score }: { score: CandidateReportScoreView }) {
  const band = competencyBand(score.score);
  return (
    <aside className="report-competency-detailpanel" key={score.scoreId}>
      <div className="report-competency-detailpanel-head">
        <span className="report-competency-namewrap">
          <span className="report-competency-name">{score.criterionName ?? "역량"}</span>
        </span>
        <span className="report-competency-detailpanel-score">
          <span className={`report-competency-band tone-${band.tone}`}>{band.label}</span>
          <span className={`report-competency-score tone-${band.tone}`}>{score.score}</span>
        </span>
      </div>
      {score.rationale?.trim() ? (
        <p className="report-competency-rationale">{score.rationale}</p>
      ) : (
        <p className="report-competency-rationale is-empty">등록된 근거가 없습니다.</p>
      )}
      {score.evidences.length > 0 ? (
        <div className="report-competency-evidence">
          {score.evidences.map((evidence) => (
            <blockquote key={evidence.evidenceId}>{evidence.evidenceText}</blockquote>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function MockMediaView({ media }: { media: CandidateMockReportMedia }) {
  const hasStoredMedia = media.media.some((item) => item.videoFile || item.audioFile);
  const playbackSession = useMockReportMediaPlaybackSession(media.reportId, hasStoredMedia);
  if (!media.media.length) return <p className="empty">연결된 답변 파일이 없습니다.</p>;
  const mediaItems = orderReportAnswersByInterviewFlow(media.media);
  const nonverbalSummary = buildMockNonverbalSummary(mediaItems);
  return (
    <div className="detail-stack">
      <MockNonverbalSummaryPanel summary={nonverbalSummary} />
      <div className="report-media-list">
        {mediaItems.map((item, index) => (
          <MockMediaAnswerCard
            key={item.answerId}
            item={item}
            mediaBaseUrl={playbackSession.mediaBaseUrl}
            mediaError={playbackSession.error}
            mediaLoading={playbackSession.loading}
            questionNumber={index + 1}
          />
        ))}
      </div>
    </div>
  );
}

function useMockReportMediaPlaybackSession(reportId: number, enabled: boolean) {
  const [state, setState] = useState<{ error?: string; loading: boolean; mediaBaseUrl?: string }>({
    loading: enabled,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false });
      return;
    }

    let disposed = false;
    setState({ loading: true });
    getCandidateApi().createMockReportMediaSession(reportId)
      .then((response) => {
        if (!disposed) {
          setState({ loading: false, mediaBaseUrl: response.data.mediaBaseUrl });
        }
      })
      .catch((error) => {
        if (!disposed) {
          setState({
            error: toErrorMessage(error),
            loading: false,
          });
        }
      });

    return () => {
      disposed = true;
    };
  }, [enabled, reportId]);

  return state;
}

function MockMediaAnswerCard({
  item,
  mediaBaseUrl,
  mediaError,
  mediaLoading,
  questionNumber,
}: {
  item: CandidateMockReportMedia["media"][number];
  mediaBaseUrl?: string;
  mediaError?: string;
  mediaLoading: boolean;
  questionNumber: number;
}) {
  const videoUrl = getCachedRecordingObjectUrl(item.videoFile?.storageKey)
    ?? getMockReportMediaPlaybackUrl(mediaBaseUrl, item.videoFile?.fileId);
  const audioUrl = getCachedRecordingObjectUrl(item.audioFile?.storageKey)
    ?? getMockReportMediaPlaybackUrl(mediaBaseUrl, item.audioFile?.fileId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const videoPlaceholderMessage = item.videoFile
    ? mediaLoading
      ? "저장된 녹화 영상을 불러오는 중입니다."
      : mediaError || "저장된 녹화 영상을 불러오지 못했습니다."
    : item.audioFile
      ? "이 답변은 음성 녹화만 저장되었습니다."
      : "저장된 녹화 원본이 없습니다.";

  const seekVideo = (timeMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, timeMs / 1000);
    setPlaybackTimeMs(timeMs);
  };

  return (
    <article className="report-answer-card">
      <div className="report-answer-card__head">
        <div>
          <span>질문 {questionNumber}</span>
          <strong>{item.questionContent ?? `질문 #${item.questionId}`}</strong>
        </div>
        <StatusPill value={formatQuestionTypeLabel(item.questionType)} />
      </div>
      <div className="report-answer-card__content">
        <div className="report-answer-card__video">
          {videoUrl ? (
            <video
              ref={videoRef}
              controls
              crossOrigin="use-credentials"
              preload="metadata"
              src={videoUrl}
              onTimeUpdate={(event) => setPlaybackTimeMs(event.currentTarget.currentTime * 1000)}
            >
              녹화 영상을 재생할 수 없습니다.
            </video>
          ) : (
            <div className="report-media-placeholder">
              <strong>답변 영상</strong>
              <span>{videoPlaceholderMessage}</span>
            </div>
          )}
        </div>
        <div className="script-box report-answer-card__script">
          <strong>스크립트</strong>
          <TranscriptText
            transcript={item.transcript}
            transcriptStatus={item.transcriptStatus}
            evaluationStatus={item.evaluationStatus}
            transcriptUnavailableReason={item.transcriptUnavailableReason}
          />
          <FollowUpQuestionList questions={item.followUpQuestions} />
          <dl className="report-answer-meta">
            <Definition label="답변 시간" value={`${item.durationSeconds}s`} />
          </dl>
          {audioUrl ? (
            <audio className="report-audio-player" controls crossOrigin="use-credentials" preload="metadata" src={audioUrl}>
              음성 파일을 재생할 수 없습니다.
            </audio>
          ) : null}
        </div>
      </div>
      <details className="report-answer-detail">
        <summary>상세 보기</summary>
        <div className="report-answer-detail__body">
          <MockVisualAnalysisPanel
            metadata={item.nonverbalMetadata}
            durationMs={Math.max(1000, item.durationSeconds * 1000)}
            playbackTimeMs={playbackTimeMs}
            videoAvailable={Boolean(videoUrl)}
            onSeek={seekVideo}
          />
          <MockNonverbalFeedbackView metadata={item.nonverbalMetadata} />
        </div>
      </details>
    </article>
  );
}

function getMockReportMediaPlaybackUrl(mediaBaseUrl?: string, fileId?: number): string | undefined {
  if (!mediaBaseUrl || !fileId) {
    return undefined;
  }
  return `${mediaBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(String(fileId))}`;
}

type MockVisualAnalysisTab = "gaze" | "headPose";

function MockVisualAnalysisPanel({
  metadata,
  durationMs,
  playbackTimeMs,
  videoAvailable,
  onSeek,
}: {
  metadata?: Record<string, unknown>;
  durationMs: number;
  playbackTimeMs: number;
  videoAvailable: boolean;
  onSeek(timeMs: number): void;
}) {
  const [activeTab, setActiveTab] = useState<MockVisualAnalysisTab>("gaze");
  const gazeTimeline = useMemo(() => readGazeTimeline(metadata), [metadata]);
  const headPoseTimeline = useMemo(() => readHeadPoseTimeline(metadata), [metadata]);
  const gazeSummary = useMemo(() => summarizeGazeTimeline(gazeTimeline), [gazeTimeline]);
  const headPoseSummary = useMemo(() => summarizeHeadPoseTimeline(headPoseTimeline), [headPoseTimeline]);
  const analysisDurationMs = Math.max(
    durationMs,
    gazeTimeline[gazeTimeline.length - 1]?.tMs ?? 0,
    headPoseTimeline[headPoseTimeline.length - 1]?.tMs ?? 0,
  );
  const gazeAwayIntervals = useMemo(
    () => readGazeAwayIntervals(metadata, analysisDurationMs),
    [analysisDurationMs, metadata],
  );
  const gazeAnalysisQuality = useMemo(
    () => evaluateTimelineAnalysisQuality(gazeTimeline.length, durationMs),
    [durationMs, gazeTimeline.length],
  );
  const headPoseAnalysisQuality = useMemo(
    () => evaluateTimelineAnalysisQuality(headPoseTimeline.length, durationMs),
    [durationMs, headPoseTimeline.length],
  );
  const activeAnalysisQuality = activeTab === "gaze" ? gazeAnalysisQuality : headPoseAnalysisQuality;

  return (
    <section className="report-visual-analysis" aria-label="답변 비언어 세부 분석">
      <div className="report-visual-analysis__head">
        <div>
          <span>답변 영상 세부 분석</span>
          <strong>시선과 고개 움직임</strong>
          <p>카메라 기준 추정값을 시간 흐름에 따라 보여주는 연습용 참고 정보입니다.</p>
        </div>
        <span className="report-visual-analysis__sample-count">
          {gazeTimeline.length + headPoseTimeline.length}개 표본
        </span>
      </div>
      <div className="report-visual-analysis__tabs" role="tablist" aria-label="비언어 분석 항목">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "gaze"}
          className={activeTab === "gaze" ? "is-active" : undefined}
          onClick={() => setActiveTab("gaze")}
        >
          시선 방향
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "headPose"}
          className={activeTab === "headPose" ? "is-active" : undefined}
          onClick={() => setActiveTab("headPose")}
        >
          고개 움직임
        </button>
      </div>

      {activeAnalysisQuality.status === "INSUFFICIENT" ? (
        <div className="report-visual-analysis__empty">
          <strong>분석 표본이 부족합니다.</strong>
          <p>
            {activeAnalysisQuality.reason === "NO_SAMPLES"
              ? "수집 이전 답변이거나 카메라에서 얼굴과 눈을 안정적으로 감지하지 못해 이 항목을 평가하지 않았습니다."
              : "카메라 해상도·조명 또는 얼굴과 눈의 감지 상태로 표본을 충분히 확보하지 못해 이 항목을 평가하지 않았습니다."}
          </p>
        </div>
      ) : activeTab === "gaze" ? (
        <div className="report-visual-analysis__body" role="tabpanel">
          <div className="report-visual-analysis__chart-grid">
            <VisualTimelineChart
              title="시간별 시선 변화"
              samples={gazeTimeline}
              durationMs={analysisDurationMs}
              playbackTimeMs={playbackTimeMs}
              series={[
                { label: "좌우", color: "#3B6FE0", value: (sample) => sample.horizontalOffset },
                { label: "상하", color: "#159a8c", value: (sample) => sample.verticalOffset },
              ]}
              minimumScale={0.2}
              highlights={gazeAwayIntervals}
              highlightLabel="시선 이탈"
              videoAvailable={videoAvailable}
              onSeek={onSeek}
            />
            <GazeScatterChart samples={gazeTimeline} playbackTimeMs={playbackTimeMs} />
          </div>
          <VisualAnalysisGuide message={buildGazeAnalysisGuide(gazeSummary.centeredRatio)} />
        </div>
      ) : (
        <div className="report-visual-analysis__body" role="tabpanel">
          <VisualTimelineChart
            title="시간별 고개 각도 변화"
            samples={headPoseTimeline}
            durationMs={analysisDurationMs}
            playbackTimeMs={playbackTimeMs}
            series={[
              { label: "좌우", color: "#3B6FE0", value: (sample) => sample.yawDegrees },
              { label: "상하", color: "#159a8c", value: (sample) => sample.pitchDegrees },
              { label: "기울기", color: "#d97706", value: (sample) => sample.rollDegrees },
            ]}
            minimumScale={20}
            unit="°"
            videoAvailable={videoAvailable}
            onSeek={onSeek}
          />
          <VisualAnalysisGuide message={buildHeadPoseAnalysisGuide(headPoseSummary.frontalRatio)} />
        </div>
      )}
    </section>
  );
}

type TimelineSample = { tMs: number };
type TimelineSeries<T extends TimelineSample> = {
  label: string;
  color: string;
  value(sample: T): number;
};

function VisualTimelineChart<T extends TimelineSample>({
  title,
  samples,
  durationMs,
  playbackTimeMs,
  series,
  minimumScale,
  unit = "",
  highlights = [],
  highlightLabel = "참고 구간",
  videoAvailable,
  onSeek,
}: {
  title: string;
  samples: T[];
  durationMs: number;
  playbackTimeMs: number;
  series: TimelineSeries<T>[];
  minimumScale: number;
  unit?: string;
  highlights?: InterviewGazeAwayInterval[];
  highlightLabel?: string;
  videoAvailable: boolean;
  onSeek(timeMs: number): void;
}) {
  const width = 760;
  const height = 230;
  const left = 48;
  const right = 18;
  const top = 20;
  const bottom = 36;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const observedMaximum = Math.max(
    minimumScale,
    ...samples.flatMap((sample) => series.map((item) => Math.abs(item.value(sample)))),
  );
  const scale = Math.ceil(observedMaximum * 10) / 10;
  const xForTime = (tMs: number) => left + Math.min(1, Math.max(0, tMs / durationMs)) * chartWidth;
  const yForValue = (value: number) => top + (1 - (value + scale) / (scale * 2)) * chartHeight;
  const playbackX = xForTime(playbackTimeMs);

  const seekFromPointer = (clientX: number, target: SVGSVGElement) => {
    if (!videoAvailable) return;
    const bounds = target.getBoundingClientRect();
    const pointerX = (clientX - bounds.left) / bounds.width * width;
    const ratio = Math.min(1, Math.max(0, (pointerX - left) / chartWidth));
    onSeek(ratio * durationMs);
  };

  return (
    <figure className="report-visual-chart">
      <figcaption>
        <strong>{title}</strong>
        <span>{videoAvailable ? "그래프를 눌러 영상 시점 이동" : "저장된 시계열 기준"}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role={videoAvailable ? "button" : "img"}
        aria-label={`${title}. 세로 범위 마이너스 ${scale}${unit}부터 ${scale}${unit}`}
        tabIndex={videoAvailable ? 0 : undefined}
        onPointerDown={(event) => seekFromPointer(event.clientX, event.currentTarget)}
        onKeyDown={(event) => {
          if (!videoAvailable) return;
          if (event.key === "ArrowLeft") onSeek(Math.max(0, playbackTimeMs - 1000));
          if (event.key === "ArrowRight") onSeek(Math.min(durationMs, playbackTimeMs + 1000));
        }}
      >
        {highlights.map((highlight, index) => {
          const startX = xForTime(highlight.startMs);
          const endX = xForTime(highlight.endMs);
          return (
            <rect
              key={`${highlight.startMs}-${highlight.endMs}-${index}`}
              className="report-visual-chart__highlight"
              x={startX}
              y={top}
              width={Math.max(2, endX - startX)}
              height={chartHeight}
            >
              <title>{`${highlightLabel} ${formatAnalysisTime(highlight.startMs)}-${formatAnalysisTime(highlight.endMs)}`}</title>
            </rect>
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + ratio * chartHeight;
          const value = scale - ratio * scale * 2;
          return (
            <g key={ratio}>
              <line className="report-visual-chart__grid" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="report-visual-chart__axis" x={left - 8} y={y + 4} textAnchor="end">
                {value.toFixed(unit ? 0 : 1)}{unit}
              </text>
            </g>
          );
        })}
        {series.map((item) => (
          <polyline
            key={item.label}
            fill="none"
            stroke={item.color}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={samples.map((sample) => `${xForTime(sample.tMs)},${yForValue(item.value(sample))}`).join(" ")}
          />
        ))}
        <line className="report-visual-chart__cursor" x1={playbackX} x2={playbackX} y1={top} y2={height - bottom} />
        {[0, 0.5, 1].map((ratio) => (
          <text
            key={ratio}
            className="report-visual-chart__axis"
            x={left + ratio * chartWidth}
            y={height - 12}
            textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
          >
            {formatAnalysisTime(durationMs * ratio)}
          </text>
        ))}
      </svg>
      <div className="report-visual-chart__legend" aria-label="그래프 범례">
        {series.map((item) => (
          <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>
        ))}
      </div>
      {highlights.length > 0 ? (
        <div className="report-visual-chart__events" aria-label={`${highlightLabel} 구간`}>
          <strong>{highlightLabel} 구간</strong>
          <div>
            {highlights.map((highlight, index) => (
              <button
                key={`${highlight.startMs}-${highlight.endMs}-${index}`}
                type="button"
                disabled={!videoAvailable}
                onClick={() => onSeek(highlight.startMs)}
                title={videoAvailable ? "해당 영상 시점으로 이동" : "저장된 영상이 없습니다"}
              >
                {formatAnalysisTime(highlight.startMs)}-{formatAnalysisTime(highlight.endMs)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </figure>
  );
}

function GazeScatterChart({ samples, playbackTimeMs }: { samples: InterviewGazeTimelineSample[]; playbackTimeMs: number }) {
  const width = 360;
  const height = 230;
  const padding = 30;
  const scale = Math.max(
    0.2,
    ...samples.flatMap((sample) => [Math.abs(sample.horizontalOffset), Math.abs(sample.verticalOffset)]),
  );
  const pointFor = (sample: InterviewGazeTimelineSample) => ({
    x: width / 2 + sample.horizontalOffset / (scale * 2) * (width - padding * 2),
    y: height / 2 + sample.verticalOffset / (scale * 2) * (height - padding * 2),
  });
  const activeSample = samples.reduce((nearest, sample) =>
    Math.abs(sample.tMs - playbackTimeMs) < Math.abs(nearest.tMs - playbackTimeMs) ? sample : nearest,
  samples[0]);

  return (
    <figure className="report-visual-chart report-visual-chart--scatter">
      <figcaption>
        <strong>시선 분포</strong>
        <span>중앙점 기준 상대 위치</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="카메라 중앙 기준 시선 분포">
        <line className="report-visual-chart__grid" x1={width / 2} x2={width / 2} y1={padding} y2={height - padding} />
        <line className="report-visual-chart__grid" x1={padding} x2={width - padding} y1={height / 2} y2={height / 2} />
        <circle className="report-visual-chart__center-zone" cx={width / 2} cy={height / 2} r="42" />
        {samples.map((sample) => {
          const point = pointFor(sample);
          const active = sample === activeSample;
          return <circle key={sample.tMs} cx={point.x} cy={point.y} r={active ? 6 : 3.5} className={active ? "is-active" : undefined} />;
        })}
        <text className="report-visual-chart__axis" x={width / 2} y={18} textAnchor="middle">위</text>
        <text className="report-visual-chart__axis" x={width / 2} y={height - 6} textAnchor="middle">아래</text>
        <text className="report-visual-chart__axis" x={8} y={height / 2 + 4}>왼쪽</text>
        <text className="report-visual-chart__axis" x={width - 8} y={height / 2 + 4} textAnchor="end">오른쪽</text>
      </svg>
    </figure>
  );
}

function VisualAnalysisGuide({ message }: { message: string }) {
  return (
    <div className="report-visual-analysis__guide">
      <strong>연습 포인트</strong>
      <p>{message}</p>
    </div>
  );
}

function buildGazeAnalysisGuide(centeredRatio: number) {
  if (centeredRatio >= 0.8) {
    return "카메라 기준 시선 추정값이 대체로 중앙 범위에 머물렀습니다. 자연스러운 사고 과정의 시선 이동은 정상이며, 핵심 문장에서 현재 흐름을 유지해 보세요.";
  }
  if (centeredRatio >= 0.6) {
    return "시선이 자연스럽게 이동한 구간이 있습니다. 답변의 결론이나 성과를 말할 때 카메라 근처로 시선을 돌아오는 연습이 전달력을 높이는 데 도움이 됩니다.";
  }
  return "카메라 중앙을 벗어난 시선 추정 구간이 비교적 자주 관찰됐습니다. 외운 문장을 고정해 읽기보다 핵심 키워드만 정리하고 카메라를 보며 말하는 연습을 해보세요.";
}

function buildHeadPoseAnalysisGuide(frontalRatio: number) {
  if (frontalRatio >= 0.8) {
    return "답변 중 고개가 대체로 정면 범위에 유지됐습니다. 강조할 때의 자연스러운 움직임은 유지하되 화면 중심에서 크게 벗어나지 않도록 해보세요.";
  }
  if (frontalRatio >= 0.6) {
    return "고개 움직임이 일부 크게 나타난 구간이 있습니다. 질문을 듣고 생각한 뒤 답변을 시작할 때 정면 자세로 돌아오면 더 안정적으로 보입니다.";
  }
  return "좌우 또는 상하 고개 변화가 비교적 크게 관찰됐습니다. 화면에 질문이나 메모를 분산해 두기보다 카메라 주변 한곳에 시선을 모아 연습해 보세요.";
}

function formatAnalysisTime(timeMs: number) {
  const totalSeconds = Math.max(0, Math.round(timeMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

type MockNonverbalSummary = {
  answerCount: number;
  answersWithMetadata: number;
  stableAnswerCount: number;
  integritySignalAnswers: number;
  screenAwaySignalAnswers: number;
  cameraIntegritySignalAnswers: number;
  faceAwaySignalAnswers: number;
  multipleFaceSignalAnswers: number;
  faceShiftSignalAnswers: number;
  gazeAwaySignalAnswers: number;
  voiceMouthMismatchSignalAnswers: number;
  voiceWithoutFaceSignalAnswers: number;
  staticVideoFrameSignalAnswers: number;
  earlyScreenAwaySignalAnswers: number;
};

function MockNonverbalSummaryPanel({ summary }: { summary: MockNonverbalSummary }) {
  if (summary.answersWithMetadata === 0) return null;

  const hasSignal = summary.integritySignalAnswers > 0;
  const statusLabel = hasSignal ? "무결성 확인 필요" : "무결성 안정";

  // 신호 있는 항목만 기본 노출, 0인 항목은 접기 안으로. (#289 정리)
  const signalTiles = [
    { label: "시선 이탈", count: summary.gazeAwaySignalAnswers },
    { label: "화면 이탈", count: summary.screenAwaySignalAnswers },
    { label: "카메라 이탈", count: summary.cameraIntegritySignalAnswers },
    { label: "얼굴 이탈", count: summary.faceAwaySignalAnswers },
    { label: "여러 사람", count: summary.multipleFaceSignalAnswers },
    { label: "위치 급변", count: summary.faceShiftSignalAnswers },
    { label: "음성-입모양", count: summary.voiceMouthMismatchSignalAnswers },
    { label: "음성-얼굴", count: summary.voiceWithoutFaceSignalAnswers },
    { label: "영상 고정", count: summary.staticVideoFrameSignalAnswers },
    { label: "초반 이탈", count: summary.earlyScreenAwaySignalAnswers },
  ];
  const flaggedTiles = signalTiles.filter((tile) => tile.count > 0);

  return (
    <section className="report-nonverbal-summary">
      <div className="report-nonverbal-summary__head">
        <div>
          <strong>모의면접 부정행위 의심 신호</strong>
          <p>화면 이탈, 얼굴 화면 밖, 여러 사람 감지처럼 면접 중 응시 무결성 확인이 필요한 신호입니다. 확정 판정이 아니라 연습용 참고 정보예요.</p>
        </div>
        <StatusPill value={statusLabel} />
      </div>

      {hasSignal ? (
        <div className="report-nonverbal-tiles" role="list">
          {flaggedTiles.map((tile) => (
            <div key={tile.label} role="listitem" className="report-nonverbal-tile is-flag">
              <strong>{tile.count}</strong>
              <span>{tile.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="report-nonverbal-summary__ok">특이 신호 없이 안정적으로 응시했어요. ({summary.answersWithMetadata}/{summary.answerCount}개 답변 분석)</p>
      )}

      <details className="report-nonverbal-more">
        <summary>전체 지표 보기</summary>
        <div className="report-nonverbal-tiles" role="list">
          {signalTiles.map((tile) => (
            <div key={tile.label} role="listitem" className={`report-nonverbal-tile${tile.count > 0 ? " is-flag" : ""}`}>
              <strong>{tile.count}</strong>
              <span>{tile.label}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function buildMockNonverbalSummary(items: CandidateMockReportMedia["media"]): MockNonverbalSummary {
  return items.reduce<MockNonverbalSummary>((summary, item) => {
    const metadata = item.nonverbalMetadata;
    summary.answerCount += 1;
    if (!metadata) return summary;

    summary.answersWithMetadata += 1;
    const screenAwaySignal = readNonverbalScreenAwayCount(metadata) > 0;
    const cameraIntegritySignal = readNonverbalCameraLostCount(metadata) > 0 || readNonverbalTestModeUsed(metadata);
    const faceAwaySignal = readNonverbalFaceAwayCount(metadata) > 0;
    const multipleFaceSignal = readNonverbalMultipleFaceCount(metadata) > 0;
    const faceShiftSignal = readNonverbalFacePositionShiftCount(metadata) > 0;
    const gazeAwaySignal = readNonverbalGazeAwayCount(metadata) > 0;
    const voiceMouthMismatchSignal = readNonverbalVoiceMouthMismatchCount(metadata) > 0;
    const voiceWithoutFaceSignal = readNonverbalVoiceWithoutFaceCount(metadata) > 0;
    const staticVideoFrameSignal = readNonverbalStaticVideoFrameCount(metadata) > 0;
    const earlyScreenAwaySignal = readNonverbalEarlyScreenAwayCount(metadata) > 0;
    const integritySignal =
      screenAwaySignal ||
      cameraIntegritySignal ||
      faceAwaySignal ||
      multipleFaceSignal ||
      faceShiftSignal ||
      gazeAwaySignal ||
      voiceMouthMismatchSignal ||
      voiceWithoutFaceSignal ||
      staticVideoFrameSignal ||
      earlyScreenAwaySignal;

    if (integritySignal) summary.integritySignalAnswers += 1;
    if (screenAwaySignal) summary.screenAwaySignalAnswers += 1;
    if (cameraIntegritySignal) summary.cameraIntegritySignalAnswers += 1;
    if (faceAwaySignal) summary.faceAwaySignalAnswers += 1;
    if (multipleFaceSignal) summary.multipleFaceSignalAnswers += 1;
    if (faceShiftSignal) summary.faceShiftSignalAnswers += 1;
    if (gazeAwaySignal) summary.gazeAwaySignalAnswers += 1;
    if (voiceMouthMismatchSignal) summary.voiceMouthMismatchSignalAnswers += 1;
    if (voiceWithoutFaceSignal) summary.voiceWithoutFaceSignalAnswers += 1;
    if (staticVideoFrameSignal) summary.staticVideoFrameSignalAnswers += 1;
    if (earlyScreenAwaySignal) summary.earlyScreenAwaySignalAnswers += 1;
    if (!integritySignal) {
      summary.stableAnswerCount += 1;
    }

    return summary;
  }, {
    answerCount: 0,
    answersWithMetadata: 0,
    stableAnswerCount: 0,
    integritySignalAnswers: 0,
    screenAwaySignalAnswers: 0,
    cameraIntegritySignalAnswers: 0,
    faceAwaySignalAnswers: 0,
    multipleFaceSignalAnswers: 0,
    faceShiftSignalAnswers: 0,
    gazeAwaySignalAnswers: 0,
    voiceMouthMismatchSignalAnswers: 0,
    voiceWithoutFaceSignalAnswers: 0,
    staticVideoFrameSignalAnswers: 0,
    earlyScreenAwaySignalAnswers: 0,
  });
}

function MockNonverbalFeedbackView({ metadata }: { metadata?: Record<string, unknown> }) {
  const feedbackItems = buildMockNonverbalFeedbackItems(metadata);
  if (!feedbackItems.length) return null;

  return (
    <section className="report-practice-guide">
      <h4>응시 무결성 피드백</h4>
      <div className="report-practice-guide__block">
        <strong>참고 신호</strong>
        <ul>
          {feedbackItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>확정 판정이 아니라 모의면접 중 부정행위로 오해받을 수 있는 행동을 줄이기 위한 연습용 신호입니다.</p>
      </div>
    </section>
  );
}

function buildMockNonverbalFeedbackItems(metadata?: Record<string, unknown>): string[] {
  if (!metadata) return [];

  const screenAwayCount = readNonverbalScreenAwayCount(metadata);
  const cameraLostCount = readNonverbalCameraLostCount(metadata);
  const faceAwayCount = readNonverbalFaceAwayCount(metadata);
  const multipleFaceCount = readNonverbalMultipleFaceCount(metadata);
  const faceShiftCount = readNonverbalFacePositionShiftCount(metadata);
  const gazeAwayCount = readNonverbalGazeAwayCount(metadata);
  const voiceMouthMismatchCount = readNonverbalVoiceMouthMismatchCount(metadata);
  const voiceWithoutFaceCount = readNonverbalVoiceWithoutFaceCount(metadata);
  const staticVideoFrameCount = readNonverbalStaticVideoFrameCount(metadata);
  const earlyScreenAwayCount = readNonverbalEarlyScreenAwayCount(metadata);
  const suspicionLevel = readNonverbalIntegritySuspicionLevel(metadata);
  const testModeUsed = readNonverbalTestModeUsed(metadata);
  const items: string[] = [];

  if (screenAwayCount > 0) {
    items.push("면접 중 화면 이탈 또는 탭 숨김 신호가 감지되었습니다. 실제 면접에서는 답변 화면을 유지하는 습관을 연습해 보세요.");
  }
  if (cameraLostCount > 0 || testModeUsed) {
    items.push("카메라가 끊기거나 카메라 판단이 제한된 구간이 있었습니다. 실제 면접에서는 얼굴과 상반신이 안정적으로 보이는 환경을 유지해 주세요.");
  }
  if (faceAwayCount > 0) {
    items.push("얼굴이 화면 밖으로 나가거나 일정 시간 감지되지 않았습니다. 스크립트, 휴대폰, 다른 모니터를 보는 행동으로 오해받을 수 있습니다.");
  }
  if (multipleFaceCount > 0) {
    items.push("여러 사람이 감지되었습니다. 실제 면접에서는 주변 사람이 화면에 들어오거나 답변을 돕는 상황을 피해야 합니다.");
  }
  if (faceShiftCount > 0) {
    items.push("얼굴 위치가 기준 위치와 크게 달라졌습니다. 자리 이탈이나 응시자 변경으로 오해받지 않도록 화면 중앙을 유지해 주세요.");
  }
  if (gazeAwayCount > 0) {
    items.push("시선이 화면 밖으로 오래 벗어난 구간이 감지되었습니다. 다른 모니터, 휴대폰, 메모를 참고하는 행동으로 오해받을 수 있습니다.");
  }
  if (voiceMouthMismatchCount > 0) {
    items.push("음성은 감지됐지만 화면 속 입 움직임이 거의 없는 구간이 있었습니다. 실제 면접에서는 녹음 재생이나 외부 음성으로 오해받지 않도록 카메라를 정면에 두고 본인이 직접 말하는 모습이 보이게 해주세요.");
  }
  if (voiceWithoutFaceCount > 0) {
    items.push("얼굴이 감지되지 않는 상태에서 음성 입력이 지속된 구간이 있었습니다. 실제 면접에서는 카메라 안에 얼굴이 안정적으로 보이는 상태에서 답변해 주세요.");
  }
  if (staticVideoFrameCount > 0) {
    items.push("답변 중 영상 변화가 거의 없는 구간이 있었습니다. 카메라가 멈춘 화면이나 가려진 화면처럼 보이지 않도록 조명과 카메라 상태를 확인해 주세요.");
  }
  if (earlyScreenAwayCount > 0) {
    items.push("질문 직후 면접 화면을 벗어난 신호가 있었습니다. 실제 면접에서는 질문 확인 후 바로 면접 화면 안에서 답변을 준비하는 편이 좋습니다.");
  }
  if (suspicionLevel === "HIGH") {
    items.push("여러 응시 무결성 신호가 겹쳐 감지되었습니다. 실제 면접에서는 화면 이탈과 외부 자료 참고로 오해받을 수 있는 행동을 피하는 것이 좋습니다.");
  }
  if (!items.length) {
    items.push("면접 중 화면 이탈, 얼굴 화면 밖, 여러 사람 감지 같은 응시 무결성 신호가 감지되지 않았습니다.");
  }

  return items;
}

function readNonverbalNumber(metadata: Record<string, unknown>, key: string): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readNonverbalBoolean(metadata: Record<string, unknown>, key: string): boolean {
  return metadata[key] === true;
}

function readNonverbalRecord(metadata: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = metadata[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readNonverbalIntegritySummary(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  return readNonverbalRecord(metadata, "integritySummary");
}

function readNonverbalIntegrityEvents(metadata: Record<string, unknown>): Array<Record<string, unknown>> {
  const value = metadata.integrityEvents;
  return Array.isArray(value)
    ? value.filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object" && !Array.isArray(event))
    : [];
}

function readNonverbalEventCount(metadata: Record<string, unknown>, types: InterviewIntegrityEventType[]): number {
  const events = readNonverbalIntegrityEvents(metadata);
  return events.filter((event) => typeof event.type === "string" && types.includes(event.type as InterviewIntegrityEventType)).length;
}

function readNonverbalScreenAwayCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "screenAwayCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["TAB_HIDDEN", "WINDOW_BLUR"]);
}

function readNonverbalCameraLostCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "cameraLostCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["CAMERA_LOST"]);
}

function readNonverbalFaceMissingCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "faceMissingCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["FACE_MISSING"]);
}

function readNonverbalFaceOutOfFrameCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "faceOutOfFrameCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["FACE_OUT_OF_FRAME"]);
}

function readNonverbalFaceAwayCount(metadata: Record<string, unknown>): number {
  return readNonverbalFaceMissingCount(metadata) + readNonverbalFaceOutOfFrameCount(metadata);
}

function readNonverbalMultipleFaceCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "multipleFacesCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["MULTIPLE_FACES"]);
}

function readNonverbalFacePositionShiftCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "facePositionShiftCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["FACE_POSITION_SHIFT"]);
}

function readNonverbalGazeAwayCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "gazeAwayCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["GAZE_AWAY"]);
}

function readNonverbalVoiceMouthMismatchCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "voiceMouthMismatchCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["VOICE_MOUTH_MISMATCH"]);
}

function readNonverbalVoiceWithoutFaceCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "voiceWithoutFaceCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["VOICE_WITHOUT_FACE"]);
}

function readNonverbalStaticVideoFrameCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "staticVideoFrameCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["STATIC_VIDEO_FRAME"]);
}

function readNonverbalEarlyScreenAwayCount(metadata: Record<string, unknown>): number {
  const summary = readNonverbalIntegritySummary(metadata);
  const summaryCount = summary ? readNonverbalNumber(summary, "earlyScreenAwayCount") : 0;
  return summaryCount || readNonverbalEventCount(metadata, ["EARLY_SCREEN_AWAY"]);
}

function readNonverbalIntegritySuspicionLevel(metadata: Record<string, unknown>): InterviewIntegritySuspicionLevel {
  const summary = readNonverbalIntegritySummary(metadata);
  const level = summary?.suspicionLevel;
  return level === "LOW" || level === "MEDIUM" || level === "HIGH" ? level : "NONE";
}

function readNonverbalTestModeUsed(metadata: Record<string, unknown>): boolean {
  const risk = readNonverbalRecord(metadata, "risk");
  return readNonverbalBoolean(metadata, "testModeUsed") || Boolean(risk?.testModeUsed);
}

function ApplicationStatusView({ status }: { status: CandidateApplicationStatusView }) {
  return (
    <dl className="candidate-feature__summary">
      <Definition label="회사" value={status.companyName} />
      <Definition label="공고" value={status.jobTitle} />
      <Definition label="지원 상태" value={<StatusPill value={status.applicationStatus} />} />
      <Definition label="서류 상태" value={<StatusPill value={status.documentStatus} />} />
      <Definition label="면접 상태" value={<StatusPill value={status.interviewStatus} />} />
      <Definition label="리포트 상태" value={<StatusPill value={status.reportStatus} />} />
      <Definition label="세션 ID" value={status.sessionId} />
      <Definition label="제출일" value={formatDateTime(status.submittedAt)} />
    </dl>
  );
}

function RecruitingReportView({ report }: { report: CandidateRecruitingReportView }) {
  const isCompleted = report.status === "COMPLETED";
  const isFailed = report.status === "FAILED";
  const statusMessage = isCompleted
    ? "AI 분석이 완료되어 기업 검토 단계로 전달되었습니다."
    : isFailed
      ? "면접은 제출되었지만 AI 분석 상태 확인이 필요합니다. 기업 담당자가 확인 후 안내할 예정입니다."
      : "면접이 정상적으로 제출되었습니다. AI 분석이 완료되면 기업 검토 단계로 전달됩니다.";

  return (
    <div className="detail-stack">
      <dl className="candidate-feature__summary">
        <Definition label="상태" value={<StatusPill value={report.status} />} />
        <Definition label="회사" value={report.companyName} />
        <Definition label="공고" value={report.jobTitle} />
        <Definition label="다음 단계" value={report.nextStepLabel} />
      </dl>
      <div className="description-box">
        <strong>면접이 정상적으로 제출되었습니다.</strong>
        <p>{statusMessage}</p>
        <p>최종 결과는 기업 검토 후 안내됩니다.</p>
      </div>
    </div>
  );
}

function ReportScoreList({ scores }: { scores: CandidateReportScoreView[] }) {
  if (!scores.length) {
    return <p className="empty">표시할 평가 점수가 아직 없습니다.</p>;
  }

  return (
    <div>
      <h3 className="candidate-section-title">AI 평가 결과</h3>
      <div className="report-score-list">
        {scores.map((score) => {
          const band = getReportScoreBand(score.score);
          return (
            <article className="report-score-card" key={score.scoreId}>
              <div className="report-score-card__head">
                <strong>{score.criterionName ?? `평가 항목 #${score.criterionId ?? score.scoreId}`}</strong>
                <span>{score.score}점 · {band.label}</span>
              </div>
              <p className="report-score-card__band">{band.range} 구간 · {band.description}</p>
              {score.rationale ? <p>{score.rationale}</p> : null}
              <EvidenceList evidences={score.evidences} criterionName={score.criterionName} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function orderReportAnswersByInterviewFlow<T extends {
  answerId: number;
  questionContent?: string;
  questionType?: QuestionType;
  sortOrder?: number;
  followUpQuestions: CandidateFollowUpQuestionView[];
}>(answers: T[]): T[] {
  const normalizedContentToAnswer = new Map<string, T>();
  for (const answer of answers) {
    const key = normalizeReportQuestionContent(answer.questionContent);
    if (key) normalizedContentToAnswer.set(key, answer);
  }

  const baseAnswers = answers
    .filter((answer) => answer.questionType !== "FOLLOW_UP")
    .sort(compareReportAnswers);
  const ordered: T[] = [];
  const usedAnswerIds = new Set<number>();

  for (const answer of baseAnswers) {
    ordered.push(answer);
    usedAnswerIds.add(answer.answerId);

    for (const followUp of answer.followUpQuestions) {
      const followUpAnswer = normalizedContentToAnswer.get(normalizeReportQuestionContent(followUp.content));
      if (!followUpAnswer || usedAnswerIds.has(followUpAnswer.answerId)) continue;
      ordered.push(followUpAnswer);
      usedAnswerIds.add(followUpAnswer.answerId);
    }
  }

  const remainingAnswers = answers
    .filter((answer) => !usedAnswerIds.has(answer.answerId))
    .sort(compareReportAnswers);
  return [...ordered, ...remainingAnswers];
}

function normalizeReportQuestionContent(value?: string): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function compareReportAnswers(
  left: { sortOrder?: number; answerId: number },
  right: { sortOrder?: number; answerId: number },
): number {
  return (left.sortOrder ?? left.answerId) - (right.sortOrder ?? right.answerId);
}

function TranscriptText({
  transcript,
  transcriptStatus,
  evaluationStatus,
  transcriptUnavailableReason,
}: {
  transcript?: string;
  transcriptStatus: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
}) {
  if (evaluationStatus === "STT_UNAVAILABLE" || transcriptStatus === "UNAVAILABLE") {
    return (
      <>
        <span className="badge warning">평가 미완료</span>
        <p>{transcriptUnavailableReason ?? "음성 인식 실패로 실제 답변 텍스트를 확보하지 못했습니다."}</p>
      </>
    );
  }

  return <p>{transcript ?? (transcriptStatus === "AVAILABLE" ? "스크립트를 불러오는 중입니다." : "STT 처리 대기 중입니다.")}</p>;
}

function FollowUpQuestionList({ questions }: { questions: CandidateReportAnswerView["followUpQuestions"] }) {
  if (!questions.length) {
    return null;
  }

  return (
    <div className="report-follow-up-list">
      <strong>꼬리질문</strong>
      <ul>
        {questions.map((question) => (
          <li key={question.followUpId}>
            <span>{question.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceList({ evidences, criterionName }: { evidences: CandidateReportEvidenceView[]; criterionName?: string }) {
  if (!evidences.length) {
    return null;
  }

  return (
    <div className="report-evidence-list">
      <strong>평가 근거</strong>
      <ul>
        {evidences.map((evidence) => (
          <li key={evidence.evidenceId}>
            <span>{formatEvidenceSummary(evidence, criterionName)}</span>
            {evidence.evidenceText ? (
              <p className="report-evidence-list__answer">{formatEvidenceReference(evidence)}</p>
            ) : null}
            <small>{formatEvidenceSourceLabel(evidence)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatEvidenceSummary(evidence: CandidateReportEvidenceView, criterionName?: string): string {
  const focus = formatCriterionEvidenceFocus(criterionName);
  const source = formatEvidenceSourceNoun(evidence.sourceType);
  return `${focus} ${source}를 참고했습니다.`;
}

function formatCriterionEvidenceFocus(criterionName?: string): string {
  const labels: Record<string, string> = {
    "직무 적합성": "JD와 답변 경험의 연결성을 판단하는 데",
    "직무/기술 역량": "JD와 답변 경험의 연결성을 판단하는 데",
    "문제 해결력": "문제를 나누어 확인한 과정을 판단하는 데",
    "실행력과 성과": "직접 수행한 작업과 결과를 판단하는 데",
    "학습 민첩성": "학습한 내용을 실제 문제에 적용한 흐름을 판단하는 데",
    "협업/커뮤니케이션": "상황 설명과 협업 방식을 판단하는 데",
    "커뮤니케이션": "상황 설명과 협업 방식을 판단하는 데",
    "학습/성장성": "학습한 내용을 실제 문제에 적용한 흐름을 판단하는 데",
    "책임감/신뢰성": "회고와 개선 가능성을 판단하는 데",
    "성장 가능성": "회고와 개선 가능성을 판단하는 데",
  };

  return criterionName ? labels[criterionName] ?? `${criterionName} 항목을 판단하는 데` : "답변 흐름을 확인하는 데";
}

function formatEvidenceReference(evidence: CandidateReportEvidenceView): string {
  const answerLabel = evidence.answerId ? "관련 답변" : "참고 자료";
  return `${answerLabel}: "${shortenReportEvidence(evidence.evidenceText)}"`;
}

function getReportScoreBand(score: number): { label: string; range: string; description: string } {
  if (score >= 90) {
    return { label: "매우 우수", range: "90~100", description: "근거가 풍부하고 결과와 재발 방지까지 명확합니다." };
  }
  if (score >= 80) {
    return { label: "우수", range: "80~89", description: "상황, 행동, 결과가 비교적 구체적으로 연결됩니다." };
  }
  if (score >= 70) {
    return { label: "보통 이상", range: "70~79", description: "핵심 경험은 확인되지만 일부 근거 보강이 필요합니다." };
  }
  if (score >= 60) {
    return { label: "보완 필요", range: "60~69", description: "상황은 있으나 본인 역할, 과정, 결과가 부족합니다." };
  }
  return { label: "부족", range: "0~59", description: "질문과 직접 연결되는 평가 근거가 부족합니다." };
}

function formatEvidenceSourceNoun(sourceType: string): string {
  const labels: Record<string, string> = {
    INTERVIEW_ANSWER: "면접 답변",
    APPLICATION_DOCUMENT: "제출 자료",
    DOCUMENT: "제출 자료",
    FOLLOW_UP: "꼬리질문 답변",
  };

  return labels[sourceType] ?? "평가 자료";
}

function shortenReportEvidence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function formatEvidenceSourceLabel(evidence: CandidateReportEvidenceView): string {
  const labels: Record<string, string> = {
    INTERVIEW_ANSWER: "면접 답변 기반",
    APPLICATION_DOCUMENT: "제출 자료 기반",
    DOCUMENT: "제출 자료 기반",
    FOLLOW_UP: "꼬리질문 답변 기반",
  };

  return labels[evidence.sourceType] ?? "평가 자료 기반";
}

async function requestMockReportGenerationAfterComplete(reportId: number): Promise<void> {
  try {
    await getCandidateApi().requestMockReportGeneration(reportId);
  } catch {
    return;
  }
}

async function prepareAnswerRequestWithUploadedMedia(
  api: InterviewRuntimeApiClient,
  sessionId: number,
  request: SaveInterviewAnswerRequest,
): Promise<SaveInterviewAnswerRequest> {
  const videoFileId =
    request.videoFileId ??
    (request.videoFile ? (await uploadCachedRuntimeMedia(api, sessionId, request.videoFile)).fileId : undefined);
  const audioFileId =
    request.audioFileId ??
    (request.audioFile ? (await uploadCachedRuntimeMedia(api, sessionId, request.audioFile)).fileId : undefined);

  return {
    questionId: request.questionId,
    videoFileId,
    audioFileId,
    durationSeconds: request.durationSeconds,
    allowReanswer: request.allowReanswer,
    skipReason: request.skipReason,
    nonverbalMetadata: request.nonverbalMetadata,
    retryAnswerId: request.retryAnswerId,
    transcript: request.transcript,
  };
}

async function uploadCachedRuntimeMedia(
  api: InterviewRuntimeApiClient,
  sessionId: number,
  file: RuntimeFileAssetRequest,
): Promise<CandidateFileAsset> {
  const cached = getCachedRecordingEntry(file.storageKey);
  if (!cached) {
    throw new Error("녹음 파일 Blob을 찾지 못했습니다. 답변을 다시 녹음한 뒤 제출해주세요.");
  }

  const uploadFile = new File([cached.blob], file.originalName, { type: file.mimeType });
  const uploaded = (await api.uploadInterviewMedia(sessionId, uploadFile)).data;
  cacheUploadedInterviewBlob(uploaded, cached.blob);
  return uploaded;
}

function buildAiInterviewRequest(
  processType: AiInterviewHandoffResponse["processType"],
  answer: LastSavedAnswer,
  jobDescription: string | undefined,
  mode: RuntimeMode,
): AiInterviewRequest {
  if (processType === "STT") {
    const audioFileId = answer.audioFileId ?? answer.fileAssetId ?? answer.videoFileId;
    const audioS3Key = answer.audioS3Key ?? answer.videoS3Key;

    if (!audioFileId || !audioS3Key) {
      throw new Error("STT 요청에 필요한 녹음 파일 정보가 없습니다. 답변 녹음을 다시 완료해 주세요.");
    }

    return compactPayload({
      answerId: answer.answerId,
      audioFileId,
      audioS3Key,
      durationSeconds: answer.durationSeconds,
    }) as AiInterviewRequest;
  }

  return compactPayload({
    answerId: answer.answerId,
    previousQuestion: answer.questionText,
    transcript: answer.transcript,
    jobDescription: mode === "recruiting" ? jobDescription : undefined,
  }) as AiInterviewRequest;
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

async function pollAiJobUntilSettled(
  processLogId: number,
  options: { attempts?: number; intervalMs?: number } = {},
): Promise<AiJobStatusResponse> {
  const api = getCandidateApi();
  const attempts = options.attempts ?? 20;
  const intervalMs = options.intervalMs ?? 700;
  let latest = (await api.getAiJobStatus(processLogId)).data;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (latest.status === "COMPLETED" || latest.status === "FAILED") {
      return latest;
    }
    await sleep(intervalMs);
    latest = (await api.getAiJobStatus(processLogId)).data;
  }

  return getTimedOutAiJobStatus(latest);
}

function extractAiJobText(output: unknown, keys: string[]): string | undefined {
  const parsed = parseAiJobOutput(output);
  if (!isRecord(parsed)) {
    return undefined;
  }

  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function extractAiJobBoolean(output: unknown, key: string): boolean | undefined {
  const parsed = parseAiJobOutput(output);
  if (!isRecord(parsed)) {
    return undefined;
  }

  return typeof parsed[key] === "boolean" ? parsed[key] : undefined;
}

function parseAiJobOutput(output: unknown): unknown {
  if (typeof output !== "string") {
    return output;
  }

  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function RecruitingReportFallbackView({
  status,
  reportError,
}: {
  status?: CandidateApplicationStatusView;
  reportError?: string;
}) {
  const view = getRecruitingReportFallbackView(status, reportError);

  return (
    <div className="candidate-report-state">
      <div className={`candidate-report-state__badge ${view.tone}`}>{view.badge}</div>
      <div>
        <h3>{view.title}</h3>
        <p>{view.description}</p>
      </div>
      {status ? (
        <dl className="candidate-report-state__meta">
          <Definition label="면접 상태" value={<StatusPill value={status.interviewStatus} />} />
          <Definition label="리포트 상태" value={<StatusPill value={status.reportStatus} />} />
          <Definition label="세션 ID" value={status.sessionId} />
          <Definition label="지원서 ID" value={status.applicationId} />
        </dl>
      ) : null}
      {view.helper ? <p className="candidate-report-state__helper">{view.helper}</p> : null}
    </div>
  );
}

function getRecruitingReportFallbackView(
  status?: CandidateApplicationStatusView,
  reportError?: string,
): {
  badge: string;
  title: string;
  description: string;
  helper?: string;
  tone: "waiting" | "progress" | "blocked";
} {
  if (!status) {
    return {
      badge: "확인 필요",
      title: "결과 상태를 불러오지 못했습니다.",
      description: reportError ?? "지원서 상태를 다시 불러온 뒤 결과를 확인해주세요.",
      tone: "blocked",
    };
  }

  if (status.interviewStatus !== "COMPLETED") {
    return {
      badge: "면접 진행 전",
      title: "면접 완료 후 결과가 생성됩니다.",
      description: "채용 AI 면접을 끝까지 제출하면 분석 요청 상태로 전환됩니다.",
      helper: reportError,
      tone: "waiting",
    };
  }

  if (status.reportStatus === "PENDING") {
    return {
      badge: "분석 대기",
      title: "면접 답변은 제출됐고 분석 대기 중입니다.",
      description: "E AI 리포트 파이프라인이 연결되면 이 지원서의 답변 파일을 기준으로 리포트 생성이 시작됩니다.",
      helper: reportError,
      tone: "waiting",
    };
  }

  if (status.reportStatus === "GENERATING") {
    return {
      badge: "생성 중",
      title: "면접 분석이 진행 중입니다.",
      description: "지원자 화면에는 공개 가능한 제한 결과만 표시됩니다. 기업용 상세 점수와 내부 메모는 노출하지 않습니다.",
      helper: "잠시 후 새로고침하면 생성 상태를 다시 확인할 수 있습니다.",
      tone: "progress",
    };
  }

  if (status.reportStatus === "FAILED") {
    return {
      badge: "조회 불가",
      title: "리포트를 준비하지 못했습니다.",
      description: "분석 처리에 실패했거나 결과를 표시할 수 없는 상태입니다.",
      helper: reportError ?? "팀 통합 후 AI 리포트 처리 상태를 다시 확인해주세요.",
      tone: "blocked",
    };
  }

  return {
    badge: "확인 필요",
    title: "결과를 불러오는 중 문제가 발생했습니다.",
    description: "리포트 상태는 완료로 보이지만 결과 응답을 받지 못했습니다.",
    helper: reportError,
    tone: "blocked",
  };
}

function formatInterviewCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function isQuestionSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function getBrowserSpeechCompletionTimeoutMs(text: string): number {
  const estimatedMs = text.length * 120 + 4000;
  return Math.min(
    BROWSER_SPEECH_MAX_COMPLETION_TIMEOUT_MS,
    Math.max(BROWSER_SPEECH_MIN_COMPLETION_TIMEOUT_MS, estimatedMs),
  );
}

function findKoreanSpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "ko-kr") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("ko")) ??
    voices.find((voice) => voice.default)
  );
}

function RecruitingIntegrityNotice() {
  return (
    <aside className="candidate-integrity-notice" role="note" aria-label="응시 무결성 안내">
      <div className="candidate-integrity-notice__heading">
        <span>응시 무결성 안내</span>
        <strong>면접 중 응시 환경 신호가 기록됩니다</strong>
      </div>
      <ul>
        <li>화면·탭 이탈, 얼굴 미검출·복수 얼굴, 카메라 연결, 시선 이탈, 음성과 입 모양의 불일치 등을 답변별 참고 신호로 확인합니다.</li>
        <li>감지 신호는 브라우저에서 수집된 미검증 참고 정보로 채용 담당자 검토 화면에 표시되며 평가 점수에는 반영되지 않습니다.</li>
        <li>감지 신호만으로 부정행위를 확정하거나 자동 탈락 처리하지 않으며, 채용 담당자가 답변 내용과 녹화 영상을 함께 검토합니다.</li>
      </ul>
    </aside>
  );
}

function Definition({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusPill({ value }: { value: ReactNode }) {
  const text = String(value);
  const tone = getStatusTone(text);
  return <span className={`badge ${tone}`}>{formatStatusLabel(text)}</span>;
}

function getStatusTone(value: string): "success" | "warning" | "neutral" {
  const successValues = new Set([
    "ANSWERED",
    "COMPLETED",
    "EXTRACTED",
    "INTERVIEW_DONE",
    "OPEN",
    "PASSED",
    "READY",
    "START_READY",
    "SUBMITTED",
    "응시 가능",
  ]);
  const warningValues = new Set([
    "CURRENT",
    "EXTRACTING",
    "GENERATING",
    "IN_PROGRESS",
    "IN_REVIEW",
    "INTERVIEW_WAITING",
    "NOT_READY",
    "NOT_SUBMITTED",
    "PENDING",
    "PREP_REQUIRED",
    "WAITING",
    "응시 대기",
  ]);

  if (successValues.has(value)) return "success";
  if (warningValues.has(value)) return "warning";
  return "neutral";
}

function formatStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    ACTIVE: "활성",
    ANSWERED: "답변 완료",
    APPLIED: "지원 완료",
    ARCHIVED: "보관",
    CLOSED: "마감",
    COMPLETED: "완료",
    CURRENT: "현재 질문",
    DRAFT: "임시저장",
    EXTRACTED: "추출 완료",
    EXTRACTING: "추출 중",
    FAILED: "실패",
    GENERATING: "생성 중",
    IN_PROGRESS: "진행 중",
    IN_REVIEW: "검토 중",
    INTERVIEW_DONE: "면접 완료",
    INTERVIEW_WAITING: "면접 대기",
    INVITED: "초대됨",
    NOT_READY: "준비 전",
    NOT_SUBMITTED: "미제출",
    OPEN: "공개",
    PASSED: "통과",
    PENDING: "대기",
    PREP_REQUIRED: "준비 필요",
    READY: "준비 완료",
    REJECTED: "반려",
    START_READY: "응시 가능",
    SUBMITTED: "제출 완료",
    CANCELED: "취소",
    WAITING: "대기",
    "채용 리포트": "채용 리포트",
    "지원자 제한 조회": "지원자 제한 조회",
    "응시 가능": "응시 가능",
    "응시 대기": "응시 대기",
  };

  return labels[value] ?? value;
}

function formatQuestionTypeLabel(questionType?: string): string {
  const labels: Record<string, string> = {
    INTRO: "자기소개",
    TECHNICAL: "기술 질문",
    EXPERIENCE: "경험 질문",
    SITUATION: "상황 질문",
    CLOSING: "마무리",
    INTERVIEW: "면접",
  };

  return questionType ? labels[questionType] ?? questionType : "면접";
}

function formatConsentTypeLabel(consentType: string): string {
  const labels: Record<string, string> = {
    PRIVACY_COLLECTION: "개인정보 수집·이용 동의",
    AI_DOCUMENT_ANALYSIS: "이력서/포트폴리오 AI 분석 동의",
    AI_INTERVIEW_RECORDING: "AI 면접 녹화·녹음 안내 확인",
  };

  return labels[consentType] ?? consentType;
}


function paymentStatusLabel(status: PaymentOrder["status"]) {
  const labels: Record<PaymentOrder["status"], string> = {
    READY: "대기",
    IN_PROGRESS: "승인 중",
    DONE: "승인 완료",
    FAILED: "실패",
    CANCELED: "취소",
    PARTIAL_CANCELED: "부분 취소",
  };
  return labels[status];
}

function paymentStatusTone(status: PaymentOrder["status"]) {
  if (status === "DONE") return "success";
  if (status === "FAILED" || status === "CANCELED") return "danger";
  if (status === "READY" || status === "IN_PROGRESS") return "warning";
  return "neutral";
}

function pickDeviceTestSentence(): string {
  return DEVICE_TEST_SENTENCES[Math.floor(Math.random() * DEVICE_TEST_SENTENCES.length)] ?? DEVICE_TEST_SENTENCES[0];
}

function CameraFramingOverlay({ state, testSentence }: { state: CameraFramingState; testSentence: string }) {
  return (
    <div className={`camera-framing-overlay ${state === "warn" ? "warn" : ""}`}>
      <span className="camera-framing-overlay__face" />
      <span className="camera-framing-overlay__shoulders" />
      <span className="camera-framing-overlay__center" />
      <span className="camera-framing-overlay__label">
        {state === "warn" ? "얼굴을 가이드 안으로 맞춰주세요" : "얼굴과 상반신을 선 안에 맞춰주세요"}
      </span>
      <span className="camera-framing-overlay__prompt" aria-label="마이크 테스트 문장">
        <span>마이크 테스트 문장</span>
        <strong>{testSentence}</strong>
      </span>
    </div>
  );
}

function isRuntimeShortcutIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function useCandidateResource<T>(load: () => Promise<T>, dependencies: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const data = await load();
      setState({ data, loading: false });
      return data;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
      throw error;
    }
  }, [load]);

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    load()
      .then((data) => {
        if (alive) setState({ data, loading: false });
      })
      .catch((error) => {
        if (alive) setState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
      });
    return () => {
      alive = false;
    };
    // The dependency list is supplied by each caller, mirroring React's hook API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...dependencies]);

  const updateData = useCallback((updater: (current: T) => T) => {
    setState((current) =>
      current.data
        ? { ...current, data: updater(current.data), loading: false, error: undefined }
        : current,
    );
  }, []);

  return { ...state, refresh, updateData };
}

function getCandidateApi() {
  return createCandidateApiClient({
    baseUrl: getApiBaseUrl(),
    headers: getCandidateHeaders(),
  });
}

function getPublicCandidateApi() {
  return createCandidateApiClient({
    baseUrl: getApiBaseUrl(),
    fetcher: fetch,
    jobsPath: publicCandidateApiPaths.jobs,
  });
}

export function setPublicInterviewAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY, token);
    return;
  }
  window.sessionStorage.removeItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY);
}

function getPublicInterviewApi() {
  return createPublicInterviewApiClient({
    baseUrl: getApiBaseUrl(),
    publicAccessToken: readPublicInterviewAccessToken(),
  });
}

function readPublicInterviewAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY);
}

function getCandidateHeaders(): HeadersInit {
  const token = readAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function readAccessToken(): string | null {
  return getAccessToken();
}

function getCurrentCandidateId(): number {
  const token = readAccessToken();
  if (!token) return DEMO_CANDIDATE_ID;

  try {
    const [, payload] = token.split(".");
    if (!payload) return DEMO_CANDIDATE_ID;
    const decoded = JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { candidateId?: number };
    return decoded.candidateId ?? DEMO_CANDIDATE_ID;
  } catch {
    return DEMO_CANDIDATE_ID;
  }
}

function toRecruitingRuntimeSession(
  runtime: CandidateInterviewRuntimeView,
  questions: RuntimeQuestionListResponse,
): RuntimePageSession {
  const currentQuestion =
    questions.questions.find((question) => question.current) ??
    questions.questions.find((question) => question.questionId === questions.currentQuestionId) ??
    questions.questions.find((question) => !question.answered);
  const answeredCount = questions.questions.filter((question) => question.answered).length;
  const completionReady = Boolean(
    runtime.status === "IN_PROGRESS" &&
      !currentQuestion &&
      questions.questions.length > 0 &&
      answeredCount >= questions.questions.length,
  );

  return {
    sessionId: runtime.sessionId,
    applicationId: runtime.applicationId,
    interviewType: runtime.interviewType,
    sessionMode: runtime.sessionMode,
    status: runtime.status,
    showQuestionText: runtime.showQuestionText,
    canRecord: runtime.canRecord,
    ...(runtime.jobDescription ? { jobDescription: runtime.jobDescription } : {}),
    ...(runtime.timePolicy ? { timePolicy: runtime.timePolicy } : {}),
    totalQuestions: completionReady
      ? Math.max(answeredCount, questions.questions.length)
      : getRecruitingRuntimeTotalQuestions(runtime.sessionMode, questions.questions.length),
    answeredCount,
    completionReady,
    currentQuestion,
    nextQuestionEndpoint: runtime.nextQuestionEndpoint,
    answerUploadEndpoint: runtime.answerUploadEndpoint,
  };
}

function getRuntimeAnswerTimeLimitSeconds(runtime?: Pick<RuntimePageSession, "timePolicy">) {
  const answerTimeSec = runtime?.timePolicy?.answerTimeSec;
  return typeof answerTimeSec === "number" && Number.isFinite(answerTimeSec) && answerTimeSec > 0
    ? answerTimeSec
    : DEFAULT_INTERVIEW_QUESTION_TIME_LIMIT_SECONDS;
}

function getRuntimePreparationTimeLimitSeconds(runtime?: Pick<RuntimePageSession, "interviewType" | "timePolicy">) {
  const preparationTimeSec = runtime?.timePolicy?.preparationTimeSec;
  if (typeof preparationTimeSec === "number" && Number.isFinite(preparationTimeSec) && preparationTimeSec > 0) {
    return preparationTimeSec;
  }

  return runtime?.interviewType === "MOCK" ? DEFAULT_MOCK_INTERVIEW_PREPARATION_TIME_LIMIT_SECONDS : 0;
}

function resetRuntimeQuestionTimer(
  runtime: Pick<RuntimePageSession, "interviewType" | "timePolicy"> | undefined,
  setTimerPhase: (phase: RuntimeTimerPhase) => void,
  setRemainingSeconds: (seconds: number) => void,
) {
  const preparationTimeSec = getRuntimePreparationTimeLimitSeconds(runtime);
  if (preparationTimeSec > 0) {
    setTimerPhase("PREPARING");
    setRemainingSeconds(preparationTimeSec);
    return;
  }

  setTimerPhase("ANSWERING");
  setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(runtime));
}

function getMeaningfulTranscriptLength(transcript: string) {
  return transcript.replace(/\s/g, "").length;
}

function getInterviewTranscriptRetryReason(transcript: string): string | undefined {
  const normalized = transcript.trim();
  const meaningfulLength = getMeaningfulTranscriptLength(normalized);
  if (!normalized || normalized.includes("[NO_ANSWER]")) {
    return "답변 녹음이 정상적으로 저장되지 않았습니다.";
  }

  if (meaningfulLength < MIN_STT_TRANSCRIPT_MEANINGFUL_LENGTH) {
    return `STT 텍스트가 ${MIN_STT_TRANSCRIPT_MEANINGFUL_LENGTH}자 미만이라 답변 내용이 충분하지 않습니다.`;
  }

  return undefined;
}

type WindowWithWebkitAudioContext = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function warmUpInterviewAudioOutput() {
  if (typeof window === "undefined") return;

  if (isQuestionSpeechSupported() && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.lang = "ko-KR";
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }

  const AudioContextConstructor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.01);
    void audioContext.resume().finally(() => {
      window.setTimeout(() => {
        void audioContext.close().catch(() => undefined);
      }, 50);
    });
  } catch {
    // Some browsers reject AudioContext creation until a later user gesture.
  }
}

function playAnswerStartCue() {
  if (typeof window === "undefined") return;

  const AudioContextConstructor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const audioContext = new AudioContextConstructor();
  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
  gain.connect(audioContext.destination);

  const first = audioContext.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(880, now);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.16);

  const second = audioContext.createOscillator();
  second.type = "sine";
  second.frequency.setValueAtTime(1174.66, now + 0.16);
  second.connect(gain);
  second.start(now + 0.16);
  second.stop(now + 0.42);

  void audioContext.resume().catch(() => undefined);
  window.setTimeout(() => {
    void audioContext.close().catch(() => undefined);
  }, 650);
}

function isRealtimeQuestionSpeechPurpose(purpose: string): purpose is "interview_question" | "interview_follow_up_question" {
  return purpose === "interview_question" || purpose === "interview_follow_up_question";
}

function getDemoPresetReadinessMessage(
  reasonCode: import("./api").DemoPresetReadinessReasonCode | null,
  status: "READY" | "PENDING" | "UNAVAILABLE",
): string {
  if (reasonCode === "OFFICIAL_SESSION_EXISTS") {
    return status === "READY"
      ? "이미 시작한 공식 3문항 시연을 같은 질문으로 이어갑니다."
      : "이미 종료되었거나 응시 기간이 지난 공식 3문항 시연입니다.";
  }
  if (status === "READY") return "협업 공통 1문항과 개인화 1문항, 개인화 꼬리질문 1문항이 준비되었습니다.";
  const messages: Record<Exclude<import("./api").DemoPresetReadinessReasonCode, "OFFICIAL_SESSION_EXISTS">, string> = {
    CANONICAL_PROFILES_NOT_ALL_ACTIVE: "평가 기준 3개가 모두 활성화되어야 시연을 시작할 수 있습니다.",
    COLLABORATION_COMMON_QUESTION_MISSING: "협업 공통 질문이 아직 확정되지 않았습니다.",
    DEMO_PERSONALIZED_QUESTION_GENERATING: "지원 서류를 바탕으로 개인화 질문을 준비하고 있습니다.",
    DEMO_PERSONALIZED_QUESTION_REVIEW_REQUIRED: "개인화 질문 검토가 필요합니다. 채용 담당자에게 문의해주세요.",
    DEMO_PERSONALIZED_QUESTION_FAILED: "개인화 질문 준비에 실패했습니다. 채용 담당자에게 재준비를 요청해주세요.",
    FACTUAL_ANCHOR_MISSING: "지원 서류 분석이 완료되어야 개인화 시연을 시작할 수 있습니다.",
    OFFICIAL_SESSION_MODE_CONFLICT: "이미 일반 공식 면접이 선택되어 3문항 시연으로 변경할 수 없습니다.",
    CONFIGURATION_COVERAGE_MISMATCH: "면접 설정과 질문 구성이 일치하지 않습니다. 채용 담당자에게 확인을 요청해주세요.",
  };
  return reasonCode ? messages[reasonCode] : "공식 3문항 시연 준비 상태를 확인하고 있습니다.";
}

function createRuntimeFileAssetFromMetadata(
  originalName: string,
  mimeType: string,
  sizeBytes: number,
): RuntimeFileAssetRequest | undefined {
  const normalizedMimeType = normalizeInterviewMediaMimeType(mimeType);
  if (!normalizedMimeType) return undefined;
  return {
    storageKey: `candidate/${getCurrentCandidateId()}/interviews/${Date.now()}-${safeFileName(originalName)}`,
    originalName,
    mimeType: normalizedMimeType,
    sizeBytes,
  };
}

function cacheRecordedInterviewBlob(file: RuntimeFileAssetRequest | undefined, blob: Blob) {
  if (!file || typeof window === "undefined") return;

  const cache = getCandidateRecordingCache();
  const existing = cache.get(file.storageKey);
  if (existing) {
    URL.revokeObjectURL(existing.url);
  }

  cache.set(file.storageKey, {
    url: URL.createObjectURL(blob),
    blob,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    createdAt: Date.now(),
  });
}

function cacheUploadedInterviewBlob(file: CandidateFileAsset, blob: Blob) {
  if (typeof window === "undefined") return;

  const cache = getCandidateRecordingCache();
  const existing = cache.get(file.storageKey);
  if (existing) {
    URL.revokeObjectURL(existing.url);
  }

  cache.set(file.storageKey, {
    url: URL.createObjectURL(blob),
    blob,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    createdAt: Date.now(),
  });
}

function getCachedRecordingEntry(storageKey?: string): CandidateRecordingCacheEntry | undefined {
  if (!storageKey || typeof window === "undefined") return undefined;
  return getCandidateRecordingCache().get(storageKey);
}

function getCachedRecordingObjectUrl(storageKey?: string): string | undefined {
  if (!storageKey || typeof window === "undefined") return undefined;
  return getCandidateRecordingCache().get(storageKey)?.url;
}

function getCandidateRecordingCache(): Map<string, CandidateRecordingCacheEntry> {
  const cacheWindow = window as CandidateRecordingCacheWindow;
  cacheWindow.__candidateRecordingCache ??= new Map<string, CandidateRecordingCacheEntry>();
  return cacheWindow.__candidateRecordingCache;
}

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
    "audio/mp4",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function safeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "answer";
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function startCameraQualityMonitor(
  video: HTMLVideoElement,
  previewInfo: CameraPreviewInfo,
  fallbackLabel: string | undefined,
  onQualityChange: (quality: CameraQualityResult, framing: CameraFramingResult, status: string) => void,
): number {
  const update = async () => {
    const quality = assessCameraQuality(video);
    const framing = getCameraFramingNotice();
    onQualityChange(quality, framing, formatCameraPreviewStatus(previewInfo, fallbackLabel, quality, framing));
  };

  void update();
  return window.setInterval(update, 600);
}

async function getCameraMediaStream(cameraDeviceId = "", microphoneDeviceId = ""): Promise<CameraStreamResult> {
  const videoAttempts: Array<MediaTrackConstraints | boolean> = cameraDeviceId
    ? [{ deviceId: { ideal: cameraDeviceId } }, true]
    : [{ facingMode: "user" }, true];
  const audioAttempts: Array<MediaTrackConstraints | boolean> = microphoneDeviceId
    ? [
        {
          deviceId: { ideal: microphoneDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        true,
      ]
    : [{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, true];
  let lastError: unknown;
  let lastAudioError: unknown;

  for (const video of videoAttempts) {
    for (const audio of audioAttempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
        const [audioTrack] = stream.getAudioTracks();
        return {
          stream,
          audioEnabled: Boolean(audioTrack),
          audioLabel: audioTrack?.label,
          audioState: audioTrack?.readyState,
        };
      } catch (errorWithAudio) {
        lastAudioError = errorWithAudio;
        lastError = errorWithAudio;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      return {
        stream,
        audioEnabled: false,
        audioError: lastAudioError,
        fallbackLabel: `마이크 연결 실패: ${formatMediaError(lastAudioError, "microphone")} 카메라만 연결했습니다.`,
      };
    } catch (errorWithoutAudio) {
      lastError = errorWithoutAudio;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("카메라 연결에 실패했습니다.");
}

async function probeMicrophone(microphoneDeviceId = ""): Promise<MicrophoneProbeResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: new Error("이 브라우저에서는 마이크를 사용할 수 없습니다.") };
  }

  try {
    const audio = microphoneDeviceId ? { deviceId: { ideal: microphoneDeviceId } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio });
    const [track] = stream.getAudioTracks();
    const result: MicrophoneProbeResult = {
      ok: Boolean(track),
      label: track?.label,
      state: track?.readyState,
    };
    stopMediaStream(stream);
    return result;
  } catch (error) {
    return { ok: false, error };
  }
}

async function attachMediaStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<CameraPreviewInfo> {
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = null;
  video.srcObject = stream;

  await waitForVideoMetadata(video);
  await playVideoWithTimeout(video);
  await waitForVideoFrame(video);

  const [track] = stream.getVideoTracks();
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    trackLabel: track?.label,
    trackState: track?.readyState,
  };
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("canplay", done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const timeoutId = window.setTimeout(done, 1500);
    video.addEventListener("loadedmetadata", done, { once: true });
    video.addEventListener("canplay", done, { once: true });
  });
}

async function playVideoWithTimeout(video: HTMLVideoElement): Promise<void> {
  await Promise.race([
    video.play(),
    new Promise<void>((_, reject) =>
      window.setTimeout(() => reject(new Error("카메라 화면 재생 시간이 초과되었습니다. 카메라/마이크 점검을 다시 눌러주세요.")), 2000),
    ),
  ]);
}

async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
}

function assertCameraPreviewHasFrame(info?: CameraPreviewInfo): asserts info is CameraPreviewInfo {
  if (!info || info.width <= 0 || info.height <= 0) {
    throw new Error("카메라가 연결됐지만 영상 화면이 표시되지 않습니다. 브라우저 권한을 허용한 뒤 카메라/마이크 점검을 다시 눌러주세요.");
  }
}

function assessCameraQuality(video: HTMLVideoElement | null): CameraQualityResult {
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return { ok: false, message: "카메라 화면을 확인할 수 없습니다." };
  }

  const canvas = document.createElement("canvas");
  const width = 32;
  const height = 18;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { ok: true, message: "카메라 화면이 표시됩니다." };
  }

  context.drawImage(video, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += (data[index] + data[index + 1] + data[index + 2]) / 3;
  }

  const brightness = Math.round(total / (data.length / 4));
  if (brightness < 40) {
    return { ok: false, brightness, message: "카메라 화면이 어둡습니다. 조명을 켜거나 밝은 곳으로 이동해주세요." };
  }
  if (brightness > 225) {
    return { ok: false, brightness, message: "카메라 화면이 너무 밝습니다. 강한 역광이나 조명을 조정해주세요." };
  }

  return { ok: true, brightness, message: "카메라 밝기가 적정합니다." };
}

function getCameraFramingNotice(): CameraFramingResult {
  return {
    state: "unsupported",
    blocking: false,
    message: "구도 자동 판정 없이 화면 가이드만 표시합니다.",
  };
}

async function measureMicrophoneQuality(
  stream: MediaStream,
  onLevel?: (level: number) => void,
): Promise<MicrophoneQualityResult> {
  const [audioTrack] = stream.getAudioTracks();
  if (!audioTrack || audioTrack.readyState !== "live") {
    return { ok: false, peakLevel: 0, message: "마이크 입력을 확인할 수 없습니다." };
  }

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) {
    return { ok: false, peakLevel: 0, message: "이 브라우저에서는 마이크 입력 품질을 측정할 수 없습니다." };
  }

  const audioContext = new AudioContextConstructor();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);
  let peakLevel = 0;
  const startedAt = Date.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      samples.forEach((sample) => {
        peak = Math.max(peak, Math.abs(sample - 128));
      });
      const level = Math.min(100, Math.round((peak / 128) * 100));
      peakLevel = Math.max(peakLevel, level);
      onLevel?.(level);

      if (Date.now() - startedAt >= 1800) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    tick();
  });

  await audioContext.close();

  if (peakLevel <= 5) {
    return { ok: false, peakLevel, message: "마이크 입력이 감지되지 않습니다. 테스트 문장을 소리 내어 읽어주세요." };
  }
  if (peakLevel < 20) {
    return { ok: false, peakLevel, message: "마이크 입력이 너무 작습니다. 마이크를 가까이 두거나 입력 장치를 확인해주세요." };
  }
  if (peakLevel > 85) {
    return { ok: false, peakLevel, message: "마이크 입력이 너무 큽니다. 마이크를 조금 멀리 두거나 입력 볼륨을 낮춰주세요." };
  }

  return { ok: true, peakLevel, message: "마이크 입력이 적정합니다." };
}

async function checkInterviewNetworkQuality(): Promise<NetworkQualityResult> {
  if (!navigator.onLine) {
    return { ok: false, message: "네트워크 연결이 끊겨 있습니다." };
  }

  const healthUrl = `${getApiBaseUrl()}/api/v1/health`;
  let successCount = 0;
  let totalDurationMs = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 1500);
    const startedAt = performance.now();
    try {
      const response = await fetch(healthUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        successCount += 1;
        totalDurationMs += performance.now() - startedAt;
      }
    } catch {
      // Failed attempts are reflected in successCount.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  if (successCount < 2) {
    return { ok: false, message: "네트워크 확인이 불안정합니다. 연결 상태를 확인해주세요." };
  }

  const averageMs = Math.round(totalDurationMs / successCount);
  if (averageMs > 1000) {
    return { ok: false, message: `네트워크 응답이 느립니다. 평균 ${averageMs}ms` };
  }

  return { ok: true, message: `네트워크 정상 · 평균 ${averageMs}ms` };
}

function formatCameraPreviewStatus(
  info?: CameraPreviewInfo,
  fallbackLabel?: string,
  quality?: CameraQualityResult,
  framing?: CameraFramingResult,
): string {
  if (!info) return "카메라 연결됨";
  const size = info.width > 0 && info.height > 0 ? `${info.width}x${info.height}` : "프레임 없음";
  const label = info.trackLabel || "선택된 카메라";
  const brightness = quality?.brightness === undefined ? undefined : `밝기 ${quality.brightness}`;
  return [label, size, info.trackState ?? "live", brightness, quality?.message, framing?.message, fallbackLabel]
    .filter(Boolean)
    .join(" · ");
}

function isMicrophoneTrackReady(stream: MediaStream): boolean {
  const [audioTrack] = stream.getAudioTracks();
  return Boolean(audioTrack && audioTrack.enabled && audioTrack.readyState === "live");
}

function isCameraTrackReady(stream: MediaStream): boolean {
  const [videoTrack] = stream.getVideoTracks();
  return Boolean(videoTrack && videoTrack.enabled && videoTrack.readyState === "live");
}

function formatMicrophoneStatus(result: CameraStreamResult): string {
  if (result.audioEnabled) {
    return `${result.audioLabel || "선택된 마이크"} · ${result.audioState ?? "live"}`;
  }
  return `마이크 실패: ${formatMediaError(result.audioError, "microphone")}`;
}

function formatMicrophoneQualityStatus(result: CameraStreamResult, quality: MicrophoneQualityResult): string {
  const label = result.audioLabel || "선택된 마이크";
  const state = result.audioState ?? "live";
  const message = quality.ok ? quality.message : "마이크가 연결되었습니다. 입력이 작으면 실제 답변 때 조금 더 크게 말해주세요.";
  return `${label} · ${state} · 입력 ${quality.peakLevel}% · ${message}`;
}

function formatMicrophoneProbeStatus(result: MicrophoneProbeResult): string {
  if (result.ok) {
    return `${result.label || "선택된 마이크"} · ${result.state ?? "live"} · 카메라 권한 대기`;
  }
  return `마이크 연결 실패: ${formatMediaError(result.error, "microphone")}`;
}

function formatMediaError(error: unknown, device: "camera" | "microphone" = "camera"): string {
  const label = device === "microphone" ? "마이크" : "카메라";
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return `브라우저 ${label} 권한이 차단되어 있습니다. 주소창 권한 설정에서 허용한 뒤 다시 시도해주세요.`;
    if (error.name === "NotFoundError") return `사용 가능한 ${label} 장치를 찾지 못했습니다.`;
    if (error.name === "NotReadableError") return `다른 앱이 ${label}를 사용 중이거나 장치를 읽을 수 없습니다.`;
    if (error.name === "OverconstrainedError") return `선택한 ${label} 조건을 만족하는 장치를 찾지 못했습니다.`;
    return `${error.name}: ${error.message}`;
  }
  return error instanceof Error ? error.message : `${label} 연결에 실패했습니다.`;
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((current) => current !== value) : [...values, value];
}

function emitCandidateReportNotification(notification: CandidateNotificationItem) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<CandidateNotificationItem>(CANDIDATE_REPORT_NOTIFICATION_EVENT, {
    detail: notification,
  }));
}

function readCandidateNotificationReadIds(): Set<string> {
  return readCandidateNotificationIds(CANDIDATE_NOTIFICATION_READ_IDS_STORAGE_KEY);
}

function writeCandidateNotificationReadIds(readIds: ReadonlySet<string>) {
  writeCandidateNotificationIds(CANDIDATE_NOTIFICATION_READ_IDS_STORAGE_KEY, readIds);
}

function readCandidateNotificationDismissedIds(): Set<string> {
  return readCandidateNotificationIds(CANDIDATE_NOTIFICATION_DISMISSED_IDS_STORAGE_KEY);
}

function writeCandidateNotificationDismissedIds(dismissedIds: ReadonlySet<string>) {
  writeCandidateNotificationIds(CANDIDATE_NOTIFICATION_DISMISSED_IDS_STORAGE_KEY, dismissedIds);
}

function readCandidateNotificationIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeCandidateNotificationIds(storageKey: string, notificationIds: ReadonlySet<string>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...notificationIds]));
  } catch {
    // 저장이 막혀도 현재 탭의 알림 확인 흐름은 유지한다.
  }
}

function mergeCandidateNotifications(
  current: CandidateNotificationItem[],
  incoming: CandidateNotificationItem[],
): CandidateNotificationItem[] {
  const merged = new Map<string, CandidateNotificationItem>();
  current.forEach((notification) => merged.set(notification.id, notification));
  incoming.forEach((notification) => merged.set(notification.id, notification));
  return [...merged.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function formatUnreadNotificationCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof CandidateApiError) {
    if (error.status === 401) return "로그인 후 이용해주세요. 지원자 계정으로 로그인하면 본인 지원현황과 면접 세션만 표시됩니다.";
    if (error.body?.error.code === "REPORT_NOT_READY") return "면접 분석이 아직 준비 중입니다. 잠시 후 다시 확인해주세요.";
    return error.body?.error.message ?? error.message;
  }
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}

import type { FileAsset, InterviewStatus, InterviewType } from "../candidate";

export type QuestionType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";

export interface InterviewQuestion {
  questionId: number;
  questionType: QuestionType;
  content: string;
  sortOrder: number;
  interviewType: InterviewType;
  jobRole?: string;
  postingId?: number;
  criterionId?: number;
  isActive: boolean;
}

export interface RuntimeInterviewSession {
  sessionId: number;
  applicationId?: number;
  candidateId: number;
  interviewType: InterviewType;
  status: InterviewStatus;
  showQuestionText: boolean;
  currentQuestionIndex: number;
  questionIds: number[];
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export type InterviewIntegrityEventType =
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

export type InterviewIntegritySuspicionLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface InterviewIntegrityEvent {
  type: InterviewIntegrityEventType;
  occurredAt: string;
  durationMs?: number;
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN";
  source?: "IRIS" | "HEAD_POSE" | "COMBINED";
}

export interface InterviewIntegritySummary {
  screenAwayCount?: number;
  tabHiddenCount?: number;
  windowBlurCount?: number;
  cameraLostCount?: number;
  faceMissingCount?: number;
  faceOutOfFrameCount?: number;
  multipleFacesCount?: number;
  facePositionShiftCount?: number;
  gazeAwayCount?: number;
  voiceMouthMismatchCount?: number;
  voiceWithoutFaceCount?: number;
  staticVideoFrameCount?: number;
  earlyScreenAwayCount?: number;
  faceDetectionSupported?: boolean;
  faceDetectionFrameCount?: number;
  personDetectionSupported?: boolean;
  personDetectionFrameCount?: number;
  gazeDetectionSupported?: boolean;
  gazeDetectionFrameCount?: number;
  headPoseDetectionSupported?: boolean;
  headPoseDetectionFrameCount?: number;
  mouthSyncSupported?: boolean;
  mouthSyncFrameCount?: number;
  mouthSyncMismatchFrameCount?: number;
  videoFrameMotionSupported?: boolean;
  videoFrameSampleCount?: number;
  staticVideoFrameSampleCount?: number;
  totalAwayDurationMs?: number;
  maxAwayDurationMs?: number;
  suspicionLevel?: InterviewIntegritySuspicionLevel;
}

export type InterviewGazeDirection = "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";

export interface InterviewGazeTimelineSample {
  tMs: number;
  horizontalOffset: number;
  verticalOffset: number;
  direction: InterviewGazeDirection;
}

export interface InterviewHeadPoseTimelineSample {
  tMs: number;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
}

export interface InterviewAnswerNonverbalMetadata extends Record<string, unknown> {
  schemaVersion?: 1;
  source?: "CLIENT_RUNTIME_UNVERIFIED";
  cameraWarnings?: number;
  microphoneWarnings?: number;
  longSilenceCount?: number;
  shortAnswerCount?: number;
  testModeUsed?: boolean;
  voicePeakLevel?: number;
  lowAudioFrameCount?: number;
  observedAudioFrameCount?: number;
  cameraDisconnectedCount?: number;
  integrityEvents?: InterviewIntegrityEvent[];
  integritySummary?: InterviewIntegritySummary;
  gazeTimeline?: InterviewGazeTimelineSample[];
  headPoseTimeline?: InterviewHeadPoseTimelineSample[];
}

export interface InterviewAnswer {
  answerId: number;
  sessionId: number;
  questionId: number;
  videoFileId?: number;
  audioFileId?: number;
  transcript?: string;
  nonverbalMetadata?: InterviewAnswerNonverbalMetadata;
  durationSeconds: number;
  submittedAt: string;
}

export interface InterviewQuestionView {
  questionId: number;
  questionType: QuestionType;
  sortOrder: number;
  content?: string;
  audioPrompt: string;
  answered: boolean;
  current: boolean;
}

export interface InterviewRuntimeView {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  status: InterviewStatus;
  showQuestionText: boolean;
  currentQuestion?: InterviewQuestionView;
  totalQuestions: number;
  answeredCount: number;
  canRecord: boolean;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
}

export interface StartMockInterviewResult extends InterviewRuntimeView {
  startedAt: string;
}

export interface InterviewQuestionListResult {
  sessionId: number;
  interviewType: InterviewType;
  showQuestionText: boolean;
  currentQuestionId?: number;
  questions: InterviewQuestionView[];
}

export interface SaveInterviewAnswerResult {
  sessionId: number;
  answer: InterviewAnswer;
  videoFile?: FileAsset;
  audioFile?: FileAsset;
  nextQuestionAvailable: boolean;
}

export interface NextInterviewQuestionResult {
  sessionId: number;
  previousQuestionId: number;
  currentQuestion?: InterviewQuestionView;
  isLastQuestion: boolean;
}

export interface CompleteInterviewResult {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  status: "COMPLETED";
  completedAt: string;
  answeredCount: number;
  totalQuestions: number;
}

export interface AiHandoffResult {
  accepted: true;
  processType: "STT" | "FOLLOW_UP";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  sessionId: number;
  applicationId?: number;
  answerId: number;
  questionId: number;
  fileId?: number;
  fileAssetId?: number;
  videoFileId?: number;
  audioFileId?: number;
  processLogId?: number;
  inputRef?: string;
  queued?: boolean;
  callbackTopic: string;
}

export type RealtimeInterviewProvider = "mock" | "openai";

export interface RealtimeInterviewSessionResult {
  accepted: true;
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  mode: "realtime-voice";
  provider: RealtimeInterviewProvider;
  model: string;
  voice: string;
  transport: "webrtc";
  clientSecret: string;
  clientSecretType: "ephemeral";
  expiresAt: string;
  endpoint: string;
}

export interface InsertFollowUpQuestionResult {
  sessionId: number;
  processLogId: number;
  sourceAnswerId: number;
  sourceQuestionId: number;
  question: InterviewQuestionView;
  inserted: boolean;
  totalQuestions: number;
  nextQuestionAvailable: boolean;
}

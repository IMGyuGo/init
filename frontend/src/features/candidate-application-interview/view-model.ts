import type {
  CandidateApplicationSummary,
  CandidateJobDetail,
  CandidateJobQuery,
  CandidateJobSummary,
  CandidateMockReportFeedback,
  CandidateMockReportSummary,
  CandidateRecruitingReportView,
  ConsentType,
  CreatePortfolioLinkRequest,
  InterviewRuntimeSessionView,
  InterviewDeviceCheckRequest,
  PortfolioLinkType,
  ReportStatus,
  RuntimeFileAssetRequest,
  RuntimeQuestionView,
  SaveInterviewConsentRequest,
  SaveInterviewAnswerRequest,
  StartMockInterviewRequest,
  SubmitApplicationRequest,
  UploadResumeRequest,
} from "./api";
import { candidateApplicationInterviewRoutes } from "./routes";

export interface CandidateApplicationFormState {
  candidateName: string;
  email: string;
  phone: string;
  resumeFileId?: number;
  portfolioFileId?: number;
  portfolioUrl?: string;
  coverLetter?: string;
  consentTypes: ConsentType[];
}

export interface CandidateResumeUploadState {
  candidateId: number;
  storageKey: string;
  originalName: string;
  mimeType: UploadResumeRequest["mimeType"] | "";
  sizeBytes: number;
  file?: File;
}

export interface CandidatePortfolioLinkFormState {
  linkType: PortfolioLinkType;
  url: string;
  description: string;
  fileId?: number;
}

export interface CandidateInterviewConsentState {
  consentTypes: ConsentType[];
}

export interface CandidateDeviceCheckState {
  cameraGranted: boolean;
  microphoneGranted: boolean;
  networkStable: boolean;
}

export interface StartMockInterviewState {
  jobRole: string;
  difficulty: StartMockInterviewRequest["difficulty"];
  questionTypes: StartMockInterviewRequest["questionTypes"];
  showQuestionText: boolean;
  folderId: number | null;
}

export interface PaymentDevToolsVisibilityEnv {
  nodeEnv?: string;
}

export interface InterviewAnswerFormState {
  questionId?: number;
  videoFileId?: number;
  videoFile?: RuntimeFileAssetRequest;
  audioFileId?: number;
  audioFile?: RuntimeFileAssetRequest;
  durationSeconds: number;
}

export type InterviewDeviceSetupMode = "mock" | "recruiting";

export interface AiInterviewerProfile {
  displayName: "AI 면접관";
  toneLabel: string;
  voiceGuide: string;
  disclosure: string;
  infoButtonLabel: string;
  infoShortcutKey: "M";
}

export interface CameraPipPosition {
  x: number;
  y: number;
}

export interface CameraPipBounds {
  stageWidth: number;
  stageHeight: number;
  pipWidth: number;
  pipHeight: number;
  padding?: number;
  reservedTopHeight?: number;
}

export type InterviewRuntimeStatusChipId = "microphone" | "camera" | "network";
export type InterviewRuntimeStatusChipTone = "success" | "warning";

export interface InterviewRuntimeStatusChip {
  id: InterviewRuntimeStatusChipId;
  label: string;
  tone: InterviewRuntimeStatusChipTone;
  visible: boolean;
}

export interface InterviewRuntimeShortcutHint {
  key: "F";
  label: string;
}

export type InterviewRuntimePrimaryScreen = "interviewer" | "candidate";

export interface InterviewRuntimeLayoutState {
  mode: "compact" | "immersive";
  showShortcutHints: boolean;
  fullscreenButtonLabel: string;
  stageClassName: string;
  viewportLockClassName: "ai-interviewer-stage--viewport-lock";
  infoGapClassName: "" | "ai-interviewer-stage--reserved-info-gap";
}

export type CompactInterviewRuntimeLayoutState = InterviewRuntimeLayoutState & {
  mode: "compact";
  showShortcutHints: true;
  infoGapClassName: "ai-interviewer-stage--reserved-info-gap";
};

export type ImmersiveInterviewRuntimeLayoutState = InterviewRuntimeLayoutState & {
  mode: "immersive";
  showShortcutHints: false;
  infoGapClassName: "ai-interviewer-stage--reserved-info-gap";
};

export interface InterviewRuntimeScreenSwapState {
  primaryScreen: InterviewRuntimePrimaryScreen;
  stageClassName: "" | "ai-interviewer-stage--candidate-primary";
  cameraPanelClassName: "" | "candidate-camera-pip--primary";
  interviewerPanelClassName: "" | "ai-interviewer-figure--pip";
  swapButtonLabel: string;
  swapShortcutKey: "S";
  swapButtonAriaLabel: string;
}

export interface InterviewRuntimeFullscreenActiveInput {
  fullscreenElement: Element | null;
  stageElement: Element | null;
}

export interface InterviewRuntimePipShortcutStateInput {
  primaryScreen: InterviewRuntimePrimaryScreen;
  cameraPreviewVisible: boolean;
  interviewerPipVisible: boolean;
}

export interface InterviewRuntimePipShortcutState {
  primaryScreen: InterviewRuntimePrimaryScreen;
  cameraPreviewVisible: boolean;
  interviewerPipVisible: boolean;
}

export interface InterviewRuntimeProgressionStateInput {
  hasRuntimeData: boolean;
  currentQuestionAnswered: boolean;
  isCurrentQuestionLast: boolean;
  generatedFollowUpReady: boolean;
  answerProcessingBusy: boolean;
  isReansweringCurrentQuestion: boolean;
  recording: boolean;
  answeredQuestionCount: number;
  totalQuestions: number;
}

export interface InterviewRuntimeProgressionState {
  canMoveNextQuestion: boolean;
  canCompleteInterview: boolean;
}

export type InterviewerSessionMode = "tts-file" | "realtime-voice" | "avatar-stream";
export type InterviewerSessionModeFallbackReason =
  | "INVALID_MODE"
  | "REALTIME_VOICE_DISABLED"
  | "AVATAR_STREAM_DISABLED";
export type InterviewerSessionPhase =
  | "DISCONNECTED"
  | "CONNECTING"
  | "AI_SPEAKING"
  | "USER_SPEAKING"
  | "AI_THINKING"
  | "RECOVERING"
  | "FALLBACK_TTS";
export type InterviewerSessionTone = "neutral" | "speaking" | "recording" | "thinking" | "warning";
export type InterviewerSessionStageClassName =
  | ""
  | "ai-interviewer-stage--connecting"
  | "ai-interviewer-stage--ai-speaking"
  | "ai-interviewer-stage--user-speaking"
  | "ai-interviewer-stage--ai-thinking"
  | "ai-interviewer-stage--recovering"
  | "ai-interviewer-stage--fallback";
export type InterviewerSessionAvatarClassName = "" | "speaking";

export interface InterviewerSessionStateInput {
  mode?: InterviewerSessionMode;
  setupCompleted: boolean;
  hasCurrentQuestion: boolean;
  questionSpeechPlaying: boolean;
  questionSpeechSupported: boolean;
  recording: boolean;
  answerProcessingBusy: boolean;
  busy: boolean;
  currentQuestionLocked: boolean;
}

export interface InterviewerSessionState {
  mode: InterviewerSessionMode;
  phase: InterviewerSessionPhase;
  label: string;
  description: string;
  tone: InterviewerSessionTone;
  stageClassName: InterviewerSessionStageClassName;
  avatarClassName: InterviewerSessionAvatarClassName;
}

export interface InterviewerSessionModePolicyInput {
  requestedMode?: string;
  realtimeVoiceEnabled?: boolean;
  avatarStreamEnabled?: boolean;
}

export interface InterviewerSessionModePolicy {
  requestedMode: InterviewerSessionMode;
  activeMode: InterviewerSessionMode;
  fallbackReason?: InterviewerSessionModeFallbackReason;
}

export interface InterviewerSessionEvent {
  id: string;
  sequence: number;
  sessionId: number;
  questionId?: number;
  mode: InterviewerSessionMode;
  phase: InterviewerSessionPhase;
  action?: InterviewerSessionAction;
  label: string;
  occurredAt: string;
  source: "runtime-state" | "runtime-action";
}

export type InterviewerSessionAction =
  | "speech:start"
  | "speech:completed"
  | "speech:fallback"
  | "recording:start";

export interface CreateInterviewerSessionEventInput {
  sessionId: number;
  questionId?: number;
  state: Pick<InterviewerSessionState, "mode" | "phase" | "label">;
  sequence: number;
  occurredAt: string;
  previousEvent?: Pick<InterviewerSessionEvent, "sessionId" | "questionId" | "mode" | "phase">;
}

export interface CreateInterviewerSessionActionEventInput {
  sessionId: number;
  questionId?: number;
  mode: InterviewerSessionMode;
  phase: InterviewerSessionPhase;
  action: InterviewerSessionAction;
  label: string;
  sequence: number;
  occurredAt: string;
}

export interface TimedOutAiJobStatusInput {
  processLogId: number;
  processType: string;
  status: string;
  failure?: {
    category: string;
    reason: string;
    retryable: boolean;
  };
}

export interface CandidateReportNotificationSource {
  applicationId: number;
  companyName: string;
  jobTitle: string;
  reportStatus: ReportStatus;
  updatedAt?: string;
}

export interface CandidateReportCompletionPollingStatus {
  interviewStatus: string;
  interviewSessionStatus: string;
  reportStatus: ReportStatus;
}

export interface CandidateNotificationItem {
  id: string;
  applicationId: number;
  title: string;
  message: string;
  href: string;
  createdAt: string;
  read: boolean;
}

export interface RealtimeSessionUserNoticeInput {
  provider: "mock" | "openai" | string;
}

export interface InterviewSpeechPlaybackEventCurrentInput {
  playbackId: number;
  activePlaybackId: number;
  questionId?: number;
  currentQuestionId?: number;
  sessionId?: number;
  currentSessionId?: number;
}

export interface MeaningfulInterviewRecordingVoiceInput {
  peakLevel: number;
  activeFrameCount: number;
  minPeakLevel: number;
  minActiveFrameCount: number;
}

export interface AutoStartInterviewRecordingInput {
  setupCompleted: boolean;
  introCompleted: boolean;
  questionSpeechCompleted: boolean;
  questionSpeechPlaying: boolean;
  cameraReady: boolean;
  microphoneReady: boolean;
  hasCurrentQuestion: boolean;
  currentQuestionLocked: boolean;
  timerPhase: "PREPARING" | "ANSWERING";
  recording: boolean;
  hasAnswerFile: boolean;
  microphoneLevel: number;
}

export interface ManualInterviewRecordingInput {
  canRecord: boolean;
  setupCompleted: boolean;
  introCompleted: boolean;
  questionSpeechCompleted: boolean;
  questionSpeechPlaying: boolean;
  cameraReady: boolean;
  microphoneReady: boolean;
  networkReady: boolean;
  hasCurrentQuestion: boolean;
  currentQuestionLocked: boolean;
  timerPhase: "PREPARING" | "ANSWERING";
  recording: boolean;
  canSubmitAnswer: boolean;
  busy: boolean;
}

export interface RuntimeDeviceRecheckStateInput {
  setupCompleted: boolean;
  recording: boolean;
  cameraReady: boolean;
  microphoneReady: boolean;
  networkReady: boolean;
}

export type RuntimeDeviceRecheckReason = "NONE" | "MICROPHONE" | "CAMERA" | "NETWORK" | "DEVICE";

export interface RuntimeDeviceRecheckState {
  visible: boolean;
  label: string;
  reason: RuntimeDeviceRecheckReason;
}

export interface RealtimeMicrophoneRecordingStartInput {
  realtimeSpeechReady: boolean;
  questionSpeechCompleted: boolean;
  questionSpeechPlaying: boolean;
  timerPhase: "PREPARING" | "ANSWERING";
}

export interface InterviewRuntimeCountdownInput {
  setupCompleted: boolean;
  introCompleted: boolean;
  questionSpeechCompleted: boolean;
  questionSpeechPlaying: boolean;
  hasCurrentQuestion: boolean;
  currentQuestionLocked: boolean;
  busy: boolean;
  timerPhase: "PREPARING" | "ANSWERING";
  recording: boolean;
}

export interface RealtimeSilenceEncouragementDecisionInput {
  nowMs: number;
  silenceStartedAtMs: number | null;
  currentMicrophoneLevel: number;
  minimumVoiceLevel: number;
  hasDetectedVoiceDuringAnswer: boolean;
  alreadyEncouraged: boolean;
  remainingSeconds: number;
  silenceGraceMs?: number;
}

export type RealtimeSilenceEncouragementDecision =
  | {
      shouldEncourage: false;
      nextSilenceStartedAtMs: number | null;
    }
  | {
      shouldEncourage: true;
      nextSilenceStartedAtMs: number;
      text: string;
    };

export type InvalidRecordingRecoveryAction = "retry" | "hold";

export interface InvalidRecordingRecoveryActionInput {
  failedAttemptCount: number;
  maxAutoRetryCount: number;
}

export const requiredApplicationConsents: ConsentType[] = [
  "PRIVACY_COLLECTION",
  "AI_DOCUMENT_ANALYSIS",
  "AI_INTERVIEW_RECORDING",
];
export const requiredInterviewConsents: ConsentType[] = [
  "PRIVACY_COLLECTION",
  "AI_DOCUMENT_ANALYSIS",
  "AI_INTERVIEW_RECORDING",
];
export const maxCandidateDocumentSizeBytes = 20 * 1024 * 1024;
export const maxInterviewMediaSizeBytes = 500 * 1024 * 1024;
export const allowedCandidateDocumentMimeTypes: UploadResumeRequest["mimeType"][] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const allowedInterviewMediaMimeTypes: RuntimeFileAssetRequest["mimeType"][] = [
  "video/webm",
  "video/mp4",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
];

export const defaultCandidateJobQuery: CandidateJobQuery = {
  page: 1,
  limit: 9,
  sort: "createdAt",
  order: "desc",
};

export const defaultApplicationFormState: CandidateApplicationFormState = {
  candidateName: "",
  email: "",
  phone: "",
  consentTypes: [],
};

export const defaultPortfolioLinkFormState: CandidatePortfolioLinkFormState = {
  linkType: "PORTFOLIO",
  url: "",
  description: "",
};

export const defaultInterviewConsentState: CandidateInterviewConsentState = {
  consentTypes: [],
};

export const defaultDeviceCheckState: CandidateDeviceCheckState = {
  cameraGranted: false,
  microphoneGranted: false,
  networkStable: false,
};

export function createCameralessInterviewTestDeviceCheckState(): CandidateDeviceCheckState {
  return {
    cameraGranted: true,
    microphoneGranted: true,
    networkStable: true,
  };
}

export const defaultStartMockInterviewState: StartMockInterviewState = {
  jobRole: "Backend",
  difficulty: "NORMAL",
  questionTypes: ["INTRO", "TECHNICAL", "EXPERIENCE", "CLOSING"],
  showQuestionText: false,
  folderId: null,
};

export const defaultInterviewAnswerFormState: InterviewAnswerFormState = {
  durationSeconds: 0,
};

export function shouldShowPaymentDevTools(env: PaymentDevToolsVisibilityEnv = {}): boolean {
  if (env.nodeEnv === "production") return true;
  return true;
}

export function toSubmitApplicationRequest(state: CandidateApplicationFormState): SubmitApplicationRequest {
  const candidateName = state.candidateName.trim();
  const email = state.email.trim();
  const phone = state.phone.trim();

  if (!candidateName || !email || !phone) {
    throw new Error("candidateName, email, and phone are required before submitting an application.");
  }

  if (!isEmail(email)) {
    throw new Error("email must be a valid email address before submitting an application.");
  }

  if (!state.resumeFileId) {
    throw new Error("resumeFileId is required before submitting an application.");
  }

  if (!hasPortfolioArtifact(state)) {
    throw new Error("portfolioFileId or portfolioUrl is required before submitting an application.");
  }

  if (!hasRequiredConsents(state.consentTypes)) {
    throw new Error("required consentTypes are missing before submitting an application.");
  }

  return {
    candidateName,
    email,
    phone,
    resumeFileId: state.resumeFileId,
    portfolioFileId: state.portfolioFileId,
    portfolioUrl: state.portfolioUrl?.trim() || undefined,
    coverLetter: state.coverLetter?.trim() || undefined,
    consentTypes: state.consentTypes,
  };
}

export function isJobApplyEnabled(job: Pick<CandidateJobSummary, "jobId" | "postingStatus">): boolean {
  return job.postingStatus === "OPEN" || job.postingStatus === "CLOSING_SOON";
}

export function getCandidateJobActionHref(job: Pick<CandidateJobSummary, "jobId" | "postingStatus">): string {
  return isJobApplyEnabled(job)
    ? candidateApplicationInterviewRoutes.apply(job.jobId)
    : candidateApplicationInterviewRoutes.jobDetail(job.jobId);
}

export function getCandidateJobDetailActionHref(
  job: Pick<CandidateJobDetail, "jobId" | "canApply" | "alreadyApplied">,
): string | undefined {
  if (job.alreadyApplied) {
    return candidateApplicationInterviewRoutes.applications;
  }

  return job.canApply ? candidateApplicationInterviewRoutes.apply(job.jobId) : undefined;
}

export function getCandidateApplicationInterviewActionHref(
  application: Pick<CandidateApplicationSummary, "applicationId" | "interviewStatus">,
): string {
  return candidateApplicationInterviewRoutes.interviewGuide(application.applicationId);
}

export function getMockInterviewHref(session: Pick<InterviewRuntimeSessionView, "sessionId">): string {
  return candidateApplicationInterviewRoutes.mockInterview(session.sessionId);
}

export function getMockInterviewDeviceCheckHref(session: Pick<InterviewRuntimeSessionView, "sessionId">): string {
  return getMockInterviewHref(session);
}

export function getMockReportHref(report: Pick<CandidateMockReportSummary, "reportId">): string {
  return candidateApplicationInterviewRoutes.mockReportDetail(report.reportId);
}

export function getCandidateApplicationReportHref(
  application: Pick<CandidateApplicationSummary, "applicationId">,
): string {
  return candidateApplicationInterviewRoutes.applicationReport(application.applicationId);
}

export function getCandidateReportNotificationId(applicationId: number): string {
  return `candidate-report-complete-${applicationId}`;
}

export function buildCandidateReportCompleteNotifications(
  applications: CandidateReportNotificationSource[],
  readIds: ReadonlySet<string>,
  dismissedIds: ReadonlySet<string> = new Set(),
): CandidateNotificationItem[] {
  return applications
    .map((application) => buildCandidateReportCompleteNotification(application, readIds, dismissedIds))
    .filter((notification): notification is CandidateNotificationItem => Boolean(notification))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function buildCandidateReportCompleteNotification(
  application: CandidateReportNotificationSource,
  readIds: ReadonlySet<string>,
  dismissedIds: ReadonlySet<string> = new Set(),
): CandidateNotificationItem | null {
  if (application.reportStatus !== "COMPLETED") {
    return null;
  }

  const id = getCandidateReportNotificationId(application.applicationId);
  if (dismissedIds.has(id)) {
    return null;
  }

  const companyName = application.companyName.trim() || "기업";

  return {
    id,
    applicationId: application.applicationId,
    title: "채용 리포트 전송 완료",
    message: `"${companyName}" 면접 결과 전송이 정상적으로 이루어졌습니다. 합격을 빕니다.`,
    href: candidateApplicationInterviewRoutes.applicationReport(application.applicationId),
    createdAt: application.updatedAt ?? "",
    read: readIds.has(id),
  };
}

export function countUnreadCandidateNotifications(notifications: CandidateNotificationItem[]): number {
  return notifications.filter((notification) => !notification.read).length;
}

export function shouldPollRecruitingReportCompletion(
  status?: CandidateReportCompletionPollingStatus,
): boolean {
  if (!status) {
    return false;
  }

  const interviewCompleted =
    status.interviewStatus === "COMPLETED" || status.interviewSessionStatus === "COMPLETED";
  return interviewCompleted && status.reportStatus === "GENERATING";
}

export function getRecruitingReportPollingIntervalMs(elapsedMs: number): number {
  return elapsedMs < 120_000 ? 10_000 : 30_000;
}

export function isReportReady(status: ReportStatus): boolean {
  return status === "COMPLETED";
}

export function isReportGenerating(status: ReportStatus): boolean {
  return status === "GENERATING";
}

export function canOpenCandidateRecruitingReport(
  application: Pick<CandidateApplicationSummary, "interviewStatus" | "reportStatus">,
): boolean {
  return application.interviewStatus === "COMPLETED" && application.reportStatus !== "PENDING";
}

export function isCandidateFacingMockFeedbackSafe(feedback: CandidateMockReportFeedback): boolean {
  const text = [
    feedback.summary,
    ...feedback.strengths,
    ...feedback.improvements,
    ...feedback.nextPractice,
  ].join(" ");

  return (
    feedback.visibilityPolicy.candidateFacingOnly &&
    feedback.visibilityPolicy.excludesHiringDecision &&
    !/(합격|탈락|pass|fail|hire|reject)/i.test(text)
  );
}

export function isCandidateRecruitingReportLimited(report: CandidateRecruitingReportView): boolean {
  return (
    report.visibilityPolicy.candidateFacingOnly &&
    report.visibilityPolicy.excludesInternalMemo &&
    report.visibilityPolicy.excludesManualEvaluation &&
    !/(합격|탈락|pass|fail|hire|reject)/i.test([
      report.summary,
      report.candidateMessage,
      ...report.scores.flatMap((score) => [
        score.rationale,
        ...score.evidences.map((evidence) => evidence.evidenceText),
      ]),
    ].join(" "))
  );
}

export function hasRequiredConsents(consentTypes: ConsentType[]): boolean {
  return requiredApplicationConsents.every((consentType) => consentTypes.includes(consentType));
}

export function hasRequiredInterviewConsents(consentTypes: ConsentType[]): boolean {
  return requiredInterviewConsents.every((consentType) => consentTypes.includes(consentType));
}

export function isCandidateInterviewStartEnabled(
  state: Pick<CandidateApplicationSummary, "consentCompleted" | "deviceCheckCompleted" | "interviewStatus">,
): boolean {
  return state.consentCompleted && state.deviceCheckCompleted && state.interviewStatus === "READY";
}

export function shouldShowInterviewDeviceSetup(state: {
  mode: InterviewDeviceSetupMode;
  setupCompleted: boolean;
  runtimeStatus: InterviewRuntimeSessionView["status"];
}): boolean {
  if (state.setupCompleted) return false;
  if (state.mode === "mock") return true;

  return state.runtimeStatus !== "IN_PROGRESS" && state.runtimeStatus !== "COMPLETED";
}

export function hasPortfolioArtifact(state: Pick<CandidateApplicationFormState, "portfolioFileId" | "portfolioUrl">) {
  return Boolean(state.portfolioFileId) || Boolean(state.portfolioUrl?.trim());
}

export function toSaveInterviewConsentRequest(
  state: CandidateInterviewConsentState,
): SaveInterviewConsentRequest {
  if (!hasRequiredInterviewConsents(state.consentTypes)) {
    throw new Error("required interview consentTypes are missing before starting an interview.");
  }

  return {
    consentTypes: state.consentTypes,
  };
}

export function toDeviceCheckRequest(state: CandidateDeviceCheckState): InterviewDeviceCheckRequest {
  if (!state.cameraGranted || !state.microphoneGranted || !state.networkStable) {
    throw new Error("camera, microphone, and network checks must pass before starting an interview.");
  }

  return {
    cameraGranted: state.cameraGranted,
    microphoneGranted: state.microphoneGranted,
    networkStable: state.networkStable,
  };
}

export function toStartMockInterviewRequest(state: StartMockInterviewState): StartMockInterviewRequest {
  return {
    jobRole: state.jobRole.trim() || undefined,
    difficulty: state.difficulty,
    questionTypes: state.questionTypes?.length ? state.questionTypes : undefined,
    showQuestionText: true,
    folderId: state.folderId ?? undefined,
  };
}

export function toSaveInterviewAnswerRequest(state: InterviewAnswerFormState): SaveInterviewAnswerRequest {
  if (!state.questionId) {
    throw new Error("questionId is required before saving an interview answer.");
  }
  if (!state.videoFileId && !state.videoFile && !state.audioFileId && !state.audioFile) {
    throw new Error("video or audio file reference is required before saving an interview answer.");
  }
  if (state.durationSeconds < 1) {
    throw new Error("durationSeconds must be greater than 0 before saving an interview answer.");
  }
  if (state.videoFile) {
    assertInterviewMediaFile(state.videoFile);
  }
  if (state.audioFile) {
    assertInterviewMediaFile(state.audioFile);
  }

  return {
    questionId: state.questionId,
    videoFileId: state.videoFileId,
    videoFile: state.videoFile,
    audioFileId: state.audioFileId,
    audioFile: state.audioFile,
    durationSeconds: state.durationSeconds,
  };
}

const DEFAULT_RUNTIME_QUESTION_SPEECH_TEXT = "지원 직무와 관련된 경험을 구체적인 사례와 함께 말씀해주세요.";

export function toRuntimeQuestionSpeechText(question: Pick<RuntimeQuestionView, "content" | "audioPrompt">): string {
  const content = normalizeRuntimeQuestionSpeechText(question.content);
  if (content) return content;

  const audioPrompt = question.audioPrompt?.trim();
  if (!audioPrompt || audioPrompt.startsWith("audio://")) return DEFAULT_RUNTIME_QUESTION_SPEECH_TEXT;

  return normalizeRuntimeQuestionSpeechText(audioPrompt) || DEFAULT_RUNTIME_QUESTION_SPEECH_TEXT;
}

function normalizeRuntimeQuestionSpeechText(value?: string | null): string {
  const text = value?.trim();
  if (!text || text.startsWith("audio://")) return "";

  const embeddedQuestion = extractEmbeddedRuntimeQuestion(text);
  if (embeddedQuestion) return embeddedQuestion;

  const lines = text
    .split(/\r?\n/)
    .map((line) => stripRuntimeQuestionPromptArtifact(line.trim()))
    .filter((line) => line && !isRuntimeQuestionPromptMetadataLine(line));

  return lines.find(isReadableRuntimeQuestionLine) ?? lines[0] ?? "";
}

function extractEmbeddedRuntimeQuestion(text: string): string {
  const embeddedQuestionPatterns = [
    /(?:^|[\n\r.。])\s*(?:질문|question|interview\s+question)\s*\d*\s*[:：\-]\s*([^\n\r]+)/i,
    /(?:^|[\n\r.。])\s*(?:recruiting|mock)\s+interview\s+question\s*\d*\s*[:：\-]\s*([^\n\r]+)/i,
  ];

  for (const pattern of embeddedQuestionPatterns) {
    const match = text.match(pattern);
    const question = stripRuntimeQuestionPromptArtifact(match?.[1]?.trim() ?? "");
    if (question && !isRuntimeQuestionPromptMetadataLine(question)) return question;
  }

  return "";
}

function stripRuntimeQuestionPromptArtifact(line: string): string {
  return line
    .replace(/^[-*•]\s*/, "")
    .replace(/^(?:recruiting|mock)\s+interview\s+question\s*\d*\s*[:：\-]\s*/i, "")
    .replace(/^q(?:uestion)?\s*\d*\s*[\).:：\-]\s*/i, "")
    .replace(/^질문\s*\d*\s*[:：\-]\s*/, "")
    .trim();
}

function isRuntimeQuestionPromptMetadataLine(line: string): boolean {
  return /^(?:공고명|직무|평가\s*기준|질문\s*뱅크|지원서|이력서|criteria|job\s*description|resume|candidate|instructions?)\s*[:：]/i.test(line)
    || /^(?:다음|아래).*(?:질문|문항).*(?:생성|작성)/.test(line)
    || /^(?:generate|create|write).*(?:question|interview)/i.test(line);
}

function isReadableRuntimeQuestionLine(line: string): boolean {
  return /[?？]$/.test(line) || /(말씀|설명|소개|경험|사례|어떻게|무엇|왜|해보세요|주세요)/.test(line);
}

export function getAiInterviewerProfile(mode: InterviewDeviceSetupMode): AiInterviewerProfile {
  return {
    displayName: "AI 면접관",
    toneLabel: mode === "mock" ? "연습 코치형" : "공식 진행형",
    voiceGuide: mode === "mock" ? "편안하고 차분한 목소리" : "중립적이고 공식적인 목소리",
    disclosure: "이 면접관의 음성은 AI로 생성됩니다.",
    infoButtonLabel: "AI 면접관 설명",
    infoShortcutKey: "M",
  };
}

export function formatAiInterviewerQuestionPrompt({
  question,
  questionVisible,
}: {
  question?: Pick<RuntimeQuestionView, "content" | "audioPrompt">;
  questionVisible: boolean;
}): string {
  if (!question) return "현재 질문을 불러올 수 없습니다.";
  if (questionVisible) return toRuntimeQuestionSpeechText(question);

  const audioPrompt = question.audioPrompt?.trim();
  const content = question.content?.trim();
  return audioPrompt || content ? "질문 음성을 듣고 답변해주세요." : "질문을 준비 중입니다.";
}

export function clampCameraPipPosition(
  position: CameraPipPosition,
  bounds: CameraPipBounds,
): CameraPipPosition {
  const padding = bounds.padding ?? 16;
  const minX = padding;
  const minY = padding + (bounds.reservedTopHeight ?? 0);
  const maxX = Math.max(minX, bounds.stageWidth - bounds.pipWidth - padding);
  const maxY = Math.max(minY, bounds.stageHeight - bounds.pipHeight - padding);

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

export function getDefaultCameraPipPosition(bounds: CameraPipBounds): CameraPipPosition {
  const padding = bounds.padding ?? 16;

  return clampCameraPipPosition(
    {
      x: bounds.stageWidth - bounds.pipWidth - padding,
      y: Math.round((bounds.stageHeight - bounds.pipHeight) / 2),
    },
    bounds,
  );
}

export function getInterviewRuntimeStatusChips({
  microphoneReady,
  microphoneLevel,
  cameraReady,
  networkReady,
  networkStatus,
}: {
  microphoneReady: boolean;
  microphoneLevel: number;
  cameraReady: boolean;
  networkReady: boolean;
  networkStatus?: string;
}): InterviewRuntimeStatusChip[] {
  const chips: InterviewRuntimeStatusChip[] = [
    {
      id: "microphone",
      label: microphoneReady ? `음성 입력 ${Math.max(0, Math.min(100, Math.round(microphoneLevel)))}%` : "음성 확인 필요",
      tone: microphoneReady ? "success" : "warning",
      visible: true,
    },
  ];

  if (!cameraReady) {
    chips.push({
      id: "camera",
      label: "카메라 확인 필요",
      tone: "warning",
      visible: true,
    });
  }

  if (!networkReady) {
    chips.push({
      id: "network",
      label: networkStatus?.trim() || "네트워크 확인 필요",
      tone: "warning",
      visible: true,
    });
  }

  return chips;
}

export function getInterviewRuntimeShortcutHints(): InterviewRuntimeShortcutHint[] {
  return [
    { key: "F", label: "전체화면" },
  ];
}

export function getInterviewRuntimeLayoutState(args: {
  fullscreenActive: false;
}): CompactInterviewRuntimeLayoutState;
export function getInterviewRuntimeLayoutState(args: {
  fullscreenActive: true;
}): ImmersiveInterviewRuntimeLayoutState;
export function getInterviewRuntimeLayoutState(args: {
  fullscreenActive: boolean;
}): InterviewRuntimeLayoutState;
export function getInterviewRuntimeLayoutState({
  fullscreenActive,
}: {
  fullscreenActive: boolean;
}): InterviewRuntimeLayoutState {
  return {
    mode: fullscreenActive ? "immersive" : "compact",
    showShortcutHints: !fullscreenActive,
    fullscreenButtonLabel: fullscreenActive ? "전체화면 해제" : "전체화면",
    stageClassName: "ai-interviewer-stage",
    viewportLockClassName: "ai-interviewer-stage--viewport-lock",
    infoGapClassName: "ai-interviewer-stage--reserved-info-gap",
  };
}

export function getInterviewRuntimeScreenSwapState({
  primaryScreen,
}: {
  primaryScreen: InterviewRuntimePrimaryScreen;
}): InterviewRuntimeScreenSwapState {
  const candidatePrimary = primaryScreen === "candidate";

  return {
    primaryScreen,
    stageClassName: candidatePrimary ? "ai-interviewer-stage--candidate-primary" : "",
    cameraPanelClassName: candidatePrimary ? "candidate-camera-pip--primary" : "",
    interviewerPanelClassName: candidatePrimary ? "ai-interviewer-figure--pip" : "",
    swapButtonLabel: "전환",
    swapShortcutKey: "S",
    swapButtonAriaLabel: candidatePrimary ? "AI 면접관을 큰 화면으로 전환" : "내 화면을 큰 화면으로 전환",
  };
}

export function getInterviewRuntimeFullscreenActive({
  fullscreenElement,
  stageElement,
}: InterviewRuntimeFullscreenActiveInput): boolean {
  return Boolean(stageElement && fullscreenElement === stageElement);
}

export function getInterviewRuntimePipShortcutState({
  primaryScreen,
  cameraPreviewVisible,
  interviewerPipVisible,
}: InterviewRuntimePipShortcutStateInput): InterviewRuntimePipShortcutState {
  if (primaryScreen === "candidate") {
    return {
      primaryScreen,
      cameraPreviewVisible: true,
      interviewerPipVisible: !interviewerPipVisible,
    };
  }

  return {
    primaryScreen: "interviewer",
    cameraPreviewVisible: !cameraPreviewVisible,
    interviewerPipVisible,
  };
}

export function getInterviewRuntimeProgressionState({
  hasRuntimeData,
  currentQuestionAnswered,
  isCurrentQuestionLast,
  generatedFollowUpReady,
  answerProcessingBusy,
  isReansweringCurrentQuestion,
  recording,
  answeredQuestionCount,
  totalQuestions,
}: InterviewRuntimeProgressionStateInput): InterviewRuntimeProgressionState {
  const canMoveNextQuestion = Boolean(
    hasRuntimeData &&
      currentQuestionAnswered &&
      (!isCurrentQuestionLast || generatedFollowUpReady) &&
      !answerProcessingBusy &&
      !isReansweringCurrentQuestion &&
      !recording,
  );
  const canCompleteInterview = Boolean(
    hasRuntimeData &&
      currentQuestionAnswered &&
      isCurrentQuestionLast &&
      !generatedFollowUpReady &&
      !answerProcessingBusy &&
      answeredQuestionCount >= totalQuestions &&
      !isReansweringCurrentQuestion &&
      !recording,
  );

  return {
    canMoveNextQuestion,
    canCompleteInterview,
  };
}

export function getTimedOutAiJobStatus<T extends TimedOutAiJobStatusInput>(latest: T): T & {
  status: "FAILED";
  failure: {
    category: "TIMEOUT";
    reason: string;
    retryable: true;
  };
} {
  return {
    ...latest,
    status: "FAILED",
    failure: {
      category: "TIMEOUT",
      reason: "AI 작업 응답 시간이 초과되었습니다. 잠시 후 상태를 다시 확인해주세요.",
      retryable: true,
    },
  };
}

export function shouldContinueInterviewWithoutFollowUp(args: {
  failureCategory?: string;
  pipelineError?: unknown;
}): boolean {
  return Boolean(args.pipelineError || args.failureCategory === "TIMEOUT");
}

export function getRealtimeSessionUserNotice({
  provider,
}: RealtimeSessionUserNoticeInput): string {
  return provider === "openai" ? "실시간 AI 면접 연결을 준비했습니다." : "";
}

export function isInterviewSpeechPlaybackEventCurrent({
  playbackId,
  activePlaybackId,
  questionId,
  currentQuestionId,
  sessionId,
  currentSessionId,
}: InterviewSpeechPlaybackEventCurrentInput): boolean {
  if (playbackId !== activePlaybackId) return false;
  if (typeof questionId === "number" && questionId !== currentQuestionId) return false;
  if (typeof sessionId === "number" && sessionId !== currentSessionId) return false;
  return true;
}

export function hasMeaningfulInterviewRecordingVoice({
  peakLevel,
  activeFrameCount,
  minPeakLevel,
  minActiveFrameCount,
}: MeaningfulInterviewRecordingVoiceInput): boolean {
  return peakLevel >= minPeakLevel && activeFrameCount >= minActiveFrameCount;
}

export function shouldAutoStartInterviewRecording(input: AutoStartInterviewRecordingInput): boolean {
  return (
    input.setupCompleted &&
    input.introCompleted &&
    input.questionSpeechCompleted &&
    !input.questionSpeechPlaying &&
    input.cameraReady &&
    input.microphoneReady &&
    input.hasCurrentQuestion &&
    !input.currentQuestionLocked &&
    input.timerPhase === "ANSWERING" &&
    !input.recording &&
    !input.hasAnswerFile
  );
}

export function shouldEnableManualInterviewRecording(input: ManualInterviewRecordingInput): boolean {
  return (
    input.canRecord &&
    input.setupCompleted &&
    input.introCompleted &&
    input.questionSpeechCompleted &&
    !input.questionSpeechPlaying &&
    input.cameraReady &&
    input.microphoneReady &&
    input.networkReady &&
    input.hasCurrentQuestion &&
    !input.currentQuestionLocked &&
    input.timerPhase === "ANSWERING" &&
    !input.recording &&
    !input.canSubmitAnswer &&
    !input.busy
  );
}

export function getRuntimeDeviceRecheckState({
  setupCompleted,
  recording,
  cameraReady,
  microphoneReady,
  networkReady,
}: RuntimeDeviceRecheckStateInput): RuntimeDeviceRecheckState {
  if (!setupCompleted || recording || (cameraReady && microphoneReady && networkReady)) {
    return {
      visible: false,
      label: "장치 다시 점검",
      reason: "NONE",
    };
  }

  if (!microphoneReady && cameraReady && networkReady) {
    return {
      visible: true,
      label: "마이크 다시 점검",
      reason: "MICROPHONE",
    };
  }

  if (!cameraReady && microphoneReady && networkReady) {
    return {
      visible: true,
      label: "카메라 다시 점검",
      reason: "CAMERA",
    };
  }

  if (!networkReady && cameraReady && microphoneReady) {
    return {
      visible: true,
      label: "네트워크 다시 점검",
      reason: "NETWORK",
    };
  }

  return {
    visible: true,
    label: "카메라/마이크 다시 점검",
    reason: "DEVICE",
  };
}

export function shouldOpenRealtimeMicrophoneForRecordingStart({
  realtimeSpeechReady,
  questionSpeechCompleted,
  questionSpeechPlaying,
  timerPhase,
}: RealtimeMicrophoneRecordingStartInput): boolean {
  return realtimeSpeechReady && questionSpeechCompleted && !questionSpeechPlaying && timerPhase === "ANSWERING";
}

export function shouldRunInterviewRuntimeCountdown({
  setupCompleted,
  introCompleted,
  questionSpeechCompleted,
  questionSpeechPlaying,
  hasCurrentQuestion,
  currentQuestionLocked,
  busy,
  timerPhase,
  recording,
}: InterviewRuntimeCountdownInput): boolean {
  if (
    !setupCompleted ||
    !introCompleted ||
    !questionSpeechCompleted ||
    questionSpeechPlaying ||
    !hasCurrentQuestion ||
    currentQuestionLocked ||
    busy
  ) {
    return false;
  }

  return timerPhase === "PREPARING" || recording;
}

export function getRealtimeSilenceEncouragementDecision({
  nowMs,
  silenceStartedAtMs,
  currentMicrophoneLevel,
  minimumVoiceLevel,
  hasDetectedVoiceDuringAnswer,
  alreadyEncouraged,
  remainingSeconds,
  silenceGraceMs = 0,
}: RealtimeSilenceEncouragementDecisionInput): RealtimeSilenceEncouragementDecision {
  if (currentMicrophoneLevel >= minimumVoiceLevel) {
    return { shouldEncourage: false, nextSilenceStartedAtMs: null };
  }

  const nextSilenceStartedAtMs = silenceStartedAtMs ?? nowMs;
  if (alreadyEncouraged || remainingSeconds <= 15) {
    return { shouldEncourage: false, nextSilenceStartedAtMs };
  }

  const thresholdMs = hasDetectedVoiceDuringAnswer ? 20000 : 15000;
  if (nowMs - nextSilenceStartedAtMs < thresholdMs + Math.max(0, silenceGraceMs)) {
    return { shouldEncourage: false, nextSilenceStartedAtMs };
  }

  return {
    shouldEncourage: true,
    nextSilenceStartedAtMs,
    text: hasDetectedVoiceDuringAnswer
      ? "좋습니다. 이어서 말씀해주셔도 됩니다."
      : "괜찮습니다. 천천히 생각하고 말씀해보세요.",
  };
}

export function getInvalidRecordingRecoveryAction({
  failedAttemptCount,
  maxAutoRetryCount,
}: InvalidRecordingRecoveryActionInput): InvalidRecordingRecoveryAction {
  return failedAttemptCount <= maxAutoRetryCount ? "retry" : "hold";
}

export function resolveInterviewerSessionMode({
  requestedMode,
  realtimeVoiceEnabled = false,
  avatarStreamEnabled = false,
}: InterviewerSessionModePolicyInput): InterviewerSessionModePolicy {
  const parsedMode = parseInterviewerSessionMode(requestedMode);

  if (!parsedMode) {
    return {
      requestedMode: "tts-file",
      activeMode: "tts-file",
      fallbackReason: "INVALID_MODE",
    };
  }

  if (parsedMode === "realtime-voice" && !realtimeVoiceEnabled) {
    return {
      requestedMode: parsedMode,
      activeMode: "tts-file",
      fallbackReason: "REALTIME_VOICE_DISABLED",
    };
  }

  if (parsedMode === "avatar-stream" && !avatarStreamEnabled) {
    return {
      requestedMode: parsedMode,
      activeMode: "tts-file",
      fallbackReason: "AVATAR_STREAM_DISABLED",
    };
  }

  return {
    requestedMode: parsedMode,
    activeMode: parsedMode,
  };
}

export function getInterviewerSessionState({
  mode = "tts-file",
  setupCompleted,
  hasCurrentQuestion,
  questionSpeechPlaying,
  questionSpeechSupported,
  recording,
  answerProcessingBusy,
  busy,
  currentQuestionLocked,
}: InterviewerSessionStateInput): InterviewerSessionState {
  if (!setupCompleted) {
    return createInterviewerSessionState({
      mode,
      phase: "DISCONNECTED",
      label: "면접 준비 중",
      description: "장치 점검과 면접 시작을 기다리고 있습니다.",
      tone: "neutral",
      stageClassName: "",
      avatarClassName: "",
    });
  }

  if (answerProcessingBusy || (busy && currentQuestionLocked)) {
    return createInterviewerSessionState({
      mode,
      phase: "AI_THINKING",
      label: "답변 처리 중",
      description: "AI 면접관이 답변 처리 결과를 기다리고 있습니다.",
      tone: "thinking",
      stageClassName: "ai-interviewer-stage--ai-thinking",
      avatarClassName: "",
    });
  }

  if (!hasCurrentQuestion) {
    return createInterviewerSessionState({
      mode,
      phase: busy ? "CONNECTING" : "RECOVERING",
      label: busy ? "질문 준비 중" : "질문 복구 중",
      description: busy
        ? "AI 면접관이 다음 질문을 준비하고 있습니다."
        : "현재 질문 정보를 다시 불러오고 있습니다.",
      tone: busy ? "neutral" : "warning",
      stageClassName: busy ? "ai-interviewer-stage--connecting" : "ai-interviewer-stage--recovering",
      avatarClassName: "",
    });
  }

  if (questionSpeechPlaying) {
    return createInterviewerSessionState({
      mode,
      phase: "AI_SPEAKING",
      label: "AI 안내 중",
      description: "AI 면접관이 질문 음성을 안내하고 있습니다.",
      tone: "speaking",
      stageClassName: "ai-interviewer-stage--ai-speaking",
      avatarClassName: "speaking",
    });
  }

  if (recording) {
    return createInterviewerSessionState({
      mode,
      phase: "USER_SPEAKING",
      label: "답변 녹화 중",
      description: "지원자의 답변 녹화가 진행 중입니다.",
      tone: "recording",
      stageClassName: "ai-interviewer-stage--user-speaking",
      avatarClassName: "",
    });
  }

  if (!questionSpeechSupported) {
    return createInterviewerSessionState({
      mode,
      phase: "FALLBACK_TTS",
      label: "질문 보기 필요",
      description: "질문 음성 재생을 사용할 수 없어 텍스트 질문으로 진행합니다.",
      tone: "warning",
      stageClassName: "ai-interviewer-stage--fallback",
      avatarClassName: "",
    });
  }

  return createInterviewerSessionState({
    mode,
    phase: "CONNECTING",
    label: "질문 대기 중",
    description: "AI 면접관이 질문 안내를 시작할 준비를 하고 있습니다.",
    tone: "neutral",
    stageClassName: "ai-interviewer-stage--connecting",
    avatarClassName: "",
  });
}

export function createInterviewerSessionEvent({
  sessionId,
  questionId,
  state,
  sequence,
  occurredAt,
  previousEvent,
}: CreateInterviewerSessionEventInput): InterviewerSessionEvent | undefined {
  if (
    previousEvent &&
    previousEvent.sessionId === sessionId &&
    previousEvent.questionId === questionId &&
    previousEvent.mode === state.mode &&
    previousEvent.phase === state.phase
  ) {
    return undefined;
  }

  const normalizedSequence = Math.max(1, Math.floor(sequence));

  return {
    id: `interviewer-session-${sessionId}-${normalizedSequence}`,
    sequence: normalizedSequence,
    sessionId,
    questionId,
    mode: state.mode,
    phase: state.phase,
    label: state.label,
    occurredAt,
    source: "runtime-state",
  };
}

export function createInterviewerSessionActionEvent({
  sessionId,
  questionId,
  mode,
  phase,
  action,
  label,
  sequence,
  occurredAt,
}: CreateInterviewerSessionActionEventInput): InterviewerSessionEvent {
  const normalizedSequence = Math.max(1, Math.floor(sequence));

  return {
    id: `interviewer-session-${sessionId}-${normalizedSequence}`,
    sequence: normalizedSequence,
    sessionId,
    questionId,
    mode,
    phase,
    action,
    label,
    occurredAt,
    source: "runtime-action",
  };
}

export function trimInterviewerSessionEvents(
  events: InterviewerSessionEvent[],
  limit = 40,
): InterviewerSessionEvent[] {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  return events.slice(Math.max(0, events.length - normalizedLimit));
}

export function toUploadResumeRequest(state: CandidateResumeUploadState): UploadResumeRequest {
  if (!state.storageKey.startsWith(`candidate/${state.candidateId}/`)) {
    throw new Error("resume storageKey must be under the current candidate prefix.");
  }

  if (!state.originalName.trim()) {
    throw new Error("resume originalName is required.");
  }

  if (!isAllowedCandidateDocumentMimeType(state.mimeType)) {
    throw new Error("resume mimeType must be PDF or DOCX.");
  }

  if (state.sizeBytes < 1 || state.sizeBytes > maxCandidateDocumentSizeBytes) {
    throw new Error("resume sizeBytes must be between 1 and 20MB.");
  }

  return {
    storageKey: state.storageKey,
    originalName: state.originalName.trim(),
    mimeType: state.mimeType,
    sizeBytes: state.sizeBytes,
  };
}

export function toCreatePortfolioLinkRequest(state: CandidatePortfolioLinkFormState): CreatePortfolioLinkRequest {
  const url = state.url.trim();
  const hostname = assertHttpUrl(url);
  if (state.linkType === "GITHUB" && hostname !== "github.com" && !hostname.endsWith(".github.com")) {
    throw new Error("github portfolio link must use github.com.");
  }

  return {
    linkType: state.linkType,
    url,
    description: state.description.trim() || undefined,
    fileId: state.fileId,
  };
}

export function createResumeUploadStateFromFile(
  candidateId: number,
  file: File,
): CandidateResumeUploadState {
  return {
    candidateId,
    storageKey: buildCandidateStorageKey(candidateId, file.name),
    originalName: file.name,
    mimeType: isAllowedCandidateDocumentMimeType(file.type) ? file.type : "",
    sizeBytes: file.size,
    file,
  };
}

export function buildCandidateStorageKey(candidateId: number, originalName: string): string {
  const safeName = originalName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `candidate/${candidateId}/${Date.now()}-${safeName || "resume"}`;
}

export function isAllowedCandidateDocumentMimeType(mimeType: string): mimeType is UploadResumeRequest["mimeType"] {
  return allowedCandidateDocumentMimeTypes.includes(mimeType as UploadResumeRequest["mimeType"]);
}

export function isAllowedInterviewMediaMimeType(mimeType: string): mimeType is RuntimeFileAssetRequest["mimeType"] {
  return allowedInterviewMediaMimeTypes.includes(mimeType as RuntimeFileAssetRequest["mimeType"]);
}

export function normalizeInterviewMediaMimeType(mimeType: string): RuntimeFileAssetRequest["mimeType"] | undefined {
  const baseMimeType = mimeType.split(";")[0]?.trim().toLowerCase();
  return isAllowedInterviewMediaMimeType(baseMimeType) ? baseMimeType : undefined;
}

export function resolveRecordedMimeType({
  chunkMimeTypes,
  recorderMimeType,
  requestedMimeType,
}: {
  chunkMimeTypes: string[];
  recorderMimeType?: string;
  requestedMimeType?: string;
}): RuntimeFileAssetRequest["mimeType"] | string {
  const chunkMimeType = chunkMimeTypes.find((type) => normalizeInterviewMediaMimeType(type));
  return normalizeInterviewMediaMimeType(chunkMimeType ?? "")
    ?? normalizeInterviewMediaMimeType(recorderMimeType ?? "")
    ?? normalizeInterviewMediaMimeType(requestedMimeType ?? "")
    ?? chunkMimeType
    ?? recorderMimeType
    ?? requestedMimeType
    ?? "";
}

export function getInterviewMediaFileExtension(mimeType: string): "m4a" | "mp3" | "mp4" | "wav" | "webm" {
  const normalizedMimeType = normalizeInterviewMediaMimeType(mimeType);
  if (normalizedMimeType === "audio/mp4") return "m4a";
  if (normalizedMimeType === "audio/mpeg") return "mp3";
  if (normalizedMimeType === "audio/wav") return "wav";
  if (normalizedMimeType?.includes("mp4")) return "mp4";
  return "webm";
}

export function inferPortfolioLinkType(url: string): PortfolioLinkType {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "github.com" || hostname.endsWith(".github.com") ? "GITHUB" : "PORTFOLIO";
  } catch {
    return "PORTFOLIO";
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertHttpUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return parsed.hostname.toLowerCase();
  } catch {
    throw new Error("포트폴리오 URL은 http:// 또는 https://로 시작해야 합니다.");
  }
}

function assertInterviewMediaFile(file: RuntimeFileAssetRequest): void {
  if (!isAllowedInterviewMediaMimeType(file.mimeType)) {
    throw new Error("interview answer file must be an allowed audio or video type.");
  }
  if (file.sizeBytes < 1 || file.sizeBytes > maxInterviewMediaSizeBytes) {
    throw new Error("interview answer file sizeBytes must be between 1 and 500MB.");
  }
  if (!file.storageKey || !file.originalName.trim()) {
    throw new Error("interview answer file metadata is required.");
  }
}

function createInterviewerSessionState(
  state: InterviewerSessionState,
): InterviewerSessionState {
  return state;
}

function parseInterviewerSessionMode(value?: string): InterviewerSessionMode | undefined {
  const normalized = value?.trim();
  if (!normalized) return "tts-file";
  if (normalized === "tts-file" || normalized === "realtime-voice" || normalized === "avatar-stream") {
    return normalized;
  }
  return undefined;
}

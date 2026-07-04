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

export interface InterviewRuntimeLayoutState {
  mode: "compact" | "immersive";
  showShortcutHints: boolean;
  fullscreenButtonLabel: string;
  stageClassName: string;
  viewportLockClassName: "ai-interviewer-stage--viewport-lock";
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
  limit: 20,
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
};

export const defaultInterviewAnswerFormState: InterviewAnswerFormState = {
  durationSeconds: 0,
};

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

export function toRuntimeQuestionSpeechText(question: Pick<RuntimeQuestionView, "content" | "audioPrompt">): string {
  const content = question.content?.trim();
  if (content) return content;

  const audioPrompt = question.audioPrompt?.trim();
  if (!audioPrompt) return "질문을 준비 중입니다.";
  if (audioPrompt.startsWith("audio://")) return "음성 질문을 듣고 답변해주세요.";
  return audioPrompt;
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
  };
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
  file: Pick<File, "name" | "type" | "size">,
): CandidateResumeUploadState {
  return {
    candidateId,
    storageKey: buildCandidateStorageKey(candidateId, file.name),
    originalName: file.name,
    mimeType: isAllowedCandidateDocumentMimeType(file.type) ? file.type : "",
    sizeBytes: file.size,
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
    throw new Error("portfolio url must be http or https.");
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

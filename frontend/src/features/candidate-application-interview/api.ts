import { authFetch } from "../../api/client";

export type PostingStatus = "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "ARCHIVED";
export type CandidateJobListPostingStatus = Extract<PostingStatus, "OPEN" | "CLOSING_SOON">;
export type SortOrder = "asc" | "desc";
export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "INTERVIEW_WAITING"
  | "INTERVIEW_DONE"
  | "COMPLETED"
  | "CANCELED";
export type DocumentStatus = "NOT_SUBMITTED" | "SUBMITTED" | "EXTRACTING" | "EXTRACTED" | "FAILED";
export type DocumentType = "RESUME" | "PORTFOLIO";
export type InterviewStatus = "NOT_READY" | "READY" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type InterviewType = "MOCK" | "RECRUITING";
export type QuestionType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
export type DeviceCheckStatus = "PENDING" | "PASSED" | "FAILED";
export type ReportStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
export type ConsentType = "PRIVACY_COLLECTION" | "AI_DOCUMENT_ANALYSIS" | "AI_INTERVIEW_RECORDING";
export type PortfolioLinkType = "PORTFOLIO" | "GITHUB";

export interface PageMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
}

export interface ApiMeta {
  traceId: string;
  timestamp: string;
  page?: PageMeta;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiListResponse<T> {
  data: {
    items: T[];
  };
  meta: ApiMeta & {
    page: PageMeta;
  };
}

export interface ApiErrorDetail {
  field?: string;
  reason: string;
  message?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
  };
  meta: ApiMeta;
}

export interface CandidateJobQuery {
  page?: number;
  limit?: number;
  q?: string;
  jobRole?: string;
  jobGroup?: string;
  location?: string;
  careerLevel?: string;
  postingStatus?: CandidateJobListPostingStatus;
  sort?: "createdAt" | "endsOn" | "title";
  order?: SortOrder;
}

export interface CandidateJobSummary {
  jobId: number;
  companyName: string;
  companyLogoUrl: string | null;
  title: string;
  jobGroup: string;
  jobRole: string;
  location: string;
  careerLevel: string;
  employmentType: string;
  postingStatus: PostingStatus;
  startsOn: string;
  endsOn: string;
  canApply: boolean;
  alreadyApplied: boolean;
}

export interface CandidateJobDetail extends CandidateJobSummary {
  companyId: number;
  isPublic: boolean;
  companyIndustry: string;
  companyProfile: string;
  jobDescription: string;
  techStacks: string[];
  createdAt: string;
}

export interface CandidateDocumentPolicy {
  storageProvider: "S3";
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  storageKeyPrefix: string;
  metadataOnly: true;
}

export interface CandidateApplyView {
  job: CandidateJobDetail;
  documentPolicy: CandidateDocumentPolicy;
  requiredConsentTypes: ConsentType[];
  portfolioRequired: true;
}

export interface SubmitApplicationRequest {
  candidateName: string;
  email: string;
  phone: string;
  resumeFileId: number;
  portfolioFileId?: number;
  portfolioUrl?: string;
  coverLetter?: string;
  consentTypes: ConsentType[];
}

export interface UploadResumeRequest {
  storageKey: string;
  originalName: string;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  sizeBytes: number;
}

export interface CreatePortfolioLinkRequest {
  linkType?: PortfolioLinkType;
  url: string;
  description?: string;
  fileId?: number;
}

export interface CandidateFileAsset {
  fileId: number;
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: "ACTIVE";
  createdAt: string;
}

export interface CandidateApplication {
  applicationId: number;
  postingId: number;
  candidateId: number;
  applicationStatus: ApplicationStatus;
  documentStatus: DocumentStatus;
  interviewStatus: InterviewStatus;
  reportStatus: ReportStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface CandidateApplicationDocument {
  documentId: number;
  applicationId: number;
  fileId: number;
  documentType: DocumentType;
  parseStatus: DocumentStatus;
  uploadedAt: string;
}

export interface CandidateConsentRecord {
  consentId: number;
  applicationId: number;
  consentType: ConsentType;
  agreed: true;
  agreedAt: string;
}

export interface CandidateInterviewDeviceCheck {
  cameraGranted: boolean;
  microphoneGranted: boolean;
  networkStable: boolean;
  status: DeviceCheckStatus;
  checkedAt?: string;
}

export interface CandidateApplicationSummary {
  applicationId: number;
  postingId: number;
  candidateId: number;
  companyName: string;
  jobTitle: string;
  jobRole: string;
  location: string;
  applicationStatus: ApplicationStatus;
  documentStatus: DocumentStatus;
  interviewStatus: InterviewStatus;
  reportStatus: ReportStatus;
  submittedAt: string;
  updatedAt: string;
  sessionId: number;
  interviewType: InterviewType;
  interviewSessionStatus: InterviewStatus;
  interviewWindowStartsAt: string;
  interviewWindowEndsAt: string;
  consentCompleted: boolean;
  deviceCheckCompleted: boolean;
  canStartInterview: boolean;
}

export interface CandidateInterviewGuide {
  applicationId: number;
  sessionId: number;
  interviewType: "RECRUITING";
  applicationInterviewStatus: InterviewStatus;
  interviewSessionStatus: InterviewStatus;
  interviewWindowStartsAt: string;
  interviewWindowEndsAt: string;
  method: string[];
  requiredPreparations: string[];
  requiredConsentTypes: ConsentType[];
  consentCompleted: boolean;
  deviceCheckCompleted: boolean;
  canStart: boolean;
}

export interface SaveInterviewConsentRequest {
  consentTypes: ConsentType[];
}

export interface SaveInterviewConsentResponse {
  applicationId: number;
  sessionId: number;
  consentCompleted: boolean;
  deviceCheckCompleted: boolean;
  canStart: boolean;
  consents: CandidateConsentRecord[];
}

export interface InterviewDeviceCheckRequest {
  cameraGranted: boolean;
  microphoneGranted: boolean;
  networkStable: boolean;
}

export interface InterviewDeviceCheckResponse {
  applicationId: number;
  sessionId: number;
  consentCompleted: boolean;
  deviceCheckCompleted: boolean;
  canStart: boolean;
  deviceCheck: CandidateInterviewDeviceCheck;
}

export interface StartInterviewResponse {
  applicationId: number;
  sessionId: number;
  interviewStatus: "IN_PROGRESS";
  sessionStatus: "IN_PROGRESS";
  interviewUrl: string;
  startedAt: string;
}

export interface PublicInterviewStartRequest {
  token?: string;
  magicToken?: string;
}

export interface PublicInterviewStartResponse {
  applicationId: number;
  sessionId: number;
  interviewStatus: InterviewStatus;
  interviewSessionStatus: InterviewStatus;
  runtimePath: string;
  publicAccessToken: string;
}

export interface CandidateInterviewRuntimeView {
  applicationId: number;
  sessionId: number;
  interviewType: "RECRUITING";
  status: InterviewStatus;
  showQuestionText: boolean;
  canRecord: boolean;
  jobDescription?: string;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
}

export interface RuntimeFileAssetRequest {
  storageKey: string;
  originalName: string;
  mimeType: "video/webm" | "video/mp4" | "audio/webm" | "audio/mpeg" | "audio/wav";
  sizeBytes: number;
}

export interface StartMockInterviewRequest {
  jobRole?: string;
  difficulty?: "EASY" | "NORMAL" | "HARD";
  questionTypes?: QuestionType[];
  showQuestionText?: boolean;
}

export interface RuntimeQuestionView {
  questionId: number;
  questionType: QuestionType;
  sortOrder: number;
  content?: string;
  audioPrompt: string;
  answered: boolean;
  current: boolean;
}

export interface InterviewRuntimeSessionView {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  status: InterviewStatus;
  showQuestionText: boolean;
  currentQuestion?: RuntimeQuestionView;
  totalQuestions: number;
  answeredCount: number;
  canRecord: boolean;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
}

export interface StartMockInterviewResponse extends InterviewRuntimeSessionView {
  startedAt: string;
}

export interface RuntimeQuestionListResponse {
  sessionId: number;
  interviewType: InterviewType;
  showQuestionText: boolean;
  currentQuestionId?: number;
  questions: RuntimeQuestionView[];
}

export interface SaveInterviewAnswerRequest {
  questionId: number;
  videoFileId?: number;
  videoFile?: RuntimeFileAssetRequest;
  audioFileId?: number;
  audioFile?: RuntimeFileAssetRequest;
  durationSeconds: number;
}

export interface InterviewAnswer {
  answerId: number;
  sessionId: number;
  questionId: number;
  videoFileId?: number;
  audioFileId?: number;
  durationSeconds: number;
  submittedAt: string;
}

export interface SaveInterviewAnswerResponse {
  sessionId: number;
  answer: InterviewAnswer;
  videoFile?: CandidateFileAsset;
  audioFile?: CandidateFileAsset;
  nextQuestionAvailable: boolean;
}

export interface NextInterviewQuestionResponse {
  sessionId: number;
  previousQuestionId: number;
  currentQuestion?: RuntimeQuestionView;
  isLastQuestion: boolean;
}

export interface CompleteInterviewResponse {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  status: "COMPLETED";
  completedAt: string;
  answeredCount: number;
  totalQuestions: number;
}

export interface AiInterviewRequest {
  answerId?: number;
  fileAssetId?: number;
  audioFileId?: number;
  audioS3Key?: string;
  previousQuestion?: string;
  transcript?: string;
  jobDescription?: string;
  documentSummary?: string;
}

export interface AiInterviewHandoffResponse {
  accepted?: true;
  processLogId?: number;
  processType: "STT" | "FOLLOW_UP";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  queued?: boolean;
  inputRef?: string;
  sessionId?: number;
  applicationId?: number;
  answerId?: number;
  questionId?: number;
  fileId?: number;
  fileAssetId?: number;
  videoFileId?: number;
  audioFileId?: number;
  callbackTopic?: string;
}

export interface InsertFollowUpQuestionRequest {
  processLogId: number;
}

export interface InsertFollowUpQuestionResponse {
  sessionId: number;
  processLogId: number;
  sourceAnswerId: number;
  sourceQuestionId: number;
  question: RuntimeQuestionView;
  inserted: boolean;
  totalQuestions: number;
  nextQuestionAvailable: boolean;
}

export interface AiJobStatusResponse {
  processLogId: number;
  processType: "STT" | "FOLLOW_UP" | "REPORT_GENERATE" | string;
  status: CandidateAiProcessStatus;
  queued?: boolean;
  inputRef?: string;
  outputRef?: string;
  output?: unknown;
  sessionId?: number;
  applicationId?: number;
  failure?: {
    category: string;
    reason: string;
    retryable: boolean;
  };
}

export type CandidateReportType = "MOCK_INTERVIEW_REPORT" | "RECRUITING_REPORT";
export type TranscriptStatus = "PENDING" | "AVAILABLE";
export type CandidateAiProcessStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface CandidateAiProcessView {
  processLogId: number;
  processType: string;
  status: CandidateAiProcessStatus;
  failureCategory?: string;
  failureReason?: string;
  createdAt: string;
}

export interface CandidateReportEvidenceView {
  evidenceId: number;
  sourceType: string;
  answerId?: number;
  documentId?: number;
  documentRef?: string;
  evidenceText: string;
}

export interface CandidateReportScoreView {
  scoreId: number;
  criterionId?: number;
  criterionName?: string;
  score: number;
  rationale?: string;
  evidences: CandidateReportEvidenceView[];
}

export interface CandidateFollowUpQuestionView {
  followUpId: number;
  content: string;
  generationStatus: string;
  policy: string;
  createdAt: string;
}

export interface CandidateReportAnswerView {
  answerId: number;
  questionId: number;
  questionType?: QuestionType;
  sortOrder?: number;
  questionContent?: string;
  durationSeconds: number;
  submittedAt: string;
  transcriptStatus: TranscriptStatus;
  transcript?: string;
  followUpQuestions: CandidateFollowUpQuestionView[];
  evidences: CandidateReportEvidenceView[];
}

export interface CandidateMockInterviewHistoryItem {
  sessionId: number;
  reportId: number;
  interviewType: "MOCK";
  status: InterviewStatus;
  reportStatus: ReportStatus;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  totalQuestions: number;
  answeredCount: number;
}

export interface CandidateMockReportSummary extends CandidateMockInterviewHistoryItem {
  reportType: "MOCK_INTERVIEW_REPORT";
  feedbackEndpoint: string;
  mediaEndpoint: string;
  generateEndpoint: string;
}

export interface CandidateMockReportFeedback {
  reportId: number;
  sessionId: number;
  reportType: "MOCK_INTERVIEW_REPORT";
  status: ReportStatus;
  aiProcess?: CandidateAiProcessView;
  generatedAt?: string;
  totalScore?: number;
  summary?: string;
  strengths: string[];
  improvements: string[];
  nextPractice: string[];
  scores?: CandidateReportScoreView[];
  visibilityPolicy: {
    candidateFacingOnly: true;
    excludesHiringDecision: true;
    excludesInternalScores: true;
    excludesCompanyMemo: true;
  };
}

export interface CandidateReportFileReference {
  fileId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: CandidateFileAsset["status"];
  createdAt: string;
}

export interface CandidateMockReportMediaItem {
  answerId: number;
  questionId: number;
  questionType: QuestionType;
  sortOrder: number;
  questionContent?: string;
  videoFile?: CandidateReportFileReference;
  audioFile?: CandidateReportFileReference;
  durationSeconds: number;
  submittedAt: string;
  transcriptStatus: TranscriptStatus;
  transcript?: string;
  followUpQuestions: CandidateFollowUpQuestionView[];
}

export interface CandidateMockReportMedia {
  reportId: number;
  sessionId: number;
  reportType: "MOCK_INTERVIEW_REPORT";
  status: ReportStatus;
  media: CandidateMockReportMediaItem[];
}

export interface CandidateReportGenerationHandoff {
  accepted: boolean;
  queued: boolean;
  processLogId: number;
  processType: "REPORT_GENERATE";
  status: CandidateAiProcessStatus;
  reportStatus: ReportStatus;
  reportId: number;
  sessionId: number;
  applicationId?: number;
  reportType: CandidateReportType;
  answerIds: number[];
  fileIds: number[];
  callbackTopic: "ai.report.generate.requested";
  inputRef?: string;
}

export interface CandidateApplicationStatusView {
  applicationId: number;
  postingId: number;
  companyName: string;
  jobTitle: string;
  jobRole: string;
  applicationStatus: ApplicationStatus;
  documentStatus: DocumentStatus;
  interviewStatus: InterviewStatus;
  reportStatus: ReportStatus;
  sessionId: number;
  interviewSessionStatus: InterviewStatus;
  submittedAt: string;
  updatedAt: string;
  reportAvailable: boolean;
}

export interface CandidateRecruitingReportView {
  applicationId: number;
  sessionId: number;
  reportType: "RECRUITING_REPORT";
  status: ReportStatus;
  applicationStatus: ApplicationStatus;
  interviewStatus: InterviewStatus;
  companyName: string;
  jobTitle: string;
  reportId?: number;
  aiProcess?: CandidateAiProcessView;
  generatedAt?: string;
  totalScore?: number;
  summary?: string;
  candidateMessage: string;
  nextStepLabel: string;
  scores: CandidateReportScoreView[];
  answers: CandidateReportAnswerView[];
  visibilityPolicy: {
    candidateFacingOnly: true;
    excludesDetailedScores: boolean;
    excludesEvaluationEvidence: boolean;
    excludesInternalMemo: true;
    excludesManualEvaluation: true;
  };
}

export interface CandidatePortfolioLink {
  portfolioLinkId: number;
  candidateId: number;
  applicationId?: number;
  linkType: PortfolioLinkType;
  url: string;
  description?: string;
  fileId?: number;
  createdAt: string;
}

export interface SubmitApplicationResponse {
  application: CandidateApplication;
  documents: CandidateApplicationDocument[];
  consents: CandidateConsentRecord[];
  portfolioLink?: CandidatePortfolioLink;
}

export const candidateApiPaths = {
  jobs: "/api/v1/candidate/jobs",
  jobDetail: (jobId: number) => `/api/v1/candidate/jobs/${jobId}`,
  applyView: (jobId: number) => `/api/v1/candidate/jobs/${jobId}/apply`,
  submitApplication: (jobId: number) => `/api/v1/candidate/jobs/${jobId}/applications`,
  mockInterviews: "/api/v1/candidate/mock-interviews",
  mockRuntime: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}`,
  mockQuestions: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/questions`,
  mockAnswers: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/answers`,
  mockNextQuestion: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/next-question`,
  mockComplete: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/complete`,
  mockStt: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/stt`,
  mockFollowUpQuestion: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/follow-up-question`,
  mockFollowUpQuestionInsert: (sessionId: number) => `/api/v1/candidate/mock-interviews/${sessionId}/follow-up-questions/insert`,
  mockReports: "/api/v1/candidate/mock-interview/reports",
  mockHistory: "/api/v1/candidate/mock-interviews/history",
  mockReportFeedback: (reportId: number) => `/api/v1/candidate/mock-interview/reports/${reportId}/feedback`,
  mockReportMedia: (reportId: number) => `/api/v1/candidate/mock-interview/reports/${reportId}/media`,
  mockReportGenerate: (reportId: number) => `/api/v1/candidate/mock-interview/reports/${reportId}/generate`,
  applications: "/api/v1/candidate/applications",
  interviewGuide: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/interview-guide`,
  interviewConsent: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/consent`,
  applicationReport: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/report`,
  applicationReportGenerate: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/report/generate`,
  applicationStatus: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/status`,
  deviceCheck: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/device-check`,
  startInterview: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/interview/start`,
  interviewRuntime: (applicationId: number) => `/api/v1/candidate/applications/${applicationId}/interview`,
  recruitingQuestions: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/questions`,
  interviewMedia: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/media`,
  recruitingAnswers: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/answers`,
  recruitingNextQuestion: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/next-question`,
  recruitingComplete: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/complete`,
  recruitingStt: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/stt`,
  recruitingFollowUpQuestion: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/follow-up-question`,
  recruitingFollowUpQuestionInsert: (sessionId: number) => `/api/v1/candidate/interviews/${sessionId}/follow-up-questions/insert`,
  aiJobStatus: (processLogId: number) => `/api/v1/ai/jobs/${processLogId}/status`,
  resume: "/api/v1/candidate/resume",
  portfolioLinks: "/api/v1/candidate/portfolio-links",
} as const;

export const publicInterviewApiPaths = {
  startInterview: (applicationId: number) => `/api/v1/public/applications/${applicationId}/interview/start`,
  beginInterview: (applicationId: number) => `/api/v1/public/applications/${applicationId}/interview/begin`,
  interviewRuntime: (applicationId: number) => `/api/v1/public/applications/${applicationId}/interview`,
  deviceCheck: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/device-check`,
  questions: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/questions`,
  media: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/media`,
  answers: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/answers`,
  nextQuestion: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/next-question`,
  complete: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/complete`,
  stt: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/stt`,
  followUpQuestion: (sessionId: number) => `/api/v1/public/interviews/${sessionId}/follow-up-question`,
} as const;

export class CandidateApiError extends Error {
  readonly status: number;
  readonly body?: ApiErrorBody;

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.error.message ?? `Candidate API request failed with status ${status}`);
    this.name = "CandidateApiError";
    this.status = status;
    this.body = body;
  }
}

export interface CandidateApiClientOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  fetcher?: typeof fetch;
}

export interface CandidateApiClient {
  listJobs(query?: CandidateJobQuery): Promise<ApiListResponse<CandidateJobSummary>>;
  getJobDetail(jobId: number): Promise<ApiResponse<CandidateJobDetail>>;
  getApplyView(jobId: number): Promise<ApiResponse<CandidateApplyView>>;
  submitApplication(jobId: number, body: SubmitApplicationRequest): Promise<ApiResponse<SubmitApplicationResponse>>;
  startMockInterview(body: StartMockInterviewRequest): Promise<ApiResponse<StartMockInterviewResponse>>;
  getMockRuntime(sessionId: number): Promise<ApiResponse<InterviewRuntimeSessionView>>;
  listMockQuestions(sessionId: number): Promise<ApiResponse<RuntimeQuestionListResponse>>;
  saveMockAnswer(sessionId: number, body: SaveInterviewAnswerRequest): Promise<ApiResponse<SaveInterviewAnswerResponse>>;
  moveMockNextQuestion(sessionId: number): Promise<ApiResponse<NextInterviewQuestionResponse>>;
  completeMockInterview(sessionId: number): Promise<ApiResponse<CompleteInterviewResponse>>;
  requestMockStt(sessionId: number, body: AiInterviewRequest): Promise<ApiResponse<AiInterviewHandoffResponse>>;
  requestMockFollowUpQuestion(
    sessionId: number,
    body: AiInterviewRequest,
  ): Promise<ApiResponse<AiInterviewHandoffResponse>>;
  insertMockFollowUpQuestion(
    sessionId: number,
    body: InsertFollowUpQuestionRequest,
  ): Promise<ApiResponse<InsertFollowUpQuestionResponse>>;
  listMockReports(): Promise<ApiListResponse<CandidateMockReportSummary>>;
  listMockInterviewHistory(): Promise<ApiListResponse<CandidateMockInterviewHistoryItem>>;
  getMockReportFeedback(reportId: number): Promise<ApiResponse<CandidateMockReportFeedback>>;
  getMockReportMedia(reportId: number): Promise<ApiResponse<CandidateMockReportMedia>>;
  requestMockReportGeneration(reportId: number): Promise<ApiResponse<CandidateReportGenerationHandoff>>;
  listApplications(): Promise<ApiListResponse<CandidateApplicationSummary>>;
  getInterviewGuide(applicationId: number): Promise<ApiResponse<CandidateInterviewGuide>>;
  saveInterviewConsent(
    applicationId: number,
    body: SaveInterviewConsentRequest,
  ): Promise<ApiResponse<SaveInterviewConsentResponse>>;
  saveDeviceCheck(
    sessionId: number,
    body: InterviewDeviceCheckRequest,
  ): Promise<ApiResponse<InterviewDeviceCheckResponse>>;
  startInterview(applicationId: number): Promise<ApiResponse<StartInterviewResponse>>;
  getInterviewRuntime(applicationId: number): Promise<ApiResponse<CandidateInterviewRuntimeView>>;
  listRecruitingQuestions(sessionId: number): Promise<ApiResponse<RuntimeQuestionListResponse>>;
  uploadInterviewMedia(sessionId: number, file: File): Promise<ApiResponse<CandidateFileAsset>>;
  saveRecruitingAnswer(
    sessionId: number,
    body: SaveInterviewAnswerRequest,
  ): Promise<ApiResponse<SaveInterviewAnswerResponse>>;
  moveRecruitingNextQuestion(sessionId: number): Promise<ApiResponse<NextInterviewQuestionResponse>>;
  completeRecruitingInterview(sessionId: number): Promise<ApiResponse<CompleteInterviewResponse>>;
  requestRecruitingStt(sessionId: number, body: AiInterviewRequest): Promise<ApiResponse<AiInterviewHandoffResponse>>;
  requestRecruitingFollowUpQuestion(
    sessionId: number,
    body: AiInterviewRequest,
  ): Promise<ApiResponse<AiInterviewHandoffResponse>>;
  insertRecruitingFollowUpQuestion(
    sessionId: number,
    body: InsertFollowUpQuestionRequest,
  ): Promise<ApiResponse<InsertFollowUpQuestionResponse>>;
  getAiJobStatus(processLogId: number): Promise<ApiResponse<AiJobStatusResponse>>;
  getApplicationReport(applicationId: number): Promise<ApiResponse<CandidateRecruitingReportView>>;
  requestApplicationReportGeneration(applicationId: number): Promise<ApiResponse<CandidateReportGenerationHandoff>>;
  getApplicationStatus(applicationId: number): Promise<ApiResponse<CandidateApplicationStatusView>>;
  uploadResume(body: UploadResumeRequest): Promise<ApiResponse<CandidateFileAsset>>;
  createPortfolioLink(
    body: CreatePortfolioLinkRequest,
  ): Promise<ApiResponse<CandidatePortfolioLink>>;
}

export type InterviewRuntimeApiClient = Pick<
  CandidateApiClient,
  | "saveDeviceCheck"
  | "startInterview"
  | "uploadInterviewMedia"
  | "saveMockAnswer"
  | "saveRecruitingAnswer"
  | "moveMockNextQuestion"
  | "moveRecruitingNextQuestion"
  | "completeMockInterview"
  | "completeRecruitingInterview"
  | "requestMockStt"
  | "requestRecruitingStt"
  | "requestMockFollowUpQuestion"
  | "requestRecruitingFollowUpQuestion"
>;

export interface PublicInterviewApiClient extends InterviewRuntimeApiClient {
  startPublicInterview(
    applicationId: number,
    body: PublicInterviewStartRequest,
  ): Promise<ApiResponse<PublicInterviewStartResponse>>;
  getInterviewRuntime(applicationId: number): Promise<ApiResponse<CandidateInterviewRuntimeView>>;
  listRecruitingQuestions(sessionId: number): Promise<ApiResponse<RuntimeQuestionListResponse>>;
}

export function createCandidateApiClient(options: CandidateApiClientOptions = {}): CandidateApiClient {
  const fetcher = options.fetcher ?? fetchWithAuth;

  async function request<T>(
    path: string,
    init: RequestInit = {},
    query?: CandidateJobQueryParams,
  ): Promise<T> {
    const response = await fetcher(toUrl(options.baseUrl, path, query), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...options.headers,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new CandidateApiError(response.status, await readErrorBody(response));
    }

    return (await response.json()) as T;
  }

  async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
    const response = await fetcher(toUrl(options.baseUrl, path), {
      method: "POST",
      body: formData,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new CandidateApiError(response.status, await readErrorBody(response));
    }

    return (await response.json()) as T;
  }

  return {
    listJobs: (query = {}) => request<ApiListResponse<CandidateJobSummary>>(candidateApiPaths.jobs, {}, query),
    getJobDetail: (jobId) => request<ApiResponse<CandidateJobDetail>>(candidateApiPaths.jobDetail(jobId)),
    getApplyView: (jobId) => request<ApiResponse<CandidateApplyView>>(candidateApiPaths.applyView(jobId)),
    submitApplication: (jobId, body) =>
      request<ApiResponse<SubmitApplicationResponse>>(candidateApiPaths.submitApplication(jobId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    startMockInterview: (body) =>
      request<ApiResponse<StartMockInterviewResponse>>(candidateApiPaths.mockInterviews, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getMockRuntime: (sessionId) =>
      request<ApiResponse<InterviewRuntimeSessionView>>(candidateApiPaths.mockRuntime(sessionId)),
    listMockQuestions: (sessionId) =>
      request<ApiResponse<RuntimeQuestionListResponse>>(candidateApiPaths.mockQuestions(sessionId)),
    saveMockAnswer: (sessionId, body) =>
      request<ApiResponse<SaveInterviewAnswerResponse>>(candidateApiPaths.mockAnswers(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    moveMockNextQuestion: (sessionId) =>
      request<ApiResponse<NextInterviewQuestionResponse>>(candidateApiPaths.mockNextQuestion(sessionId), {
        method: "POST",
      }),
    completeMockInterview: (sessionId) =>
      request<ApiResponse<CompleteInterviewResponse>>(candidateApiPaths.mockComplete(sessionId), {
        method: "PATCH",
      }),
    requestMockStt: (sessionId, body) =>
      request<ApiResponse<AiInterviewHandoffResponse>>(candidateApiPaths.mockStt(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    requestMockFollowUpQuestion: (sessionId, body) =>
      request<ApiResponse<AiInterviewHandoffResponse>>(candidateApiPaths.mockFollowUpQuestion(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    insertMockFollowUpQuestion: (sessionId, body) =>
      request<ApiResponse<InsertFollowUpQuestionResponse>>(candidateApiPaths.mockFollowUpQuestionInsert(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listMockReports: () =>
      request<ApiListResponse<CandidateMockReportSummary>>(candidateApiPaths.mockReports),
    listMockInterviewHistory: () =>
      request<ApiListResponse<CandidateMockInterviewHistoryItem>>(candidateApiPaths.mockHistory),
    getMockReportFeedback: (reportId) =>
      request<ApiResponse<CandidateMockReportFeedback>>(candidateApiPaths.mockReportFeedback(reportId)),
    getMockReportMedia: (reportId) =>
      request<ApiResponse<CandidateMockReportMedia>>(candidateApiPaths.mockReportMedia(reportId)),
    requestMockReportGeneration: (reportId) =>
      request<ApiResponse<CandidateReportGenerationHandoff>>(candidateApiPaths.mockReportGenerate(reportId), {
        method: "POST",
      }),
    listApplications: () =>
      request<ApiListResponse<CandidateApplicationSummary>>(candidateApiPaths.applications),
    getInterviewGuide: (applicationId) =>
      request<ApiResponse<CandidateInterviewGuide>>(candidateApiPaths.interviewGuide(applicationId)),
    saveInterviewConsent: (applicationId, body) =>
      request<ApiResponse<SaveInterviewConsentResponse>>(candidateApiPaths.interviewConsent(applicationId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    saveDeviceCheck: (sessionId, body) =>
      request<ApiResponse<InterviewDeviceCheckResponse>>(candidateApiPaths.deviceCheck(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    startInterview: (applicationId) =>
      request<ApiResponse<StartInterviewResponse>>(candidateApiPaths.startInterview(applicationId), {
        method: "POST",
      }),
    getInterviewRuntime: (applicationId) =>
      request<ApiResponse<CandidateInterviewRuntimeView>>(candidateApiPaths.interviewRuntime(applicationId)),
    listRecruitingQuestions: (sessionId) =>
      request<ApiResponse<RuntimeQuestionListResponse>>(candidateApiPaths.recruitingQuestions(sessionId)),
    uploadInterviewMedia: (sessionId, file) => {
      const formData = new FormData();
      formData.append("file", file);
      return requestFormData<ApiResponse<CandidateFileAsset>>(candidateApiPaths.interviewMedia(sessionId), formData);
    },
    saveRecruitingAnswer: (sessionId, body) =>
      request<ApiResponse<SaveInterviewAnswerResponse>>(candidateApiPaths.recruitingAnswers(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    moveRecruitingNextQuestion: (sessionId) =>
      request<ApiResponse<NextInterviewQuestionResponse>>(candidateApiPaths.recruitingNextQuestion(sessionId), {
        method: "POST",
      }),
    completeRecruitingInterview: (sessionId) =>
      request<ApiResponse<CompleteInterviewResponse>>(candidateApiPaths.recruitingComplete(sessionId), {
        method: "PATCH",
      }),
    requestRecruitingStt: (sessionId, body) =>
      request<ApiResponse<AiInterviewHandoffResponse>>(candidateApiPaths.recruitingStt(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    requestRecruitingFollowUpQuestion: (sessionId, body) =>
      request<ApiResponse<AiInterviewHandoffResponse>>(candidateApiPaths.recruitingFollowUpQuestion(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    insertRecruitingFollowUpQuestion: (sessionId, body) =>
      request<ApiResponse<InsertFollowUpQuestionResponse>>(candidateApiPaths.recruitingFollowUpQuestionInsert(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getAiJobStatus: (processLogId) =>
      request<ApiResponse<AiJobStatusResponse>>(candidateApiPaths.aiJobStatus(processLogId)),
    getApplicationReport: (applicationId) =>
      request<ApiResponse<CandidateRecruitingReportView>>(candidateApiPaths.applicationReport(applicationId)),
    requestApplicationReportGeneration: (applicationId) =>
      request<ApiResponse<CandidateReportGenerationHandoff>>(candidateApiPaths.applicationReportGenerate(applicationId), {
        method: "POST",
      }),
    getApplicationStatus: (applicationId) =>
      request<ApiResponse<CandidateApplicationStatusView>>(candidateApiPaths.applicationStatus(applicationId)),
    uploadResume: (body) =>
      request<ApiResponse<CandidateFileAsset>>(candidateApiPaths.resume, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    createPortfolioLink: (body) =>
      request<ApiResponse<CandidatePortfolioLink>>(candidateApiPaths.portfolioLinks, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };
}

export function createPublicInterviewApiClient(
  options: CandidateApiClientOptions & { publicAccessToken?: string | null } = {},
): PublicInterviewApiClient {
  const fetcher = options.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      "content-type": "application/json",
      ...options.headers,
      ...(options.publicAccessToken ? { Authorization: `Bearer ${options.publicAccessToken}` } : {}),
      ...init.headers,
    };
    const response = await fetcher(toUrl(options.baseUrl, path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new CandidateApiError(response.status, await readErrorBody(response));
    }

    return (await response.json()) as T;
  }

  async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
    const headers = {
      ...options.headers,
      ...(options.publicAccessToken ? { Authorization: `Bearer ${options.publicAccessToken}` } : {}),
    };
    const response = await fetcher(toUrl(options.baseUrl, path), {
      method: "POST",
      body: formData,
      headers,
    });

    if (!response.ok) {
      throw new CandidateApiError(response.status, await readErrorBody(response));
    }

    return (await response.json()) as T;
  }

  const unsupportedMockMethod = async (): Promise<never> => {
    throw new Error("Public interview runtime does not support mock interview APIs.");
  };

  return {
    startPublicInterview: (applicationId, body) =>
      request<ApiResponse<PublicInterviewStartResponse>>(publicInterviewApiPaths.startInterview(applicationId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    saveDeviceCheck: (sessionId, body) =>
      request<ApiResponse<InterviewDeviceCheckResponse>>(publicInterviewApiPaths.deviceCheck(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    startInterview: (applicationId) =>
      request<ApiResponse<StartInterviewResponse>>(publicInterviewApiPaths.beginInterview(applicationId), {
        method: "POST",
      }),
    getInterviewRuntime: (applicationId) =>
      request<ApiResponse<CandidateInterviewRuntimeView>>(publicInterviewApiPaths.interviewRuntime(applicationId)),
    listRecruitingQuestions: (sessionId) =>
      request<ApiResponse<RuntimeQuestionListResponse>>(publicInterviewApiPaths.questions(sessionId)),
    uploadInterviewMedia: (sessionId, file) => {
      const formData = new FormData();
      formData.append("file", file);
      return requestFormData<ApiResponse<CandidateFileAsset>>(publicInterviewApiPaths.media(sessionId), formData);
    },
    saveRecruitingAnswer: (sessionId, body) =>
      request<ApiResponse<SaveInterviewAnswerResponse>>(publicInterviewApiPaths.answers(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    moveRecruitingNextQuestion: (sessionId) =>
      request<ApiResponse<NextInterviewQuestionResponse>>(publicInterviewApiPaths.nextQuestion(sessionId), {
        method: "POST",
      }),
    completeRecruitingInterview: (sessionId) =>
      request<ApiResponse<CompleteInterviewResponse>>(publicInterviewApiPaths.complete(sessionId), {
        method: "PATCH",
      }),
    requestRecruitingStt: (sessionId, body) =>
      request<ApiResponse<AiInterviewHandoffResponse>>(publicInterviewApiPaths.stt(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    requestRecruitingFollowUpQuestion: (sessionId, body) =>
      request<ApiResponse<AiInterviewHandoffResponse>>(publicInterviewApiPaths.followUpQuestion(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    saveMockAnswer: unsupportedMockMethod,
    moveMockNextQuestion: unsupportedMockMethod,
    completeMockInterview: unsupportedMockMethod,
    requestMockStt: unsupportedMockMethod,
    requestMockFollowUpQuestion: unsupportedMockMethod,
  };
}

function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit) {
  return authFetch(input instanceof Request ? input.url : input, init);
}

type CandidateJobQueryParams = Partial<Record<keyof CandidateJobQuery, string | number | undefined>>;

function toUrl(baseUrl: string | undefined, path: string, query?: CandidateJobQueryParams): string {
  const url = `${baseUrl ?? ""}${path}`;
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });

  const suffix = params.toString();
  return suffix ? `${url}?${suffix}` : url;
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return undefined;
  }
}

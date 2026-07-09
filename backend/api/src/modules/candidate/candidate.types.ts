export type PostingStatus = "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "ARCHIVED";
export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "INTERVIEW_WAITING"
  | "INTERVIEW_DONE"
  | "COMPLETED"
  | "CANCELED";
export type DocumentStatus = "NOT_SUBMITTED" | "SUBMITTED" | "EXTRACTING" | "EXTRACTED" | "FAILED";
export type InterviewStatus = "NOT_READY" | "READY" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type ReportStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
export type DocumentType = "RESUME" | "PORTFOLIO";
export type ConsentType = "PRIVACY_COLLECTION" | "AI_DOCUMENT_ANALYSIS" | "AI_INTERVIEW_RECORDING";
export type InterviewType = "MOCK" | "RECRUITING";
export type DeviceCheckStatus = "PENDING" | "PASSED" | "FAILED";
export type PortfolioLinkType = "PORTFOLIO" | "GITHUB";
export type SortOrder = "asc" | "desc";

export interface CurrentCandidateUser {
  userId: number;
  candidateId: number;
  userType: "CANDIDATE";
}

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

export interface CandidateJob {
  jobId: number;
  companyId: number;
  isPublic: boolean;
  companyName: string;
  companyLogoUrl: string | null;
  companyIndustry: string;
  companyProfile: string;
  title: string;
  jobGroup: string;
  jobRole: string;
  jobDescription: string;
  location: string;
  careerLevel: string;
  employmentType: string;
  techStacks: string[];
  postingStatus: PostingStatus;
  // 필터용 구조화 필드(공고 생성 시 선택). null 이면 미분류(필터 미대상).
  jobRoleCode: string | null;
  regionCode: string | null;
  careerMinYears: number | null;
  careerMaxYears: number | null;
  employmentTypeCode: string | null;
  recruitmentType: string | null;
  startsOn: string;
  endsOn: string;
  createdAt: string;
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

export interface CandidateJobDetail extends CandidateJob {
  canApply: boolean;
  alreadyApplied: boolean;
}

export interface CandidateDocumentPolicy {
  storageProvider: "S3";
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  storageKeyPrefix: string;
  metadataOnly: boolean;
}

export interface CandidateApplyView {
  job: CandidateJobDetail;
  documentPolicy: CandidateDocumentPolicy;
  requiredConsentTypes: ConsentType[];
  portfolioRequired: true;
}

export interface FileAsset {
  fileId: number;
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: "ACTIVE";
  createdAt: string;
}

export interface Application {
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

export interface ApplicationDocument {
  documentId: number;
  applicationId: number;
  fileId: number;
  documentType: DocumentType;
  parseStatus: DocumentStatus;
  uploadedAt: string;
}

export interface PortfolioLink {
  portfolioLinkId: number;
  candidateId: number;
  applicationId?: number;
  linkType: PortfolioLinkType;
  url: string;
  description?: string;
  fileId?: number;
  createdAt: string;
}

export interface ConsentRecord {
  consentId: number;
  applicationId: number;
  consentType: ConsentType;
  agreed: true;
  agreedAt: string;
}

export interface InterviewDeviceCheck {
  cameraGranted: boolean;
  microphoneGranted: boolean;
  networkStable: boolean;
  status: DeviceCheckStatus;
  checkedAt?: string;
}

export interface InterviewSession {
  sessionId: number;
  applicationId: number;
  candidateId: number;
  interviewType: InterviewType;
  status: InterviewStatus;
  showQuestionText: boolean;
  windowStartsAt: string;
  windowEndsAt: string;
  deviceCheck: InterviewDeviceCheck;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
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

export interface SaveInterviewConsentResult {
  applicationId: number;
  sessionId: number;
  consentCompleted: boolean;
  deviceCheckCompleted: boolean;
  canStart: boolean;
  consents: ConsentRecord[];
}

export interface InterviewDeviceCheckResult {
  applicationId: number;
  sessionId: number;
  consentCompleted: boolean;
  deviceCheckCompleted: boolean;
  canStart: boolean;
  deviceCheck: InterviewDeviceCheck;
}

export interface StartInterviewResult {
  applicationId: number;
  sessionId: number;
  interviewStatus: "IN_PROGRESS";
  sessionStatus: "IN_PROGRESS";
  interviewUrl: string;
  startedAt: string;
}

export interface CandidateInterviewRuntimeView {
  applicationId: number;
  sessionId: number;
  interviewType: "RECRUITING";
  status: InterviewStatus;
  showQuestionText: boolean;
  canRecord: boolean;
  jobDescription?: string;
  timePolicy: InterviewTimePolicy;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
}

export interface InterviewTimePolicy {
  preparationTimeSec: number;
  answerTimeSec: number;
  retryAllowed: boolean;
}

export interface ApplicationSubmissionResult {
  application: Application;
  documents: ApplicationDocument[];
  consents: ConsentRecord[];
  portfolioLink?: PortfolioLink;
}

export interface CandidateRepository {
  listJobs(): Promise<CandidateJob[]>;
  findJob(jobId: number): Promise<CandidateJob | undefined>;
  getInterviewTimePolicy(postingId: number): Promise<InterviewTimePolicy>;
  findFileAsset(fileId: number): Promise<FileAsset | undefined>;
  listApplications(candidateId: number): Promise<Application[]>;
  findApplication(applicationId: number): Promise<Application | undefined>;
  findCandidateUserId(candidateId: number): Promise<number | undefined>;
  listDocuments(applicationId: number): Promise<ApplicationDocument[]>;
  listConsentRecords(applicationId: number): Promise<ConsentRecord[]>;
  saveConsentRecords(applicationId: number, consentTypes: ConsentType[]): Promise<ConsentRecord[]>;
  findInterviewSession(sessionId: number): Promise<InterviewSession | undefined>;
  findInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined>;
  ensureInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined>;
  saveDeviceCheck(sessionId: number, deviceCheck: Omit<InterviewDeviceCheck, "status" | "checkedAt">): Promise<InterviewSession>;
  updateApplicationInterviewStatus(applicationId: number, status: InterviewStatus): Promise<Application>;
  updateApplicationReportStatus(applicationId: number, status: ReportStatus): Promise<Application>;
  updateInterviewSessionStatus(sessionId: number, status: InterviewStatus, startedAt?: string): Promise<InterviewSession>;
  hasApplication(candidateId: number, postingId: number): Promise<boolean>;
  createApplication(input: {
    postingId: number;
    candidateId: number;
    resumeFileId: number;
    portfolioFileId?: number;
    portfolioUrl?: string;
    consentTypes: ConsentType[];
  }): Promise<ApplicationSubmissionResult>;
  createFileAsset(input: Omit<FileAsset, "fileId" | "createdAt" | "status">): Promise<FileAsset>;
  createPortfolioLink(input: Omit<PortfolioLink, "portfolioLinkId" | "createdAt">): Promise<PortfolioLink>;
}

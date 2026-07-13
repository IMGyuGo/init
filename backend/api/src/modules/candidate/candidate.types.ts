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
  // 회사 위치(공고 상세 지도 핀용). 좌표 없으면 지도 미표시.
  workplaceAddress: string | null;
  workplaceLat: number | null;
  workplaceLng: number | null;
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
  tags: string[];
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

// 지원 화면 자동 입력용 회원 정보. 이름/이메일/연락처는 User, GitHub/블로그/포트폴리오는
// CandidateProfile(프로필 정본)에서 조회한다. (#272)
export interface ApplicantContact {
  name: string;
  email: string;
  phone: string | null;
  githubUrl: string | null;
  blogUrl: string | null;
  portfolioUrl: string | null;
}

// 지원자 프로필(내 정보) 정본. 이름/이메일/연락처는 User, 나머지는 CandidateProfile. (#272 프로필 편집)
export interface CandidateProfileView {
  name: string;
  email: string;
  phone: string | null;
  githubUrl: string | null;
  blogUrl: string | null;
  portfolioUrl: string | null;
  summary: string | null;
}

// 이메일은 로그인 정보라 수정 대상에서 제외한다.
export interface UpdateCandidateProfileInput {
  name?: string;
  phone?: string | null;
  githubUrl?: string | null;
  blogUrl?: string | null;
  portfolioUrl?: string | null;
  summary?: string | null;
}

export interface CandidateApplyView {
  job: CandidateJobDetail;
  documentPolicy: CandidateDocumentPolicy;
  requiredConsentTypes: ConsentType[];
  portfolioRequired: true;
  applicant: ApplicantContact;
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
  applicantName?: string | null;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  githubUrl?: string | null;
  blogUrl?: string | null;
  portfolioUrl?: string | null;
  motivation?: string | null;
  additionalInfo?: string | null;
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
  extractedText?: string | null;
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

export interface CandidateFolder {
  id: number;
  candidateId: number;
  name: string;
  githubUrl: string | null;
  blogUrl: string | null;
  portfolioUrl: string | null;
  resumeFileId: number | null;
  resumeFileName: string | null;
  motivation: string | null;
  extraNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateFolderContext extends CandidateFolder {
  resumeFile: FileAsset | null;
  resumeExtractedText: string | null;
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
  findLatestExtractedTextByFileId(fileId: number): Promise<string | null>;
  listApplications(candidateId: number): Promise<Application[]>;
  findApplication(applicationId: number): Promise<Application | undefined>;
  findCandidateUserId(candidateId: number): Promise<number | undefined>;
  findApplicantContact(userId: number): Promise<ApplicantContact | undefined>;
  saveApplicantPhone(userId: number, phone: string): Promise<void>;
  getCandidateProfile(candidateId: number): Promise<CandidateProfileView | undefined>;
  updateCandidateProfile(candidateId: number, input: UpdateCandidateProfileInput): Promise<CandidateProfileView>;
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
    candidateName?: string;
    email?: string;
    phone?: string;
    githubUrl?: string;
    blogUrl?: string;
    resumeFileId: number;
    portfolioFileId?: number;
    portfolioUrl?: string;
    motivation?: string;
    additionalInfo?: string;
    consentTypes: ConsentType[];
  }): Promise<ApplicationSubmissionResult>;
  createFileAsset(input: Omit<FileAsset, "fileId" | "createdAt" | "status">): Promise<FileAsset>;
  createPortfolioLink(input: Omit<PortfolioLink, "portfolioLinkId" | "createdAt">): Promise<PortfolioLink>;
  countFolders(candidateId: number): Promise<number>;
  listFolders(candidateId: number): Promise<CandidateFolder[]>;
  findFolder(folderId: number): Promise<CandidateFolder | undefined>;
  createFolder(input: Omit<CandidateFolder, "id" | "resumeFileName" | "createdAt" | "updatedAt">): Promise<CandidateFolder>;
  updateFolder(folderId: number, input: Partial<Omit<CandidateFolder, "id" | "candidateId" | "resumeFileName" | "createdAt" | "updatedAt">>): Promise<CandidateFolder>;
  deleteFolder(folderId: number): Promise<void>;
}

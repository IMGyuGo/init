export type ApiEnvelope<T> = {
  data: T;
  meta: {
    traceId: string;
    timestamp: string;
    page?: PageMeta;
  };
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  meta?: {
    traceId: string;
    timestamp: string;
  };
};

export type PageMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export type Recruitment = {
  recruitmentId: number;
  postingId: number;
  companyId: number;
  title: string;
  jobRole: string;
  jobDescription: string | null;
  careerRequirement: string | null;
  educationRequirement: string | null;
  salaryInfo: string | null;
  workLocation: string | null;
  employmentType: string | null;
  jobRoleCode: string | null;
  regionCode: string | null;
  careerMinYears: number | null;
  careerMaxYears: number | null;
  employmentTypeCode: string | null;
  recruitmentType: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "ARCHIVED";
  applicantCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentStatus = Recruitment["status"];

export type JobDescriptionImageUploadResponse = {
  fileId: number;
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
  createdAt: string;
  url: string;
};

export type CreateRecruitmentInput = {
  title: string;
  jobRole: string;
  jobDescription?: string;
  careerRequirement?: string | null;
  educationRequirement?: string | null;
  salaryInfo?: string | null;
  workLocation?: string | null;
  employmentType?: string | null;
  // 지원자 필터용 구조화 필드(선택 입력).
  jobRoleCode?: string;
  regionCode?: string;
  careerMinYears?: number;
  careerMaxYears?: number;
  employmentTypeCode?: string;
  recruitmentType?: "상시" | "마감형";
  startsOn?: string;
  endsOn?: string;
  status: "DRAFT" | "OPEN";
};

export type UpdateRecruitmentInput = CreateRecruitmentInput;

export type PostingDraftGenerateInput = {
  title: string;
  jobRole: string;
  keywords?: string[];
  summary?: string;
  careerRequirement?: string | null;
  employmentType?: string | null;
  workLocation?: string | null;
};

export type AiJobStatusResponse = {
  processLogId: number;
  processType: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  queued: boolean;
  inputRef: string;
  outputRef?: string;
  output?: unknown;
  failure?: {
    category: string;
    reason: string;
    retryable: boolean;
  };
};

export type Applicant = {
  applicantId: number;
  applicationId: number;
  recruitmentId: number;
  candidateId: number;
  name: string;
  email: string;
  phone: string | null;
  jobRole: string;
  applicationStatus: string;
  documentStatus: string;
  interviewStatus: string;
  reportStatus: string;
  screeningDecision: string;
  screeningMemo: string | null;
  interviewSession: {
    sessionId: number;
    status: string;
    interviewType: string;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  report: {
    reportId: number;
    status: string;
    totalScore: number | null;
    adjustedTotalScore?: number | null;
    integrityAdjustment?: {
      rawTotalScore: number | null;
      adjustedTotalScore: number | null;
      penalty: number;
      level: "NONE" | "LOW" | "MEDIUM" | "HIGH";
      reason: string;
      reasons: string[];
    } | null;
    summary: string | null;
    generatedAt: string | null;
  } | null;
  updatedAt: string;
};

export type ScreeningDecision = "UNDECIDED" | "PASS" | "HOLD" | "FAIL";

export type ApplicantInterviewFileAsset = {
  fileId: number;
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
};

export type ApplicantEvaluation = {
  applicant: Applicant;
  recruitment: {
    recruitmentId: number;
    postingId: number;
    title: string;
    jobRole: string;
  };
  statuses: {
    applicationStatus: string;
    documentStatus: string;
    interviewStatus: string;
    reportStatus: string;
  };
  screening: {
    decision: ScreeningDecision;
    memo: string | null;
  };
  reportAvailability: "AVAILABLE" | "NONE_OR_GENERATING";
  answers: Array<{
    answerId: number;
    questionId: number | null;
    videoFileId: number | null;
    audioFileId: number | null;
    videoFile: ApplicantInterviewFileAsset | null;
    audioFile: ApplicantInterviewFileAsset | null;
    questionType: string | null;
    questionContent: string | null;
    transcript: string | null;
    durationSeconds: number | null;
    submittedAt: string | null;
    nonverbalMetadata?: Record<string, unknown> | null;
    followUpQuestions: Array<{
      followUpId: number;
      content: string;
      generationStatus: string;
      policy: string;
      answer: {
        answerId: number;
        videoFileId: number | null;
        audioFileId: number | null;
        videoFile: ApplicantInterviewFileAsset | null;
        audioFile: ApplicantInterviewFileAsset | null;
        transcript: string | null;
        durationSeconds: number | null;
        submittedAt: string | null;
        nonverbalMetadata?: Record<string, unknown> | null;
      } | null;
    }>;
  }>;
  report: {
    reportId: number;
    status: string;
    totalScore: number | null;
    adjustedTotalScore?: number | null;
    integrityAdjustment?: {
      rawTotalScore: number | null;
      adjustedTotalScore: number | null;
      penalty: number;
      level: "NONE" | "LOW" | "MEDIUM" | "HIGH";
      reason: string;
      reasons: string[];
    } | null;
    summary: string | null;
    generatedAt: string | null;
    scores: Array<{
      scoreId: number;
      criterionId: number | null;
      criterionName: string | null;
      score: number;
      rationale: string | null;
      evidences: Array<{
        evidenceId: number;
        evidenceText: string;
      }>;
    }>;
  } | null;
};

export type UpdateScreeningStatusInput = {
  screeningDecision: ScreeningDecision;
  screeningMemo?: string;
};

import type {
  ApplicationStatus,
  DocumentStatus,
  InterviewStatus,
  PostingStatus,
  ReportStatus,
  ScreeningDecision,
} from "@prisma/client";

export type PostingStatusValue = `${PostingStatus}`;
export type ApplicationStatusValue = `${ApplicationStatus}`;
export type DocumentStatusValue = `${DocumentStatus}`;
export type InterviewStatusValue = `${InterviewStatus}`;
export type ReportStatusValue = `${ReportStatus}`;
export type ScreeningDecisionValue = `${ScreeningDecision}`;

export type NormalizedListQuery = {
  page: number;
  limit: number;
  q?: string;
  status?: string;
  sort: string;
  order: "asc" | "desc";
  skip: number;
  take: number;
};

export type RecruitmentRecord = {
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
  workplaceAddress: string | null;
  workplaceLat: number | null;
  workplaceLng: number | null;
  startsOn: Date | null;
  endsOn: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  applicantCount: number;
};

export type PublicRecruitmentRecord = Omit<RecruitmentRecord, "companyId" | "applicantCount" | "createdAt" | "updatedAt"> & {
  companyName: string;
};

export type ApplicantRecord = {
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
  applicationStatus: string;
  documentStatus: string;
  interviewStatus: string;
  reportStatus: string;
  screeningDecision: string | null;
  screeningMemo: string | null;
  submittedAt: Date | null;
  updatedAt: Date;
  candidate: {
    candidateId: number;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
    summary?: string | null;
    user: {
      userId: number;
      email: string;
      name: string;
      phone: string | null;
    };
  };
  documents?: Array<{
    documentId: number;
    applicationId: number;
    fileId: number | null;
    documentType: string;
    parseStatus: string;
    uploadedAt: Date;
    file: CompanyFileAssetRecord | null;
  }>;
  posting: {
    postingId: number;
    title: string;
    jobRole: string;
  };
  evaluationReports: Array<{
    reportId: number;
    status: string;
    totalScore: number | null;
    summary: string | null;
    generatedAt: Date | null;
    scores?: Array<{
      scoreId: number;
      score: number | null;
      rationale: string | null;
      criterion: {
        criterionId: number;
        tagName: string | null;
      } | null;
      evidences: Array<{
        evidenceId: number;
        evidenceText: string;
      }>;
    }>;
    ncsAnswerEvaluations?: Array<{
      ncsEvaluationId: number;
      answerId: number;
      sessionQuestionId: number;
      criterionId: number | null;
      criterionTitleSnapshot: string;
      ncsProfileId: string;
      ncsQuestionMode: string;
      ncsProfileVersion: string;
      scoreStatus: string;
      competencyScore: number | null;
      evidenceScore: number | null;
      totalScore: number | null;
      coverage: number;
      confidence: string;
      rubricVersion: string;
      promptVersion: string;
      providerMode: string;
      modelName: string | null;
      result: unknown;
      updatedAt: Date;
    }>;
  }>;
  interviewSessions: Array<{
    sessionId: number;
    status: string;
    interviewType: string;
    startedAt: Date | null;
    completedAt: Date | null;
    answers?: Array<{
      answerId: number;
      questionId: number | null;
      videoFileId: number | null;
      audioFileId: number | null;
      videoFile: CompanyFileAssetRecord | null;
      audioFile: CompanyFileAssetRecord | null;
      questionType: string | null;
      questionContent: string | null;
      transcript: string | null;
      durationSeconds: number | null;
      submittedAt: Date | null;
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
          videoFile: CompanyFileAssetRecord | null;
          audioFile: CompanyFileAssetRecord | null;
          transcript: string | null;
          durationSeconds: number | null;
          submittedAt: Date | null;
          nonverbalMetadata?: Record<string, unknown> | null;
        } | null;
      }>;
    }>;
  }>;
};

export type CompanyFileAssetRecord = {
  fileId: number;
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: Date;
};

export type JobDescriptionImageUploadFile = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type JobDescriptionImageUploadResponse = CompanyFileAssetRecord & {
  url: string;
};

export type PublicApplicationDocumentUploadFile = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

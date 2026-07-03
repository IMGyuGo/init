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
    user: {
      userId: number;
      email: string;
      name: string;
      phone: string | null;
    };
  };
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
      score: number;
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
  }>;
  interviewSessions: Array<{
    sessionId: number;
    status: string;
    interviewType: string;
    startedAt: Date | null;
    completedAt: Date | null;
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

import type {
  ApplicationStatus,
  DocumentStatus,
  InterviewStatus,
  PassMailDeliveryStatus,
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
export type PassMailDeliveryStatusValue = `${PassMailDeliveryStatus}`;

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

export type NormalizedApplicantListQuery = Omit<NormalizedListQuery, "status"> & {
  applicationStatus?: ApplicationStatusValue;
  documentStatus?: DocumentStatusValue;
  interviewStatus?: InterviewStatusValue;
  reportStatus?: ReportStatusValue;
  screeningDecision?: ScreeningDecisionValue;
};

export type ApplicantSummaryRecord = {
  activeTotal: number;
  canceledHistoryTotal: number;
  applicationStatusCounts: Partial<Record<ApplicationStatusValue, number>>;
  documentStatusCounts: Partial<Record<DocumentStatusValue, number>>;
  interviewStatusCounts: Partial<Record<InterviewStatusValue, number>>;
  reportStatusCounts: Partial<Record<ReportStatusValue, number>>;
  screeningDecisionCounts: Partial<Record<ScreeningDecisionValue, number>>;
  attentionRequiredTotal: number;
};

export type PassMailRecipientRecord = {
  applicationId: number;
  email: string;
  name: string;
  totalScore: number | null;
  deliveryStatus: "SENT" | "FAILED" | "SKIPPED";
};

export type PassMailResultRecord = {
  currentPassCount: number;
  targetPassCount: number;
  promotedCount: number;
  demotedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  recipients: PassMailRecipientRecord[];
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
  profileSnapshot?: Record<string, unknown> | null;
  applicationStatus: string;
  documentStatus: string;
  interviewStatus: string;
  reportStatus: string;
  screeningDecision: string | null;
  screeningDecisionReasonCode: string | null;
  screeningDecisionPolicyVersion: string | null;
  screeningPolicyVersion: number | null;
  screeningCriteriaVersion: number | null;
  screeningDecidedAt: Date | null;
  screeningMemo: string | null;
  passMailDeliveryStatus: PassMailDeliveryStatusValue;
  passMailSentAt: Date | null;
  passMailFailedAt: Date | null;
  passMailFailureReason: string | null;
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
    autoScreeningPolicyEnabled: boolean;
  };
  evaluationReports: Array<{
    reportId: number;
    applicationId?: number | null;
    sessionId?: number | null;
    status: string;
    totalScore: number | null;
    summary: string | null;
    ncsCompletionStatus?: string | null;
    ncsThresholdResult?: string | null;
    ncsAiDecision?: string | null;
    ncsDecisionReasonCode?: string | null;
    ncsScoringVersion?: string | null;
    ncsDecisionPolicyVersion?: string | null;
    ncsSummary?: unknown;
    generatedAt: Date | null;
    scores?: Array<{
      scoreId: number;
      score: number | null;
      rationale: string | null;
      ncsProfileId?: string | null;
      averageScore?: number | null;
      normalizedScore?: number | null;
      weight?: number | null;
      weightedScore?: number | null;
      minimumAverageScore?: number | null;
      assignedQuestionCount?: number | null;
      validQuestionCount?: number | null;
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
      behaviorPoints?: number | null;
      logicPoints?: number | null;
      baseScore?: number | null;
      effectiveScore?: number | null;
      followUpApplied?: boolean;
      coverage: number;
      confidence: string;
      rubricVersion: string;
      promptVersion: string;
      providerMode: string;
      modelName: string | null;
      result: unknown;
      evidences?: Array<{
        evidenceId: number;
        sourceAnswerId: number;
        sourceKind: string;
        quote: string;
        sortOrder: number;
      }>;
      sessionQuestion?: {
        runtimeQuestionId: number | null;
        generationSource: string | null;
        content: string | null;
        ncsQuestionMode: string | null;
        sortOrder: number;
      };
      updatedAt: Date;
    }>;
  }>;
  interviewSessions: Array<{
    sessionId: number;
    status: string;
    interviewType: string;
    startedAt: Date | null;
    completedAt: Date | null;
    answerTimeSecSnapshot?: number | null;
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

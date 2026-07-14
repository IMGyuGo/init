import type { NcsReportEvaluationOutputV1 } from "./ncs-report-contract";

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
  workplaceAddress: string | null;
  workplaceLat: number | null;
  workplaceLng: number | null;
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
  workplaceAddress?: string;
  workplaceLat?: number;
  workplaceLng?: number;
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
      scoreApplied?: boolean;
      source?: "CLIENT_RUNTIME_UNVERIFIED";
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
  submission: {
    name: string;
    email: string;
    phone: string | null;
    githubUrl: string | null;
    blogUrl: string | null;
    portfolioUrl: string | null;
    motivation: string | null;
    additionalInfo: string | null;
    documents: Array<{
      documentId: number;
      fileId: number;
      documentType: "RESUME" | "PORTFOLIO";
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      uploadedAt: string;
    }>;
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
      scoreApplied?: boolean;
      source?: "CLIENT_RUNTIME_UNVERIFIED";
      level: "NONE" | "LOW" | "MEDIUM" | "HIGH";
      reason: string;
      reasons: string[];
    } | null;
    summary: string | null;
    generatedAt: string | null;
    // NCS 평가 생산자의 canonical V1 output. 생산자 미배포 기간에는 null이다.
    ncsEvaluation?: NcsReportEvaluationOutputV1 | null;
    // NCS 평가 최종 결과(aiDecision). PASS/FAIL 2단계. (#289)
    result?: "PASS" | "FAIL" | null;
    // 총점 합격선(100점 만점 기준). 게이지에 마커로 표시한다.
    passScore?: number | null;
    // 주요 근거 요약. isGap=true 이면 근거 부족 항목으로 구분 표시한다.
    keyFindings?: Array<{ text: string; isGap?: boolean }> | null;
    // 꼬리질문 평가 요약(부족 포인트 목록 / 답변 보완 상태). ncsEvaluation.followUps. (#289)
    followUps?: Array<{
      baseAnswerId: number;
      followUpAnswerId: number;
      gapPoints: string[];
      answerStatus: string;
    }> | null;
    scores: Array<{
      scoreId: number;
      criterionId: number | null;
      criterionName: string | null;
      score: number;
      // 역량 원점수(가중 반영 전). (#289)
      rawScore?: number | null;
      // 역량 가중치(%). NCS 역량 비율 설정값. (#289)
      weight?: number | null;
      // 역량별 합격선(100점 환산). 레이더 점선·상세 충족 여부에 사용한다.
      passScore?: number | null;
      // NCS 역량 구분. criterionName 이 없을 때 라벨 대체에 사용됐다. (#289)
      ncsCompetency?: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING" | null;
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

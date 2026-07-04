import type {
  ApplicationStatus,
  DocumentStatus,
  FileAsset,
  InterviewStatus,
  ReportStatus,
} from "../candidate";
import type { QuestionType } from "../interview";

export type CandidateReportType = "MOCK_INTERVIEW_REPORT" | "RECRUITING_REPORT";
export type TranscriptStatus = "PENDING" | "AVAILABLE" | "UNAVAILABLE";
export type CandidateAnswerEvaluationStatus = "EVALUATED" | "STT_UNAVAILABLE";
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
  evaluationStatus?: CandidateAnswerEvaluationStatus;
  transcriptUnavailableReason?: string;
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
  status: FileAsset["status"];
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
  evaluationStatus?: CandidateAnswerEvaluationStatus;
  transcriptUnavailableReason?: string;
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

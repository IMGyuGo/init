import type { ReportStatus } from "../../candidate";
import type { AiProcessStatus, AiProcessType, ReportType } from "../report.types";

export const CANDIDATE_REPORT_REPOSITORY = Symbol("CANDIDATE_REPORT_REPOSITORY");

export type MaybePromise<T> = T | Promise<T>;

export interface CandidateReportEvidenceRecord {
  evidenceId: number;
  sourceType: string;
  answerId?: number;
  documentId?: number;
  documentRef?: string;
  evidenceText: string;
}

export interface CandidateReportScoreRecord {
  scoreId: number;
  criterionId?: number;
  criterionName?: string;
  score: number;
  rationale?: string;
  evidences: CandidateReportEvidenceRecord[];
}

export interface CandidateStoredReport {
  reportId: number;
  applicationId?: number;
  sessionId?: number;
  reportType: ReportType;
  status: ReportStatus;
  totalScore?: number;
  summary?: string;
  generatedAt?: string;
  failureCategory?: string;
  failureReason?: string;
  scores: CandidateReportScoreRecord[];
}

export interface CandidateFollowUpQuestionRecord {
  followUpId: number;
  answerId: number;
  content: string;
  generationStatus: string;
  policy: string;
  createdAt: string;
}

export interface CandidateAiProcessRecord {
  processLogId: number;
  applicationId?: number;
  sessionId?: number;
  reportId?: number;
  processType: AiProcessType;
  status: AiProcessStatus;
  failureCategory?: string;
  failureReason?: string;
  createdAt: string;
}

export interface CandidateReportCriterionRecord {
  criterionId: number;
  name: string;
  description?: string;
  weight: number;
  sortOrder?: number;
}

export interface CandidateReportRepository {
  findMockReportStatus(reportId: number): MaybePromise<ReportStatus | undefined>;
  saveMockReportStatus(reportId: number, status: ReportStatus): MaybePromise<void>;
  listEvaluationCriteriaByPosting(postingId: number): MaybePromise<CandidateReportCriterionRecord[]>;
  findLatestReportByApplication(
    applicationId: number,
    sessionId?: number,
  ): MaybePromise<CandidateStoredReport | undefined>;
  findLatestReportBySession(
    sessionId: number,
    reportType: ReportType,
  ): MaybePromise<CandidateStoredReport | undefined>;
  listFollowUpQuestionsByAnswerIds(answerIds: number[]): MaybePromise<CandidateFollowUpQuestionRecord[]>;
  findLatestReportProcessByApplication(
    applicationId: number,
    sessionId?: number,
  ): MaybePromise<CandidateAiProcessRecord | undefined>;
  findLatestReportProcessBySession(sessionId: number): MaybePromise<CandidateAiProcessRecord | undefined>;
}

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
  sourceType?: "COMPANY_CUSTOM" | "NCS_OFFICIAL" | "COMPANY_TALENT" | "SERVICE_COMMON";
  sourceCode?: string;
  sourceVersion?: string;
  sourceName?: string;
  behaviorIndicators?: string[];
  alignmentRationale?: string;
}

export interface CandidateReportEvaluationProfileRecord {
  status: "ACTIVE";
  rubricVersion: string;
  ncsWeight: number;
  companyWeight: number;
  serviceWeight: number;
  companyTalentProfile?: string;
  companyEvaluationPolicy?: string;
  officialNcsProvider: string;
  officialNcsSourceUrl: string;
  units: Array<{
    unitCode: string;
    classificationCode: string;
    unitName: string;
    ncsDegree: string;
    version: string;
    weight: number;
    behaviorIndicators: string[];
  }>;
}

export interface CandidateReportRepository {
  findMockReportStatus(reportId: number): MaybePromise<ReportStatus | undefined>;
  saveMockReportStatus(reportId: number, status: ReportStatus): MaybePromise<void>;
  listEvaluationCriteriaByPosting(postingId: number): MaybePromise<CandidateReportCriterionRecord[]>;
  findActiveEvaluationProfileByPosting(
    postingId: number,
  ): MaybePromise<CandidateReportEvaluationProfileRecord | undefined>;
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

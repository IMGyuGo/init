import type { ReportStatus } from "../../candidate";
import type {
  CandidateAiProcessRecord,
  CandidateFollowUpQuestionRecord,
  CandidateReportCriterionRecord,
  CandidateReportRepository,
  CandidateStoredReport,
} from "./candidate-report.repository";
import type { AiProcessStatus, ReportType } from "../report.types";
import { SERVICE_INTERVIEW_RUBRIC } from "../service/service-interview-rubric";

export class InMemoryCandidateReportRepository implements CandidateReportRepository {
  private readonly mockReportStatuses = new Map<number, ReportStatus>();
  private readonly reports = new Map<number, CandidateStoredReport>();
  private readonly followUpQuestions = new Map<number, CandidateFollowUpQuestionRecord[]>();
  private readonly reportProcesses: CandidateAiProcessRecord[] = [];

  findMockReportStatus(reportId: number): ReportStatus | undefined {
    return this.mockReportStatuses.get(reportId);
  }

  saveMockReportStatus(reportId: number, status: ReportStatus): void {
    this.mockReportStatuses.set(reportId, status);
  }

  listEvaluationCriteriaByPosting(postingId: number): CandidateReportCriterionRecord[] {
    return SERVICE_INTERVIEW_RUBRIC.map((criterion, index) => ({
      criterionId: postingId * 100 + index + 1,
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight,
      sortOrder: index + 1,
    }));
  }

  findLatestReportByApplication(applicationId: number, sessionId?: number): CandidateStoredReport | undefined {
    return this.latestReport((report) =>
      report.reportType === "RECRUITING_REPORT" &&
      (report.applicationId === applicationId || report.reportId === applicationId || report.sessionId === sessionId),
    );
  }

  findLatestReportBySession(sessionId: number, reportType: ReportType): CandidateStoredReport | undefined {
    return this.latestReport((report) =>
      report.reportType === reportType && (report.sessionId === sessionId || report.reportId === sessionId),
    );
  }

  listFollowUpQuestionsByAnswerIds(answerIds: number[]): CandidateFollowUpQuestionRecord[] {
    const answerIdSet = new Set(answerIds);
    return [...this.followUpQuestions.values()]
      .flat()
      .filter((question) => answerIdSet.has(question.answerId))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .map((question) => ({ ...question }));
  }

  findLatestReportProcessByApplication(applicationId: number, sessionId?: number): CandidateAiProcessRecord | undefined {
    return this.latestProcess((process) =>
      process.processType === "REPORT_GENERATE" &&
      this.processMatches(process, applicationId, sessionId),
    );
  }

  findLatestReportProcessBySession(sessionId: number): CandidateAiProcessRecord | undefined {
    return this.latestProcess((process) =>
      process.processType === "REPORT_GENERATE" && this.processMatches(process, undefined, sessionId),
    );
  }

  saveReport(report: CandidateStoredReport): void {
    this.reports.set(report.reportId, this.cloneReport(report));
  }

  saveFollowUpQuestion(question: CandidateFollowUpQuestionRecord): void {
    const questions = this.followUpQuestions.get(question.answerId) ?? [];
    questions.push({ ...question });
    this.followUpQuestions.set(question.answerId, questions);
  }

  saveReportProcess(process: CandidateAiProcessRecord): void {
    this.reportProcesses.push({ ...process });
  }

  markLatestReportProcessStatus(status: AiProcessStatus): void {
    const process = this.reportProcesses.at(-1);
    if (process) {
      process.status = status;
    }
  }

  private latestReport(predicate: (report: CandidateStoredReport) => boolean): CandidateStoredReport | undefined {
    const report = [...this.reports.values()]
      .filter(predicate)
      .sort((left, right) => this.reportSortValue(right) - this.reportSortValue(left))[0];
    return report ? this.cloneReport(report) : undefined;
  }

  private latestProcess(predicate: (process: CandidateAiProcessRecord) => boolean): CandidateAiProcessRecord | undefined {
    const process = this.reportProcesses
      .filter(predicate)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    return process ? { ...process } : undefined;
  }

  private processMatches(process: CandidateAiProcessRecord, applicationId?: number, sessionId?: number): boolean {
    return (
      (applicationId !== undefined && process.applicationId === applicationId) ||
      (sessionId !== undefined && process.sessionId === sessionId) ||
      (applicationId !== undefined && process.reportId === applicationId) ||
      (sessionId !== undefined && process.reportId === sessionId)
    );
  }

  private reportSortValue(report: CandidateStoredReport): number {
    return report.generatedAt ? Date.parse(report.generatedAt) : report.reportId;
  }

  private cloneReport(report: CandidateStoredReport): CandidateStoredReport {
    return {
      ...report,
      scores: report.scores.map((score) => ({
        ...score,
        evidences: score.evidences.map((evidence) => ({ ...evidence })),
      })),
    };
  }
}

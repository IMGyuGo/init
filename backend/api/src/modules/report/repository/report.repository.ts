import {
  CommunicationAnalysis,
  EvaluationContext,
  EvaluationReportSnapshot,
  FailureReason,
  GuardrailDecision,
  AiProcessRefs,
  AiProcessType,
  ProcessLogSnapshot,
  QueuedAiProcessSnapshot,
  ReportPipelineStep,
  ReportScore,
  ReportType,
  StoredCounts
} from "../report.types";

export const REPORT_REPOSITORY = Symbol("REPORT_REPOSITORY");

export class AiProcessNotFoundError extends Error {
  constructor(readonly processLogId: number) {
    super(`AI process log ${processLogId} was not found.`);
  }
}

export interface ReportRepository {
  createQueuedProcess(
    processType: AiProcessType,
    inputRef: string,
    refs?: AiProcessRefs
  ): Promise<QueuedAiProcessSnapshot>;
  getProcess(processLogId: number): Promise<QueuedAiProcessSnapshot>;
  consumeCompletedQuestionProcess(processLogId: number): Promise<boolean>;
  releaseCompletedQuestionProcess(processLogId: number): Promise<void>;
  markQueuedProcessCompleted(processLogId: number, outputRef: string): Promise<QueuedAiProcessSnapshot>;
  markQueuedProcessFailed(processLogId: number, failure: FailureReason): Promise<QueuedAiProcessSnapshot>;
  startProcess(reportId: number, reportType: ReportType, step: ReportPipelineStep): Promise<ProcessLogSnapshot>;
  markProcessRunning(processLogId: number): Promise<ProcessLogSnapshot>;
  markProcessCompleted(processLogId: number): Promise<ProcessLogSnapshot>;
  markProcessFailed(processLogId: number, failure: FailureReason): Promise<ProcessLogSnapshot>;
  markReportGenerating(
    reportId: number,
    reportType: ReportType,
    refs?: AiProcessRefs
  ): Promise<EvaluationReportSnapshot>;
  markReportCompleted(reportId: number, summary: string, totalScore: number): Promise<EvaluationReportSnapshot>;
  markReportFailed(reportId: number, failure: FailureReason): Promise<EvaluationReportSnapshot>;
  saveContext(reportId: number, context: EvaluationContext): Promise<void>;
  saveCommunicationAnalysis(reportId: number, communicationAnalysis: CommunicationAnalysis): Promise<void>;
  saveScoresAndEvidences(reportId: number, scores: ReportScore[]): Promise<StoredCounts>;
  saveGuardrailLog(processLogId: number, policyName: string, decision: GuardrailDecision): Promise<number>;
  getReport(reportId: number): Promise<EvaluationReportSnapshot>;
  countStored(reportId: number): Promise<StoredCounts>;
}

import { Injectable } from "@nestjs/common";
import { parseAiJobOutput } from "../service/ai-job-output";
import { AiProcessNotFoundError, ReportRepository } from "./report.repository";
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

interface GuardrailLogRecord {
  guardrailLogId: number;
  processLogId: number;
  reportId?: number;
  policyName: string;
  result: GuardrailDecision["result"];
  reason: string | null;
  failureCategory: GuardrailDecision["failureCategory"];
  createdAt: string;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

@Injectable()
export class InMemoryReportRepository implements ReportRepository {
  private nextProcessLogId = 1;
  private nextScoreId = 1;
  private nextEvidenceId = 1;
  private nextGuardrailLogId = 1;

  private readonly reports = new Map<number, EvaluationReportSnapshot>();
  private readonly processLogs = new Map<number, ProcessLogSnapshot>();
  private readonly processReportIds = new Map<number, number>();
  private readonly contexts = new Map<number, EvaluationContext>();
  private readonly communicationAnalyses = new Map<number, CommunicationAnalysis>();
  private readonly scoresByReport = new Map<number, ReportScore[]>();
  private readonly guardrailLogs: GuardrailLogRecord[] = [];
  private readonly queuedProcesses = new Map<number, QueuedAiProcessSnapshot>();

  async createQueuedProcess(
    processType: AiProcessType,
    inputRef: string,
    refs: AiProcessRefs = {}
  ): Promise<QueuedAiProcessSnapshot> {
    if (processType === "REPORT_GENERATE" && refs.applicationId) {
      const active = [...this.queuedProcesses.values()].find((process) =>
        process.processType === "REPORT_GENERATE" &&
        process.applicationId === refs.applicationId &&
        isActiveReportProcess(process)
      );
      if (active) return { ...active, idempotentReplay: true };
    }
    const process: QueuedAiProcessSnapshot = {
      processLogId: this.nextProcessLogId++,
      processType,
      status: "PENDING",
      inputRef,
      applicationId: refs.applicationId,
      sessionId: refs.sessionId,
      attempt: 1,
      maxAttempts: 3,
      idempotentReplay: false,
    };
    this.queuedProcesses.set(process.processLogId, process);
    return { ...process };
  }

  async getProcess(processLogId: number): Promise<QueuedAiProcessSnapshot> {
    const queuedProcess = this.queuedProcesses.get(processLogId);
    if (queuedProcess) {
      return this.withParsedOutput(queuedProcess);
    }

    const processLog = this.processLogs.get(processLogId);
    if (!processLog) {
      throw new AiProcessNotFoundError(processLogId);
    }

    return {
      processLogId: processLog.processLogId,
      processType: processLog.processType,
      status: processLog.status,
      inputRef: JSON.stringify({ step: processLog.step }),
      output: undefined,
      startedAt: processLog.startedAt,
      completedAt: processLog.completedAt,
      durationMs: processLog.durationMs,
      modelName: processLog.modelName,
      inputTokens: processLog.inputTokens,
      outputTokens: processLog.outputTokens,
      audioSeconds: processLog.audioSeconds,
      estimatedCostUsd: processLog.estimatedCostUsd,
      failure: processLog.failure
    };
  }

  async consumeCompletedQuestionProcess(processLogId: number): Promise<boolean> {
    const process = this.queuedProcesses.get(processLogId);
    if (!process || process.processType !== "QUESTION_GENERATE" || process.status !== "COMPLETED") return false;
    const input = parseJsonRecord(process.inputRef);
    if (input.consumedAt) return false;
    this.queuedProcesses.set(processLogId, {
      ...process,
      inputRef: JSON.stringify({ ...input, consumedAt: new Date().toISOString() }),
    });
    return true;
  }

  async releaseCompletedQuestionProcess(processLogId: number): Promise<void> {
    const process = this.queuedProcesses.get(processLogId);
    if (!process || process.processType !== "QUESTION_GENERATE" || process.status !== "COMPLETED") return;
    const input = parseJsonRecord(process.inputRef);
    if (!input.consumedAt) return;
    delete input.consumedAt;
    this.queuedProcesses.set(processLogId, { ...process, inputRef: JSON.stringify(input) });
  }

  async markQueuedProcessCompleted(processLogId: number, outputRef: string): Promise<QueuedAiProcessSnapshot> {
    const queuedProcess = this.queuedProcesses.get(processLogId);
    if (!queuedProcess) {
      throw new Error(`Queued process ${processLogId} was not initialized.`);
    }

    const updated: QueuedAiProcessSnapshot = {
      ...queuedProcess,
      status: "COMPLETED",
      outputRef,
      completedAt: new Date().toISOString()
    };
    this.queuedProcesses.set(processLogId, updated);
    return this.withParsedOutput(updated);
  }

  async markQueuedProcessFailed(processLogId: number, failure: FailureReason): Promise<QueuedAiProcessSnapshot> {
    const queuedProcess = this.queuedProcesses.get(processLogId);
    if (!queuedProcess) {
      throw new Error(`Queued process ${processLogId} was not initialized.`);
    }

    const updated: QueuedAiProcessSnapshot = {
      ...queuedProcess,
      status: "FAILED",
      failure,
      completedAt: new Date().toISOString()
    };
    this.queuedProcesses.set(processLogId, updated);
    return this.withParsedOutput(updated);
  }

  async startProcess(reportId: number, reportType: ReportType, step: ReportPipelineStep): Promise<ProcessLogSnapshot> {
    this.ensureReport(reportId, reportType);
    const processLog: ProcessLogSnapshot = {
      processLogId: this.nextProcessLogId++,
      processType: "REPORT_GENERATE",
      step,
      status: "PENDING"
    };
    this.processLogs.set(processLog.processLogId, processLog);
    this.processReportIds.set(processLog.processLogId, reportId);
    return { ...processLog };
  }

  async markProcessRunning(processLogId: number): Promise<ProcessLogSnapshot> {
    return this.updateProcess(processLogId, { status: "RUNNING", startedAt: new Date().toISOString() });
  }

  async markProcessCompleted(processLogId: number): Promise<ProcessLogSnapshot> {
    const processLog = this.processLogs.get(processLogId);
    const completedAt = new Date().toISOString();
    return this.updateProcess(processLogId, { status: "COMPLETED", completedAt, durationMs: durationMs(processLog?.startedAt, completedAt) });
  }

  async markProcessFailed(processLogId: number, failure: FailureReason): Promise<ProcessLogSnapshot> {
    const processLog = this.processLogs.get(processLogId);
    const completedAt = new Date().toISOString();
    return this.updateProcess(processLogId, { status: "FAILED", failure, completedAt, durationMs: durationMs(processLog?.startedAt, completedAt) });
  }

  async markReportGenerating(reportId: number, reportType: ReportType): Promise<EvaluationReportSnapshot> {
    const report = this.ensureReport(reportId, reportType);
    const updated: EvaluationReportSnapshot = {
      ...report,
      reportType,
      status: "GENERATING",
      failure: undefined
    };
    this.reports.set(reportId, updated);
    return { ...updated };
  }

  async markReportCompleted(reportId: number, summary: string, totalScore: number): Promise<EvaluationReportSnapshot> {
    const report = this.requireReport(reportId);
    const updated: EvaluationReportSnapshot = {
      ...report,
      status: "COMPLETED",
      summary,
      totalScore,
      failure: undefined
    };
    this.reports.set(reportId, updated);
    return { ...updated };
  }

  async markReportFailed(reportId: number, failure: FailureReason): Promise<EvaluationReportSnapshot> {
    const report = this.requireReport(reportId);
    const updated: EvaluationReportSnapshot = {
      ...report,
      status: "FAILED",
      failure
    };
    this.reports.set(reportId, updated);
    return { ...updated };
  }

  async saveContext(reportId: number, context: EvaluationContext): Promise<void> {
    this.contexts.set(reportId, context);
  }

  async saveCommunicationAnalysis(reportId: number, communicationAnalysis: CommunicationAnalysis): Promise<void> {
    this.communicationAnalyses.set(reportId, communicationAnalysis);
  }

  async saveScoresAndEvidences(reportId: number, scores: ReportScore[]): Promise<StoredCounts> {
    const storedScores = scores.map((score) => ({
      ...score,
      scoreId: this.nextScoreId++,
      evidences: score.evidences.map((evidence) => ({
        ...evidence,
        evidenceId: this.nextEvidenceId++
      }))
    }));
    this.scoresByReport.set(reportId, storedScores);

    return {
      scoreCount: storedScores.length,
      evidenceCount: storedScores.reduce((sum, score) => sum + score.evidences.length, 0),
      guardrailLogCount: this.guardrailLogs.length
    };
  }

  async saveGuardrailLog(processLogId: number, policyName: string, decision: GuardrailDecision): Promise<number> {
    const guardrailLogId = this.nextGuardrailLogId++;
    this.guardrailLogs.push({
      guardrailLogId,
      processLogId,
      reportId: this.processReportIds.get(processLogId),
      policyName,
      result: decision.result,
      reason: decision.reason,
      failureCategory: this.guardrailFailureCategory(decision),
      createdAt: new Date().toISOString()
    });
    return guardrailLogId;
  }

  async getReport(reportId: number): Promise<EvaluationReportSnapshot> {
    return { ...this.requireReport(reportId) };
  }

  async countStored(reportId: number): Promise<StoredCounts> {
    const scores = this.scoresByReport.get(reportId) ?? [];
    return {
      scoreCount: scores.length,
      evidenceCount: scores.reduce((sum, score) => sum + score.evidences.length, 0),
      guardrailLogCount: this.guardrailLogs.filter((log) => log.reportId === reportId).length
    };
  }

  private ensureReport(reportId: number, reportType: ReportType): EvaluationReportSnapshot {
    const existing = this.reports.get(reportId);
    if (existing) {
      return existing;
    }

    const created: EvaluationReportSnapshot = {
      reportId,
      reportType,
      status: "PENDING"
    };
    this.reports.set(reportId, created);
    return created;
  }

  private requireReport(reportId: number): EvaluationReportSnapshot {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} was not initialized.`);
    }
    return report;
  }

  private updateProcess(processLogId: number, patch: Partial<ProcessLogSnapshot>): ProcessLogSnapshot {
    const processLog = this.processLogs.get(processLogId);
    if (!processLog) {
      throw new Error(`Process log ${processLogId} was not initialized.`);
    }

    const updated = { ...processLog, ...patch };
    this.processLogs.set(processLogId, updated);
    return { ...updated };
  }

  private guardrailFailureCategory(decision: GuardrailDecision): GuardrailDecision["failureCategory"] {
    return decision.failureCategory ?? (decision.result === "BLOCKED" ? "NON_RETRYABLE" : null);
  }

  private withParsedOutput(process: QueuedAiProcessSnapshot): QueuedAiProcessSnapshot {
    return {
      ...process,
      output: parseAiJobOutput(process.outputRef)
    };
  }
}

function durationMs(startedAt: string | undefined, completedAt: string): number | undefined {
  if (!startedAt) {
    return undefined;
  }
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  return Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : undefined;
}

function isActiveReportProcess(process: QueuedAiProcessSnapshot): boolean {
  if (process.status === "PENDING" || process.status === "RUNNING") return true;
  return process.status === "FAILED" &&
    (process.failure?.category === "RETRYABLE" || process.failure?.category === "STT_RETRYABLE") &&
    (process.attempt ?? 1) < (process.maxAttempts ?? 3) &&
    Boolean(process.nextRetryAt);
}

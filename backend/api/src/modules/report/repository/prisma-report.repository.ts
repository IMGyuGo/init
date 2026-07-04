import { Injectable } from "@nestjs/common";
import { parseAiJobOutput } from "../service/ai-job-output";
import { PrismaService } from "../../../shared/prisma.service";
import { AiProcessNotFoundError, ReportRepository } from "./report.repository";
import {
  CommunicationAnalysis,
  EvaluationContext,
  EvaluationReportSnapshot,
  FailureReason,
  GuardrailDecision,
  AiProcessRefs,
  AiProcessType,
  isRetryableFailureCategory,
  ProcessLogSnapshot,
  QueuedAiProcessSnapshot,
  ReportPipelineStep,
  ReportScore,
  ReportType,
  StoredCounts
} from "../report.types";

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createQueuedProcess(
    processType: AiProcessType,
    inputRef: string,
    refs: AiProcessRefs = {}
  ): Promise<QueuedAiProcessSnapshot> {
    const processLogId = this.nextId();
    const processLog = await this.prisma.aiProcessLog.create({
      data: {
        processLogId,
        applicationId: refs.applicationId ? BigInt(refs.applicationId) : null,
        sessionId: refs.sessionId ? BigInt(refs.sessionId) : null,
        processType,
        status: "PENDING",
        inputRef,
        createdAt: new Date()
      }
    });

    return {
      processLogId: Number(processLog.processLogId),
      processType: processLog.processType as AiProcessType,
      status: "PENDING",
      inputRef: processLog.inputRef ?? "",
      applicationId: processLog.applicationId ? Number(processLog.applicationId) : undefined,
      sessionId: processLog.sessionId ? Number(processLog.sessionId) : undefined
    };
  }

  async getProcess(processLogId: number): Promise<QueuedAiProcessSnapshot> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) }
    });
    if (!processLog) {
      throw new AiProcessNotFoundError(processLogId);
    }
    return this.toQueuedProcessSnapshot(processLog);
  }

  async markQueuedProcessCompleted(processLogId: number, outputRef: string): Promise<QueuedAiProcessSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "COMPLETED",
        outputRef,
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toQueuedProcessSnapshot(processLog);
  }

  async markQueuedProcessFailed(processLogId: number, failure: FailureReason): Promise<QueuedAiProcessSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "FAILED",
        failureCategory: failure.category,
        failureReason: failure.reason
      }
    });
    return this.toQueuedProcessSnapshot(processLog);
  }

  async startProcess(reportId: number, reportType: ReportType, step: ReportPipelineStep): Promise<ProcessLogSnapshot> {
    await this.ensureReport(reportId, reportType);
    const processLogId = this.nextId();
    await this.prisma.aiProcessLog.create({
      data: {
        processLogId,
        processType: "REPORT_GENERATE",
        status: "PENDING",
        inputRef: JSON.stringify({ reportId, reportType, step }),
        createdAt: new Date()
      }
    });
    return this.processSnapshot(processLogId, step, "PENDING");
  }

  async markProcessRunning(processLogId: number): Promise<ProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: { status: "RUNNING" }
    });
    return this.toProcessSnapshot(processLog);
  }

  async markProcessCompleted(processLogId: number): Promise<ProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: { status: "COMPLETED" }
    });
    return this.toProcessSnapshot(processLog);
  }

  async markProcessFailed(processLogId: number, failure: FailureReason): Promise<ProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "FAILED",
        failureCategory: failure.category,
        failureReason: failure.reason
      }
    });
    return this.toProcessSnapshot(processLog);
  }

  async markReportGenerating(
    reportId: number,
    reportType: ReportType,
    refs?: AiProcessRefs
  ): Promise<EvaluationReportSnapshot> {
    const refData = this.reportRefData(refs);
    const report = await this.prisma.evaluationReport.upsert({
      where: { reportId: BigInt(reportId) },
      create: {
        reportId: BigInt(reportId),
        ...refData,
        reportType,
        status: "GENERATING"
      },
      update: {
        ...refData,
        reportType,
        status: "GENERATING",
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toReportSnapshot(report);
  }

  async markReportCompleted(reportId: number, summary: string, totalScore: number): Promise<EvaluationReportSnapshot> {
    const report = await this.prisma.evaluationReport.update({
      where: { reportId: BigInt(reportId) },
      data: {
        status: "COMPLETED",
        summary,
        totalScore,
        generatedAt: new Date(),
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toReportSnapshot(report);
  }

  async markReportFailed(reportId: number, failure: FailureReason): Promise<EvaluationReportSnapshot> {
    const report = await this.prisma.evaluationReport.update({
      where: { reportId: BigInt(reportId) },
      data: {
        status: "FAILED",
        failureCategory: failure.category,
        failureReason: failure.reason
      }
    });
    return this.toReportSnapshot(report);
  }

  async saveContext(reportId: number, context: EvaluationContext): Promise<void> {
    await this.appendOutputRef(reportId, { evaluationContext: context });
  }

  async saveCommunicationAnalysis(reportId: number, communicationAnalysis: CommunicationAnalysis): Promise<void> {
    await this.appendOutputRef(reportId, { communicationAnalysis });
  }

  async saveScoresAndEvidences(reportId: number, scores: ReportScore[]): Promise<StoredCounts> {
    await this.prisma.reportScore.deleteMany({
      where: { reportId: BigInt(reportId) }
    });

    for (const score of scores) {
      const scoreId = this.nextId();
      const criterionId = score.criterionId ? await this.resolveCriterionId(score.criterionId) : null;
      await this.prisma.reportScore.create({
        data: {
          scoreId,
          reportId: BigInt(reportId),
          criterionId,
          score: score.score,
          rationale: score.rationale,
          evidences: {
            create: score.evidences.map((evidence) => ({
              evidenceId: this.nextId(),
              sourceType: evidence.sourceType,
              answerId: evidence.answerId ? BigInt(evidence.answerId) : null,
              documentId: evidence.documentId ? BigInt(evidence.documentId) : null,
              documentRef: evidence.documentRef ?? null,
              evidenceText: evidence.text
            }))
          }
        }
      });
    }

    return this.countStored(reportId);
  }

  async saveGuardrailLog(processLogId: number, policyName: string, decision: GuardrailDecision): Promise<number> {
    const guardrailLogId = this.nextId();
    const data = {
      guardrailLogId,
      processLogId: BigInt(processLogId),
      policyName,
      result: decision.result,
      reason: decision.reason,
      failureCategory: this.guardrailFailureCategory(decision),
      createdAt: new Date()
    };
    await this.prisma.aiGuardrailLog.create({
      data
    });
    return Number(guardrailLogId);
  }

  async getReport(reportId: number): Promise<EvaluationReportSnapshot> {
    const report = await this.prisma.evaluationReport.findUniqueOrThrow({
      where: { reportId: BigInt(reportId) }
    });
    return this.toReportSnapshot(report);
  }

  async countStored(reportId: number): Promise<StoredCounts> {
    const scores = await this.prisma.reportScore.findMany({
      where: { reportId: BigInt(reportId) },
      include: { evidences: true }
    });
    const guardrailLogCount = await this.prisma.aiGuardrailLog.count({
      where: {
        processLog: {
          inputRef: {
            contains: `"reportId":${reportId}`
          }
        }
      }
    });
    return {
      scoreCount: scores.length,
      evidenceCount: scores.reduce((sum: number, score: { evidences: unknown[] }) => sum + score.evidences.length, 0),
      guardrailLogCount
    };
  }

  private async ensureReport(reportId: number, reportType: ReportType): Promise<void> {
    await this.prisma.evaluationReport.upsert({
      where: { reportId: BigInt(reportId) },
      create: {
        reportId: BigInt(reportId),
        reportType,
        status: "PENDING"
      },
      update: {}
    });
  }

  private async appendOutputRef(reportId: number, value: unknown): Promise<void> {
    const latestProcess = await this.prisma.aiProcessLog.findFirst({
      where: {
        inputRef: {
          contains: `"reportId":${reportId}`
        }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!latestProcess) {
      return;
    }
    await this.prisma.aiProcessLog.update({
      where: { processLogId: latestProcess.processLogId },
      data: { outputRef: JSON.stringify(value) }
    });
  }

  private reportRefData(refs?: AiProcessRefs): { applicationId?: bigint; sessionId?: bigint } {
    return {
      ...(refs?.applicationId !== undefined ? { applicationId: BigInt(refs.applicationId) } : {}),
      ...(refs?.sessionId !== undefined ? { sessionId: BigInt(refs.sessionId) } : {}),
    };
  }

  private async resolveCriterionId(criterionId: number): Promise<bigint | null> {
    const criterion = await this.prisma.evaluationCriterion.findUnique({
      where: { criterionId: BigInt(criterionId) },
      select: { criterionId: true }
    });
    return criterion ? BigInt(criterionId) : null;
  }

  private processSnapshot(processLogId: bigint, step: ReportPipelineStep, status: ProcessLogSnapshot["status"]): ProcessLogSnapshot {
    return {
      processLogId: Number(processLogId),
      processType: "REPORT_GENERATE",
      step,
      status
    };
  }

  private toProcessSnapshot(processLog: {
    processLogId: bigint;
    processType: string;
    status: string;
    inputRef: string | null;
    failureCategory: string | null;
    failureReason: string | null;
  }): ProcessLogSnapshot {
    const input = processLog.inputRef ? JSON.parse(processLog.inputRef) : {};
    return {
      processLogId: Number(processLog.processLogId),
      processType: processLog.processType as AiProcessType,
      step: input.step ?? "REPORT_GENERATE",
      status: processLog.status as ProcessLogSnapshot["status"],
      failure:
        processLog.failureCategory && processLog.failureReason
          ? {
              category: processLog.failureCategory as FailureReason["category"],
              reason: processLog.failureReason,
              retryable: isRetryableFailureCategory(processLog.failureCategory as FailureReason["category"])
            }
          : undefined
    };
  }

  private toQueuedProcessSnapshot(processLog: {
    processLogId: bigint;
    applicationId: bigint | null;
    sessionId: bigint | null;
    processType: string;
    status: string;
    inputRef: string | null;
    outputRef: string | null;
    failureCategory: string | null;
    failureReason: string | null;
  }): QueuedAiProcessSnapshot {
    return {
      processLogId: Number(processLog.processLogId),
      processType: processLog.processType as AiProcessType,
      status: processLog.status as QueuedAiProcessSnapshot["status"],
      inputRef: processLog.inputRef ?? "",
      outputRef: processLog.outputRef ?? undefined,
      output: parseAiJobOutput(processLog.outputRef),
      applicationId: processLog.applicationId ? Number(processLog.applicationId) : undefined,
      sessionId: processLog.sessionId ? Number(processLog.sessionId) : undefined,
      failure:
        processLog.failureCategory && processLog.failureReason
          ? {
              category: processLog.failureCategory as FailureReason["category"],
              reason: processLog.failureReason,
              retryable: isRetryableFailureCategory(processLog.failureCategory as FailureReason["category"])
            }
          : undefined
    };
  }

  private toReportSnapshot(report: {
    reportId: bigint;
    reportType: string;
    status: string;
    summary: string | null;
    totalScore: number | null;
    failureCategory: string | null;
    failureReason: string | null;
  }): EvaluationReportSnapshot {
    return {
      reportId: Number(report.reportId),
      reportType: report.reportType as ReportType,
      status: report.status as EvaluationReportSnapshot["status"],
      summary: report.summary ?? undefined,
      totalScore: report.totalScore ?? undefined,
      failure:
        report.failureCategory && report.failureReason
          ? {
              category: report.failureCategory as FailureReason["category"],
              reason: report.failureReason,
              retryable: isRetryableFailureCategory(report.failureCategory as FailureReason["category"])
            }
          : undefined
    };
  }

  private nextId(): bigint {
    return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  }

  private guardrailFailureCategory(decision: GuardrailDecision): GuardrailDecision["failureCategory"] {
    return decision.failureCategory ?? (decision.result === "BLOCKED" ? "NON_RETRYABLE" : null);
  }
}

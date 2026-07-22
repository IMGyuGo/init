import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { parseAiJobOutput } from "../service/ai-job-output";
import {
  buildSaltluxFixedDemoFinalization,
  type SaltluxFixedDemoFinalizationInput,
  type SaltluxFixedDemoProfileResult,
} from "../service/saltlux-fixed-demo-finalization";
import { PrismaService } from "../../../shared/prisma.service";
import {
  AUTO_SCREENING_DECISION_POLICY_VERSION,
} from "../service/auto-screening-decision";
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

  async finalizeSaltluxFixedDemo(input: SaltluxFixedDemoFinalizationInput): Promise<{
    processLogId: number;
    inputRef: string;
  }> {
    const result = buildSaltluxFixedDemoFinalization(input);
    const inputRef = JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      presentationFixtureId: "SALTLUX_AI_BACKEND_V1",
      reportId: input.reportId,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      answerIds: input.answers.map((answer) => answer.answerId),
    });

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        'SELECT "application_id" FROM "applications" WHERE "application_id" = $1 FOR UPDATE',
        BigInt(input.applicationId),
      );

      const existingProcess = await transaction.aiProcessLog.findFirst({
        where: {
          applicationId: BigInt(input.applicationId),
          sessionId: BigInt(input.sessionId),
          processType: "REPORT_GENERATE",
          status: "COMPLETED",
          inputRef: { contains: '"presentationFixtureId":"SALTLUX_AI_BACKEND_V1"' },
        },
        orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
      });
      const existingReport = await transaction.evaluationReport.findUnique({
        where: { reportId: BigInt(input.reportId) },
        include: {
          scores: { include: { evidences: true } },
          ncsAnswerEvaluations: { include: { evidences: true } },
        },
      });
      const applicationContext = await transaction.application.findUnique({
        where: { applicationId: BigInt(input.applicationId) },
      });
      if (!applicationContext) throw new Error("Saltlux demo application was not found");
      if (
        existingProcess &&
        existingReport?.status === "COMPLETED" &&
        existingReport.totalScore === result.totalScore &&
        existingReport.ncsCompletionStatus === "COMPLETE" &&
        existingReport.scores.filter((score) => score.ncsProfileId !== null).length === result.profiles.length &&
        existingReport.scores.filter((score) => score.ncsProfileId === null && score.evidences.length > 0).length === result.profiles.length &&
        existingReport.ncsAnswerEvaluations.length === result.profiles.length &&
        existingReport.ncsAnswerEvaluations.every((evaluation) => evaluation.evidences.length > 0) &&
        applicationContext.screeningDecision === "PASS" &&
        applicationContext.screeningDecisionReportId === BigInt(input.reportId)
      ) {
        return { processLogId: Number(existingProcess.processLogId), inputRef };
      }

      const now = new Date();
      await transaction.evaluationReport.upsert({
        where: { reportId: BigInt(input.reportId) },
        create: {
          reportId: BigInt(input.reportId),
          applicationId: BigInt(input.applicationId),
          sessionId: BigInt(input.sessionId),
          reportType: "RECRUITING_REPORT",
          status: "COMPLETED",
          summary: result.summary,
          totalScore: result.totalScore,
          ncsCompletionStatus: "COMPLETE",
          ncsThresholdResult: "MEETS_THRESHOLD",
          ncsAiDecision: "PASS",
          ncsDecisionReasonCode: "THRESHOLD_MET",
          ncsScoringVersion: "NCS_RECRUITING_SCORING_V2",
          ncsDecisionPolicyVersion: "NCS_INCOMPLETE_AS_FAIL_DEMO_V1",
          ncsSummaryJson: this.saltluxNcsSummary(result.profiles),
          generatedAt: now,
        },
        update: {
          applicationId: BigInt(input.applicationId),
          sessionId: BigInt(input.sessionId),
          reportType: "RECRUITING_REPORT",
          status: "COMPLETED",
          summary: result.summary,
          totalScore: result.totalScore,
          ncsCompletionStatus: "COMPLETE",
          ncsThresholdResult: "MEETS_THRESHOLD",
          ncsAiDecision: "PASS",
          ncsDecisionReasonCode: "THRESHOLD_MET",
          ncsScoringVersion: "NCS_RECRUITING_SCORING_V2",
          ncsDecisionPolicyVersion: "NCS_INCOMPLETE_AS_FAIL_DEMO_V1",
          ncsSummaryJson: this.saltluxNcsSummary(result.profiles),
          generatedAt: now,
          failureCategory: null,
          failureReason: null,
        },
      });

      await transaction.reportEvidence.deleteMany({
        where: { score: { reportId: BigInt(input.reportId) } },
      });
      await transaction.reportScore.deleteMany({ where: { reportId: BigInt(input.reportId) } });
      await transaction.ncsAnswerEvaluation.deleteMany({ where: { reportId: BigInt(input.reportId) } });

      for (const profile of result.profiles) {
        await transaction.reportScore.create({
          data: {
            reportId: BigInt(input.reportId),
            criterionId: BigInt(profile.criterionId),
            score: profile.score * 20,
            rationale: profile.rationale,
            evidences: {
              create: profile.evidences.map((evidence) => ({
                sourceType: "INTERVIEW_ANSWER",
                answerId: BigInt(evidence.answerId),
                evidenceText: evidence.text,
              })),
            },
          },
        });
        await transaction.reportScore.create({
          data: {
            reportId: BigInt(input.reportId),
            criterionId: BigInt(profile.criterionId),
            score: profile.score * 20,
            rationale: `${profile.displayName} 유효 답변 1개의 5점 평균입니다.`,
            ncsProfileId: profile.ncsProfileId,
            averageScore: profile.score,
            normalizedScore: profile.score * 20,
            weight: profile.weight,
            weightedScore: profile.weightedScore,
            minimumAverageScore: 3,
            assignedQuestionCount: 1,
            validQuestionCount: 1,
          },
        });
        await transaction.ncsAnswerEvaluation.create({
          data: {
            reportId: BigInt(input.reportId),
            answerId: BigInt(profile.answerId),
            sessionQuestionId: BigInt(profile.sessionQuestionId),
            criterionId: BigInt(profile.criterionId),
            criterionTitleSnapshot: profile.criterionName,
            ncsProfileId: profile.ncsProfileId,
            ncsQuestionMode: profile.questionMode,
            ncsProfileVersion: profile.ncsProfileVersion,
            scoreStatus: "SCORED",
            competencyScore: profile.score,
            evidenceScore: profile.score,
            totalScore: profile.score,
            behaviorPoints: profile.behaviorPoints,
            logicPoints: profile.logicPoints,
            baseScore: profile.baseScore,
            effectiveScore: profile.score,
            followUpApplied: profile.followUpApplied,
            coverage: 1,
            confidence: "HIGH",
            rubricVersion: "ncs-evidence-growth-v1",
            promptVersion: "ncs-text-evaluation-playground-v1",
            providerMode: "mock",
            modelName: "fixed-demo-fixture-v1",
            resultJson: this.saltluxQuestionEvaluation(profile),
            evidences: {
              create: profile.evidences.map((evidence, index) => ({
                sourceAnswerId: BigInt(evidence.answerId),
                sourceKind: evidence.sourceKind,
                quote: evidence.text,
                sortOrder: index + 1,
              })),
            },
          },
        });
      }

      await transaction.application.update({
        where: { applicationId: BigInt(input.applicationId) },
        data: {
          reportStatus: "COMPLETED",
          screeningDecision: "PASS",
          screeningDecisionReasonCode: null,
          screeningDecisionPolicyVersion: AUTO_SCREENING_DECISION_POLICY_VERSION,
          screeningDecisionReport: { connect: { reportId: BigInt(input.reportId) } },
          screeningDecidedAt: new Date(),
        },
      });

      const outputRef = JSON.stringify({
        providerSource: "PRESENTATION_FIXTURE",
        model: "fixed-demo-fixture-v1",
        reportId: input.reportId,
        totalScore: result.totalScore,
      });
      const processLog = await transaction.aiProcessLog.create({
        data: {
          applicationId: BigInt(input.applicationId),
          sessionId: BigInt(input.sessionId),
          processType: "REPORT_GENERATE",
          status: "COMPLETED",
          inputRef,
          outputRef,
          attemptCount: 1,
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          modelName: "fixed-demo-fixture-v1",
          guardrailLogs: {
            create: {
              policyName: "REPORT_FINAL_SAVE",
              result: "PASS",
              reason: "솔트룩스 고정 시연 리포트 계약 검증 통과",
            },
          },
        },
      });

      return { processLogId: Number(processLog.processLogId), inputRef };
    });
  }

  async createQueuedProcess(
    processType: AiProcessType,
    inputRef: string,
    refs: AiProcessRefs = {}
  ): Promise<QueuedAiProcessSnapshot> {
    if (processType === "REPORT_GENERATE" && (refs.applicationId || refs.sessionId)) {
      return this.prisma.$transaction(async (transaction) => {
        if (refs.applicationId) {
          await transaction.$queryRawUnsafe(
            'SELECT "application_id" FROM "applications" WHERE "application_id" = $1 FOR UPDATE',
            BigInt(refs.applicationId),
          );
        } else if (refs.sessionId) {
          await transaction.$queryRawUnsafe(
            'SELECT "session_id" FROM "interview_sessions" WHERE "session_id" = $1 FOR UPDATE',
            BigInt(refs.sessionId),
          );
        }
        return this.createQueuedProcessWithClient(transaction, processType, inputRef, refs);
      });
    }
    return this.createQueuedProcessWithClient(this.prisma, processType, inputRef, refs);
  }

  private async createQueuedProcessWithClient(
    client: Prisma.TransactionClient | PrismaService,
    processType: AiProcessType,
    inputRef: string,
    refs: AiProcessRefs,
  ): Promise<QueuedAiProcessSnapshot> {
    if (processType === "REPORT_GENERATE" && refs.applicationId) {
      const active = await this.findActiveReportProcess(client, refs.applicationId);
      if (active) return { ...this.toQueuedProcessSnapshot(active), idempotentReplay: true };
    }
    let processLog;
    try {
      processLog = await client.aiProcessLog.create({
        data: {
          applicationId: refs.applicationId ? BigInt(refs.applicationId) : null,
          sessionId: refs.sessionId ? BigInt(refs.sessionId) : null,
          processType,
          status: "PENDING",
          inputRef,
          createdAt: new Date()
        }
      });
    } catch (error) {
      if (processType === "REPORT_GENERATE" && refs.applicationId && isUniqueConstraintFailure(error)) {
        const active = await this.findActiveReportProcess(client, refs.applicationId);
        if (active) return { ...this.toQueuedProcessSnapshot(active), idempotentReplay: true };
      }
      throw error;
    }

    return {
      processLogId: Number(processLog.processLogId),
      processType: processLog.processType as AiProcessType,
      status: "PENDING",
      inputRef: processLog.inputRef ?? "",
      applicationId: processLog.applicationId ? Number(processLog.applicationId) : undefined,
      sessionId: processLog.sessionId ? Number(processLog.sessionId) : undefined,
      attempt: processLog.attemptCount,
      maxAttempts: processLog.maxAttempts,
      nextRetryAt: processLog.nextRetryAt?.toISOString(),
      idempotentReplay: false,
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

  async consumeCompletedQuestionProcess(processLogId: number): Promise<boolean> {
    const consumedAt = new Date().toISOString();
    const updated = await this.prisma.$executeRaw`
      UPDATE ai_process_logs
      SET input_ref = jsonb_set(COALESCE(input_ref, '{}')::jsonb, '{consumedAt}', to_jsonb(${consumedAt}::text))::text
      WHERE process_log_id = ${BigInt(processLogId)}
        AND process_type = 'QUESTION_GENERATE'::"AiProcessType"
        AND status = 'COMPLETED'::"AiProcessStatus"
        AND NOT (COALESCE(input_ref, '{}')::jsonb ? 'consumedAt')
    `;
    return updated === 1;
  }

  async releaseCompletedQuestionProcess(processLogId: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ai_process_logs
      SET input_ref = (COALESCE(input_ref, '{}')::jsonb - 'consumedAt')::text
      WHERE process_log_id = ${BigInt(processLogId)}
        AND process_type = 'QUESTION_GENERATE'::"AiProcessType"
        AND status = 'COMPLETED'::"AiProcessStatus"
        AND COALESCE(input_ref, '{}')::jsonb ? 'consumedAt'
    `;
  }

  async markQueuedProcessCompleted(processLogId: number, outputRef: string): Promise<QueuedAiProcessSnapshot> {
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "COMPLETED",
        outputRef,
        completedAt,
        durationMs,
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toQueuedProcessSnapshot(processLog);
  }

  async markQueuedProcessFailed(processLogId: number, failure: FailureReason): Promise<QueuedAiProcessSnapshot> {
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "FAILED",
        completedAt,
        durationMs,
        failureCategory: failure.category,
        failureReason: failure.reason
      }
    });
    return this.toQueuedProcessSnapshot(processLog);
  }

  async startProcess(reportId: number, reportType: ReportType, step: ReportPipelineStep): Promise<ProcessLogSnapshot> {
    await this.ensureReport(reportId, reportType);
    const processLog = await this.prisma.aiProcessLog.create({
      data: {
        processType: "REPORT_GENERATE",
        status: "PENDING",
        inputRef: JSON.stringify({ reportId, reportType, step }),
        createdAt: new Date()
      }
    });
    return this.processSnapshot(processLog.processLogId, step, "PENDING");
  }

  async markProcessRunning(processLogId: number): Promise<ProcessLogSnapshot> {
    const startedAt = new Date();
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: { status: "RUNNING", startedAt, completedAt: null, durationMs: null }
    });
    return this.toProcessSnapshot(processLog);
  }

  async markProcessCompleted(processLogId: number): Promise<ProcessLogSnapshot> {
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: { status: "COMPLETED", completedAt, durationMs }
    });
    return this.toProcessSnapshot(processLog);
  }

  async markProcessFailed(processLogId: number, failure: FailureReason): Promise<ProcessLogSnapshot> {
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "FAILED",
        completedAt,
        durationMs,
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
      const criterionId = score.criterionId ? await this.resolveCriterionId(score.criterionId) : null;
      await this.prisma.reportScore.create({
        data: {
          reportId: BigInt(reportId),
          criterionId,
          score: score.score,
          rationale: score.rationale,
          evidences: {
            create: score.evidences.map((evidence) => ({
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
    const data = {
      processLogId: BigInt(processLogId),
      policyName,
      result: decision.result,
      reason: decision.reason,
      failureCategory: this.guardrailFailureCategory(decision),
      createdAt: new Date()
    };
    const guardrailLog = await this.prisma.aiGuardrailLog.create({
      data
    });
    return Number(guardrailLog.guardrailLogId);
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
    startedAt?: Date | null;
    completedAt?: Date | null;
    durationMs?: number | null;
    modelName?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    audioSeconds?: number | null;
    estimatedCostUsd?: unknown | null;
    costMetadataJson?: string | null;
  }): ProcessLogSnapshot {
    const input = processLog.inputRef ? JSON.parse(processLog.inputRef) : {};
    return {
      processLogId: Number(processLog.processLogId),
      processType: processLog.processType as AiProcessType,
      step: input.step ?? "REPORT_GENERATE",
      status: processLog.status as ProcessLogSnapshot["status"],
      startedAt: processLog.startedAt?.toISOString(),
      completedAt: processLog.completedAt?.toISOString(),
      durationMs: processLog.durationMs ?? undefined,
      modelName: processLog.modelName ?? undefined,
      inputTokens: processLog.inputTokens ?? undefined,
      outputTokens: processLog.outputTokens ?? undefined,
      audioSeconds: processLog.audioSeconds ?? undefined,
      estimatedCostUsd: toNumber(processLog.estimatedCostUsd),
      costMetadataJson: processLog.costMetadataJson ?? undefined,
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
    startedAt?: Date | null;
    completedAt?: Date | null;
    durationMs?: number | null;
    modelName?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    audioSeconds?: number | null;
    estimatedCostUsd?: unknown | null;
    costMetadataJson?: string | null;
    attemptCount?: number;
    maxAttempts?: number;
    nextRetryAt?: Date | null;
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
      attempt: processLog.attemptCount ?? 1,
      maxAttempts: processLog.maxAttempts ?? 3,
      nextRetryAt: processLog.nextRetryAt?.toISOString(),
      startedAt: processLog.startedAt?.toISOString(),
      completedAt: processLog.completedAt?.toISOString(),
      durationMs: processLog.durationMs ?? undefined,
      modelName: processLog.modelName ?? undefined,
      inputTokens: processLog.inputTokens ?? undefined,
      outputTokens: processLog.outputTokens ?? undefined,
      audioSeconds: processLog.audioSeconds ?? undefined,
      estimatedCostUsd: toNumber(processLog.estimatedCostUsd),
      costMetadataJson: processLog.costMetadataJson ?? undefined,
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

  private async durationMs(processLogId: number, completedAt: Date): Promise<number | null> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) },
      select: { startedAt: true }
    });
    if (!processLog?.startedAt) {
      return null;
    }
    return Math.max(0, completedAt.getTime() - processLog.startedAt.getTime());
  }

  private findActiveReportProcess(client: Prisma.TransactionClient | PrismaService, applicationId: number) {
    return client.aiProcessLog.findFirst({
      where: {
        applicationId: BigInt(applicationId),
        processType: "REPORT_GENERATE",
        OR: [
          { status: { in: ["PENDING", "RUNNING"] } },
          {
            status: "FAILED",
            failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
            attemptCount: { lt: 3 },
            nextRetryAt: { not: null },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
    });
  }

  private guardrailFailureCategory(decision: GuardrailDecision): GuardrailDecision["failureCategory"] {
    return decision.failureCategory ?? (decision.result === "BLOCKED" ? "NON_RETRYABLE" : null);
  }

  private saltluxNcsSummary(profiles: SaltluxFixedDemoProfileResult[]): Prisma.InputJsonValue {
    return {
      schemaVersion: "ncs-report-evaluation-output-v2",
      result: {
        completionStatus: "COMPLETE",
        thresholdResult: "MEETS_THRESHOLD",
        aiDecision: "PASS",
        decisionReasonCode: "THRESHOLD_MET",
        totalScore: 88,
      },
      profiles: profiles.map((profile) => ({
        ncsProfileId: profile.ncsProfileId,
        profileOrder: profile.profileOrder,
        displayName: profile.displayName,
        status: "SCORED",
        averageScore: profile.score,
        normalizedScore: profile.score * 20,
        weight: profile.weight,
        weightedScore: profile.weightedScore,
        minimumAverageScore: 3,
        assignedQuestionCount: 1,
        validQuestionCount: 1,
        requiredQuestionCount: 1,
        findingIds: [`strength-${profile.ncsProfileId.toLowerCase()}`],
      })),
      incompleteReasons: [],
    };
  }

  private saltluxQuestionEvaluation(profile: SaltluxFixedDemoProfileResult): Prisma.InputJsonValue {
    return {
      kind: "NCS_TEXT_EVALUATION_PLAYGROUND_V1",
      rubricVersion: "ncs-evidence-growth-v1",
      promptVersion: "ncs-text-evaluation-playground-v1",
      providerMode: "fixed",
      model: "fixed-demo-fixture-v1",
      scoreStatus: "SCORED",
      scores: {
        competency: profile.score,
        evidence: profile.score,
        total: profile.score,
      },
      coverage: 1,
      confidence: "HIGH",
      questionMode: profile.questionMode,
      competencies: [{
        profileId: profile.ncsProfileId,
        profileVersion: profile.ncsProfileVersion,
        label: profile.displayName,
        level: profile.score,
        score: profile.score,
        confidence: "HIGH",
        rationale: profile.rationale,
        behaviors: [],
      }],
      evidenceMaturity: { dimensions: [], sharedEvidence: [] },
      growth: {
        strengths: [profile.rationale],
        gaps: ["대규모 운영 환경의 장기 장애 대응 경험은 추가 확인이 필요합니다."],
        nextAction: "운영 규모와 장애 대응 책임 범위를 후속 면접에서 확인합니다.",
        followUpQuestion: "개선 과정에서 품질 회귀는 어떻게 방지했나요?",
      },
      guardrail: {
        result: "PASS",
        reasons: [],
        exactQuotesValid: true,
        sharedEvidenceValid: true,
        confidenceValid: true,
        forbiddenWordingDetected: false,
        promptInjectionDetected: false,
      },
    };
  }
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isUniqueConstraintFailure(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

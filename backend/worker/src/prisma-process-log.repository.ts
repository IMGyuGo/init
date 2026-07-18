import { AiProcessClaimResult, AiProcessLogRepository } from "./process-log.repository";
import {
  AiProcessLogSnapshot,
  AiProcessUsage,
  AiWorkerJob,
  FailureReason,
  GuardrailDecision
} from "./worker.types";
import { isRetryableFailureCategory } from "./worker-errors";

interface PrismaAiProcessLogRecord {
  processLogId: bigint;
  processType: string;
  status: string;
  inputRef: string | null;
  outputRef: string | null;
  failureCategory: string | null;
  failureReason: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  audioSeconds: number | null;
  estimatedCostUsd: unknown | null;
  costMetadataJson: string | null;
}

interface PrismaAiProcessLogClient {
  aiProcessLog: {
    findUnique(args: unknown): Promise<PrismaAiProcessLogRecord | null>;
    findMany?(args: unknown): Promise<Array<{
      processLogId: bigint;
      processType: string;
      inputRef: string | null;
    }>>;
    upsert(args: unknown): Promise<PrismaAiProcessLogRecord>;
    update(args: unknown): Promise<PrismaAiProcessLogRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  aiGuardrailLog: {
    create(args: unknown): Promise<{ guardrailLogId: bigint }>;
  };
}

export class PrismaAiProcessLogRepository implements AiProcessLogRepository {
  constructor(private readonly prisma: PrismaAiProcessLogClient) {}

  async ensurePending(job: AiWorkerJob): Promise<AiProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.upsert({
      where: { processLogId: BigInt(job.processLogId) },
      create: {
        processLogId: BigInt(job.processLogId),
        processType: job.processType,
        status: "PENDING",
        inputRef: job.inputRef,
        createdAt: new Date()
      },
      update: {}
    });
    return this.toSnapshot(processLog);
  }

  async findOrphanedPendingJobs(createdBefore: Date, limit: number): Promise<AiWorkerJob[]> {
    if (!this.prisma.aiProcessLog.findMany) return [];
    const processLogs = await this.prisma.aiProcessLog.findMany({
      where: {
        processType: "RESUME_QUESTION_GENERATE",
        status: "PENDING",
        createdAt: { lte: createdBefore },
        inputRef: { not: null },
        latestResumeQuestionBatches: {
          some: { status: "GENERATING" },
        },
      },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, limit),
      select: {
        processLogId: true,
        processType: true,
        inputRef: true,
      },
    });

    return processLogs.flatMap((processLog) => {
      if (!processLog.inputRef) return [];
      return [{
        processLogId: Number(processLog.processLogId),
        processType: processLog.processType as AiWorkerJob["processType"],
        inputRef: processLog.inputRef,
        attempt: attemptFromInputRef(processLog.inputRef),
      }];
    });
  }

  async markRunning(processLogId: number): Promise<AiProcessLogSnapshot> {
    const startedAt = new Date();
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "RUNNING",
        startedAt,
        completedAt: null,
        durationMs: null,
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toSnapshot(processLog);
  }

  async claim(job: AiWorkerJob, leaseOwner: string, leaseExpiresAt: Date): Promise<AiProcessClaimResult> {
    await this.ensurePending(job);
    const now = new Date();
    const claimed = await this.prisma.aiProcessLog.updateMany({
      where: {
        processLogId: BigInt(job.processLogId),
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          { status: "RUNNING", leaseExpiresAt: null },
          { status: "RUNNING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "RUNNING",
        leaseOwner,
        leaseExpiresAt,
        startedAt: now,
        completedAt: null,
        durationMs: null,
        failureCategory: null,
        failureReason: null,
      },
    });
    const snapshot = await this.findSnapshot(job.processLogId);
    if (claimed.count === 1) {
      return { status: "CLAIMED", snapshot };
    }
    return { status: snapshot.status === "COMPLETED" ? "COMPLETED" : "BUSY", snapshot };
  }

  async renewClaim(processLogId: number, leaseOwner: string, leaseExpiresAt: Date): Promise<boolean> {
    const renewed = await this.prisma.aiProcessLog.updateMany({
      where: {
        processLogId: BigInt(processLogId),
        status: "RUNNING",
        leaseOwner,
      },
      data: { leaseExpiresAt },
    });
    return renewed.count === 1;
  }

  async markCompleted(
    processLogId: number,
    outputRef?: string,
    usage?: AiProcessUsage,
    leaseOwner?: string,
  ): Promise<AiProcessLogSnapshot> {
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const data = {
      status: "COMPLETED",
      outputRef,
      completedAt,
      durationMs,
      leaseOwner: null,
      leaseExpiresAt: null,
      ...this.usageData(usage),
      failureCategory: null,
      failureReason: null,
    };
    if (!leaseOwner) {
      return this.toSnapshot(await this.prisma.aiProcessLog.update({
        where: { processLogId: BigInt(processLogId) },
        data,
      }));
    }
    await this.prisma.aiProcessLog.updateMany({
      where: { processLogId: BigInt(processLogId), status: "RUNNING", leaseOwner },
      data,
    });
    return this.findSnapshot(processLogId);
  }

  async markFailed(processLogId: number, failure: FailureReason, leaseOwner?: string): Promise<AiProcessLogSnapshot> {
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const data = {
      status: "FAILED",
      completedAt,
      durationMs,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureCategory: failure.category,
      failureReason: failure.reason,
    };
    if (!leaseOwner) {
      return this.toSnapshot(await this.prisma.aiProcessLog.update({
        where: { processLogId: BigInt(processLogId) },
        data,
      }));
    }
    await this.prisma.aiProcessLog.updateMany({
      where: { processLogId: BigInt(processLogId), status: "RUNNING", leaseOwner },
      data,
    });
    return this.findSnapshot(processLogId);
  }

  async saveGuardrailLog(processLogId: number, policyName: string, decision: GuardrailDecision): Promise<number> {
    const data = {
      guardrailLogId: this.nextId(),
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

  private toSnapshot(processLog: PrismaAiProcessLogRecord): AiProcessLogSnapshot {
    return {
      processLogId: Number(processLog.processLogId),
      processType: processLog.processType as AiProcessLogSnapshot["processType"],
      status: processLog.status as AiProcessLogSnapshot["status"],
      inputRef: processLog.inputRef ?? "",
      outputRef: processLog.outputRef ?? undefined,
      leaseOwner: processLog.leaseOwner ?? undefined,
      leaseExpiresAt: processLog.leaseExpiresAt?.toISOString(),
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

  private nextId(): bigint {
    return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  }

  private async findSnapshot(processLogId: number): Promise<AiProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) },
    });
    if (!processLog) {
      throw new Error(`Process log ${processLogId} was not initialized.`);
    }
    return this.toSnapshot(processLog);
  }

  private guardrailFailureCategory(decision: GuardrailDecision): GuardrailDecision["failureCategory"] {
    return decision.failureCategory ?? (decision.result === "BLOCKED" ? "NON_RETRYABLE" : null);
  }

  private async durationMs(processLogId: number, completedAt: Date): Promise<number | null> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) }
    });
    if (!processLog?.startedAt) {
      return null;
    }
    return Math.max(0, completedAt.getTime() - processLog.startedAt.getTime());
  }

  private usageData(usage?: AiProcessUsage) {
    return usage
      ? {
          modelName: usage.modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          audioSeconds: usage.audioSeconds,
          estimatedCostUsd: usage.estimatedCostUsd,
          costMetadataJson: usage.costMetadataJson
        }
      : {};
  }
}

function attemptFromInputRef(inputRef: string): number {
  try {
    const attempt = Number((JSON.parse(inputRef) as { attempt?: unknown }).attempt);
    return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  } catch {
    return 1;
  }
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

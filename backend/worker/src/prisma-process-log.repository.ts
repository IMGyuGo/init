import {
  AiProcessClaimResult,
  AiProcessFailureState,
  AiProcessLogRepository,
  AiProcessRetryState,
} from "./process-log.repository";
import {
  AiProcessLogSnapshot,
  AiProcessUsage,
  AiWorkerJob,
  FailureReason,
  GuardrailDecision
} from "./worker.types";
import {
  automaticRetryExhaustedFailure,
  isAutomaticRetryFailureCategory,
  isUserRetryableFailureCategory,
  toPersistedFailureReason,
} from "./worker-errors";

interface PrismaAiProcessLogRecord {
  processLogId: bigint;
  processType: string;
  status: string;
  inputRef: string | null;
  outputRef: string | null;
  failureCategory: string | null;
  failureReason: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  nextRetryAt?: Date | null;
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
        attemptCount: Math.max(1, job.attempt),
        maxAttempts: 3,
        createdAt: new Date()
      },
      update: {}
    });
    return this.toSnapshot(processLog);
  }

  async findOrphanedPendingJobs(createdBefore: Date, limit: number): Promise<AiWorkerJob[]> {
    if (!this.prisma.aiProcessLog.findMany) return [];
    const retryDueAt = new Date();
    const processLogs = await this.prisma.aiProcessLog.findMany({
      where: {
        createdAt: { lte: createdBefore },
        inputRef: { not: null },
        OR: [
          {
            status: "PENDING",
            processType: "REPORT_GENERATE",
          },
          {
            status: "PENDING",
            processType: "RESUME_QUESTION_GENERATE",
            latestResumeQuestionBatches: {
              some: { status: "GENERATING" },
            },
          },
          {
            status: "FAILED",
            processType: { in: ["REPORT_GENERATE", "RESUME_QUESTION_GENERATE"] },
            failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
            attemptCount: { lt: 3 },
            nextRetryAt: { lte: retryDueAt },
          },
        ],
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

  async claim(
    job: AiWorkerJob,
    leaseOwner: string,
    leaseExpiresAt: Date,
    retryState: AiProcessRetryState = { maxAttempts: 3 },
  ): Promise<AiProcessClaimResult> {
    const existing = await this.findOptionalSnapshot(job.processLogId);
    if (!existing) {
      return { status: "MISSING" };
    }
    const now = new Date();
    const currentAttempt = existing.attemptCount ?? 1;
    const maxAttempts = existing.maxAttempts ?? retryState.maxAttempts;
    if (existing.status === "COMPLETED") {
      return { status: "COMPLETED", snapshot: existing };
    }
    if (existing.status === "FAILED") {
      if (existing.failure?.category === "RETRY_EXHAUSTED") {
        return { status: "EXHAUSTED", snapshot: existing };
      }
      if (
        !existing.failure ||
        !isAutomaticRetryFailureCategory(existing.failure.category) ||
        currentAttempt >= maxAttempts ||
        !existing.nextRetryAt
      ) {
        return { status: "BUSY", snapshot: existing };
      }
      if (Date.parse(existing.nextRetryAt) > now.getTime()) {
        return { status: "BACKOFF", snapshot: existing };
      }
    }
    if (existing.status === "RUNNING" && currentAttempt >= maxAttempts) {
      const failure = automaticRetryExhaustedFailure(maxAttempts);
      const exhausted = await this.prisma.aiProcessLog.updateMany({
        where: {
          processLogId: BigInt(job.processLogId),
          status: "RUNNING",
          attemptCount: currentAttempt,
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: "FAILED",
          completedAt: now,
          durationMs: existing.startedAt
            ? Math.max(0, now.getTime() - Date.parse(existing.startedAt))
            : null,
          failureCategory: failure.category,
          failureReason: failure.reason,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextRetryAt: null,
        },
      });
      const snapshot = await this.findSnapshot(job.processLogId);
      if (exhausted.count === 1) {
        return { status: "EXHAUSTED", snapshot };
      }
      if (snapshot.status === "COMPLETED") {
        return { status: "COMPLETED", snapshot };
      }
      return snapshot.failure?.category === "RETRY_EXHAUSTED"
        ? { status: "EXHAUSTED", snapshot }
        : { status: "BUSY", snapshot };
    }
    const attemptCount = existing.status === "PENDING"
      ? currentAttempt
      : Math.min(maxAttempts, currentAttempt + 1);
    const claimed = await this.prisma.aiProcessLog.updateMany({
      where: {
        processLogId: BigInt(job.processLogId),
        attemptCount: currentAttempt,
        OR: [
          { status: "PENDING" },
          {
            status: "FAILED",
            failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
            attemptCount: { lt: 3 },
            nextRetryAt: { lte: now },
          },
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
        attemptCount,
        maxAttempts,
        nextRetryAt: null,
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

  async markFailed(
    processLogId: number,
    failure: FailureReason,
    leaseOwner?: string,
    retryState: AiProcessFailureState = {},
  ): Promise<AiProcessLogSnapshot> {
    const persistedFailure = toPersistedFailureReason(failure);
    const completedAt = new Date();
    const durationMs = await this.durationMs(processLogId, completedAt);
    const data = {
      status: "FAILED",
      completedAt,
      durationMs,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureCategory: persistedFailure.category,
      failureReason: persistedFailure.reason,
      nextRetryAt: retryState.nextRetryAt ?? null,
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
      attemptCount: processLog.attemptCount ?? 1,
      maxAttempts: processLog.maxAttempts ?? 3,
      nextRetryAt: processLog.nextRetryAt?.toISOString(),
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
              retryable: isUserRetryableFailureCategory(processLog.failureCategory as FailureReason["category"])
            }
          : undefined
    };
  }

  private nextId(): bigint {
    return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  }

  private async findSnapshot(processLogId: number): Promise<AiProcessLogSnapshot> {
    const processLog = await this.findOptionalSnapshot(processLogId);
    if (!processLog) {
      throw new Error(`Process log ${processLogId} was not initialized.`);
    }
    return processLog;
  }

  private async findOptionalSnapshot(processLogId: number): Promise<AiProcessLogSnapshot | undefined> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) },
    });
    if (!processLog) {
      return undefined;
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

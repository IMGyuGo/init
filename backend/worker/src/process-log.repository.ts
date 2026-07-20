import {
  AiProcessLogSnapshot,
  AiProcessStatus,
  AiProcessUsage,
  AiWorkerJob,
  FailureReason,
  GuardrailDecision
} from "./worker.types";
import { isAutomaticRetryFailureCategory } from "./worker-errors";

export type AiProcessClaimStatus = "CLAIMED" | "COMPLETED" | "BUSY" | "BACKOFF";

export interface AiProcessClaimResult {
  status: AiProcessClaimStatus;
  snapshot: AiProcessLogSnapshot;
}

export interface AiProcessRetryState {
  attemptCount: number;
  maxAttempts: number;
}

export interface AiProcessFailureState {
  nextRetryAt?: Date | null;
}

export interface AiProcessLogRepository {
  ensurePending(job: AiWorkerJob): Promise<AiProcessLogSnapshot>;
  findOrphanedPendingJobs(createdBefore: Date, limit: number): Promise<AiWorkerJob[]>;
  markRunning(processLogId: number): Promise<AiProcessLogSnapshot>;
  claim(job: AiWorkerJob, leaseOwner: string, leaseExpiresAt: Date, retryState?: AiProcessRetryState): Promise<AiProcessClaimResult>;
  renewClaim(processLogId: number, leaseOwner: string, leaseExpiresAt: Date): Promise<boolean>;
  markCompleted(processLogId: number, outputRef?: string, usage?: AiProcessUsage, leaseOwner?: string): Promise<AiProcessLogSnapshot>;
  markFailed(processLogId: number, failure: FailureReason, leaseOwner?: string, retryState?: AiProcessFailureState): Promise<AiProcessLogSnapshot>;
  saveGuardrailLog(processLogId: number, policyName: string, decision: GuardrailDecision): Promise<number>;
}

export class InMemoryAiProcessLogRepository implements AiProcessLogRepository {
  readonly events: Array<{ processLogId: number; status: AiProcessStatus }> = [];
  readonly guardrailLogs: Array<{
    guardrailLogId: number;
    processLogId: number;
    policyName: string;
    decision: GuardrailDecision;
    failureCategory: GuardrailDecision["failureCategory"];
  }> = [];

  private nextGuardrailLogId = 1;
  private readonly processLogs = new Map<number, AiProcessLogSnapshot>();
  private readonly processLogCreatedAt = new Map<number, Date>();

  async ensurePending(job: AiWorkerJob): Promise<AiProcessLogSnapshot> {
    const existing = this.processLogs.get(job.processLogId);
    if (existing) {
      return { ...existing };
    }

    const created: AiProcessLogSnapshot = {
      processLogId: job.processLogId,
      processType: job.processType,
      status: "PENDING",
      inputRef: job.inputRef,
      attemptCount: Math.max(1, job.attempt),
      maxAttempts: 3,
    };
    this.processLogs.set(job.processLogId, created);
    this.processLogCreatedAt.set(job.processLogId, new Date());
    this.events.push({ processLogId: job.processLogId, status: "PENDING" });
    return { ...created };
  }

  async findOrphanedPendingJobs(createdBefore: Date, limit: number): Promise<AiWorkerJob[]> {
    return [...this.processLogs.values()]
      .filter((processLog) =>
        (processLog.processType === "RESUME_QUESTION_GENERATE" || processLog.processType === "REPORT_GENERATE") &&
        (
          processLog.status === "PENDING" ||
          (
            processLog.status === "FAILED" &&
            Boolean(processLog.failure && isAutomaticRetryFailureCategory(processLog.failure.category)) &&
            (processLog.attemptCount ?? 1) < (processLog.maxAttempts ?? 3) &&
            Boolean(processLog.nextRetryAt && Date.parse(processLog.nextRetryAt) <= Date.now())
          )
        ) &&
        (this.processLogCreatedAt.get(processLog.processLogId)?.getTime() ?? Number.POSITIVE_INFINITY) <= createdBefore.getTime()
      )
      .slice(0, Math.max(0, limit))
      .map((processLog) => ({
        processLogId: processLog.processLogId,
        processType: processLog.processType,
        inputRef: processLog.inputRef,
        attempt: attemptFromInputRef(processLog.inputRef),
      }));
  }

  async markRunning(processLogId: number): Promise<AiProcessLogSnapshot> {
    return this.update(processLogId, { status: "RUNNING", startedAt: new Date().toISOString() });
  }

  async claim(
    job: AiWorkerJob,
    leaseOwner: string,
    leaseExpiresAt: Date,
    retryState: AiProcessRetryState = { attemptCount: Math.max(1, job.attempt), maxAttempts: 3 },
  ): Promise<AiProcessClaimResult> {
    const existing = await this.ensurePending(job);
    if (existing.status === "COMPLETED") {
      return { status: "COMPLETED", snapshot: existing };
    }
    if (existing.status === "FAILED") {
      if (
        !existing.failure ||
        !isAutomaticRetryFailureCategory(existing.failure.category) ||
        (existing.attemptCount ?? 1) >= (existing.maxAttempts ?? 3) ||
        !existing.nextRetryAt
      ) {
        return { status: "BUSY", snapshot: existing };
      }
      if (Date.parse(existing.nextRetryAt) > Date.now()) {
        return { status: "BACKOFF", snapshot: existing };
      }
    }
    if (
      existing.status === "RUNNING" &&
      existing.leaseExpiresAt &&
      Date.parse(existing.leaseExpiresAt) > Date.now()
    ) {
      return { status: "BUSY", snapshot: existing };
    }

    const currentAttempt = existing.attemptCount ?? 1;
    const maxAttempts = existing.maxAttempts ?? retryState.maxAttempts;
    const attemptCount = existing.status === "FAILED"
      ? Math.min(maxAttempts, currentAttempt + 1)
      : Math.min(maxAttempts, Math.max(currentAttempt, retryState.attemptCount));
    const snapshot = this.update(job.processLogId, {
      status: "RUNNING",
      leaseOwner,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      durationMs: undefined,
      failure: undefined,
      attemptCount,
      maxAttempts,
      nextRetryAt: undefined,
    });
    return { status: "CLAIMED", snapshot };
  }

  async renewClaim(processLogId: number, leaseOwner: string, leaseExpiresAt: Date): Promise<boolean> {
    const existing = this.get(processLogId);
    if (existing.status !== "RUNNING" || existing.leaseOwner !== leaseOwner) {
      return false;
    }
    this.processLogs.set(processLogId, {
      ...existing,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    });
    return true;
  }

  async markCompleted(
    processLogId: number,
    outputRef?: string,
    usage?: AiProcessUsage,
    leaseOwner?: string,
  ): Promise<AiProcessLogSnapshot> {
    const existing = this.get(processLogId);
    if (leaseOwner && existing.leaseOwner !== leaseOwner) {
      return existing;
    }
    const completedAt = new Date().toISOString();
    return this.update(processLogId, {
      status: "COMPLETED",
      outputRef,
      failure: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      completedAt,
      durationMs: durationMs(existing.startedAt, completedAt),
      ...usage
    });
  }

  async markFailed(
    processLogId: number,
    failure: FailureReason,
    leaseOwner?: string,
    retryState: AiProcessFailureState = {},
  ): Promise<AiProcessLogSnapshot> {
    const existing = this.get(processLogId);
    if (leaseOwner && existing.leaseOwner !== leaseOwner) {
      return existing;
    }
    const completedAt = new Date().toISOString();
    return this.update(processLogId, {
      status: "FAILED",
      failure,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      completedAt,
      durationMs: durationMs(existing.startedAt, completedAt),
      nextRetryAt: retryState.nextRetryAt?.toISOString(),
    });
  }

  async saveGuardrailLog(processLogId: number, policyName: string, decision: GuardrailDecision): Promise<number> {
    const guardrailLogId = this.nextGuardrailLogId++;
    this.guardrailLogs.push({
      guardrailLogId,
      processLogId,
      policyName,
      decision,
      failureCategory: this.guardrailFailureCategory(decision)
    });
    return guardrailLogId;
  }

  get(processLogId: number): AiProcessLogSnapshot {
    const processLog = this.processLogs.get(processLogId);
    if (!processLog) {
      throw new Error(`Process log ${processLogId} was not initialized.`);
    }
    return { ...processLog };
  }

  private update(processLogId: number, patch: Partial<AiProcessLogSnapshot>): AiProcessLogSnapshot {
    const existing = this.processLogs.get(processLogId);
    if (!existing) {
      throw new Error(`Process log ${processLogId} was not initialized.`);
    }

    const updated = { ...existing, ...patch };
    this.processLogs.set(processLogId, updated);
    this.events.push({ processLogId, status: updated.status });
    return { ...updated };
  }

  private guardrailFailureCategory(decision: GuardrailDecision): GuardrailDecision["failureCategory"] {
    return decision.failureCategory ?? (decision.result === "BLOCKED" ? "NON_RETRYABLE" : null);
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

function durationMs(startedAt: string | undefined, completedAt: string): number | undefined {
  if (!startedAt) {
    return undefined;
  }
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  return Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : undefined;
}

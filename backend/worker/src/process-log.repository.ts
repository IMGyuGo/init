import {
  AiProcessLogSnapshot,
  AiProcessStatus,
  AiProcessUsage,
  AiWorkerJob,
  FailureReason,
  GuardrailDecision
} from "./worker.types";

export interface AiProcessLogRepository {
  ensurePending(job: AiWorkerJob): Promise<AiProcessLogSnapshot>;
  markRunning(processLogId: number): Promise<AiProcessLogSnapshot>;
  markCompleted(processLogId: number, outputRef?: string, usage?: AiProcessUsage): Promise<AiProcessLogSnapshot>;
  markFailed(processLogId: number, failure: FailureReason): Promise<AiProcessLogSnapshot>;
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

  async ensurePending(job: AiWorkerJob): Promise<AiProcessLogSnapshot> {
    const existing = this.processLogs.get(job.processLogId);
    if (existing) {
      return { ...existing };
    }

    const created: AiProcessLogSnapshot = {
      processLogId: job.processLogId,
      processType: job.processType,
      status: "PENDING",
      inputRef: job.inputRef
    };
    this.processLogs.set(job.processLogId, created);
    this.events.push({ processLogId: job.processLogId, status: "PENDING" });
    return { ...created };
  }

  async markRunning(processLogId: number): Promise<AiProcessLogSnapshot> {
    return this.update(processLogId, { status: "RUNNING", startedAt: new Date().toISOString() });
  }

  async markCompleted(processLogId: number, outputRef?: string, usage?: AiProcessUsage): Promise<AiProcessLogSnapshot> {
    const existing = this.get(processLogId);
    const completedAt = new Date().toISOString();
    return this.update(processLogId, {
      status: "COMPLETED",
      outputRef,
      failure: undefined,
      completedAt,
      durationMs: durationMs(existing.startedAt, completedAt),
      ...usage
    });
  }

  async markFailed(processLogId: number, failure: FailureReason): Promise<AiProcessLogSnapshot> {
    const existing = this.get(processLogId);
    const completedAt = new Date().toISOString();
    return this.update(processLogId, { status: "FAILED", failure, completedAt, durationMs: durationMs(existing.startedAt, completedAt) });
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

function durationMs(startedAt: string | undefined, completedAt: string): number | undefined {
  if (!startedAt) {
    return undefined;
  }
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  return Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : undefined;
}

import { AiProcessLogRepository } from "./process-log.repository";
import {
  AiProcessLogSnapshot,
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
}

interface PrismaAiProcessLogClient {
  aiProcessLog: {
    upsert(args: unknown): Promise<PrismaAiProcessLogRecord>;
    update(args: unknown): Promise<PrismaAiProcessLogRecord>;
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

  async markRunning(processLogId: number): Promise<AiProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "RUNNING",
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toSnapshot(processLog);
  }

  async markCompleted(processLogId: number, outputRef?: string): Promise<AiProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "COMPLETED",
        outputRef,
        failureCategory: null,
        failureReason: null
      }
    });
    return this.toSnapshot(processLog);
  }

  async markFailed(processLogId: number, failure: FailureReason): Promise<AiProcessLogSnapshot> {
    const processLog = await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "FAILED",
        failureCategory: failure.category,
        failureReason: failure.reason
      }
    });
    return this.toSnapshot(processLog);
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

  private guardrailFailureCategory(decision: GuardrailDecision): GuardrailDecision["failureCategory"] {
    return decision.failureCategory ?? (decision.result === "BLOCKED" ? "NON_RETRYABLE" : null);
  }
}

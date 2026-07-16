import { randomUUID } from "node:crypto";
import { AiJobQueue } from "./queue";
import { AiProcessLogRepository } from "./process-log.repository";
import {
  NonRetryableAiWorkerFailure,
  RetryableAiWorkerFailure,
  isRetryableFailureCategory,
  toFailureReason,
} from "./worker-errors";
import { AiQueueMessage, AiTaskHandler, AiWorkerJob, FailureReason } from "./worker.types";

export interface AiWorkerRunnerOptions {
  maxMessages?: number;
  maxRetryableReceives?: number;
  guardrailPolicyName?: string;
  visibilityTimeoutSeconds?: number;
  heartbeatIntervalMs?: number;
  workerId?: string;
  onStart?: (job: AiWorkerJob) => Promise<void>;
  onFailure?: (job: AiWorkerJob, failure: FailureReason) => Promise<void>;
}

export class AiWorkerRunner {
  private readonly options: Required<Pick<
    AiWorkerRunnerOptions,
    "maxMessages" | "maxRetryableReceives" | "guardrailPolicyName" | "visibilityTimeoutSeconds" | "heartbeatIntervalMs" | "workerId"
  >> &
    Pick<AiWorkerRunnerOptions, "onStart" | "onFailure">;

  constructor(
    private readonly queue: AiJobQueue,
    private readonly repository: AiProcessLogRepository,
    private readonly handler: AiTaskHandler,
    options: AiWorkerRunnerOptions = {}
  ) {
    this.options = {
      maxMessages: 1,
      maxRetryableReceives: 3,
      guardrailPolicyName: "AI_WORKER_OUTPUT_VALIDATE",
      visibilityTimeoutSeconds: 900,
      heartbeatIntervalMs: 300_000,
      workerId: `worker-${randomUUID()}`,
      ...options
    };
  }

  async processBatch(): Promise<number> {
    const messages = await this.queue.receive(this.options.maxMessages);
    for (const message of messages) {
      await this.processMessage(message);
    }
    return messages.length;
  }

  private async processMessage(message: AiQueueMessage): Promise<void> {
    const leaseOwner = `${this.options.workerId}:${message.messageId}`;
    const claim = await this.repository.claim(message.job, leaseOwner, this.nextLeaseExpiration());
    if (claim.status !== "CLAIMED") {
      await this.queue.delete(message);
      return;
    }

    let heartbeat: ReturnType<AiWorkerRunner["startHeartbeat"]> | undefined;

    try {
      await this.renewVisibilityAndClaim(message, leaseOwner);
      heartbeat = this.startHeartbeat(message, leaseOwner);
      await this.options.onStart?.(message.job);
      const result = await this.handler.handle(message.job);
      await heartbeat.assertHealthy();

      if (result.guardrail) {
        await this.repository.saveGuardrailLog(
          message.job.processLogId,
          this.options.guardrailPolicyName,
          result.guardrail
        );

        if (result.guardrail.result === "BLOCKED") {
          const category = result.guardrail.failureCategory ?? "NON_RETRYABLE";
          await heartbeat.stop();
          heartbeat = undefined;
          await this.failAndAck(message, leaseOwner, {
            category,
            reason: result.guardrail.reason ?? "guardrail blocked output",
            retryable: isRetryableFailureCategory(category)
          });
          return;
        }
      }

      if (result.finalSave) {
        if (!result.guardrail) {
          throw new NonRetryableAiWorkerFailure("guardrail result is required before final save");
        }
        await this.renewVisibilityAndClaim(message, leaseOwner);
        const followUpJobs = await result.finalSave();
        for (const followUpJob of followUpJobs ?? []) {
          await this.queue.publish(followUpJob);
        }
      }

      await heartbeat.assertHealthy();
      await heartbeat.stop();
      heartbeat = undefined;
      const completed = await this.repository.markCompleted(
        message.job.processLogId,
        result.outputRef,
        result.usage,
        leaseOwner,
      );
      if (completed.status !== "COMPLETED") {
        throw new RetryableAiWorkerFailure("AI worker claim was lost before completion");
      }
      await this.queue.delete(message);
    } catch (error) {
      await heartbeat?.stop().catch(() => undefined);
      heartbeat = undefined;
      const failure = toFailureReason(error);
      if (isRetryableFailureCategory(failure.category)) {
        if (this.retryableReceiveCount(message) > this.options.maxRetryableReceives) {
          await this.failAndAck(message, leaseOwner, this.retryLimitExceededFailure(failure));
          return;
        }

        await this.markFailed(message, leaseOwner, failure);
        return;
      }

      await this.failAndAck(message, leaseOwner, failure);
    }
  }

  private async failAndAck(message: AiQueueMessage, leaseOwner: string, failure: FailureReason): Promise<void> {
    const failed = await this.markFailed(message, leaseOwner, failure);
    if (failed) {
      await this.queue.delete(message);
    }
  }

  private async markFailed(message: AiQueueMessage, leaseOwner: string, failure: FailureReason): Promise<boolean> {
    await this.options.onFailure?.(message.job, failure);
    const snapshot = await this.repository.markFailed(message.job.processLogId, failure, leaseOwner);
    return snapshot.status === "FAILED" && snapshot.leaseOwner === undefined;
  }

  private startHeartbeat(message: AiQueueMessage, leaseOwner: string) {
    let stopped = false;
    let failure: unknown;
    let inFlight = Promise.resolve();
    const timer = setInterval(() => {
      inFlight = inFlight.then(async () => {
        if (stopped || failure) return;
        try {
          await this.renewVisibilityAndClaim(message, leaseOwner);
        } catch (error) {
          failure = error;
        }
      });
    }, this.options.heartbeatIntervalMs);

    return {
      assertHealthy: async () => {
        await inFlight;
        if (failure) throw failure;
      },
      stop: async () => {
        stopped = true;
        clearInterval(timer);
        await inFlight;
        if (failure) throw failure;
      },
    };
  }

  private async renewVisibilityAndClaim(message: AiQueueMessage, leaseOwner: string): Promise<void> {
    try {
      const renewed = await this.repository.renewClaim(
        message.job.processLogId,
        leaseOwner,
        this.nextLeaseExpiration(),
      );
      if (!renewed) {
        throw new Error("process claim lease was lost");
      }
      await this.queue.extendVisibility(message, this.options.visibilityTimeoutSeconds);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new RetryableAiWorkerFailure(`AI worker heartbeat failed: ${reason}`);
    }
  }

  private nextLeaseExpiration(): Date {
    return new Date(Date.now() + this.options.visibilityTimeoutSeconds * 1_000);
  }

  private retryableReceiveCount(message: AiQueueMessage): number {
    return message.receiveCount ?? message.job.attempt;
  }

  private retryLimitExceededFailure(failure: FailureReason): FailureReason {
    const prefix = failure.category === "STT_RETRYABLE" ? "STT retry limit exceeded" : "Retry limit exceeded";
    return {
      category: "NON_RETRYABLE",
      reason: `${prefix} after ${this.options.maxRetryableReceives} total attempts: ${failure.reason}`,
      retryable: false
    };
  }
}

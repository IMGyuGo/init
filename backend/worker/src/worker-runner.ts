import { randomUUID } from "node:crypto";
import { AiJobQueue } from "./queue";
import { AiProcessLogRepository } from "./process-log.repository";
import {
  NonRetryableAiWorkerFailure,
  RetryableAiWorkerFailure,
  isAutomaticRetryFailureCategory,
  isUserRetryableFailureCategory,
  toFailureReason,
} from "./worker-errors";
import { AiQueueMessage, AiTaskHandler, AiWorkerJob, FailureReason } from "./worker.types";

export interface AiWorkerRunnerOptions {
  maxMessages?: number;
  maxRetryableReceives?: number;
  guardrailPolicyName?: string;
  visibilityTimeoutSeconds?: number;
  heartbeatIntervalMs?: number;
  orphanPendingThresholdMs?: number;
  orphanRecoveryIntervalMs?: number;
  orphanRecoveryBatchSize?: number;
  workerId?: string;
  onStart?: (job: AiWorkerJob) => Promise<void>;
  onFailure?: (job: AiWorkerJob, failure: FailureReason) => Promise<void>;
  onOrphanRecoveryFailure?: (context: OrphanRecoveryFailureContext) => Promise<void> | void;
}

export interface OrphanRecoveryFailureContext {
  stage: "LOOKUP" | "PUBLISH";
  failure: FailureReason;
  job?: AiWorkerJob;
}

export class AiWorkerRunner {
  private readonly options: Required<Pick<
    AiWorkerRunnerOptions,
    "maxMessages" | "maxRetryableReceives" | "guardrailPolicyName" | "visibilityTimeoutSeconds" | "heartbeatIntervalMs" |
      "orphanPendingThresholdMs" | "orphanRecoveryIntervalMs" | "orphanRecoveryBatchSize" | "workerId" |
      "onOrphanRecoveryFailure"
    >> &
    Pick<AiWorkerRunnerOptions, "onStart" | "onFailure">;
  private lastOrphanRecoveryAt = 0;

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
      orphanPendingThresholdMs: 15 * 60_000,
      orphanRecoveryIntervalMs: 60_000,
      orphanRecoveryBatchSize: 10,
      workerId: `worker-${randomUUID()}`,
      ...options,
      onOrphanRecoveryFailure: options.onOrphanRecoveryFailure ?? logOrphanRecoveryFailure,
    };
  }

  async processBatch(): Promise<number> {
    await this.republishOrphanedPendingJobs();
    const messages = await this.queue.receive(this.options.maxMessages);
    for (const message of messages) {
      await this.processMessage(message);
    }
    return messages.length;
  }

  private async processMessage(message: AiQueueMessage): Promise<void> {
    const leaseOwner = `${this.options.workerId}:${message.messageId}`;
    const receiveCount = this.retryableReceiveCount(message);
    const attemptCount = Math.min(receiveCount, this.options.maxRetryableReceives);
    const claim = await this.repository.claim(message.job, leaseOwner, this.nextLeaseExpiration(), {
      attemptCount,
      maxAttempts: this.options.maxRetryableReceives,
    });
    if (claim.status === "BACKOFF") {
      await this.deferUntilBackoffExpires(message, claim.snapshot.nextRetryAt);
      return;
    }
    if (claim.status !== "CLAIMED") {
      await this.queue.delete(message);
      return;
    }
    const executionAttempt = claim.snapshot.attemptCount ?? 1;

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
            retryable: isUserRetryableFailureCategory(category)
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
          await this.repository.ensurePending(followUpJob);
          try {
            await this.queue.publish(followUpJob);
          } catch (error) {
            const failure = toFailureReason(error);
            await this.compensateFollowUpPublishFailure(followUpJob, failure);
            throw error;
          }
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
      if (isAutomaticRetryFailureCategory(failure.category)) {
        if (executionAttempt >= this.options.maxRetryableReceives) {
          await this.failAndAck(message, leaseOwner, this.retryLimitExceededFailure());
          return;
        }

        const nextRetryAt = new Date(Date.now() + this.options.visibilityTimeoutSeconds * 1_000);
        try {
          await this.queue.extendVisibility(message, this.options.visibilityTimeoutSeconds);
        } catch {
          // The initial 900-second processing lease remains the conservative retry gate.
        }
        await this.repository.markFailed(
          message.job.processLogId,
          failure,
          leaseOwner,
          { nextRetryAt },
        );
        return;
      }

      await this.failAndAck(message, leaseOwner, failure);
    }
  }

  private async republishOrphanedPendingJobs(): Promise<void> {
    const now = Date.now();
    if (now - this.lastOrphanRecoveryAt < this.options.orphanRecoveryIntervalMs) {
      return;
    }
    this.lastOrphanRecoveryAt = now;
    let jobs: AiWorkerJob[];
    try {
      jobs = await this.repository.findOrphanedPendingJobs(
        new Date(now - this.options.orphanPendingThresholdMs),
        this.options.orphanRecoveryBatchSize,
      );
    } catch (error) {
      await this.reportOrphanRecoveryFailure("LOOKUP", error);
      return;
    }

    for (const job of jobs) {
      try {
        await this.queue.publish(job);
      } catch (error) {
        await this.reportOrphanRecoveryFailure("PUBLISH", error, job);
      }
    }
  }

  private async reportOrphanRecoveryFailure(
    stage: OrphanRecoveryFailureContext["stage"],
    error: unknown,
    job?: AiWorkerJob,
  ): Promise<void> {
    const context: OrphanRecoveryFailureContext = {
      stage,
      failure: toFailureReason(error),
      job,
    };
    try {
      await this.options.onOrphanRecoveryFailure(context);
    } catch (reportingError) {
      console.error("AI worker stale pending recovery failure reporting failed", {
        stage,
        processLogId: job?.processLogId,
        reason: reportingError instanceof Error ? reportingError.message : String(reportingError),
      });
    }
  }

  private async compensateFollowUpPublishFailure(job: AiWorkerJob, failure: FailureReason): Promise<void> {
    const results = await Promise.allSettled([
      this.repository.markFailed(job.processLogId, failure),
      this.options.onFailure?.(job, failure) ?? Promise.resolve(),
    ]);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) {
      const reason = rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason);
      throw new RetryableAiWorkerFailure(`follow-up publish compensation failed: ${reason}`);
    }
  }

  private async failAndAck(message: AiQueueMessage, leaseOwner: string, failure: FailureReason): Promise<void> {
    const failed = await this.markFailed(message, leaseOwner, failure);
    if (failed) {
      await this.queue.delete(message);
    }
  }

  private async markFailed(
    message: AiQueueMessage,
    leaseOwner: string,
    failure: FailureReason,
    nextRetryAt?: Date,
  ): Promise<boolean> {
    await this.options.onFailure?.(message.job, failure);
    const snapshot = await this.repository.markFailed(
      message.job.processLogId,
      failure,
      leaseOwner,
      { nextRetryAt: nextRetryAt ?? null },
    );
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

  private async deferUntilBackoffExpires(message: AiQueueMessage, nextRetryAt: string | undefined): Promise<void> {
    if (!nextRetryAt) return;
    const remainingSeconds = Math.max(1, Math.ceil((Date.parse(nextRetryAt) - Date.now()) / 1_000));
    try {
      await this.queue.extendVisibility(message, Math.min(43_200, remainingSeconds));
    } catch {
      // Keep the message unacked so SQS can redeliver it using the current visibility deadline.
    }
  }

  private retryLimitExceededFailure(): FailureReason {
    return {
      category: "RETRY_EXHAUSTED",
      reason: `Automatic retry limit exhausted after ${this.options.maxRetryableReceives} total attempts.`,
      retryable: false
    };
  }
}

function logOrphanRecoveryFailure(context: OrphanRecoveryFailureContext): void {
  console.error("AI worker stale pending recovery failed", {
    stage: context.stage,
    processLogId: context.job?.processLogId,
    processType: context.job?.processType,
    failureCategory: context.failure.category,
    reason: context.failure.reason,
  });
}

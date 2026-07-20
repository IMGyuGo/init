import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiProcessLogRepository } from "./process-log.repository";
import { InMemoryAiJobQueue } from "./queue";
import { loadWorkerEnv } from "./worker-env";
import {
  NonRetryableAiWorkerFailure,
  RegenerationRequiredAiWorkerFailure,
  ReanswerRequiredAiWorkerFailure,
  RetryableAiWorkerFailure,
  SttRetryableAiWorkerFailure
} from "./worker-errors";
import { AiWorkerRunner } from "./worker-runner";
import { AiQueueMessage, AiTaskHandler } from "./worker.types";

test("marks pending, running, completed and saves final output after guardrail pass", async () => {
  const queue = new InMemoryAiJobQueue([message(1)]);
  const repository = new InMemoryAiProcessLogRepository();
  const saved: string[] = [];
  const handler: AiTaskHandler = {
    async handle() {
      return {
        outputRef: "s3://reports/1.json",
        guardrail: { result: "PASS", reason: null },
        finalSave: async () => {
          saved.push("final");
        }
      };
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.deepEqual(
    repository.events.map((event) => event.status),
    ["PENDING", "RUNNING", "COMPLETED"]
  );
  assert.equal(repository.get(1).outputRef, "s3://reports/1.json");
  assert.equal(repository.guardrailLogs[0].decision.result, "PASS");
  assert.deepEqual(saved, ["final"]);
  assert.deepEqual(queue.deletedMessageIds, ["message-1"]);
});

test("publishes follow-up jobs returned by final save after the source message is completed", async () => {
  const queue = new InMemoryAiJobQueue([message(11)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      return {
        outputRef: "document:extracted:11",
        guardrail: { result: "PASS", reason: null },
        finalSave: async () => [{
          processLogId: 12,
          processType: "RESUME_QUESTION_GENERATE",
          inputRef: JSON.stringify({ applicationId: 101, inputVersion: "input-101" }),
          attempt: 1,
        }],
      };
    },
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  const pending = await queue.receive(10);
  assert.equal(repository.get(11).status, "COMPLETED");
  assert.deepEqual(queue.deletedMessageIds, ["message-11"]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].job.processLogId, 12);
  assert.equal(pending[0].job.processType, "RESUME_QUESTION_GENERATE");
});

test("marks a follow-up process failed when publishing its SQS message fails", async () => {
  class FailingFollowUpQueue extends InMemoryAiJobQueue {
    override async publish(job: AiQueueMessage["job"]): Promise<void> {
      if (job.processLogId === 22) throw new Error("AccessDenied: sqs:SendMessage");
      await super.publish(job);
    }
  }

  const queue = new FailingFollowUpQueue([message(21)]);
  const repository = new InMemoryAiProcessLogRepository();
  const failedJobs: number[] = [];
  const handler: AiTaskHandler = {
    async handle() {
      return {
        outputRef: "document:extracted:21",
        guardrail: { result: "PASS", reason: null },
        finalSave: async () => [{
          processLogId: 22,
          processType: "RESUME_QUESTION_GENERATE",
          inputRef: JSON.stringify({ applicationId: 206, inputVersion: "input-206" }),
          attempt: 1,
        }],
      };
    },
  };

  await new AiWorkerRunner(queue, repository, handler, {
    onFailure: async (job) => {
      failedJobs.push(job.processLogId);
    },
  }).processBatch();

  assert.equal(repository.get(21).status, "FAILED");
  assert.equal(repository.get(22).status, "FAILED");
  assert.match(repository.get(22).failure?.reason ?? "", /sqs:SendMessage/);
  assert.deepEqual(failedJobs, [22]);
  assert.deepEqual(queue.deletedMessageIds, []);
});

test("republishes a stale pending personalized-question job with the same process id", async () => {
  const queue = new InMemoryAiJobQueue([]);
  const repository = new InMemoryAiProcessLogRepository();
  const stalePendingJob = {
    processLogId: 31,
    processType: "RESUME_QUESTION_GENERATE" as const,
    inputRef: JSON.stringify({ applicationId: 206, inputVersion: "input-206", attempt: 2 }),
    attempt: 2,
  };
  await repository.ensurePending(stalePendingJob);
  let handled = 0;

  await new AiWorkerRunner(queue, repository, {
    async handle(job) {
      handled += 1;
      assert.equal(job.processLogId, stalePendingJob.processLogId);
      assert.equal(job.attempt, stalePendingJob.attempt);
      return { guardrail: { result: "PASS", reason: null } };
    },
  }, {
    orphanPendingThresholdMs: 0,
    orphanRecoveryIntervalMs: 0,
  }).processBatch();

  assert.equal(handled, 1);
  assert.equal(repository.get(stalePendingJob.processLogId).status, "COMPLETED");
});

test("republishes a stale pending report job committed before queue publication", async () => {
  const queue = new InMemoryAiJobQueue([]);
  const repository = new InMemoryAiProcessLogRepository();
  const staleReportJob = {
    processLogId: 33,
    processType: "REPORT_GENERATE" as const,
    inputRef: JSON.stringify({ payload: { reportId: 501 }, attempt: 1 }),
    attempt: 1,
  };
  await repository.ensurePending(staleReportJob);
  let handled = 0;

  await new AiWorkerRunner(queue, repository, {
    async handle(job) {
      handled += 1;
      assert.equal(job.processLogId, staleReportJob.processLogId);
      return { guardrail: { result: "PASS", reason: null } };
    },
  }, {
    orphanPendingThresholdMs: 0,
    orphanRecoveryIntervalMs: 0,
  }).processBatch();

  assert.equal(handled, 1);
  assert.equal(repository.get(staleReportJob.processLogId).status, "COMPLETED");
});

test("republishes a due failed report when the original queue message is missing", async () => {
  const queue = new InMemoryAiJobQueue([]);
  const repository = new InMemoryAiProcessLogRepository();
  const failedReportJob = {
    processLogId: 36,
    processType: "REPORT_GENERATE" as const,
    inputRef: JSON.stringify({ payload: { reportId: 502 }, attempt: 1 }),
    attempt: 1,
  };
  await repository.ensurePending(failedReportJob);
  const leaseOwner = "seed-worker:message-36";
  await repository.claim(failedReportJob, leaseOwner, new Date(Date.now() + 1_000));
  await repository.markFailed(
    failedReportJob.processLogId,
    { category: "RETRYABLE", reason: "temporary provider failure", retryable: true },
    leaseOwner,
    { nextRetryAt: new Date(Date.now() - 1_000) },
  );
  let handled = 0;

  await new AiWorkerRunner(queue, repository, {
    async handle(job) {
      handled += 1;
      assert.equal(job.processLogId, failedReportJob.processLogId);
      return { guardrail: { result: "PASS", reason: null } };
    },
  }, {
    orphanPendingThresholdMs: 0,
    orphanRecoveryIntervalMs: 0,
  }).processBatch();

  assert.equal(handled, 1);
  assert.equal(repository.get(failedReportJob.processLogId).attemptCount, 2);
  assert.equal(repository.get(failedReportJob.processLogId).status, "COMPLETED");
});

test("duplicate recovery envelopes cannot bypass the retry backoff or reset attempts", async () => {
  const duplicate = message(34, 1);
  const queue = new InMemoryAiJobQueue([duplicate, { ...duplicate, messageId: "message-34-duplicate" }]);
  const repository = new InMemoryAiProcessLogRepository();
  let handled = 0;

  await new AiWorkerRunner(queue, repository, {
    async handle() {
      handled += 1;
      throw new RetryableAiWorkerFailure("temporary provider failure");
    },
  }, { maxMessages: 2 }).processBatch();

  assert.equal(handled, 1);
  assert.equal(repository.get(34).attemptCount, 1);
  assert.equal(repository.get(34).status, "FAILED");
  assert.ok(Date.parse(repository.get(34).nextRetryAt ?? "") > Date.now());
  assert.deepEqual(queue.deletedMessageIds, []);
  assert.equal(queue.visibilityExtensions.at(-1)?.messageId, "message-34-duplicate");
});

test("an early redelivery during backoff is deferred without deleting the only message", async () => {
  class FailRetryVisibilityQueue extends InMemoryAiJobQueue {
    private extensions = 0;

    override async extendVisibility(message: AiQueueMessage, timeoutSeconds: number): Promise<void> {
      this.extensions += 1;
      if (this.extensions === 2) throw new Error("temporary ChangeMessageVisibility failure");
      await super.extendVisibility(message, timeoutSeconds);
    }
  }

  const repository = new InMemoryAiProcessLogRepository();
  let handled = 0;
  const handler: AiTaskHandler = {
    async handle() {
      handled += 1;
      throw new RetryableAiWorkerFailure("temporary provider failure");
    },
  };
  await new AiWorkerRunner(
    new FailRetryVisibilityQueue([message(35, 1)]),
    repository,
    handler,
    { visibilityTimeoutSeconds: 1 },
  ).processBatch();

  const earlyRedelivery = new InMemoryAiJobQueue([message(35, 2)]);
  await new AiWorkerRunner(earlyRedelivery, repository, handler, { visibilityTimeoutSeconds: 1 }).processBatch();

  assert.equal(handled, 1);
  assert.deepEqual(earlyRedelivery.deletedMessageIds, []);
  assert.equal(earlyRedelivery.visibilityExtensions.length, 1);
  assert.ok((earlyRedelivery.visibilityExtensions[0]?.timeoutSeconds ?? 0) > 0);
  assert.ok((earlyRedelivery.visibilityExtensions[0]?.timeoutSeconds ?? 0) <= 1);

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const dueRedelivery = new InMemoryAiJobQueue([message(35, 3)]);
  await new AiWorkerRunner(dueRedelivery, repository, handler, { visibilityTimeoutSeconds: 1 }).processBatch();

  assert.equal(handled, 2);
  assert.equal(repository.get(35).attemptCount, 2);
  assert.equal(repository.get(35).failure?.category, "RETRYABLE");
  assert.deepEqual(dueRedelivery.deletedMessageIds, []);
});

test("continues normal queue consumption when stale pending lookup fails", async () => {
  class FailingRecoveryRepository extends InMemoryAiProcessLogRepository {
    override async findOrphanedPendingJobs(): Promise<never> {
      throw new Error("database connection unavailable");
    }
  }

  const queue = new InMemoryAiJobQueue([message(32)]);
  const repository = new FailingRecoveryRepository();
  const handled: number[] = [];
  const recoveryFailures: Array<{ stage: string; reason: string }> = [];

  await new AiWorkerRunner(queue, repository, {
    async handle(job) {
      handled.push(job.processLogId);
      return { guardrail: { result: "PASS", reason: null } };
    },
  }, {
    orphanRecoveryIntervalMs: 0,
    onOrphanRecoveryFailure(context) {
      recoveryFailures.push({ stage: context.stage, reason: context.failure.reason });
    },
  }).processBatch();

  assert.deepEqual(handled, [32]);
  assert.equal(repository.get(32).status, "COMPLETED");
  assert.deepEqual(recoveryFailures, [{ stage: "LOOKUP", reason: "database connection unavailable" }]);
});

test("continues other recovery publishes and normal consumption when one stale pending publish fails", async () => {
  class PartiallyFailingRecoveryQueue extends InMemoryAiJobQueue {
    readonly publishedProcessLogIds: number[] = [];

    override async publish(job: AiQueueMessage["job"]): Promise<void> {
      this.publishedProcessLogIds.push(job.processLogId);
      if (job.processLogId === 33) throw new Error("SQS publish unavailable");
      await super.publish(job);
    }
  }

  const queue = new PartiallyFailingRecoveryQueue([message(35)]);
  const repository = new InMemoryAiProcessLogRepository();
  const stalePendingJobs = [33, 34].map((processLogId) => ({
    processLogId,
    processType: "RESUME_QUESTION_GENERATE" as const,
    inputRef: JSON.stringify({ applicationId: 206, attempt: 1 }),
    attempt: 1,
  }));
  for (const job of stalePendingJobs) {
    await repository.ensurePending(job);
  }
  const handled: number[] = [];
  const recoveryFailures: Array<{ stage: string; processLogId?: number }> = [];

  await new AiWorkerRunner(queue, repository, {
    async handle(job) {
      handled.push(job.processLogId);
      return { guardrail: { result: "PASS", reason: null } };
    },
  }, {
    orphanPendingThresholdMs: 0,
    orphanRecoveryIntervalMs: 0,
    onOrphanRecoveryFailure(context) {
      recoveryFailures.push({ stage: context.stage, processLogId: context.job?.processLogId });
    },
  }).processBatch();

  assert.deepEqual(queue.publishedProcessLogIds, [33, 34]);
  assert.deepEqual(handled, [35]);
  assert.equal(repository.get(35).status, "COMPLETED");
  assert.deepEqual(recoveryFailures, [{ stage: "PUBLISH", processLogId: 33 }]);
  assert.deepEqual((await queue.receive(10)).map((item) => item.job.processLogId), [34]);
});

test("saves final output when guardrail result is regenerated", async () => {
  const queue = new InMemoryAiJobQueue([message(5)]);
  const repository = new InMemoryAiProcessLogRepository();
  const saved: string[] = [];
  const handler: AiTaskHandler = {
    async handle() {
      return {
        outputRef: "s3://reports/5-regenerated.json",
        guardrail: {
          result: "REGENERATED",
          reason: "Unsafe wording was regenerated before final validation."
        },
        finalSave: async () => {
          saved.push("final");
        }
      };
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(5).status, "COMPLETED");
  assert.equal(repository.get(5).outputRef, "s3://reports/5-regenerated.json");
  assert.equal(repository.guardrailLogs[0].decision.result, "REGENERATED");
  assert.deepEqual(saved, ["final"]);
  assert.deepEqual(queue.deletedMessageIds, ["message-5"]);
});

test("does not run final save when guardrail blocks output", async () => {
  const queue = new InMemoryAiJobQueue([message(2)]);
  const repository = new InMemoryAiProcessLogRepository();
  let saved = false;
  const handler: AiTaskHandler = {
    async handle() {
      return {
        guardrail: { result: "BLOCKED", reason: "unsafe report wording" },
        finalSave: async () => {
          saved = true;
        }
      };
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(2).status, "FAILED");
  assert.deepEqual(repository.get(2).failure, {
    category: "NON_RETRYABLE",
    reason: "unsafe report wording",
    retryable: false
  });
  assert.equal(repository.guardrailLogs[0].failureCategory, "NON_RETRYABLE");
  assert.equal(saved, false);
  assert.deepEqual(queue.deletedMessageIds, ["message-2"]);
});

test("rejects final save when a handler does not provide a guardrail result", async () => {
  const queue = new InMemoryAiJobQueue([message(6)]);
  const repository = new InMemoryAiProcessLogRepository();
  let saved = false;
  const handler: AiTaskHandler = {
    async handle() {
      return {
        outputRef: "s3://reports/6.json",
        finalSave: async () => {
          saved = true;
        }
      };
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(6).status, "FAILED");
  assert.deepEqual(repository.get(6).failure, {
    category: "NON_RETRYABLE",
    reason: "guardrail result is required before final save",
    retryable: false
  });
  assert.equal(saved, false);
  assert.deepEqual(queue.deletedMessageIds, ["message-6"]);
});

test("keeps retryable failures on the queue for redelivery", async () => {
  const queue = new InMemoryAiJobQueue([message(3)]);
  const repository = new InMemoryAiProcessLogRepository();
  const terminalFailures: string[] = [];
  const handler: AiTaskHandler = {
    async handle() {
      throw new RetryableAiWorkerFailure("provider timeout");
    }
  };

  await new AiWorkerRunner(queue, repository, handler, {
    onFailure: async (_job, failure) => {
      terminalFailures.push(failure.category);
    },
  }).processBatch();

  assert.equal(repository.get(3).status, "FAILED");
  assert.deepEqual(repository.get(3).failure, {
    category: "RETRYABLE",
    reason: "provider timeout",
    retryable: true
  });
  assert.deepEqual(terminalFailures, []);
  assert.deepEqual(queue.deletedMessageIds, []);
});

test("keeps STT retryable failures on the queue for a fixed 900 second redelivery before the third attempt", async () => {
  const queue = new InMemoryAiJobQueue([message(7, 2)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      throw new SttRetryableAiWorkerFailure("OpenAI STT timeout");
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(7).status, "FAILED");
  assert.deepEqual(repository.get(7).failure, {
    category: "STT_RETRYABLE",
    reason: "OpenAI STT timeout",
    retryable: true
  });
  assert.equal(repository.get(7).attemptCount, 2);
  assert.equal(repository.get(7).maxAttempts, 3);
  assert.ok(repository.get(7).nextRetryAt);
  assert.deepEqual(queue.visibilityExtensions, [
    { messageId: "message-7", timeoutSeconds: 900 },
    { messageId: "message-7", timeoutSeconds: 900 },
  ]);
  assert.deepEqual(queue.deletedMessageIds, []);
});

test("acks regeneration-required failures while exposing user retryability", async () => {
  const queue = new InMemoryAiJobQueue([message(10)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      throw new RegenerationRequiredAiWorkerFailure(
        "aligned candidates exhausted; missing=229:1; primaryAttempts=3; fallbackAttempts=1; rejections=LOW_ALIGNMENT:4",
      );
    },
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.deepEqual(repository.get(10).failure, {
    category: "REGENERATION_REQUIRED",
    reason: "aligned candidates exhausted; missing=229:1; primaryAttempts=3; fallbackAttempts=1; rejections=LOW_ALIGNMENT:4",
    retryable: true,
  });
  assert.deepEqual(queue.deletedMessageIds, ["message-10"]);
});

test("acks retryable failures on the third total attempt without persisting provider raw content", async () => {
  const queue = new InMemoryAiJobQueue([message(9, 3)]);
  const repository = new InMemoryAiProcessLogRepository();
  const terminalFailures: string[] = [];
  const handler: AiTaskHandler = {
    async handle() {
      throw new SttRetryableAiWorkerFailure("OpenAI STT connection error for applicant@example.com transcript=private");
    }
  };

  await new AiWorkerRunner(queue, repository, handler, {
    onFailure: async (_job, failure) => {
      terminalFailures.push(failure.category);
    },
  }).processBatch();

  assert.equal(repository.get(9).status, "FAILED");
  assert.deepEqual(repository.get(9).failure, {
    category: "RETRY_EXHAUSTED",
    reason: "Automatic retry limit exhausted after 3 total attempts.",
    retryable: false
  });
  assert.equal(repository.get(9).attemptCount, 3);
  assert.equal(repository.get(9).maxAttempts, 3);
  assert.equal(repository.get(9).nextRetryAt, undefined);
  assert.deepEqual(terminalFailures, ["RETRY_EXHAUSTED"]);
  assert.doesNotMatch(repository.get(9).failure?.reason ?? "", /applicant@example\.com|transcript=private/);
  assert.deepEqual(queue.deletedMessageIds, ["message-9"]);
});

test("acks a redelivered exhausted process without invoking the provider again", async () => {
  const repository = new InMemoryAiProcessLogRepository();
  let calls = 0;
  const handler: AiTaskHandler = {
    async handle() {
      calls += 1;
      throw new SttRetryableAiWorkerFailure("temporary STT failure");
    },
  };

  await new AiWorkerRunner(new InMemoryAiJobQueue([message(19, 3)]), repository, handler).processBatch();
  const redeliveryQueue = new InMemoryAiJobQueue([message(19, 4)]);
  await new AiWorkerRunner(redeliveryQueue, repository, handler).processBatch();

  assert.equal(calls, 1);
  assert.equal(repository.get(19).status, "FAILED");
  assert.equal(repository.get(19).failure?.category, "RETRY_EXHAUSTED");
  assert.deepEqual(redeliveryQueue.deletedMessageIds, ["message-19"]);
});

test("acks non-retryable failures after recording the reason", async () => {
  const queue = new InMemoryAiJobQueue([message(4)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      throw new NonRetryableAiWorkerFailure("invalid input reference");
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(4).status, "FAILED");
  assert.deepEqual(repository.get(4).failure, {
    category: "NON_RETRYABLE",
    reason: "invalid input reference",
    retryable: false
  });
  assert.deepEqual(queue.deletedMessageIds, ["message-4"]);
});

test("acks reanswer-required STT failures after recording the reason", async () => {
  const queue = new InMemoryAiJobQueue([message(8)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      throw new ReanswerRequiredAiWorkerFailure("Audio file might be corrupted or unsupported");
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(8).status, "FAILED");
  assert.deepEqual(repository.get(8).failure, {
    category: "REANSWER_REQUIRED",
    reason: "Audio file might be corrupted or unsupported",
    retryable: false
  });
  assert.deepEqual(queue.deletedMessageIds, ["message-8"]);
});

test("loads SQS, S3 and AI provider settings from environment variables", () => {
  assert.deepEqual(
    loadWorkerEnv({
      AI_SQS_QUEUE_URL: "https://sqs.ap-northeast-2.amazonaws.com/1/init-ai",
      AWS_REGION: "ap-northeast-2",
      AI_PROVIDER_API_KEY: "test-key",
      S3_BUCKET_NAME: "init-dev",
      WORKER_BATCH_SIZE: "5",
      WORKER_POLL_INTERVAL_MS: "2500",
      WORKER_REPOSITORY_MODE: "prisma",
      PRISMA_CLIENT_MODULE: "../api/node_modules/@prisma/client"
    }),
    {
      aiSqsQueueUrl: "https://sqs.ap-northeast-2.amazonaws.com/1/init-ai",
      awsRegion: "ap-northeast-2",
      awsEndpointUrl: undefined,
      aiProviderApiKey: "test-key",
      aiProviderMode: "mock",
      openaiModel: "gpt-4o-mini",
      aiSttProviderMode: "mock",
      openaiSttModel: "gpt-4o-mini-transcribe",
      openaiSttLanguage: "ko",
      openaiSttTimeoutMs: 30000,
      s3BucketName: "init-dev",
      workerBatchSize: 5,
      workerMaxRetryableReceives: 3,
      workerPollIntervalMs: 2500,
      workerVisibilityTimeoutSeconds: 900,
      workerHeartbeatIntervalMs: 300000,
      workerRepositoryMode: "prisma",
      prismaClientModule: "../api/node_modules/@prisma/client"
    }
  );
});

test("extends SQS visibility and process lease while a provider call is running", async () => {
  const queue = new InMemoryAiJobQueue([message(13)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { outputRef: "question:13", guardrail: { result: "PASS", reason: null } };
    },
  };

  await new AiWorkerRunner(queue, repository, handler, {
    workerId: "worker-heartbeat",
    visibilityTimeoutSeconds: 30,
    heartbeatIntervalMs: 5,
  }).processBatch();

  assert.equal(repository.get(13).status, "COMPLETED");
  assert.equal(repository.get(13).leaseOwner, undefined);
  assert.ok(queue.visibilityExtensions.length >= 2);
  assert.ok(queue.visibilityExtensions.every((extension) => extension.timeoutSeconds === 30));
});

test("acks duplicate processLogId deliveries without invoking the provider twice", async () => {
  const queue = new InMemoryAiJobQueue([message(14)]);
  const repository = new InMemoryAiProcessLogRepository();
  let calls = 0;
  const handler: AiTaskHandler = {
    async handle() {
      calls += 1;
      return { outputRef: "question:14", guardrail: { result: "PASS", reason: null } };
    },
  };
  const runner = new AiWorkerRunner(queue, repository, handler, { workerId: "worker-dedupe" });

  await runner.processBatch();
  await queue.publish(message(14).job);
  await runner.processBatch();

  assert.equal(calls, 1);
  assert.equal(repository.get(14).status, "COMPLETED");
  assert.equal(queue.deletedMessageIds.length, 2);
});

test("does not execute a concurrently leased processLogId", async () => {
  const queue = new InMemoryAiJobQueue([message(15)]);
  const repository = new InMemoryAiProcessLogRepository();
  let calls = 0;
  await repository.claim(message(15).job, "worker-a:message-15", new Date(Date.now() + 60_000));

  await new AiWorkerRunner(queue, repository, {
    async handle() {
      calls += 1;
      return { guardrail: { result: "PASS", reason: null } };
    },
  }, { workerId: "worker-b" }).processBatch();

  assert.equal(calls, 0);
  assert.equal(repository.get(15).status, "RUNNING");
  assert.deepEqual(queue.deletedMessageIds, ["message-15"]);
});

test("heartbeat failure prevents final save and leaves the message for retry", async () => {
  class FailingHeartbeatQueue extends InMemoryAiJobQueue {
    private extensionCount = 0;

    override async extendVisibility(queueMessage: AiQueueMessage, timeoutSeconds: number): Promise<void> {
      this.extensionCount += 1;
      if (this.extensionCount > 1) {
        throw new Error("SQS visibility extension failed");
      }
      await super.extendVisibility(queueMessage, timeoutSeconds);
    }
  }

  const queue = new FailingHeartbeatQueue([message(17)]);
  const repository = new InMemoryAiProcessLogRepository();
  let saved = false;
  const handler: AiTaskHandler = {
    async handle() {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        guardrail: { result: "PASS", reason: null },
        finalSave: async () => {
          saved = true;
        },
      };
    },
  };

  await new AiWorkerRunner(queue, repository, handler, {
    workerId: "worker-heartbeat-failure",
    visibilityTimeoutSeconds: 30,
    heartbeatIntervalMs: 5,
  }).processBatch();

  assert.equal(saved, false);
  assert.equal(repository.get(17).status, "FAILED");
  assert.match(repository.get(17).failure?.reason ?? "", /heartbeat failed/);
  assert.deepEqual(queue.deletedMessageIds, []);
});

function message(processLogId: number, receiveCount?: number): AiQueueMessage {
  return {
    messageId: `message-${processLogId}`,
    receiptHandle: `receipt-${processLogId}`,
    job: {
      processLogId,
      processType: "REPORT_GENERATE",
      inputRef: `report:${processLogId}`,
      attempt: 1
    },
    receiveCount
  };
}

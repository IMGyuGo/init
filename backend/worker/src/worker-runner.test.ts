import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiProcessLogRepository } from "./process-log.repository";
import { InMemoryAiJobQueue } from "./queue";
import { loadWorkerEnv } from "./worker-env";
import {
  NonRetryableAiWorkerFailure,
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
  const handler: AiTaskHandler = {
    async handle() {
      throw new RetryableAiWorkerFailure("provider timeout");
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(3).status, "FAILED");
  assert.deepEqual(repository.get(3).failure, {
    category: "RETRYABLE",
    reason: "provider timeout",
    retryable: true
  });
  assert.deepEqual(queue.deletedMessageIds, []);
});

test("keeps STT retryable failures on the queue for redelivery", async () => {
  const queue = new InMemoryAiJobQueue([message(7, 3)]);
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
  assert.deepEqual(queue.deletedMessageIds, []);
});

test("acks retryable failures after the total receive attempt limit is exceeded", async () => {
  const queue = new InMemoryAiJobQueue([message(9, 4)]);
  const repository = new InMemoryAiProcessLogRepository();
  const handler: AiTaskHandler = {
    async handle() {
      throw new SttRetryableAiWorkerFailure("OpenAI STT connection error");
    }
  };

  await new AiWorkerRunner(queue, repository, handler).processBatch();

  assert.equal(repository.get(9).status, "FAILED");
  assert.deepEqual(repository.get(9).failure, {
    category: "NON_RETRYABLE",
    reason: "STT retry limit exceeded after 3 total attempts: OpenAI STT connection error",
    retryable: false
  });
  assert.deepEqual(queue.deletedMessageIds, ["message-9"]);
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

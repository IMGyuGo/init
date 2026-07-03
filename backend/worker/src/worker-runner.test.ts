import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiProcessLogRepository } from "./process-log.repository";
import { InMemoryAiJobQueue } from "./queue";
import { loadWorkerEnv } from "./worker-env";
import { NonRetryableAiWorkerFailure, RetryableAiWorkerFailure } from "./worker-errors";
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
      s3BucketName: "init-dev",
      workerBatchSize: 5,
      workerPollIntervalMs: 2500,
      workerRepositoryMode: "prisma",
      prismaClientModule: "../api/node_modules/@prisma/client"
    }
  );
});

function message(processLogId: number): AiQueueMessage {
  return {
    messageId: `message-${processLogId}`,
    receiptHandle: `receipt-${processLogId}`,
    job: {
      processLogId,
      processType: "REPORT_GENERATE",
      inputRef: `report:${processLogId}`,
      attempt: 1
    }
  };
}

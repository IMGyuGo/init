import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkerEnv } from "./worker-env";

const validEnv = {
  AI_SQS_QUEUE_URL: "https://sqs.ap-northeast-2.amazonaws.com/123456789012/init-ai-worker",
  AWS_REGION: "ap-northeast-2",
  AI_PROVIDER_API_KEY: "test-ai-provider-key",
  S3_BUCKET_NAME: "init-dev-bucket"
};

test("loadWorkerEnv requires SQS, AWS, AI provider and S3 configuration", () => {
  assert.throws(() => loadWorkerEnv({ ...validEnv, AI_SQS_QUEUE_URL: "" }), /AI_SQS_QUEUE_URL or SQS_QUEUE_URL is required/);
  assert.throws(() => loadWorkerEnv({ ...validEnv, AWS_REGION: "" }), /AWS_REGION is required/);
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, AI_PROVIDER_MODE: "openai", AI_PROVIDER_API_KEY: "" }),
    /OPENAI_API_KEY or AI_PROVIDER_API_KEY is required/
  );
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, AI_STT_PROVIDER: "openai", AI_PROVIDER_API_KEY: "local-dev-placeholder" }),
    /OPENAI_API_KEY or AI_PROVIDER_API_KEY is required/
  );
  assert.throws(() => loadWorkerEnv({ ...validEnv, S3_BUCKET_NAME: "" }), /S3_BUCKET_NAME or S3_BUCKET is required/);
});

test("loadWorkerEnv returns defaults for optional worker settings", () => {
  assert.deepEqual(loadWorkerEnv(validEnv), {
    aiSqsQueueUrl: validEnv.AI_SQS_QUEUE_URL,
    awsRegion: validEnv.AWS_REGION,
    awsEndpointUrl: undefined,
    aiProviderApiKey: validEnv.AI_PROVIDER_API_KEY,
    aiProviderMode: "mock",
    openaiModel: "gpt-4o-mini",
    aiSttProviderMode: "mock",
    openaiSttModel: "gpt-4o-mini-transcribe",
    openaiSttLanguage: "ko",
    openaiSttTimeoutMs: 30000,
    s3BucketName: validEnv.S3_BUCKET_NAME,
    workerBatchSize: 1,
    workerMaxRetryableReceives: 3,
    workerPollIntervalMs: 1000,
    workerVisibilityTimeoutSeconds: 900,
    workerHeartbeatIntervalMs: 300000,
    workerRepositoryMode: "memory",
    prismaClientModule: undefined
  });
});

test("loadWorkerEnv accepts legacy API env aliases", () => {
  assert.deepEqual(
    loadWorkerEnv({
      SQS_QUEUE_URL: "http://localhost:4566/000000000000/init-ai-jobs",
      AWS_REGION: "ap-northeast-2",
      OPENAI_API_KEY: "local-openai-key",
      S3_BUCKET: "init-local-assets"
    }),
    {
      aiSqsQueueUrl: "http://localhost:4566/000000000000/init-ai-jobs",
      awsRegion: "ap-northeast-2",
      awsEndpointUrl: undefined,
      aiProviderApiKey: "local-openai-key",
      aiProviderMode: "mock",
      openaiModel: "gpt-4o-mini",
      aiSttProviderMode: "mock",
      openaiSttModel: "gpt-4o-mini-transcribe",
      openaiSttLanguage: "ko",
      openaiSttTimeoutMs: 30000,
      s3BucketName: "init-local-assets",
      workerBatchSize: 1,
      workerMaxRetryableReceives: 3,
      workerPollIntervalMs: 1000,
      workerVisibilityTimeoutSeconds: 900,
      workerHeartbeatIntervalMs: 300000,
      workerRepositoryMode: "memory",
      prismaClientModule: undefined
    }
  );
});

test("loadWorkerEnv validates bounded numeric worker settings", () => {
  assert.equal(loadWorkerEnv({ ...validEnv, WORKER_BATCH_SIZE: "10" }).workerBatchSize, 10);
  assert.equal(loadWorkerEnv({ ...validEnv, WORKER_MAX_RETRYABLE_RECEIVES: "3" }).workerMaxRetryableReceives, 3);
  assert.equal(loadWorkerEnv({ ...validEnv, WORKER_POLL_INTERVAL_MS: "60000" }).workerPollIntervalMs, 60000);
  assert.equal(
    loadWorkerEnv({ ...validEnv, WORKER_VISIBILITY_TIMEOUT_SECONDS: "900", WORKER_VISIBILITY_HEARTBEAT_MS: "300000" })
      .workerHeartbeatIntervalMs,
    300000,
  );
  assert.equal(loadWorkerEnv({ ...validEnv, OPENAI_STT_TIMEOUT_MS: "20000" }).openaiSttTimeoutMs, 20000);

  assert.throws(() => loadWorkerEnv({ ...validEnv, WORKER_BATCH_SIZE: "0" }), /Expected integer between 1 and 10/);
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, WORKER_MAX_RETRYABLE_RECEIVES: "4" }),
    /WORKER_MAX_RETRYABLE_RECEIVES must equal 3/
  );
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, WORKER_POLL_INTERVAL_MS: "99" }),
    /Expected integer between 100 and 60000/
  );
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, OPENAI_STT_TIMEOUT_MS: "999" }),
    /Expected integer between 1000 and 600000/
  );
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, WORKER_VISIBILITY_TIMEOUT_SECONDS: "120" }),
    /WORKER_VISIBILITY_TIMEOUT_SECONDS must equal 900/
  );
  assert.throws(
    () => loadWorkerEnv({
      ...validEnv,
      WORKER_VISIBILITY_HEARTBEAT_MS: "30000",
    }),
    /WORKER_VISIBILITY_HEARTBEAT_MS must equal 300000/
  );
});

test("loadWorkerEnv validates repository mode and optional Prisma module", () => {
  assert.equal(loadWorkerEnv({ ...validEnv, WORKER_REPOSITORY_MODE: "prisma" }).workerRepositoryMode, "prisma");
  assert.equal(
    loadWorkerEnv({ ...validEnv, PRISMA_CLIENT_MODULE: " @prisma/client " }).prismaClientModule,
    "@prisma/client"
  );

  assert.throws(
    () => loadWorkerEnv({ ...validEnv, WORKER_REPOSITORY_MODE: "filesystem" }),
    /WORKER_REPOSITORY_MODE must be memory or prisma/
  );
});

test("loadWorkerEnv validates provider mode and OpenAI runtime settings", () => {
  assert.equal(loadWorkerEnv({ ...validEnv, AI_PROVIDER_MODE: "openai" }).aiProviderMode, "openai");
  assert.equal(loadWorkerEnv({ ...validEnv, OPENAI_MODEL: "gpt-4.1-mini" }).openaiModel, "gpt-4.1-mini");
  assert.equal(loadWorkerEnv({ ...validEnv, AI_STT_PROVIDER: "openai" }).aiSttProviderMode, "openai");
  assert.equal(loadWorkerEnv({ ...validEnv, OPENAI_STT_MODEL: "gpt-4o-transcribe" }).openaiSttModel, "gpt-4o-transcribe");
  assert.equal(loadWorkerEnv({ ...validEnv, OPENAI_STT_LANGUAGE: "en" }).openaiSttLanguage, "en");
  assert.equal(
    loadWorkerEnv({
      ...validEnv,
      AI_PROVIDER_MODE: "openai",
      AI_PROVIDER_API_KEY: "local-dev-placeholder",
      OPENAI_API_KEY: "real-openai-key"
    }).aiProviderApiKey,
    "real-openai-key"
  );

  assert.throws(() => loadWorkerEnv({ ...validEnv, AI_PROVIDER_MODE: "filesystem" }), /AI_PROVIDER_MODE must be mock or openai/);
  assert.throws(() => loadWorkerEnv({ ...validEnv, AI_STT_PROVIDER: "filesystem" }), /AI_STT_PROVIDER must be mock or openai/);
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, AI_PROVIDER_MODE: "openai", AI_PROVIDER_API_KEY: "local-dev-placeholder" }),
    /OPENAI_API_KEY or AI_PROVIDER_API_KEY is required/
  );
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, AI_STT_PROVIDER: "openai", AI_PROVIDER_API_KEY: "replace-with-secret" }),
    /OPENAI_API_KEY or AI_PROVIDER_API_KEY is required/
  );
});

test("loadWorkerEnv rejects mock providers in production", () => {
  assert.throws(
    () => loadWorkerEnv({ ...validEnv, NODE_ENV: "production" }),
    /Production worker requires AI_PROVIDER_MODE=openai and AI_STT_PROVIDER=openai/,
  );
  assert.throws(
    () => loadWorkerEnv({
      ...validEnv,
      NODE_ENV: "production",
      AI_PROVIDER_MODE: "openai",
      AI_STT_PROVIDER: "mock",
    }),
    /AI_STT_PROVIDER=mock/,
  );

  const production = loadWorkerEnv({
    ...validEnv,
    NODE_ENV: "production",
    AI_PROVIDER_MODE: "openai",
    AI_STT_PROVIDER: "openai",
  });
  assert.equal(production.aiProviderMode, "openai");
  assert.equal(production.aiSttProviderMode, "openai");
});

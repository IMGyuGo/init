export interface WorkerEnv {
  aiSqsQueueUrl: string;
  awsRegion: string;
  awsEndpointUrl?: string;
  aiProviderApiKey: string;
  aiProviderMode: "mock" | "openai";
  openaiModel: string;
  aiSttProviderMode: "mock" | "openai";
  openaiSttModel: string;
  openaiSttLanguage: string;
  s3BucketName: string;
  workerBatchSize: number;
  workerPollIntervalMs: number;
  workerRepositoryMode: "memory" | "prisma";
  prismaClientModule?: string;
}

export function loadWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const aiProviderMode = providerMode(env.AI_PROVIDER_MODE, "AI_PROVIDER_MODE");
  const aiSttProviderMode = providerMode(env.AI_STT_PROVIDER, "AI_STT_PROVIDER");
  return {
    aiSqsQueueUrl: requiredOneOf(env, ["AI_SQS_QUEUE_URL", "SQS_QUEUE_URL"]),
    awsRegion: required(env, "AWS_REGION"),
    awsEndpointUrl: optional(env.AWS_ENDPOINT_URL),
    aiProviderApiKey: aiProviderKey(env, aiProviderMode, aiSttProviderMode),
    aiProviderMode,
    openaiModel: optional(env.OPENAI_MODEL) ?? "gpt-4o-mini",
    aiSttProviderMode,
    openaiSttModel: optional(env.OPENAI_STT_MODEL) ?? "gpt-4o-mini-transcribe",
    openaiSttLanguage: optional(env.OPENAI_STT_LANGUAGE) ?? "ko",
    s3BucketName: requiredOneOf(env, ["S3_BUCKET_NAME", "S3_BUCKET"]),
    workerBatchSize: integer(env.WORKER_BATCH_SIZE, 1, 10, 1),
    workerPollIntervalMs: integer(env.WORKER_POLL_INTERVAL_MS, 100, 60_000, 1_000),
    workerRepositoryMode: repositoryMode(env.WORKER_REPOSITORY_MODE),
    prismaClientModule: optional(env.PRISMA_CLIENT_MODULE)
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value?.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requiredOneOf(env: NodeJS.ProcessEnv, names: string[]): string {
  for (const name of names) {
    const value = env[name];
    if (value?.trim()) {
      return value;
    }
  }
  throw new Error(`${names.join(" or ")} is required.`);
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function aiProviderKey(
  env: NodeJS.ProcessEnv,
  aiProviderMode: WorkerEnv["aiProviderMode"],
  aiSttProviderMode: WorkerEnv["aiSttProviderMode"],
): string {
  const key = optional(env.OPENAI_API_KEY) ?? optional(env.AI_PROVIDER_API_KEY);
  if (
    (aiProviderMode === "openai" || aiSttProviderMode === "openai") &&
    (!key || key === "local-dev-placeholder" || key === "replace-with-secret")
  ) {
    throw new Error("OPENAI_API_KEY or AI_PROVIDER_API_KEY is required when AI_PROVIDER_MODE=openai or AI_STT_PROVIDER=openai.");
  }
  return key ?? "local-dev-placeholder";
}

function providerMode(value: string | undefined, name: "AI_PROVIDER_MODE" | "AI_STT_PROVIDER"): "mock" | "openai" {
  if (!value?.trim()) {
    return "mock";
  }
  if (value === "mock" || value === "openai") {
    return value;
  }
  throw new Error(`${name} must be mock or openai.`);
}

function integer(value: string | undefined, min: number, max: number, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer between ${min} and ${max}, received ${value}.`);
  }
  return parsed;
}

function repositoryMode(value: string | undefined): WorkerEnv["workerRepositoryMode"] {
  if (!value?.trim()) {
    return "memory";
  }
  if (value === "memory" || value === "prisma") {
    return value;
  }
  throw new Error("WORKER_REPOSITORY_MODE must be memory or prisma.");
}

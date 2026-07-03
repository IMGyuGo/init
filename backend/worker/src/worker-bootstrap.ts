import { createRequire } from "node:module";
import path from "node:path";
import { AiResultRepository, InMemoryAiResultRepository } from "./ai-result.repository";
import { MockAiTaskHandler } from "./mock-ai-task.handler";
import { OpenAiAiTaskHandler } from "./openai-ai-task.handler";
import { OpenAiFollowUpProvider } from "./openai-follow-up.provider";
import { AiProcessLogRepository, InMemoryAiProcessLogRepository } from "./process-log.repository";
import { PrismaAiResultRepository } from "./prisma-ai-result.repository";
import { PrismaAiProcessLogRepository } from "./prisma-process-log.repository";
import { AiJobQueue } from "./queue";
import { createDocumentExtractionStartHandler, createReportFailureHandler } from "./report-failure.handler";
import { OpenAiS3SttProvider, SttProvider } from "./stt-provider";
import { WorkerEnv } from "./worker-env";
import { AiWorkerRunner } from "./worker-runner";

interface PrismaClientLike {
  $connect?: () => Promise<void>;
  $disconnect?: () => Promise<void>;
}

interface WorkerRepositories {
  processLogs: AiProcessLogRepository;
  results: AiResultRepository;
  disconnect?: () => Promise<void>;
}

export interface WorkerRuntime {
  runner: AiWorkerRunner;
  disconnect?: () => Promise<void>;
}

export async function createWorkerRuntime(queue: AiJobQueue, env: WorkerEnv): Promise<WorkerRuntime> {
  const repositories = await createRepositories(env);
  const mockHandler = new MockAiTaskHandler(repositories.results, {
    sttProvider: createSttProvider(env)
  });
  const handler =
    env.aiProviderMode === "openai"
      ? new OpenAiAiTaskHandler(
          mockHandler,
          repositories.results,
          new OpenAiFollowUpProvider(env.aiProviderApiKey, env.openaiModel)
        )
      : mockHandler;

  return {
    runner: new AiWorkerRunner(queue, repositories.processLogs, handler, {
      maxMessages: env.workerBatchSize,
      onStart: createDocumentExtractionStartHandler(repositories.results),
      onFailure: createReportFailureHandler(repositories.results)
    }),
    disconnect: repositories.disconnect
  };
}

function createSttProvider(env: WorkerEnv): SttProvider | undefined {
  if (env.aiSttProviderMode === "mock") {
    return undefined;
  }

  return new OpenAiS3SttProvider({
    apiKey: env.aiProviderApiKey,
    bucketName: env.s3BucketName,
    region: env.awsRegion,
    endpoint: env.awsEndpointUrl,
    model: env.openaiSttModel,
    language: env.openaiSttLanguage
  });
}

async function createRepositories(env: WorkerEnv): Promise<WorkerRepositories> {
  if (env.workerRepositoryMode === "memory") {
    const results = new InMemoryAiResultRepository();
    return {
      processLogs: new InMemoryAiProcessLogRepository(),
      results
    };
  }

  const prisma = await createPrismaClient(env.prismaClientModule);
  return {
    processLogs: new PrismaAiProcessLogRepository(prisma as ConstructorParameters<typeof PrismaAiProcessLogRepository>[0]),
    results: new PrismaAiResultRepository(prisma as ConstructorParameters<typeof PrismaAiResultRepository>[0]),
    disconnect: prisma.$disconnect ? () => prisma.$disconnect!() : undefined
  };
}

async function createPrismaClient(modulePath?: string): Promise<PrismaClientLike> {
  const requireFromWorker = createRequire(__filename);
  const resolvedModulePath =
    modulePath ?? path.resolve(__dirname, "..", "..", "api", "node_modules", "@prisma", "client");
  const prismaModule = requireFromWorker(resolvedModulePath) as {
    PrismaClient?: new () => PrismaClientLike;
  };

  if (!prismaModule.PrismaClient) {
    throw new Error(`PrismaClient was not found in ${resolvedModulePath}.`);
  }

  const prisma = new prismaModule.PrismaClient();
  await prisma.$connect?.();
  return prisma;
}

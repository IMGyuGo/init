import { createAiJobQueue } from "./queue";
import { createWorkerRuntime } from "./worker-bootstrap";
import { loadWorkerEnv } from "./worker-env";
import { loadWorkerEnvFiles } from "./worker-env-file";
import { AiWorkerLoop } from "./worker-loop";

async function main(): Promise<void> {
  loadWorkerEnvFiles();
  const env = loadWorkerEnv();
  const queue = createAiJobQueue();
  const runtime = await createWorkerRuntime(queue, env);
  const abortController = new AbortController();

  process.once("SIGINT", () => abortController.abort());
  process.once("SIGTERM", () => abortController.abort());

  try {
    await new AiWorkerLoop(runtime.runner, {
      idleDelayMs: env.workerPollIntervalMs,
      signal: abortController.signal
    }).run();
  } finally {
    await runtime.disconnect?.();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

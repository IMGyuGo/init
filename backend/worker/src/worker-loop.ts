import { AiWorkerRunner } from "./worker-runner";

export interface WorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface AiWorkerLoopOptions {
  idleDelayMs: number;
  signal?: AbortSignal;
  logger?: WorkerLogger;
}

export interface RunLoopOptions {
  maxBatches?: number;
}

export class AiWorkerLoop {
  constructor(
    private readonly runner: Pick<AiWorkerRunner, "processBatch">,
    private readonly options: AiWorkerLoopOptions
  ) {}

  async run(options: RunLoopOptions = {}): Promise<void> {
    let batchCount = 0;

    while (!this.options.signal?.aborted) {
      if (options.maxBatches !== undefined && batchCount >= options.maxBatches) {
        return;
      }

      const processed = await this.runner.processBatch();
      batchCount += 1;

      if (processed === 0) {
        await this.delay();
      }
    }
  }

  private async delay(): Promise<void> {
    if (this.options.idleDelayMs <= 0 || this.options.signal?.aborted) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, this.options.idleDelayMs);
      this.options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });
  }
}

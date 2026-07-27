export const AI_JOB_POLL_INTERVAL_MS = 2_000;

type PollTimerHandle = unknown;

type AiJobPollingStatus = {
  status: string;
};

type StartAiJobPollingOptions = {
  poll: () => Promise<void>;
  hasWork: () => boolean;
  intervalMs?: number;
  schedule?: (callback: () => void, delayMs: number) => PollTimerHandle;
  cancel?: (handle: PollTimerHandle) => void;
};

export function hasActiveAiJobs<T extends AiJobPollingStatus>(notices: readonly T[]) {
  return notices.some((notice) => notice.status !== "COMPLETED" && notice.status !== "FAILED");
}

export function startAiJobPolling({
  poll,
  hasWork,
  intervalMs = AI_JOB_POLL_INTERVAL_MS,
  schedule = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel = (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}: StartAiJobPollingOptions) {
  let stopped = false;
  let timer: PollTimerHandle;

  const run = async () => {
    if (stopped || !hasWork()) return;

    await poll();
    if (stopped) return;

    timer = schedule(() => {
      timer = undefined;
      void run();
    }, intervalMs);
  };

  void run();

  return () => {
    stopped = true;
    if (timer !== undefined) {
      cancel(timer);
      timer = undefined;
    }
  };
}

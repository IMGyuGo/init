import { strict as assert } from "node:assert";

import { AI_JOB_POLL_INTERVAL_MS, hasActiveAiJobs, startAiJobPolling } from "./ai-job-polling";

type ScheduledTask = {
  callback: () => void;
  delayMs: number;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function testActiveJobFlagStaysStableWhileAnyJobIsRunning() {
  const initiallyActive = hasActiveAiJobs([
    { kind: "questions", processLogId: 101, status: "RUNNING", lastCheckedAt: 1_000 },
  ]);
  const refreshedActive = hasActiveAiJobs([
    { kind: "questions", processLogId: 101, status: "RUNNING", lastCheckedAt: 3_000 },
  ]);
  const additionalJobActive = hasActiveAiJobs([
    { kind: "questions", processLogId: 101, status: "RUNNING", lastCheckedAt: 3_000 },
    { kind: "criteria", processLogId: 102, status: "PENDING", lastCheckedAt: 3_000 },
  ]);
  const allCompleted = hasActiveAiJobs([
    { kind: "questions", processLogId: 101, status: "COMPLETED", lastCheckedAt: 3_000 },
    { kind: "criteria", processLogId: 102, status: "FAILED", lastCheckedAt: 3_000 },
  ]);

  assert.equal(initiallyActive, true);
  assert.equal(refreshedActive, true);
  assert.equal(additionalJobActive, true);
  assert.equal(allCompleted, false);
}

async function testPollingWaitsTwoSecondsAfterEachCompletedRequest() {
  const scheduledTasks: ScheduledTask[] = [];
  const firstResult = deferred<void>();
  const secondResult = deferred<void>();
  let activeJobs = ["A"];
  let pollCount = 0;
  const polledJobs: string[][] = [];

  const stop = startAiJobPolling({
    poll: () => {
      pollCount += 1;
      polledJobs.push([...activeJobs]);
      return pollCount === 1 ? firstResult.promise : secondResult.promise;
    },
    hasWork: () => activeJobs.length > 0,
    schedule: (callback, delayMs) => {
      scheduledTasks.push({ callback, delayMs });
      return scheduledTasks.length;
    },
    cancel: () => undefined,
  });

  assert.equal(AI_JOB_POLL_INTERVAL_MS, 2_000);
  assert.equal(pollCount, 1);
  assert.equal(scheduledTasks.length, 0, "An in-flight request must not schedule or start another poll.");

  activeJobs = ["B"];
  firstResult.resolve();
  await flushMicrotasks();

  assert.equal(scheduledTasks.length, 1);
  assert.equal(scheduledTasks[0]?.delayMs, 2_000);
  assert.equal(pollCount, 1, "Completing a request must not immediately start the next poll.");

  scheduledTasks[0]?.callback();
  assert.equal(pollCount, 2);
  assert.deepEqual(polledJobs[1], ["B"], "Work added during the previous request must be polled next.");

  activeJobs = [];
  secondResult.resolve();
  await flushMicrotasks();

  assert.equal(scheduledTasks.length, 2, "A completed request may schedule one final local work check.");
  scheduledTasks[1]?.callback();
  assert.equal(pollCount, 2, "The final work check must not poll when no active jobs remain.");
  stop();
}

async function testStopPreventsPendingAndInFlightPolling() {
  const inFlightResult = deferred<void>();
  const scheduledTasks: ScheduledTask[] = [];
  const canceledHandles: unknown[] = [];

  const stopInFlight = startAiJobPolling({
    poll: () => inFlightResult.promise,
    hasWork: () => true,
    schedule: (callback, delayMs) => {
      scheduledTasks.push({ callback, delayMs });
      return 1;
    },
    cancel: (handle) => canceledHandles.push(handle),
  });

  stopInFlight();
  inFlightResult.resolve();
  await flushMicrotasks();
  assert.equal(scheduledTasks.length, 0, "Stopping in-flight polling must prevent a new timer.");

  const stopPending = startAiJobPolling({
    poll: async () => undefined,
    hasWork: () => true,
    schedule: (callback, delayMs) => {
      scheduledTasks.push({ callback, delayMs });
      return 2;
    },
    cancel: (handle) => canceledHandles.push(handle),
  });

  await flushMicrotasks();
  stopPending();
  assert.deepEqual(canceledHandles, [2], "Stopping pending polling must cancel its timer.");
}

testActiveJobFlagStaysStableWhileAnyJobIsRunning();

void Promise.all([testPollingWaitsTwoSecondsAfterEachCompletedRequest(), testStopPreventsPendingAndInFlightPolling()]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

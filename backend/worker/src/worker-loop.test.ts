import test from "node:test";
import assert from "node:assert/strict";
import { AiWorkerLoop } from "./worker-loop";

test("AiWorkerLoop keeps polling until max batch count", async () => {
  let calls = 0;
  const loop = new AiWorkerLoop(
    {
      async processBatch() {
        calls += 1;
        return 1;
      }
    },
    { idleDelayMs: 0 }
  );

  await loop.run({ maxBatches: 3 });

  assert.equal(calls, 3);
});

test("AiWorkerLoop waits after an empty batch", async () => {
  let calls = 0;
  const startedAt = Date.now();
  const loop = new AiWorkerLoop(
    {
      async processBatch() {
        calls += 1;
        return 0;
      }
    },
    { idleDelayMs: 10 }
  );

  await loop.run({ maxBatches: 1 });

  assert.equal(calls, 1);
  assert.equal(Date.now() - startedAt >= 8, true);
});

test("AiWorkerLoop exits when aborted during idle delay", async () => {
  const abortController = new AbortController();
  let calls = 0;
  const loop = new AiWorkerLoop(
    {
      async processBatch() {
        calls += 1;
        setTimeout(() => abortController.abort(), 5);
        return 0;
      }
    },
    { idleDelayMs: 5_000, signal: abortController.signal }
  );

  await loop.run();

  assert.equal(calls, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface WorkerEnvFileLoader {
  loadWorkerEnvFiles(options: { cwd: string; env: NodeJS.ProcessEnv }): { loadedPaths: string[] };
}

test("loadWorkerEnvFiles loads the project root .env when worker runs from backend/worker", () => {
  const root = mkdtempSync(join(tmpdir(), "worker-env-file-"));
  const workerDir = join(root, "backend", "worker");
  mkdirSync(workerDir, { recursive: true });
  writeFileSync(
    join(root, ".env"),
    [
      "SQS_QUEUE_URL=http://localhost:4566/000000000000/init-ai-jobs",
      "AWS_REGION=ap-northeast-2",
      "OPENAI_API_KEY=local-openai-key",
      "S3_BUCKET=init-local-assets",
    ].join("\n"),
  );

  try {
    const env: NodeJS.ProcessEnv = {};
    const { loadWorkerEnvFiles } = require("./worker-env-file") as WorkerEnvFileLoader;

    const result = loadWorkerEnvFiles({ cwd: workerDir, env });

    assert.deepEqual(result.loadedPaths, [join(root, ".env")]);
    assert.equal(env.SQS_QUEUE_URL, "http://localhost:4566/000000000000/init-ai-jobs");
    assert.equal(env.AWS_REGION, "ap-northeast-2");
    assert.equal(env.OPENAI_API_KEY, "local-openai-key");
    assert.equal(env.S3_BUCKET, "init-local-assets");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main as summarizeFinal } from "../../scripts/summarize-bottleneck-final.mjs";
import { buildComparisonChartHtml } from "../../src/bottleneck-chart.mjs";
import { buildFinalBottleneckReport } from "../../src/bottleneck-final.mjs";

test.describe("final bottleneck comparison", () => {
  test("summarizes exactly 50 100 and 200 in ascending order", () => {
    const result = buildFinalBottleneckReport({
      runId: "run-20260815-bottleneck",
      bucket: "init-playwright-results",
      stages: [stageSummary(200), stageSummary(50), stageSummary(100)],
    });

    expect(result.comparison.map((stage) => stage.stage)).toEqual([50, 100, 200]);
    expect(Object.keys(result.comparison[0])).toEqual([
      "stage", "successRatePercent", "apiP95Ms", "apiErrorRatePercent",
      "apiMaximumCpuPercent", "apiMaximumMemoryPercent",
      "frontendMaximumCpuPercent", "frontendMaximumMemoryPercent",
      "workerMaximumCpuPercent", "workerMaximumMemoryPercent",
      "serverFailureEvidenceDetected", "dbCreditDecrease", "verdict", "pngS3Path",
    ]);
    expect(result.comparison[0]).toMatchObject({
      apiMaximumCpuPercent: 25,
      apiMaximumMemoryPercent: 30,
      frontendMaximumCpuPercent: 20,
      frontendMaximumMemoryPercent: 22.5,
      workerMaximumMemoryPercent: 32.5,
      serverFailureEvidenceDetected: false,
    });
    expect(result.comparison[0].workerMaximumCpuPercent).toBeCloseTo(27.5);
    expect(result.markdown).toContain("최초 성능 저하 단계");
    expect(result.markdown).toContain("최초 병목");
    expect(result.markdown).toContain("200명 장시간 DB credit 위험");
    expect(result.markdown).toContain("s3://init-playwright-results/runs/run-20260815-bottleneck/stages/200/attempt-1/bottleneck-summary.png");
  });

  test("rejects a missing or duplicate stage", () => {
    expect(() => buildFinalBottleneckReport({
      runId: "run-20260815-bottleneck",
      bucket: "init-playwright-results",
      stages: [stageSummary(50), stageSummary(100), stageSummary(100)],
    })).toThrow("final bottleneck input is invalid");
  });

  test("keeps a missing p95 as insufficient evidence instead of zero", () => {
    const stage100 = stageSummary(100);
    stage100.api.p95Ms = null;
    stage100.missingMetrics = [{ metric: "api.p95Ms", reason: "METRIC_VALUES_MISSING" }];

    const result = buildFinalBottleneckReport({
      runId: "run-20260815-bottleneck",
      bucket: "init-playwright-results",
      stages: [stageSummary(50), stage100, stageSummary(200)],
    });

    expect(result.comparison[1].apiP95Ms).toBeNull();
    expect(result.markdown).toContain("근거 불충분 stage: 100명");
    expect(result.markdown).toContain("| 100 | 100% | n/a |");
  });

  test("renders a five-panel comparison and a 1600x1200 PNG", async () => {
    const fixture = await runFinalCliFixture();
    try {
      expect(fixture.exitCode).toBe(0);
      expect(fixture.stderr).toEqual([]);
      expect(readdirSync(fixture.output).sort()).toEqual(["bottleneck-final.md", "stage-comparison.png"]);
      expect(readPngSize(join(fixture.output, "stage-comparison.png"))).toEqual({ width: 1600, height: 1200 });

      const report = buildFinalBottleneckReport({
        runId: "run-20260815-bottleneck",
        bucket: "init-playwright-results",
        stages: [stageSummary(50), stageSummary(100), stageSummary(200)],
      });
      const html = buildComparisonChartHtml({ runId: "run-20260815-bottleneck", comparison: report.comparison });
      expect(html.match(/data-comparison-panel=/g)).toHaveLength(5);
      expect(html.match(/data-stage="50"/g)).toHaveLength(5);
      expect(html.match(/data-stage="100"/g)).toHaveLength(5);
      expect(html.match(/data-stage="200"/g)).toHaveLength(5);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite final artifacts", async () => {
    const fixture = await runFinalCliFixture();
    try {
      expect(fixture.exitCode).toBe(0);
      const before = readFileSync(join(fixture.output, "bottleneck-final.md"), "utf8");
      const second = await runFinalCliFixture(fixture.root, fixture.output);
      expect(second.exitCode).toBe(1);
      expect(second.stderr.at(-1)).toBe(JSON.stringify({ error: "BOTTLENECK_FINAL_OUTPUT_EXISTS" }));
      expect(readFileSync(join(fixture.output, "bottleneck-final.md"), "utf8")).toBe(before);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

function stageSummary(stage: 50 | 100 | 200) {
  return {
    runId: "run-20260815-bottleneck",
    stage,
    attempt: 1,
    startedAtUtc: "2026-08-15T00:00:00.000Z",
    endedAtUtc: "2026-08-15T00:03:00.000Z",
    startedAtKst: "2026-08-15T09:00:00.000+09:00",
    endedAtKst: "2026-08-15T09:03:00.000+09:00",
    users: { target: stage, started: stage, completed: stage, failed: 0, successRatePercent: 100 },
    api: { p95Ms: stage * 5, slowestRoute: "INTERVIEW_RUNTIME", slowestRouteP95Ms: stage * 4, errorRatePercent: 0 },
    ecsServices: {
      api: service(stage / 2, stage * 0.6),
      frontend: service(stage * 0.4, stage * 0.45),
      worker: service(stage * 0.55, stage * 0.65),
    },
    serverFailureEvidence: {
      detected: false,
      reasons: [],
      albTarget5xx: 0,
      targetConnectionErrors: 0,
      ecsTaskAnomaly: false,
    },
    dbCpuCredit: { start: 10000, end: 9998, minimum: 9998, decrease: 2 },
    verdict: "PASS",
    reasons: [],
    missingMetrics: [],
  };
}

function service(maximumCpuPercent: number, maximumMemoryPercent: number) {
  return {
    cpu: { averagePercent: 20, maximumAtUtc: "2026-08-15T00:02:00.000Z", maximumPercent: maximumCpuPercent, status: "NORMAL" },
    memory: { averagePercent: 30, maximumAtUtc: "2026-08-15T00:02:00.000Z", maximumPercent: maximumMemoryPercent, status: "NORMAL" },
    status: "NORMAL",
    taskAnomaly: false,
  };
}

async function runFinalCliFixture(existingRoot?: string, existingOutput?: string) {
  const root = existingRoot ?? mkdtempSync(join(tmpdir(), "bottleneck-final-cli-"));
  const output = existingOutput ?? join(root, "output");
  const paths = [50, 100, 200].map((stage) => {
    const path = join(root, `stage-${stage}.json`);
    if (!existingRoot) writeFileSync(path, `${JSON.stringify(stageSummary(stage as 50 | 100 | 200))}\n`, "utf8");
    return path;
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await summarizeFinal([
    "--run-id=run-20260815-bottleneck",
    "--bucket=init-playwright-results",
    `--stage-50=${paths[0]}`,
    `--stage-100=${paths[1]}`,
    `--stage-200=${paths[2]}`,
    `--output=${output}`,
  ], { log: (value: string) => stdout.push(value), error: (value: string) => stderr.push(value) });
  return { exitCode, root, output, stdout, stderr };
}

function readPngSize(path: string) {
  const png = readFileSync(path);
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("invalid PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

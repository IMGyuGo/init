import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { main as summarizeBottleneck } from "../../scripts/summarize-bottleneck.mjs";
import { buildStageChartHtml } from "../../src/bottleneck-chart.mjs";

test.describe("bottleneck chart", () => {
  test("renders one 1600x1200 PNG with three aligned panels", async () => {
    const html = buildStageChartHtml(passReport());
    expect(html.match(/data-panel=/g)).toHaveLength(3);
    expect(html).toContain('data-panel="api"');
    expect(html).toContain('data-panel="ecs"');
    expect(html).toContain('data-panel="db"');
    expect(html.match(/data-series="(?:api|frontend|worker)-(?:cpu|memory)-max"/g)).toHaveLength(6);
    expect(html.match(/data-marker="stage-start"/g)).toHaveLength(3);
    expect(html.match(/data-marker="stage-end"/g)).toHaveLength(3);

    const result = await runStageCliFixture();
    try {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toEqual([]);
      expect(readPngSize(result.pngPath)).toEqual({ width: 1600, height: 1200 });
      expect(readdirSync(result.output).sort()).toEqual([
        "bottleneck-summary.json",
        "bottleneck-summary.md",
        "bottleneck-summary.png",
      ]);
    } finally {
      rmSync(result.output, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite any stage artifact", async () => {
    const first = await runStageCliFixture();
    try {
      expect(first.exitCode).toBe(0);
      const before = readFileSync(join(first.output, "bottleneck-summary.json"), "utf8");

      const second = await runStageCliFixture(first.output);

      expect(second.exitCode).toBe(1);
      expect(second.stderr.at(-1)).toBe(JSON.stringify({ error: "BOTTLENECK_OUTPUT_EXISTS" }));
      expect(readFileSync(join(first.output, "bottleneck-summary.json"), "utf8")).toBe(before);
    } finally {
      rmSync(first.output, { recursive: true, force: true });
    }
  });

  test("renders a fixed missing reason and escapes interpolated text", () => {
    const report = passReport();
    report.summary.verdict = "<unsafe>";
    report.summary.missingMetrics = [{ metric: "api.p95Ms", reason: "METRIC_VALUES_MISSING" }];
    report.series.apiP95Ms = [];

    const html = buildStageChartHtml(report);

    expect(html).toContain("필수 지표 누락: METRIC_VALUES_MISSING");
    expect(html).not.toContain('data-series="api-p95"');
    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).not.toContain("><unsafe></text>");
  });
});

function readPngSize(path: string) {
  const png = readFileSync(path);
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("invalid PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function passReport() {
  return {
    summary: {
      runId: "run-bottleneck-fixture",
      stage: 50,
      attempt: 1,
      startedAtUtc: "2026-08-15T00:00:00.000Z",
      endedAtUtc: "2026-08-15T00:03:00.000Z",
      startedAtKst: "2026-08-15T09:00:00.000+09:00",
      endedAtKst: "2026-08-15T09:03:00.000+09:00",
      users: { target: 50, started: 50, completed: 50, failed: 0, successRatePercent: 100 },
      api: { p95Ms: 300, slowestRoute: "INTERVIEW_RUNTIME", slowestRouteP95Ms: 490, errorRatePercent: 0 },
      ecsServices: {
        api: service(25, 50, 45, 70),
        frontend: service(15, 40, 35, 55),
        worker: service(35, 70, 45, 75),
      },
      serverFailureEvidence: { detected: false, reasons: [], albTarget5xx: 0, targetConnectionErrors: 0, ecsTaskAnomaly: false },
      dbCpuCredit: { start: 10000, end: 9998, minimum: 9998, decrease: 2 },
      verdict: "PASS",
      reasons: [],
      missingMetrics: [],
    },
    series: {
      apiP95Ms: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 200 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 300 }],
      apiErrorRatePercent: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 0 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 0 }],
      ecsServices: {
        api: resourceSeries(30, 50, 55, 70),
        frontend: resourceSeries(20, 40, 45, 55),
        worker: resourceSeries(50, 70, 60, 75),
      },
      dbCpuCredit: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 10000 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 9998 }],
    },
  };
}

function service(averageCpuPercent: number, maximumCpuPercent: number, averageMemoryPercent: number, maximumMemoryPercent: number) {
  return {
    cpu: { averagePercent: averageCpuPercent, maximumPercent: maximumCpuPercent, maximumAtUtc: "2026-08-15T00:02:00.000Z", status: "NORMAL" },
    memory: { averagePercent: averageMemoryPercent, maximumPercent: maximumMemoryPercent, maximumAtUtc: "2026-08-15T00:02:00.000Z", status: "NORMAL" },
    status: "NORMAL",
    taskAnomaly: false,
  };
}

function resourceSeries(cpuStart: number, cpuEnd: number, memoryStart: number, memoryEnd: number) {
  return {
    cpuAverage: [{ atUtc: "2026-08-15T00:00:00.000Z", value: cpuStart }, { atUtc: "2026-08-15T00:02:00.000Z", value: cpuEnd }],
    cpuMaximum: [{ atUtc: "2026-08-15T00:00:00.000Z", value: cpuStart }, { atUtc: "2026-08-15T00:02:00.000Z", value: cpuEnd }],
    memoryAverage: [{ atUtc: "2026-08-15T00:00:00.000Z", value: memoryStart }, { atUtc: "2026-08-15T00:02:00.000Z", value: memoryEnd }],
    memoryMaximum: [{ atUtc: "2026-08-15T00:00:00.000Z", value: memoryStart }, { atUtc: "2026-08-15T00:02:00.000Z", value: memoryEnd }],
  };
}

async function runStageCliFixture(existingOutput?: string) {
  const fixture = resolve("tests/fixtures/bottleneck/stage-50");
  const output = existingOutput ?? mkdtempSync(join(tmpdir(), "bottleneck-stage-cli-"));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await summarizeBottleneck([
    "--run-id=run-bottleneck-fixture",
    "--stage=50",
    "--attempt=1",
    "--started-at=2026-08-15T00:00:00.000Z",
    "--ended-at=2026-08-15T00:03:00.000Z",
    `--api-summary=${join(fixture, "api-summary.json")}`,
    `--browser-summary=${join(fixture, "browser-summary.json")}`,
    `--cloudwatch-raw=${join(fixture, "cloudwatch-raw.json")}`,
    `--ecs-task-evidence=${join(fixture, "ecs-task-evidence.json")}`,
    `--hybrid-stage=${join(fixture, "hybrid-stage.json")}`,
    `--cloudwatch-images=${join(fixture, "cloudwatch-images.json")}`,
    `--output=${output}`,
  ], {
    log: (value: string) => stdout.push(value),
    error: (value: string) => stderr.push(value),
  });
  return { exitCode, output, pngPath: join(output, "bottleneck-summary.png"), stdout, stderr };
}

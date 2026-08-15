import { expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectGeneratorConstraint,
  evaluateStage,
  renderSummaryMarkdown,
  summarizeRunDirectory,
  summarizeVirtualUsers,
} from "../../src/result-summary.mjs";

test.describe("load-test result summary", () => {
  test("aggregates failures and interpolated ready percentiles", () => {
    const summary = summarizeVirtualUsers([
      result({ vuId: "vu-001", readyMs: 1_000, heldMs: 150_000, api5xx: 0, status: "passed" }),
      result({ vuId: "vu-002", readyMs: 2_000, heldMs: 149_000, api5xx: 1, status: "failed" }),
    ]);

    expect(summary).toMatchObject({
      total: 2,
      passed: 1,
      failed: 1,
      api4xx: 0,
      api5xx: 1,
      connectionDrops: 0,
      pageErrors: 0,
      requestFailures: 0,
      consoleErrors: 0,
      readyP50Ms: 1_500,
      readyP95Ms: 1_950,
      readyP99Ms: 1_990,
      minimumHeldMs: 149_000,
    });
    expect(evaluateStage(summary, { generatorConstrained: false, expectedUsers: 2 })).toBe("FAILED");
  });

  test("keeps short hold observational while enforcing ready, 5xx, drop, and missing-user gates", () => {
    const passing = summarizeVirtualUsers([result()]);
    expect(evaluateStage(passing, { generatorConstrained: false, expectedUsers: 1 })).toBe("PASSED");
    expect(evaluateStage(summarizeVirtualUsers([result({ readyMs: 90_001 })]), {
      generatorConstrained: false,
      expectedUsers: 1,
    })).toBe("FAILED");
    const shortHold = summarizeVirtualUsers([result({ heldMs: 149_999 })]);
    expect(evaluateStage(shortHold, {
      generatorConstrained: false,
      expectedUsers: 1,
    })).toBe("PASSED");
    expect(shortHold.minimumHeldMs).toBe(149_999);
    expect(evaluateStage(summarizeVirtualUsers([result({ api5xx: 1 })]), {
      generatorConstrained: false,
      expectedUsers: 1,
    })).toBe("FAILED");
    expect(evaluateStage(summarizeVirtualUsers([result({ connectionDrops: 1 })]), {
      generatorConstrained: false,
      expectedUsers: 1,
    })).toBe("FAILED");
    expect(evaluateStage(passing, { generatorConstrained: false, expectedUsers: 2 })).toBe("FAILED");
    expect(evaluateStage(passing, {
      generatorConstrained: false,
      expectedUsers: 1,
      hostCoverageComplete: false,
    })).toBe("FAILED");
    expect(evaluateStage(passing, {
      generatorConstrained: false,
      expectedUsers: 1,
      vuCoverageComplete: false,
    })).toBe("FAILED");
    expect(evaluateStage(passing, {
      generatorConstrained: false,
      expectedUsers: 1,
      cloudWatchServerFailure: true,
    })).toBe("FAILED");
    expect(evaluateStage(passing, {
      generatorConstrained: false,
      expectedUsers: 1,
      cloudWatchMetricIncomplete: true,
    })).toBe("FAILED");
  });

  test("reports generator constraint only when the functional result has not failed", () => {
    const passing = summarizeVirtualUsers([result()]);
    const failed = summarizeVirtualUsers([result({ status: "failed" })]);

    expect(evaluateStage(passing, { generatorConstrained: true, expectedUsers: 1 }))
      .toBe("GENERATOR_CONSTRAINED");
    expect(evaluateStage(failed, { generatorConstrained: true, expectedUsers: 1 }))
      .toBe("FAILED");
  });

  test("detects three consecutive CPU, memory, or load breaches", () => {
    expect(detectGeneratorConstraint([
      hostSample({ cpuPercent: 90 }),
      hostSample({ cpuPercent: 92 }),
      hostSample({ cpuPercent: 95 }),
    ])).toEqual({ constrained: true, reason: "CPU_90_PERCENT_3_CONSECUTIVE" });
    expect(detectGeneratorConstraint([
      hostSample({ availableMemoryMiB: 700 }),
      hostSample({ availableMemoryMiB: 750 }),
      hostSample({ availableMemoryMiB: 767 }),
    ])).toEqual({ constrained: true, reason: "AVAILABLE_MEMORY_BELOW_768_MIB_3_CONSECUTIVE" });
    expect(detectGeneratorConstraint([
      hostSample({ load1: 4.1 }),
      hostSample({ load1: 4.5 }),
      hostSample({ load1: 5 }),
    ])).toEqual({ constrained: true, reason: "LOAD1_ABOVE_4_3_CONSECUTIVE" });
  });

  test("detects OOM or Chromium crashes immediately and ignores isolated spikes", () => {
    expect(detectGeneratorConstraint([hostSample({ oomKilled: true })]))
      .toEqual({ constrained: true, reason: "OOM_KILLED" });
    expect(detectGeneratorConstraint([hostSample({ chromiumCrashCount: 1 })]))
      .toEqual({ constrained: true, reason: "CHROMIUM_CRASH" });
    expect(detectGeneratorConstraint([
      hostSample({ cpuPercent: 95 }),
      hostSample(),
      hostSample({ cpuPercent: 95 }),
      hostSample({ cpuPercent: 95 }),
    ])).toEqual({ constrained: false, reason: null });
  });

  test("aggregates a downloaded 15-user stage directory into safe JSON and markdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "playwright-loadtest-summary-"));
    try {
      await writeStageWindows(root, "run-20260802-summary", [{
        stageUsers: 15,
        attempt: 1,
        start: "2026-08-02T02:00:00.000Z",
        end: "2026-08-02T02:06:00.000Z",
        activeHosts: 15,
        success: true,
      }]);
      await writeHealthyMetrics(root, 15, 1);
      for (let index = 1; index <= 15; index += 1) {
        const instance = `instance-${String(index).padStart(2, "0")}`;
        const vu = `vu-${String((index - 1) * 10 + 1).padStart(3, "0")}`;
        const instanceDir = join(root, "stages", "15", "attempt-1", instance);
        const vuDir = join(instanceDir, "virtual-users", vu);
        await mkdir(vuDir, { recursive: true });
        await writeFile(join(vuDir, "result.json"), JSON.stringify(result({ vu })), "utf8");
        await writeFile(join(instanceDir, "resource-samples.ndjson"), [
          hostSample(), hostSample(), hostSample(),
        ].map((sample) => JSON.stringify(sample)).join("\n") + "\n", "utf8");
      }

      const summary = await summarizeRunDirectory(root, { runId: "run-20260802-summary" });
      const markdown = renderSummaryMarkdown(summary);
      expect(summary.stages[0]).toMatchObject({
        users: 15,
        attempt: 1,
        total: 15,
        passed: 15,
        failed: 0,
        reportedHosts: 15,
        verdict: "PASSED",
      });
      expect(summary.stages[0].virtualUsers).toHaveLength(15);
      expect(summary.stages[0].virtualUsers[0]).toEqual({
        vu: "vu-001",
        status: "passed",
        failureCode: null,
        evidence: {},
      });
      expect(markdown).toContain("| 15 | 15 | 15 | 0 | PASSED |");
      expect(JSON.stringify(summary) + markdown).not.toMatch(/magicToken|applicationId|eyJ/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("includes dispatch-failed stage windows even when no host artifact exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "playwright-loadtest-missing-stage-"));
    try {
      await writeStageWindows(root, "run-20260802-missing", [{
        stageUsers: 25,
        attempt: 2,
        start: "2026-08-02T02:00:00.000Z",
        end: "2026-08-02T02:00:10.000Z",
        activeHosts: 20,
        success: false,
        failureCode: "SSM_DISPATCH_FAILED",
      }]);

      const summary = await summarizeRunDirectory(root, { runId: "run-20260802-missing" });
      expect(summary.stages).toHaveLength(1);
      expect(summary.stages[0]).toMatchObject({
        users: 25,
        attempt: 2,
        total: 0,
        orchestrationSuccess: false,
        failureCode: "SSM_DISPATCH_FAILED",
        verdict: "FAILED",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails a functionally passing stage when CloudWatch reports target failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "playwright-loadtest-cloudwatch-"));
    try {
      await writeStageWindows(root, "run-20260802-cw", [{
        stageUsers: 1,
        attempt: 1,
        start: "2026-08-02T02:00:00.000Z",
        end: "2026-08-02T02:02:00.000Z",
        activeHosts: 1,
        success: true,
      }]);
      const instanceDir = join(root, "canary", "attempt-1", "instance-01");
      const vuDir = join(instanceDir, "virtual-users", "vu-001");
      await mkdir(vuDir, { recursive: true });
      await writeFile(join(vuDir, "result.json"), JSON.stringify(result({ heldMs: 150_000 })), "utf8");
      await writeFile(join(instanceDir, "resource-samples.ndjson"), `${JSON.stringify(hostSample())}\n`, "utf8");
      await mkdir(join(root, "metrics"), { recursive: true });
      await writeFile(join(root, "metrics", "stage-1-attempt-1.json"), JSON.stringify({
        MetricDataResults: [
          { Id: "api_target_5xx", StatusCode: "Complete", Values: [1] },
          { Id: "alb_target_connection_errors", StatusCode: "Complete", Values: [0] },
        ],
      }), "utf8");

      const summary = await summarizeRunDirectory(root, { runId: "run-20260802-cw" });
      expect(summary.stages[0]).toMatchObject({ cloudWatchServerFailure: true, verdict: "FAILED" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("records a short canary hold without failing the stage", async () => {
    const root = await mkdtemp(join(tmpdir(), "playwright-loadtest-canary-hold-"));
    try {
      await writeStageWindows(root, "run-20260802-canary-hold", [{
        stageUsers: 1,
        attempt: 1,
        start: "2026-08-02T02:00:00.000Z",
        end: "2026-08-02T02:03:00.000Z",
        activeHosts: 1,
        success: true,
      }]);
      const instanceDir = join(root, "canary", "attempt-1", "instance-01");
      const vuDir = join(instanceDir, "virtual-users", "vu-001");
      await mkdir(vuDir, { recursive: true });
      await writeFile(join(instanceDir, "resource-samples.ndjson"), `${JSON.stringify(hostSample())}\n`, "utf8");
      await writeHealthyMetrics(root, 1, 1);

      await writeFile(join(vuDir, "result.json"), JSON.stringify(result({ heldMs: 149_999 })), "utf8");
      expect((await summarizeRunDirectory(root, { runId: "run-20260802-canary-hold" })).stages[0])
        .toMatchObject({ verdict: "PASSED", minimumHeldMs: 149_999 });

      await writeFile(join(vuDir, "result.json"), JSON.stringify(result({ heldMs: 150_000 })), "utf8");
      expect((await summarizeRunDirectory(root, { runId: "run-20260802-canary-hold" })).stages[0]?.verdict)
        .toBe("PASSED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeStageWindows(root: string, runId: string, windows: Record<string, unknown>[]) {
  const controlDirectory = join(root, "control");
  await mkdir(controlDirectory, { recursive: true });
  await writeFile(join(controlDirectory, "stage-windows.json"), JSON.stringify({
    schemaVersion: "PLAYWRIGHT_LOADTEST_WINDOWS_V1",
    runId,
    windows,
  }), "utf8");
}

async function writeHealthyMetrics(root: string, users: number, attempt: number) {
  await mkdir(join(root, "metrics"), { recursive: true });
  await writeFile(join(root, "metrics", `stage-${users}-attempt-${attempt}.json`), JSON.stringify({
    MetricDataResults: [
      { Id: "api_target_5xx", StatusCode: "Complete", Values: [0] },
      { Id: "alb_target_connection_errors", StatusCode: "Complete", Values: [0] },
    ],
  }), "utf8");
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    vuId: "vu-001",
    status: "passed",
    readyMs: 1_000,
    heldMs: 150_000,
    api4xx: 0,
    api5xx: 0,
    connectionDrops: 0,
    ...overrides,
  };
}

function hostSample(overrides: Record<string, unknown> = {}) {
  return {
    cpuPercent: 20,
    availableMemoryMiB: 2_000,
    load1: 1,
    oomKilled: false,
    chromiumCrashCount: 0,
    ...overrides,
  };
}

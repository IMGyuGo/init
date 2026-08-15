import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildHybridSummary,
  evaluateHybridStage,
  renderHybridSummaryMarkdown,
  summarizeHybridBrowserStage,
} from "../../src/hybrid-summary.mjs";
import { main as summarizeHybrid } from "../../scripts/summarize-hybrid.mjs";

const EXPECTED_VUS = ["vu-001", "vu-021", "vu-061", "vu-081", "vu-131"];

test.describe("hybrid load-test summary", () => {
  test("clean 45 API plus five browsers becomes HYBRID_PASSED", () => {
    expect(evaluateHybridStage({
      totalUsers: 50,
      api: apiSummary("PASSED", 45),
      browser: browserSummary("PASSED"),
      cloudWatch: cloudWatchSummary(),
    })).toBe("HYBRID_PASSED");
  });

  test("browser adapter requires the exact approved VUs and both screenshots", () => {
    const summary = summarizeHybridBrowserStage({
      results: fiveBrowserResults(),
      resourceSamples: fiveHealthyHostSamples(),
      expectedVuIds: EXPECTED_VUS,
    });
    expect(summary).toMatchObject({
      total: 5,
      passed: 5,
      failed: 0,
      generatorReasons: [],
      verdict: "PASSED",
    });
    expect(summary.virtualUsers.every((vu: { evidence: { ready?: string; completed?: string } }) =>
      vu.evidence.ready && vu.evidence.completed)).toBe(true);

    const missingScreenshot = fiveBrowserResults();
    delete missingScreenshot[2].evidence.completed;
    expect(summarizeHybridBrowserStage({
      results: missingScreenshot,
      resourceSamples: fiveHealthyHostSamples(),
      expectedVuIds: EXPECTED_VUS,
    }).verdict).toBe("FAILED");
  });

  test("browser adapter observes a short hold without failing it", () => {
    const results = fiveBrowserResults();
    results[0].heldMs = 149_999;

    expect(summarizeHybridBrowserStage({
      results,
      resourceSamples: fiveHealthyHostSamples(),
      expectedVuIds: EXPECTED_VUS,
    })).toMatchObject({ verdict: "PASSED", minimumHeldMs: 149_999, failureReasons: [] });
  });

  test("functional failure wins over any generator signal", () => {
    expect(evaluateHybridStage({
      totalUsers: 100,
      api: apiSummary("GENERATOR_CONSTRAINED", 95),
      browser: browserSummary("FAILED"),
      cloudWatch: cloudWatchSummary(),
    })).toBe("FAILED");
  });

  test("either healthy-side generator constraint is preserved", () => {
    expect(evaluateHybridStage({
      totalUsers: 200,
      api: apiSummary("GENERATOR_CONSTRAINED", 195),
      browser: browserSummary("PASSED"),
      cloudWatch: cloudWatchSummary(),
    })).toBe("GENERATOR_CONSTRAINED");
  });

  test("CloudWatch server failure or incomplete metrics fail the stage", () => {
    const base = {
      totalUsers: 50,
      api: apiSummary("PASSED", 45),
      browser: browserSummary("PASSED"),
    };
    expect(evaluateHybridStage({ ...base, cloudWatch: cloudWatchSummary({ serverFailure: true }) }))
      .toBe("FAILED");
    expect(evaluateHybridStage({ ...base, cloudWatch: cloudWatchSummary({ metricIncomplete: true }) }))
      .toBe("FAILED");
  });

  test("baseline 25 remains E2E functional success and generator constrained", () => {
    const summary = buildHybridSummary({
      runId: "run-20260814-hybrid",
      baseline25: {
        runId: "run-20260802-231235",
        stages: [{ users: 25, total: 25, passed: 25, failed: 0, verdict: "GENERATOR_CONSTRAINED" }],
      },
      stages: [],
    });
    const markdown = renderHybridSummaryMarkdown(summary);
    expect(summary.baseline25).toEqual({
      sourceRunId: "run-20260802-231235",
      functionalUsers: 25,
      functionalPassed: 25,
      classification: "E2E_FUNCTIONAL_SUCCESS_GENERATOR_CONSTRAINED",
    });
    expect(markdown).toContain("| 총 사용자 | API 사용자 | 브라우저 사용자 | API 오류 | 브라우저 실패 | ALB 5xx | API p95 | 최종 판정 |");
    expect(markdown).toContain("| 25 | 0 | 25 | 0 | 0 | n/a | n/a | E2E 기능 성공 + generator constrained |");
  });

  test("summary CLI reads safe stage summaries and writes JSON plus Markdown", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hybrid-summary-cli-"));
    const input = join(directory, "raw");
    const output = join(directory, "summary");
    mkdirSync(join(input, "stage-50"), { recursive: true });
    writeFileSync(join(directory, "baseline.json"), JSON.stringify({
      runId: "run-20260802-231235",
      stages: [{ users: 25, total: 25, passed: 25, failed: 0, verdict: "GENERATOR_CONSTRAINED" }],
    }), "utf8");
    writeFileSync(join(input, "stage-50", "api-summary.json"), JSON.stringify(apiSummary("PASSED", 45)), "utf8");
    writeFileSync(join(input, "stage-50", "browser-summary.json"), JSON.stringify(browserSummary("PASSED")), "utf8");
    writeFileSync(join(input, "stage-50", "cloudwatch-summary.json"), JSON.stringify(cloudWatchSummary()), "utf8");
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      const exitCode = await summarizeHybrid([
        `--baseline=${join(directory, "baseline.json")}`,
        `--input=${input}`,
        `--output=${output}`,
        "--run-id=run-20260814-hybrid",
      ], {
        log: (value: string) => stdout.push(value),
        error: (value: string) => stderr.push(value),
      });
      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout).toEqual([JSON.stringify({
        status: "HYBRID_SUMMARY_WRITTEN",
        stages: [{ totalUsers: 50, verdict: "HYBRID_PASSED" }],
      })]);
      const serialized = readFileSync(join(output, "summary.json"), "utf8")
        + readFileSync(join(output, "summary.md"), "utf8");
      expect(serialized).toContain("HYBRID_PASSED");
      expect(serialized).not.toMatch(/magicToken|publicAccessToken|applicationId|sessionId|@loadtest\.invalid/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function apiSummary(verdict: string, expectedUsers: number) {
  return {
    expectedUsers,
    reportedUsers: expectedUsers,
    tests: expectedUsers * 5,
    errors: 0,
    unexpected4xx: 0,
    server5xx: 0,
    timeouts: 0,
    connectionErrors: 0,
    latencyMs: { p50: 100, p95: 200, p99: 250 },
    generatorReasons: verdict === "GENERATOR_CONSTRAINED" ? ["CPU_80_PERCENT_3_CONSECUTIVE"] : [],
    failureReasons: [],
    verdict,
  };
}

function browserSummary(verdict: string) {
  return {
    total: 5,
    passed: verdict === "FAILED" ? 4 : 5,
    failed: verdict === "FAILED" ? 1 : 0,
    api5xx: 0,
    connectionDrops: 0,
    generatorReasons: verdict === "GENERATOR_CONSTRAINED" ? ["CPU_90_PERCENT_3_CONSECUTIVE"] : [],
    verdict,
  };
}

function cloudWatchSummary(overrides: Record<string, unknown> = {}) {
  return {
    serverFailure: false,
    metricIncomplete: false,
    alb5xx: 0,
    apiP95Ms: 250,
    ...overrides,
  };
}

function fiveBrowserResults() {
  return EXPECTED_VUS.map((vu) => ({
    vu,
    status: "passed",
    failureCode: null,
    readyMs: 1_000,
    heldMs: 150_000,
    api4xx: 0,
    api5xx: 0,
    connectionDrops: 0,
    pageErrors: 0,
    requestFailures: 0,
    consoleErrors: 0,
    evidence: {
      ready: `virtual-users/${vu}/ready.png`,
      completed: `virtual-users/${vu}/completed.png`,
    },
  }));
}

function fiveHealthyHostSamples() {
  return [1, 3, 7, 9, 14].map((instanceIndex) => ({
    instanceIndex,
    samples: Array.from({ length: 15 }, () => ({
      cpuPercent: 30,
      availableMemoryMiB: 2048,
      load1: 0.5,
      oomKilled: false,
      chromiumCrashCount: 0,
    })),
  }));
}

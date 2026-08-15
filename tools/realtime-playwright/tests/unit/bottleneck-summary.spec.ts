import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { normalizeBottleneckEvidence } from "../../src/bottleneck-evidence.mjs";
import {
  buildBottleneckSummary,
  renderBottleneckMarkdown,
} from "../../src/bottleneck-summary.mjs";

test.describe("bottleneck stage summary", () => {
  test("writes only approved JSON fields and exact UTC KST windows", () => {
    const { summary } = buildBottleneckSummary(passInput());

    expect(Object.keys(summary)).toEqual([
      "runId", "stage", "attempt", "startedAtUtc", "endedAtUtc", "startedAtKst", "endedAtKst",
      "users", "api", "ecsServices", "serverFailureEvidence", "cloudWatchImages", "dbCpuCredit", "verdict", "reasons", "missingMetrics",
    ]);
    expect(Object.keys(summary.users)).toEqual([
      "target", "started", "completed", "failed", "successRatePercent",
    ]);
    expect(Object.keys(summary.api)).toEqual([
      "p95Ms", "slowestRoute", "slowestRouteP95Ms", "errorRatePercent", "holdMs", "runtimeSamplesComplete",
    ]);
    expect(summary).toMatchObject({
      startedAtUtc: "2026-08-15T00:00:00.000Z",
      endedAtUtc: "2026-08-15T00:03:00.000Z",
      startedAtKst: "2026-08-15T09:00:00.000+09:00",
      endedAtKst: "2026-08-15T09:03:00.000+09:00",
      users: { target: 50, started: 50, completed: 50, failed: 0, successRatePercent: 100 },
      api: {
        holdMs: { minimum: 147_369, average: 149_500, maximum: 150_000 },
        runtimeSamplesComplete: true,
      },
      ecsServices: {
        api: {
          cpu: { averagePercent: 25, maximumPercent: 50, status: "NORMAL" },
          memory: { averagePercent: 45, maximumPercent: 70, status: "NORMAL" },
          status: "NORMAL",
          taskAnomaly: false,
        },
        frontend: {
          cpu: { averagePercent: 15, maximumPercent: 40, status: "NORMAL" },
          memory: { averagePercent: 35, maximumPercent: 55, status: "NORMAL" },
          status: "NORMAL",
          taskAnomaly: false,
        },
        worker: {
          cpu: { averagePercent: 35, maximumPercent: 70, status: "NORMAL" },
          memory: { averagePercent: 45, maximumPercent: 75, status: "NORMAL" },
          status: "NORMAL",
          taskAnomaly: false,
        },
      },
      serverFailureEvidence: { detected: false, reasons: [] },
      verdict: "PASS",
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/totalRequests|failedRequests|majorFailureStages|representativeErrors/);
    expect(serialized).not.toMatch(/magicToken|publicAccessToken|applicationId|sessionId|Authorization|@/i);
  });

  test("keeps extra minimum metrics in safe Markdown only", () => {
    const report = buildBottleneckSummary(passInput());
    const markdown = renderBottleneckMarkdown(report);

    expect(markdown).toContain("| 전체 요청 수 | 350 |");
    expect(markdown).toContain("| 실패 요청 수 | 0 |");
    expect(markdown).toContain("| 주요 실패 단계 | 없음 |");
    expect(markdown).toContain("| 대표 오류 유형 | 없음 |");
    expect(markdown).toContain("| 실제 유지 시간 최소/평균/최대 | 147369ms / 149500ms / 150000ms |");
    expect(markdown).toContain("| API | 25% | 50% | NORMAL | 45% | 70% | NORMAL | 없음 |");
    expect(markdown).toContain("| frontend | 15% | 40% | NORMAL | 35% | 55% | NORMAL | 없음 |");
    expect(markdown).toContain("| worker | 35% | 70% | NORMAL | 45% | 75% | NORMAL | 없음 |");
    expect(markdown).toContain("| 서버 장애 증거 | 없음 |");
    expect(markdown).toContain("이상 징후 없음 — 조건부 그래프 미생성");
    expect(markdown).toContain("| DB credit 예상 소진 위험 | 없음 |");
    expect(markdown).not.toMatch(/magicToken|applicationId|sessionId|https?:\/\//i);
  });

  const verdictCases: Array<[string, (input: any) => any, string]> = [
    ["pass", (input) => input, "PASS"],
    ["db credit risk", withDbExhaustionUnder24Hours, "PASS_WITH_DB_CREDIT_RISK"],
    ["application correlation", withCorrelatedApiAndEcsFailure, "FAIL_APPLICATION"],
    ["database correlation", withCorrelatedApiAndDbFailure, "FAIL_DATABASE"],
    ["user flow only", withUserFlowFailureOnly, "FAIL_USER_FLOW"],
    ["insufficient load", withMissingStartedUsers, "INSUFFICIENT_LOAD"],
    ["insufficient evidence", withMissingRequiredMetric, "INSUFFICIENT_EVIDENCE"],
  ];

  for (const [name, mutate, verdict] of verdictCases) {
    test(`classifies ${name}`, () => {
      expect(buildBottleneckSummary(mutate(passInput())).summary.verdict).toBe(verdict);
    });
  }

  test("does not fail on high ECS CPU alone", () => {
    const input = passInput();
    input.evidence.aggregate.ecsServices.api.cpu.averagePercent = 95;
    input.evidence.aggregate.ecsServices.api.cpu.maximumPercent = 99;
    input.evidence.aggregate.ecsServices.api.cpu.status = "SATURATED";
    input.evidence.aggregate.ecsServices.api.status = "SATURATED";
    input.evidence.series.ecsServices.api.cpuMaximum = [
      { atUtc: "2026-08-15T00:01:00.000Z", value: 99 },
    ];

    expect(buildBottleneckSummary(input).summary.verdict).toBe("PASS");
  });

  test("fails as application infrastructure when server evidence exists without a user failure", () => {
    const input = passInput();
    input.evidence.aggregate.ecsServices.worker.taskAnomaly = true;
    input.evidence.aggregate.serverFailureEvidence = {
      detected: true,
      reasons: ["ECS_WORKER_TASK_ANOMALY"],
      alb5xx: 0,
      albTarget5xx: 0,
      targetConnectionErrors: 0,
      ecsTaskAnomaly: true,
    };

    expect(buildBottleneckSummary(input).summary).toMatchObject({
      verdict: "FAIL_APPLICATION",
      serverFailureEvidence: { detected: true, reasons: ["ECS_WORKER_TASK_ANOMALY"] },
    });
  });

  test("preserves an ALB-generated 5xx count in the safe report", () => {
    const input = passInput();
    input.evidence.aggregate.serverFailureEvidence = {
      detected: true,
      reasons: ["ALB_5XX"],
      alb5xx: 1,
      albTarget5xx: 0,
      targetConnectionErrors: 0,
      ecsTaskAnomaly: false,
    };

    const report = buildBottleneckSummary(input);

    expect(report.summary.serverFailureEvidence).toMatchObject({ alb5xx: 1 });
    expect(renderBottleneckMarkdown(report)).toContain("ALB_5XX");
  });

  test("renders only fixed representative error codes", () => {
    const report = buildBottleneckSummary(withCorrelatedApiAndEcsFailure(passInput()));
    const markdown = renderBottleneckMarkdown(report);

    expect(markdown).toContain("HTTP_5XX(1)");
    expect(markdown).toContain("ALB_TARGET_5XX(1)");
    expect(markdown).toContain("| 서버 장애 증거 | ALB_TARGET_5XX |");
    expect(markdown).not.toContain("upstream response body");
  });

  test("renders successful AWS evidence links and fixed image failures", () => {
    const input = passInput();
    input.cloudWatchImages = [
      {
        fileName: "ecs-resource-utilization.png",
        status: "SUCCEEDED",
        sha256: "a".repeat(64),
        createdAtUtc: "2026-08-15T00:09:00.000Z",
        startedAtUtc: "2026-08-14T23:55:00.000Z",
        endedAtUtc: "2026-08-15T00:08:00.000Z",
        localPath: "cloudwatch-images/ecs-resource-utilization.png",
        s3ObjectKey: "runs/run-20260815-bottleneck/stages/50/attempt-1/cloudwatch-images/ecs-resource-utilization.png",
      },
      {
        fileName: "server-failure-signals.png",
        status: "FAILED",
        failureCode: "CLOUDWATCH_IMAGE_GENERATION_FAILED",
      },
    ];

    const report = buildBottleneckSummary(input);
    const markdown = renderBottleneckMarkdown(report);

    expect(report.summary.cloudWatchImages).toEqual(input.cloudWatchImages);
    expect(markdown).toContain("[ecs-resource-utilization.png](cloudwatch-images/ecs-resource-utilization.png)");
    expect(markdown).toContain("runs/run-20260815-bottleneck/stages/50/attempt-1/cloudwatch-images/ecs-resource-utilization.png");
    expect(markdown).toContain("server-failure-signals.png: CLOUDWATCH_IMAGE_GENERATION_FAILED");
  });

  test("treats an unknown slowest route as missing evidence", () => {
    const input = passInput();
    input.api.slowestRoute = "SECRET_FIELD";

    const { summary } = buildBottleneckSummary(input);

    expect(summary.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(summary.api.slowestRoute).toBeNull();
    expect(summary.missingMetrics).toContainEqual({
      metric: "api.slowestRoute",
      reason: "ROUTE_LATENCY_MISSING",
    });
  });

  test("validates generator reasons from both generators", () => {
    const input = passInput();
    input.api.generatorReasons = ["CPU_80_PERCENT_3_CONSECUTIVE"];
    input.browser.generatorReasons = ["not-a-fixed-code"];

    expect(() => buildBottleneckSummary(input)).toThrow("bottleneck summary input is invalid");
  });

  test("reports missing ALB error metrics without inventing representative errors", () => {
    const input = passInput();
    input.evidence.aggregate.apiErrors = {
      target4xx: null,
      target5xx: null,
      connectionErrors: null,
    };
    input.evidence.missingMetrics.push(
      { metric: "alb.target4xx", reason: "METRIC_VALUES_MISSING" },
      { metric: "alb.target5xx", reason: "METRIC_VALUES_MISSING" },
      { metric: "alb.connectionErrors", reason: "METRIC_VALUES_MISSING" },
    );

    const report = buildBottleneckSummary(input);

    expect(report.summary.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(report.details.representativeErrors).toEqual([]);
  });
});

function passInput() {
  const cloudWatchRaw = readJson("cloudwatch-raw.json");
  const ecsTaskEvidence = readJson("ecs-task-evidence.json");
  const startedAtUtc = "2026-08-15T00:00:00.000Z";
  const endedAtUtc = "2026-08-15T00:03:00.000Z";
  return {
    runId: "run-20260815-bottleneck",
    stage: 50,
    attempt: 1,
    startedAtUtc,
    endedAtUtc,
    api: readJson("api-summary.json"),
    browser: readJson("browser-summary.json"),
    hybridVerdict: readJson("hybrid-stage.json").verdict,
    cloudWatchImages: readJson("cloudwatch-images.json"),
    evidence: normalizeBottleneckEvidence({ cloudWatchRaw, ecsTaskEvidence, startedAtUtc, endedAtUtc }),
  };
}

function withFailedApiUser(input: any) {
  const value = structuredClone(input);
  value.api.passedUsers = 44;
  value.api.failedUsers = 1;
  value.api.failureStages = [{ code: "HTTP_5XX", count: 1 }];
  value.api.verdict = "FAILED";
  value.hybridVerdict = "FAILED";
  value.evidence.aggregate.failedRequests = 1;
  value.evidence.aggregate.errorRatePercent = 0.286;
  value.evidence.aggregate.apiErrors.target5xx = 1;
  value.evidence.series.apiErrorRatePercent = [
    { atUtc: "2026-08-15T00:01:00.000Z", value: 0.833 },
  ];
  return value;
}

function withDbExhaustionUnder24Hours(input: any) {
  const value = structuredClone(input);
  value.evidence.aggregate.dbCpuCredit = { start: 100, end: 50, minimum: 50, decrease: 50 };
  value.evidence.series.dbCpuCredit = [
    { atUtc: "2026-08-15T00:00:00.000Z", value: 100 },
    { atUtc: "2026-08-15T00:02:00.000Z", value: 50 },
  ];
  return value;
}

function withCorrelatedApiAndEcsFailure(input: any) {
  const value = withFailedApiUser(input);
  value.evidence.aggregate.serverFailureEvidence = {
    detected: true,
    reasons: ["ALB_TARGET_5XX"],
    alb5xx: 0,
    albTarget5xx: 1,
    targetConnectionErrors: 0,
    ecsTaskAnomaly: false,
  };
  return value;
}

function withCorrelatedApiAndDbFailure(input: any) {
  const value = withFailedApiUser(input);
  value.evidence.aggregate.dbCpuCredit = { start: 100, end: 10, minimum: 10, decrease: 90 };
  value.evidence.series.dbCpuCredit = [
    { atUtc: "2026-08-15T00:00:00.000Z", value: 100 },
    { atUtc: "2026-08-15T00:01:00.000Z", value: 10 },
  ];
  return value;
}

function withUserFlowFailureOnly(input: any) {
  const value = withFailedApiUser(input);
  value.api.failureStages = [{ code: "RUNTIME_SESSION_MISMATCH", count: 1 }];
  value.evidence.aggregate.failedRequests = 0;
  value.evidence.aggregate.errorRatePercent = 0;
  value.evidence.aggregate.apiErrors.target5xx = 0;
  value.evidence.series.apiErrorRatePercent = [];
  return value;
}

function withMissingStartedUsers(input: any) {
  const value = structuredClone(input);
  value.api.reportedUsers = 44;
  value.api.passedUsers = 44;
  value.api.failedUsers = 0;
  value.api.verdict = "GENERATOR_CONSTRAINED";
  value.api.generatorReasons = ["CPU_80_PERCENT_3_CONSECUTIVE"];
  value.hybridVerdict = "GENERATOR_CONSTRAINED";
  return value;
}

function withMissingRequiredMetric(input: any) {
  const value = structuredClone(input);
  value.evidence.aggregate.apiP95Ms = null;
  value.evidence.series.apiP95Ms = [];
  value.evidence.missingMetrics = [{ metric: "api.p95Ms", reason: "METRIC_VALUES_MISSING" }];
  return value;
}

function readJson(name: string) {
  const directory = resolve("tests/fixtures/bottleneck/stage-50");
  return JSON.parse(readFileSync(join(directory, name), "utf8"));
}

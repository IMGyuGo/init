import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  classifyUtilization,
  normalizeBottleneckEvidence,
  normalizeEcsTaskEvidence,
} from "../../src/bottleneck-evidence.mjs";

test.describe("bottleneck evidence", () => {
  test("normalizes aligned ALB ECS and RDS evidence", () => {
    const evidence = normalizeBottleneckEvidence(fixtureInput());

    expect(evidence.aggregate).toEqual({
      totalRequests: 350,
      failedRequests: 0,
      errorRatePercent: 0,
      apiErrors: { target4xx: 0, target5xx: 0, connectionErrors: 0 },
      apiP95Ms: 300,
      ecsServices: {
        api: {
          cpu: {
            averagePercent: 25,
            maximumPercent: 50,
            maximumAtUtc: "2026-08-15T00:02:00.000Z",
            status: "NORMAL",
          },
          memory: {
            averagePercent: 45,
            maximumPercent: 70,
            maximumAtUtc: "2026-08-15T00:02:00.000Z",
            status: "NORMAL",
          },
          status: "NORMAL",
          taskAnomaly: false,
        },
        frontend: {
          cpu: {
            averagePercent: 15,
            maximumPercent: 40,
            maximumAtUtc: "2026-08-15T00:02:00.000Z",
            status: "NORMAL",
          },
          memory: {
            averagePercent: 35,
            maximumPercent: 55,
            maximumAtUtc: "2026-08-15T00:02:00.000Z",
            status: "NORMAL",
          },
          status: "NORMAL",
          taskAnomaly: false,
        },
        worker: {
          cpu: {
            averagePercent: 35,
            maximumPercent: 70,
            maximumAtUtc: "2026-08-15T00:02:00.000Z",
            status: "NORMAL",
          },
          memory: {
            averagePercent: 45,
            maximumPercent: 75,
            maximumAtUtc: "2026-08-15T00:02:00.000Z",
            status: "NORMAL",
          },
          status: "NORMAL",
          taskAnomaly: false,
        },
      },
      serverFailureEvidence: {
        detected: false,
        reasons: [],
        albTarget5xx: 0,
        targetConnectionErrors: 0,
        ecsTaskAnomaly: false,
      },
      ecsApi: {
        averageCpuPercent: 25,
        maximumCpuPercent: 50,
        maximumCpuAtUtc: "2026-08-15T00:02:00.000Z",
        taskAnomaly: false,
      },
      dbCpuCredit: { start: 10000, end: 9998, minimum: 9998, decrease: 2 },
    });
    expect(evidence.series.apiP95Ms).toEqual([
      { atUtc: "2026-08-15T00:00:00.000Z", value: 200 },
      { atUtc: "2026-08-15T00:01:00.000Z", value: 250 },
      { atUtc: "2026-08-15T00:02:00.000Z", value: 300 },
    ]);
    expect(evidence.series.apiErrorRatePercent).toEqual([
      { atUtc: "2026-08-15T00:00:00.000Z", value: 0 },
      { atUtc: "2026-08-15T00:01:00.000Z", value: 0 },
      { atUtc: "2026-08-15T00:02:00.000Z", value: 0 },
    ]);
    expect(evidence.missingMetrics).toEqual([]);
  });

  test("marks a required timestamp and value mismatch as missing evidence", () => {
    const input = fixtureInput();
    metric(input.cloudWatchRaw, "db_cpu_credit_balance").Timestamps.pop();

    const evidence = normalizeBottleneckEvidence(input);

    expect(evidence.aggregate.dbCpuCredit).toEqual({
      start: null,
      end: null,
      minimum: null,
      decrease: null,
    });
    expect(evidence.series.dbCpuCredit).toEqual([]);
    expect(evidence.missingMetrics).toContainEqual({
      metric: "dbCpuCredit",
      reason: "TIMESTAMP_VALUE_LENGTH_MISMATCH",
    });
  });

  test("detects each ECS task anomaly without exposing task identifiers", () => {
    const cases = [
      (value: any) => { value.after.runningCount = 1; },
      (value: any) => { value.after.pendingCount = 1; },
      (value: any) => { value.after.rolloutState = "FAILED"; },
      (value: any) => { value.runningTaskSetChanged = true; },
      (value: any) => { value.stoppedTasks = [{ stopCode: "EssentialContainerExited", essentialExitCodes: [1] }]; },
    ];

    for (const mutate of cases) {
      const value = readJson("ecs-task-evidence.json");
      mutate(value.services.api);
      expect(normalizeEcsTaskEvidence(value.services.api)).toEqual({ taskAnomaly: true, evidenceComplete: true });
      expect(JSON.stringify(normalizeEcsTaskEvidence(value.services.api))).not.toMatch(/taskArn|containerArn/i);
    }
  });

  test("does not infer a healthy task state from incomplete evidence", () => {
    const value = readJson("ecs-task-evidence.json");
    delete value.services.api.after.rolloutState;

    const evidence = normalizeBottleneckEvidence({ ...fixtureInput(), ecsTaskEvidence: value });

    expect(evidence.aggregate.ecsServices.api.taskAnomaly).toBeNull();
    expect(evidence.missingMetrics).toContainEqual({
      metric: "ecsServices.api.taskAnomaly",
      reason: "ECS_TASK_EVIDENCE_INCOMPLETE",
    });
  });

  test("classifies the exact utilization boundaries", () => {
    expect([
      classifyUtilization(79.999),
      classifyUtilization(80),
      classifyUtilization(90),
      classifyUtilization(99),
      classifyUtilization(null),
    ]).toEqual(["NORMAL", "WARNING", "CRITICAL", "SATURATED", null]);
  });

  test("keeps 4xx observational but records 5xx and connection failures as server evidence", () => {
    const only4xx = fixtureInput();
    setSinglePoint(metric(only4xx.cloudWatchRaw, "api_target_4xx"), 3);
    expect(normalizeBottleneckEvidence(only4xx).aggregate.serverFailureEvidence).toMatchObject({
      detected: false,
      reasons: [],
      albTarget5xx: 0,
      targetConnectionErrors: 0,
    });

    const serverFailure = fixtureInput();
    setSinglePoint(metric(serverFailure.cloudWatchRaw, "api_target_5xx"), 1);
    setSinglePoint(metric(serverFailure.cloudWatchRaw, "alb_target_connection_errors"), 2);
    expect(normalizeBottleneckEvidence(serverFailure).aggregate.serverFailureEvidence).toEqual({
      detected: true,
      reasons: ["ALB_TARGET_5XX", "ALB_TARGET_CONNECTION_ERROR"],
      albTarget5xx: 1,
      targetConnectionErrors: 2,
      ecsTaskAnomaly: false,
    });
  });

  test("records the affected ECS service without exposing task identifiers", () => {
    const input = fixtureInput();
    input.ecsTaskEvidence.services.worker.stoppedTasks = [{
      stopCode: "EssentialContainerExited",
      essentialExitCodes: [137],
    }];

    const failure = normalizeBottleneckEvidence(input).aggregate.serverFailureEvidence;

    expect(failure).toEqual({
      detected: true,
      reasons: ["ECS_WORKER_TASK_ANOMALY"],
      albTarget5xx: 0,
      targetConnectionErrors: 0,
      ecsTaskAnomaly: true,
    });
    expect(JSON.stringify(failure)).not.toMatch(/taskArn|containerArn|EssentialContainerExited/i);
  });

  test("accepts legacy API average metric aliases only when primary IDs are absent", () => {
    const input = fixtureInput();
    metric(input.cloudWatchRaw, "api_cpu_average").Id = "api_cpu";
    metric(input.cloudWatchRaw, "api_memory_average").Id = "api_memory";
    expect(normalizeBottleneckEvidence(input).aggregate.ecsServices.api).toMatchObject({
      cpu: { averagePercent: 25 },
      memory: { averagePercent: 45 },
    });

    const duplicate = fixtureInput();
    duplicate.cloudWatchRaw.MetricDataResults.push({
      ...structuredClone(metric(duplicate.cloudWatchRaw, "api_cpu_average")),
      Id: "api_cpu",
    });
    expect(normalizeBottleneckEvidence(duplicate).missingMetrics).toContainEqual({
      metric: "ecsServices.api.cpu.averagePercent",
      reason: "METRIC_NOT_UNIQUE",
    });
  });
});

function fixtureInput() {
  return {
    cloudWatchRaw: readJson("cloudwatch-raw.json"),
    ecsTaskEvidence: readJson("ecs-task-evidence.json"),
    startedAtUtc: "2026-08-15T00:00:00.000Z",
    endedAtUtc: "2026-08-15T00:03:00.000Z",
  };
}

function readJson(name: string) {
  const directory = resolve("tests/fixtures/bottleneck/stage-50");
  return JSON.parse(readFileSync(join(directory, name), "utf8"));
}

function metric(raw: any, id: string) {
  return raw.MetricDataResults.find((entry: any) => entry.Id === id);
}

function setSinglePoint(value: any, sample: number) {
  value.Timestamps = ["2026-08-15T00:01:00Z"];
  value.Values = [sample];
}

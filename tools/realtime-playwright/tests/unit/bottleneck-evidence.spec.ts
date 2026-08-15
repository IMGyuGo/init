import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
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
      mutate(value);
      expect(normalizeEcsTaskEvidence(value)).toEqual({ taskAnomaly: true, evidenceComplete: true });
      expect(JSON.stringify(normalizeEcsTaskEvidence(value))).not.toMatch(/taskArn|containerArn/i);
    }
  });

  test("does not infer a healthy task state from incomplete evidence", () => {
    const value = readJson("ecs-task-evidence.json");
    delete value.after.rolloutState;

    const evidence = normalizeBottleneckEvidence({ ...fixtureInput(), ecsTaskEvidence: value });

    expect(evidence.aggregate.ecsApi.taskAnomaly).toBeNull();
    expect(evidence.missingMetrics).toContainEqual({
      metric: "ecsApi.taskAnomaly",
      reason: "ECS_TASK_EVIDENCE_INCOMPLETE",
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

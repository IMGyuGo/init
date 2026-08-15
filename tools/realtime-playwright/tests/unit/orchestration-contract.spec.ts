import { expect, test } from "@playwright/test";

import {
  buildCloudWatchMetricQuery,
  buildHostCommand,
  buildStagePlan,
} from "../../src/orchestration-contract.mjs";

test.describe("distributed orchestration contract", () => {
  test("builds a token-free host argument array", () => {
    const command = buildHostCommand({
      runId: "run-20260802-1100",
      stageUsers: 25,
      assignedUsers: 2,
      attempt: 1,
      startAtEpoch: 1_785_639_600,
    });

    expect(command).toEqual([
      "sudo",
      "env",
      "PLAYWRIGHT_RENDER_MODE=render-lite",
      "/usr/local/bin/run-playwright-loadtest",
      "--run-id", "run-20260802-1100",
      "--stage-users", "25",
      "--assigned-users", "2",
      "--attempt", "1",
      "--start-at", "2026-08-02T03:00:00.000Z",
      "--hold-seconds", "150",
    ]);
    expect(JSON.stringify(command)).not.toMatch(/magicToken|applicationId|eyJ/i);
  });

  test("uses the approved 150-second render-lite canary and rejects unsafe command fields", () => {
    const canaryCommand = buildHostCommand({
      runId: "run-20260802-canary",
      stageUsers: 1,
      assignedUsers: 1,
      attempt: 1,
      startAtEpoch: 1_785_639_600,
    });
    expect(canaryCommand.slice(0, 4)).toEqual([
      "sudo", "env", "PLAYWRIGHT_RENDER_MODE=render-lite", "/usr/local/bin/run-playwright-loadtest",
    ]);
    expect(canaryCommand.slice(-2)).toEqual(["--hold-seconds", "150"]);
    expect(() => buildHostCommand({
      runId: "run-safe;curl bad",
      stageUsers: 15,
      assignedUsers: 1,
      attempt: 1,
      startAtEpoch: 1_785_639_600,
    })).toThrow("run id");
    expect(() => buildHostCommand({
      runId: "run-20260802",
      stageUsers: 201,
      assignedUsers: 1,
      attempt: 1,
      startAtEpoch: 1_785_639_600,
    })).toThrow("approved stage");
  });

  test("maps twenty stable Terraform instances to deterministic stage allocation", () => {
    const instances = Object.fromEntries(Array.from({ length: 20 }, (_, index) => {
      const key = String(index + 1).padStart(2, "0");
      return [key, {
        instance_id: `i-${key}`,
        instance_index: index + 1,
        row_start: index * 10 + 1,
        row_end: (index + 1) * 10,
      }];
    }));

    const plan = buildStagePlan({ stageUsers: 50, instances });
    expect(plan).toHaveLength(20);
    expect(plan.slice(0, 10).map((host) => host.assignedUsers)).toEqual(Array(10).fill(3));
    expect(plan.slice(10).map((host) => host.assignedUsers)).toEqual(Array(10).fill(2));
    expect(plan[0]).toMatchObject({ index: 1, instanceId: "i-01", rowStart: 1, rowEnd: 10 });
    expect(() => buildStagePlan({ stageUsers: 50, instances: { ...instances, "20": instances["19"] } }))
      .toThrow("duplicate instance index");
  });

  test("declares ALB and ECS metrics needed for a stage window", () => {
    const query = buildCloudWatchMetricQuery({
      start: "2026-08-02T02:00:00Z",
      end: "2026-08-02T02:05:00Z",
      albArnSuffix: "app/init-main/abc",
      apiTargetGroupArnSuffix: "targetgroup/init-main-api/def",
      clusterName: "init-main",
      serviceNames: { api: "init-main-api", frontend: "init-main-frontend", worker: "init-main-worker" },
    });

    expect(query.metrics.map((metric) => metric.name)).toEqual(expect.arrayContaining([
      "RequestCount",
      "TargetResponseTime",
      "HTTPCode_Target_5XX_Count",
      "CPUUtilization",
      "MemoryUtilization",
    ]));
    expect(query.start).toBe("2026-08-02T02:00:00.000Z");
    expect(query.end).toBe("2026-08-02T02:05:00.000Z");
    const ecsMetrics = query.metrics.filter((metric) => metric.namespace === "AWS/ECS");
    expect(ecsMetrics.map((metric) => [metric.id, metric.stat])).toEqual([
      ["api_cpu_average", "Average"],
      ["api_cpu_maximum", "Maximum"],
      ["api_memory_average", "Average"],
      ["api_memory_maximum", "Maximum"],
      ["frontend_cpu_average", "Average"],
      ["frontend_cpu_maximum", "Maximum"],
      ["frontend_memory_average", "Average"],
      ["frontend_memory_maximum", "Maximum"],
      ["worker_cpu_average", "Average"],
      ["worker_cpu_maximum", "Maximum"],
      ["worker_memory_average", "Average"],
      ["worker_memory_maximum", "Maximum"],
    ]);
  });

});

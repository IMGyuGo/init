import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { normalizeBottleneckEvidence } from "../../src/bottleneck-evidence.mjs";
import { main as planCloudWatchImages } from "../../scripts/plan-cloudwatch-evidence-images.mjs";
import {
  normalizeCloudWatchImageEvidence,
  planCloudWatchEvidenceImages,
} from "../../src/cloudwatch-evidence-images.mjs";

const STARTED_AT_UTC = "2026-08-15T00:00:00.000Z";
const ENDED_AT_UTC = "2026-08-15T00:03:00.000Z";
const DIMENSIONS = {
  clusterName: "init-main",
  serviceNames: {
    api: "init-main-api",
    frontend: "init-main-frontend",
    worker: "init-main-worker",
  },
  loadBalancer: "app/init-main/0123456789abcdef",
  targetGroup: "targetgroup/init-main-api/0123456789abcdef",
};

test.describe("CloudWatch evidence image planning", () => {
  test("does not request an AWS image for a normal stage", () => {
    expect(planCloudWatchEvidenceImages(input(normalEvidence()))).toEqual([]);
  });

  test("requests the six-line ECS resource widget for warning utilization", () => {
    const evidence = normalEvidence();
    evidence.aggregate.ecsServices.api.memory.maximumPercent = 80;
    evidence.aggregate.ecsServices.api.memory.status = "WARNING";
    evidence.aggregate.ecsServices.api.status = "WARNING";

    const requests = planCloudWatchEvidenceImages(input(evidence));

    expect(requests).toHaveLength(1);
    expect(requests[0].fileName).toBe("ecs-resource-utilization.png");
    expect(requests[0].widget).toMatchObject({
      width: 1600,
      height: 800,
      period: 60,
      view: "timeSeries",
      start: "2026-08-14T23:55:00.000Z",
      end: "2026-08-15T00:08:00.000Z",
    });
    expect(requests[0].widget.metrics).toHaveLength(6);
    expect(requests[0].widget.annotations.horizontal.map((item: any) => item.value)).toEqual([80, 90, 99]);
    expect(JSON.stringify(requests[0].widget)).not.toMatch(/accountId|arn:|token|https?:\/\//i);
  });

  test("requests both approved widgets when server failure evidence exists", () => {
    const evidence = normalEvidence();
    evidence.aggregate.serverFailureEvidence = {
      detected: true,
      reasons: ["ALB_TARGET_CONNECTION_ERROR"],
      albTarget5xx: 0,
      targetConnectionErrors: 1,
      ecsTaskAnomaly: false,
    };

    const requests = planCloudWatchEvidenceImages(input(evidence));

    expect(requests.map((item: any) => item.fileName)).toEqual([
      "ecs-resource-utilization.png",
      "server-failure-signals.png",
    ]);
    expect(requests[1].widget.metrics).toHaveLength(3);
    expect(requests[1].widget.metrics[2].at(-1)).toMatchObject({ yAxis: "right", stat: "p95" });
  });

  test("normalizes successful and failed image metadata without free-form errors", () => {
    const value = [
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

    expect(normalizeCloudWatchImageEvidence(value)).toEqual(value);
    expect(() => normalizeCloudWatchImageEvidence([{ ...value[0], sha256: "ABC" }])).toThrow("invalid CloudWatch image evidence");
    expect(() => normalizeCloudWatchImageEvidence([{ ...value[0], localPath: "D:/secret.png" }])).toThrow("invalid CloudWatch image evidence");
    expect(() => normalizeCloudWatchImageEvidence([{ ...value[0], fileName: "unknown.png" }])).toThrow("invalid CloudWatch image evidence");
    expect(() => normalizeCloudWatchImageEvidence([{ ...value[1], error: "credential leaked" }])).toThrow("invalid CloudWatch image evidence");
  });

  test("CLI normalizes raw evidence and writes the safe widget plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "cloudwatch-image-plan-"));
    try {
      const fixture = resolve("tests/fixtures/bottleneck/stage-50");
      const raw = readJson("cloudwatch-raw.json");
      raw.MetricDataResults.find((metric: any) => metric.Id === "worker_cpu_maximum").Values = [80, 80, 80];
      const rawPath = join(root, "cloudwatch-raw.json");
      const dimensionsPath = join(root, "dimensions.json");
      const outputPath = join(root, "cloudwatch-image-requests.json");
      writeFileSync(rawPath, JSON.stringify(raw), "utf8");
      writeFileSync(dimensionsPath, JSON.stringify(DIMENSIONS), "utf8");
      const stderr: string[] = [];

      const exitCode = await planCloudWatchImages([
        `--started-at=${STARTED_AT_UTC}`,
        `--ended-at=${ENDED_AT_UTC}`,
        `--cloudwatch-raw=${rawPath}`,
        `--ecs-task-evidence=${join(fixture, "ecs-task-evidence.json")}`,
        `--dimensions=${dimensionsPath}`,
        `--output=${outputPath}`,
      ], { log: () => {}, error: (value: string) => stderr.push(value) });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(JSON.parse(readFileSync(outputPath, "utf8")).map((item: any) => item.fileName)).toEqual([
        "ecs-resource-utilization.png",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function input(evidence: any) {
  return {
    evidence,
    dimensions: DIMENSIONS,
    startedAtUtc: STARTED_AT_UTC,
    endedAtUtc: ENDED_AT_UTC,
  };
}

function normalEvidence() {
  return normalizeBottleneckEvidence({
    cloudWatchRaw: readJson("cloudwatch-raw.json"),
    ecsTaskEvidence: readJson("ecs-task-evidence.json"),
    startedAtUtc: STARTED_AT_UTC,
    endedAtUtc: ENDED_AT_UTC,
  });
}

function readJson(name: string) {
  const directory = resolve("tests/fixtures/bottleneck/stage-50");
  return JSON.parse(readFileSync(join(directory, name), "utf8"));
}

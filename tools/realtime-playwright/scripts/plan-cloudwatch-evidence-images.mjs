#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeBottleneckEvidence } from "../src/bottleneck-evidence.mjs";
import { planCloudWatchEvidenceImages } from "../src/cloudwatch-evidence-images.mjs";

export async function main(argv = process.argv.slice(2), io = console) {
  try {
    const args = parseArgs(argv);
    const output = resolve(args.output);
    if (existsSync(output)) throw errorWithCode("CLOUDWATCH_IMAGE_PLAN_OUTPUT_EXISTS");
    const evidence = normalizeBottleneckEvidence({
      cloudWatchRaw: readJson(args.cloudwatchRaw),
      ecsTaskEvidence: readJson(args.ecsTaskEvidence),
      startedAtUtc: args.startedAt,
      endedAtUtc: args.endedAt,
    });
    const requests = planCloudWatchEvidenceImages({
      evidence,
      dimensions: readJson(args.dimensions),
      startedAtUtc: args.startedAt,
      endedAtUtc: args.endedAt,
    });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(requests, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    io.log(JSON.stringify({ status: "CLOUDWATCH_IMAGE_PLAN_WRITTEN", imageCount: requests.length }));
    return 0;
  } catch (error) {
    io.error(JSON.stringify({ error: error?.code ?? "CLOUDWATCH_IMAGE_PLAN_FAILED" }));
    return 1;
  }
}

function parseArgs(argv) {
  const names = new Set([
    "started-at", "ended-at", "cloudwatch-raw", "ecs-task-evidence", "dimensions", "output",
  ]);
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || !names.has(match[1]) || values.has(match[1])) throw new Error("invalid arguments");
    values.set(match[1], match[2]);
  }
  if (values.size !== names.size) throw new Error("missing arguments");
  return {
    startedAt: values.get("started-at"),
    endedAt: values.get("ended-at"),
    cloudwatchRaw: values.get("cloudwatch-raw"),
    ecsTaskEvidence: values.get("ecs-task-evidence"),
    dimensions: values.get("dimensions"),
    output: values.get("output"),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}

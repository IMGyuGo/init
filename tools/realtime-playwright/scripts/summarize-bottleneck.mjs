#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeBottleneckEvidence } from "../src/bottleneck-evidence.mjs";
import { assertPngSize, buildStageChartHtml } from "../src/bottleneck-chart.mjs";
import {
  buildBottleneckSummary,
  markPngRenderFailure,
  renderBottleneckMarkdown,
} from "../src/bottleneck-summary.mjs";

const FILENAMES = ["bottleneck-summary.json", "bottleneck-summary.md", "bottleneck-summary.png"];

export async function main(argv = process.argv.slice(2), io = console) {
  let output;
  let temporaryPng;
  try {
    const args = parseArgs(argv);
    output = resolve(args.output);
    const paths = Object.fromEntries(FILENAMES.map((name) => [name, join(output, name)]));
    if (FILENAMES.some((name) => existsSync(paths[name]))) throw errorWithCode("BOTTLENECK_OUTPUT_EXISTS");

    const report = buildBottleneckSummary({
      runId: args.runId,
      stage: args.stage,
      attempt: args.attempt,
      startedAtUtc: args.startedAt,
      endedAtUtc: args.endedAt,
      api: readJson(args.apiSummary),
      browser: readJson(args.browserSummary),
      hybridVerdict: readJson(args.hybridStage).verdict,
      cloudWatchImages: readJson(args.cloudWatchImages),
      evidence: normalizeBottleneckEvidence({
        cloudWatchRaw: readJson(args.cloudwatchRaw),
        ecsTaskEvidence: readJson(args.ecsTaskEvidence),
        startedAtUtc: args.startedAt,
        endedAtUtc: args.endedAt,
      }),
    });

    mkdirSync(output, { recursive: true });
    temporaryPng = join(output, "bottleneck-summary.png.tmp");
    try {
      await renderPng(buildStageChartHtml(report), temporaryPng);
      assertPngSize(readFileSync(temporaryPng));
    } catch {
      rmSync(temporaryPng, { force: true });
      const failedReport = markPngRenderFailure(report);
      writeTextArtifacts(paths, failedReport);
      io.error(JSON.stringify({ error: "BOTTLENECK_PNG_FAILED" }));
      return 1;
    }

    writeTextArtifacts(paths, report);
    renameSync(temporaryPng, paths["bottleneck-summary.png"]);
    io.log(JSON.stringify({
      status: "BOTTLENECK_SUMMARY_WRITTEN",
      stage: report.summary.stage,
      attempt: report.summary.attempt,
      verdict: report.summary.verdict,
    }));
    return 0;
  } catch (error) {
    if (temporaryPng) rmSync(temporaryPng, { force: true });
    io.error(JSON.stringify({ error: error?.code ?? "BOTTLENECK_SUMMARY_FAILED" }));
    return 1;
  }
}

async function renderPng(html, path) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path, type: "png", clip: { x: 0, y: 0, width: 1600, height: 1200 } });
  } finally {
    await browser.close();
  }
}

function writeTextArtifacts(paths, report) {
  writeFileSync(paths["bottleneck-summary.json"], `${JSON.stringify(report.summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  writeFileSync(paths["bottleneck-summary.md"], renderBottleneckMarkdown(report), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

function parseArgs(argv) {
  const names = new Set([
    "run-id", "stage", "attempt", "started-at", "ended-at", "api-summary", "browser-summary",
    "cloudwatch-raw", "ecs-task-evidence", "hybrid-stage", "cloudwatch-images", "output",
  ]);
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || !names.has(match[1]) || values.has(match[1])) throw new Error("invalid arguments");
    values.set(match[1], match[2]);
  }
  if (values.size !== names.size) throw new Error("missing arguments");
  const stage = Number(values.get("stage"));
  const attempt = Number(values.get("attempt"));
  return {
    runId: values.get("run-id"),
    stage,
    attempt,
    startedAt: values.get("started-at"),
    endedAt: values.get("ended-at"),
    apiSummary: values.get("api-summary"),
    browserSummary: values.get("browser-summary"),
    cloudwatchRaw: values.get("cloudwatch-raw"),
    ecsTaskEvidence: values.get("ecs-task-evidence"),
    hybridStage: values.get("hybrid-stage"),
    cloudWatchImages: values.get("cloudwatch-images"),
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

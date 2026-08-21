#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertPngSize, buildComparisonChartHtml } from "../src/bottleneck-chart.mjs";
import { buildFinalBottleneckReport } from "../src/bottleneck-final.mjs";

const FILENAMES = ["bottleneck-final.md", "stage-comparison.png"];

export async function main(argv = process.argv.slice(2), io = console) {
  let temporaryPng;
  try {
    const args = parseArgs(argv);
    const output = resolve(args.output);
    const markdownPath = join(output, FILENAMES[0]);
    const pngPath = join(output, FILENAMES[1]);
    if (existsSync(markdownPath) || existsSync(pngPath)) throw errorWithCode("BOTTLENECK_FINAL_OUTPUT_EXISTS");
    const result = buildFinalBottleneckReport({
      runId: args.runId,
      bucket: args.bucket,
      stages: [readJson(args.stage50), readJson(args.stage100), readJson(args.stage200)],
    });
    mkdirSync(output, { recursive: true });
    temporaryPng = join(output, "stage-comparison.png.tmp");
    await renderPng(buildComparisonChartHtml({ runId: args.runId, comparison: result.comparison }), temporaryPng);
    assertPngSize(readFileSync(temporaryPng));
    writeFileSync(markdownPath, result.markdown, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporaryPng, pngPath);
    io.log(JSON.stringify({ status: "BOTTLENECK_FINAL_WRITTEN", stages: [50, 100, 200] }));
    return 0;
  } catch (error) {
    if (temporaryPng) rmSync(temporaryPng, { force: true });
    io.error(JSON.stringify({ error: error?.code ?? "BOTTLENECK_FINAL_FAILED" }));
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

function parseArgs(argv) {
  const names = new Set(["run-id", "bucket", "stage-50", "stage-100", "stage-200", "output"]);
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([a-z0-9-]+)=(.+)$/.exec(argument);
    if (!match || !names.has(match[1]) || values.has(match[1])) throw new Error("invalid arguments");
    values.set(match[1], match[2]);
  }
  if (values.size !== names.size) throw new Error("missing arguments");
  return {
    runId: values.get("run-id"),
    bucket: values.get("bucket"),
    stage50: values.get("stage-50"),
    stage100: values.get("stage-100"),
    stage200: values.get("stage-200"),
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

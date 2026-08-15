import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { allocateStage } from "./stage-allocation.mjs";

export function summarizeVirtualUsers(results) {
  const readyValues = results.map((result) => finiteNonNegative(result.readyMs)).filter((value) => value !== null);
  const holdValues = results.map((result) => finiteNonNegative(result.heldMs)).filter((value) => value !== null);
  return {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status !== "passed").length,
    api4xx: sum(results, "api4xx"),
    api5xx: sum(results, "api5xx"),
    connectionDrops: sum(results, "connectionDrops"),
    pageErrors: sum(results, "pageErrors"),
    requestFailures: sum(results, "requestFailures"),
    consoleErrors: sum(results, "consoleErrors"),
    readyP50Ms: percentile(readyValues, 50),
    readyP95Ms: percentile(readyValues, 95),
    readyP99Ms: percentile(readyValues, 99),
    readyMaxMs: readyValues.length > 0 ? Math.max(...readyValues) : null,
    minimumHeldMs: holdValues.length > 0 ? Math.min(...holdValues) : null,
  };
}

/** 다운로드한 run prefix를 읽되, 개별 식별자 대신 집계값만 반환한다. */
export async function summarizeRunDirectory(inputDirectory, options = {}) {
  const root = resolve(inputDirectory);
  const runId = options.runId ?? "run-local-summary";
  if (!/^run-[a-z0-9][a-z0-9_-]{0,59}$/.test(runId)) throw new Error("run id is invalid");
  const files = await walkFiles(root);
  const groups = new Map();
  const metricsByStage = new Map();
  const windows = await readStageWindows(root, runId);

  for (const window of windows) {
    const key = `${window.stageUsers}:${window.attempt}`;
    if (groups.has(key)) throw new Error("duplicate stage window");
    groups.set(key, newStageGroup(window.stageUsers, window.attempt, window));
  }

  for (const file of files) {
    const metricLocation = parseMetricLocation(relative(root, file));
    if (metricLocation) {
      const payload = JSON.parse(await readFile(file, "utf8"));
      metricsByStage.set(
        `${metricLocation.users}:${metricLocation.attempt}`,
        summarizeCloudWatchMetrics(payload.MetricDataResults ?? payload.metricDataResults ?? []),
      );
      continue;
    }
    const location = parseArtifactLocation(relative(root, file));
    if (!location) continue;
    const key = `${location.users}:${location.attempt}`;
    const group = groups.get(key) ?? newStageGroup(location.users, location.attempt, null);
    group.hosts.add(location.instance);
    if (location.kind === "result") {
      group.results.push(JSON.parse(await readFile(file, "utf8")));
    } else if (location.kind === "resource") {
      group.resourceFiles.push(file);
    }
    groups.set(key, group);
  }

  const stages = [];
  for (const group of groups.values()) {
    assertUniqueVirtualUsers(group.results);
    const summary = summarizeVirtualUsers(group.results);
    const constraints = [];
    for (const resourceFile of group.resourceFiles) {
      const constraint = detectGeneratorConstraint(parseNdjson(await readFile(resourceFile, "utf8")));
      if (constraint.constrained) constraints.push(constraint.reason);
    }
    const allocation = allocateStage(group.users, 20, 10);
    const expectedHosts = allocation.filter((assigned) => assigned > 0).length;
    const expectedHostNames = new Set(allocation
      .map((assigned, index) => assigned > 0 ? `instance-${String(index + 1).padStart(2, "0")}` : null)
      .filter(Boolean));
    const expectedVuIds = new Set(allocation.flatMap((assigned, instanceIndex) =>
      Array.from({ length: assigned }, (_, rowIndex) =>
        `vu-${String(instanceIndex * 10 + rowIndex + 1).padStart(3, "0")}`)));
    const actualVuIds = new Set(group.results.map((result) => result.vu ?? result.vuId));
    const hostCoverageComplete = setsEqual(expectedHostNames, group.hosts);
    const vuCoverageComplete = setsEqual(expectedVuIds, actualVuIds);
    const generatorReasons = [...new Set(constraints)].sort();
    const cloudWatchMetrics = metricsByStage.get(`${group.users}:${group.attempt}`) ?? [];
    const requiredServerMetricIds = ["api_target_5xx", "alb_target_connection_errors"];
    const cloudWatchMetricIncomplete = requiredServerMetricIds.some((requiredId) => {
      const metric = cloudWatchMetrics.find((candidate) => candidate.id === requiredId);
      return !metric || metric.status !== "Complete";
    });
    const cloudWatchServerFailure = cloudWatchMetrics.some((metric) =>
      requiredServerMetricIds.includes(metric.id)
      && (metric.sum ?? 0) > 0);
    const stageWindowPresent = group.window !== null;
    const orchestrationSuccess = group.window?.success === true;
    const verdict = evaluateStage(summary, {
      expectedUsers: group.users,
      expectedHosts,
      reportedHosts: group.hosts.size,
      generatorConstrained: generatorReasons.length > 0,
      hostCoverageComplete,
      vuCoverageComplete,
      orchestrationSuccess,
      cloudWatchServerFailure,
      cloudWatchMetricIncomplete,
    });
    stages.push({
      users: group.users,
      attempt: group.attempt,
      expectedHosts,
      reportedHosts: group.hosts.size,
      hostCoverageComplete,
      vuCoverageComplete,
      stageWindowPresent,
      orchestrationSuccess,
      failureCode: group.window?.failureCode ?? (stageWindowPresent ? null : "STAGE_WINDOW_MISSING"),
      ...summary,
      generatorConstrained: generatorReasons.length > 0,
      generatorReasons,
      cloudWatchServerFailure,
      cloudWatchMetricIncomplete,
      cloudWatchMetrics,
      virtualUsers: summarizeVirtualUserEvidence(group.results),
      verdict,
    });
  }
  stages.sort((left, right) => left.users - right.users || left.attempt - right.attempt);
  return {
    schemaVersion: "PLAYWRIGHT_LOADTEST_SUMMARY_V1",
    runId,
    stages,
  };
}

export function renderSummaryMarkdown(summary) {
  const lines = [
    `# Playwright 부하 테스트 결과: ${summary.runId}`,
    "",
    "| 사용자 | 전체 | 성공 | 실패 | 판정 |",
    "| ---: | ---: | ---: | ---: | --- |",
  ];
  for (const stage of summary.stages) {
    lines.push(`| ${stage.users} | ${stage.total} | ${stage.passed} | ${stage.failed} | ${stage.verdict} |`);
  }
  lines.push("", "## 단계 상세", "");
  for (const stage of summary.stages) {
    lines.push(
      `- ${stage.users}명 / 시도 ${stage.attempt}: ready p50 ${displayMs(stage.readyP50Ms)}, p95 ${displayMs(stage.readyP95Ms)}, p99 ${displayMs(stage.readyP99Ms)}, 5xx ${stage.api5xx}, 연결 끊김 ${stage.connectionDrops}, request 실패 ${stage.requestFailures}, page/console 오류 ${stage.pageErrors}/${stage.consoleErrors}, host ${stage.reportedHosts}/${stage.expectedHosts}`,
    );
    if (stage.generatorReasons.length > 0) {
      lines.push(`  - 부하 발생기 제약: ${stage.generatorReasons.join(", ")}`);
    }
    if (!stage.orchestrationSuccess) {
      lines.push(`  - 실행 제어 실패: ${stage.failureCode ?? "STAGE_ORCHESTRATION_FAILED"}`);
    }
    const headlineMetrics = stage.cloudWatchMetrics.filter((metric) => [
      "alb_request_count",
      "api_target_response_time_p95",
      "api_target_4xx",
      "api_target_5xx",
      "api_cpu",
      "api_memory",
    ].includes(metric.id));
    if (headlineMetrics.length > 0) {
      lines.push(`  - CloudWatch: ${headlineMetrics.map((metric) => `${metric.id} max=${metric.max ?? "n/a"} sum=${metric.sum ?? "n/a"}`).join(", ")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function evaluateStage(summary, options = {}) {
  const expectedUsers = options.expectedUsers ?? summary.total;
  const readyLimitMs = options.readyLimitMs ?? 90_000;
  const missingHost = options.expectedHosts !== undefined
    && options.reportedHosts !== undefined
    && options.expectedHosts !== options.reportedHosts;

  // 기능 실패가 generator 제약보다 우선이다. 서버 실패를 단순 부하 발생기 한계로 오판하지 않는다.
  const failed = summary.total !== expectedUsers
    || summary.passed !== summary.total
    || summary.failed > 0
    || summary.api5xx > 0
    || summary.connectionDrops > 0
    || summary.readyMaxMs === null
    || summary.readyMaxMs > readyLimitMs
    || missingHost
    || options.hostCoverageComplete === false
    || options.vuCoverageComplete === false
    || options.orchestrationSuccess === false
    || options.cloudWatchServerFailure === true
    || options.cloudWatchMetricIncomplete === true;
  if (failed) return "FAILED";
  if (options.generatorConstrained) return "GENERATOR_CONSTRAINED";
  return "PASSED";
}

export function detectGeneratorConstraint(samples) {
  let consecutiveCpu = 0;
  let consecutiveMemory = 0;
  let consecutiveLoad = 0;

  for (const sample of samples) {
    if (sample.oomKilled === true) return { constrained: true, reason: "OOM_KILLED" };
    if (Number(sample.chromiumCrashCount) > 0) return { constrained: true, reason: "CHROMIUM_CRASH" };

    consecutiveCpu = Number(sample.cpuPercent) >= 90 ? consecutiveCpu + 1 : 0;
    consecutiveMemory = Number(sample.availableMemoryMiB) < 768 ? consecutiveMemory + 1 : 0;
    consecutiveLoad = Number(sample.load1) > 4 ? consecutiveLoad + 1 : 0;
    if (consecutiveCpu >= 3) return { constrained: true, reason: "CPU_90_PERCENT_3_CONSECUTIVE" };
    if (consecutiveMemory >= 3) {
      return { constrained: true, reason: "AVAILABLE_MEMORY_BELOW_768_MIB_3_CONSECUTIVE" };
    }
    if (consecutiveLoad >= 3) return { constrained: true, reason: "LOAD1_ABOVE_4_3_CONSECUTIVE" };
  }

  return { constrained: false, reason: null };
}

export function percentile(values, requestedPercentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const position = (requestedPercentile / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  return Math.round(lower + (upper - lower) * (position - lowerIndex));
}

function sum(results, key) {
  return results.reduce((total, result) => total + (finiteNonNegative(result[key]) ?? 0), 0);
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function parseArtifactLocation(relativePath) {
  const parts = relativePath.split(sep);
  let users;
  let attemptPart;
  let instance;
  let remainder;
  if (parts[0] === "canary") {
    users = 1;
    [attemptPart, instance, ...remainder] = parts.slice(1);
  } else if (parts[0] === "stages" && /^\d+$/.test(parts[1] ?? "")) {
    users = Number(parts[1]);
    [attemptPart, instance, ...remainder] = parts.slice(2);
  } else {
    return null;
  }
  const attemptMatch = /^attempt-([1-9]\d*)$/.exec(attemptPart ?? "");
  if (!attemptMatch || !/^instance-(0[1-9]|1\d|20)$/.test(instance ?? "")) return null;
  const attempt = Number(attemptMatch[1]);
  const joined = remainder.join("/");
  if (/^virtual-users\/vu-\d{3}\/result\.json$/.test(joined)) {
    return { users, attempt, instance, kind: "result" };
  }
  if (joined === "resource-samples.ndjson") {
    return { users, attempt, instance, kind: "resource" };
  }
  return null;
}

function parseMetricLocation(relativePath) {
  const normalized = relativePath.split(sep).join("/");
  const match = /^metrics\/stage-(1|15|25|50|100|200)-attempt-([1-9]\d*)\.json$/.exec(normalized);
  if (!match) return null;
  return { users: Number(match[1]), attempt: Number(match[2]) };
}

async function readStageWindows(root, runId) {
  const manifestPath = resolve(root, "control", "stage-windows.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return [];
    throw error;
  }
  if (manifest?.schemaVersion !== "PLAYWRIGHT_LOADTEST_WINDOWS_V1") {
    throw new Error("stage window manifest version is invalid");
  }
  if (manifest.runId !== runId) throw new Error("stage window manifest run id does not match");
  if (!Array.isArray(manifest.windows)) throw new Error("stage window manifest windows are invalid");

  const seen = new Set();
  return manifest.windows.map((window) => {
    const stageUsers = Number(window?.stageUsers);
    const attempt = Number(window?.attempt);
    const activeHosts = Number(window?.activeHosts);
    if (![1, 15, 25, 50, 100, 200].includes(stageUsers)) throw new Error("stage window users are invalid");
    if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("stage window attempt is invalid");
    if (!Number.isSafeInteger(activeHosts) || activeHosts < 0 || activeHosts > 20) {
      throw new Error("stage window active hosts are invalid");
    }
    if (typeof window.success !== "boolean") throw new Error("stage window success is invalid");
    const start = new Date(window.start);
    const end = new Date(window.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error("stage window time range is invalid");
    }
    if (window.failureCode !== undefined && window.failureCode !== null
      && (typeof window.failureCode !== "string" || !/^[A-Z0-9_]{1,64}$/.test(window.failureCode))) {
      throw new Error("stage window failure code is invalid");
    }
    const key = `${stageUsers}:${attempt}`;
    if (seen.has(key)) throw new Error("duplicate stage window");
    seen.add(key);
    return {
      stageUsers,
      attempt,
      activeHosts,
      success: window.success,
      failureCode: window.failureCode ?? null,
    };
  });
}

function newStageGroup(users, attempt, window) {
  return {
    users,
    attempt,
    window,
    results: [],
    hosts: new Set(),
    resourceFiles: [],
  };
}

function summarizeVirtualUserEvidence(results) {
  return results.map((result) => {
    const vu = result?.vu ?? result?.vuId;
    const failureCode = typeof result?.failureCode === "string" && /^[A-Z0-9_]{1,64}$/.test(result.failureCode)
      ? result.failureCode
      : null;
    const evidence = {};
    for (const key of ["ready", "completed", "failure", "video"]) {
      const path = result?.evidence?.[key];
      if (typeof path === "string" && /^virtual-users\/vu-\d{3}\/[a-z0-9.-]+$/.test(path)) evidence[key] = path;
    }
    return {
      vu,
      status: result?.status === "passed" ? "passed" : "failed",
      failureCode,
      evidence,
    };
  }).sort((left, right) => left.vu.localeCompare(right.vu));
}

function summarizeCloudWatchMetrics(results) {
  return results.map((result) => {
    const id = result.Id ?? result.id;
    if (typeof id !== "string" || !/^[a-z][a-z0-9_]{0,254}$/.test(id)) {
      throw new Error("CloudWatch result contains an invalid metric id");
    }
    const values = (result.Values ?? result.values ?? [])
      .map(Number)
      .filter((value) => Number.isFinite(value));
    return {
      id,
      status: result.StatusCode ?? result.statusCode ?? null,
      samples: values.length,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      average: values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
      sum: values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0)) : null,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function assertUniqueVirtualUsers(results) {
  const seen = new Set();
  for (const result of results) {
    const vu = result?.vu ?? result?.vuId;
    if (typeof vu !== "string" || !/^vu-\d{3}$/.test(vu)) throw new Error("result contains an invalid VU id");
    if (seen.has(vu)) throw new Error("duplicate VU id in stage results");
    seen.add(vu);
  }
}

function parseNdjson(value) {
  return value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function displayMs(value) {
  return value === null ? "n/a" : `${value}ms`;
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

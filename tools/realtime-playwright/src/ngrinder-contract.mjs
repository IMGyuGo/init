import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { buildHybridAllocation } from "./hybrid-allocation.mjs";
import { percentile } from "./result-summary.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RUN_ID_PATTERN = /^run-[a-z0-9][a-z0-9_-]{0,59}$/;
const STAGE_API_USERS = new Map([[1, 1], [50, 45], [100, 95], [200, 195]]);
const ROUTE_KEYS = Object.freeze([
  "APPLICATION_STATUS",
  "INTERVIEW_START",
  "INTERVIEW_RUNTIME",
  "INTERVIEW_QUESTIONS",
  "DEVICE_CHECK",
  "INTERVIEW_BEGIN",
]);
const EXPECTED_PARTITION_NAMES = Object.freeze(
  Array.from({ length: 20 }, (_, index) => `instance-${String(index + 1).padStart(2, "0")}.csv`),
);

export function parseFixturePartitions(directory) {
  try {
    const names = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    if (JSON.stringify(names) !== JSON.stringify(EXPECTED_PARTITION_NAMES)) throw new Error("names");

    const rows = [];
    for (const [partitionIndex, name] of EXPECTED_PARTITION_NAMES.entries()) {
      const lines = readFileSync(join(directory, name), "utf8").split(/\r?\n/);
      while (lines.at(-1) === "") lines.pop();
      if (lines[0] !== "applicationId,magicToken" || lines.length !== 11) throw new Error("shape");
      for (const [rowIndex, line] of lines.slice(1).entries()) {
        const columns = line.split(",");
        if (columns.length !== 2) throw new Error("columns");
        const [applicationId, magicToken] = columns;
        if (!isApplicationId(applicationId) || !TOKEN_PATTERN.test(magicToken)) throw new Error("value");
        rows.push({
          ordinal: partitionIndex * 10 + rowIndex + 1,
          applicationId,
          magicToken,
        });
      }
    }
    return rows;
  } catch {
    throw new Error("fixture partitions are invalid");
  }
}

export function buildNgrinderStageCsv(rows, totalUsers) {
  const apiUsers = STAGE_API_USERS.get(totalUsers);
  if (!apiUsers) throw new Error("nGrinder stage must be canary, 50, 100, or 200");
  assertCompleteFixtureRows(rows);

  const ordinals = totalUsers === 1
    ? [2]
    : buildHybridAllocation(totalUsers).apiOrdinals;
  const byOrdinal = new Map(rows.map((row) => [row.ordinal, row]));
  const selected = ordinals.map((ordinal) => byOrdinal.get(ordinal));
  if (selected.length !== apiUsers || selected.some((row) => !row)) {
    throw new Error("fixture ordinals must cover 1 through 200 exactly once");
  }
  return [
    "ordinal,applicationId,magicToken",
    ...selected.map((row) => `${row.ordinal},${row.applicationId},${row.magicToken}`),
    "",
  ].join("\n");
}

export function buildNgrinderPerfTestPayload({ runId, totalUsers, scheduledTime } = {}) {
  const apiUsers = STAGE_API_USERS.get(totalUsers);
  const scheduled = new Date(scheduledTime);
  if (!RUN_ID_PATTERN.test(runId ?? "") || !apiUsers
    || typeof scheduledTime !== "string" || Number.isNaN(scheduled.getTime())
    || scheduled.toISOString() !== scheduledTime) {
    throw new Error("nGrinder performance test input is invalid");
  }
  return {
    testName: `${runId}-hybrid-${totalUsers}`,
    description: `Hybrid API stage ${totalUsers}`,
    status: "READY",
    threshold: "R",
    scm: "svn",
    scriptName: "hybrid/hybrid-interview.groovy",
    duration: 240_000,
    runCount: 5,
    agentCount: 1,
    processes: 1,
    threads: apiUsers,
    vuserPerAgent: apiUsers,
    useRampUp: false,
    ignoreSampleCount: 0,
    samplingInterval: 1,
    targetHosts: "init-jungle.cloud",
    scheduledTime,
    sendMail: false,
  };
}

export function buildNgrinderScriptSavePayload(source) {
  if (typeof source !== "string" || source.trim().length === 0
    || source.length > 500_000 || source.includes("\0")) {
    throw new Error("nGrinder script source is invalid");
  }
  return {
    fileEntry: {
      path: "hybrid/hybrid-interview.groovy",
      content: source,
      encoding: "UTF-8",
      description: "init-jungle hybrid interview API load test",
    },
    targetHosts: "init-jungle.cloud",
    validated: "0",
    createLibAndResource: false,
  };
}

export function normalizeNgrinderReport({ detail, csv, resourceSamples, vuResults, expectedUsers } = {}) {
  if (![1, 45, 95, 195].includes(expectedUsers)) {
    throw new Error("nGrinder report input is invalid");
  }
  const csvSummary = parseNgrinderCsv(csv);
  const detailSummary = parseNgrinderDetail(detail);
  const samples = parseGeneratorSamples(resourceSamples);
  const virtualUsers = parseVirtualUserResults(vuResults, expectedUsers);
  const tests = Math.max(csvSummary.tests, detailSummary.tests ?? 0);
  const errors = Math.max(csvSummary.errors, detailSummary.errors ?? 0);
  const failureReasons = [];

  if (detailSummary.status !== "FINISHED") failureReasons.push("NGRINDER_STATUS_NOT_FINISHED");
  if (tests !== expectedUsers * 5) failureReasons.push("NGRINDER_TEST_COUNT_MISMATCH");
  if (errors > 0) failureReasons.push("NGRINDER_REPORT_ERROR");
  if (!virtualUsers.coverageComplete) failureReasons.push("VU_COVERAGE_INCOMPLETE");
  if (!virtualUsers.allPassed) failureReasons.push("VU_RESULT_FAILED");
  if (!virtualUsers.runtimeSamplesComplete) failureReasons.push("VU_RUNTIME_SAMPLES_INCOMPLETE");
  if (virtualUsers.errorCountersNonzero) failureReasons.push("VU_ERROR_COUNTER_NONZERO");
  if (samples.length < 15) failureReasons.push("GENERATOR_SAMPLE_COVERAGE_INCOMPLETE");
  if (samples.some((sample) => !sample.controllerActive)) failureReasons.push("NGRINDER_CONTROLLER_INACTIVE");
  if (samples.some((sample) => !sample.agentActive)) failureReasons.push("NGRINDER_AGENT_INACTIVE");

  const generatorReasons = hasConsecutiveCpu(samples, 80, 3)
    ? ["CPU_80_PERCENT_3_CONSECUTIVE"]
    : [];
  const uniqueFailureReasons = [...new Set(failureReasons)];
  const verdict = uniqueFailureReasons.length > 0
    ? "FAILED"
    : generatorReasons.length > 0
      ? "GENERATOR_CONSTRAINED"
      : "PASSED";

  return {
    expectedUsers,
    reportedUsers: virtualUsers.reportedUsers,
    tests,
    errors,
    unexpected4xx: virtualUsers.unexpected4xx,
    server5xx: virtualUsers.server5xx,
    timeouts: virtualUsers.timeouts,
    connectionErrors: virtualUsers.connectionErrors,
    latencyMs: {
      p50: percentile(csvSummary.latencies, 50),
      p95: percentile(csvSummary.latencies, 95),
      p99: percentile(csvSummary.latencies, 99),
    },
    passedUsers: virtualUsers.passedUsers,
    failedUsers: virtualUsers.failedUsers,
    failureStages: virtualUsers.failureStages,
    routes: virtualUsers.routes,
    slowestRoute: virtualUsers.slowestRoute,
    slowestRouteP95Ms: virtualUsers.slowestRouteP95Ms,
    holdMs: virtualUsers.holdMs,
    runtimeSamplesComplete: virtualUsers.runtimeSamplesComplete,
    generatorReasons,
    failureReasons: uniqueFailureReasons,
    verdict,
  };
}

export function redactNgrinderValue(value, key = "") {
  if (/token|email|applicationid|sessionid/i.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactNgrinderValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redactNgrinderValue(childValue, childKey)]),
    );
  }
  if (typeof value !== "string") return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || TOKEN_PATTERN.test(value)) return "[REDACTED]";
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return value;
    for (const parameter of [...url.searchParams.keys()]) {
      if (/token/i.test(parameter)) url.searchParams.delete(parameter);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function assertCompleteFixtureRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 200) {
    throw new Error("fixture ordinals must cover 1 through 200 exactly once");
  }
  const ordinals = new Set(rows.map((row) => row?.ordinal));
  if (ordinals.size !== 200
    || rows.some((row, index) => row?.ordinal !== index + 1)) {
    throw new Error("fixture ordinals must cover 1 through 200 exactly once");
  }
  const applicationIds = new Set();
  const tokens = new Set();
  for (const row of rows) {
    if (!isApplicationId(row.applicationId) || !TOKEN_PATTERN.test(row.magicToken)
      || applicationIds.has(row.applicationId) || tokens.has(row.magicToken)) {
      throw new Error("fixture token rows are invalid");
    }
    applicationIds.add(row.applicationId);
    tokens.add(row.magicToken);
  }
}

function isApplicationId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function parseNgrinderCsv(csv) {
  if (typeof csv !== "string") throw new Error("nGrinder report input is invalid");
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error("nGrinder report input is invalid");
  const header = lines[0].split(",");
  const testsIndex = header.indexOf("Tests");
  const errorsIndex = header.indexOf("Errors");
  const latencyIndex = header.indexOf("Mean_Test_Time_(ms)");
  if (testsIndex < 0 || errorsIndex < 0 || latencyIndex < 0) {
    throw new Error("nGrinder report input is invalid");
  }
  let tests = 0;
  let errors = 0;
  const latencies = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(",");
    if (columns.length !== header.length) throw new Error("nGrinder report input is invalid");
    const rowTests = nonNegativeNumber(columns[testsIndex]);
    const rowErrors = nonNegativeNumber(columns[errorsIndex]);
    const rowLatency = nonNegativeNumber(columns[latencyIndex]);
    if (rowTests === null || rowErrors === null || rowLatency === null) {
      throw new Error("nGrinder report input is invalid");
    }
    tests += rowTests;
    errors += rowErrors;
    latencies.push(rowLatency);
  }
  return { tests, errors, latencies };
}

function parseNgrinderDetail(detail) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    throw new Error("nGrinder report input is invalid");
  }
  const test = detail.test && typeof detail.test === "object" ? detail.test : {};
  const status = statusName(detail.status ?? test.status);
  const tests = optionalNonNegativeNumber(test.tests ?? detail.tests);
  const errors = optionalNonNegativeNumber(test.errors ?? detail.errors);
  if (!status || tests === undefined || errors === undefined) {
    throw new Error("nGrinder report input is invalid");
  }
  return { status, tests, errors };
}

function parseGeneratorSamples(resourceSamples) {
  if (!Array.isArray(resourceSamples)) throw new Error("nGrinder report input is invalid");
  return resourceSamples.map((sample) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)
      || typeof sample.sampledAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(sample.sampledAt)
      || nonNegativeNumber(sample.cpuPercent) === null
      || nonNegativeNumber(sample.availableMemoryMiB) === null
      || nonNegativeNumber(sample.load1) === null
      || typeof sample.controllerActive !== "boolean"
      || typeof sample.agentActive !== "boolean") {
      throw new Error("nGrinder report input is invalid");
    }
    return {
      sampledAt: sample.sampledAt,
      cpuPercent: Number(sample.cpuPercent),
      availableMemoryMiB: Number(sample.availableMemoryMiB),
      load1: Number(sample.load1),
      controllerActive: sample.controllerActive,
      agentActive: sample.agentActive,
    };
  });
}

function parseVirtualUserResults(vuResults, expectedUsers) {
  if (!Array.isArray(vuResults)) throw new Error("nGrinder report input is invalid");
  const expectedNames = new Set(Array.from(
    { length: expectedUsers },
    (_, index) => `vu-${String(index + 1).padStart(3, "0")}.json`,
  ));
  const actualNames = new Set();
  let allPassed = true;
  let runtimeSamplesComplete = true;
  let errorCountersNonzero = false;
  let unexpected4xx = 0;
  let server5xx = 0;
  let timeouts = 0;
  let connectionErrors = 0;
  let passedUsers = 0;
  const failureStageCounts = new Map();
  const holdValues = [];
  const routeSamples = new Map(ROUTE_KEYS.map((key) => [key, []]));
  const routeFailureCounts = new Map(ROUTE_KEYS.map((key) => [key, 0]));

  for (const entry of vuResults) {
    if (!entry || typeof entry !== "object" || typeof entry.fileName !== "string"
      || !entry.result || typeof entry.result !== "object" || Array.isArray(entry.result)) {
      throw new Error("nGrinder report input is invalid");
    }
    actualNames.add(entry.fileName);
    const result = entry.result;
    const counters = ["unexpected4xx", "server5xx", "timeouts", "connectionErrors"]
      .map((key) => nonNegativeNumber(result[key]));
    const heldMs = nonNegativeNumber(result.heldMs);
    const runtimeSamples = nonNegativeNumber(result.runtimeSamples);
    const apiCalls = nonNegativeNumber(result.apiCalls);
    const routeResults = parseRouteResults(result);
    if (counters.some((value) => value === null) || heldMs === null
      || runtimeSamples === null || apiCalls === null) {
      throw new Error("nGrinder report input is invalid");
    }
    unexpected4xx += counters[0];
    server5xx += counters[1];
    timeouts += counters[2];
    connectionErrors += counters[3];
    const failureCode = result.failureCode;
    if (typeof failureCode !== "string" || !/^[A-Z0-9_]{1,64}$/.test(failureCode)) {
      throw new Error("nGrinder report input is invalid");
    }
    const holdOnlyLegacyFailure = result.status === "FAILED"
      && failureCode === "HOLD_INCOMPLETE"
      && runtimeSamples === 5
      && counters.every((value) => value === 0);
    const passed = (result.status === "PASSED" && failureCode === "NONE") || holdOnlyLegacyFailure;
    if (passed) passedUsers += 1;
    if (!passed && failureCode !== "NONE") {
      failureStageCounts.set(failureCode, (failureStageCounts.get(failureCode) ?? 0) + 1);
    }
    for (const route of routeResults) {
      routeSamples.get(route.key).push(...route.samples);
      routeFailureCounts.set(route.key, routeFailureCounts.get(route.key) + route.failures);
    }
    allPassed = allPassed && passed;
    runtimeSamplesComplete = runtimeSamplesComplete && runtimeSamples === 5;
    holdValues.push(Number(heldMs));
    errorCountersNonzero = errorCountersNonzero || counters.some((value) => value > 0);
  }

  const routes = ROUTE_KEYS.map((key) => {
    const samples = routeSamples.get(key);
    return {
      key,
      sampleCount: samples.length,
      p95Ms: percentile(samples, 95),
      failures: routeFailureCounts.get(key),
    };
  });
  let slowestRoute = null;
  let slowestRouteP95Ms = null;
  for (const route of routes) {
    if (route.p95Ms !== null && (slowestRouteP95Ms === null || route.p95Ms > slowestRouteP95Ms)) {
      slowestRoute = route.key;
      slowestRouteP95Ms = route.p95Ms;
    }
  }
  const failureStages = [...failureStageCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));

  return {
    reportedUsers: vuResults.length,
    coverageComplete: vuResults.length === expectedUsers
      && actualNames.size === expectedUsers
      && expectedNames.size === actualNames.size
      && [...expectedNames].every((name) => actualNames.has(name)),
    allPassed,
    holdMs: summarizeRange(holdValues),
    runtimeSamplesComplete,
    errorCountersNonzero,
    unexpected4xx,
    server5xx,
    timeouts,
    connectionErrors,
    passedUsers,
    failedUsers: vuResults.length - passedUsers,
    failureStages,
    routes,
    slowestRoute,
    slowestRouteP95Ms,
  };
}

function summarizeRange(values) {
  if (values.length === 0) return { minimum: null, average: null, maximum: null };
  return {
    minimum: Math.min(...values),
    average: Math.round(values.reduce((total, value) => total + value, 0) / values.length * 1000) / 1000,
    maximum: Math.max(...values),
  };
}

function parseRouteResults(result) {
  const latencies = result.routeLatencyMs;
  const failures = result.routeFailures;
  if (latencies === undefined && failures === undefined) {
    return ROUTE_KEYS.map((key) => ({ key, samples: [], failures: 0 }));
  }
  if (!sameKeys(latencies, ROUTE_KEYS) || !sameKeys(failures, ROUTE_KEYS)) {
    throw new Error("nGrinder report input is invalid");
  }
  return ROUTE_KEYS.map((key) => {
    if (!Array.isArray(latencies[key])) throw new Error("nGrinder report input is invalid");
    const samples = latencies[key].map(nonNegativeNumber);
    const failureCount = nonNegativeNumber(failures[key]);
    if (samples.some((value) => value === null) || failureCount === null) {
      throw new Error("nGrinder report input is invalid");
    }
    return { key, samples: samples.map(Number), failures: Number(failureCount) };
  });
}

function sameKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function hasConsecutiveCpu(samples, threshold, requiredCount) {
  let consecutive = 0;
  for (const sample of samples) {
    consecutive = sample.cpuPercent >= threshold ? consecutive + 1 : 0;
    if (consecutive >= requiredCount) return true;
  }
  return false;
}

function statusName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.name === "string") return value.name;
    if (typeof value.status === "string") return value.status;
  }
  return null;
}

function optionalNonNegativeNumber(value) {
  if (value === undefined || value === null) return null;
  return nonNegativeNumber(value);
}

function nonNegativeNumber(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

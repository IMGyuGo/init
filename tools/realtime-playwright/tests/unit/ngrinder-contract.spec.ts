import { expect, test } from "@playwright/test";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildNgrinderScriptSavePayload,
  buildNgrinderPerfTestPayload,
  buildNgrinderStageCsv,
  normalizeNgrinderReport,
  parseFixturePartitions,
  redactNgrinderValue,
} from "../../src/ngrinder-contract.mjs";
import { main as buildHybridInput } from "../../scripts/build-hybrid-input.mjs";
import { main as summarizeNgrinder } from "../../scripts/summarize-ngrinder.mjs";

test.describe("nGrinder hybrid input contract", () => {
  test("parses the exact twenty fixture partitions into ordered global ordinals", () => {
    const directory = createPartitionDirectory();
    try {
      const rows = parseFixturePartitions(directory);
      expect(rows).toHaveLength(200);
      expect(rows[0]).toEqual({ ordinal: 1, applicationId: "1001", magicToken: "header1.payload1.signature1" });
      expect(rows[20]).toEqual({ ordinal: 21, applicationId: "1021", magicToken: "header21.payload21.signature21" });
      expect(rows[199]).toEqual({ ordinal: 200, applicationId: "1200", magicToken: "header200.payload200.signature200" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("builds nested canary, 45, 95, and 195-row CSVs without browser rows", () => {
    const rows = fixtureRows();
    const canary = buildNgrinderStageCsv(rows, 1).trim().split("\n");
    const stage50 = buildNgrinderStageCsv(rows, 50).trim().split("\n");
    const stage100 = buildNgrinderStageCsv(rows, 100).trim().split("\n");
    const stage200 = buildNgrinderStageCsv(rows, 200).trim().split("\n");

    expect(canary).toEqual([
      "ordinal,applicationId,magicToken",
      "2,1002,header2.payload2.signature2",
    ]);
    expect(stage50).toHaveLength(46);
    expect(stage100).toHaveLength(96);
    expect(stage200).toHaveLength(196);
    expect(stage50.at(-1)).toBe("47,1047,header47.payload47.signature47");
    expect(stage100.slice(1, 46)).toEqual(stage50.slice(1));
    expect(stage200.slice(1, 96)).toEqual(stage100.slice(1));
    expect(stage200.some((line) => /^(1|21|61|81|131),/.test(line))).toBe(false);
  });

  test("rejects duplicate, missing, malformed, and unsupported input without echoing secrets", () => {
    const rows = fixtureRows();
    const duplicate = [...rows.slice(0, 199), rows[0]];
    expect(() => buildNgrinderStageCsv(duplicate, 200)).toThrow(
      "fixture ordinals must cover 1 through 200 exactly once",
    );
    expect(() => buildNgrinderStageCsv(rows.slice(0, 199), 200)).toThrow(
      "fixture ordinals must cover 1 through 200 exactly once",
    );
    expect(() => buildNgrinderStageCsv(rows, 25)).toThrow(
      "nGrinder stage must be canary, 50, 100, or 200",
    );

    const malformed = rows.map((row) => ({ ...row }));
    malformed[17].magicToken = "secret-that-must-not-be-repeated";
    let message = "";
    try {
      buildNgrinderStageCsv(malformed, 50);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("fixture token rows are invalid");
    expect(message).not.toContain("secret-that-must-not-be-repeated");
  });

  test("builds exact one-process nGrinder payloads with five 30-second hold samples", () => {
    const scheduledTime = "2026-08-14T03:00:00.000Z";
    expect(buildNgrinderPerfTestPayload({
      runId: "run-20260814-hybrid",
      totalUsers: 100,
      scheduledTime,
    })).toEqual({
      testName: "run-20260814-hybrid-hybrid-100",
      description: "Hybrid API stage 100",
      status: "READY",
      threshold: "R",
      scm: "svn",
      scriptName: "hybrid/hybrid-interview.groovy",
      duration: 240_000,
      runCount: 5,
      agentCount: 1,
      processes: 1,
      threads: 95,
      vuserPerAgent: 95,
      useRampUp: false,
      ignoreSampleCount: 0,
      samplingInterval: 1,
      targetHosts: "init-jungle.cloud",
      scheduledTime,
      sendMail: false,
    });
    expect(buildNgrinderPerfTestPayload({
      runId: "run-20260814-hybrid",
      totalUsers: 1,
      scheduledTime,
    })).toMatchObject({ threads: 1, vuserPerAgent: 1, threshold: "R", runCount: 5 });
    expect(() => buildNgrinderPerfTestPayload({
      runId: "unsafe run",
      totalUsers: 50,
      scheduledTime,
    })).toThrow("nGrinder performance test input is invalid");
  });

  test("redacts nested credentials, identifiers, email, and token query parameters", () => {
    const redacted = redactNgrinderValue({
      magicToken: "secret.jwt.value",
      nested: {
        publicAccessToken: "another.jwt.value",
        applicationId: 123,
        sessionId: 456,
        email: "pwload@example.invalid",
        url: "https://init-jungle.cloud/api/v1/public/applications/status?token=secret.jwt.value&safe=1",
      },
      safeMetric: 42,
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain("secret.jwt.value");
    expect(serialized).not.toContain("another.jwt.value");
    expect(serialized).not.toContain("pwload@example.invalid");
    expect(serialized).not.toContain("123");
    expect(serialized).not.toContain("456");
    expect(redacted).toMatchObject({
      magicToken: "[REDACTED]",
      nested: {
        publicAccessToken: "[REDACTED]",
        applicationId: "[REDACTED]",
        sessionId: "[REDACTED]",
        email: "[REDACTED]",
        url: "https://init-jungle.cloud/api/v1/public/applications/status?safe=1",
      },
      safeMetric: 42,
    });
  });

  test("CLI writes only safe aggregate metadata and the selected stage file", () => {
    const directory = createPartitionDirectory();
    const output = join(directory, "stage-50.csv");
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      const exitCode = buildHybridInput([
        `--input-directory=${directory}`,
        "--stage-users=50",
        `--output=${output}`,
      ], {
        log: (value: string) => stdout.push(value),
        error: (value: string) => stderr.push(value),
      });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout).toEqual([
        JSON.stringify({ status: "NGRINDER_INPUT_WRITTEN", totalUsers: 50, apiUsers: 45, rowCount: 45 }),
      ]);
      expect(readFileSync(output, "utf8").trim().split("\n")).toHaveLength(46);
      expect(stdout.join("\n")).not.toMatch(/header\d+\.payload\d+\.signature\d+/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("host input script transforms the real twenty-partition directory without leaking tokens", () => {
    const directory = createPartitionDirectory();
    const output = join(directory, "current.csv");
    try {
      const result = runBashScript("ngrinder/prepare-input.sh", [directory, "45", output]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim()).toBe(
        JSON.stringify({ status: "NGRINDER_LOCAL_INPUT_READY", apiUsers: 45, rowCount: 45 }),
      );
      const lines = readFileSync(output, "utf8").trim().split("\n");
      expect(lines).toHaveLength(46);
      expect(lines[1]).toBe("2,1002,header2.payload2.signature2");
      expect(lines.at(-1)).toBe("47,1047,header47.payload47.signature47");
      expect(result.stdout).not.toMatch(/header\d+\.payload\d+\.signature\d+/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("generator sampler writes token-free 10-second metric records", () => {
    const directory = mkdtempSync(join(tmpdir(), "ngrinder-generator-samples-"));
    const output = join(directory, "resource-samples.ndjson");
    const binDirectory = join(directory, "bin");
    mkdirSync(binDirectory);
    const fakeSystemctl = join(binDirectory, "systemctl");
    writeFileSync(fakeSystemctl, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(fakeSystemctl, 0o755);
    try {
      const result = runBashScript(
        "ngrinder/sample-generator.sh",
        ["run-20260814-hybrid", "50", output, "1"],
        { NGRINDER_SYSTEMCTL_BIN: toBashPath(fakeSystemctl) },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const samples = readFileSync(output, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(samples.length).toBeGreaterThanOrEqual(1);
      expect(samples[0]).toMatchObject({
        controllerActive: true,
        agentActive: true,
      });
      expect(samples[0].sampledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(samples[0].cpuPercent).toBeGreaterThanOrEqual(0);
      expect(samples[0].availableMemoryMiB).toBeGreaterThan(0);
      expect(samples[0].load1).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(samples)).not.toMatch(/token|applicationId|sessionId|email/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("Groovy scenario contains only the approved public interview route family", () => {
    const source = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    for (const route of [
      "/api/v1/public/applications/status",
      "/interview/start",
      "/interview/begin",
      "/api/v1/public/interviews/",
      "/questions",
      "/device-check",
    ]) {
      expect(source).toContain(route);
    }
    expect(source).not.toContain("realtime-session");
    expect(source).not.toContain("grinder.logger");
    expect(source).toContain("/var/lib/ngrinder/hybrid-input/current.csv");
    expect(source).toContain("/var/lib/ngrinder/hybrid-results/current/vu-results");
  });

  test("builds a source-only nGrinder script save payload", () => {
    const source = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    expect(buildNgrinderScriptSavePayload(source)).toEqual({
      fileEntry: {
        path: "hybrid/hybrid-interview.groovy",
        content: source,
        encoding: "UTF-8",
        description: "init-jungle hybrid interview API load test",
      },
      targetHosts: "init-jungle.cloud",
      validated: "0",
      createLibAndResource: false,
    });
  });

  test("all API users and clean generator evidence pass", () => {
    expect(normalizeNgrinderReport(cleanNgrinderReport(45))).toEqual({
      expectedUsers: 45,
      reportedUsers: 45,
      tests: 225,
      errors: 0,
      unexpected4xx: 0,
      server5xx: 0,
      timeouts: 0,
      connectionErrors: 0,
      latencyMs: { p50: 120, p95: 138, p99: 140 },
      passedUsers: 45,
      failedUsers: 0,
      failureStages: [],
      routes: [
        { key: "APPLICATION_STATUS", sampleCount: 45, p95Ms: 100, failures: 0 },
        { key: "INTERVIEW_START", sampleCount: 45, p95Ms: 200, failures: 0 },
        { key: "INTERVIEW_RUNTIME", sampleCount: 45, p95Ms: 300, failures: 0 },
        { key: "INTERVIEW_QUESTIONS", sampleCount: 45, p95Ms: 250, failures: 0 },
        { key: "DEVICE_CHECK", sampleCount: 0, p95Ms: null, failures: 0 },
        { key: "INTERVIEW_BEGIN", sampleCount: 0, p95Ms: null, failures: 0 },
      ],
      slowestRoute: "INTERVIEW_RUNTIME",
      slowestRouteP95Ms: 300,
      generatorReasons: [],
      failureReasons: [],
      verdict: "PASSED",
    });
  });

  test("aggregates only fixed route latency and user completion metadata", () => {
    const report = cleanNgrinderReport(1);
    report.vuResults[0].result.routeLatencyMs = {
      APPLICATION_STATUS: [100],
      INTERVIEW_START: [200],
      INTERVIEW_RUNTIME: [300, 500],
      INTERVIEW_QUESTIONS: [250],
      DEVICE_CHECK: [],
      INTERVIEW_BEGIN: [],
    };
    report.vuResults[0].result.routeFailures = routeFailures();

    expect(normalizeNgrinderReport(report)).toMatchObject({
      passedUsers: 1,
      failedUsers: 0,
      failureStages: [],
      slowestRoute: "INTERVIEW_RUNTIME",
      slowestRouteP95Ms: 490,
      routes: expect.arrayContaining([
        { key: "INTERVIEW_RUNTIME", sampleCount: 2, p95Ms: 490, failures: 0 },
      ]),
    });
  });

  test("rejects unknown route keys without echoing their value", () => {
    const report = cleanNgrinderReport(1);
    report.vuResults[0].result.routeLatencyMs = {
      ...routeLatencies(),
      SECRET_URL: [12],
    };
    report.vuResults[0].result.routeFailures = routeFailures();

    expect(() => normalizeNgrinderReport(report)).toThrow("nGrinder report input is invalid");
  });

  test("keeps legacy VU results readable with an empty route summary", () => {
    const report = cleanNgrinderReport(1);
    delete report.vuResults[0].result.routeLatencyMs;
    delete report.vuResults[0].result.routeFailures;

    expect(normalizeNgrinderReport(report)).toMatchObject({
      passedUsers: 1,
      failedUsers: 0,
      slowestRoute: null,
      slowestRouteP95Ms: null,
      routes: [
        { key: "APPLICATION_STATUS", sampleCount: 0, p95Ms: null, failures: 0 },
        { key: "INTERVIEW_START", sampleCount: 0, p95Ms: null, failures: 0 },
        { key: "INTERVIEW_RUNTIME", sampleCount: 0, p95Ms: null, failures: 0 },
        { key: "INTERVIEW_QUESTIONS", sampleCount: 0, p95Ms: null, failures: 0 },
        { key: "DEVICE_CHECK", sampleCount: 0, p95Ms: null, failures: 0 },
        { key: "INTERVIEW_BEGIN", sampleCount: 0, p95Ms: null, failures: 0 },
      ],
    });
  });

  test("HTTP failure wins over a simultaneous generator constraint", () => {
    const report = cleanNgrinderReport(95);
    report.csv = report.csv.replace(",0,100,", ",1,100,");
    report.vuResults[0].result.server5xx = 1;
    report.resourceSamples = cpuSamples([79, 80, 81, 82]);
    expect(normalizeNgrinderReport(report)).toMatchObject({
      errors: 1,
      server5xx: 1,
      generatorReasons: ["CPU_80_PERCENT_3_CONSECUTIVE"],
      verdict: "FAILED",
    });
  });

  test("three consecutive 80 percent CPU samples classify generator constraint", () => {
    const report = cleanNgrinderReport(195);
    report.resourceSamples = cpuSamples([79, 80, 81, 82]);
    expect(normalizeNgrinderReport(report)).toMatchObject({
      generatorReasons: ["CPU_80_PERCENT_3_CONSECUTIVE"],
      verdict: "GENERATOR_CONSTRAINED",
    });
  });

  test("controller or agent inactivity and incomplete VU coverage are failures", () => {
    const inactive = cleanNgrinderReport(45);
    inactive.resourceSamples[3].agentActive = false;
    expect(normalizeNgrinderReport(inactive)).toMatchObject({
      failureReasons: ["NGRINDER_AGENT_INACTIVE"],
      verdict: "FAILED",
    });

    const missing = cleanNgrinderReport(45);
    missing.vuResults.pop();
    expect(normalizeNgrinderReport(missing)).toMatchObject({
      reportedUsers: 44,
      failureReasons: ["VU_COVERAGE_INCOMPLETE"],
      verdict: "FAILED",
    });
  });

  test("summary CLI writes only aggregate metadata and token-free output", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ngrinder-summary-"));
    const vuDirectory = join(directory, "vu-results");
    const output = join(directory, "summary.json");
    mkdirSync(vuDirectory);
    const report = cleanNgrinderReport(1);
    writeFileSync(join(directory, "detail.json"), JSON.stringify(report.detail), "utf8");
    writeFileSync(join(directory, "report.csv"), report.csv, "utf8");
    writeFileSync(
      join(directory, "resource-samples.ndjson"),
      `${report.resourceSamples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
      "utf8",
    );
    writeFileSync(join(vuDirectory, "vu-001.json"), JSON.stringify(report.vuResults[0].result), "utf8");
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      const exitCode = await summarizeNgrinder([
        `--detail=${join(directory, "detail.json")}`,
        `--csv=${join(directory, "report.csv")}`,
        `--resources=${join(directory, "resource-samples.ndjson")}`,
        `--vu-results=${vuDirectory}`,
        "--expected-users=1",
        `--output=${output}`,
      ], {
        log: (value: string) => stdout.push(value),
        error: (value: string) => stderr.push(value),
      });
      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout).toEqual([
        JSON.stringify({ status: "NGRINDER_SUMMARY_WRITTEN", expectedUsers: 1, verdict: "PASSED" }),
      ]);
      const serialized = readFileSync(output, "utf8");
      expect(JSON.parse(serialized)).toMatchObject({ expectedUsers: 1, verdict: "PASSED" });
      expect(serialized).not.toMatch(/magicToken|publicAccessToken|applicationId|sessionId|@loadtest\.invalid/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function createPartitionDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "ngrinder-hybrid-input-"));
  const rows = fixtureRows();
  for (let instanceIndex = 1; instanceIndex <= 20; instanceIndex += 1) {
    const start = (instanceIndex - 1) * 10;
    const body = [
      "applicationId,magicToken",
      ...rows.slice(start, start + 10).map((row) => `${row.applicationId},${row.magicToken}`),
      "",
    ].join("\n");
    writeFileSync(join(directory, `instance-${String(instanceIndex).padStart(2, "0")}.csv`), body, "utf8");
  }
  return directory;
}

function fixtureRows() {
  return Array.from({ length: 200 }, (_, index) => {
    const ordinal = index + 1;
    return {
      ordinal,
      applicationId: String(1000 + ordinal),
      magicToken: `header${ordinal}.payload${ordinal}.signature${ordinal}`,
    };
  });
}

function cleanNgrinderReport(expectedUsers: number) {
  return {
    detail: {
      status: { name: "FINISHED" },
      test: { status: { name: "FINISHED" }, tests: expectedUsers * 5, errors: 0 },
    },
    csv: [
      "DateTime,vuser,Tests,Errors,Mean_Test_Time_(ms),Test_Time_Standard_Deviation_(ms),TPS",
      ...[100, 110, 120, 130, 140].map((latency, index) =>
        `2026-08-14 03:00:0${index},${expectedUsers},${expectedUsers},0,${latency},1,1`),
      "",
    ].join("\n"),
    resourceSamples: cpuSamples([]),
    vuResults: Array.from({ length: expectedUsers }, (_, index) => ({
      fileName: `vu-${String(index + 1).padStart(3, "0")}.json`,
      result: {
        status: "PASSED",
        failureCode: "NONE",
        heldMs: 150_000,
        runtimeSamples: 5,
        apiCalls: 10,
        unexpected4xx: 0,
        server5xx: 0,
        timeouts: 0,
        connectionErrors: 0,
        routeLatencyMs: routeLatencies(),
        routeFailures: routeFailures(),
      },
    })),
    expectedUsers,
  };
}

function routeLatencies() {
  return {
    APPLICATION_STATUS: [100],
    INTERVIEW_START: [200],
    INTERVIEW_RUNTIME: [300],
    INTERVIEW_QUESTIONS: [250],
    DEVICE_CHECK: [],
    INTERVIEW_BEGIN: [],
  };
}

function routeFailures() {
  return {
    APPLICATION_STATUS: 0,
    INTERVIEW_START: 0,
    INTERVIEW_RUNTIME: 0,
    INTERVIEW_QUESTIONS: 0,
    DEVICE_CHECK: 0,
    INTERVIEW_BEGIN: 0,
  };
}

function cpuSamples(prefix: number[]) {
  const values = [...prefix, ...Array.from({ length: Math.max(0, 15 - prefix.length) }, () => 30)];
  return values.map((cpuPercent, index) => ({
    sampledAt: `2026-08-14T03:00:${String(index).padStart(2, "0")}Z`,
    cpuPercent,
    availableMemoryMiB: 2048,
    load1: 0.5,
    controllerActive: true,
    agentActive: true,
  }));
}

function runBashScript(relativeScript: string, args: string[], extraEnv: Record<string, string> = {}) {
  const executable = findBash();
  return spawnSync(executable, [toBashPath(resolve(relativeScript)), ...args.map(toBashPath)], {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function findBash() {
  if (process.platform !== "win32") return "/bin/bash";
  for (const candidate of [
    process.env.GIT_BASH_EXE,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter((candidate): candidate is string => Boolean(candidate))) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Git Bash is required for nGrinder shell contract tests");
}

function toBashPath(value: string) {
  if (process.platform !== "win32") return value;
  const normalized = value.replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  return match ? `/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

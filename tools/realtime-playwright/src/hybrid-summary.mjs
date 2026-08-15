import { SELECTED_BROWSER_HOSTS } from "./hybrid-allocation.mjs";
import {
  detectGeneratorConstraint,
  evaluateStage,
  summarizeVirtualUsers,
} from "./result-summary.mjs";

const EXPECTED_API_USERS = new Map([[50, 45], [100, 95], [200, 195]]);
const APPROVED_VU_IDS = Object.freeze(SELECTED_BROWSER_HOSTS.map((host) => host.vuId));
const APPROVED_INSTANCE_INDICES = Object.freeze(SELECTED_BROWSER_HOSTS.map((host) => host.instanceIndex));

export function summarizeHybridBrowserStage({ results, resourceSamples, expectedVuIds } = {}) {
  assertApprovedVuIds(expectedVuIds);
  if (!Array.isArray(results) || !Array.isArray(resourceSamples)) {
    throw new Error("hybrid browser evidence is invalid");
  }

  const actualVuIds = new Set();
  const barrierValues = new Set();
  const startedAtValues = [];
  let screenshotCoverageComplete = true;
  for (const result of results) {
    const vu = result?.vu ?? result?.vuId;
    if (typeof vu !== "string" || !/^vu-\d{3}$/.test(vu) || actualVuIds.has(vu)) {
      throw new Error("hybrid browser evidence is invalid");
    }
    actualVuIds.add(vu);
    if (!isEpochMilliseconds(result.barrierEpochMs) || !isEpochMilliseconds(result.startedAtEpochMs)) {
      throw new Error("hybrid browser evidence is invalid");
    }
    barrierValues.add(result.barrierEpochMs);
    startedAtValues.push(result.startedAtEpochMs);
    screenshotCoverageComplete = screenshotCoverageComplete
      && result?.evidence?.ready === `virtual-users/${vu}/ready.png`
      && result?.evidence?.completed === `virtual-users/${vu}/completed.png`;
  }
  const vuCoverageComplete = setsEqual(actualVuIds, new Set(APPROVED_VU_IDS));
  if (barrierValues.size !== 1) throw new Error("hybrid browser evidence is invalid");
  const barrierEpochMs = [...barrierValues][0];
  const firstStartedAtEpochMs = Math.min(...startedAtValues);
  const lastStartedAtEpochMs = Math.max(...startedAtValues);

  const actualInstanceIndices = new Set();
  const generatorReasons = [];
  let resourceCoverageComplete = true;
  for (const host of resourceSamples) {
    if (!host || !Number.isSafeInteger(host.instanceIndex) || actualInstanceIndices.has(host.instanceIndex)
      || !Array.isArray(host.samples)) {
      throw new Error("hybrid browser evidence is invalid");
    }
    actualInstanceIndices.add(host.instanceIndex);
    if (host.samples.length < 15) resourceCoverageComplete = false;
    const constraint = detectGeneratorConstraint(host.samples);
    if (constraint.constrained) {
      generatorReasons.push(`INSTANCE_${String(host.instanceIndex).padStart(2, "0")}_${constraint.reason}`);
    }
  }
  const hostCoverageComplete = setsEqual(actualInstanceIndices, new Set(APPROVED_INSTANCE_INDICES));
  const aggregate = summarizeVirtualUsers(results);
  // 브라우저의 4xx/console/page/request 카운터는 관측값으로 보존한다. 운영 서버가
  // 부하를 못 버틴 직접 증거인 5xx와 연결 단절만 이 어댑터의 hard gate로 사용한다.
  const serverCountersClean = aggregate.api5xx === 0 && aggregate.connectionDrops === 0;
  let verdict = evaluateStage(aggregate, {
    expectedUsers: 5,
    expectedHosts: 5,
    reportedHosts: actualInstanceIndices.size,
    generatorConstrained: generatorReasons.length > 0,
    hostCoverageComplete: hostCoverageComplete && resourceCoverageComplete,
    vuCoverageComplete: vuCoverageComplete && screenshotCoverageComplete,
  });
  if (!serverCountersClean) verdict = "FAILED";

  const failureReasons = [];
  if (!vuCoverageComplete) failureReasons.push("BROWSER_VU_COVERAGE_INCOMPLETE");
  if (!screenshotCoverageComplete) failureReasons.push("BROWSER_SCREENSHOT_COVERAGE_INCOMPLETE");
  if (!hostCoverageComplete || !resourceCoverageComplete) failureReasons.push("BROWSER_RESOURCE_COVERAGE_INCOMPLETE");
  if (!serverCountersClean) failureReasons.push("BROWSER_SERVER_COUNTER_NONZERO");
  if (aggregate.failed > 0) {
    failureReasons.push("BROWSER_RESULT_FAILED");
  }

  return {
    ...aggregate,
    reportedHosts: actualInstanceIndices.size,
    generatorReasons: [...new Set(generatorReasons)].sort(),
    failureReasons: [...new Set(failureReasons)],
    startTiming: {
      barrierEpochMs,
      firstStartedAtEpochMs,
      lastStartedAtEpochMs,
      firstStartDelayMs: firstStartedAtEpochMs - barrierEpochMs,
      lastStartDelayMs: lastStartedAtEpochMs - barrierEpochMs,
    },
    virtualUsers: results.map(toSafeVirtualUser).sort((left, right) => left.vu.localeCompare(right.vu)),
    verdict,
  };
}

export function evaluateHybridStage({ totalUsers, api, browser, cloudWatch } = {}) {
  const expectedApi = EXPECTED_API_USERS.get(totalUsers);
  if (!expectedApi || !api || !browser || !cloudWatch) return "FAILED";
  if (api.expectedUsers !== expectedApi || api.reportedUsers !== expectedApi
    || browser.total !== 5 || browser.passed + browser.failed !== 5
    || typeof cloudWatch.serverFailure !== "boolean"
    || typeof cloudWatch.metricIncomplete !== "boolean") {
    return "FAILED";
  }
  if (!validStartTiming(api.startTiming) || !validStartTiming(browser.startTiming)
    || api.startTiming.barrierEpochMs !== browser.startTiming.barrierEpochMs
    || Math.abs(api.startTiming.firstStartedAtEpochMs - browser.startTiming.firstStartedAtEpochMs) > 5_000
    || api.startTiming.firstStartDelayMs < 0 || browser.startTiming.firstStartDelayMs < 0) {
    return "FAILED";
  }
  // 서버 기능 실패는 generator 포화보다 우선하며, CloudWatch 누락도 성공으로 추정하지 않는다.
  if (api.verdict === "FAILED" || browser.verdict === "FAILED"
    || cloudWatch.serverFailure || cloudWatch.metricIncomplete) {
    return "FAILED";
  }
  if (!new Set(["PASSED", "GENERATOR_CONSTRAINED"]).has(api.verdict)
    || !new Set(["PASSED", "GENERATOR_CONSTRAINED"]).has(browser.verdict)) {
    return "FAILED";
  }
  if (api.verdict === "GENERATOR_CONSTRAINED" || browser.verdict === "GENERATOR_CONSTRAINED") {
    return "GENERATOR_CONSTRAINED";
  }
  return "HYBRID_PASSED";
}

export function buildHybridSummary({ runId, baseline25, stages } = {}) {
  if (typeof runId !== "string" || !/^run-[a-z0-9][a-z0-9_-]{0,59}$/.test(runId)
    || !Array.isArray(stages)) {
    throw new Error("hybrid summary input is invalid");
  }
  const baselineStage = Array.isArray(baseline25?.stages)
    ? baseline25.stages.find((stage) => stage?.users === 25)
    : null;
  const baselineValid = baselineStage?.total === 25
    && baselineStage?.passed === 25
    && baselineStage?.failed === 0
    && baselineStage?.verdict === "GENERATOR_CONSTRAINED";
  const baseline = {
    sourceRunId: typeof baseline25?.runId === "string" ? baseline25.runId : "UNKNOWN",
    functionalUsers: baselineStage?.total ?? 0,
    functionalPassed: baselineStage?.passed ?? 0,
    classification: baselineValid
      ? "E2E_FUNCTIONAL_SUCCESS_GENERATOR_CONSTRAINED"
      : "BASELINE_EVIDENCE_INVALID",
  };

  const seenStages = new Set();
  const normalizedStages = stages.map((stage) => {
    if (!stage || !EXPECTED_API_USERS.has(stage.totalUsers) || seenStages.has(stage.totalUsers)) {
      throw new Error("hybrid summary input is invalid");
    }
    seenStages.add(stage.totalUsers);
    const verdict = evaluateHybridStage(stage);
    return {
      totalUsers: stage.totalUsers,
      apiUsers: stage.api.expectedUsers,
      browserUsers: stage.browser.total,
      apiErrors: Number(stage.api.errors) || 0,
      browserFailures: Number(stage.browser.failed) || 0,
      alb5xx: finiteOrNull(stage.cloudWatch.alb5xx),
      apiP95Ms: finiteOrNull(stage.cloudWatch.apiP95Ms),
      apiVerdict: stage.api.verdict,
      browserVerdict: stage.browser.verdict,
      startSkewMs: Math.abs(
        stage.api.startTiming.firstStartedAtEpochMs - stage.browser.startTiming.firstStartedAtEpochMs,
      ),
      verdict,
    };
  }).sort((left, right) => left.totalUsers - right.totalUsers);

  return {
    schemaVersion: "HYBRID_LOADTEST_SUMMARY_V1",
    runId,
    baseline25: baseline,
    stages: normalizedStages,
  };
}

export function renderHybridSummaryMarkdown(summary) {
  const lines = [
    `# 하이브리드 부하 테스트 결과: ${summary.runId}`,
    "",
    "| 총 사용자 | API 사용자 | 브라우저 사용자 | API 오류 | 브라우저 실패 | ALB 5xx | API p95 | 최종 판정 |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  const baselineLabel = summary.baseline25.classification === "E2E_FUNCTIONAL_SUCCESS_GENERATOR_CONSTRAINED"
    ? "E2E 기능 성공 + generator constrained"
    : "기준선 증거 무효";
  lines.push(
    `| 25 | 0 | ${summary.baseline25.functionalUsers} | 0 | ${summary.baseline25.functionalUsers - summary.baseline25.functionalPassed} | n/a | n/a | ${baselineLabel} |`,
  );
  for (const stage of summary.stages) {
    lines.push(
      `| ${stage.totalUsers} | ${stage.apiUsers} | ${stage.browserUsers} | ${stage.apiErrors} | ${stage.browserFailures} | ${display(stage.alb5xx)} | ${displayMs(stage.apiP95Ms)} | ${stage.verdict} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function assertApprovedVuIds(expectedVuIds) {
  if (!Array.isArray(expectedVuIds)
    || expectedVuIds.length !== APPROVED_VU_IDS.length
    || expectedVuIds.some((value, index) => value !== APPROVED_VU_IDS[index])) {
    throw new Error("hybrid browser evidence is invalid");
  }
}

function toSafeVirtualUser(result) {
  const vu = result.vu ?? result.vuId;
  const failureCode = typeof result.failureCode === "string" && /^[A-Z0-9_]{1,64}$/.test(result.failureCode)
    ? result.failureCode
    : null;
  const evidence = {};
  for (const type of ["ready", "completed"]) {
    const value = result?.evidence?.[type];
    if (value === `virtual-users/${vu}/${type}.png`) evidence[type] = value;
  }
  return {
    vu,
    status: result.status === "passed" ? "passed" : "failed",
    failureCode,
    evidence,
  };
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isEpochMilliseconds(value) {
  return Number.isSafeInteger(value) && value >= 1_000_000_000_000;
}

function validStartTiming(value) {
  return value && isEpochMilliseconds(value.barrierEpochMs)
    && isEpochMilliseconds(value.firstStartedAtEpochMs)
    && isEpochMilliseconds(value.lastStartedAtEpochMs)
    && Number.isSafeInteger(value.firstStartDelayMs)
    && Number.isSafeInteger(value.lastStartDelayMs);
}

function display(value) {
  return value === null ? "n/a" : String(value);
}

function displayMs(value) {
  return value === null ? "n/a" : `${value}ms`;
}

import { normalizeCloudWatchImageEvidence } from "./cloudwatch-evidence-images.mjs";

const RUN_ID_PATTERN = /^run-[a-z0-9][a-z0-9_-]{0,59}$/;
const FIXED_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;
const METRIC_PATTERN = /^[A-Za-z0-9_.]{1,80}$/;
const STAGES = new Map([[50, 45], [100, 95], [200, 195]]);
const HYBRID_VERDICTS = new Set(["HYBRID_PASSED", "FAILED", "GENERATOR_CONSTRAINED"]);
const ECS_SERVICE_KEYS = ["api", "frontend", "worker"];
const UTILIZATION_STATUSES = new Set(["NORMAL", "WARNING", "CRITICAL", "SATURATED"]);
const ROUTE_KEYS = new Set([
  "APPLICATION_STATUS",
  "INTERVIEW_START",
  "INTERVIEW_RUNTIME",
  "INTERVIEW_QUESTIONS",
  "DEVICE_CHECK",
  "INTERVIEW_BEGIN",
]);

export function buildBottleneckSummary(input = {}) {
  const identity = normalizeIdentity(input);
  const users = aggregateUsers(identity.stage, input.api, input.browser);
  const evidence = normalizeEvidence(input.evidence);
  const failureDetails = aggregateFailureDetails(input.api, input.browser, evidence.aggregate.apiErrors);
  const missingMetrics = [...evidence.missingMetrics];
  const slowestRoute = safeRoute(input.api?.slowestRoute);
  const slowestRouteP95Ms = nullableNonNegative(input.api?.slowestRouteP95Ms);
  if (slowestRoute === null || slowestRouteP95Ms === null) {
    missingMetrics.push({ metric: "api.slowestRoute", reason: "ROUTE_LATENCY_MISSING" });
  }
  const normalizedMissing = uniqueMissingMetrics(missingMetrics);
  const dbCreditRisk = calculateDbCreditRisk(evidence.series.dbCpuCredit, identity);
  const correlations = {
    application: hasApplicationCorrelation(evidence),
    database: hasDatabaseCorrelation(evidence),
  };
  const [verdict, reasons] = chooseVerdict({
    users,
    hybridVerdict: input.hybridVerdict,
    generatorConstrained: hasGeneratorConstraint(input.api, input.browser),
    evidence,
    missingMetrics: normalizedMissing,
    dbCreditRisk,
    correlations,
  });

  const summary = {
    runId: identity.runId,
    stage: identity.stage,
    attempt: identity.attempt,
    startedAtUtc: identity.startedAtUtc,
    endedAtUtc: identity.endedAtUtc,
    startedAtKst: toKst(identity.startedAtUtc),
    endedAtKst: toKst(identity.endedAtUtc),
    users,
    api: {
      p95Ms: evidence.aggregate.apiP95Ms,
      slowestRoute,
      slowestRouteP95Ms,
      errorRatePercent: evidence.aggregate.errorRatePercent,
      holdMs: normalizeHoldRange(input.api?.holdMs),
      runtimeSamplesComplete: nullableBoolean(input.api?.runtimeSamplesComplete),
    },
    ecsServices: evidence.aggregate.ecsServices,
    serverFailureEvidence: evidence.aggregate.serverFailureEvidence,
    cloudWatchImages: normalizeCloudWatchImageEvidence(input.cloudWatchImages),
    dbCpuCredit: {
      start: evidence.aggregate.dbCpuCredit.start,
      end: evidence.aggregate.dbCpuCredit.end,
      minimum: evidence.aggregate.dbCpuCredit.minimum,
      decrease: evidence.aggregate.dbCpuCredit.decrease,
    },
    verdict,
    reasons,
    missingMetrics: normalizedMissing,
  };
  return {
    summary,
    details: {
      totalRequests: evidence.aggregate.totalRequests,
      failedRequests: evidence.aggregate.failedRequests,
      majorFailureStages: failureDetails.majorFailureStages,
      representativeErrors: failureDetails.representativeErrors,
      dbCreditRisk,
    },
    series: evidence.series,
  };
}

export function renderBottleneckMarkdown({ summary, details } = {}) {
  if (!summary || !details) throw new Error("bottleneck summary input is invalid");
  const missing = summary.missingMetrics.length === 0
    ? "없음"
    : summary.missingMetrics.map(({ metric, reason }) => `${metric}:${reason}`).join(", ");
  const reasons = summary.reasons.length === 0 ? "없음" : summary.reasons.join(", ");
  return [
    `# 병목 요약: ${summary.runId} / ${summary.stage}명 / attempt-${summary.attempt}`,
    "",
    `- 판정: ${summary.verdict}`,
    `- 판정 근거: ${reasons}`,
    `- UTC 구간: ${summary.startedAtUtc} ~ ${summary.endedAtUtc}`,
    `- KST 구간: ${summary.startedAtKst} ~ ${summary.endedAtKst}`,
    `- 사용자: ${summary.users.completed}/${summary.users.target} (${summary.users.successRatePercent}%)`,
    "",
    "| 최소 지표 | 값 |",
    "| --- | ---: |",
    `| 전체 요청 수 | ${display(details.totalRequests)} |`,
    `| 실패 요청 수 | ${display(details.failedRequests)} |`,
    `| 주요 실패 단계 | ${displayCodes(details.majorFailureStages)} |`,
    `| 대표 오류 유형 | ${displayCodes(details.representativeErrors)} |`,
    `| 전체 API p95 | ${displayMs(summary.api.p95Ms)} |`,
    `| 가장 느린 API | ${displayRoute(summary.api.slowestRoute, summary.api.slowestRouteP95Ms)} |`,
    `| API 오류율 | ${displayPercent(summary.api.errorRatePercent)} |`,
    `| 실제 유지 시간 최소/평균/최대 | ${displayRange(summary.api.holdMs)} |`,
    `| 런타임 샘플 완료 | ${displayBoolean(summary.api.runtimeSamplesComplete)} |`,
    `| 서버 장애 증거 | ${displayFailureEvidence(summary.serverFailureEvidence)} |`,
    `| DB credit 시작/종료/최솟값/감소량 | ${displayDb(summary.dbCpuCredit)} |`,
    `| DB credit 예상 소진 위험 | ${displayRisk(details.dbCreditRisk)} |`,
    `| 누락 지표 | ${missing} |`,
    "",
    "| ECS 서비스 | CPU 평균 | CPU 최대 | CPU 상태 | 메모리 평균 | 메모리 최대 | 메모리 상태 | task 이상 |",
    "| --- | ---: | ---: | --- | ---: | ---: | --- | --- |",
    ...ECS_SERVICE_KEYS.map((serviceKey) => renderEcsServiceRow(serviceKey, summary.ecsServices[serviceKey])),
    "",
    "## AWS CloudWatch 증거 이미지",
    "",
    ...renderCloudWatchImages(summary.cloudWatchImages),
    "",
    "DB credit 예상 시간은 짧은 stage 구간을 선형 외삽한 값이며 장기 예측을 보장하지 않는다.",
    "",
  ].join("\n");
}

export function markPngRenderFailure(report) {
  const missingMetrics = uniqueMissingMetrics([
    ...report.summary.missingMetrics,
    { metric: "bottleneckSummaryPng", reason: "PNG_RENDER_FAILED" },
  ]);
  return {
    ...report,
    summary: {
      ...report.summary,
      verdict: "INSUFFICIENT_EVIDENCE",
      reasons: ["REQUIRED_METRIC_MISSING"],
      missingMetrics,
    },
  };
}

function normalizeIdentity({ runId, stage, attempt, startedAtUtc, endedAtUtc }) {
  const start = parseUtc(startedAtUtc);
  const end = parseUtc(endedAtUtc);
  if (!RUN_ID_PATTERN.test(runId ?? "") || !STAGES.has(stage)
    || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 1000
    || start === null || end === null || end <= start) {
    throw new Error("bottleneck summary input is invalid");
  }
  return {
    runId,
    stage,
    attempt,
    startedAtUtc: new Date(start).toISOString(),
    endedAtUtc: new Date(end).toISOString(),
    start,
    end,
  };
}

function aggregateUsers(stage, api, browser) {
  const expectedApiUsers = STAGES.get(stage);
  const apiReported = safeInteger(api?.reportedUsers);
  const apiPassed = safeInteger(api?.passedUsers);
  const apiFailed = safeInteger(api?.failedUsers);
  const browserTotal = safeInteger(browser?.total);
  const browserPassed = safeInteger(browser?.passed);
  const browserFailed = safeInteger(browser?.failed);
  if ([apiReported, apiPassed, apiFailed, browserTotal, browserPassed, browserFailed].some((value) => value === null)
    || apiReported > expectedApiUsers || apiPassed + apiFailed !== apiReported
    || browserTotal !== 5 || browserPassed + browserFailed !== browserTotal) {
    throw new Error("bottleneck summary input is invalid");
  }
  const started = apiReported + browserTotal;
  const completed = apiPassed + browserPassed;
  if (completed > stage || completed > started) throw new Error("bottleneck summary input is invalid");
  return {
    target: stage,
    started,
    completed,
    failed: stage - completed,
    successRatePercent: round(completed / stage * 100),
  };
}

function normalizeEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || !evidence.aggregate || !evidence.series || !Array.isArray(evidence.missingMetrics)) {
    throw new Error("bottleneck summary input is invalid");
  }
  for (const missing of evidence.missingMetrics) assertMissingMetric(missing);
  const aggregate = evidence.aggregate;
  const normalized = {
    totalRequests: nullableNonNegative(aggregate.totalRequests),
    failedRequests: nullableNonNegative(aggregate.failedRequests),
    errorRatePercent: nullableNonNegative(aggregate.errorRatePercent),
    apiP95Ms: nullableNonNegative(aggregate.apiP95Ms),
    apiErrors: normalizeApiErrors(aggregate.apiErrors),
    ecsServices: normalizeEcsServices(aggregate.ecsServices),
    serverFailureEvidence: normalizeServerFailureEvidence(aggregate.serverFailureEvidence),
    dbCpuCredit: normalizeDbCredit(aggregate.dbCpuCredit),
  };
  return {
    aggregate: normalized,
    series: normalizeSeries(evidence.series),
    missingMetrics: evidence.missingMetrics.map(({ metric, reason }) => ({ metric, reason })),
  };
}

function chooseVerdict({
  users,
  hybridVerdict,
  generatorConstrained,
  evidence,
  missingMetrics,
  dbCreditRisk,
  correlations,
}) {
  if (!HYBRID_VERDICTS.has(hybridVerdict)) throw new Error("bottleneck summary input is invalid");
  if (users.started < users.target || hybridVerdict === "GENERATOR_CONSTRAINED" || generatorConstrained) {
    const reasons = [];
    if (users.started < users.target) reasons.push("TARGET_LOAD_NOT_REACHED");
    if (hybridVerdict === "GENERATOR_CONSTRAINED" || generatorConstrained) reasons.push("GENERATOR_CONSTRAINED");
    return ["INSUFFICIENT_LOAD", [...new Set(reasons)]];
  }
  if (missingMetrics.length > 0) return ["INSUFFICIENT_EVIDENCE", ["REQUIRED_METRIC_MISSING"]];
  const failed = users.failed > 0 || evidence.aggregate.errorRatePercent > 0
    || evidence.aggregate.serverFailureEvidence.detected === true || hybridVerdict === "FAILED";
  if (failed && correlations.database) return ["FAIL_DATABASE", ["DB_CREDIT_FAILURE_CORRELATED"]];
  if (failed && correlations.application) return ["FAIL_APPLICATION", ["API_ECS_FAILURE_CORRELATED"]];
  if (failed) return ["FAIL_USER_FLOW", ["USER_FLOW_FAILURE_WITHOUT_INFRA_CORRELATION"]];
  if (dbCreditRisk.risk) return ["PASS_WITH_DB_CREDIT_RISK", ["DB_CREDIT_24H_RISK"]];
  return ["PASS", []];
}

function hasApplicationCorrelation(evidence) {
  if (evidence.aggregate.serverFailureEvidence.detected === true) return true;
  const errorMinutes = new Set(evidence.series.apiErrorRatePercent
    .filter(({ value }) => value > 0)
    .map(({ atUtc }) => minute(atUtc)));
  return ECS_SERVICE_KEYS.some((serviceKey) => {
    const average = evidence.aggregate.ecsServices[serviceKey].cpu.averagePercent;
    if (average === null) return false;
    return evidence.series.ecsServices[serviceKey].cpuMaximum.some(({ atUtc, value }) =>
      value >= average + 20 && errorMinutes.has(minute(atUtc)));
  });
}

function hasDatabaseCorrelation(evidence) {
  const { start, minimum } = evidence.aggregate.dbCpuCredit;
  if (start === null || minimum === null || start <= 0 || minimum > start * 0.2) return false;
  const errorMinutes = new Set(evidence.series.apiErrorRatePercent
    .filter(({ value }) => value > 0)
    .map(({ atUtc }) => minute(atUtc)));
  const decreaseMinutes = new Set();
  for (let index = 1; index < evidence.series.dbCpuCredit.length; index += 1) {
    if (evidence.series.dbCpuCredit[index].value < evidence.series.dbCpuCredit[index - 1].value) {
      decreaseMinutes.add(minute(evidence.series.dbCpuCredit[index].atUtc));
    }
  }
  return [...errorMinutes].some((value) => decreaseMinutes.has(value));
}

function calculateDbCreditRisk(points, identity) {
  const decrease = points.length >= 2 ? Math.max(0, points[0].value - points.at(-1).value) : 0;
  const durationHours = (identity.end - identity.start) / 3_600_000;
  if (points.length < 2 || decrease <= 0 || durationHours <= 0) {
    return { risk: false, projectedExhaustionHours: null };
  }
  const projectedExhaustionHours = round(points.at(-1).value / (decrease / durationHours));
  return { risk: projectedExhaustionHours < 24, projectedExhaustionHours };
}

function aggregateFailureDetails(api, browser, apiErrors) {
  const stages = new Map();
  if (!Array.isArray(api?.failureStages) || !Array.isArray(browser?.virtualUsers)) {
    throw new Error("bottleneck summary input is invalid");
  }
  for (const entry of api.failureStages) addFixedCount(stages, entry?.code, entry?.count);
  for (const user of browser.virtualUsers) {
    if (user?.failureCode !== null && user?.failureCode !== undefined) addFixedCount(stages, user.failureCode, 1);
  }
  const majorFailureStages = sortedCounts(stages).slice(0, 5);
  const errors = new Map(stages);
  addOptionalFixedCount(errors, "ALB_TARGET_4XX", apiErrors.target4xx);
  addOptionalFixedCount(errors, "ALB_5XX", apiErrors.alb5xx);
  addOptionalFixedCount(errors, "ALB_TARGET_5XX", apiErrors.target5xx);
  addOptionalFixedCount(errors, "ALB_CONNECTION_ERROR", apiErrors.connectionErrors);
  return { majorFailureStages, representativeErrors: sortedCounts(errors).slice(0, 5) };
}

function addOptionalFixedCount(target, code, count) {
  if (count !== null) addFixedCount(target, code, count, true);
}

function addFixedCount(target, code, count, allowZero = false) {
  if (!FIXED_CODE_PATTERN.test(code ?? "") || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("bottleneck summary input is invalid");
  }
  if (count > 0) target.set(code, (target.get(code) ?? 0) + count);
  else if (!allowZero && count !== 0) throw new Error("bottleneck summary input is invalid");
}

function sortedCounts(counts) {
  return [...counts.entries()].map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function hasGeneratorConstraint(api, browser) {
  const allReasons = [api?.generatorReasons, browser?.generatorReasons];
  for (const reasons of allReasons) {
    if (!Array.isArray(reasons) || reasons.some((reason) => !FIXED_CODE_PATTERN.test(reason))) {
      throw new Error("bottleneck summary input is invalid");
    }
  }
  return allReasons.some((reasons) => reasons.length > 0);
}

function normalizeSeries(series) {
  const result = {};
  for (const key of ["apiP95Ms", "apiErrorRatePercent", "dbCpuCredit"]) {
    result[key] = normalizePoints(series[key]);
  }
  result.ecsServices = {};
  for (const serviceKey of ECS_SERVICE_KEYS) {
    result.ecsServices[serviceKey] = {};
    for (const metricKey of ["cpuAverage", "cpuMaximum", "memoryAverage", "memoryMaximum"]) {
      result.ecsServices[serviceKey][metricKey] = normalizePoints(series.ecsServices?.[serviceKey]?.[metricKey]);
    }
  }
  return result;
}

function normalizePoints(points) {
  if (!Array.isArray(points)) throw new Error("bottleneck summary input is invalid");
  return points.map((point) => {
    const atUtc = nullableUtc(point?.atUtc);
    const value = nullableNonNegative(point?.value);
    if (atUtc === null || value === null) throw new Error("bottleneck summary input is invalid");
    return { atUtc, value };
  });
}

function normalizeEcsServices(value) {
  const result = {};
  for (const serviceKey of ECS_SERVICE_KEYS) {
    const service = value?.[serviceKey];
    result[serviceKey] = {
      cpu: normalizeResource(service?.cpu),
      memory: normalizeResource(service?.memory),
      status: nullableUtilizationStatus(service?.status),
      taskAnomaly: nullableBoolean(service?.taskAnomaly),
    };
  }
  return result;
}

function normalizeResource(value) {
  return {
    averagePercent: nullableNonNegative(value?.averagePercent),
    maximumPercent: nullableNonNegative(value?.maximumPercent),
    maximumAtUtc: nullableUtc(value?.maximumAtUtc),
    status: nullableUtilizationStatus(value?.status),
  };
}

function normalizeServerFailureEvidence(value) {
  if (!Array.isArray(value?.reasons)
    || value.reasons.some((reason) => !FIXED_CODE_PATTERN.test(reason ?? ""))) {
    throw new Error("bottleneck summary input is invalid");
  }
  return {
    detected: nullableBoolean(value.detected),
    reasons: [...new Set(value.reasons)].sort(),
    alb5xx: nullableNonNegative(value.alb5xx),
    albTarget5xx: nullableNonNegative(value.albTarget5xx),
    targetConnectionErrors: nullableNonNegative(value.targetConnectionErrors),
    ecsTaskAnomaly: nullableBoolean(value.ecsTaskAnomaly),
  };
}

function normalizeHoldRange(value) {
  return {
    minimum: nullableNonNegative(value?.minimum),
    average: nullableNonNegative(value?.average),
    maximum: nullableNonNegative(value?.maximum),
  };
}

function nullableUtilizationStatus(value) {
  return UTILIZATION_STATUSES.has(value) ? value : null;
}

function normalizeApiErrors(value) {
  const result = {};
  for (const key of ["target4xx", "alb5xx", "target5xx", "connectionErrors"]) {
    result[key] = nullableNonNegative(value?.[key]);
  }
  return result;
}

function normalizeDbCredit(value) {
  const result = {};
  for (const key of ["start", "end", "minimum", "decrease"]) result[key] = nullableNonNegative(value?.[key]);
  return result;
}

function assertMissingMetric(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !METRIC_PATTERN.test(value.metric ?? "") || !FIXED_CODE_PATTERN.test(value.reason ?? "")) {
    throw new Error("bottleneck summary input is invalid");
  }
}

function uniqueMissingMetrics(values) {
  for (const value of values) assertMissingMetric(value);
  return [...new Map(values.map((value) => [`${value.metric}:${value.reason}`, value])).values()]
    .map(({ metric, reason }) => ({ metric, reason }))
    .sort((left, right) => left.metric.localeCompare(right.metric) || left.reason.localeCompare(right.reason));
}

function safeRoute(value) {
  return typeof value === "string" && ROUTE_KEYS.has(value) ? value : null;
}

function nullableNonNegative(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function nullableUtc(value) {
  const parsed = parseUtc(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function parseUtc(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]00:00)$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toKst(value) {
  return new Date(Date.parse(value) + 9 * 3_600_000).toISOString().replace(/Z$/, "+09:00");
}

function minute(value) {
  const date = new Date(value);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function display(value) {
  return value === null ? "n/a" : String(value);
}

function displayMs(value) {
  return value === null ? "n/a" : `${value}ms`;
}

function displayPercent(value) {
  return value === null ? "n/a" : `${value}%`;
}

function displayBoolean(value) {
  return value === null ? "n/a" : value ? "있음" : "없음";
}

function displayCodes(values) {
  return values.length === 0 ? "없음" : values.map(({ code, count }) => `${code}(${count})`).join(", ");
}

function displayRoute(route, p95Ms) {
  return route === null || p95Ms === null ? "n/a" : `${route} (${p95Ms}ms)`;
}

function displayDb(value) {
  return [value.start, value.end, value.minimum, value.decrease].map(display).join(" / ");
}

function displayRisk(value) {
  return value.risk ? `${value.projectedExhaustionHours}시간` : "없음";
}

function displayRange(value) {
  return [value.minimum, value.average, value.maximum].map(displayMs).join(" / ");
}

function displayFailureEvidence(value) {
  return value.detected ? value.reasons.join(", ") : "없음";
}

function renderEcsServiceRow(serviceKey, service) {
  return `| ${serviceKey === "api" ? "API" : serviceKey} | ${displayPercent(service.cpu.averagePercent)} | ${displayPercent(service.cpu.maximumPercent)} | ${display(service.cpu.status)} | ${displayPercent(service.memory.averagePercent)} | ${displayPercent(service.memory.maximumPercent)} | ${display(service.memory.status)} | ${displayBoolean(service.taskAnomaly)} |`;
}

function renderCloudWatchImages(images) {
  if (images.length === 0) return ["이상 징후 없음 — 조건부 그래프 미생성"];
  return images.map((image) => image.status === "SUCCEEDED"
    ? `- [${image.fileName}](${image.localPath}) — SHA-256 \`${image.sha256}\` — S3 key \`${image.s3ObjectKey}\` — UTC ${image.startedAtUtc} ~ ${image.endedAtUtc}`
    : `- ${image.fileName}: ${image.failureCode}`);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

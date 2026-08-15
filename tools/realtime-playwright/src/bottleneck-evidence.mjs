const METRICS = Object.freeze({
  request: ["alb_request_count", "api.requestCount"],
  p95: ["api_target_response_time_p95", "api.p95Ms"],
  target4xx: ["api_target_4xx", "api.target4xx"],
  alb5xx: ["alb_5xx", "api.alb5xx"],
  target5xx: ["api_target_5xx", "api.target5xx"],
  connection: ["alb_target_connection_errors", "api.connectionErrors"],
  dbCredit: ["db_cpu_credit_balance", "dbCpuCredit"],
});
const ECS_SERVICE_KEYS = Object.freeze(["api", "frontend", "worker"]);
const STATUS_SEVERITY = Object.freeze({ NORMAL: 0, WARNING: 1, CRITICAL: 2, SATURATED: 3 });

export function normalizeBottleneckEvidence({
  cloudWatchRaw,
  ecsTaskEvidence,
  startedAtUtc,
  endedAtUtc,
} = {}) {
  const window = assertWindow(startedAtUtc, endedAtUtc);
  const metrics = indexMetrics(cloudWatchRaw?.MetricDataResults);
  const missingMetrics = [];
  const request = readMetric(metrics, METRICS.request, window);
  const requestTimestamps = request.points.map(({ atUtc }) => atUtc);
  const p95 = readMetric(metrics, METRICS.p95, window, { scale: 1000 });
  const target4xx = readMetric(metrics, METRICS.target4xx, window, {
    emptyIsZero: true,
    fallbackTimestamps: requestTimestamps,
  });
  const alb5xx = readMetric(metrics, METRICS.alb5xx, window, {
    emptyIsZero: true,
    fallbackTimestamps: requestTimestamps,
  });
  const target5xx = readMetric(metrics, METRICS.target5xx, window, {
    emptyIsZero: true,
    fallbackTimestamps: requestTimestamps,
  });
  const connection = readMetric(metrics, METRICS.connection, window, {
    emptyIsZero: true,
    fallbackTimestamps: requestTimestamps,
  });
  const dbCredit = readMetric(metrics, METRICS.dbCredit, window);
  for (const result of [request, p95, target4xx, alb5xx, target5xx, connection, dbCredit]) {
    if (result.missing) missingMetrics.push(result.missing);
  }

  const ecsMetricResults = {};
  const ecsTaskResults = {};
  const servicesInput = exactServiceMap(ecsTaskEvidence?.services) ? ecsTaskEvidence.services : {};
  for (const service of ECS_SERVICE_KEYS) {
    const resources = {};
    for (const resource of ["cpu", "memory"]) {
      const average = readMetric(metrics, ecsMetricDefinition(service, resource, "average"), window);
      const maximum = readMetric(metrics, ecsMetricDefinition(service, resource, "maximum"), window);
      resources[resource] = { average, maximum };
      for (const result of [average, maximum]) {
        if (result.missing) missingMetrics.push(result.missing);
      }
    }
    ecsMetricResults[service] = resources;
    const taskResult = normalizeEcsTaskEvidence(servicesInput[service]);
    ecsTaskResults[service] = taskResult;
    if (!taskResult.evidenceComplete) {
      missingMetrics.push({
        metric: `ecsServices.${service}.taskAnomaly`,
        reason: "ECS_TASK_EVIDENCE_INCOMPLETE",
      });
    }
  }

  const totalRequests = sumPoints(request.points);
  const apiErrors = {
    target4xx: target4xx.missing ? null : sumPoints(target4xx.points),
    alb5xx: alb5xx.missing ? null : sumPoints(alb5xx.points),
    target5xx: target5xx.missing ? null : sumPoints(target5xx.points),
    connectionErrors: connection.missing ? null : sumPoints(connection.points),
  };
  const failedRequests = [target4xx, alb5xx, target5xx, connection].some((result) => result.missing)
    ? null
    : apiErrors.target4xx + apiErrors.alb5xx + apiErrors.target5xx + apiErrors.connectionErrors;
  let errorRatePercent = null;
  let apiErrorRatePercent = [];
  if (totalRequests !== null && totalRequests > 0 && failedRequests !== null) {
    errorRatePercent = round(failedRequests / totalRequests * 100);
    apiErrorRatePercent = buildErrorRateSeries(
      request.points,
      target4xx.points,
      alb5xx.points,
      target5xx.points,
      connection.points,
    );
  } else if (!request.missing && totalRequests === 0) {
    missingMetrics.push({ metric: "api.errorRatePercent", reason: "ALB_REQUEST_COUNT_ZERO" });
  }

  const ecsServices = {};
  const ecsSeries = {};
  for (const service of ECS_SERVICE_KEYS) {
    const cpu = summarizeResource(ecsMetricResults[service].cpu);
    const memory = summarizeResource(ecsMetricResults[service].memory);
    ecsServices[service] = {
      cpu,
      memory,
      status: worstStatus(cpu.status, memory.status),
      taskAnomaly: ecsTaskResults[service].taskAnomaly,
    };
    ecsSeries[service] = {
      cpuAverage: ecsMetricResults[service].cpu.average.points,
      cpuMaximum: ecsMetricResults[service].cpu.maximum.points,
      memoryAverage: ecsMetricResults[service].memory.average.points,
      memoryMaximum: ecsMetricResults[service].memory.maximum.points,
    };
  }
  const taskAnomalies = ECS_SERVICE_KEYS.map((service) => ecsTaskResults[service].taskAnomaly);
  const ecsTaskAnomaly = taskAnomalies.some((value) => value === true)
    ? true
    : taskAnomalies.every((value) => value === false) ? false : null;
  const serverFailureReasons = [];
  if (apiErrors.alb5xx !== null && apiErrors.alb5xx > 0) serverFailureReasons.push("ALB_5XX");
  if (apiErrors.target5xx !== null && apiErrors.target5xx > 0) serverFailureReasons.push("ALB_TARGET_5XX");
  if (apiErrors.connectionErrors !== null && apiErrors.connectionErrors > 0) {
    serverFailureReasons.push("ALB_TARGET_CONNECTION_ERROR");
  }
  for (const service of ECS_SERVICE_KEYS) {
    if (ecsTaskResults[service].taskAnomaly === true) {
      serverFailureReasons.push(`ECS_${service.toUpperCase()}_TASK_ANOMALY`);
    }
  }
  const dbCpuCredit = summarizeDbCredit(dbCredit.points);
  const apiService = ecsServices.api;
  return {
    aggregate: {
      totalRequests,
      failedRequests,
      errorRatePercent,
      apiErrors,
      apiP95Ms: maximumPoint(p95.points)?.value ?? null,
      ecsServices,
      serverFailureEvidence: {
        detected: serverFailureReasons.length > 0,
        reasons: serverFailureReasons,
        alb5xx: apiErrors.alb5xx,
        albTarget5xx: apiErrors.target5xx,
        targetConnectionErrors: apiErrors.connectionErrors,
        ecsTaskAnomaly,
      },
      // Transitional alias retained until all existing report consumers use ecsServices.
      ecsApi: {
        averageCpuPercent: apiService.cpu.averagePercent,
        maximumCpuPercent: apiService.cpu.maximumPercent,
        maximumCpuAtUtc: apiService.cpu.maximumAtUtc,
        taskAnomaly: apiService.taskAnomaly,
      },
      dbCpuCredit,
    },
    series: {
      apiP95Ms: p95.points,
      apiErrorRatePercent,
      ecsServices: ecsSeries,
      // Transitional aliases retained for the existing chart until Task 3.
      ecsCpuAverage: ecsSeries.api.cpuAverage,
      ecsCpuMaximum: ecsSeries.api.cpuMaximum,
      dbCpuCredit: dbCredit.points,
    },
    missingMetrics: uniqueMissingMetrics(missingMetrics),
  };
}

export function classifyUtilization(maximumPercent) {
  if (maximumPercent === null) return null;
  const value = finiteNonNegative(maximumPercent);
  if (value === null) throw new Error("bottleneck evidence input is invalid");
  if (value >= 99) return "SATURATED";
  if (value >= 90) return "CRITICAL";
  if (value >= 80) return "WARNING";
  return "NORMAL";
}

function ecsMetricDefinition(service, resource, statistic) {
  const primary = `${service}_${resource}_${statistic}`;
  const ids = [primary];
  if (service === "api" && statistic === "average") {
    if (resource === "cpu") ids.push("api_cpu");
    if (resource === "memory") ids.push("api_memory");
  }
  return [ids, `ecsServices.${service}.${resource}.${statistic}Percent`];
}

function summarizeResource({ average, maximum }) {
  const maximumValue = maximumPoint(maximum.points);
  const maximumPercent = maximumValue?.value ?? null;
  return {
    averagePercent: averagePoints(average.points),
    maximumPercent,
    maximumAtUtc: maximumValue?.atUtc ?? null,
    status: classifyUtilization(maximumPercent),
  };
}

function worstStatus(left, right) {
  if (left === null || right === null) return null;
  return STATUS_SEVERITY[left] >= STATUS_SEVERITY[right] ? left : right;
}

function exactServiceMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === ECS_SERVICE_KEYS.length && ECS_SERVICE_KEYS.every((key) => keys.includes(key));
}

export function normalizeEcsTaskEvidence(value) {
  if (!hasCompleteTaskShape(value)) return { taskAnomaly: null, evidenceComplete: false };
  const snapshots = [value.before, value.after];
  const countsBad = snapshots.some((snapshot) =>
    snapshot.desiredCount !== snapshot.runningCount
      || snapshot.pendingCount !== 0
      || snapshot.rolloutState === "FAILED");
  const stoppedBad = value.stoppedTasks.some((task) =>
    task.stopCode !== "ServiceSchedulerInitiated"
      || task.essentialExitCodes.some((exitCode) => exitCode !== 0));
  return {
    taskAnomaly: countsBad || value.runningTaskSetChanged || stoppedBad,
    evidenceComplete: true,
  };
}

function assertWindow(startedAtUtc, endedAtUtc) {
  const start = parseUtc(startedAtUtc);
  const end = parseUtc(endedAtUtc);
  if (start === null || end === null || end <= start) {
    throw new Error("bottleneck evidence input is invalid");
  }
  return { start, end, bufferedStart: start - 120_000, bufferedEnd: end + 120_000 };
}

function indexMetrics(results) {
  if (!Array.isArray(results)) throw new Error("bottleneck evidence input is invalid");
  const metrics = new Map();
  for (const result of results) {
    if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.Id !== "string") {
      throw new Error("bottleneck evidence input is invalid");
    }
    if (!metrics.has(result.Id)) metrics.set(result.Id, []);
    metrics.get(result.Id).push(result);
  }
  return metrics;
}

function readMetric(metrics, definition, window, options = {}) {
  const [idOrIds, metricName] = definition;
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const matches = ids.flatMap((id) => metrics.get(id) ?? []);
  if (matches.length !== 1) return missingSeries(metricName, "METRIC_NOT_UNIQUE");
  const metric = matches[0];
  if (metric.StatusCode !== "Complete") return missingSeries(metricName, "METRIC_STATUS_INCOMPLETE");
  if (!Array.isArray(metric.Timestamps) || !Array.isArray(metric.Values)) {
    return missingSeries(metricName, "METRIC_SHAPE_INVALID");
  }
  if (metric.Timestamps.length !== metric.Values.length) {
    return missingSeries(metricName, "TIMESTAMP_VALUE_LENGTH_MISMATCH");
  }
  if (metric.Values.length === 0) {
    if (options.emptyIsZero && Array.isArray(options.fallbackTimestamps)) {
      return {
        points: options.fallbackTimestamps.map((atUtc) => ({ atUtc, value: 0 })),
        missing: null,
      };
    }
    return missingSeries(metricName, "METRIC_VALUES_MISSING");
  }

  const scale = options.scale ?? 1;
  const points = [];
  let previous = null;
  for (let index = 0; index < metric.Values.length; index += 1) {
    const epoch = parseUtc(metric.Timestamps[index]);
    const value = finiteNonNegative(metric.Values[index]);
    if (epoch === null) return missingSeries(metricName, "METRIC_TIMESTAMP_INVALID");
    if (value === null) return missingSeries(metricName, "METRIC_VALUE_INVALID");
    if (epoch < window.bufferedStart || epoch > window.bufferedEnd) {
      return missingSeries(metricName, "METRIC_TIMESTAMP_OUT_OF_RANGE");
    }
    if (previous !== null && epoch <= previous) {
      return missingSeries(metricName, "METRIC_TIMESTAMPS_NOT_ASCENDING");
    }
    previous = epoch;
    points.push({ atUtc: new Date(epoch).toISOString(), value: round(value * scale) });
  }
  return { points, missing: null };
}

function missingSeries(metric, reason) {
  return { points: [], missing: { metric, reason } };
}

function buildErrorRateSeries(request, target4xx, alb5xx, target5xx, connection) {
  const errorMaps = [target4xx, alb5xx, target5xx, connection]
    .map((points) => new Map(points.map(({ atUtc, value }) => [atUtc, value])));
  return request.map(({ atUtc, value }) => {
    const failed = errorMaps.reduce((total, values) => total + (values.get(atUtc) ?? 0), 0);
    return { atUtc, value: value > 0 ? round(failed / value * 100) : null };
  }).filter(({ value }) => value !== null);
}

function summarizeDbCredit(points) {
  if (points.length === 0) return { start: null, end: null, minimum: null, decrease: null };
  const start = points[0].value;
  const end = points.at(-1).value;
  return {
    start,
    end,
    minimum: Math.min(...points.map(({ value }) => value)),
    decrease: round(Math.max(0, start - end)),
  };
}

function maximumPoint(points) {
  let maximum = null;
  for (const point of points) {
    if (maximum === null || point.value > maximum.value) maximum = point;
  }
  return maximum;
}

function averagePoints(points) {
  return points.length === 0 ? null : round(sumPoints(points) / points.length);
}

function sumPoints(points) {
  return points.length === 0 ? null : round(points.reduce((total, point) => total + point.value, 0));
}

function hasCompleteTaskShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.runningTaskSetChanged !== "boolean"
    || !Array.isArray(value.stoppedTasks)) return false;
  for (const snapshot of [value.before, value.after]) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
      || ![snapshot.desiredCount, snapshot.runningCount, snapshot.pendingCount].every(isNonNegativeInteger)
      || typeof snapshot.rolloutState !== "string"
      || !new Set(["COMPLETED", "IN_PROGRESS", "FAILED"]).has(snapshot.rolloutState)) return false;
  }
  return value.stoppedTasks.every((task) => task && typeof task === "object" && !Array.isArray(task)
    && typeof task.stopCode === "string" && /^[A-Za-z0-9_]{1,64}$/.test(task.stopCode)
    && Array.isArray(task.essentialExitCodes)
    && task.essentialExitCodes.every(isNonNegativeInteger));
}

function uniqueMissingMetrics(values) {
  return [...new Map(values.map((value) => [`${value.metric}:${value.reason}`, value])).values()]
    .sort((left, right) => left.metric.localeCompare(right.metric) || left.reason.localeCompare(right.reason));
}

function parseUtc(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? parsed : null;
}

function finiteNonNegative(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

const SERVICE_KEYS = ["api", "frontend", "worker"];
const APPROVED_FILENAMES = new Set([
  "ecs-resource-utilization.png",
  "server-failure-signals.png",
]);
const IMAGE_STATUSES = new Set(["WARNING", "CRITICAL", "SATURATED"]);
const DIMENSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const S3_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}$/;

export function planCloudWatchEvidenceImages({ evidence, dimensions, startedAtUtc, endedAtUtc } = {}) {
  const window = bufferedWindow(startedAtUtc, endedAtUtc);
  const safeDimensions = normalizeDimensions(dimensions);
  assertEvidence(evidence);
  const resourceWarning = SERVICE_KEYS.some((serviceKey) => {
    const service = evidence.aggregate.ecsServices[serviceKey];
    return IMAGE_STATUSES.has(service.cpu.status) || IMAGE_STATUSES.has(service.memory.status);
  });
  const serverFailure = evidence.aggregate.serverFailureEvidence.detected === true;
  if (!resourceWarning && !serverFailure) return [];

  const requests = [{
    fileName: "ecs-resource-utilization.png",
    widget: resourceWidget(safeDimensions, window),
  }];
  if (serverFailure) {
    requests.push({
      fileName: "server-failure-signals.png",
      widget: failureWidget(safeDimensions, window),
    });
  }
  return requests;
}

export function normalizeCloudWatchImageEvidence(value) {
  if (!Array.isArray(value) || value.length > APPROVED_FILENAMES.size) invalidEvidence();
  const seen = new Set();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || !APPROVED_FILENAMES.has(entry.fileName) || seen.has(entry.fileName)) invalidEvidence();
    seen.add(entry.fileName);
    if (entry.status === "FAILED") {
      assertExactKeys(entry, ["fileName", "status", "failureCode"]);
      if (entry.failureCode !== "CLOUDWATCH_IMAGE_GENERATION_FAILED") invalidEvidence();
      return { fileName: entry.fileName, status: entry.status, failureCode: entry.failureCode };
    }
    if (entry.status !== "SUCCEEDED") invalidEvidence();
    assertExactKeys(entry, [
      "fileName", "status", "sha256", "createdAtUtc", "startedAtUtc", "endedAtUtc", "localPath", "s3ObjectKey",
    ]);
    const createdAtUtc = normalizeUtc(entry.createdAtUtc);
    const startedAtUtc = normalizeUtc(entry.startedAtUtc);
    const endedAtUtc = normalizeUtc(entry.endedAtUtc);
    if (!SHA256_PATTERN.test(entry.sha256 ?? "")
      || createdAtUtc === null || startedAtUtc === null || endedAtUtc === null
      || Date.parse(endedAtUtc) <= Date.parse(startedAtUtc)
      || entry.localPath !== `cloudwatch-images/${entry.fileName}`
      || !validS3Key(entry.s3ObjectKey, entry.fileName)) invalidEvidence();
    return {
      fileName: entry.fileName,
      status: entry.status,
      sha256: entry.sha256,
      createdAtUtc,
      startedAtUtc,
      endedAtUtc,
      localPath: entry.localPath,
      s3ObjectKey: entry.s3ObjectKey,
    };
  });
}

function resourceWidget(dimensions, window) {
  const colors = {
    api: ["#d97706", "#fbbf24"],
    frontend: ["#2563eb", "#60a5fa"],
    worker: ["#7c3aed", "#c084fc"],
  };
  const metrics = SERVICE_KEYS.flatMap((serviceKey) => [
    ecsMetric("CPUUtilization", serviceKey, "CPU", colors[serviceKey][0], dimensions),
    ecsMetric("MemoryUtilization", serviceKey, "Memory", colors[serviceKey][1], dimensions),
  ]);
  return baseWidget("ECS service maximum CPU / memory", window, metrics, {
    horizontal: [
      { label: "WARNING 80%", value: 80, color: "#f59e0b" },
      { label: "CRITICAL 90%", value: 90, color: "#dc2626" },
      { label: "SATURATED 99%", value: 99, color: "#7f1d1d" },
    ],
  });
}

function failureWidget(dimensions, window) {
  const targetDimensions = [
    "LoadBalancer", dimensions.loadBalancer,
    "TargetGroup", dimensions.targetGroup,
  ];
  const metrics = [
    ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", dimensions.loadBalancer,
      { stat: "Sum", label: "ALB generated 5xx", color: "#991b1b" }],
    ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", ...targetDimensions,
      { stat: "Sum", label: "ALB target 5xx", color: "#dc2626" }],
    ["AWS/ApplicationELB", "TargetConnectionErrorCount", "LoadBalancer", dimensions.loadBalancer,
      { stat: "Sum", label: "ALB target connection errors", color: "#7f1d1d" }],
    ["AWS/ApplicationELB", "TargetResponseTime", ...targetDimensions,
      { stat: "p95", label: "API p95", color: "#2563eb", yAxis: "right" }],
  ];
  return baseWidget("Server failure signals and API p95", window, metrics);
}

function ecsMetric(metricName, serviceKey, resourceLabel, color, dimensions) {
  return [
    "AWS/ECS", metricName,
    "ClusterName", dimensions.clusterName,
    "ServiceName", dimensions.serviceNames[serviceKey],
    { stat: "Maximum", label: `${serviceKey} ${resourceLabel} Maximum`, color },
  ];
}

function baseWidget(title, window, metrics, annotations = undefined) {
  const widget = {
    width: 1600,
    height: 800,
    period: 60,
    view: "timeSeries",
    stacked: false,
    start: window.start,
    end: window.end,
    title,
    metrics,
  };
  if (annotations) widget.annotations = annotations;
  return widget;
}

function bufferedWindow(startedAtUtc, endedAtUtc) {
  const start = normalizeUtc(startedAtUtc);
  const end = normalizeUtc(endedAtUtc);
  if (start === null || end === null || Date.parse(end) <= Date.parse(start)) invalidPlan();
  return {
    start: new Date(Date.parse(start) - 5 * 60_000).toISOString(),
    end: new Date(Date.parse(end) + 5 * 60_000).toISOString(),
  };
}

function normalizeDimensions(value) {
  const serviceNames = value?.serviceNames;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !serviceNames || typeof serviceNames !== "object" || Array.isArray(serviceNames)) invalidPlan();
  const result = {
    clusterName: safeDimension(value.clusterName),
    serviceNames: Object.fromEntries(SERVICE_KEYS.map((key) => [key, safeDimension(serviceNames[key])])),
    loadBalancer: safeDimension(value.loadBalancer),
    targetGroup: safeDimension(value.targetGroup),
  };
  if (Object.values(result).some((item) => item === null)
    || Object.values(result.serviceNames).some((item) => item === null)) invalidPlan();
  return result;
}

function safeDimension(value) {
  if (typeof value !== "string" || !DIMENSION_PATTERN.test(value)
    || value.includes("..") || value.includes("//") || /arn:|token|https?:/i.test(value)) return null;
  return value;
}

function assertEvidence(value) {
  if (!value?.aggregate?.ecsServices || !value.aggregate.serverFailureEvidence
    || typeof value.aggregate.serverFailureEvidence.detected !== "boolean") invalidPlan();
  for (const serviceKey of SERVICE_KEYS) {
    const service = value.aggregate.ecsServices[serviceKey];
    if (!service?.cpu || !service?.memory) invalidPlan();
  }
}

function normalizeUtc(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]00:00)$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function validS3Key(value, fileName) {
  return typeof value === "string" && S3_KEY_PATTERN.test(value)
    && !value.includes("..") && !value.includes("//")
    && value.endsWith(`/cloudwatch-images/${fileName}`)
    && !/arn:|token|https?:/i.test(value);
}

function assertExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) invalidEvidence();
}

function invalidPlan() {
  throw new Error("invalid CloudWatch image plan input");
}

function invalidEvidence() {
  throw new Error("invalid CloudWatch image evidence");
}

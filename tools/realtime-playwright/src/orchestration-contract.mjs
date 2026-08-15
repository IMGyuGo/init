import { allocateStage } from "./stage-allocation.mjs";

export const APPROVED_STAGE_USERS = Object.freeze([1, 15, 25, 50, 100, 200]);

/**
 * SSM으로 전달할 값은 token을 포함하지 않는 검증된 argv 배열로만 만든다.
 * shell 문자열 조립은 호출자에게 맡기지 않아 run ID를 통한 명령 삽입도 차단한다.
 */
export function buildHostCommand({ runId, stageUsers, assignedUsers, attempt, startAtEpoch }) {
  assertRunId(runId);
  assertApprovedStage(stageUsers);
  assertIntegerBetween(assignedUsers, "assigned users", 0, 10);
  assertIntegerBetween(attempt, "attempt", 1, Number.MAX_SAFE_INTEGER);
  assertIntegerBetween(startAtEpoch, "start epoch", 1, Number.MAX_SAFE_INTEGER);
  if (assignedUsers > stageUsers) throw new Error("assigned users cannot exceed stage users");

  const startAt = new Date(startAtEpoch * 1_000);
  if (Number.isNaN(startAt.getTime())) throw new Error("start epoch is invalid");
  return [
    "sudo",
    "env",
    "PLAYWRIGHT_RENDER_MODE=render-lite",
    "/usr/local/bin/run-playwright-loadtest",
    "--run-id", runId,
    "--stage-users", String(stageUsers),
    "--assigned-users", String(assignedUsers),
    "--attempt", String(attempt),
    "--start-at", startAt.toISOString(),
    "--hold-seconds", "150",
  ];
}

/** Terraform의 안정적인 01..20 output을 실제 instance ID와 단계 배정으로 결합한다. */
export function buildStagePlan({ stageUsers, instances }) {
  assertApprovedStage(stageUsers);
  const rawEntries = instances && typeof instances === "object" && !Array.isArray(instances)
    ? Object.entries(instances)
    : [];
  if (rawEntries.length !== 20) throw new Error("stage plan requires exactly 20 instances");

  const normalized = rawEntries.map(([key, value]) => normalizeInstance(key, value));
  const indices = normalized.map((instance) => instance.index);
  if (new Set(indices).size !== indices.length) throw new Error("duplicate instance index");
  const instanceIds = normalized.map((instance) => instance.instanceId);
  if (new Set(instanceIds).size !== instanceIds.length) throw new Error("duplicate instance id");
  if (normalized.some((instance) => instance.key !== String(instance.index).padStart(2, "0"))) {
    throw new Error("instance key does not match its index");
  }
  normalized.sort((left, right) => left.index - right.index);
  if (normalized.some((instance, position) => instance.index !== position + 1)) {
    throw new Error("instance indices must cover 1 through 20");
  }

  const allocation = allocateStage(stageUsers, 20, 10);
  return normalized.map(({ key: _key, ...instance }, index) => ({
    ...instance,
    assignedUsers: allocation[index],
  }));
}

/** Collect가 AWS CLI get-metric-data 입력으로 변환할 수 있는 순수 metric 계약이다. */
export function buildCloudWatchMetricQuery({
  start,
  end,
  albArnSuffix,
  apiTargetGroupArnSuffix,
  clusterName,
  serviceNames,
  instanceIds = [],
}) {
  const startAt = utcDate(start, "metric start");
  const endAt = utcDate(end, "metric end");
  if (endAt <= startAt) throw new Error("metric end must be after start");
  assertDimension(albArnSuffix, "ALB ARN suffix");
  assertDimension(apiTargetGroupArnSuffix, "API target group ARN suffix");
  assertDimension(clusterName, "ECS cluster name");
  assertDimension(serviceNames?.api, "API service name");
  assertDimension(serviceNames?.frontend, "frontend service name");
  assertDimension(serviceNames?.worker, "worker service name");
  if (!Array.isArray(instanceIds) || instanceIds.some((id) => typeof id !== "string" || !/^i-[a-zA-Z0-9-]+$/.test(id))) {
    throw new Error("EC2 instance ids are invalid");
  }

  const albDimensions = { LoadBalancer: albArnSuffix };
  const targetDimensions = { LoadBalancer: albArnSuffix, TargetGroup: apiTargetGroupArnSuffix };
  const metrics = [
    { id: "alb_request_count", namespace: "AWS/ApplicationELB", name: "RequestCount", dimensions: albDimensions, stat: "Sum", period: 60 },
    { id: "api_target_response_time_p50", namespace: "AWS/ApplicationELB", name: "TargetResponseTime", dimensions: targetDimensions, stat: "p50", period: 60 },
    { id: "api_target_response_time_p95", namespace: "AWS/ApplicationELB", name: "TargetResponseTime", dimensions: targetDimensions, stat: "p95", period: 60 },
    { id: "api_target_response_time_p99", namespace: "AWS/ApplicationELB", name: "TargetResponseTime", dimensions: targetDimensions, stat: "p99", period: 60 },
    { id: "api_target_4xx", namespace: "AWS/ApplicationELB", name: "HTTPCode_Target_4XX_Count", dimensions: targetDimensions, stat: "Sum", period: 60 },
    { id: "alb_5xx", namespace: "AWS/ApplicationELB", name: "HTTPCode_ELB_5XX_Count", dimensions: albDimensions, stat: "Sum", period: 60 },
    { id: "api_target_5xx", namespace: "AWS/ApplicationELB", name: "HTTPCode_Target_5XX_Count", dimensions: targetDimensions, stat: "Sum", period: 60 },
    { id: "alb_target_connection_errors", namespace: "AWS/ApplicationELB", name: "TargetConnectionErrorCount", dimensions: albDimensions, stat: "Sum", period: 60 },
  ];
  for (const serviceKey of ["api", "frontend", "worker"]) {
    for (const [resourceKey, metricName] of [["cpu", "CPUUtilization"], ["memory", "MemoryUtilization"]]) {
      for (const [statisticKey, stat] of [["average", "Average"], ["maximum", "Maximum"]]) {
        metrics.push({
          id: `${serviceKey}_${resourceKey}_${statisticKey}`,
          namespace: "AWS/ECS",
          name: metricName,
          dimensions: { ClusterName: clusterName, ServiceName: serviceNames[serviceKey] },
          stat,
          period: 60,
        });
      }
    }
  }
  for (const [index, instanceId] of instanceIds.entries()) {
    const prefix = `ec2_${String(index + 1).padStart(2, "0")}`;
    const dimensions = { InstanceId: instanceId };
    metrics.push(
      { id: `${prefix}_cpu`, namespace: "AWS/EC2", name: "CPUUtilization", dimensions, stat: "Average", period: 60 },
      { id: `${prefix}_network_in`, namespace: "AWS/EC2", name: "NetworkIn", dimensions, stat: "Sum", period: 60 },
      { id: `${prefix}_network_out`, namespace: "AWS/EC2", name: "NetworkOut", dimensions, stat: "Sum", period: 60 },
      { id: `${prefix}_credit_balance`, namespace: "AWS/EC2", name: "CPUCreditBalance", dimensions, stat: "Average", period: 60 },
    );
  }
  return {
    start: startAt.toISOString(),
    end: endAt.toISOString(),
    metrics,
  };
}

function normalizeInstance(key, value) {
  if (!value || typeof value !== "object") throw new Error(`instance ${key} is invalid`);
  const index = value.instance_index ?? value.instanceIndex;
  const instanceId = value.instance_id ?? value.instanceId;
  const rowStart = value.row_start ?? value.rowStart;
  const rowEnd = value.row_end ?? value.rowEnd;
  assertIntegerBetween(index, `instance ${key} index`, 1, 20);
  if (typeof instanceId !== "string" || !/^i-[a-zA-Z0-9-]+$/.test(instanceId)) {
    throw new Error(`instance ${key} id is invalid`);
  }
  assertIntegerBetween(rowStart, `instance ${key} row start`, 1, 200);
  assertIntegerBetween(rowEnd, `instance ${key} row end`, 1, 200);
  if (rowStart !== (index - 1) * 10 + 1 || rowEnd !== index * 10) {
    throw new Error(`instance ${key} row range is invalid`);
  }
  return { key, index, instanceId, rowStart, rowEnd };
}

function assertRunId(value) {
  if (typeof value !== "string" || !/^run-[a-z0-9][a-z0-9_-]{0,59}$/.test(value)) {
    throw new Error("run id is invalid");
  }
}

function assertApprovedStage(value) {
  if (!APPROVED_STAGE_USERS.includes(value)) throw new Error("stage users is not an approved stage");
}

function assertIntegerBetween(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function utcDate(value, name) {
  if (typeof value !== "string" || !value.endsWith("Z")) throw new Error(`${name} must be UTC`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} is invalid`);
  return parsed;
}

function assertDimension(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:/=-]+$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
}

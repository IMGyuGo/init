const RUN_ID_PATTERN = /^run-[a-z0-9][a-z0-9_-]{0,59}$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const STAGES = [50, 100, 200];
const VERDICTS = new Set([
  "PASS", "PASS_WITH_DB_CREDIT_RISK", "FAIL_APPLICATION", "FAIL_DATABASE",
  "FAIL_USER_FLOW", "INSUFFICIENT_LOAD", "INSUFFICIENT_EVIDENCE",
]);

export function buildFinalBottleneckReport({ runId, bucket, stages } = {}) {
  const ordered = validateFinalStages(runId, bucket, stages);
  const firstDegradation = ordered.find((stage, index) => index > 0
    && isDegraded(stage, ordered[index - 1]));
  const firstBottleneck = ordered.find((stage) =>
    stage.verdict === "FAIL_APPLICATION" || stage.verdict === "FAIL_DATABASE");
  const comparison = ordered.map((stage) => toComparisonRow(stage, bucket));
  return {
    markdown: renderFinalMarkdown({ runId, ordered, comparison, firstDegradation, firstBottleneck }),
    comparison,
  };
}

function validateFinalStages(runId, bucket, stages) {
  if (!RUN_ID_PATTERN.test(runId ?? "") || !validBucket(bucket) || !Array.isArray(stages) || stages.length !== 3) {
    throw new Error("final bottleneck input is invalid");
  }
  const ordered = [...stages].sort((left, right) => left?.stage - right?.stage);
  if (!STAGES.every((stage, index) => ordered[index]?.stage === stage)) {
    throw new Error("final bottleneck input is invalid");
  }
  for (const stage of ordered) validateStage(runId, stage);
  return ordered;
}

function validateStage(runId, stage) {
  const numbers = [
    stage?.attempt,
    stage?.users?.target,
    stage?.users?.started,
    stage?.users?.completed,
    stage?.users?.failed,
    stage?.users?.successRatePercent,
    stage?.api?.errorRatePercent,
    stage?.ecsApi?.maximumCpuPercent,
    stage?.dbCpuCredit?.decrease,
  ];
  if (stage?.runId !== runId || stage.users?.target !== stage.stage
    || !Number.isSafeInteger(stage.attempt) || stage.attempt < 1
    || numbers.some((value) => !Number.isFinite(value) || value < 0)
    || (stage.api?.p95Ms !== null && (!Number.isFinite(stage.api?.p95Ms) || stage.api.p95Ms < 0))
    || !VERDICTS.has(stage.verdict) || !Array.isArray(stage.reasons) || !Array.isArray(stage.missingMetrics)) {
    throw new Error("final bottleneck input is invalid");
  }
}

function validBucket(value) {
  return typeof value === "string" && BUCKET_PATTERN.test(value)
    && !value.includes("..") && !/^\d+\.\d+\.\d+\.\d+$/.test(value);
}

function isDegraded(current, previous) {
  const latencyDegraded = current.api.p95Ms !== null && previous.api.p95Ms !== null
    && current.api.p95Ms > previous.api.p95Ms * 1.5;
  return latencyDegraded
    || current.api.errorRatePercent > previous.api.errorRatePercent
    || current.users.successRatePercent < previous.users.successRatePercent;
}

function toComparisonRow(stage, bucket) {
  return {
    stage: stage.stage,
    successRatePercent: stage.users.successRatePercent,
    apiP95Ms: stage.api.p95Ms,
    apiErrorRatePercent: stage.api.errorRatePercent,
    ecsMaximumCpuPercent: stage.ecsApi.maximumCpuPercent,
    dbCreditDecrease: stage.dbCpuCredit.decrease,
    verdict: stage.verdict,
    pngS3Path: `s3://${bucket}/runs/${stage.runId}/stages/${stage.stage}/attempt-${stage.attempt}/bottleneck-summary.png`,
  };
}

function renderFinalMarkdown({ runId, ordered, comparison, firstDegradation, firstBottleneck }) {
  const stage200 = ordered.find(({ stage }) => stage === 200);
  const dbRisk = stage200.verdict === "PASS_WITH_DB_CREDIT_RISK"
    || stage200.reasons.includes("DB_CREDIT_24H_RISK");
  const insufficient = ordered.filter(({ api }) => api.p95Ms === null).map(({ stage }) => stage);
  const rows = comparison.map((row) =>
    `| ${row.stage} | ${display(row.successRatePercent, "%")} | ${display(row.apiP95Ms, "ms")} | ${display(row.apiErrorRatePercent, "%")} | ${display(row.ecsMaximumCpuPercent, "%")} | ${display(row.dbCreditDecrease)} | ${row.verdict} | [PNG](${row.pngS3Path}) |`);
  return [
    `# 최종 병목 비교: ${runId}`,
    "",
    `- 최초 성능 저하 단계: ${firstDegradation ? `${firstDegradation.stage}명` : "없음"}`,
    `- 최초 병목: ${firstBottleneck ? `${firstBottleneck.stage}명 ${firstBottleneck.verdict}` : "없음"}`,
    `- 200명 장시간 DB credit 위험: ${dbRisk ? "있음" : "없음"}`,
    `- 근거 불충분 stage: ${insufficient.length > 0 ? insufficient.map((stage) => `${stage}명`).join(", ") : "없음"}`,
    "",
    "| stage | 사용자 성공률 | API p95 | API 오류율 | ECS API 최대 CPU | DB credit 감소량 | 판정 | 단계 그래프 |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function display(value, suffix = "") {
  return value === null ? "n/a" : `${value}${suffix}`;
}

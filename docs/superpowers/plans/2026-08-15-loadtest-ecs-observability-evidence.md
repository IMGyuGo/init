# Load Test ECS Observability Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 150초 미달을 실패에서 제외하면서 API·frontend·worker ECS의 CPU·메모리 상태와 5xx·연결 오류·태스크 중단 증거를 결과에 남기고, 이상 시 AWS CloudWatch 원본 PNG를 생성한다.

**Architecture:** nGrinder 결과 정규화는 실제 유지 시간과 샘플 수를 관찰 정보로 보존하되 hold 시간만으로 실패시키지 않는다. CloudWatch/ECS 원본은 `bottleneck-evidence.mjs`에서 단일 정규화 스키마로 변환하고, 별도 순수 모듈이 AWS metric widget 요청을 계획한다. PowerShell controller는 그 계획만 실행해 AWS CLI가 반환한 base64 PNG를 파일로 저장하고 SHA-256 metadata를 stage 요약기에 전달한다.

**Tech Stack:** Groovy nGrinder script, Node.js ESM, TypeScript Playwright unit tests, PowerShell 7 controller, AWS CLI v2 CloudWatch/ECS/S3 APIs.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-15-loadtest-ecs-observability-evidence-design.md`.
- `heldMs < 150000`만으로 VU 또는 stage를 실패 처리하지 않는다.
- API, frontend, worker의 CPU·메모리 Average/Maximum/peak timestamp를 항상 결과에 표시한다.
- CPU·메모리 상태는 `NORMAL < 80`, `WARNING >= 80`, `CRITICAL >= 90`, `SATURATED >= 99`로 분류하되 실행 중단 조건으로 사용하지 않는다.
- ALB 대상 5xx, ALB 대상 연결 오류, ECS 태스크/배포 이상은 `SERVER_FAILURE_EVIDENCE`로 보존한다.
- 조건부 그래프 범위는 stage 시작 5분 전부터 종료 5분 후까지이며 AWS `GetMetricWidgetImage`가 렌더링한 PNG만 증거 이미지로 인정한다.
- API 4xx는 집계하되 서버 장애로 분류하지 않는다.
- URL, token, application ID, session ID, response body, task ARN, container ARN 및 secret 값은 결과에 기록하지 않는다.
- 기존 dirty worktree의 무관한 사용자 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: Treat hold duration as observation, not failure

**Files:**
- Modify: `tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts`
- Modify: `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts`
- Modify: `tools/realtime-playwright/ngrinder/hybrid-interview.groovy:116-139`
- Modify: `tools/realtime-playwright/src/ngrinder-contract.mjs:121-153`
- Modify: `tools/realtime-playwright/src/ngrinder-contract.mjs:297-395`

**Interfaces:**
- Consumes: per-VU safe JSON fields `status`, `failureCode`, `heldMs`, `runtimeSamples`, API counters and route aggregates.
- Produces: `virtualUsers.holdMs.{minimum,average,maximum}`, `virtualUsers.runtimeSamplesComplete`, and a verdict that ignores hold duration alone.

- [ ] **Step 1: Write failing contract tests for a short but complete VU**

Add a test that changes one otherwise safe VU to the legacy result shape produced by attempt 7:

```ts
test("treats a legacy HOLD_INCOMPLETE result as completed observation", () => {
  const input = cleanNgrinderReport(1);
  input.vuResults[0].result = {
    ...input.vuResults[0].result,
    status: "FAILED",
    failureCode: "HOLD_INCOMPLETE",
    heldMs: 147_369,
    runtimeSamples: 5,
  };

  const summary = normalizeNgrinderReport(input);

  expect(summary.verdict).toBe("PASSED");
  expect(summary.passedUsers).toBe(1);
  expect(summary.failedUsers).toBe(0);
  expect(summary.holdMs).toEqual({ minimum: 147_369, average: 147_369, maximum: 147_369 });
  expect(summary.failureReasons).not.toContain("VU_HOLD_INCOMPLETE");
});
```

Add a second test proving an incomplete sample count is still rejected:

```ts
test("rejects a VU that did not complete all runtime samples", () => {
  const input = cleanNgrinderReport(1);
  input.vuResults[0].result.runtimeSamples = 4;
  expect(normalizeNgrinderReport(input).failureReasons).toContain("VU_RUNTIME_SAMPLES_INCOMPLETE");
});
```

Update the Groovy source contract test to require `runtimeSamples != 5`, reject the literal `heldMs < 150_000L`, and continue requiring `heldMs` in safe output.

- [ ] **Step 2: Run focused tests and verify RED**

Run from `tools/realtime-playwright`:

```powershell
npm run test:unit -- tests/unit/ngrinder-contract.spec.ts tests/unit/hybrid-orchestration.spec.ts
```

Expected: the legacy short-hold case returns `FAILED`, the sample failure code is absent, and the Groovy source still contains the 150,000ms comparison.

- [ ] **Step 3: Implement the minimal hold-only relaxation**

Change `afterThread()` to check sample completion only:

```groovy
long heldMs = elapsedHoldMilliseconds()
if (runtimeSamples != 5) {
  throw new SafeFailure("RUNTIME_SAMPLES_INCOMPLETE")
}
status = "PASSED"
writeResult()
```

Keep the current sleep cadence and `heldMs` measurement; do not replace it with another hard duration gate.

In `parseVirtualUserResults`, classify this exact legacy shape as observationally completed:

```js
const holdOnlyLegacyFailure = result.status === "FAILED"
  && failureCode === "HOLD_INCOMPLETE"
  && runtimeSamples === 5
  && counters.every((value) => value === 0);
const passed = (result.status === "PASSED" && failureCode === "NONE") || holdOnlyLegacyFailure;
runtimeSamplesComplete = runtimeSamplesComplete && runtimeSamples === 5;
holdValues.push(Number(heldMs));
```

Remove `VU_HOLD_INCOMPLETE` from `failureReasons`, add `VU_RUNTIME_SAMPLES_INCOMPLETE`, and expose rounded minimum/average/maximum hold values. Do not forgive `HOLD_INCOMPLETE` if any API error counter is non-zero.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm run test:unit -- tests/unit/ngrinder-contract.spec.ts tests/unit/hybrid-orchestration.spec.ts
```

Expected: both files pass; short hold is visible but not a failure; four samples still fail.

- [ ] **Step 5: Commit Task 1 only**

```powershell
git add tools/realtime-playwright/ngrinder/hybrid-interview.groovy tools/realtime-playwright/src/ngrinder-contract.mjs tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts
git commit -m "fix(loadtest): 유지 시간을 관찰 지표로 전환"
```

---

### Task 2: Normalize CPU, memory, and task evidence for all ECS services

**Files:**
- Modify: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/cloudwatch-raw.json`
- Modify: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/ecs-task-evidence.json`
- Modify: `tools/realtime-playwright/tests/unit/bottleneck-evidence.spec.ts`
- Modify: `tools/realtime-playwright/src/bottleneck-evidence.mjs`

**Interfaces:**
- Consumes: CloudWatch IDs `api|frontend|worker` × `cpu|memory` × `average|maximum`, plus per-service ECS task evidence.
- Produces: `aggregate.ecsServices`, `series.ecsServices`, `aggregate.serverFailureEvidence`, and fixed missing-metric reasons.

- [ ] **Step 1: Expand fixtures and write failing multi-service tests**

Use these exact raw IDs:

```text
api_cpu_average, api_cpu_maximum, api_memory_average, api_memory_maximum
frontend_cpu_average, frontend_cpu_maximum, frontend_memory_average, frontend_memory_maximum
worker_cpu_average, worker_cpu_maximum, worker_memory_average, worker_memory_maximum
```

For backward-compatible reprocessing of already collected evidence, accept `api_cpu` as an alias of `api_cpu_average` and `api_memory` as an alias of `api_memory_average` only when the new ID is absent. Keep the existing `api_cpu_maximum` ID. If both a primary ID and its legacy alias exist, reject the metric as `METRIC_NOT_UNIQUE` rather than choosing silently.

Change task evidence to:

```json
{
  "services": {
    "api": { "before": {}, "after": {}, "runningTaskSetChanged": false, "stoppedTasks": [] },
    "frontend": { "before": {}, "after": {}, "runningTaskSetChanged": false, "stoppedTasks": [] },
    "worker": { "before": {}, "after": {}, "runningTaskSetChanged": false, "stoppedTasks": [] }
  }
}
```

The existing safe snapshot fields remain `desiredCount`, `runningCount`, `pendingCount`, `rolloutState`, `stopCode`, and `essentialExitCodes`.

Add assertions such as:

```ts
expect(evidence.aggregate.ecsServices.api).toEqual({
  cpu: { averagePercent: 25, maximumPercent: 50, maximumAtUtc: "2026-08-15T00:02:00.000Z", status: "NORMAL" },
  memory: { averagePercent: 60, maximumPercent: 80, maximumAtUtc: "2026-08-15T00:02:00.000Z", status: "WARNING" },
  status: "WARNING",
  taskAnomaly: false,
});
expect(Object.keys(evidence.aggregate.ecsServices)).toEqual(["api", "frontend", "worker"]);
```

Add table-driven boundaries for `79.999`, `80`, `90`, and `99`. Add independent cases proving target 5xx, connection errors, and each service's task anomaly set:

```ts
expect(evidence.aggregate.serverFailureEvidence).toEqual({
  detected: true,
  reasons: ["ALB_TARGET_5XX", "ECS_API_TASK_ANOMALY"],
  albTarget5xx: 1,
  targetConnectionErrors: 0,
  ecsTaskAnomaly: true,
});
```

Add a case with target 4xx only and assert `detected === false`.

- [ ] **Step 2: Run the evidence tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/unit/bottleneck-evidence.spec.ts
```

Expected: `ecsServices`, memory maxima, status classification and server failure evidence do not exist.

- [ ] **Step 3: Implement the multi-service normalizer**

Replace single API CPU definitions with generated frozen definitions for the three approved service keys, including the two explicit legacy aliases described above. Implement and export:

```js
export function classifyUtilization(maximumPercent) {
  if (maximumPercent === null) return null;
  if (maximumPercent >= 99) return "SATURATED";
  if (maximumPercent >= 90) return "CRITICAL";
  if (maximumPercent >= 80) return "WARNING";
  return "NORMAL";
}
```

For each service, read four metric series, calculate average-of-Average points, maximum-of-Maximum points, peak UTC time and the more severe CPU/memory status. Normalize ECS task evidence separately for each service, then build sorted fixed reason codes:

```text
ALB_TARGET_5XX
ALB_TARGET_CONNECTION_ERROR
ECS_API_TASK_ANOMALY
ECS_FRONTEND_TASK_ANOMALY
ECS_WORKER_TASK_ANOMALY
```

Keep target 4xx inside `apiErrors` and error-rate reporting but exclude it from `serverFailureEvidence.detected`.

- [ ] **Step 4: Run evidence tests and verify GREEN**

Run:

```powershell
npm run test:unit -- tests/unit/bottleneck-evidence.spec.ts
```

Expected: multi-service metrics, threshold boundaries, task anomalies, and 4xx exclusion all pass.

- [ ] **Step 5: Commit Task 2 only**

```powershell
git add tools/realtime-playwright/src/bottleneck-evidence.mjs tools/realtime-playwright/tests/unit/bottleneck-evidence.spec.ts tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/cloudwatch-raw.json tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/ecs-task-evidence.json
git commit -m "feat(loadtest): 전체 ECS 자원 증거 정규화"
```

---

### Task 3: Put ECS resources and server failure evidence in stage and final reports

**Files:**
- Modify: `tools/realtime-playwright/tests/unit/bottleneck-summary.spec.ts`
- Modify: `tools/realtime-playwright/tests/unit/bottleneck-final.spec.ts`
- Modify: `tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts`
- Modify: `tools/realtime-playwright/src/bottleneck-summary.mjs`
- Modify: `tools/realtime-playwright/src/bottleneck-final.mjs`
- Modify: `tools/realtime-playwright/src/bottleneck-chart.mjs`

**Interfaces:**
- Consumes: Task 2 `aggregate.ecsServices` and `aggregate.serverFailureEvidence`.
- Produces: stable stage JSON/Markdown fields, final comparison rows, and local summary chart annotations.

- [ ] **Step 1: Write failing report-schema and Markdown tests**

Require the stage summary top-level fields:

```ts
expect(Object.keys(summary)).toContain("ecsServices");
expect(Object.keys(summary)).toContain("serverFailureEvidence");
expect(summary.ecsServices.worker.memory.maximumPercent).toBe(72);
expect(summary.serverFailureEvidence.detected).toBe(false);
```

Require a three-row Markdown resource table and observational hold values:

```ts
expect(markdown).toContain("| API | 25% | 50% | NORMAL | 60% | 80% | WARNING |");
expect(markdown).toContain("| frontend |");
expect(markdown).toContain("| worker |");
expect(markdown).toContain("| 실제 유지 시간 최소/평균/최대 |");
expect(markdown).toContain("| 서버 장애 증거 | 없음 |");
```

Add failure cases proving 5xx, connection error and task anomaly reasons are rendered as fixed codes without raw response/task identifiers. Update final comparison expectations to include API/frontend/worker maximum CPU and memory and `SERVER_FAILURE_EVIDENCE` status.

- [ ] **Step 2: Run report tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/unit/bottleneck-summary.spec.ts tests/unit/bottleneck-final.spec.ts tests/unit/bottleneck-chart.spec.ts
```

Expected: new fields and table rows are absent.

- [ ] **Step 3: Implement the report schema and rendering**

Replace `summary.ecsApi` with `summary.ecsServices`, add `summary.serverFailureEvidence`, and preserve missing values as `null`/`n/a`. Include image-independent resource status in the existing local PNG chart, but do not treat `WARNING`, `CRITICAL`, or `SATURATED` alone as a failed verdict.

Update verdict correlation so `serverFailureEvidence.detected` is application-infrastructure evidence. Do not infer server failure from user failure, high CPU/memory alone, 4xx alone, or missing metrics.

Extend final rows with these exact fields:

```js
{
  apiMaximumCpuPercent,
  apiMaximumMemoryPercent,
  frontendMaximumCpuPercent,
  frontendMaximumMemoryPercent,
  workerMaximumCpuPercent,
  workerMaximumMemoryPercent,
  serverFailureEvidenceDetected,
}
```

- [ ] **Step 4: Run report tests and verify GREEN**

Run:

```powershell
npm run test:unit -- tests/unit/bottleneck-summary.spec.ts tests/unit/bottleneck-final.spec.ts tests/unit/bottleneck-chart.spec.ts
```

Expected: stage JSON, Markdown, local chart and final comparison tests pass.

- [ ] **Step 5: Commit Task 3 only**

```powershell
git add tools/realtime-playwright/src/bottleneck-summary.mjs tools/realtime-playwright/src/bottleneck-final.mjs tools/realtime-playwright/src/bottleneck-chart.mjs tools/realtime-playwright/tests/unit/bottleneck-summary.spec.ts tools/realtime-playwright/tests/unit/bottleneck-final.spec.ts tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts
git commit -m "feat(loadtest): ECS 용량과 장애 증거 보고"
```

---

### Task 4: Plan and validate conditional AWS CloudWatch images

**Files:**
- Create: `tools/realtime-playwright/src/cloudwatch-evidence-images.mjs`
- Create: `tools/realtime-playwright/scripts/plan-cloudwatch-evidence-images.mjs`
- Create: `tools/realtime-playwright/tests/unit/cloudwatch-evidence-images.spec.ts`
- Modify: `tools/realtime-playwright/scripts/summarize-bottleneck.mjs`
- Modify: `tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts`

**Interfaces:**
- Consumes: normalized evidence, safe AWS dimensions, stage UTC window and optional generated-image metadata.
- Produces: safe `cloudwatch-image-requests.json` and normalized `cloudWatchImages` report entries.

- [ ] **Step 1: Write failing pure-module tests for image planning**

Define the public functions:

```js
planCloudWatchEvidenceImages({ evidence, dimensions, startedAtUtc, endedAtUtc })
normalizeCloudWatchImageEvidence(value)
```

Test these behaviors:

```ts
expect(planCloudWatchEvidenceImages(normalEvidence)).toEqual([]);
expect(planCloudWatchEvidenceImages(cpuWarning)).toHaveLength(1);
expect(planCloudWatchEvidenceImages(serverFailure).map((item) => item.fileName)).toEqual([
  "ecs-resource-utilization.png",
  "server-failure-signals.png",
]);
```

Inspect each widget request and require:

```ts
expect(widget.start).toBe("2026-08-14T23:55:00.000Z");
expect(widget.end).toBe("2026-08-15T00:08:00.000Z");
expect(widget.annotations.horizontal.map((item) => item.value)).toEqual([80, 90, 99]);
expect(JSON.stringify(widget)).not.toMatch(/accountId|arn:|token|https?:\/\//i);
```

Test image metadata validation with a lowercase 64-character SHA-256, approved filenames, UTC creation time, local relative path and S3 object key. Reject absolute paths, unknown filenames and free-form error text. Accepted failure metadata uses fixed code `CLOUDWATCH_IMAGE_GENERATION_FAILED` and no SHA/path.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/unit/cloudwatch-evidence-images.spec.ts tests/unit/bottleneck-chart.spec.ts
```

Expected: module imports fail because the image planning module does not exist.

- [ ] **Step 3: Implement widget planning and summary input**

Build the resource widget with API/frontend/worker CPU Maximum and Memory Maximum lines plus 80/90/99 horizontal annotations. Build the failure widget with target 5xx Sum, target connection errors Sum and API p95 on a right axis. Use `width: 1600`, `height: 800`, `period: 60`, `view: "timeSeries"`, exact absolute UTC start/end, and no account ID.

The planner CLI accepts exact arguments:

```text
--started-at --ended-at --cloudwatch-raw --ecs-task-evidence --dimensions --output
```

It uses `normalizeBottleneckEvidence` rather than recalculating thresholds. Extend `summarize-bottleneck.mjs` with mandatory `--cloudwatch-images=<metadata.json>` and pass normalized metadata into `buildBottleneckSummary` so JSON and Markdown can link successful images or show the fixed failure reason.

- [ ] **Step 4: Run image-planning and summary tests and verify GREEN**

Run:

```powershell
npm run test:unit -- tests/unit/cloudwatch-evidence-images.spec.ts tests/unit/bottleneck-summary.spec.ts tests/unit/bottleneck-chart.spec.ts
```

Expected: normal stages produce no requests, warning stages produce one request, server failure stages produce two, and all metadata validation passes.

- [ ] **Step 5: Commit Task 4 only**

```powershell
git add tools/realtime-playwright/src/cloudwatch-evidence-images.mjs tools/realtime-playwright/scripts/plan-cloudwatch-evidence-images.mjs tools/realtime-playwright/scripts/summarize-bottleneck.mjs tools/realtime-playwright/tests/unit/cloudwatch-evidence-images.spec.ts tools/realtime-playwright/tests/unit/bottleneck-summary.spec.ts tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts
git commit -m "feat(loadtest): CloudWatch 증거 이미지 계획 추가"
```

---

### Task 5: Execute AWS image collection and collect all ECS service evidence

**Files:**
- Modify: `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts`
- Modify: `scripts/hybrid-loadtest.ps1:809-878`
- Modify: `scripts/hybrid-loadtest.ps1:880-965`
- Modify: `scripts/hybrid-loadtest.ps1:974-1009`
- Modify: `scripts/hybrid-loadtest.ps1:1203-1248`

**Interfaces:**
- Consumes: Task 4 safe widget request JSON and current Terraform outputs `ecs_cluster_name`, `ecs_service_names`, ALB suffix and API target-group suffix.
- Produces: AWS-rendered PNG files, SHA-256 metadata, all-service ECS task evidence, stage uploads and fixed collection-failure codes.

- [ ] **Step 1: Write failing orchestration source-contract tests**

Require all twelve ECS metric IDs and all-service task iteration:

```ts
for (const service of ["api", "frontend", "worker"]) {
  for (const resource of ["cpu", "memory"]) {
    expect(controller).toContain(`${service}_${resource}_average`);
    expect(controller).toContain(`${service}_${resource}_maximum`);
  }
}
expect(controller).toContain("Get-EcsServiceSnapshot");
expect(controller).toContain("Get-EcsServicesTaskEvidence");
```

Require the AWS image command and safe binary handling:

```ts
expect(controller).toContain("'cloudwatch', 'get-metric-widget-image'");
expect(controller).toContain("[Convert]::FromBase64String");
expect(controller).toContain("Get-FileHash -Algorithm SHA256");
expect(controller).toContain("CLOUDWATCH_IMAGE_GENERATION_FAILED");
expect(controller).not.toMatch(/get-metric-widget-image[^\n]+>/);
```

Require uploads for `cloudwatch-images.json` and the two approved PNG names without requiring that PNGs exist on normal stages.

- [ ] **Step 2: Run orchestration tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/unit/hybrid-orchestration.spec.ts
```

Expected: frontend/worker metrics, memory maxima, generalized task evidence and widget image commands are absent.

- [ ] **Step 3: Expand CloudWatch queries and ECS task evidence**

Generate the twelve ECS definitions from the fixed service/resource/statistic sets. Update required-value checks so every Average and Maximum ECS series must contain at least one point.

Generalize `Get-EcsApiSnapshot` to:

```powershell
Get-EcsServiceSnapshot -Context $Context -ServiceKey $serviceKey
```

Generalize the evidence collector to loop over the exact allowlist `api`, `frontend`, `worker`, returning `{ services = ... }`. Preserve only counts, rollout state, task-set-change boolean, fixed stop code, and essential exit codes.

- [ ] **Step 4: Implement AWS PNG retrieval without shell redirection**

Before `summarize-bottleneck.mjs`, call the Task 4 planner using a temporary safe dimensions JSON. For each approved request:

```powershell
$result = Invoke-External -FilePath 'aws' -Arguments @(
    'cloudwatch', 'get-metric-widget-image',
    '--metric-widget', "file://$widgetPath",
    '--output-format', 'png', '--output', 'text', '--region', $script:AwsRegion
)
$bytes = [Convert]::FromBase64String($result.Output.Trim())
[System.IO.File]::WriteAllBytes($imagePath, $bytes)
$sha256 = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
```

Validate the PNG signature and minimum nonzero length before marking success. On failure, delete any partial image and write only `{ fileName, status: "FAILED", failureCode: "CLOUDWATCH_IMAGE_GENERATION_FAILED" }`. Pass the metadata file to `summarize-bottleneck.mjs`, then upload successful images and `cloudwatch-images.json` with `Write-S3ObjectIfAbsent`.

- [ ] **Step 5: Run orchestration and focused report tests and verify GREEN**

Run:

```powershell
npm run test:unit -- tests/unit/hybrid-orchestration.spec.ts tests/unit/cloudwatch-evidence-images.spec.ts tests/unit/bottleneck-summary.spec.ts
```

Expected: all metric, task-evidence, base64, SHA-256 and conditional-upload contracts pass.

- [ ] **Step 6: Commit Task 5 only**

```powershell
git add scripts/hybrid-loadtest.ps1 tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts
git commit -m "feat(loadtest): AWS ECS 장애 그래프 증거 수집"
```

---

### Task 6: Full regression and current-result proof

**Files:**
- Modify only if a regression test exposes a defect in a Task 1-5 file.
- Evidence output: `D:\jungleCamp\loadtest-results\run-20260814-hybrid01\stages\50\attempt-7`

**Interfaces:**
- Consumes: all Task 1-5 behavior and the existing attempt-7 raw stage-50 artifacts.
- Produces: passing local regression evidence and a regenerated current-result report showing short hold as observation plus ECS CPU/memory values.

- [ ] **Step 1: Run the full unit suite**

Run from `tools/realtime-playwright`:

```powershell
npm run test:unit
```

Expected: all unit tests pass with zero failed tests.

- [ ] **Step 2: Run Playwright test discovery and Groovy validation contract**

Run:

```powershell
npm run test:list
```

Then run the existing nGrinder validation-only path through `scripts/hybrid-loadtest.ps1` using the stored encrypted credential. Expected: script validation succeeds without starting a real load stage.

- [ ] **Step 3: Re-normalize the existing attempt-7 nGrinder artifact**

Run `scripts/summarize-ngrinder.mjs` against:

```text
D:\jungleCamp\loadtest-results\run-20260814-hybrid01\raw\stage-50\ngrinder\detail.json
D:\jungleCamp\loadtest-results\run-20260814-hybrid01\raw\stage-50\ngrinder\report.csv
D:\jungleCamp\loadtest-results\run-20260814-hybrid01\raw\stage-50\ngrinder\resource-samples.ndjson
D:\jungleCamp\loadtest-results\run-20260814-hybrid01\raw\stage-50\ngrinder\vu-results
```

Write to a new diagnostic path rather than overwriting the original report. Expected: 45 reported users, 45 completed users, no `VU_HOLD_INCOMPLETE`, hold minimum `147369`, server5xx `0`, connectionErrors `0`.

- [ ] **Step 4: Regenerate stage evidence from existing raw CloudWatch data**

Use the stored stage window and existing `cloudwatch-raw.json` to produce a new diagnostic bottleneck report. Expected current values include approximately:

```text
API CPU Average point mean: 6.404%
API CPU Maximum peak: 42.049%
API Memory Average point mean: 16.610%
API Memory Average-series peak: 17.415%
SERVER_FAILURE_EVIDENCE: false
```

Because the old raw artifact lacks frontend/worker and memory-Maximum series, those fields must be `null` with fixed missing-metric reasons; they must not be invented as zero. Do not call AWS images for the old stage because no resource maximum reaches 80% and no server failure is present.

- [ ] **Step 5: Verify clean scoped diff and commit any test-driven regression fix**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Existing unrelated dirty files remain untouched. If no regression fix was needed, do not create an empty commit. If a fix was needed, stage only its test and implementation file and commit:

```powershell
git commit -m "test(loadtest): ECS 증거 회귀 검증"
```

---

## Implementation completion evidence

Before claiming completion, record:

- Exact unit test count and zero failures.
- nGrinder validation-only result.
- Attempt-7 re-normalized 45/45 result and observed minimum hold.
- ECS API CPU/memory values recovered from the existing raw artifact.
- A safe list of generated report and PNG paths; never print URLs, tokens, task ARNs, container ARNs or secret values.

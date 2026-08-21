# Hybrid Load-Test Bottleneck Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 nGrinder + Playwright strict 실행 계약을 바꾸지 않고 50명·100명·200명 단계별 병목 JSON·Markdown·PNG와 전체 비교 Markdown·PNG를 안전하게 생성한다.

**Architecture:** nGrinder VU 결과에는 고정 route key별 latency와 failure count만 추가하고, 기존 PowerShell 수집기는 CloudWatch 및 ECS의 읽기 전용 증거를 안전한 임시 입력으로 전달한다. 독립 Node 모듈이 집계·판정·Markdown·SVG를 만들며, 이미 설치된 Playwright Chromium이 PNG를 렌더링한다. 기존 hybrid strict verdict는 그대로 반환하고 병목 verdict는 별도 산출물에만 기록한다.

**Tech Stack:** Windows PowerShell 5.1, Node.js 20 LTS, ECMAScript modules, `@playwright/test` 1.61.1, nGrinder 3.5.9-p1 Groovy, AWS CLI v2, CloudWatch/ECS/RDS/S3

## Global Constraints

- 기존 실행 순서 `preflight -> canary -> 50 -> 100 -> 200`, SNI 복구, validation-only source variant, source-only save, token 비노출, lock/window, 150초 strict gate를 변경하지 않는다.
- 실제 canary 및 50명·100명·200명 실행은 각 실행 전에 사용자의 명시적 승인을 받는다.
- 구현·fixture 검증 중 Terraform apply, AWS 리소스 생성·수정·삭제, 실제 부하 테스트를 수행하지 않는다.
- Node.js는 20 LTS, package manager는 npm, Windows controller는 Windows PowerShell 5.1을 유지한다.
- 새 npm 패키지와 Terraform 변경을 추가하지 않는다. PNG는 기존 `@playwright/test`의 Chromium으로 렌더링한다.
- 자격증명, token, cookie, URL query, application/session ID, 개인정보, 이메일, 면접 답변 원문을 로그·JSON·Markdown·PNG·S3에 기록하지 않는다.
- Redis 상세 지표는 기존 결과에 Redis 오류가 있을 때만 후속 사유로 언급하고, generator 상세는 목표 부하 부족이나 agent 오류가 있을 때만 언급한다.
- 단계별로 `bottleneck-summary.json`, `bottleneck-summary.md`, `bottleneck-summary.png`만 추가하고 전체 완료 후 `bottleneck-final.md`, `stage-comparison.png`만 추가한다.
- 로컬 경로는 `D:\jungleCamp\loadtest-results\{runId}\stages\{stage}\attempt-{attempt}`와 `D:\jungleCamp\loadtest-results\{runId}\summary`, S3 key는 같은 `runs/{runId}` 상대 구조를 사용한다.
- 동일 stage/attempt의 기존 로컬 파일이나 S3 object는 덮어쓰지 않는다. S3 write는 AES256과 `If-None-Match: *`를 함께 사용한다.
- 병목 verdict는 `PASS`, `PASS_WITH_DB_CREDIT_RISK`, `FAIL_APPLICATION`, `FAIL_DATABASE`, `FAIL_USER_FLOW`, `INSUFFICIENT_LOAD`, `INSUFFICIENT_EVIDENCE` 중 하나만 사용한다.
- API p95·오류율, ECS CPU·task 상태, DB CPU credit의 시간 관계를 함께 판단하며 ECS CPU 단독 상승만으로 실패 판정을 내리지 않는다.
- `scripts` 변경은 담당 A, 검증 문서 변경은 PM의 cross-owner review 대상으로 기록한다.

## File Map

- Modify `tools/realtime-playwright/ngrinder/hybrid-interview.groovy`: 고정 route key별 latency와 failure count를 VU 안전 결과에 기록한다.
- Modify `tools/realtime-playwright/src/ngrinder-contract.mjs`: VU별 route 자료, 완료/실패 사용자, 고정 failure code 빈도를 안전한 API summary로 집계한다.
- Modify `tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts`: nGrinder 집계 계약과 민감정보 부재를 검증한다.
- Modify `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts`: Groovy와 PowerShell의 안전 계약을 정적 검증한다.
- Create `tools/realtime-playwright/src/bottleneck-evidence.mjs`: CloudWatch 시계열과 ECS task snapshot을 검증·정규화한다.
- Create `tools/realtime-playwright/src/bottleneck-summary.mjs`: 사용자/API/ECS/DB 집계, 7개 verdict, JSON allowlist, Markdown을 담당한다.
- Create `tools/realtime-playwright/src/bottleneck-chart.mjs`: 단계별 3패널 SVG/HTML과 전체 단계 비교 SVG/HTML을 만든다.
- Create `tools/realtime-playwright/scripts/summarize-bottleneck.mjs`: stage 입력을 읽고 JSON·Markdown·PNG를 비덮어쓰기 방식으로 생성한다.
- Create `tools/realtime-playwright/src/bottleneck-final.mjs`: 50·100·200 단계 비교와 최종 Markdown model을 만든다.
- Create `tools/realtime-playwright/scripts/summarize-bottleneck-final.mjs`: 최종 Markdown·PNG를 비덮어쓰기 방식으로 생성한다.
- Create `tools/realtime-playwright/tests/unit/bottleneck-evidence.spec.ts`: metric 정렬·누락·ECS anomaly를 검증한다.
- Create `tools/realtime-playwright/tests/unit/bottleneck-summary.spec.ts`: 집계·판정·허용 필드·비밀정보 부재를 검증한다.
- Create `tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts`: 1600×1200 PNG, 3패널, 공통 시간축, marker를 검증한다.
- Create `tools/realtime-playwright/tests/unit/bottleneck-final.spec.ts`: 3단계 최종 비교와 누락 단계 거부를 검증한다.
- Create `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/api-summary.json`: token 없는 nGrinder 정상 집계 fixture다.
- Create `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/browser-summary.json`: 고정 failure code만 포함한 browser 정상 fixture다.
- Create `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/cloudwatch-raw.json`: 60초 정렬 ALB/ECS/RDS 시계열 fixture다.
- Create `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/ecs-task-evidence.json`: 시작·종료 task 상태 fixture다.
- Create `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/hybrid-stage.json`: 기존 `HYBRID_PASSED` fixture다.
- Modify `scripts/hybrid-loadtest.ps1`: RDS dimension, metric query, ECS snapshot, 로컬/S3 경로, stage/final reporter 연결을 담당한다.
- Modify `tools/realtime-playwright/README.md`: 산출물, 판정, 안전 실행과 승인 경계를 문서화한다.

---

### Task 1: Safe nGrinder Route Metrics

**Files:**
- Modify: `tools/realtime-playwright/ngrinder/hybrid-interview.groovy:31-49,132-228,291-307`
- Modify: `tools/realtime-playwright/src/ngrinder-contract.mjs:113-164,283-333`
- Modify: `tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts:254-355,390-411`
- Modify: `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts:90-160`

**Interfaces:**
- Consumes: 각 VU의 기존 `status`, `failureCode`, `heldMs`, `runtimeSamples`, `apiCalls`, HTTP counter.
- Produces: `api-summary.json`의 기존 필드에 `passedUsers: number`, `failedUsers: number`, `failureStages: Array<{code:string,count:number}>`, `routes: Array<{key:string,sampleCount:number,p95Ms:number|null,failures:number}>`, `slowestRoute:string|null`, `slowestRouteP95Ms:number|null`를 추가한다.

- [ ] **Step 1: Write failing route contract tests**

`ngrinder-contract.spec.ts`에 정상 2 VU와 실패 1 VU를 사용해 정확한 고정 key 집계를 검증한다.

```ts
test("aggregates only fixed route latency and failure codes", () => {
  const report = cleanNgrinderReport(1);
  report.vuResults[0].result.routeLatencyMs = {
    APPLICATION_STATUS: [100], INTERVIEW_START: [200], INTERVIEW_RUNTIME: [300, 500],
    INTERVIEW_QUESTIONS: [250], DEVICE_CHECK: [], INTERVIEW_BEGIN: [],
  };
  report.vuResults[0].result.routeFailures = {
    APPLICATION_STATUS: 0, INTERVIEW_START: 0, INTERVIEW_RUNTIME: 0,
    INTERVIEW_QUESTIONS: 0, DEVICE_CHECK: 0, INTERVIEW_BEGIN: 0,
  };

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
  report.vuResults[0].result.routeLatencyMs = { ...routeLatencies(), SECRET_URL: [12] };
  expect(() => normalizeNgrinderReport(report)).toThrow("nGrinder report input is invalid");
});

function routeLatencies() {
  return {
    APPLICATION_STATUS: [100], INTERVIEW_START: [200], INTERVIEW_RUNTIME: [300],
    INTERVIEW_QUESTIONS: [250], DEVICE_CHECK: [], INTERVIEW_BEGIN: [],
  };
}
```

`hybrid-orchestration.spec.ts`에는 Groovy source가 route key를 인자로 받고 결과에 URL/ID를 넣지 않는 정적 검증을 추가한다.

```ts
test("nGrinder persists fixed route metrics without URL or identity fields", () => {
  const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
  expect(groovy).toContain('"APPLICATION_STATUS"');
  expect(groovy).toContain('"INTERVIEW_RUNTIME"');
  expect(groovy).toMatch(/classifyRequest\(String routeKey, Closure<HTTPResponse> action\)/);
  const safeResult = groovy.match(/Map<String, Object> safeResult = \[[\s\S]*?\n    \]/)?.[0] ?? "";
  expect(safeResult).toContain("routeLatencyMs: routeLatencyMs");
  expect(safeResult).toContain("routeFailures: routeFailures");
  expect(safeResult).not.toMatch(/applicationId|sessionId|magicToken|publicAccessToken|BASE_URL/);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\jungleCamp\.tools\ms-playwright'
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'fixed route|persists fixed route'
```

Expected: FAIL because route fields and the route-aware `classifyRequest` signature do not exist.

- [ ] **Step 3: Add fixed route timing to Groovy**

Add the allowlist and per-thread maps, pass an enum-like key at every HTTP call site, and time the request in `finally` so both success and failure samples are counted.

```groovy
private static final List<String> ROUTE_KEYS = Collections.unmodifiableList([
  "APPLICATION_STATUS", "INTERVIEW_START", "INTERVIEW_RUNTIME",
  "INTERVIEW_QUESTIONS", "DEVICE_CHECK", "INTERVIEW_BEGIN",
])
private final Map<String, List<Long>> routeLatencyMs = ROUTE_KEYS.collectEntries { [(it): []] }
private final Map<String, Integer> routeFailures = ROUTE_KEYS.collectEntries { [(it): 0] }

private HTTPResponse classifyRequest(String routeKey, Closure<HTTPResponse> action) {
  if (!ROUTE_KEYS.contains(routeKey)) throw new SafeFailure("ROUTE_KEY_INVALID")
  apiCalls++
  long startedAt = System.nanoTime()
  try {
    HTTPResponse response = action.call()
    int statusCode = response.statusCode
    if (statusCode >= 400 && statusCode < 500) { unexpected4xx++; throw new SafeFailure("HTTP_4XX") }
    if (statusCode >= 500) { server5xx++; throw new SafeFailure("HTTP_5XX") }
    if (statusCode < 200 || statusCode >= 300) throw new SafeFailure("HTTP_STATUS_UNEXPECTED")
    return response
  } catch (Throwable error) {
    routeFailures[routeKey] = routeFailures[routeKey] + 1
    if (error instanceof SafeFailure) throw error
    if (hasTimeoutType(error)) { timeouts++; throw new SafeFailure("HTTP_TIMEOUT") }
    connectionErrors++
    throw new SafeFailure("HTTP_CONNECTION_ERROR")
  } finally {
    long elapsedMs = Math.max(0L, (System.nanoTime() - startedAt) / 1_000_000L)
    routeLatencyMs[routeKey].add(elapsedMs)
  }
}
```

Change `sendGet`/`sendPost` to accept `routeKey`, call `classifyRequest(routeKey, ...)`, and use these exact mappings: status=`APPLICATION_STATUS`, start=`INTERVIEW_START`, runtime=`INTERVIEW_RUNTIME`, questions=`INTERVIEW_QUESTIONS`, device check=`DEVICE_CHECK`, begin=`INTERVIEW_BEGIN`. Add only these two fields to `safeResult`:

```groovy
routeLatencyMs: routeLatencyMs,
routeFailures: routeFailures,
```

- [ ] **Step 4: Aggregate route and user results in the Node contract**

Define the same fixed order and validate exact map keys before reading numeric values.

```js
const ROUTE_KEYS = Object.freeze([
  "APPLICATION_STATUS", "INTERVIEW_START", "INTERVIEW_RUNTIME",
  "INTERVIEW_QUESTIONS", "DEVICE_CHECK", "INTERVIEW_BEGIN",
]);

function parseRouteResults(result) {
  if (!sameKeys(result.routeLatencyMs, ROUTE_KEYS) || !sameKeys(result.routeFailures, ROUTE_KEYS)) {
    throw new Error("nGrinder report input is invalid");
  }
  return ROUTE_KEYS.map((key) => {
    const samples = result.routeLatencyMs[key].map(nonNegativeNumber);
    const failures = nonNegativeNumber(result.routeFailures[key]);
    if (samples.some((value) => value === null) || failures === null) {
      throw new Error("nGrinder report input is invalid");
    }
    return { key, samples: samples.map(Number), failures: Number(failures) };
  });
}
```

Extend `parseVirtualUserResults` to count `PASSED` users, fixed `failureCode` values matching `/^[A-Z0-9_]{1,64}$/`, and route samples. Sort `failureStages` by count descending then code ascending; sort `routes` by `ROUTE_KEYS`; choose the largest p95 and retain fixed key order on ties.

- [ ] **Step 5: Run focused and complete unit tests**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'nGrinder|fixed route'
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit
```

Expected: both commands exit 0; existing verdict and SNI/validation-only tests remain green.

- [ ] **Step 6: Commit the route metrics deliverable**

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- tools/realtime-playwright/ngrinder/hybrid-interview.groovy tools/realtime-playwright/src/ngrinder-contract.mjs tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'feat(loadtest): nGrinder 경로별 지연 집계 추가'
```

---

### Task 2: CloudWatch and ECS Evidence Normalization

**Files:**
- Create: `tools/realtime-playwright/src/bottleneck-evidence.mjs`
- Create: `tools/realtime-playwright/tests/unit/bottleneck-evidence.spec.ts`
- Create: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/cloudwatch-raw.json`
- Create: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/ecs-task-evidence.json`

**Interfaces:**
- Consumes: AWS `get-metric-data`의 `MetricDataResults`, `{ before, after, stoppedTasks }` task evidence, UTC stage window.
- Produces: `normalizeBottleneckEvidence({ cloudWatchRaw, ecsTaskEvidence, startedAtUtc, endedAtUtc }) -> { aggregate, series, missingMetrics }`.

- [ ] **Step 1: Add sanitized CloudWatch and ECS fixtures**

Use these exact metric IDs with ascending ISO timestamps and numeric values: `alb_request_count`, `api_target_response_time_p95`, `api_target_4xx`, `api_target_5xx`, `alb_target_connection_errors`, `api_cpu`, `api_cpu_maximum`, `db_cpu_credit_balance`. The task fixture contains counts, rollout state, a boolean task set change, and fixed exit codes only.

```json
{
  "before": { "desiredCount": 2, "runningCount": 2, "pendingCount": 0, "rolloutState": "COMPLETED" },
  "after": { "desiredCount": 2, "runningCount": 2, "pendingCount": 0, "rolloutState": "COMPLETED" },
  "runningTaskSetChanged": false,
  "stoppedTasks": []
}
```

The CloudWatch fixture uses three samples at `2026-08-15T00:00:00Z`, `00:01:00Z`, `00:02:00Z`; request values are `[100,120,130]`, p95 seconds are `[0.20,0.25,0.30]`, ECS average CPU `[20,25,30]`, ECS maximum CPU `[30,40,50]`, and DB credits `[10000,9999,9998]`. Error count metrics have status `Complete`; an empty error series means zero on request timestamps. The two-credit decrease over three minutes projects beyond 24 hours so this base fixture remains `PASS`.

- [ ] **Step 2: Write failing evidence tests**

```ts
test("normalizes aligned ALB ECS and RDS evidence", () => {
  const evidence = normalizeBottleneckEvidence(fixtureInput());
  expect(evidence.aggregate).toMatchObject({
    totalRequests: 350,
    failedRequests: 0,
    errorRatePercent: 0,
    apiP95Ms: 300,
    ecsApi: {
      averageCpuPercent: 25,
      maximumCpuPercent: 50,
      maximumCpuAtUtc: "2026-08-15T00:02:00.000Z",
      taskAnomaly: false,
    },
    dbCpuCredit: { start: 10000, end: 9998, minimum: 9998, decrease: 2 },
  });
  expect(evidence.series.apiP95Ms).toHaveLength(3);
  expect(evidence.missingMetrics).toEqual([]);
});

test("marks required value and timestamp mismatch as missing", () => {
  const input = fixtureInput();
  metric(input.cloudWatchRaw, "db_cpu_credit_balance").Timestamps.pop();
  const evidence = normalizeBottleneckEvidence(input);
  expect(evidence.missingMetrics).toContainEqual({
    metric: "dbCpuCredit",
    reason: "TIMESTAMP_VALUE_LENGTH_MISMATCH",
  });
  expect(evidence.aggregate.dbCpuCredit).toEqual({ start: null, end: null, minimum: null, decrease: null });
});

function fixtureInput() {
  const directory = resolve("tests/fixtures/bottleneck/stage-50");
  return {
    cloudWatchRaw: JSON.parse(readFileSync(join(directory, "cloudwatch-raw.json"), "utf8")),
    ecsTaskEvidence: JSON.parse(readFileSync(join(directory, "ecs-task-evidence.json"), "utf8")),
    startedAtUtc: "2026-08-15T00:00:00.000Z",
    endedAtUtc: "2026-08-15T00:03:00.000Z",
  };
}

function metric(input, id) {
  return input.MetricDataResults.find((entry) => entry.Id === id);
}
```

Add ECS cases for desired/running mismatch, pending task, failed rollout, unapproved task-set change, and non-zero essential exit code.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'ALB ECS and RDS|task anomaly'
```

Expected: FAIL because `bottleneck-evidence.mjs` does not exist.

- [ ] **Step 4: Implement deterministic metric normalization**

Expose the exact public function and keep helpers private.

```js
export function normalizeBottleneckEvidence({ cloudWatchRaw, ecsTaskEvidence, startedAtUtc, endedAtUtc } = {}) {
  const window = assertWindow(startedAtUtc, endedAtUtc);
  const metrics = indexMetrics(cloudWatchRaw?.MetricDataResults);
  const request = readSeries(metrics, "alb_request_count", window, { emptyIsZero: false });
  const p95 = readSeries(metrics, "api_target_response_time_p95", window, { scale: 1000 });
  const requestTimestamps = request.points.map(({ atUtc }) => atUtc);
  const target4xx = readSeries(metrics, "api_target_4xx", window, { emptyIsZero: true, timestamps: requestTimestamps });
  const target5xx = readSeries(metrics, "api_target_5xx", window, { emptyIsZero: true, timestamps: requestTimestamps });
  const connection = readSeries(metrics, "alb_target_connection_errors", window, { emptyIsZero: true, timestamps: requestTimestamps });
  const cpuAverage = readSeries(metrics, "api_cpu", window);
  const cpuMaximum = readSeries(metrics, "api_cpu_maximum", window);
  const dbCredit = readSeries(metrics, "db_cpu_credit_balance", window);
  const ecsTasks = normalizeEcsTaskEvidence(ecsTaskEvidence);
  return buildEvidence({ request, p95, target4xx, target5xx, connection, cpuAverage, cpuMaximum, dbCredit, ecsTasks });
}
```

`readSeries` must require exactly one metric ID, `StatusCode === "Complete"`, equal timestamp/value lengths, finite non-negative values, ascending timestamps, and stage-buffer timestamps only. Count metrics with a complete empty series are expanded to zero at request timestamps; p95/CPU/DB empty series is missing evidence. Compute maximum CPU timestamp by the first maximum on a tie.

- [ ] **Step 5: Implement ECS anomaly rules**

```js
export function normalizeEcsTaskEvidence(value) {
  const countsBad = [value?.before, value?.after].some((snapshot) =>
    !snapshot || snapshot.desiredCount !== snapshot.runningCount || snapshot.pendingCount !== 0
      || snapshot.rolloutState === "FAILED");
  const stoppedBad = Array.isArray(value?.stoppedTasks) && value.stoppedTasks.some((task) =>
    task.stopCode !== "ServiceSchedulerInitiated"
      || task.essentialExitCodes.some((exitCode) => exitCode !== 0));
  const taskAnomaly = countsBad || value?.runningTaskSetChanged === true || stoppedBad;
  return { taskAnomaly, evidenceComplete: hasCompleteTaskShape(value) };
}
```

If the shape is incomplete, set `taskAnomaly` to `null` and add `{ metric: "ecsApi.taskAnomaly", reason: "ECS_TASK_EVIDENCE_INCOMPLETE" }`; never infer `false` from missing data.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'bottleneck evidence|ALB ECS and RDS|task anomaly'
```

Expected: exit 0.

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- tools/realtime-playwright/src/bottleneck-evidence.mjs tools/realtime-playwright/tests/unit/bottleneck-evidence.spec.ts tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/cloudwatch-raw.json tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/ecs-task-evidence.json
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'feat(loadtest): 병목 인프라 증거 정규화 추가'
```

---

### Task 3: Stage Aggregation, Verdict, JSON, and Markdown

**Files:**
- Create: `tools/realtime-playwright/src/bottleneck-summary.mjs`
- Create: `tools/realtime-playwright/tests/unit/bottleneck-summary.spec.ts`
- Create: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/api-summary.json`
- Create: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/browser-summary.json`
- Create: `tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/hybrid-stage.json`

**Interfaces:**
- Consumes: Task 1 API summary, browser summary, `{ verdict: "HYBRID_PASSED"|"FAILED"|"GENERATOR_CONSTRAINED" }`, Task 2 evidence, stage identity/window.
- Produces: `buildBottleneckSummary(input) -> { summary, details, series }` and `renderBottleneckMarkdown({ summary, details }) -> string`.

- [ ] **Step 1: Create the three safe stage fixtures**

Write the API fixture with 45 completed users, all six route rows, no failures, and only fixed safe codes. Write the browser fixture with five completed users and the approved VU labels only. Write the hybrid fixture as the existing strict verdict.

```json
{
  "expectedUsers": 45,
  "reportedUsers": 45,
  "passedUsers": 45,
  "failedUsers": 0,
  "tests": 225,
  "errors": 0,
  "failureStages": [],
  "routes": [
    { "key": "APPLICATION_STATUS", "sampleCount": 45, "p95Ms": 100, "failures": 0 },
    { "key": "INTERVIEW_START", "sampleCount": 45, "p95Ms": 200, "failures": 0 },
    { "key": "INTERVIEW_RUNTIME", "sampleCount": 315, "p95Ms": 490, "failures": 0 },
    { "key": "INTERVIEW_QUESTIONS", "sampleCount": 90, "p95Ms": 250, "failures": 0 },
    { "key": "DEVICE_CHECK", "sampleCount": 0, "p95Ms": null, "failures": 0 },
    { "key": "INTERVIEW_BEGIN", "sampleCount": 0, "p95Ms": null, "failures": 0 }
  ],
  "slowestRoute": "INTERVIEW_RUNTIME",
  "slowestRouteP95Ms": 490,
  "generatorReasons": [],
  "verdict": "PASSED"
}
```

```json
{
  "total": 5,
  "passed": 5,
  "failed": 0,
  "generatorReasons": [],
  "virtualUsers": [
    { "vu": "vu-001", "status": "passed", "failureCode": null },
    { "vu": "vu-021", "status": "passed", "failureCode": null },
    { "vu": "vu-061", "status": "passed", "failureCode": null },
    { "vu": "vu-081", "status": "passed", "failureCode": null },
    { "vu": "vu-131", "status": "passed", "failureCode": null }
  ],
  "verdict": "PASSED"
}
```

```json
{ "verdict": "HYBRID_PASSED" }
```

- [ ] **Step 2: Write the JSON allowlist and safe Markdown tests**

```ts
test("writes only the approved bottleneck JSON fields", () => {
  const { summary } = buildBottleneckSummary(passInput());
  expect(Object.keys(summary)).toEqual([
    "runId", "stage", "attempt", "startedAtUtc", "endedAtUtc", "startedAtKst", "endedAtKst",
    "users", "api", "ecsApi", "dbCpuCredit", "verdict", "reasons", "missingMetrics",
  ]);
  expect(Object.keys(summary.users)).toEqual(["target", "started", "completed", "failed", "successRatePercent"]);
  expect(Object.keys(summary.api)).toEqual(["p95Ms", "slowestRoute", "slowestRouteP95Ms", "errorRatePercent"]);
  const serialized = JSON.stringify(summary);
  expect(serialized).not.toMatch(/totalRequests|failedRequests|majorFailureStages|representativeErrors/);
  expect(serialized).not.toMatch(/magicToken|publicAccessToken|applicationId|sessionId|Authorization|@/i);
});

test("keeps extra minimum metrics in Markdown only", () => {
  const report = buildBottleneckSummary(passInput());
  const markdown = renderBottleneckMarkdown(report);
  expect(markdown).toContain("전체 요청 수 | 350");
  expect(markdown).toContain("실패 요청 수 | 0");
  expect(markdown).toContain("DB credit 예상 소진 위험");
  expect(markdown).not.toMatch(/magicToken|applicationId|sessionId|https?:\/\//i);
});
```

- [ ] **Step 3: Write all seven verdict tests before implementation**

Use table-driven mutations with one expected verdict per row.

```ts
function passInput() {
  const directory = resolve("tests/fixtures/bottleneck/stage-50");
  const cloudWatchRaw = readJson(join(directory, "cloudwatch-raw.json"));
  const ecsTaskEvidence = readJson(join(directory, "ecs-task-evidence.json"));
  return {
    runId: "run-20260815-bottleneck",
    stage: 50,
    attempt: 1,
    startedAtUtc: "2026-08-15T00:00:00.000Z",
    endedAtUtc: "2026-08-15T00:03:00.000Z",
    api: readJson(join(directory, "api-summary.json")),
    browser: readJson(join(directory, "browser-summary.json")),
    hybridVerdict: readJson(join(directory, "hybrid-stage.json")).verdict,
    evidence: normalizeBottleneckEvidence({
      cloudWatchRaw, ecsTaskEvidence,
      startedAtUtc: "2026-08-15T00:00:00.000Z",
      endedAtUtc: "2026-08-15T00:03:00.000Z",
    }),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const [name, mutate, verdict] of [
  ["pass", (input) => input, "PASS"],
  ["db risk", withDbExhaustionUnder24Hours, "PASS_WITH_DB_CREDIT_RISK"],
  ["application", withCorrelatedApiAndEcsFailure, "FAIL_APPLICATION"],
  ["database", withCorrelatedApiAndDbFailure, "FAIL_DATABASE"],
  ["user flow", withUserFlowFailureOnly, "FAIL_USER_FLOW"],
  ["load", withMissingStartedUsers, "INSUFFICIENT_LOAD"],
  ["evidence", withMissingRequiredMetric, "INSUFFICIENT_EVIDENCE"],
] as const) {
  test(`classifies ${name}`, () => {
    expect(buildBottleneckSummary(mutate(passInput())).summary.verdict).toBe(verdict);
  });
}

function withFailedApiUser(input) {
  const value = structuredClone(input);
  value.api.passedUsers = 44;
  value.api.failedUsers = 1;
  value.api.failureStages = [{ code: "HTTP_5XX", count: 1 }];
  value.hybridVerdict = "FAILED";
  value.evidence.aggregate.errorRatePercent = 1;
  value.evidence.series.apiErrorRatePercent = [{ atUtc: "2026-08-15T00:01:00.000Z", value: 1 }];
  return value;
}

function withDbExhaustionUnder24Hours(input) {
  const value = structuredClone(input);
  value.evidence.aggregate.dbCpuCredit = { start: 100, end: 50, minimum: 50, decrease: 50 };
  value.evidence.series.dbCpuCredit = [
    { atUtc: "2026-08-15T00:00:00.000Z", value: 100 },
    { atUtc: "2026-08-15T00:02:00.000Z", value: 50 },
  ];
  return value;
}

function withCorrelatedApiAndEcsFailure(input) {
  const value = withFailedApiUser(input);
  value.evidence.aggregate.ecsApi.averageCpuPercent = 20;
  value.evidence.aggregate.ecsApi.maximumCpuPercent = 50;
  value.evidence.series.ecsCpuMaximum = [{ atUtc: "2026-08-15T00:01:00.000Z", value: 50 }];
  return value;
}

function withCorrelatedApiAndDbFailure(input) {
  const value = withFailedApiUser(input);
  value.evidence.series.ecsCpuMaximum = [{ atUtc: "2026-08-15T00:01:00.000Z", value: 20 }];
  value.evidence.aggregate.dbCpuCredit = { start: 100, end: 10, minimum: 10, decrease: 90 };
  value.evidence.series.dbCpuCredit = [
    { atUtc: "2026-08-15T00:00:00.000Z", value: 100 },
    { atUtc: "2026-08-15T00:01:00.000Z", value: 10 },
  ];
  return value;
}

function withUserFlowFailureOnly(input) {
  const value = withFailedApiUser(input);
  value.evidence.aggregate.errorRatePercent = 0;
  value.evidence.series.apiErrorRatePercent = [];
  return value;
}

function withMissingStartedUsers(input) {
  const value = structuredClone(input);
  value.api.reportedUsers = 44;
  return value;
}

function withMissingRequiredMetric(input) {
  const value = structuredClone(input);
  value.evidence.aggregate.apiP95Ms = null;
  value.evidence.missingMetrics = [{ metric: "api.p95Ms", reason: "METRIC_VALUES_MISSING" }];
  return value;
}
```

Also test that CPU 95% with successful users, zero error rate, no task anomaly, and no DB risk remains `PASS`.

- [ ] **Step 4: Run focused tests and confirm RED**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'approved bottleneck JSON|classifies|CPU 95'
```

Expected: FAIL because `bottleneck-summary.mjs` does not exist.

- [ ] **Step 5: Implement exact user and failure aggregation**

```js
const VERDICTS = new Set([
  "PASS", "PASS_WITH_DB_CREDIT_RISK", "FAIL_APPLICATION", "FAIL_DATABASE",
  "FAIL_USER_FLOW", "INSUFFICIENT_LOAD", "INSUFFICIENT_EVIDENCE",
]);

function aggregateUsers(stage, api, browser) {
  const target = Number(stage);
  const started = Number(api.reportedUsers) + Number(browser.total);
  const completed = Number(api.passedUsers) + Number(browser.passed);
  if (![50, 100, 200].includes(target) || ![started, completed].every(Number.isSafeInteger)
    || completed > target) throw new Error("bottleneck summary input is invalid");
  return {
    target,
    started,
    completed,
    failed: target - completed,
    successRatePercent: round(completed / target * 100, 3),
  };
}
```

Build `details.majorFailureStages` from API `failureStages` and browser `virtualUsers[].failureCode`, retaining only `/^[A-Z0-9_]{1,64}$/`, sorted by count descending/code ascending, maximum five. Build `details.representativeErrors` from those codes plus fixed `ALB_TARGET_4XX`, `ALB_TARGET_5XX`, `ALB_CONNECTION_ERROR` counters; never copy exception text.

- [ ] **Step 6: Implement deterministic time-correlation verdicts**

Use minute-aligned timestamps from Task 2. A signal is correlated only when timestamps are equal after truncating seconds to `:00Z`.

```js
function chooseVerdict({ users, hybridVerdict, evidence, appCorrelation, dbCorrelation, dbRisk }) {
  if (users.started < users.target || hybridVerdict === "GENERATOR_CONSTRAINED") {
    const reasons = [];
    if (users.started < users.target) reasons.push("TARGET_LOAD_NOT_REACHED");
    if (hybridVerdict === "GENERATOR_CONSTRAINED") reasons.push("GENERATOR_CONSTRAINED");
    return ["INSUFFICIENT_LOAD", reasons];
  }
  if (evidence.missingMetrics.length > 0) {
    return ["INSUFFICIENT_EVIDENCE", ["REQUIRED_METRIC_MISSING"]];
  }
  const failed = users.failed > 0 || evidence.aggregate.errorRatePercent > 0 || hybridVerdict === "FAILED";
  if (failed && dbCorrelation) return ["FAIL_DATABASE", ["DB_CREDIT_FAILURE_CORRELATED"]];
  if (failed && appCorrelation) return ["FAIL_APPLICATION", ["API_ECS_FAILURE_CORRELATED"]];
  if (failed) return ["FAIL_USER_FLOW", ["USER_FLOW_FAILURE_WITHOUT_INFRA_CORRELATION"]];
  if (dbRisk) return ["PASS_WITH_DB_CREDIT_RISK", ["DB_CREDIT_24H_RISK"]];
  return ["PASS", []];
}
```

`appCorrelation` is true when `taskAnomaly === true`, or an error-rate-positive minute shares a minute with ECS maximum CPU at least 20 percentage points above stage average. `dbCorrelation` is true when a failure minute shares a minute with a DB credit decrease and either credit reaches zero or falls to 20% or less of stage start. `dbRisk` is true only when DB has at least two samples, positive decrease, and `endCredit / (decrease / stageDurationHours) < 24` hours. Store the projected hours in Markdown details only and label it as a short-window linear estimate.

- [ ] **Step 7: Implement exact JSON and Markdown renderers**

Build UTC times with `new Date(value).toISOString()`. Build KST times by adding nine hours to the UTC epoch for the calendar fields and replacing the final `Z` with `+09:00`. Missing values remain present as `null`, with `{ metric, reason }` entries sorted by metric/reason.

```js
export function renderBottleneckMarkdown({ summary, details }) {
  return [
    `# 병목 요약: ${summary.runId} / ${summary.stage}명 / attempt-${summary.attempt}`,
    "",
    `- 판정: ${summary.verdict}`,
    `- 구간: ${summary.startedAtUtc} ~ ${summary.endedAtUtc}`,
    `- 사용자: ${summary.users.completed}/${summary.users.target} (${summary.users.successRatePercent}%)`,
    "",
    "| 최소 지표 | 값 |",
    "| --- | ---: |",
    `| 전체 요청 수 | ${display(details.totalRequests)} |`,
    `| 실패 요청 수 | ${display(details.failedRequests)} |`,
    `| 대표 오류 유형 | ${displayCodes(details.representativeErrors)} |`,
    `| 주요 실패 단계 | ${displayCodes(details.majorFailureStages)} |`,
    `| DB credit 예상 소진 위험 | ${displayRisk(details.dbCreditRisk)} |`,
    "",
    "짧은 stage 구간을 선형 외삽한 값이며 장기 예측을 보장하지 않는다.",
    "",
  ].join("\n");
}
```

- [ ] **Step 8: Run all summary tests and commit**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'bottleneck JSON|extra minimum|classifies|CPU 95'
```

Expected: exit 0 and all seven verdicts pass.

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- tools/realtime-playwright/src/bottleneck-summary.mjs tools/realtime-playwright/tests/unit/bottleneck-summary.spec.ts tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/api-summary.json tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/browser-summary.json tools/realtime-playwright/tests/fixtures/bottleneck/stage-50/hybrid-stage.json
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'feat(loadtest): 단계별 병목 판정과 요약 추가'
```

---

### Task 4: Three-Panel Stage PNG and Artifact CLI

**Files:**
- Create: `tools/realtime-playwright/src/bottleneck-chart.mjs`
- Create: `tools/realtime-playwright/scripts/summarize-bottleneck.mjs`
- Create: `tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts`

**Interfaces:**
- Consumes: Task 3 `{ summary, details, series }` and explicit filesystem arguments.
- Produces: exactly `bottleneck-summary.json`, `bottleneck-summary.md`, `bottleneck-summary.png`; `buildStageChartHtml(report) -> string`; `main(argv, io) -> Promise<number>`.

- [ ] **Step 1: Write chart structure and non-overwrite tests**

```ts
test("renders one 1600x1200 PNG with three aligned panels", async () => {
  const html = buildStageChartHtml(passReport());
  expect(html.match(/data-panel=/g)).toHaveLength(3);
  expect(html).toContain('data-panel="api"');
  expect(html).toContain('data-panel="ecs"');
  expect(html).toContain('data-panel="db"');
  expect(html.match(/data-marker="stage-start"/g)).toHaveLength(3);
  expect(html.match(/data-marker="stage-end"/g)).toHaveLength(3);
  const result = await runStageCliFixture();
  expect(result.exitCode).toBe(0);
  expect(readPngSize(result.pngPath)).toEqual({ width: 1600, height: 1200 });
});

test("refuses to overwrite any stage artifact", async () => {
  const fixture = await runStageCliFixture();
  const second = await runStageCliFixture(fixture.output);
  expect(second.exitCode).toBe(1);
  expect(second.stderr.at(-1)).toBe(JSON.stringify({ error: "BOTTLENECK_OUTPUT_EXISTS" }));
});

function readPngSize(path) {
  const png = readFileSync(path);
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("invalid PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function passReport() {
  return {
    summary: {
      runId: "run-bottleneck-fixture", stage: 50, attempt: 1,
      startedAtUtc: "2026-08-15T00:00:00.000Z", endedAtUtc: "2026-08-15T00:03:00.000Z",
      startedAtKst: "2026-08-15T09:00:00.000+09:00", endedAtKst: "2026-08-15T09:03:00.000+09:00",
      users: { target: 50, started: 50, completed: 50, failed: 0, successRatePercent: 100 },
      api: { p95Ms: 300, slowestRoute: "INTERVIEW_RUNTIME", slowestRouteP95Ms: 490, errorRatePercent: 0 },
      ecsApi: { averageCpuPercent: 25, maximumCpuPercent: 50, maximumCpuAtUtc: "2026-08-15T00:02:00.000Z", taskAnomaly: false },
      dbCpuCredit: { start: 10000, end: 9998, minimum: 9998, decrease: 2 },
      verdict: "PASS", reasons: [], missingMetrics: [],
    },
    series: {
      apiP95Ms: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 200 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 300 }],
      apiErrorRatePercent: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 0 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 0 }],
      ecsCpuMaximum: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 30 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 50 }],
      dbCpuCredit: [{ atUtc: "2026-08-15T00:00:00.000Z", value: 10000 }, { atUtc: "2026-08-15T00:02:00.000Z", value: 9998 }],
    },
  };
}
```

`readPngSize` checks the PNG signature and reads width/height from bytes 16 and 20 with `readUInt32BE`; no image package is added.

`runStageCliFixture(output)` imports `main` from `scripts/summarize-bottleneck.mjs`, uses the five Task 2/3 fixture paths plus the fixed window shown in Task 7, and captures process-safe output.

```ts
async function runStageCliFixture(existingOutput?: string) {
  const fixture = resolve("tests/fixtures/bottleneck/stage-50");
  const output = existingOutput ?? mkdtempSync(join(tmpdir(), "bottleneck-stage-cli-"));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await summarizeBottleneck([
    "--run-id=run-bottleneck-fixture", "--stage=50", "--attempt=1",
    "--started-at=2026-08-15T00:00:00.000Z", "--ended-at=2026-08-15T00:03:00.000Z",
    `--api-summary=${join(fixture, "api-summary.json")}`,
    `--browser-summary=${join(fixture, "browser-summary.json")}`,
    `--cloudwatch-raw=${join(fixture, "cloudwatch-raw.json")}`,
    `--ecs-task-evidence=${join(fixture, "ecs-task-evidence.json")}`,
    `--hybrid-stage=${join(fixture, "hybrid-stage.json")}`,
    `--output=${output}`,
  ], { log: (value: string) => stdout.push(value), error: (value: string) => stderr.push(value) });
  return { exitCode, output, pngPath: join(output, "bottleneck-summary.png"), stdout, stderr };
}
```

Every test removes only its own `bottleneck-stage-cli-` directory in `finally`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep '1600x1200|overwrite any stage'
```

Expected: FAIL because chart and CLI modules do not exist.

- [ ] **Step 3: Implement the fixed SVG layout**

Use a 1600×1200 page, a 180px header, and panels at y=210/520/830 with height 260. Every panel receives the same `xScale(startedAtUtc, endedAtUtc)`; panel 1 has independent left p95 and right error-rate Y scales, panels 2 and 3 each have their own Y scale. The header prints stage, completed/target users, success rate, UTC window, KST window, and verdict from `summary` only.

```js
export function buildStageChartHtml({ summary, series }) {
  const bounds = { left: 120, right: 1480, width: 1360, height: 220 };
  const panels = [
    stagePanel("api", 210, bounds, [
      line(series.apiP95Ms, "#2563eb", leftScale(series.apiP95Ms)),
      line(series.apiErrorRatePercent, "#dc2626", rightScale(series.apiErrorRatePercent)),
    ], summary, summary.missingMetrics),
    stagePanel("ecs", 520, bounds, [line(series.ecsCpuMaximum, "#f59e0b", percentScale())], summary, summary.missingMetrics),
    stagePanel("db", 830, bounds, [line(series.dbCpuCredit, "#16a34a", dataScale(series.dbCpuCredit))], summary, summary.missingMetrics),
  ];
  return `<!doctype html><html><body><svg width="1600" height="1200" viewBox="0 0 1600 1200">
    ${header(summary)}${panels.join("")}
  </svg></body></html>`;
}
```

All interpolated text must pass `escapeXml`. Empty required series renders a fixed Korean missing-reason label instead of a zero line. Add `data-panel`, `data-marker`, and `data-axis` attributes so tests can inspect structure without pixel matching.

- [ ] **Step 4: Implement the stage CLI and PNG rendering**

Accept exactly these arguments: `--run-id`, `--stage`, `--attempt`, `--started-at`, `--ended-at`, `--api-summary`, `--browser-summary`, `--cloudwatch-raw`, `--ecs-task-evidence`, `--hybrid-stage`, `--output`.

```js
import { chromium } from "@playwright/test";

async function renderPng(html, path) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path, type: "png", clip: { x: 0, y: 0, width: 1600, height: 1200 } });
  } finally {
    await browser.close();
  }
}
```

Before writing, fail if any final filename exists. Write JSON and Markdown with mode `0o600`; render PNG to `bottleneck-summary.png.tmp`, validate the PNG header/size, then rename it. If Chromium fails, append `{ metric: "bottleneckSummaryPng", reason: "PNG_RENDER_FAILED" }`, change the bottleneck verdict to `INSUFFICIENT_EVIDENCE`, write JSON/Markdown once, remove the temporary PNG, emit `BOTTLENECK_PNG_FAILED`, and return 1.

- [ ] **Step 5: Run the chart tests and the complete unit suite**

Run:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\jungleCamp\.tools\ms-playwright'
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'bottleneck chart|1600x1200|overwrite any stage'
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit
```

Expected: both commands exit 0; the second command never runs `realtime-session-hold.spec.ts`.

- [ ] **Step 6: Commit the stage artifact generator**

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- tools/realtime-playwright/src/bottleneck-chart.mjs tools/realtime-playwright/scripts/summarize-bottleneck.mjs tools/realtime-playwright/tests/unit/bottleneck-chart.spec.ts
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'feat(loadtest): 단계별 병목 그래프 생성 추가'
```

---

### Task 5: Final Three-Stage Comparison

**Files:**
- Create: `tools/realtime-playwright/src/bottleneck-final.mjs`
- Create: `tools/realtime-playwright/scripts/summarize-bottleneck-final.mjs`
- Modify: `tools/realtime-playwright/src/bottleneck-chart.mjs`
- Create: `tools/realtime-playwright/tests/unit/bottleneck-final.spec.ts`

**Interfaces:**
- Consumes: 정확히 세 개의 stage `bottleneck-summary.json`, run ID, bucket name.
- Produces: `buildFinalBottleneckReport({ runId, bucket, stages }) -> { markdown, comparison }`, `buildComparisonChartHtml({ runId, comparison }) -> string`, and exactly `bottleneck-final.md`, `stage-comparison.png`.

- [ ] **Step 1: Write failing final report tests**

```ts
test("summarizes exactly 50 100 and 200 in ascending order", () => {
  const result = buildFinalBottleneckReport({
    runId: "run-20260815-bottleneck",
    bucket: "init-playwright-results",
    stages: [stageSummary(200), stageSummary(50), stageSummary(100)],
  });
  expect(result.comparison.map((stage) => stage.stage)).toEqual([50, 100, 200]);
  expect(result.markdown).toContain("최초 성능 저하 단계");
  expect(result.markdown).toContain("최초 병목");
  expect(result.markdown).toContain("200명 장시간 DB credit 위험");
  expect(result.markdown).toContain("s3://init-playwright-results/runs/run-20260815-bottleneck/stages/200/attempt-1/bottleneck-summary.png");
});

test("rejects a missing or duplicate stage", () => {
  expect(() => buildFinalBottleneckReport({
    runId: "run-20260815-bottleneck",
    bucket: "init-playwright-results",
    stages: [stageSummary(50), stageSummary(100), stageSummary(100)],
  })).toThrow("final bottleneck input is invalid");
});

function stageSummary(stage: 50 | 100 | 200) {
  return {
    runId: "run-20260815-bottleneck", stage, attempt: 1,
    startedAtUtc: "2026-08-15T00:00:00.000Z", endedAtUtc: "2026-08-15T00:03:00.000Z",
    startedAtKst: "2026-08-15T09:00:00.000+09:00", endedAtKst: "2026-08-15T09:03:00.000+09:00",
    users: { target: stage, started: stage, completed: stage, failed: 0, successRatePercent: 100 },
    api: { p95Ms: stage * 5, slowestRoute: "INTERVIEW_RUNTIME", slowestRouteP95Ms: stage * 4, errorRatePercent: 0 },
    ecsApi: { averageCpuPercent: 20, maximumCpuPercent: stage / 2, maximumCpuAtUtc: "2026-08-15T00:02:00.000Z", taskAnomaly: false },
    dbCpuCredit: { start: 10000, end: 9998, minimum: 9998, decrease: 2 },
    verdict: "PASS", reasons: [], missingMetrics: [],
  };
}
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'ascending order|duplicate stage'
```

Expected: FAIL because `bottleneck-final.mjs` does not exist.

- [ ] **Step 3: Implement final comparison model and Markdown**

```js
export function buildFinalBottleneckReport({ runId, bucket, stages } = {}) {
  const ordered = validateFinalStages(runId, bucket, stages);
  const firstDegradation = ordered.find((stage, index) => index > 0
    && (stage.api.p95Ms > ordered[index - 1].api.p95Ms * 1.5
      || stage.api.errorRatePercent > ordered[index - 1].api.errorRatePercent
      || stage.users.successRatePercent < ordered[index - 1].users.successRatePercent));
  const firstBottleneck = ordered.find((stage) =>
    stage.verdict === "FAIL_APPLICATION" || stage.verdict === "FAIL_DATABASE");
  return {
    comparison: ordered.map(toComparisonRow),
    markdown: renderFinalMarkdown({ runId, bucket, ordered, firstDegradation, firstBottleneck }),
  };
}
```

`toComparisonRow` returns only stage, user success rate, API p95, API error rate, ECS maximum CPU, DB credit decrease, verdict, and the S3 PNG path. If p95 is null, do not coerce it to zero; final report states insufficient evidence.

- [ ] **Step 4: Implement comparison PNG and CLI non-overwrite behavior**

`buildComparisonChartHtml` creates five small-multiple panels, one per required comparison metric. Each panel has categories 50/100/200 and its own numeric Y axis. The CLI accepts `--run-id`, `--bucket`, `--stage-50`, `--stage-100`, `--stage-200`, `--output`, checks both final files are absent, writes Markdown mode `0o600`, renders exactly 1600×1200 PNG, and refuses partial stage input.

```js
export function buildComparisonChartHtml({ runId, comparison }) {
  const panels = [
    bars("사용자 성공률 (%)", comparison, "successRatePercent"),
    bars("API p95 (ms)", comparison, "apiP95Ms"),
    bars("API 오류율 (%)", comparison, "apiErrorRatePercent"),
    bars("ECS API 최대 CPU (%)", comparison, "ecsMaximumCpuPercent"),
    bars("DB CPU credit 감소량", comparison, "dbCreditDecrease"),
  ];
  return comparisonHtml(runId, panels);
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'final bottleneck|ascending order|duplicate stage|comparison'
```

Expected: exit 0, including 1600×1200 comparison PNG assertion.

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- tools/realtime-playwright/src/bottleneck-final.mjs tools/realtime-playwright/scripts/summarize-bottleneck-final.mjs tools/realtime-playwright/src/bottleneck-chart.mjs tools/realtime-playwright/tests/unit/bottleneck-final.spec.ts
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'feat(loadtest): 3단계 병목 비교 보고서 추가'
```

---

### Task 6: PowerShell Collection and S3 Integration

**Files:**
- Modify: `scripts/hybrid-loadtest.ps1:34-52,255-342,596-618,774-938,986-1048`
- Modify: `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts`

**Interfaces:**
- Consumes: existing Terraform outputs `ecs_cluster_name`, `ecs_service_names`, `rds_endpoint`, `playwright_loadtest_bucket_name`; Tasks 1-5 CLIs.
- Produces: stage/final local paths and conditional S3 objects while returning the unchanged existing hybrid strict verdict.

- [ ] **Step 1: Write failing static orchestration tests**

```ts
test("collects bottleneck evidence without changing the strict gate", () => {
  const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
  expect(source).toContain("api_cpu_maximum");
  expect(source).toContain("db_cpu_credit_balance");
  expect(source).toContain("Resolve-RdsInstanceIdentifier");
  expect(source).toContain("Get-EcsApiTaskEvidence");
  expect(source).toContain("Invoke-BottleneckStageReport");
  expect(source).toContain("--if-none-match");
  expect(source).toContain("D:\\jungleCamp\\loadtest-results");
  expect(source).toMatch(/try\s*\{\s*Invoke-BottleneckStageReport[\s\S]*?catch\s*\{\s*Write-Warning 'BOTTLENECK_SUMMARY_FAILED'/);
  expect(source).toMatch(/\[string\]\$current\[0\]\.verdict/);
  expect(source).not.toMatch(/terraform\s+apply|delete-object|s3\s+rm/i);
});
```

Add an assertion that bottleneck upload destinations use `runs/$RunId/stages/$StageUsers/attempt-$Attempt/` rather than the nGrinder prefix.

- [ ] **Step 2: Run the orchestration test and confirm RED**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'collects bottleneck evidence'
```

Expected: FAIL because new functions and metric IDs are absent.

- [ ] **Step 3: Resolve the exact RDS identifier without Terraform changes**

Change the default results root and add an exact endpoint lookup.

```powershell
[string]$ResultsDirectory = 'D:\jungleCamp\loadtest-results'
[string]$BaselineSummaryPath = 'D:\jungleCamp\loadtest-results\run-20260802-231235\summary\summary.json'

function Resolve-RdsInstanceIdentifier([object]$Outputs) {
    $terraformEndpoint = [string](Get-OutputValue $Outputs 'rds_endpoint')
    $result = Invoke-External -FilePath 'aws' -Arguments @(
        'rds', 'describe-db-instances', '--output', 'json', '--region', $script:AwsRegion
    )
    $databases = @((ConvertFrom-Json $result.Output).DBInstances | Where-Object {
        $_.Endpoint.Address -ceq $terraformEndpoint
    })
    if ($databases.Count -ne 1 -or [string]::IsNullOrWhiteSpace($databases[0].DBInstanceIdentifier)) {
        throw 'RDS_ENDPOINT_EVIDENCE_INCOMPLETE'
    }
    [string]$databases[0].DBInstanceIdentifier
}
```

In dry-run context use the fixed value `init-main-db`; do not call AWS.

- [ ] **Step 4: Add read-only ECS task evidence**

`Get-EcsApiTaskEvidence` calls `ecs describe-services`, `ecs list-tasks --desired-status RUNNING`, and after the stage `ecs list-tasks --desired-status STOPPED` plus `ecs describe-tasks`. Return only counts, rollout state, `runningTaskSetChanged`, and stopped task `{ stopCode, essentialExitCodes }`; task ARNs are compared in memory and omitted from the JSON passed to Node.

```powershell
$safeEvidence = [ordered]@{
    before = [ordered]@{ desiredCount = $before.Desired; runningCount = $before.Running; pendingCount = $before.Pending; rolloutState = $before.Rollout }
    after = [ordered]@{ desiredCount = $after.Desired; runningCount = $after.Running; pendingCount = $after.Pending; rolloutState = $after.Rollout }
    runningTaskSetChanged = (@($before.TaskArns | Sort-Object) -join ',') -cne (@($after.TaskArns | Sort-Object) -join ',')
    stoppedTasks = @($stopped | ForEach-Object {
        [ordered]@{ stopCode = [string]$_.stopCode; essentialExitCodes = @($_.containers | Where-Object essential | ForEach-Object { [int]$_.exitCode }) }
    })
}
```

Filter stopped tasks to `stoppedAt` within the exact stage start/end window. When stopped-task evidence cannot be read, pass an incomplete shape so Task 2 records `ECS_TASK_EVIDENCE_INCOMPLETE` instead of guessing normal.

- [ ] **Step 5: Extend CloudWatch queries while preserving the old summary**

Add these definitions to `New-CloudWatchQueries`; keep existing IDs and the current `cloudwatch-summary.json` fields intact.

```powershell
@{ Id = 'api_cpu_maximum'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.api } },
@{ Id = 'db_cpu_credit_balance'; Ns = 'AWS/RDS'; Name = 'CPUCreditBalance'; Stat = 'Average'; Dims = @{ DBInstanceIdentifier = $rdsIdentifier } }
```

Pass `$rdsIdentifier` into `New-CloudWatchQueries`. Continue using 60-second periods, `StartEpoch - 60`, `EndEpoch + 120`, ascending timestamps, and the original strict required metric checks.

- [ ] **Step 6: Add conditional local/S3 artifact functions**

```powershell
function Write-S3ObjectIfAbsent([string]$Bucket, [string]$Key, [string]$Path) {
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        's3api', 'put-object', '--bucket', $Bucket, '--key', $Key, '--body', $Path,
        '--server-side-encryption', 'AES256', '--if-none-match', '*', '--region', $script:AwsRegion
    )
}
```

`Invoke-BottleneckStageReport` creates `D:\jungleCamp\loadtest-results\$RunId\stages\$StageUsers\attempt-$Attempt`, writes ECS task evidence to a temporary UTF-8 JSON file, runs `summarize-bottleneck.mjs` with all exact file arguments, removes the temporary evidence in `finally`, and uploads exactly the three new filenames to `runs/$RunId/stages/$StageUsers/attempt-$Attempt/`.

`Invoke-BottleneckFinalReport` runs only when 50/100/200 local stage JSONs all exist, writes to `$ResultsDirectory\$RunId\summary`, and uploads exactly two final files under `runs/$RunId/summary/`.

- [ ] **Step 7: Connect reporting without replacing strict verdicts**

Capture ECS state immediately before workload dispatch and immediately after workload completion. After existing API/browser/cloudwatch/hybrid summaries are ready, invoke the stage reporter in its own guarded block.

```powershell
$strictVerdict = [string]$current[0].verdict
try {
    Invoke-BottleneckStageReport -Context $Context -StageUsers $StageUsers `
        -StartEpoch $StartEpoch -EndEpoch $EndEpoch -StageDirectory $stageDirectory `
        -TaskEvidence $taskEvidence -StrictVerdict $strictVerdict
    if ($StageUsers -eq 200) { Invoke-BottleneckFinalReport -Context $Context }
}
catch {
    Write-Warning 'BOTTLENECK_SUMMARY_FAILED'
}
$strictVerdict
```

Do not add a new action that can launch load. Do not make bottleneck artifact failure return `HYBRID_PASSED`; it only leaves the existing strict verdict unchanged and emits the fixed warning.

- [ ] **Step 8: Run static unit tests and PowerShell parse validation**

Run:

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit -- --grep 'orchestration|bottleneck evidence'
$errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path '..\..\scripts\hybrid-loadtest.ps1'),[ref]$null,[ref]$errors); if($errors.Count){$errors | Format-List | Out-String | Write-Error}
```

Run the second command from `tools/realtime-playwright`. Expected: unit command exits 0 and parser error count is zero.

- [ ] **Step 9: Commit the controller integration**

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- scripts/hybrid-loadtest.ps1 tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'feat(loadtest): 병목 보고서를 하이브리드 수집에 연결'
```

---

### Task 7: Documentation and Safe Pre-Execution Verification

**Files:**
- Modify: `tools/realtime-playwright/README.md`

**Interfaces:**
- Consumes: completed Tasks 1-6.
- Produces: fixture/unit/Terraform/no-load validation evidence and a user-facing approval checkpoint; no actual canary or stage execution.

- [ ] **Step 1: Document the artifact and approval contract**

Add a `Bottleneck summaries` section with the exact five artifact paths, seven verdicts, 3-panel contents, local root, conditional non-overwrite behavior, and the statement below.

```markdown
병목 요약 생성은 기존 hybrid strict verdict를 대체하지 않는다. Redis 상세 지표는 Redis 오류가 있을 때만, generator 상세는 목표 부하 부족 또는 agent 오류가 있을 때만 후속 진단한다. `ApiCanary` 또는 `Run`은 사용자 승인과 `-ConfirmProductionLoad` 없이 실행하지 않는다.
```

- [ ] **Step 2: Run fixture-only stage generation in a fresh temporary directory**

Run from `tools/realtime-playwright`:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\jungleCamp\.tools\ms-playwright'
$fixture=(Resolve-Path 'tests\fixtures\bottleneck\stage-50').Path
$output=Join-Path ([System.IO.Path]::GetTempPath()) ('bottleneck-safe-' + [guid]::NewGuid().ToString('N'))
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\node.exe' scripts\summarize-bottleneck.mjs --run-id=run-bottleneck-fixture --stage=50 --attempt=1 --started-at=2026-08-15T00:00:00.000Z --ended-at=2026-08-15T00:03:00.000Z --api-summary="$fixture\api-summary.json" --browser-summary="$fixture\browser-summary.json" --cloudwatch-raw="$fixture\cloudwatch-raw.json" --ecs-task-evidence="$fixture\ecs-task-evidence.json" --hybrid-stage="$fixture\hybrid-stage.json" --output="$output"
Get-ChildItem -LiteralPath $output -File | Select-Object Name,Length
```

Expected: exit 0 and exactly three non-empty files. Remove only the printed GUID-named temporary output after inspection.

- [ ] **Step 3: Scan every generated artifact for forbidden data**

```powershell
rg -n -i 'magicToken|publicAccessToken|applicationId|sessionId|Authorization|Cookie|@loadtest\.invalid|Bearer\s' -- $output
```

Expected: exit 1 with no matches. Open the PNG locally only for visual inspection; do not upload fixture output. After inspection, verify the resolved path is inside the Windows temporary directory and remove only that GUID directory.

```powershell
$resolvedOutput=[System.IO.Path]::GetFullPath($output)
$temporaryRoot=[System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if(-not $resolvedOutput.StartsWith($temporaryRoot,[System.StringComparison]::OrdinalIgnoreCase)){throw 'TEMP_OUTPUT_PATH_INVALID'}
Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
```

- [ ] **Step 4: Run the complete safe unit suite**

```powershell
& 'D:\jungleCamp\.tools\node-v20.20.2-win-x64\npm.cmd' run test:unit
```

Expected: exit 0 with no failed, skipped due error, or timed-out unit tests. Do not run `npm test` because it includes `tests/realtime-session-hold.spec.ts`.

- [ ] **Step 5: Run Terraform read-only validation**

Run from the repository root:

```powershell
& 'D:\jungleCamp\.tools\terraform-1.15.8\terraform.exe' -chdir=infra/aws fmt -check -recursive
& 'D:\jungleCamp\.tools\terraform-1.15.8\terraform.exe' -chdir=infra/aws validate
```

Expected: both exit 0. Do not run `plan` with refresh, `apply`, `destroy`, `import`, `state rm`, or any AWS mutating command.

- [ ] **Step 6: Run the project-required Windows harness**

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A
```

Expected: exit 0. Record any unrelated pre-existing dirty-worktree failure separately instead of changing unrelated files.

- [ ] **Step 7: Run the controller in dry-run mode only**

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\hybrid-loadtest.ps1 -Action Run -RunId run-bottleneck-dryrun -DatasetId pwload-bottleneck-dryrun -CompanyId 1 -Stages 50,100,200 -Attempt 1 -DryRun -ConfirmProductionLoad -BaselineSummaryPath 'D:\jungleCamp\loadtest-results\run-20260802-231235\summary\summary.json'
```

Expected: only `[DRY-RUN]` messages for canary evidence, locks, 45/95/195 API users, five browser users, 150-second hold, and stage progression. Verify no nGrinder performance-test ID, SSM command ID, or new S3 object appears.

- [ ] **Step 8: Run the existing no-load nGrinder source validation**

Run only the validation helper already recorded under `.tools`:

```powershell
& 'D:\jungleCamp\.tools\publish-validate-ngrinder.ps1'
Get-Content -LiteralPath 'D:\jungleCamp\.tools\ngrinder-publish-validation.status' -Encoding UTF8
```

Expected: `PASS`. This publishes the validation-only source variant and does not create or start a performance test. If credential input is required, pause for the visible credential prompt; never pass the password on the command line.

- [ ] **Step 9: Commit the documentation**

```powershell
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' add -- tools/realtime-playwright/README.md
& 'D:\jungleCamp\.tools\PortableGit-2.54.0\cmd\git.exe' commit -m 'docs(loadtest): 병목 결과 검증 절차 추가'
```

- [ ] **Step 10: Stop at the approval boundary**

Report unit count, Terraform validation, Windows harness, dry-run, no-load nGrinder validation, generated fixture filenames, commit hashes, and remaining unrelated dirty files. State explicitly that no Terraform apply, AWS resource change, API canary, or 50/100/200 stage ran. Request separate approval for the next API canary attempt; do not include or execute a production-load command before that approval.

# Hybrid Load-Test Bottleneck Summary Design

## 목적

기존 nGrinder + Playwright 하이브리드 부하 테스트의 실행 순서, strict gate, 결과 파일, S3 구조를 유지하면서 50명·100명·200명 단계별 병목 판단에 필요한 최소 요약 파일만 추가한다.

이 설계는 테스트 시나리오나 인프라를 재설계하지 않는다. Terraform apply, AWS 리소스 생성·변경, Redis 상세 계측, 부하발생기 상세 계측은 범위 밖이다. 실제 부하 실행은 기존 승인 절차를 그대로 따른다.

## 유지할 기존 계약

- 실행 순서는 preflight, canary, 50명, 100명, 200명이다.
- 각 단계는 이전 단계의 strict gate가 통과한 경우에만 준비한다.
- 실제 canary와 50명·100명·200명 실행은 각 실행 전 명시적 승인을 받는다.
- 50명·100명·200명은 기존 하이브리드 구성인 nGrinder API 사용자 45·95·195명과 Playwright 브라우저 사용자 5명을 사용한다.
- nGrinder는 한 process, stage별 thread 수, `runCount=5`, 최소 150초 hold gate를 유지한다. scheduling 오차를 흡수하기 위한 31초 sleep은 150초 strict gate를 완화하지 않는다.
- SNI 복구, validation-only source variant, source-only save, token 비노출, 고정 failure code 계약을 유지한다.
- 기존 결과, 실패 로그, Playwright 스크린샷은 삭제·이름 변경·중복 생성하지 않는다.
- 동일 stage/attempt는 기존 lock 및 window 정책에 따라 덮어쓰지 않는다.

## 접근 방식

기존 `Collect-CloudWatchStage`, nGrinder VU 결과, browser summary, hybrid summary를 데이터 원천으로 재사용한다. 새로운 수집기는 만들지 않고 기존 stage collection에 다음 최소 확장을 연결한다.

1. Groovy HTTP wrapper가 고정 route key별 호출 소요시간을 메모리에서 측정한다.
2. 기존 CloudWatch query에 ECS API CPU 최대값과 RDS CPUCreditBalance를 추가한다.
3. stage 시작·종료 시 ECS API task snapshot을 읽어 교체·비정상 종료를 판정한다.
4. 독립 Node 모듈이 안전한 집계 입력만 받아 병목 summary와 판정을 만든다.
5. Playwright Chromium이 로컬 HTML/SVG를 한 번 렌더링해 PNG 한 장을 만든다.
6. 기존 stage/attempt S3 prefix와 동일한 로컬 상대 경로에 세 파일을 업로드한다.

새 npm 패키지, CloudWatch dashboard 캡처, ALB access log, X-Ray, Container Insights, Terraform output 추가는 사용하지 않는다.

## 경로별 API 계측

Groovy 스크립트는 실제 URL 대신 다음 고정 key만 기록한다.

- `APPLICATION_STATUS`
- `INTERVIEW_START`
- `INTERVIEW_RUNTIME`
- `INTERVIEW_QUESTIONS`
- `DEVICE_CHECK`
- `INTERVIEW_BEGIN`

`sendGet`와 `sendPost`가 HTTP 호출 전후의 `System.nanoTime()` 차이를 밀리초로 측정한다. 각 VU 결과에는 고정 key별 non-negative latency 배열과 route별 실패 횟수만 추가한다. URL, query, applicationId, sessionId, magicToken, publicAccessToken, Authorization header, 응답 본문은 기록하지 않는다.

가장 느린 API는 모든 nGrinder VU의 동일 route key 표본을 합친 뒤 p95가 가장 큰 route로 정한다. 동률이면 위 고정 key 순서를 사용한다. 표본이 하나도 없으면 값은 `null`이고 누락 사유에 `ROUTE_LATENCY_MISSING`을 기록한다.

전체 API p95는 기존 ALB `TargetResponseTime p95` 시계열의 stage 구간 최대값을 밀리초로 변환한 값을 유지한다. 전체 요청 수는 ALB `RequestCount` 합계, 실패 요청 수는 target 4xx + target 5xx + target connection errors의 합계로 계산한다. 오류율은 요청 수가 0보다 클 때 `failedRequests / totalRequests * 100`이며, 요청 수가 0이면 `null`과 `ALB_REQUEST_COUNT_MISSING`을 기록한다.

## CloudWatch와 ECS 데이터

기존 query의 60초 period와 stage 전후 buffer를 유지한다.

추가 또는 확장할 metric은 다음과 같다.

- ECS API `CPUUtilization`, `Average`: 구간 평균 CPU
- ECS API `CPUUtilization`, `Maximum`: 구간 최대 CPU 및 CloudWatch timestamp
- RDS `CPUCreditBalance`, `Average`: 구간 첫 값, 마지막 값, 최솟값, 감소량

RDS dimension은 기존 Terraform `rds_endpoint` output의 첫 DNS label을 DB instance identifier로 사용하기 전에 `aws rds describe-db-instances` 결과와 exact endpoint 일치를 검증한다. 일치하는 DB가 정확히 하나가 아니면 DB metric을 추측하지 않고 누락 처리한다. Terraform state나 AWS 리소스는 변경하지 않는다.

ECS task 이상 여부는 stage 시작 snapshot과 종료 snapshot의 API service desired/running/pending count, deployment rollout state, running task ARN을 비교하고, stage 시간 구간에 stoppedAt이 포함되는 stopped task의 stopCode 및 essential container exit code를 확인한다. 다음 중 하나면 `true`다.

- desiredCount와 runningCount 불일치
- pendingCount가 0이 아님
- deployment rollout state가 `FAILED`
- 배포 승인 없이 running task ARN 교체
- 구간 내 essential container의 비정상 종료

정상적인 task 교체 여부를 확정할 증거가 부족하면 이상으로 추정하지 않고 누락 사유 `ECS_TASK_EVIDENCE_INCOMPLETE`를 기록한다.

## 사용자 결과 집계

단계 목표 사용자는 50·100·200이다.

- 실제 시작 사용자: nGrinder `reportedUsers` + browser summary `total`
- 완료 사용자: nGrinder PASSED VU 수 + browser `passed`
- 실패 사용자: 목표 사용자 - 완료 사용자. 음수가 되면 입력 오류로 처리한다.
- 성공률: 목표 사용자가 0보다 클 때 `completedUsers / targetUsers * 100`
- 주요 실패 단계: nGrinder와 browser의 고정 failure code를 빈도 내림차순, 코드 오름차순으로 정렬한 최대 5개

nGrinder summary에 PASSED VU 수가 없으면 기존 safe VU 결과에서 `status`만 집계한다. Playwright는 기존 browser summary와 failure screenshot 상대 경로를 재사용한다.

## 병목 판정

기존 `HYBRID_PASSED`, `FAILED`, `GENERATOR_CONSTRAINED` 판정은 변경하지 않는다. 병목 summary는 별도의 다음 판정만 기록한다.

- `PASS`: 목표·완료 사용자와 증거가 완전하고 기존 strict gate가 통과하며 application/DB 위험 증거가 없음
- `PASS_WITH_DB_CREDIT_RISK`: strict gate는 통과하지만 DB credit이 지속적으로 감소해 장시간 소진 위험이 있음
- `FAIL_APPLICATION`: 사용자/API 실패와 같은 시간대에 API p95·오류율·ECS CPU 또는 task 이상이 함께 나타남
- `FAIL_DATABASE`: 사용자/API 실패 또는 명확한 성능 저하와 같은 시간대에 DB credit 급감 또는 소진이 함께 나타남
- `FAIL_USER_FLOW`: 사용자 흐름 실패가 있으나 application/DB 병목 증거가 없음
- `INSUFFICIENT_LOAD`: 실제 시작 사용자가 목표보다 적거나 generator/agent 문제로 목표 부하를 만들지 못함
- `INSUFFICIENT_EVIDENCE`: 필수 지표 누락으로 위 판정을 안전하게 결정할 수 없음

CPU 단독 상승은 실패 근거가 아니다. DB credit 잔액이 양수여도 stage별 감소량이 사용자 증가와 함께 커지거나, 관측된 감소율을 현재 잔액에 선형 외삽한 예상 소진 시간이 24시간 미만이면 `PASS_WITH_DB_CREDIT_RISK` 후보가 된다. 외삽은 최소 두 개의 유효 sample과 양의 감소량이 있을 때만 계산하며, 짧은 stage 기반 단순 추정임을 Markdown에 명시한다.

애플리케이션과 DB가 동시에 의심되지만 시간 상관관계를 분리할 수 없으면 `INSUFFICIENT_EVIDENCE`로 두고 두 후보를 판정 근거에 기록한다.

## 결과 스키마와 파일

각 단계의 로컬 및 S3 상대 경로는 다음과 같다.

```text
runs/<runId>/stages/<stage>/attempt-<attempt>/bottleneck-summary.json
runs/<runId>/stages/<stage>/attempt-<attempt>/bottleneck-summary.md
runs/<runId>/stages/<stage>/attempt-<attempt>/bottleneck-summary.png
```

로컬 root는 `D:\jungleCamp\loadtest-results\<runId>`이며 그 아래 `stages/<stage>/attempt-<attempt>/`를 사용한다. S3에 이미 동일 key가 있으면 업로드하지 않고 실패한다.

`bottleneck-summary.json`은 다음 top-level field만 가진다.

```json
{
  "runId": "run-...",
  "stage": 50,
  "attempt": 4,
  "startedAtUtc": "...Z",
  "endedAtUtc": "...Z",
  "startedAtKst": "+09:00",
  "endedAtKst": "+09:00",
  "users": {
    "target": 50,
    "started": 50,
    "completed": 50,
    "failed": 0,
    "successRatePercent": 100
  },
  "api": {
    "p95Ms": 412,
    "slowestRoute": "INTERVIEW_RUNTIME",
    "slowestRouteP95Ms": 387,
    "errorRatePercent": 0
  },
  "ecsApi": {
    "averageCpuPercent": 0,
    "maximumCpuPercent": 0,
    "maximumCpuAtUtc": "...Z",
    "taskAnomaly": false
  },
  "dbCpuCredit": {
    "start": 0,
    "end": 0,
    "minimum": 0,
    "decrease": 0
  },
  "verdict": "PASS",
  "reasons": [],
  "missingMetrics": []
}
```

값이 없으면 key를 제거하지 않고 `null`을 사용하며 `missingMetrics`에 `{ "metric": "...", "reason": "..." }`를 추가한다. JSON에는 원시 시계열이나 credential, token, cookie, 개인정보, 면접 답변을 넣지 않는다.

JSON은 위에 열거한 정보만 저장한다. 최소 수집 항목 가운데 JSON 허용 목록에 없는 주요 실패 단계, 전체 요청 수, 실패 요청 수, 대표 오류 유형, DB credit 예상 소진 위험은 Markdown에만 추가한다. 이 값도 안전한 정규화 집계에서 만들며, 대표 오류는 기존 고정 failure code와 발생 횟수만 기록한다. JSON과 Markdown 어디에도 원문 오류, URL, 식별자 또는 원문 로그를 추가하지 않는다.

## PNG 렌더링

`bottleneck-summary.png`는 1600×1200 단일 이미지다. 로컬 HTML 안의 SVG 세 패널을 기존 Playwright Chromium으로 렌더링한다.

1. ALB API p95(ms)와 오류율(%)은 같은 시간축의 분리된 좌우 Y축을 사용한다.
2. ECS API CPUUtilization(%)은 독립 Y축을 사용한다.
3. DB CPUCreditBalance(count)는 독립 Y축을 사용한다.

모든 패널은 동일한 UTC 시간 범위를 사용하고 stage 시작·종료 수직선을 표시한다. 상단에는 stage, 완료/목표 사용자, 성공률, UTC/KST 구간, 판정을 표시한다. 데이터가 누락된 패널은 빈 선을 그리지 않고 누락 사유를 표시한다. CloudWatch 콘솔이나 기존 실패 screenshot을 다시 캡처하지 않는다.

## 전체 단계 비교

50·100·200 단계가 모두 terminal verdict를 가진 후에만 다음 두 파일을 기존 summary 위치에 추가한다.

```text
runs/<runId>/summary/bottleneck-final.md
runs/<runId>/summary/stage-comparison.png
```

`bottleneck-final.md`는 세 단계 안정성, 최초 저하 단계, 최초 병목 application/DB 판단, 200명 장시간 DB credit 위험, 사용한 S3 PNG 경로만 답한다.

`stage-comparison.png`는 단계별 사용자 성공률, API p95, API 오류율, ECS API 최대 CPU, DB credit 감소량만 비교한다. 단위가 다른 값은 동일 Y축에 겹치지 않고 small multiple 또는 독립 축을 사용한다.

## 오류 처리와 안전장치

- 필수 입력 schema가 다르면 summary를 만들지 않는다.
- metric timestamp/value 길이가 다르거나 비정상 숫자가 있으면 해당 metric을 누락 처리한다.
- stage/attempt lock, window manifest, S3 기존 key 확인 중 하나라도 실패하면 업로드하지 않는다.
- PNG 생성 실패는 JSON/Markdown 성공을 숨기지 않지만 stage 병목 증거는 `INSUFFICIENT_EVIDENCE`로 기록한다.
- 결과 파일은 로컬 mode 600으로 만들고 S3 SSE AES256을 사용한다.
- Redis 오류가 기존 결과에 나타난 경우에만 후속 진단 사유를 기록한다.
- 목표 사용자 부족 또는 agent 오류가 있을 때만 generator 병목 후속 진단 사유를 기록한다.

## 테스트 전략

모든 구현은 TDD로 진행한다.

- 고정 route key 외 입력 거부와 token/ID 비노출
- route latency p95 및 동률 결정
- 사용자 시작·완료·실패·성공률 집계
- ALB 요청/실패/오류율과 CloudWatch timestamp 정렬
- ECS 평균/최대 CPU 및 task anomaly
- DB credit 시작/종료/최소/감소량과 위험 외삽
- 7개 병목 verdict별 fixture
- metric 누락 사유와 `INSUFFICIENT_EVIDENCE`
- JSON 전체 field allowlist와 secret pattern 부재
- Markdown 전용 집계 항목과 내용 제한
- PNG 크기, 3패널, 공통 시간축, 시작·종료 marker
- 동일 stage/attempt 비덮어쓰기
- 기존 50·100·200 hybrid summary와 전체 unit suite 회귀 검증

기존 attempt 3 결과를 첫 로컬 fixture로 사용하되 입력 파일과 token은 읽지 않는다. 실제 stage 실행이나 AWS write 없이 안전한 aggregate 결과와 CloudWatch raw만으로 summary 생성 경로를 검증한다.

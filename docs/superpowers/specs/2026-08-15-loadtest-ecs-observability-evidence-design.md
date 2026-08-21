# 부하 테스트 ECS 관찰 및 장애 증거 설계

## 목적

nGrinder와 Playwright 혼합 부하 테스트의 목적을 고정된 150초 유지 여부 검증에서 서버 수용 능력 관찰로 전환한다. 각 단계의 실제 유지 시간은 정보로 남기되, 짧은 유지 시간만으로 테스트를 실패 처리하지 않는다. 대신 ECS 자원 포화, ECS 태스크 이상, ALB 5xx 및 대상 연결 오류를 서버가 부하를 버티지 못한 직접 증거로 보존한다.

## 범위

- API, frontend, worker ECS 서비스의 CPU 및 메모리 사용률을 수집한다.
- 각 서비스와 자원별 Average, Maximum, 최대값 발생 UTC 시각을 JSON과 Markdown 결과에 항상 포함한다.
- 자원 이상 또는 서버 장애 신호가 발생한 단계에 한해 AWS CloudWatch `GetMetricWidgetImage`로 PNG를 생성한다.
- ECS 태스크의 테스트 전후 상태와 테스트 구간 중 중단 태스크 정보를 기존 증거와 함께 보존한다.
- API p95, 요청 수, 4xx, 5xx, ALB 대상 연결 오류와 DB CPU credit 등 기존 병목 지표는 유지한다.
- 부하 사용자 수 50/100/200의 기존 단계 구조와 nGrinder + Playwright 역할 분리는 변경하지 않는다.

다음 항목은 이번 변경 범위에 포함하지 않는다.

- ECS 태스크 CPU 또는 메모리 할당량 변경
- Auto Scaling 정책 변경
- 애플리케이션 API 동작 변경
- CloudWatch Alarm 생성
- 고정된 테스트 유지 시간을 다른 고정값으로 교체

## 판정 원칙

### 관찰 정보

- `heldMs`와 `runtimeSamples`는 실제 실행 정보로 계속 기록한다.
- `heldMs < 150000`만으로 VU 또는 stage를 실패 처리하지 않는다.
- CPU 및 메모리 수치는 용량 판단 자료이며 임계값 초과만으로 테스트 실행 자체를 중단하지 않는다.
- API 4xx는 요청 품질 또는 인증·계약 문제를 분석할 수 있도록 집계하지만 서버 장애로 단정하지 않는다.

### 서버 장애 증거

다음 중 하나라도 발생하면 `SERVER_FAILURE_EVIDENCE`를 결과에 남긴다.

- ALB 대상 5xx 합계가 1 이상
- ALB `TargetConnectionErrorCount` 합계가 1 이상
- 테스트 전후 ECS 서비스의 `desiredCount`, `runningCount`, `pendingCount`가 정상 조건을 벗어남
- 테스트 구간 중 ECS 태스크가 비정상 중단되거나 essential container exit code가 0이 아님
- ECS deployment의 `rolloutState`가 `FAILED`

서버 장애 증거는 성공률과 별도로 보고하며, 원본 CloudWatch 값, ECS 태스크 스냅샷, 중단 사유의 고정 분류 코드 및 관련 PNG 경로를 포함한다. URL, 토큰, application ID, session ID, 응답 본문과 같은 비밀 또는 개인 데이터는 기록하지 않는다.

## 자원 상태 분류

현재 인프라는 Fargate 태스크 수준 CPU 및 메모리 한도를 사용하므로 100%를 실질적인 포화점으로 해석한다.

| 상태 | Maximum 기준 | 의미 |
| --- | ---: | --- |
| `NORMAL` | 80% 미만 | 관찰 구간에서 충분한 여유가 있음 |
| `WARNING` | 80% 이상 90% 미만 | 용량 여유가 줄어들어 그래프 증거가 필요함 |
| `CRITICAL` | 90% 이상 99% 미만 | 포화에 근접함 |
| `SATURATED` | 99% 이상 | 할당량 한계에 사실상 도달함 |

CPU와 메모리는 각자 독립적으로 분류한다. 서비스 상태는 두 자원 상태 중 더 심각한 값을 사용한다. 분류 임계값은 보고 목적이며 stage 실행 중단 조건으로 사용하지 않는다.

## 수집 대상과 출력 구조

CloudWatch `AWS/ECS` namespace에서 `ClusterName`과 `ServiceName` dimensions를 사용한다. API, frontend, worker 각각에 대해 다음 metric query를 60초 period로 수집한다.

- `CPUUtilization` / `Average`
- `CPUUtilization` / `Maximum`
- `MemoryUtilization` / `Average`
- `MemoryUtilization` / `Maximum`

정규화된 stage 결과는 다음 구조를 제공한다.

```json
{
  "ecsServices": {
    "api": {
      "cpu": {
        "averagePercent": 42.1,
        "maximumPercent": 87.3,
        "maximumAtUtc": "2026-08-15T13:20:00.000Z",
        "status": "WARNING"
      },
      "memory": {
        "averagePercent": 61.2,
        "maximumPercent": 72.4,
        "maximumAtUtc": "2026-08-15T13:21:00.000Z",
        "status": "NORMAL"
      },
      "status": "WARNING"
    }
  },
  "serverFailureEvidence": {
    "detected": false,
    "reasons": [],
    "albTarget5xx": 0,
    "targetConnectionErrors": 0,
    "ecsTaskAnomaly": false
  },
  "cloudWatchImages": []
}
```

`ecsServices`에는 `api`, `frontend`, `worker`가 항상 존재한다. 필수 metric이 없거나 timestamp가 유효하지 않으면 값을 0으로 대체하지 않고 `null`과 고정 누락 사유를 기록한다.

## AWS 그래프 증거

다음 조건 중 하나가 발생한 stage에서만 AWS CloudWatch `GetMetricWidgetImage`를 호출한다.

- 어느 서비스든 CPU 또는 메모리 상태가 `WARNING` 이상
- `SERVER_FAILURE_EVIDENCE`가 탐지됨

그래프 시간 범위는 stage 시작 5분 전부터 stage 종료 5분 후까지다. AWS가 렌더링한 PNG를 변경 없이 원본 증거로 저장하고 SHA-256을 함께 기록한다.

생성할 그래프는 다음과 같다.

1. `ecs-resource-utilization.png`: API, frontend, worker의 CPU Maximum과 Memory Maximum 시계열 및 80%, 90%, 99% 기준선
2. `server-failure-signals.png`: ALB 대상 5xx, ALB 대상 연결 오류, API p95 시계열

자원 임계값만 초과한 경우 첫 번째 그래프를 생성한다. 서버 장애 신호가 발생한 경우 두 그래프를 모두 생성하여 장애 시점과 자원 상태를 함께 비교할 수 있게 한다. 각 이미지의 로컬 경로, S3 object key, SHA-256, 생성 UTC 시각, 조회 시간 범위를 JSON과 Markdown에 기록한다.

AWS 이미지 생성이 실패해도 원본 metric JSON과 서버 장애 증거를 삭제하거나 정상으로 바꾸지 않는다. 대신 `CLOUDWATCH_IMAGE_GENERATION_FAILED`를 증거 누락 사유로 기록한다.

## 데이터 흐름

1. stage 시작 직전에 ECS 서비스 및 태스크 상태를 수집한다.
2. 기존 nGrinder API VU와 Playwright browser VU를 실행한다.
3. stage 종료 직후 ECS 상태와 중단 태스크를 수집한다.
4. CloudWatch에서 테스트 구간의 ALB, ECS, RDS metric 원본을 받는다.
5. metric timestamp를 UTC로 정규화하고 stage 구간에 속한 data point만 집계한다.
6. ECS 서비스별 CPU·메모리 집계와 상태를 계산한다.
7. 서버 장애 증거와 그래프 생성 조건을 계산한다.
8. 조건이 충족되면 AWS에서 PNG를 받아 해시와 함께 저장한다.
9. stage JSON, Markdown, PNG 및 원본 증거를 기존 S3 run prefix에 업로드한다.

## 오류 처리와 보안

- CloudWatch metric이 `Complete`가 아니거나 필수 value가 없으면 해당 metric을 `null`로 유지하고 고정 누락 사유를 기록한다.
- 빈 5xx 및 연결 오류 metric은 같은 구간의 요청 metric이 완전할 때만 0으로 해석한다.
- CPU 또는 메모리 누락은 서버 장애가 없다는 뜻으로 해석하지 않는다.
- ECS task 중단 사유는 고정 분류와 exit code만 저장하고 환경 변수, command, secret ARN은 저장하지 않는다.
- CloudWatch widget JSON과 결과에는 account ID, URL query, 인증 정보가 포함되지 않도록 기존 redaction 규칙을 적용한다.
- PNG 생성 실패와 S3 업로드 실패는 서로 구분된 고정 오류 코드로 남긴다.

## 보고서

Markdown stage 보고서에는 다음 표를 항상 제공한다.

| 서비스 | CPU 평균 | CPU 최대 | CPU 상태 | 메모리 평균 | 메모리 최대 | 메모리 상태 | 태스크 이상 |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| API | 값 또는 n/a | 값 또는 n/a | 상태 | 값 또는 n/a | 값 또는 n/a | 상태 | 있음/없음/확인 불가 |
| frontend | 값 또는 n/a | 값 또는 n/a | 상태 | 값 또는 n/a | 값 또는 n/a | 상태 | 있음/없음/확인 불가 |
| worker | 값 또는 n/a | 값 또는 n/a | 상태 | 값 또는 n/a | 값 또는 n/a | 상태 | 있음/없음/확인 불가 |

보고서 상단에는 실제 사용자 수, 완료 사용자 수, 실패 요청 수, 5xx, 연결 오류 및 서버 장애 증거 여부를 표시한다. `heldMs` 최소·평균·최대는 실행 특성으로 표시하지만 150초 충족 여부를 판정 문구로 사용하지 않는다.

그래프가 생성된 경우 Markdown과 최종 단계 비교 보고서에서 해당 PNG를 링크한다. 그래프가 없으면 `이상 징후 없음 — 조건부 그래프 미생성`이라고 명시한다.

## 검증

- 149,999ms VU가 오류 counter 없이 완료되면 hold 시간 때문에 실패하지 않는 단위 테스트
- runtime sample 또는 `heldMs`가 결과 정보에 계속 남는 단위 테스트
- API, frontend, worker 각각의 CPU·메모리 Average/Maximum/peak timestamp 정규화 테스트
- 79.999%, 80%, 90%, 99% 경계 상태 테스트
- 5xx, 연결 오류, ECS 비정상 중단 각각이 `SERVER_FAILURE_EVIDENCE`를 만드는 테스트
- 4xx만 존재할 때 서버 장애로 분류하지 않는 테스트
- 정상 stage에서는 PNG를 만들지 않고 임계값 초과 시 자원 PNG를 요청하는 테스트
- 서버 장애 신호가 있으면 자원 및 장애 신호 PNG를 모두 요청하는 테스트
- PNG SHA-256 및 metadata 기록 테스트
- CloudWatch 이미지 생성 실패 시 원본 수치와 장애 증거가 보존되는 테스트
- timestamp timezone 입력이 UTC 구간과 올바르게 비교되는 회귀 테스트
- 보고서에 세 서비스의 CPU·메모리 표와 증거 링크가 렌더링되는 테스트

## 완료 조건

- 150초 미달만으로 VU 또는 stage가 실패하지 않는다.
- API, frontend, worker의 CPU와 메모리 평균·최대가 결과 JSON과 Markdown에 항상 표시된다.
- 임계값 초과 또는 서버 장애 시 AWS가 직접 렌더링한 PNG가 생성되고 무결성 해시와 함께 저장된다.
- ECS 태스크 이상, 5xx 및 연결 오류는 원본 수치와 전후 상태를 포함한 확실한 서버 장애 증거로 남는다.
- 기존 사용자 입력, 토큰 및 URL redaction 계약을 위반하지 않는다.

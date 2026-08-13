# nGrinder + Playwright 하이브리드 부하테스트 설계

## 목적

기존 공고 36의 제한형 부하테스트 fixture와 보존된 25명 Playwright 결과를 사용해 `init-jungle.cloud` 운영 서버가 최대 200명의 동시 면접 진입 및 API 요청을 처리할 수 있는지 검증한다.

25명 단계는 모든 가상 사용자가 실제 Chromium, 매직링크 인증, 면접 런타임, OpenAI Realtime WebRTC 연결을 150초 동안 정상 유지했다. 일부 부하 발생기에서 CPU 90% 이상이 연속 관측되어 최종 판정은 `GENERATOR_CONSTRAINED`였지만, 애플리케이션 결과는 25/25 성공, API 5xx 0건, WebRTC 및 data channel drop 0건이었다. 이 결과는 재분류하거나 덮어쓰지 않고 실제 브라우저 E2E 기준선으로 보존한다.

이후 50명, 100명, 200명은 브라우저 생성기 포화를 피하기 위해 nGrinder API 사용자와 Playwright 실제 브라우저 사용자를 동시에 실행한다.

## 실행 범위

| 단계 | nGrinder API 사용자 | Playwright 실제 브라우저 | 총 사용자 | 유지 시간 | 단계 간 cooldown |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 45 | 5 | 50 | 150초 | 120초 |
| 100 | 95 | 5 | 100 | 150초 | 120초 |
| 200 | 195 | 5 | 200 | 150초 | 실행 후 결과 수집 |

각 단계는 공통 UTC barrier에서 시작한다. 한 단계라도 strict gate에 실패하면 이후 단계를 실행하지 않는다.

## 사용자 분리

200개 fixture는 모두 공고 36에 속하며 사용자마다 별도의 application, interview session, 매직링크 토큰을 가진다. 실행 직전에 전체 200개의 매직링크 토큰을 안전하게 교체하고 기존 4시간 TTL 정책을 유지한다.

브라우저 사용자는 CPU가 안정적이었던 다음 다섯 개 ordinal을 고정 사용한다.

| Playwright host | EC2 ID | VU | fixture row |
| --- | --- | --- | ---: |
| instance-01 | `i-06ef096254e2b3ceb` | `vu-001` | 1 |
| instance-03 | `i-0716d9a9a1dd64309` | `vu-021` | 21 |
| instance-07 | `i-017824d0c9e1afc7e` | `vu-061` | 61 |
| instance-09 | `i-0470c9029c3d0ea19` | `vu-081` | 81 |
| instance-14 | `i-00c76154c6f51c24e` | `vu-131` | 131 |

nGrinder는 위 다섯 행을 제외한 195개 API 사용자 풀에서 단계별로 45, 95, 195개를 앞에서부터 누적 선택한다. 동일 단계 안에서 application과 매직링크 토큰은 브라우저와 API 사용자 사이에 절대 중복되지 않는다.

## API 사용자 시나리오

nGrinder 사용자는 브라우저 화면을 렌더링하지 않지만 실제 운영 API 계약을 그대로 사용한다.

1. `GET /api/v1/public/applications/status?token=...`로 매직링크와 지원 정보를 검증한다.
2. `POST /api/v1/public/applications/{applicationId}/interview/start`로 공개 면접 접근 토큰을 발급받는다.
3. 발급된 bearer token으로 면접 runtime과 질문 목록을 조회한다.
4. 세션 상태가 아직 `IN_PROGRESS`가 아니면 device check와 interview begin을 순서대로 실행한다.
5. runtime과 질문 목록을 다시 조회해 시작 결과를 검증한다.
6. 150초 동안 30초 간격으로 runtime을 조회한다. 이는 미디어 연결을 흉내 내는 것이 아니라 진행 중 사용자의 보수적인 read traffic을 발생시키기 위한 명시적 합성 프로필이다.
7. 유지 시간이 끝나면 runtime과 질문 목록을 최종 조회한다.

API 사용자는 `realtime-session`을 호출하지 않는다. 이 API는 운영 서버가 OpenAI에 임시 client secret을 요청하므로, 195개를 동시에 실행하면 운영 서버 용량과 OpenAI rate limit 및 비용이 섞인다. 실제 Realtime 발급과 WebRTC 연결 검증은 Playwright 5명이 담당한다.

## Playwright 사용자 시나리오

다섯 명은 기존 `render-lite` 실제 브라우저 시나리오를 변경하지 않고 실행한다.

- 실제 Chromium과 분리된 BrowserContext
- 매직링크 인증과 공개 면접 접근 토큰 발급
- 카메라·마이크 fake media stream
- 운영 runtime·질문 API
- OpenAI Realtime credential 발급
- 실제 WebRTC peer connection, remote audio, data channel
- 150초 연결 유지와 10초 상태 확인
- ready, completed, failure 스크린샷

## 인프라 결정

### nGrinder

기존 `init-main-ngrinder` 한 대를 그대로 사용한다.

- EC2: `i-07aedd1f26e5be17d`
- 유형: `t3.medium`
- 역할: nGrinder controller와 local agent
- 초기 용량: 최대 195 API VU

195명의 낮은 RPS API 시나리오는 우선 한 대로 실행한다. 각 단계에서 nGrinder host CPU가 80% 이상으로 지속되거나 agent 오류가 발생하면 generator constraint로 중단한다. 실행 도중 결과를 왜곡하면서 agent를 추가하지 않는다. 필요하면 중단 후 정지된 Playwright EC2 한 대를 별도 nGrinder agent로 재사용하는 새 계획을 수립한다.

### Playwright

위에서 선택한 다섯 대만 실행 상태로 유지하고 나머지 열다섯 대는 EC2 stop 처리한다. stop은 인스턴스와 EBS를 보존하며 destroy 또는 Terraform 전체 apply가 아니다. 결과 확인 전 다섯 대와 fixture, Redis token, S3 결과는 제거하지 않는다.

현재 Terraform resource는 count 기반 20대 상태이므로 이번 실행 전에 count를 임의로 5로 줄이지 않는다. 비연속 instance 번호를 보존하기 위해 EC2 stop/start만 사용하고, 최종 결과 승인 후 제한형 fleet 전체를 별도 cleanup으로 제거한다.

## 토큰 전달과 비밀 보호

- fixture CLI가 200개 매직링크 토큰을 교체하고 private S3 load-test bucket에 저장한다.
- 브라우저 host는 기존 instance partition만 읽는다.
- nGrinder용 데이터는 브라우저 다섯 행을 제외한 별도 private object로 저장한다.
- nGrinder IAM role에는 해당 run input object를 읽는 최소 권한만 부여한다.
- nGrinder agent 시작 전에 SSM으로 object를 로컬 전용 경로에 내려받고 파일 권한을 제한한다.
- 매직링크 토큰, 공개 접근 토큰, OpenAI client secret은 SSM 명령, nGrinder script, 콘솔 로그, 결과 JSON, S3 summary에 출력하지 않는다.
- URL query를 저장하는 결과에서는 `token` 계열 parameter를 제거한다.

## Strict gate

각 단계는 다음 조건을 모두 만족해야 통과한다.

### nGrinder API

- 예정된 API VU 결과가 모두 존재한다.
- HTTP 5xx, timeout, connection error가 0건이다.
- 예상하지 않은 HTTP 4xx가 0건이다.
- application ID와 발급된 access token의 session/application 일치 검증이 모두 통과한다.
- nGrinder agent/controller 오류가 없다.
- nGrinder host CPU가 80% 이상으로 3개 연속 10초 표본을 기록하지 않는다.

### Playwright

- 5/5 VU가 성공한다.
- 각 VU의 hold가 최소 150,000ms이다.
- API 5xx, WebRTC connection drop, data-channel drop이 0건이다.
- ready와 completed 스크린샷이 모두 존재한다.
- Playwright host CPU 90% 이상, available memory 768MiB 미만, load1 4 초과가 각각 3개 연속 10초 표본으로 발생하지 않는다.

### 운영 서버

- ALB target 5xx와 connection error가 0건이다.
- ECS API, frontend, worker task가 unhealthy 또는 비정상 재시작되지 않는다.
- CloudWatch 필수 metric이 누락되지 않는다.
- 서버 CPU·메모리, ALB request count, target response time p50/p95/p99를 수집한다.

제품 SLO가 별도로 합의되지 않았으므로 응답시간 percentile 자체는 이번 strict 실패 조건으로 사용하지 않는다. 대신 단계별 수치와 증가율을 결과에 기록해 후속 SLO 기준선으로 사용한다.

## 결과 수집

각 단계가 끝날 때 다음 artifact를 같은 run ID 아래 저장한다.

- nGrinder 원본 실행 결과와 request별 count/error/latency
- Playwright VU result JSON, host resource sample, 스크린샷, blob report
- CloudWatch ALB/ECS/EC2 metric
- 총 사용자 수와 API/브라우저 사용자 수가 분리된 `summary.json`
- 25명 기존 E2E 결과와 50/100/200 하이브리드 결과를 함께 보여주는 `summary.md`

최종 보고서는 25명 결과를 `E2E 기능 성공 + generator constrained`로 표시하고, 50/100/200 결과를 `HYBRID_PASSED`, `GENERATOR_CONSTRAINED`, `FAILED` 중 하나로 표시한다.

## 실행 순서

1. 현재 25명 결과와 S3 artifact 존재를 확인한다.
2. nGrinder와 Playwright 20대 상태를 확인한다.
3. 선택한 Playwright 다섯 대를 제외한 열다섯 대를 stop한다.
4. 200개 fixture와 Redis 매직링크 토큰을 교체하고 private S3 input을 갱신한다.
5. nGrinder API script를 1명 canary로 검증한다.
6. Playwright 다섯 명과 nGrinder 45명을 같은 barrier에서 실행한다.
7. 50명 결과와 strict gate를 수집·판정한다.
8. 통과 시 120초 cooldown 후 100명, 다시 통과 시 200명을 실행한다.
9. 단계별 S3, CloudWatch, nGrinder, Playwright 결과를 통합한다.
10. 사용자 결과 확인 전 fixture cleanup, Redis token cleanup, EC2 destroy를 실행하지 않는다.

## 금지 범위

- 운영 ECS service/task definition 교체
- 전체 Terraform plan 적용
- 결과 확인 전 fixture, Redis token, S3 artifact 삭제
- 테스트 대상이 아닌 운영 데이터 변경
- 195개의 OpenAI Realtime session 동시 생성
- strict gate 실패 후 다음 단계 강행

## 검증 전략

- nGrinder scenario parser, 사용자 allocation, token redaction, strict summary는 단위 테스트로 검증한다.
- dry-run은 45/5, 95/5, 195/5 배분과 브라우저/API token 비중복을 검증한다.
- 1명 API canary로 매직링크 검증부터 runtime 최종 조회까지 확인한다.
- 실제 실행 전 nGrinder host와 다섯 Playwright host의 generator health를 확인한다.
- 실행 후 Windows Role A local harness와 관련 package 테스트를 수행한다.

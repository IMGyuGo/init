# Playwright 분산 Realtime 부하 테스트 설계

## 상태

- 작성일: 2026-08-02
- 대상 환경: `https://init-jungle.cloud`
- 담당 영역: A(Auth/Common + CI/CD/AWS)
- 관련 리뷰: D(Candidate/Application/Interview), PM(배포 검증/QA)
- 설계 상태: 대화에서 실행 구조, fixture 안전성, 결과 수집, 오류 복구까지 승인됨

## 목표

기존 공고 한 건에 최대 200개의 추적 가능한 테스트 전용 지원자와 public 면접 토큰을 만들고, Amazon EC2 `t3.large` 20대에서 실제 Chromium과 가짜 카메라·마이크를 사용해 Realtime AI 면접 연결을 단계적으로 검증한다.

부하 단계는 `15 -> 25 -> 50 -> 100 -> 200` 동시 사용자이며, 각 단계는 Realtime 연결을 300초 유지하고 다음 단계 전 120초 cooldown을 둔다. 테스트 결과는 사용자별 정상·실패 스크린샷, Playwright 결과, 연결 상태 표본, ALB/ECS/EC2 지표로 확인할 수 있어야 한다.

## 현재 구현의 문제

현재 저장소에는 `infra/aws/playwright-loadtest.tf`, EC2 user data template, `tools/realtime-playwright` 테스트가 있다. 그러나 다음 이유로 요구한 검증을 수행할 수 없다.

- Terraform 변수는 최대 10대만 허용하며 `env/main.tfvars`의 과거 값은 `m7i.xlarge`, 인스턴스당 15행이다.
- EC2마다 `PLAYWRIGHT_WORKERS=1`이라 EC2 10대를 생성해도 실제 동시 실행은 최대 10명이다.
- 유효한 `applicationId,magicToken` CSV를 수동으로 복사해야 한다.
- 성공한 사용자 화면은 저장하지 않고 실패 시에만 스크린샷을 남긴다.
- 여러 EC2의 HTML/JSON 결과와 서버 지표를 하나의 실행 결과로 합치는 제어기가 없다.
- 결과 확인 후 테스트 데이터만 정확히 지우는 load-test 전용 cleanup 흐름이 없다.

## 범위

### 포함

- `t3.large` EC2 20대의 opt-in Terraform 구성
- 최대 200개 load-test fixture의 `plan`, `apply`, `cleanup`
- 기존 공고와 회사 소유 관계 및 면접 준비 상태 preflight
- 20개 인스턴스별 토큰 입력 파일의 암호화 S3 저장
- `15 -> 25 -> 50 -> 100 -> 200` 단계 실행과 UTC 시작 장벽
- 사용자별 Realtime 상태 측정과 성공·완료·실패 스크린샷
- 단계별 Playwright 결과, 시스템 표본, CloudWatch 지표 수집
- 통합 HTML, JSON, Markdown 요약
- 명시적 cleanup과 EC2 제거 절차
- 실행 코드의 의도와 결과 해석을 설명하는 주석 및 runbook

### 제외

- 운영 애플리케이션의 API path, request/response, enum 변경
- 운영 공고 설정 또는 기존 지원자 데이터 수정
- SMTP, 일반 지원 메일, SQS, worker, OpenAI를 fixture 생성 과정에서 호출하는 기능
- 면접 답변 제출, STT, 리포트 생성까지 진행하는 장기 시나리오
- Terraform apply, 운영 fixture 쓰기, 실제 부하 실행의 무승인 자동화

## 전체 아키텍처

구성요소는 다음과 같이 분리한다.

1. Terraform은 EC2 20대, SSM 전용 IAM, outbound-only security group, 전용 private S3 bucket과 lifecycle을 관리한다.
2. API image의 ECS one-off 명령은 운영 DB와 동일한 secret 경계를 사용해 fixture를 계획·생성·정리한다.
3. 로컬 Windows 제어 스크립트는 AWS CLI와 SSM을 사용해 preflight, canary, 단계별 동시 시작, 결과 회수를 수행한다.
4. 각 EC2의 Playwright runner는 자기에게 할당된 최대 10개 토큰만 사용한다.
5. 결과 집계기는 20대의 raw 결과와 CloudWatch 지표를 하나의 실행 디렉터리로 합친다.

Terraform과 운영 쓰기는 서로 다른 승인 지점을 가진다. 인프라 plan을 검토한 뒤에만 apply하고, fixture `plan` 결과를 확인한 뒤에만 fixture `apply`를 실행한다.

## Terraform 설계

기존 main AWS stack의 opt-in resource를 유지하되 일상적인 `env/main.tfvars`에서는 부하 테스트를 비활성화한다. 별도 non-secret tfvars 예시는 다음 값을 가진다.

```hcl
enable_playwright_loadtest            = true
playwright_loadtest_instance_count    = 20
playwright_loadtest_instance_type     = "t3.large"
playwright_loadtest_rows_per_instance = 10
```

변수 검증은 다음을 강제한다.

- 인스턴스 수: `0..20`
- 인스턴스당 fixture 수: `1..10`
- 전체 fixture 수: 최대 200
- 기본값: `enable=false`, `instance_count=0`, `instance_type=t3.large`, `rows_per_instance=10`

EC2는 public subnet에 배치하지만 inbound rule을 갖지 않는다. 운영 접근은 SSM Session Manager와 Run Command만 사용한다. IMDSv2, 암호화 gp3 root volume, detailed monitoring, user data 교체를 유지한다.

전용 S3 bucket은 다음을 적용한다.

- 모든 public access 차단
- TLS가 아닌 요청 거부
- 기본 server-side encryption
- versioning
- `input/` 객체 1일 만료
- `results/` 객체 14일 만료
- EC2 role은 입력 읽기와 결과 쓰기에 필요한 prefix만 허용
- fixture task role은 실행별 입력 작성과 cleanup 시 입력 제거만 허용

실제 apply는 20대 EC2와 전용 load-test resource 외에 RDS, Valkey, ALB, ECS, CloudFront의 삭제·교체가 없는 saved plan만 승인한다.

## Fixture와 토큰 설계

### Manifest

기존 `synthetic_applicant_datasets`와 `synthetic_applicant_records`를 재사용한다. 신규 manifest version은 `PLAYWRIGHT_LOADTEST_MANIFEST_V1`이며 일반 synthetic importer의 V1/V2/V3와 별도 service에서만 처리한다. 기존 컬럼 길이와 ID 기록 구조를 사용하므로 DB migration은 추가하지 않는다.

dataset은 실행 환경, company ID, posting ID, 요청 수량, options hash, 상태를 기록한다. 각 record는 생성된 user ID, candidate ID, application ID와 ordinal을 정확히 기록한다. 일반 synthetic importer가 신규 version을 기존 generator로 해석해서는 안 된다.

### 명령

fixture CLI는 다음 action을 제공한다.

- `plan`: 쓰기 없이 대상과 옵션을 검증하고 생성 예정 집계만 출력
- `apply`: manifest와 최대 200개 fixture를 batch transaction으로 생성하고 토큰 파일 작성
- `cleanup-preview`: 삭제될 manifest 소유 record 수와 ordinal 범위만 출력
- `cleanup`: manifest가 기록한 exact ID만 batch transaction으로 정리

필수 입력은 environment, company ID, posting ID, dataset ID, count, run ID다. count는 `1..200`만 허용한다. production `apply/cleanup`은 전용 write flag와 고정 production ACK가 모두 일치해야 한다.

### 사전조건

fixture `plan/apply`는 record 생성 전에 다음을 확인한다.

- company와 posting이 실제 소유 관계다.
- posting이 면접을 시작할 수 있는 상태다.
- 활성 질문 세트와 Realtime 진입에 필요한 설정이 존재한다.
- 동일 dataset이 있으면 environment, company, posting, count, options hash가 일치한다.
- 이미 존재하는 사용자·지원자·지원서를 update/delete하지 않는다.

새 계정은 password가 없는 test-only candidate account로 만들고 application은 public 면접 진입이 가능한 `READY` projection을 갖는다. 외부 메일, 파일 업로드, AI queue, worker 호출은 하지 않는다.

### 토큰

public application 서명 secret은 기존 ECS secret 주입을 통해서만 읽는다. 토큰은 약 4시간 후 만료되며 `applicationId`와 public application token type만 포함한다.

토큰 원문은 CLI stdout/stderr, CloudWatch log, Terraform state, Git, 통합 summary에 기록하지 않는다. apply는 다음처럼 인스턴스별 10행 CSV 20개를 전용 S3에 직접 쓴다.

```text
runs/<run-id>/input/instance-01.csv
...
runs/<run-id>/input/instance-20.csv
```

요약과 Playwright 결과는 application ID 대신 `vu-001..vu-200` ordinal을 기본 식별자로 사용한다. cleanup 뒤에는 S3 입력 객체를 제거하고 DB application이 사라지므로 아직 만료되지 않은 서명 토큰도 사용할 수 없다.

### 멱등성과 cleanup

동일 dataset과 동일 옵션의 `apply`는 중복 record를 만들지 않는다. 부분 실패 dataset은 manifest record가 없는 ordinal만 재개한다. 다른 company, posting, count, options hash를 사용한 재실행은 거부한다.

cleanup은 결과 확인 후 별도로 실행한다. dataset ID 재확인 인자가 정확히 일치해야 하며, application에 연결된 test session, question snapshot, consent, answer와 manifest 소유 candidate/user를 의존성 순서대로 정리한다. 예상하지 않은 외부 FK가 있거나 exact ID 검증이 실패하면 transaction을 중단하고 dataset을 `PARTIAL`로 남긴다. 감사용 manifest와 cleaned timestamp는 삭제하지 않는다.

## 단계 분배와 동기화

200개 fixture는 EC2 20대에 10개씩 고정 배정한다. 각 단계는 인스턴스가 자기 block의 앞쪽 N개만 활성화한다.

| 단계 | 인스턴스별 배정 | 사용 EC2 | 총 사용자 |
| --- | --- | ---: | ---: |
| 15 | 15대 x 1명 | 15대 | 15 |
| 25 | 앞 5대 x 2명 + 뒤 15대 x 1명 | 20대 | 25 |
| 50 | 앞 10대 x 3명 + 뒤 10대 x 2명 | 20대 | 50 |
| 100 | 20대 x 5명 | 20대 | 100 |
| 200 | 20대 x 10명 | 20대 | 200 |

제어기는 다음 단계 시작 120초 전까지 20대의 SSM online, 입력 다운로드, Playwright 설치, 디스크·메모리 상태를 확인한다. 모든 실행 명령에는 같은 UTC start timestamp와 stage attempt ID를 전달한다. 허용 지연을 넘겨 시작 시각을 놓친 호스트는 늦게 합류하지 않고 실패 결과를 남긴다.

각 단계는 Realtime ready 이후 300초 유지한다. 모든 stage command와 결과 업로드가 끝난 시점부터 120초 cooldown을 센다. 15, 25, 50, 100 단계에 사용한 fixture는 다음 단계에서 다시 연결하며, 이전 browser context는 단계 종료 시 닫는다. session resume이 정상인지 1명 canary와 단계 결과로 검증한다.

## Playwright 동시성 모델

최종 200명에서도 EC2 한 대가 Chromium browser process 10개를 띄우지 않도록 worker와 browser context를 분리한다.

- worker당 최대 5개의 독립 browser context를 병렬 실행
- EC2당 최대 2 worker
- EC2당 최대 10 context/page
- context별 독립 cookie, storage, camera/microphone permission
- fake camera/microphone과 fake media stream 사용

한 group test는 최대 5명의 virtual user를 `Promise.allSettled` 형태로 끝까지 관찰한다. 사용자 한 명이 실패해도 같은 group의 다른 사용자 측정을 취소하지 않는다. 모든 사용자 결과를 기록한 뒤 group assertion에서 실패 수를 반영한다.

단계별 동시 사용자 수를 worker 수로 오해하지 않도록 allocator, group size, context 생성 이유를 코드 주석과 runbook에서 설명한다.

## 사용자별 측정

각 virtual user는 다음 시각과 상태를 기록한다.

- public interview entry navigation 시작/완료
- token 교환과 runtime 진입
- device setup 시작/완료
- Realtime session ready
- 10초 간격 connection state, data channel state, remote audio, event count
- 300초 hold 완료 또는 실패 시각
- API 4xx/5xx, request failure, page error, console error

항상 저장하는 화면 증빙은 다음과 같다.

- Realtime ready 직후 `ready.png`
- 300초 유지 완료 직전 `completed.png`
- 실패 시점의 `failure.png`

token query가 존재하는 최초 entry navigation은 trace를 켜지 않는다. token 교환 후 runtime URL로 이동하고 query에 token이 없음을 확인한 뒤 tracing을 시작한다. 성공한 trace/video는 삭제하고 실패한 context의 trace/video만 보존한다. 로그의 URL은 token query를 제거한 뒤 기록한다.

## 결과 저장과 통합

S3 결과 구조는 다음을 따른다.

```text
runs/<run-id>/
  input/
  canary/attempt-01/instances/01/
  stages/0015/attempt-01/instances/01/
  stages/0025/attempt-01/instances/01/
  stages/0050/attempt-01/instances/01/
  stages/0100/attempt-01/instances/01/
  stages/0200/attempt-01/instances/01/
  summary/
```

각 인스턴스는 Playwright blob/JSON 결과, virtual-user NDJSON, screenshots, 실패 trace/video, runner stdout/stderr, 시스템 resource sample을 업로드한다. 실패한 test process도 shell trap에서 가능한 artifact를 업로드한다.

로컬 collector는 다음을 만든다.

- 통합 Playwright HTML report
- 단계별 및 전체 `summary.json`
- 사람이 바로 읽는 `summary.md`
- virtual user 성공/실패와 증빙 상대 경로
- Realtime ready latency p50/p95/p99
- 실제 hold duration과 sample 누락
- API 4xx/5xx, 연결 중단, page/console error 집계
- CloudWatch와 load generator 상태 요약

## 서버와 부하 발생기 지표

제어기는 단계의 실제 start/end timestamp를 기록하고 같은 구간의 다음 CloudWatch 지표를 조회한다.

- ALB request count
- target response time p50/p95/p99
- ALB/target 4xx·5xx
- target connection error
- ECS frontend/API/worker CPU와 memory 평균/최대
- EC2 CPU, network in/out, CPU credit balance

각 EC2는 10초마다 available memory, load average, Chromium process count와 runner process 상태를 로컬 NDJSON로 남긴다. 서버 오류와 load generator 포화를 분리하기 위해 CPU, memory, load, process 종료 징후가 임계값을 넘으면 stage에 `GENERATOR_CONSTRAINED` 표시를 추가한다. 이 표시는 애플리케이션 실패를 숨기지 않고 결과 해석에 병행한다.

## 판정 기준

기본 stage 성공 기준은 다음과 같다.

- 배정된 모든 virtual user가 90초 안에 Realtime ready에 도달
- 모든 virtual user가 Realtime ready 이후 300초 연결 유지
- server 5xx 0건
- connection/data channel 비정상 종료 0건
- 조기 complete 이동 0건
- 누락된 instance 결과 0건
- load generator 포화 징후 없음

latency와 resource 사용량은 원시값과 percentile을 함께 보고한다. 제품 SLO가 별도로 합의되지 않은 값은 경고로 표시하되 임의의 제품 합격 기준으로 만들지 않는다.

## 오류 처리와 재실행

- 20대가 모두 준비되지 않으면 stage start timestamp를 발행하지 않는다.
- 시작 timestamp를 놓친 인스턴스는 부분 부하에 합류하지 않는다.
- 인스턴스 한 대라도 결과가 없으면 기본적으로 다음 단계로 진행하지 않는다.
- 명시적 `ContinueOnFailure`에서만 실패 뒤 다음 단계 실행을 허용한다.
- 재실행은 `attempt-02`처럼 새 prefix를 사용하고 이전 artifact를 덮어쓰지 않는다.
- report merge가 실패해도 인스턴스별 raw artifact는 유지한다.
- stage 실패는 fixture cleanup이나 EC2 제거를 자동 실행하지 않는다.
- 사용자가 결과를 확인한 뒤 cleanup과 인프라 제거를 각각 실행한다.

## Preflight와 실제 실행 순서

1. AWS account와 region을 확인한다.
2. `https://init-jungle.cloud`와 `/api/v1/health`를 확인한다.
3. Terraform format, validate, saved plan을 확인한다.
4. 사용자가 비용 발생 plan을 승인한 뒤 load-test Terraform을 apply한다.
5. EC2 20대의 SSM online과 bootstrap 완료를 확인한다.
6. fixture `plan`으로 company/posting/질문 세트/수량을 확인한다.
7. 사용자가 production write를 승인한 뒤 fixture `apply`를 실행한다.
8. 입력 파일 20개와 총 200행을 token 원문 없이 확인한다.
9. EC2 한 대·사용자 한 명으로 60초 canary를 실행한다.
10. `15 -> 25 -> 50 -> 100 -> 200` 단계를 실행한다.
11. raw artifact와 CloudWatch 지표를 내려받아 통합 report를 만든다.
12. 사용자가 결과를 확인한다.
13. `cleanup-preview` 뒤 명시적 fixture `cleanup`을 실행한다.
14. load-test Terraform disable plan을 검토하고 EC2 20대와 임시 resource를 제거한다.
15. EC2, token input, fixture domain row 제거와 audit manifest 보존을 확인한다.

## 코드 주석과 운영 문서

주석은 문법을 반복하지 않고 사고가 필요한 결정의 이유를 설명한다.

- Terraform: 기본 비활성화, 20대/10명 상한, 비용·안전 validation
- stage allocator: 15/25/50/100/200을 20대에 균등하게 나누는 계산
- Playwright: worker보다 context를 늘리는 이유와 사용자 실패 격리
- token: 로그, URL, trace에서 token을 제거하는 경계
- screenshot: ready/completed/failure를 찍는 정확한 시점
- collector: percentile, 4xx/5xx, generator constraint의 의미
- cleanup: manifest exact ID만 지우고 예상하지 않은 FK에서 중단하는 이유

runbook에는 필요한 변수, plan/apply 승인 지점, S3 결과 경로, HTML report 열기, summary 해석, cleanup, EC2 제거를 실제 명령과 함께 기록한다.

## 테스트 전략

구현은 테스트 우선으로 진행한다.

- allocator가 각 단계에서 `[0..10]` 범위의 20개 배정과 정확한 합계를 만드는 단위 테스트
- count, stage, run ID, dataset ID, production ACK validation 테스트
- token이 log/result serializer에서 제거되는 테스트
- virtual user 결과가 성공, timeout, 5xx, connection close를 구분하는 테스트
- percentile과 stage 판정 집계 테스트
- manifest options 충돌, partial resume, exact-ID cleanup 테스트
- Terraform `fmt -check`, `init -backend=false`, `validate`
- Playwright `--list`와 소규모 fake fixture 검증
- Windows Role A local harness

실제 운영 부하는 자동 테스트를 대체하지 않는다. 실제 실행 전에는 saved Terraform plan과 fixture plan을 사람이 검토한다.

## 완료 기준

- Terraform이 기본 비활성 상태이고 opt-in 값으로 `t3.large` 20대를 계획한다.
- fixture가 기존 공고에 최대 200개의 exact-ID 추적 데이터를 멱등 생성한다.
- token 원문이 Git, Terraform state, CLI/CloudWatch log, summary에 없다.
- 단계 allocator가 15, 25, 50, 100, 200명을 20대에 정확히 배정한다.
- 각 virtual user의 ready/completed 또는 failure screenshot을 확인할 수 있다.
- 각 stage의 사용자 결과와 ALB/ECS/EC2 지표가 통합 report에 포함된다.
- 실패한 stage를 새 attempt로 재실행할 수 있다.
- 사용자가 결과를 확인하기 전 자동 cleanup이 실행되지 않는다.
- 명시적 cleanup이 manifest 소유 데이터만 제거하고 감사 manifest를 보존한다.
- Role A harness 결과와 cross-owner review 필요성이 최종 보고에 포함된다.

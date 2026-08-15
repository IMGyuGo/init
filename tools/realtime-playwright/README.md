# init-jungle.cloud 분산 Playwright 부하 테스트

이 도구는 기존 공고 하나에 테스트 전용 지원자 최대 200명을 만들고, `t3.large` 20대에서 Realtime 면접을 `15 → 25 → 50 → 100 → 200명` 순서로 검증한다. 한 EC2는 worker 2개, worker당 격리 browser context 5개만 사용하므로 최대 10명이다.

실제 AWS/운영 DB 변경은 이 문서의 명시적 승인 명령 전에는 일어나지 않는다. 컨트롤러도 `Cleanup`이나 Terraform 제거를 자동 호출하지 않는다.

현재 서버 용량 확인의 권장 경로는 아래의 **하이브리드 실행**이다. 이미 확보한 25명 Playwright 결과는 E2E 기준선으로 보존하고, 새 50/100/200명 단계는 각각 `nGrinder API 45/95/195명 + 실제 Chromium 5명`으로 구성한다. 기존 20대 전체 브라우저 절차는 과거 실행 재현용이며, 하이브리드 실행에서는 정확히 5대만 계속 실행한다.

## 현재 승인 경로: nGrinder + Playwright 5대 하이브리드

### 단계와 strict gate

| 단계 | nGrinder API | 실제 Chromium | 유지 시간 | 다음 단계 조건 |
| ---: | ---: | ---: | ---: | --- |
| canary | 1 | 0 | 150초 | API VU 1/1, 오류 0, CloudWatch 완전, 서버 오류 0 |
| 50 | 45 | 5 | 150초 | `HYBRID_PASSED` |
| 100 | 95 | 5 | 150초 | `HYBRID_PASSED` |
| 200 | 195 | 5 | 150초 | `HYBRID_PASSED` |

각 본 단계 사이에는 120초 cooldown이 자동으로 들어간다. `FAILED`뿐 아니라 `GENERATOR_CONSTRAINED`도 strict gate 통과가 아니므로 즉시 중단한다. 이는 서버 성공과 부하 발생기 한계를 혼동하지 않기 위한 보수적인 실행 규칙이다.

브라우저 5명은 기존 fixture ordinal `1, 21, 61, 81, 131`만 사용한다. nGrinder 입력에서는 이 다섯 행을 제외하므로 같은 테스트 계정으로 API와 브라우저가 동시에 세션을 시작하지 않는다.

### 1. 실행 변수와 메모리 내 자격 증명

비밀값은 파일이나 command history에 쓰지 않는다. nGrinder 암호는 실행 프로세스 메모리의 `PSCredential`로만 전달한다.

```powershell
$loadtestCompanyId = [long](Read-Host 'Posting 36 owner company ID')
$loadtestAwsAccountId = Read-Host 'Expected 12-digit AWS account ID'
$loadtestRunId = 'run-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$loadtestDatasetId = 'pwload-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$ngrinderCredential = Get-Credential -Message 'nGrinder controller credential'
```

같은 실행을 이어갈 때는 `RunId`, `DatasetId`, `CompanyId`를 바꾸지 않는다. 이미 lock이 생긴 실패 단계를 재시도할 때만 `-Attempt 2`처럼 attempt를 증가시킨다.

### 2. 제한 IAM saved plan

nGrinder instance role에는 해당 부하 테스트 bucket의 `runs/*/input/instance-*.csv` 읽기와 `runs/*/ngrinder/*` 쓰기만 추가한다. 삭제 권한, 전체 bucket 쓰기, ECS service 변경은 포함하지 않는다.

```powershell
terraform -chdir=infra/aws init -backend-config=backend-main.hcl -reconfigure
$ngrinderIamPlan = Join-Path $env:TEMP "ngrinder-loadtest-s3-$loadtestRunId.tfplan"
terraform -chdir=infra/aws plan `
  -var-file=env/main.tfvars `
  -target=aws_iam_role_policy.ngrinder_loadtest_s3 `
  -out=$ngrinderIamPlan
terraform -chdir=infra/aws show $ngrinderIamPlan
```

plan이 정확히 `aws_iam_role_policy.ngrinder_loadtest_s3` 한 건 추가이고 교체·삭제가 0인지 확인한 뒤에만 저장된 plan을 적용한다.

```powershell
terraform -chdir=infra/aws apply $ngrinderIamPlan
```

### 3. exact fleet preview와 15대 stop

```powershell
& .\scripts\hybrid-loadtest.ps1 `
  -Action FleetStopPreview -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -ExpectedAwsAccountId $loadtestAwsAccountId

& .\scripts\hybrid-loadtest.ps1 `
  -Action FleetStop -ConfirmFleetStop `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -ExpectedAwsAccountId $loadtestAwsAccountId
```

preview는 코드에 고정된 20개 instance ID 전체가 Terraform output과 정확히 일치할 때만 성공한다. stop은 선택된 5대를 running으로 유지하고 나머지 15대만 `stopped`까지 기다린다. terminate나 Terraform destroy는 하지 않는다. stopped 인스턴스는 컴퓨팅 요금은 멈추지만 연결된 EBS 보관 요금은 남는다.

### 4. 매직링크 fixture 200개 재발급

```powershell
& .\scripts\hybrid-loadtest.ps1 `
  -Action FixtureApply -ConfirmProductionWrite `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -ExpectedAwsAccountId $loadtestAwsAccountId
```

이 단계는 공고 36에만 200개 fixture/token을 생성하고 private S3의 20개 partition을 nGrinder host로 동기화한다. 토큰 파일은 `0600`이며 로그·summary에는 token, email, application ID를 기록하지 않는다.

### 5. 1명 API canary strict gate

```powershell
& .\scripts\hybrid-loadtest.ps1 `
  -Action ApiCanary -ConfirmProductionLoad `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -ExpectedAwsAccountId $loadtestAwsAccountId `
  -NgrinderCredential $ngrinderCredential
```

canary는 5번의 30초 sample로 150초 세션 유지를 확인한다. nGrinder VU 결과, generator resource sample, nGrinder report, CloudWatch 요약, stage window가 모두 S3에 저장되고 strict gate가 통과해야 명령이 성공한다.

### 6. 50 → 100 → 200 순차 실행

```powershell
& .\scripts\hybrid-loadtest.ps1 `
  -Action Run -ConfirmProductionLoad `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -ExpectedAwsAccountId $loadtestAwsAccountId `
  -NgrinderCredential $ngrinderCredential
```

`Run`은 같은 run/attempt의 canary API summary, CloudWatch summary, `PASSED` stage window를 다시 확인한다. 기본 단계가 이미 `50, 100, 200`이므로 PowerShell 외부 프로세스에서 쉼표 문자열로 `-Stages`를 넘길 필요가 없다. 한 단계가 strict gate를 통과하지 못하면 다음 단계를 시작하지 않는다.

### 7. 결과 수집과 보류 상태

```powershell
& .\scripts\hybrid-loadtest.ps1 `
  -Action Collect -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -ExpectedAwsAccountId $loadtestAwsAccountId
```

로컬 결과는 `D:\jungleCamp\loadtest-results\<run-id>\`에, S3 결과는 아래 prefix에 남는다.

```text
runs/<run-id>/ngrinder/canary/attempt-1/
runs/<run-id>/ngrinder/stage-50/attempt-1/
runs/<run-id>/ngrinder/stage-100/attempt-1/
runs/<run-id>/ngrinder/stage-200/attempt-1/
runs/<run-id>/stages/<stage>/attempt-1/       # Playwright screenshot/result
runs/<run-id>/summary/
```

결과 확인 전에는 fixture cleanup, Redis token cleanup, EC2 terminate/destroy를 실행하지 않는다. `scripts/hybrid-loadtest.ps1`에는 cleanup action 자체가 없다. 결과 승인 뒤 기존 exact-ID cleanup 절차와 인프라 disable saved plan을 별도 실행한다.

### 병목 요약

50/100/200명 각 단계가 끝나면 기존 hybrid strict verdict를 그대로 반환하면서 별도의 병목 증거를 생성한다. 로컬 결과는 다음 다섯 경로에만 추가된다.

```text
D:\jungleCamp\loadtest-results\<run-id>\stages\<stage>\attempt-<n>\bottleneck-summary.json
D:\jungleCamp\loadtest-results\<run-id>\stages\<stage>\attempt-<n>\bottleneck-summary.md
D:\jungleCamp\loadtest-results\<run-id>\stages\<stage>\attempt-<n>\bottleneck-summary.png
D:\jungleCamp\loadtest-results\<run-id>\summary\bottleneck-final.md
D:\jungleCamp\loadtest-results\<run-id>\summary\stage-comparison.png
```

S3에는 같은 상대 구조로 아래 객체만 조건부 생성한다. 로컬 파일이나 S3 객체가 이미 있으면 덮어쓰지 않으며, 실패한 단계의 재실행은 같은 run ID와 새 attempt를 사용한다.

```text
runs/<run-id>/stages/<stage>/attempt-<n>/bottleneck-summary.json
runs/<run-id>/stages/<stage>/attempt-<n>/bottleneck-summary.md
runs/<run-id>/stages/<stage>/attempt-<n>/bottleneck-summary.png
runs/<run-id>/summary/bottleneck-final.md
runs/<run-id>/summary/stage-comparison.png
```

단계 PNG는 하나의 공통 UTC 시간축에 API p95/오류율, ECS API 최대 CPU, RDS CPU credit balance를 3개 패널로 표시한다. 최종 PNG는 50/100/200명의 사용자 성공률, API p95, API 오류율, ECS API 최대 CPU, DB CPU credit 감소량을 5개 패널로 비교한다. 단계 JSON은 고정 allowlist 필드만 포함하고, 요청 수·대표 오류 유형 같은 추가 안전 지표는 Markdown에만 기록한다.

병목 판정은 다음 7개 중 하나다.

- `PASS`
- `PASS_WITH_DB_CREDIT_RISK`
- `FAIL_APPLICATION`
- `FAIL_DATABASE`
- `FAIL_USER_FLOW`
- `INSUFFICIENT_LOAD`
- `INSUFFICIENT_EVIDENCE`

병목 요약 생성은 기존 hybrid strict verdict를 대체하지 않는다. Redis 상세 지표는 Redis 오류가 있을 때만, generator 상세는 목표 부하 부족 또는 agent 오류가 있을 때만 후속 진단한다. `ApiCanary` 또는 `Run`은 사용자 승인과 `-ConfirmProductionLoad` 없이 실행하지 않는다.

## 안전 경계

- 대상은 정확히 `https://init-jungle.cloud`만 허용한다.
- 기존 공고는 읽어서 참조하지만 fixture가 만든 application/candidate/user/session ID만 manifest로 추적한다.
- token CSV는 private S3의 `runs/<run-id>/input/`에 20개×10행으로 저장하며, EC2에서 `0600`으로 사용한 뒤 즉시 삭제한다.
- 최초 token URL의 query를 browser history에서 즉시 제거한다.
- trace는 magic token과 Realtime credential을 네트워크 기록에 남길 수 있어 항상 끈다. 지속 video 녹화도 generator CPU를 왜곡하므로 끄고 성공·실패 screenshot만 보존한다.
- `Collect`는 `input/*`를 강제로 제외한다. summary에도 token, email, application ID, entry URL을 넣지 않는다.
- fixture write/cleanup에는 `-ConfirmProductionWrite`와 정확한 `-ConfirmDatasetId`가 모두 필요하다.
- 실제 canary/stage에는 `-ConfirmProductionLoad`가 필요하고, 본 단계에는 canary 결과 확인 후 `-ConfirmCanaryReviewed`도 필요하다.
- 실제 명령에는 확인할 12자리 `-ExpectedAwsAccountId`가 필요하다.

이번 서버 용량 실행은 `PLAYWRIGHT_RENDER_MODE=render-lite`를 강제한다. 실제 Chromium, 인증, API, 카메라·마이크 stream과 OpenAI Realtime WebRTC는 유지하지만, Realtime ready 이후 아바타·카메라 preview paint와 MediaPipe 모델 작업은 중지한다. 따라서 이 결과는 서버 동시 처리 용량을 나타내며 최종 사용자 PC의 화면 렌더링 성능을 나타내지 않는다.

## 0. 사전 조건

1. 이 변경이 포함된 API image를 먼저 빌드·배포한다. 실행 중인 API task definition 안에 `dist/src/modules/candidate/scripts/playwright-loadtest-fixture.cli.js`가 있어야 한다.
2. 운영 secret의 `PUBLIC_APPLICATION_TOKEN_SECRET`가 설정돼 있어야 한다.
3. 로컬에 Node.js 20, npm, Terraform, AWS CLI, PowerShell 5.1 이상이 있어야 한다.
4. AWS profile은 Terraform state와 같은 운영 account/`ap-northeast-2`를 가리켜야 한다.
5. 기존 공고의 회사 ID와 공고 ID를 사람이 확인한다. 자동화는 새 공고를 만들지 않는다.

로컬 변수는 실제 값으로 입력하되 파일에 저장하지 않는다.

```powershell
$loadtestCompanyId = [long](Read-Host 'Existing posting owner company ID')
$loadtestPostingId = [long](Read-Host 'Existing posting ID')
$loadtestAwsAccountId = Read-Host 'Expected 12-digit AWS account ID'
$loadtestRunId = 'run-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$loadtestDatasetId = 'pwload-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$env:PLAYWRIGHT_LOADTEST_AWS_ACCOUNT_ID = $loadtestAwsAccountId
```

같은 fixture를 재실행할 때는 `RunId`, `DatasetId`, 회사/공고 ID를 바꾸지 않는다. 실패한 stage만 다시 실행할 때는 같은 `RunId`와 새 `-Attempt 2`를 사용한다.

## 1. 로컬 검증과 dry-run

```powershell
npm.cmd --prefix tools/realtime-playwright run test:unit

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Preflight -DryRun `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -PostingId $loadtestPostingId

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Run -DryRun -ConfirmProductionLoad -ConfirmCanaryReviewed `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -PostingId $loadtestPostingId
```

dry-run 출력에는 AWS/SSM 계획과 단계별 숫자만 있어야 한다. JWT처럼 점(`.`)으로 구분된 token, `magicToken`, `applicationId`가 보이면 실제 실행을 중단한다.

## 2. Terraform saved plan 검토와 EC2 생성

일상 설정인 `env/main.tfvars`는 부하 테스트를 `false/0`으로 유지한다. 두 번째 opt-in var-file을 명시한 saved plan만 20대를 만든다.

```powershell
terraform fmt -check -recursive infra/aws
terraform -chdir=infra/aws init
terraform -chdir=infra/aws validate

$loadtestPlan = Join-Path $env:TEMP "playwright-loadtest-$loadtestRunId.tfplan"
terraform -chdir=infra/aws plan `
  -var-file=env/main.tfvars `
  -var-file=env/playwright-loadtest.tfvars.example `
  -out=$loadtestPlan

terraform -chdir=infra/aws show $loadtestPlan
```

saved plan에서 다음을 직접 확인한다.

- `aws_instance.playwright_loadtest` 20대, 모두 `t3.large`
- public IP는 있지만 inbound rule은 0개이고 SSM으로만 실행
- private S3 bucket, public access block, versioning, AES256
- input 1일, `runs/` 결과 14일, `bootstrap/` source bundle 30일 lifecycle
- 현재 서비스·DB·기존 공고를 삭제하거나 축소하는 변경이 없음

비용과 변경 범위를 승인한 뒤에만 적용한다.

```powershell
terraform -chdir=infra/aws apply $loadtestPlan
```

이 명령은 실제 AWS 리소스를 만든다. bootstrap은 private S3의 버전 해시 경로에서 Playwright 코드를 받고, token은 포함하지 않는다.

## 3. Preflight와 fixture plan

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Preflight `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -ExpectedAwsAccountId $loadtestAwsAccountId

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action FixturePlan `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -PostingId $loadtestPostingId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

Preflight는 account/region, exact target health, Terraform output, 실행 중인 `t3.large` 20대, SSM Online 20/20과 Playwright bootstrap marker 20/20을 검사한다. `FixturePlan`은 ECS one-off API task의 읽기 전용 plan이며 DB/S3를 쓰지 않는다. 공고, 질문 snapshot 가능 여부, count 200을 확인한 후에만 다음으로 간다. `Collect`와 cleanup 계열은 core preflight만 사용하므로 fleet를 비활성화했거나 일부 host가 장애 상태여도 persistent bucket 결과 수집과 exact-ID 정리를 계속할 수 있다.

## 4. fixture 200명 생성

다음 명령은 운영 DB와 private S3 input을 실제로 쓴다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action FixtureApply -ConfirmProductionWrite `
  -ConfirmDatasetId $loadtestDatasetId `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -PostingId $loadtestPostingId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

ECS exit code가 0이어야 한다. 같은 입력으로 재실행하면 manifest의 partial 상태를 이어서 채우며 200명을 중복 생성하지 않는다. token TTL은 최대 4시간이다.

## 5. 1명 canary와 본 단계

canary는 첫 EC2의 첫 fixture 하나만 사용하되 본 단계와 동일하게 150초 유지한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Canary -ConfirmProductionLoad `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

canary 직후 `Collect`를 실행해 150초 hold, 5xx/drop 0, `renderMode=render-lite`, screenshot과 summary를 사람이 확인한다. 본 단계는 같은 `RunId`/`Attempt`의 `PASSED` summary, 성공 stage window와 `vu-001/result.json`을 다시 검증하며 `-ConfirmCanaryReviewed`가 없으면 중단한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Run -ConfirmProductionLoad -ConfirmCanaryReviewed `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

기본 단계는 다음과 같다.

| 단계 | 배분 | active EC2 | ready 후 hold |
| ---: | --- | ---: | ---: |
| 15 | 15대×1 | 15 | 150초 |
| 25 | 앞 5대×2 + 뒤 15대×1 | 20 | 150초 |
| 50 | 앞 10대×3 + 뒤 10대×2 | 20 | 150초 |
| 100 | 20대×5 | 20 | 150초 |
| 200 | 20대×10 | 20 | 150초 |

각 단계는 120초 뒤의 같은 UTC `barrier`를 받고, 완료 후 다음 단계까지 120초 cooldown한다. stage/attempt별 S3 lock은 `If-None-Match: *` 조건부 생성으로 먼저 예약되므로 동시 controller도 같은 attempt를 중복 실행할 수 없다. barrier 전 dispatch가 실패하면 예정 barrier와 실제 관측 `start/end`를 분리해 최소 1초의 유효한 stage window를 남기고 이미 발급한 SSM command를 취소·대기한다. 한 host라도 SSM/Playwright 결과가 실패하면 기본적으로 중단한다. 조사 목적으로만 `-ContinueOnFailure`를 명시한다.

실패 단계를 덮어쓰지 않고 재실행할 때도 같은 새 attempt의 canary를 먼저 실행·수집·확인한다. 다음은 그 뒤 50명만 재실행하는 예다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Run -Stages 50 -Attempt 2 -ConfirmProductionLoad -ConfirmCanaryReviewed `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

## 6. 결과 수집과 확인

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Collect `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

결과 위치:

```text
playwright-loadtest-results/<run-id>/
  raw/
    canary/attempt-1/instance-01/
    stages/15/attempt-1/instance-01/
    metrics/stage-15-attempt-1.json
  summary/
    summary.json
    summary.md
    playwright-report/index.html
```

HTML report 열기:

```powershell
$report = Join-Path $PWD "playwright-loadtest-results\$loadtestRunId\summary\playwright-report\index.html"
Start-Process -FilePath $report
```

사용자 증빙은 `raw/stages/<stage>/attempt-<n>/instance-<nn>/virtual-users/vu-<nnn>/`에 있다.

- `ready.png`: Realtime connection/data channel이 ready가 되고 render-lite가 활성화된 직후
- `completed.png`: 150초 hold를 통과한 직후이며 면접 제출 화면이라는 뜻은 아님
- `failure.png`: 실패 당시 화면
- `result.json`: VU ordinal, render mode, 150초 hold 설정과 실제 유지시간, 4xx/5xx, drop, request/page/console 오류 횟수, 고정 failure code만 포함
- `resource-samples.ndjson`: EC2 CPU, available memory, load1, Chromium crash, OOM 표본
- `raw/metrics/`: 같은 stage window의 ALB, ECS, EC2/CPU credit/network CloudWatch 원본

지속 video 녹화는 headless EC2의 소프트웨어 렌더링 CPU를 애플리케이션 부하로 오인하게 하므로 사용하지 않는다. 시각 증빙은 `ready.png`, `completed.png`, `failure.png`로 제한한다.

summary 판정:

- `PASSED`: 모든 VU가 90초 안에 ready, 정해진 hold 완료, 5xx/drop/누락 host 0, generator 정상
- `FAILED`: VU 실패, Playwright 또는 CloudWatch target 5xx/connection error, 필수 CloudWatch 지표 누락/미완료, timeout, drop, hold 부족, 실패 stage window, 결과/active host 누락 중 하나 이상. 이 판정은 generator 제약보다 우선한다.
- `GENERATOR_CONSTRAINED`: 애플리케이션 검사는 통과했지만 host CPU 90% 3회, available memory 768MiB 미만 3회, load1 4 초과 3회, Chromium crash/OOM 중 하나가 발생

`readyP50Ms`, `readyP95Ms`, `readyP99Ms`는 navigation 시작부터 Realtime ready까지의 선형 보간 percentile이다. `minimumHeldMs`, `api4xx`, `api5xx`, `connectionDrops`, `reportedHosts/expectedHosts`, `orchestrationSuccess`, `cloudWatchServerFailure`를 함께 확인한다. `virtualUsers`에는 VU ordinal, 성공/실패, 고정 failure code, 상대 evidence 경로만 들어간다. 제품 SLO가 별도로 합의되지 않은 CloudWatch latency/resource 값은 원시 측정치이며 임의의 latency 합격 기준으로 해석하지 않는다. Fleet 제거 후 Collect에서는 현재 EC2 ID가 없으므로 EC2 CloudWatch query만 생략하고, 보존된 host resource sample과 ALB/ECS 지표는 계속 통합한다.

수집된 summary와 HTML report는 private S3의 `runs/<run-id>/summary/`에도 AES256으로 업로드된다.

## 7. 결과 확인 후 cleanup

결과를 사람이 확인하기 전에는 아래 명령을 실행하지 않는다. 먼저 exact-ID 삭제 예정 건수를 본다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action CleanupPreview `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -PostingId $loadtestPostingId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

preview의 dataset, count, manifest 상태가 예상과 같을 때만 실제 cleanup을 승인한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\playwright-loadtest.ps1 `
  -Action Cleanup -ConfirmProductionWrite `
  -ConfirmDatasetId $loadtestDatasetId `
  -RunId $loadtestRunId -DatasetId $loadtestDatasetId `
  -CompanyId $loadtestCompanyId -PostingId $loadtestPostingId `
  -ExpectedAwsAccountId $loadtestAwsAccountId
```

cleanup은 manifest의 exact ID만 transaction으로 지우고 감사 manifest/cleaned timestamp는 남긴다. 예상하지 않은 FK가 있으면 임의 cascade하지 않고 실패한다. input object의 현재 version도 삭제한다.

## 8. EC2 20대 제거와 부재 확인

fixture cleanup과 인프라 제거는 별도 작업이다. `terraform destroy`를 사용하지 않는다. 기본 `main.tfvars`의 disabled/0으로 saved plan을 만든다.

```powershell
$disablePlan = Join-Path $env:TEMP "playwright-loadtest-disable-$loadtestRunId.tfplan"
terraform -chdir=infra/aws plan -var-file=env/main.tfvars -out=$disablePlan
terraform -chdir=infra/aws show $disablePlan
```

plan에서 Playwright EC2 20대, instance profile/role/SG처럼 count 기반 실행 리소스만 제거되고, 서비스/RDS와 private 결과 bucket은 유지되는지 확인한다. 승인 후 적용한다.

```powershell
terraform -chdir=infra/aws apply $disablePlan

terraform -chdir=infra/aws output -json playwright_loadtest_instances
aws ec2 describe-instances `
  --filters 'Name=tag:Service,Values=playwright-loadtest' 'Name=instance-state-name,Values=pending,running,stopping,stopped' `
  --query 'Reservations[].Instances[].InstanceId' --output json --region ap-northeast-2
```

두 결과 모두 비어 있어야 한다. EC2/SSM 실행 리소스는 제거되지만 private 결과 bucket은 `runs/` 결과를 14일 보존하기 위해 남는다. bootstrap source도 비밀이 아니며 30일 뒤 만료되고, bucket public access는 계속 차단된다.

## 코드에서 확인할 핵심 주석

- `src/stage-allocation.mjs`: 20대 quotient/remainder 배분 이유
- `tests/realtime-session-hold.spec.ts`: token 제거, credential-safe trace 비활성화, context 실패 격리, screenshot 시점
- `infra/aws/templates/playwright-loadtest-user-data.sh.tftpl`: 0600 token, UTC barrier, 자원 sampler, 실패 보존 upload trap
- `scripts/playwright-loadtest.ps1`: 운영 승인 gate, 실제 배포 task revision, token 제외 Collect, cleanup 비자동화
- `src/result-summary.mjs`: percentile, 기능 실패 우선, generator constraint 판정

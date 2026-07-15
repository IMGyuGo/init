# AWS 인프라 구축 및 배포 Runbook

이 문서는 `init` 프로젝트의 AWS 인프라를 실제 계정에 구축하고, Docker image 배포와 migration을 거쳐 `https://init-jungle.cloud`를 기동하는 실행 절차를 정리한다.

Terraform 코드는 AWS resource의 기준선이다. 이 runbook은 그 Terraform 기준선을 언제 어떤 순서로 적용하고, Terraform 밖에서 필요한 ECR push, Secrets Manager 값 seed, ECS one-off migration, smoke test, GitHub Actions deploy workflow까지 어떻게 이어갈지 설명한다.

## 문서 역할

AWS 배포 설계의 source of truth는 두 문서로 나눈다.

| 문서 | 역할 |
| --- | --- |
| `docs/04_implementation/aws-deployment-solution.md` | 배포 설계 결정, tradeoff, 완료/중단 기준 |
| `infra/aws/README.md` | 실제 적용 runbook, 명령, 확인 지점, 유지보수 절차 |

따라서 실제 AWS에 적용할 때는 이 문서를 기준으로 진행하고, 설계 방향이 바뀌면 먼저 `aws-deployment-solution.md`를 갱신한 뒤 이 runbook을 맞춘다.

## 구성 원칙

AWS environment는 `main` 단일 실배포 환경만 둔다. `dev`와 `main` Git branch는 모두 같은 VPC, CloudFront distribution, ALB, ECS service, RDS, Valkey, S3 bucket, SQS queue, Secrets Manager path를 갱신한다.

```text
dev branch  -> init-main-* resources -> init-jungle.cloud
main branch -> init-main-* resources -> init-jungle.cloud
```

단일 실배포 도메인에서 frontend와 API를 path로 나눈다.

```text
/      -> ECS frontend service
/api/* -> ECS API service
```

## Terraform 파일 역할

| 파일 | 책임 |
| --- | --- |
| `bootstrap/*` | remote state S3 bucket, Route53 hosted zone, 계정 단위 GitHub OIDC provider 최초 생성 |
| `versions.tf`, `providers.tf` | Terraform/AWS provider 버전과 region 설정. CloudFront ACM은 `us-east-1`, Q Developer Slack channel configuration은 Chatbot endpoint가 확인된 `us-east-2` provider alias를 사용 |
| `variables.tf`, `locals.tf` | main 실배포 입력값, naming, service/env/secret key 계약 |
| `network.tf` | VPC, subnet, route table, NAT Gateway, VPC endpoint |
| `security-groups.tf` | ALB, ECS, RDS, Valkey/Redis-protocol cache, VPC endpoint security group |
| `alb-cloudfront.tf` | ALB listener/target group, CloudFront behavior, S3 OAC |
| `route53-acm.tf` | Route53 app record, CloudFront용 us-east-1 ACM 인증서, DNS validation record |
| `ecs.tf` | ECS cluster, task definition, service |
| `ecr.tf` | main 실배포 ECR repository와 lifecycle policy |
| `rds.tf`, `redis.tf` | PostgreSQL RDS, ElastiCache Valkey |
| `s3-sqs.tf` | asset bucket, SQS/DLQ |
| `secrets.tf` | service별 Secrets Manager container |
| `iam.tf` | ECS execution/task role, GitHub deploy role, Q Developer/Chatbot Slack 알림용 role |
| `cloudwatch.tf` | ECS log group, CloudWatch alarm, Slack 알림용 SNS topic/Q Developer channel configuration, CloudWatch dashboard |
| `outputs.tf` | 적용 후 필요한 endpoint, ARN, URL 출력 |
| `env/main.tfvars` | main 실배포 구체 property 값 |

## 적용 전 준비사항

로컬 또는 CI 실행 환경에 아래가 필요하다.

- Terraform `>= 1.10.0`
- AWS CLI 또는 AWS SSO/profile 등 AWS credential
- 대상 AWS account ID
- Terraform state bucket 이름: `init-tfstate-<aws_account_id>-ap-northeast-2`
- 가비아에서 구매한 root domain: `init-jungle.cloud`
- Route53 hosted zone 생성 후 가비아 네임서버를 Route53 NS record로 위임할 권한
- Amazon Q Developer in chat applications에 Slack workspace가 승인되어 있어야 함
- Slack 알림을 받을 channel에 Amazon Q 앱을 초대할 권한
- `dev`, `main` 브랜치가 같은 실배포 환경을 갱신한다는 팀 합의
- AWS 비용 발생 가능성에 대한 승인

현재 설계는 같은 AWS 계정 안에 `main` 실배포 환경 하나만 두는 전제를 둔다.

AWS credential은 예를 들어 아래 방식 중 하나로 준비한다.

```powershell
aws configure
aws sts get-caller-identity
```

또는 SSO/profile을 쓴다면 명령 앞에 profile을 지정한다.

```powershell
$env:AWS_PROFILE="your-profile-name"
aws sts get-caller-identity
```

## AWS 인프라 구축 통합 Runbook

이 runbook은 최초 1회 구축을 기준으로 한다. 이후 변경은 아래 `AWS 변경 유지보수 원칙`과 `변경 작업 표준 절차`를 따른다.

전체 흐름:

```text
1. Preflight
2. Bootstrap apply
3. Gabia NS 위임
4. backend-main.hcl 준비
5. main Terraform apply
6. Secrets Manager 값 seed
7. 초기 Docker image build/push
8. ECS one-off migration task
9. ECS service activation
10. domain smoke test
11. GitHub Actions deploy workflow 구현
12. dev/main branch 자동 배포 검증
```

중간에 코딩 에이전트가 대신할 수 없는 작업은 AWS 계정 선택, Terraform apply 승인, 가비아 네임서버 변경, 실제 secret 값 입력, AWS 비용/보안 판단이다. 해당 단계에서는 명령 결과를 기준으로 사용자가 직접 확인한다.

### 1. Preflight

목적은 잘못된 AWS 계정이나 깨진 Terraform 상태로 apply를 시작하지 않는 것이다.

실행:

```powershell
aws sts get-caller-identity
terraform -chdir=infra/aws fmt -check -recursive
terraform -chdir=infra/aws init -backend=false
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws/bootstrap init -backend=false
terraform -chdir=infra/aws/bootstrap validate
```

확인:

- `Account`가 팀에서 쓰기로 한 AWS 계정 ID와 일치해야 한다.
- Terraform validate가 main stack과 bootstrap stack 모두 통과해야 한다.
- `infra/aws/env/main.tfvars`의 `environment`는 `main`이어야 한다.

중단 기준:

- AWS 계정이 다르다.
- Terraform validate가 실패한다.
- `dev` 또는 별도 환경을 새로 만들려는 변경이 섞여 있다.

### 2. Bootstrap apply

bootstrap은 main stack보다 먼저 1회만 실행한다. 여기서 remote state S3 bucket, Route53 hosted zone, GitHub OIDC provider를 만든다.

실행:

```powershell
$accountId = aws sts get-caller-identity --query Account --output text
$stateBucket = "init-tfstate-$accountId-ap-northeast-2"

terraform -chdir=infra/aws/bootstrap init
terraform -chdir=infra/aws/bootstrap plan -var "state_bucket_name=$stateBucket" -out=tfplan-bootstrap
terraform -chdir=infra/aws/bootstrap apply tfplan-bootstrap
terraform -chdir=infra/aws/bootstrap output
```

GitHub OIDC provider가 이미 있는 계정이면 중복 생성하지 않는다. plan에서 중복 에러가 나면 기존 provider를 bootstrap state로 import한 뒤 다시 plan/apply한다.

```powershell
terraform -chdir=infra/aws/bootstrap import aws_iam_openid_connect_provider.github arn:aws:iam::<aws_account_id>:oidc-provider/token.actions.githubusercontent.com
```

AWS Console 확인:

- S3 bucket: `init-tfstate-<aws_account_id>-ap-northeast-2`
- Route53 hosted zone: `init-jungle.cloud`
- IAM OIDC provider: `token.actions.githubusercontent.com`

중단 기준:

- state bucket 이름이 다른 계정 ID로 만들어졌다.
- GitHub OIDC provider 중복을 import 없이 억지로 새로 만들려고 한다.

### 3. Gabia NS 위임

목적은 가비아에서 구매한 `init-jungle.cloud`를 Route53 hosted zone으로 위임하는 것이다. 이 위임이 끝나야 CloudFront용 ACM 인증서 DNS validation이 정상 완료된다.

실행:

```powershell
terraform -chdir=infra/aws/bootstrap output route53_name_servers
```

사용자 작업:

1. 가비아 관리 화면에 로그인한다.
2. `init-jungle.cloud` 도메인의 네임서버를 위 output의 Route53 NS 값으로 교체한다.
3. 변경 후 DNS 전파를 기다린다.

확인:

```powershell
nslookup -type=NS init-jungle.cloud
```

AWS Console 확인:

- Route53 hosted zone의 NS 값과 `nslookup` 결과가 일치해야 한다.

중단 기준:

- 가비아 네임서버가 Route53 NS로 바뀌지 않았다.
- NS 전파가 되지 않아 ACM DNS validation이 계속 대기 상태다.

### 4. backend-main.hcl 준비

main stack의 Terraform state를 bootstrap에서 만든 S3 bucket에 저장하도록 backend config를 만든다. 이 파일은 실제 account ID가 들어가므로 Git에 커밋하지 않는다.

실행:

```powershell
Copy-Item infra\aws\backend-main.hcl.example infra\aws\backend-main.hcl
```

`infra/aws/backend-main.hcl`의 `<aws_account_id>`를 실제 계정 ID로 바꾼다.

```hcl
bucket       = "init-tfstate-123456789012-ap-northeast-2"
key          = "init/main/terraform.tfstate"
region       = "ap-northeast-2"
encrypt      = true
use_lockfile = true
```

확인:

```powershell
terraform -chdir=infra/aws init -backend-config=backend-main.hcl -reconfigure
```

중단 기준:

- backend bucket 이름의 account ID가 현재 AWS 계정과 다르다.
- `backend-main.hcl`을 Git에 stage하려고 한다.

### 5. main Terraform apply

목적은 애플리케이션이 올라갈 AWS 리소스를 만든 뒤, 아직 ECS task는 띄우지 않는 것이다. 현재 `env/main.tfvars`의 `desired_counts`는 `0`이므로 apply 직후 앱은 아직 실행되지 않는다.

세부 진행:

| Substep | 목적 | 실행/확인 | 중단 기준 |
| --- | --- | --- | --- |
| 5.1 Backend/init 재확인 | S3 backend와 AWS 계정 확인 | `aws sts get-caller-identity`, `terraform init` | 계정, region, backend bucket 불일치 |
| 5.2 Static validation | Terraform 정적 검증과 ECS 비기동 확인 | `fmt`, `validate`, `desired_counts = 0` 확인 | validate 실패 또는 desired count가 0이 아님 |
| 5.3 Main plan 생성 | 실제 변경 목록을 plan 파일로 저장 | `terraform plan ... -out=tfplan-main` | plan 생성 실패 |
| 5.4 Plan 리뷰 | 위험 변경 확인 | 생성/수정/삭제, replacement, IAM trust, DNS, ECS desired count 확인 | RDS/Valkey/VPC/CloudFront 삭제 또는 교체, IAM trust 확장, ECS desired count 증가 |
| 5.5 리소스 그룹 리뷰 | AWS Console 기준으로 plan 리소스를 묶음별 검토 | Network, Security, Edge/DNS/ACM, ALB, ECS/ECR/IAM/Secrets, Data/Storage/Queue/Observability 확인 | 보안 경계, 비용, 삭제/교체, public 노출, 보호 설정 blocker |
| 5.6 Application runtime AWS readiness | 실제 서비스 코드가 AWS 리소스를 쓰는지 확인 | frontend build env, runtime secret key, mock/in-memory fallback, managed service smoke 기준 확인 | 운영에서 localhost/mock/memory/localstack fallback이 남거나 필수 env key가 누락됨 |
| 5.7 사용자 apply 승인 | 비용 발생 전 명시 승인 확보 | 사용자가 plan 요약, 리소스 그룹 리뷰, runtime readiness 확인 후 승인 | 승인 문구 없음 |
| 5.8 Main apply 실행 | main AWS 리소스 생성 | `terraform apply tfplan-main` | apply 실패 또는 예상 밖 destroy/replacement |
| 5.9 Output/Console 확인 | 다음 단계 입력값 확보 | Terraform output, AWS Console 상태 확인 | 필수 output 누락 또는 ACM validation 실패 |
| 5.10 세션 기록 | 이어받기 가능한 상태 기록 | `infra/APPLY_SESSION.md` 갱신 | secret/password/token 포함 출력 |

5.1-5.3 실행:

```powershell
terraform -chdir=infra/aws init -backend-config=backend-main.hcl -reconfigure
terraform -chdir=infra/aws fmt -check -recursive
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws plan -var-file=env/main.tfvars -out=tfplan-main
terraform -chdir=infra/aws show -no-color tfplan-main
```

PowerShell에서 `-backend-config=...` 인자 해석 오류가 나면 `infra/aws`로 이동한 뒤 작은따옴표로 flag를 감싸 실행한다.

```powershell
Set-Location infra\aws
terraform init '-backend-config=backend-main.hcl' '-reconfigure' '-input=false'
terraform plan '-var-file=env/main.tfvars' '-out=tfplan-main'
terraform show -no-color tfplan-main
```

5.5-F Observability 검토 기준:

| 항목 | 확인할 것 | 중단 기준 |
| --- | --- | --- |
| Slack workspace | Amazon Q Developer in chat applications에서 Slack workspace `T0B8PCG46J0`가 승인되어 있어야 한다. CLI 확인은 `aws chatbot describe-slack-workspaces --region us-east-2`를 사용한다. | workspace가 `ENABLED`가 아니거나 Terraform이 Slack channel configuration을 생성할 수 없다. |
| Slack channel | `infra/aws/env/main.tfvars`의 `slack_channel_id`가 실제 알림 channel ID여야 하고, Slack channel에 Amazon Q 앱이 초대되어 있어야 한다. | channel ID가 틀렸거나 private channel 접근 권한이 없다. |
| SNS alert path | `init-main-ops-alerts` SNS topic이 생성되고 CloudWatch alarm의 `alarm_actions`/`ok_actions`가 이 topic을 참조해야 한다. | alarm은 생성되지만 Slack으로 전달될 action이 없다. |
| 핵심 alarm | ALB target 5xx, frontend/API unhealthy host, ALB p95 latency, SQS oldest message, SQS DLQ visible, RDS CPU alarm이 포함되어야 한다. | worker 실패/DLQ나 ALB health 이상을 감지할 alarm이 없다. |
| Dashboard | `init-main-overview` dashboard가 CloudFront, ALB, ECS, RDS, Valkey, SQS 지표를 보여야 한다. | dashboard가 없거나 alarm 목록만 있고 운영 상태를 볼 metric이 없다. |

CloudFront 5xx는 1차 Pack에서 dashboard metric으로만 표시한다. CloudFront alarm을 Slack으로 보내려면 `us-east-1` CloudWatch alarm과 SNS topic을 별도로 설계해야 하므로 후속 변경으로 분리한다.

Amazon Q Developer Slack channel configuration의 자체 logging은 `logging_level = "NONE"`으로 둔다. channel logging을 CloudWatch Logs로 보내면 별도 로그 비용이 생길 수 있으므로, 초기 pack에서는 Slack 알림 수신과 CloudWatch dashboard 확인에 집중한다.

5.6은 Terraform 리소스 그룹 리뷰와 별도로, 실제 서비스 코드가 AWS 리소스를 바로 사용할 수 있는지 확인하는 gate다. 이 gate가 끝나기 전에는 “인프라는 먼저 만들고 앱 연결은 나중에 본다”로 넘어가지 않는다.

확인 항목:

| 영역 | 확인할 것 | 중단 기준 |
| --- | --- | --- |
| Frontend API origin | Next.js client가 `https://init-jungle.cloud/api/v1/*`로 호출되도록 build-time 값 또는 same-origin 상대 경로를 확정한다. `NEXT_PUBLIC_*`는 Secrets Manager runtime 값만으로 바뀌지 않는다. | frontend image가 `http://localhost:3001` 또는 `:3001` API origin을 품고 build됨 |
| Frontend public payment key | 결제 화면을 운영에 노출한다면 `NEXT_PUBLIC_TOSS_CLIENT_KEY` build-time 주입 방식을 확정한다. | Toss client key가 빈 값인 image를 운영 배포함 |
| API runtime env | `infra/aws/locals.tf`의 secret key 목록이 코드에서 실제 사용하는 운영 env와 일치해야 한다. 결제, OAuth, public link, upload limit, CORS/origin 값도 포함한다. | 코드가 `TOSS_SECRET_KEY`, `APP_FRONTEND_URL`, `PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES` 등 운영 값을 요구하지만 secret mapping에 없음 |
| AWS SDK local override | ECS production secret에는 `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 같은 LocalStack/static key 값을 넣지 않는다. ECS task role/default credential chain을 사용한다. | production task가 LocalStack endpoint 또는 static access key를 사용함 |
| S3 public/private split | CloudFront로 공개할 prefix는 회사 로고/JD 이미지처럼 bucket policy가 허용한 prefix와 맞아야 한다. 지원자 문서, 면접 음성/영상 원본은 public URL로 노출하지 않는다. | private object에 `S3_PUBLIC_BASE_URL` 기반 공개 URL을 제공함 |
| S3 candidate file upload | candidate resume/portfolio 경로가 실제 S3 object를 생성하는지 확인한다. metadata-only 기록만으로 `file_assets`를 만들면 안 된다. | S3 object 없이 DB metadata만 생성됨 |
| S3 AI key trust | document extract/STT dispatch에서 client-supplied `s3Key`/`audioS3Key`를 그대로 worker에 넘기지 않는다. DB file asset/application/answer 기준 canonical key를 재조회한다. | worker가 검증되지 않은 S3 key를 `GetObject`함 |
| S3 public base URL | 회사 로고/JD 이미지 public URL은 CloudFront OAC 허용 prefix와 `S3_PUBLIC_BASE_URL=https://init-jungle.cloud`가 맞아야 한다. | private S3 direct URL을 public URL로 반환함 |
| SQS real queue | API publisher와 worker consumer가 실제 `AI_SQS_QUEUE_URL`을 사용해야 한다. queue URL 누락으로 in-memory queue에 fallback되면 안 된다. | API가 SQS 대신 in-memory publisher로 기동됨 |
| Worker real mode | worker는 `WORKER_REPOSITORY_MODE=prisma`, `AI_PROVIDER_MODE=openai`, `AI_STT_PROVIDER=openai` 등 실제 처리 모드와 provider key를 사용한다. | worker가 memory repository 또는 mock AI/STT provider로 운영 기동됨 |
| Valkey cache required behavior | 인증 코드와 public magic link가 ElastiCache Valkey를 Redis protocol로 사용해야 한다. 운영에서 cache 장애를 조용히 memory fallback으로 숨기지 않는지 확인한다. | production에서 Valkey cache 없이 인증/매직링크가 성공한 것처럼 보임 |
| External SMTP | provider credential, `SMTP_FROM`, TLS, 발신 도메인/SPF/DKIM/DMARC 검증 상태를 확인한다. | 인증 메일 또는 public application magic link 발송이 실패함 |
| OAuth/payment callbacks | Google callback URL, Toss success/fail URL의 base가 `https://init-jungle.cloud` 기준인지 확인한다. | 외부 provider callback이 localhost 또는 잘못된 origin으로 설정됨 |
| Health/smoke | `/api/v1/health`만으로 충분하지 않다. DB, Valkey, S3 put/read, SQS publish/consume, SMTP verify/send, worker 처리까지 실제 smoke 시나리오를 준비한다. | 단순 health는 성공하지만 핵심 managed service 경로가 검증되지 않음 |

Valkey/Redis protocol naming policy:

- AWS managed cache engine은 ElastiCache Valkey 7.2로 고정한다.
- API 서버는 `ioredis` client로 Redis protocol을 사용한다. 인증 코드 발급과 상태 갱신의 원자성을 위해 `GET`, `PTTL`, `SET ... EX`, `SET ... PX`, `EXISTS`, `DEL`, Lua/EVAL을 사용하며 Streams, Pub/Sub, Cluster 전용 명령은 사용하지 않는다.
- `REDIS_URL`, Terraform resource name의 `redis`, output `redis_primary_endpoint` 같은 이름은 Redis OSS 엔진 선택이 아니라 Redis protocol/client 호환 접속 관례를 뜻한다.
- 새 문서에서 관리형 서비스 자체를 부를 때는 `ElastiCache Valkey`를 사용하고, env/URL/protocol/client 계약을 말할 때만 `Redis protocol` 또는 `REDIS_URL`을 사용한다.

5.7에서 사용자가 명시적으로 승인한 뒤에만 apply한다.

```powershell
terraform -chdir=infra/aws apply tfplan-main
terraform -chdir=infra/aws output
```

필수 output:

```powershell
terraform -chdir=infra/aws output application_url
terraform -chdir=infra/aws output ecr_repository_urls
terraform -chdir=infra/aws output runtime_secret_arns
terraform -chdir=infra/aws output rds_endpoint
terraform -chdir=infra/aws output rds_master_secret_arn
terraform -chdir=infra/aws output redis_primary_endpoint
terraform -chdir=infra/aws output ai_jobs_queue_url
terraform -chdir=infra/aws output github_deploy_role_arn
terraform -chdir=infra/aws output ops_alerts_topic_arn
terraform -chdir=infra/aws output cloudwatch_dashboard_name
terraform -chdir=infra/aws output chatbot_slack_channel_configuration_arn
```

AWS Console 확인:

- VPC: `init-main`
- ALB: `init-main-alb`
- CloudFront distribution alias: `init-jungle.cloud`
- ECR repositories: `init-main-frontend`, `init-main-api`, `init-main-worker`
- ECS cluster: `init-main`
- ECS services: `init-main-frontend`, `init-main-api`, `init-main-worker`
- RDS, Valkey, S3, SQS, Secrets Manager container가 생성됨
- SNS topic: `init-main-ops-alerts`
- Amazon Q Developer in chat applications Slack channel configuration: `init-main-ops-alerts`
- CloudWatch alarms: `init-main-*`
- CloudWatch dashboard: `init-main-overview`

중단 기준:

- plan에 RDS/Valkey 삭제 또는 교체가 포함된다.
- CloudFront ACM validation이 완료되지 않는다.
- IAM trust policy가 의도한 GitHub repository/branch보다 넓다.
- CloudWatch alarm에 `alarm_actions`/`ok_actions`가 없거나 Slack channel configuration이 SNS topic을 참조하지 않는다.
- Amazon Q Developer Slack channel configuration은 생성됐지만 Slack channel에서 알림 수신 테스트가 실패한다.

### 6. Secrets Manager 값 seed

Terraform은 secret container만 만든다. 실제 secret 값은 Terraform state에 남기지 않기 위해 Terraform 밖에서 넣는다.

원칙:

- secret 이름은 `init/main/frontend`, `init/main/api`, `init/main/worker`를 사용한다.
- secret value는 `.env` 텍스트가 아니라 JSON object여야 한다.
- 필요한 key 목록의 기준은 `infra/aws/locals.tf`의 `local.secret_keys`다.
- key 이름 관리는 `.env.example`과 함께 맞춘다.
- JSON 파일은 로컬 임시 파일로만 만들고 Git에 커밋하지 않는다.

RDS master password 확인:

```powershell
$rdsMasterSecretArn = terraform -chdir=infra/aws output -raw rds_master_secret_arn
aws secretsmanager get-secret-value `
  --secret-id $rdsMasterSecretArn `
  --query SecretString `
  --output text
```

API secret seed 예시:

```powershell
aws secretsmanager put-secret-value `
  --secret-id init/main/api `
  --secret-string file://api.main.secret.json
```

`api.main.secret.json` 예시:

```json
{
  "DATABASE_URL": "postgresql://init_admin:<password>@<rds-endpoint>:5432/init?schema=public",
  "REDIS_URL": "redis://<redis-endpoint>:6379",
  "JWT_SECRET": "<jwt-secret>",
  "JWT_ACCESS_TOKEN_TTL": "15m",
  "JWT_REFRESH_TOKEN_TTL": "14d",
  "AUTH_REFRESH_COOKIE_NAME": "refreshToken",
  "AUTH_COOKIE_SECURE": "true",
  "AUTH_COOKIE_SAME_SITE": "lax",
  "FRONTEND_ORIGIN": "https://init-jungle.cloud",
  "FRONTEND_ALLOWED_ORIGINS": "https://init-jungle.cloud",
  "APP_FRONTEND_URL": "https://init-jungle.cloud",
  "PUBLIC_APPLICATION_MAGIC_LINK_TTL_SECONDS": "900",
  "PUBLIC_APPLICATION_TOKEN_VERIFY_URL": "https://init-jungle.cloud/public/applications/verify",
  "PUBLIC_APPLICATION_TOKEN_VERIFY_SECRET": "<public-application-token-verify-secret>",
  "PUBLIC_APPLICATION_TOKEN_SECRET": "<public-application-token-secret>",
  "PUBLIC_INTERVIEW_ACCESS_TOKEN_SECRET": "<public-interview-access-token-secret>",
  "PUBLIC_INTERVIEW_ACCESS_TOKEN_TTL_SECONDS": "604800",
  "GOOGLE_CLIENT_ID": "<google-client-id>",
  "GOOGLE_CLIENT_SECRET": "<google-client-secret>",
  "GOOGLE_CALLBACK_URL": "https://init-jungle.cloud/api/v1/auth/google/callback",
  "TOSS_SECRET_KEY": "<toss-secret-key>",
  "TOSS_API_BASE_URL": "https://api.tosspayments.com",
  "PAYMENT_DEV_PASS_GRANT_ENABLED": "true",
  "AWS_REGION": "ap-northeast-2",
  "S3_BUCKET": "init-main-assets-<aws_account_id>",
  "S3_BUCKET_NAME": "init-main-assets-<aws_account_id>",
  "S3_PUBLIC_BASE_URL": "https://init-jungle.cloud",
  "AI_SQS_QUEUE_URL": "<sqs-url>",
  "SQS_QUEUE_URL": "<sqs-url>",
  "OPENAI_API_KEY": "<openai-key>",
  "AI_PROVIDER_API_KEY": "<openai-key>",
  "AI_PROVIDER_MODE": "openai",
  "OPENAI_MODEL": "<model>",
  "OPENAI_EMBEDDING_MODEL": "<embedding-model>",
  "AI_STT_PROVIDER": "openai",
  "OPENAI_STT_MODEL": "<stt-model>",
  "OPENAI_STT_LANGUAGE": "ko",
  "OPENAI_STT_TIMEOUT_MS": "120000",
  "SMTP_HOST": "<smtp-provider-host>",
  "SMTP_PORT": "587",
  "SMTP_SECURE": "false",
  "SMTP_USER": "<smtp-provider-user>",
  "SMTP_PASS": "<smtp-provider-pass>",
  "SMTP_FROM": "<authenticated-account-or-verified-sender>",
  "MAX_UPLOAD_BYTES": "10485760",
  "COMPANY_LOGO_MAX_UPLOAD_BYTES": "10485760",
  "JD_IMAGE_MAX_UPLOAD_BYTES": "10485760",
  "PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES": "20971520",
  "SIGNED_URL_TTL_SECONDS": "300"
}
```

위 JSON은 형식 예시다. 실제 `api.main.secret.json`에는 `infra/aws/locals.tf`의 `secret_keys.api`에 있는 모든 key를 포함해야 한다.

SMTP 발신자 규칙:

- 개인 Gmail/Naver SMTP를 사용하는 경우 `SMTP_FROM`은 `SMTP_USER` 계정 주소와 동일하게 둔다.
- 다른 발신 주소는 SMTP provider에서 검증한 alias 또는 발신 도메인인 경우에만 사용한다.
- Gmail/Naver의 일반 로그인 비밀번호를 저장하지 않는다. 2단계 인증 후 발급한 애플리케이션 비밀번호를 `SMTP_PASS`에 넣는다.
- 개인 계정은 저용량 MVP/시연 용도로만 사용하고, 운영 발송량이 증가하면 transactional SMTP 또는 조직용 메일 계정으로 이전한다.

저용량 검증용 설정 예시:

```json
{
  "gmail": {
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "465",
    "SMTP_SECURE": "true",
    "SMTP_USER": "init.service@gmail.com",
    "SMTP_PASS": "<google-app-password>",
    "SMTP_FROM": "init.service@gmail.com"
  },
  "naver": {
    "SMTP_HOST": "smtp.naver.com",
    "SMTP_PORT": "465",
    "SMTP_SECURE": "true",
    "SMTP_USER": "<naver-smtp-id>",
    "SMTP_PASS": "<naver-app-password>",
    "SMTP_FROM": "init-service@naver.com"
  }
}
```

`SMTP_SMOKE_TO`는 API runtime secret이 아니라 GitHub Environment `init-main`의 secret으로 관리한다. 매 API 배포마다 이 주소로 smoke 메일 1통이 발송되므로 실제로 확인 가능한 팀 전용 수신함을 사용한다. 가능하면 Gmail 발신에는 Naver 수신함처럼 발신 계정과 다른 provider를 사용한다.

배포 workflow의 성공은 SMTP server가 메일을 접수했다는 의미다. 최초 provider 전환과 credential 변경 시에는 `SMTP_SMOKE_TO` 수신함에서 실제 도착, 스팸 분류 여부, 발신 주소를 사람이 확인해야 한다.

일반 SMTP의 세 발송 흐름과 운영 관찰이 끝난 뒤에는 SES를 롤백 경로로 사용하지 않는다. Terraform에서 SES identity, DKIM, custom MAIL FROM과 관련 Route53 record를 제거하고 API ECS task role의 `ses:SendEmail`, `ses:SendRawEmail` 권한도 제거한다. 이 변경은 애플리케이션 배포 변경과 분리한 Terraform 전용 PR에서 수행한다.

기존 main state에서 SES를 제거하는 plan은 SES 및 SES 전용 Route53 resource 10개 삭제와 API task inline policy의 in-place 갱신만 포함해야 한다. Route53 hosted zone, ACM validation record, CloudFront, ALB, ECS, RDS, Valkey, S3, SQS의 삭제 또는 replacement가 포함되면 apply하지 않는다. 검토한 saved plan에 사용자 승인을 받은 뒤에만 `terraform apply`를 실행하고, 적용 후 외부 SMTP smoke와 세 발송 흐름을 다시 확인한다.

GitHub Actions가 service별 최신 ECS task definition revision을 직접 등록하므로 일반 full plan에는 Terraform의 단일 `image_tag`와 다른 live image revision을 `bootstrap`으로 되돌리는 task definition replacement가 나타날 수 있다. SES 제거 apply에는 이 drift를 섞지 않는다. 아래처럼 제거 대상 state 주소와 API IAM policy만 target으로 지정해 saved plan을 만들고, plan JSON에서 `0 add, 1 update, 10 delete, 0 replace`인지 확인한다.

```powershell
Set-Location infra\aws
terraform plan '-var-file=env/main.tfvars' '-out=tfplan-ses-cleanup' '-input=false' `
  '-target=aws_iam_role_policy.api_task' `
  '-target=aws_route53_record.ses_dkim' `
  '-target=aws_route53_record.ses_domain_verification' `
  '-target=aws_route53_record.ses_mail_from_mx' `
  '-target=aws_route53_record.ses_mail_from_spf' `
  '-target=aws_ses_domain_dkim.mail' `
  '-target=aws_ses_domain_identity.mail' `
  '-target=aws_ses_domain_identity_verification.mail' `
  '-target=aws_ses_domain_mail_from.mail'
terraform show -no-color tfplan-ses-cleanup
```

resource targeting은 일반 배포 방법이 아니라 외부 배포 workflow가 만든 ECS revision drift와 이번 SES decommission을 분리하기 위한 1회성 예외다. saved plan apply 후에는 target 없이 다시 full plan을 실행해 SES 관련 변경이 사라졌는지 확인하고, 남은 ECS task definition drift는 별도 소유권 정렬 작업으로 다룬다.

Provider 설정 근거:

- Gmail SMTP/STARTTLS: <https://support.google.com/mail/answer/7104828>
- Google 애플리케이션 비밀번호: <https://support.google.com/accounts/answer/185833>
- Naver SMTP server/SSL: <https://help.naver.com/service/30029/contents/21341?lang=ko&osType=PC>
- Naver 2단계 인증/애플리케이션 비밀번호: <https://help.naver.com/service/30029/contents/24347?lang=ko>

frontend와 worker도 같은 방식으로 넣는다.

`frontend.main.secret.json` example:

```json
{
  "NEXT_PUBLIC_API_BASE_URL": "https://init-jungle.cloud"
}
```

`worker.main.secret.json` example:

```json
{
  "DATABASE_URL": "postgresql://init_admin:<password>@<rds-endpoint>:5432/init?schema=public",
  "AWS_REGION": "ap-northeast-2",
  "S3_BUCKET": "init-main-assets-<aws_account_id>",
  "S3_BUCKET_NAME": "init-main-assets-<aws_account_id>",
  "AI_SQS_QUEUE_URL": "<sqs-url>",
  "SQS_QUEUE_URL": "<sqs-url>",
  "OPENAI_API_KEY": "<openai-key>",
  "AI_PROVIDER_API_KEY": "<openai-key>",
  "AI_PROVIDER_MODE": "openai",
  "OPENAI_MODEL": "<model>",
  "OPENAI_EMBEDDING_MODEL": "<embedding-model>",
  "AI_STT_PROVIDER": "openai",
  "OPENAI_STT_MODEL": "<stt-model>",
  "OPENAI_STT_LANGUAGE": "ko",
  "OPENAI_STT_TIMEOUT_MS": "120000",
  "WORKER_CONCURRENCY": "1",
  "WORKER_BATCH_SIZE": "1",
  "WORKER_MAX_RETRYABLE_RECEIVES": "3",
  "WORKER_POLL_INTERVAL_MS": "1000"
}
```

```powershell
aws secretsmanager put-secret-value `
  --secret-id init/main/frontend `
  --secret-string file://frontend.main.secret.json

aws secretsmanager put-secret-value `
  --secret-id init/main/worker `
  --secret-string file://worker.main.secret.json
```

확인:

```powershell
aws secretsmanager describe-secret --secret-id init/main/frontend
aws secretsmanager describe-secret --secret-id init/main/api
aws secretsmanager describe-secret --secret-id init/main/worker
```

중단 기준:

- `DATABASE_URL`, `REDIS_URL`, `AI_SQS_QUEUE_URL`, `S3_BUCKET`, `OPENAI_API_KEY` 등 runtime 필수값이 비어 있다.
- secret JSON key가 `local.secret_keys`와 맞지 않는다.
- 실제 secret 값을 문서, PR, commit에 남기려고 한다.

### 7. 초기 Docker image build/push

Terraform task definition은 기본적으로 `image_tag = "bootstrap"`을 참조한다. 최초 기동 전에는 ECR에 `bootstrap` tag image가 있어야 한다. 재실행 중 ECR immutable tag 충돌이 나면 `bootstrap`을 다시 덮어쓰지 말고 `git rev-parse HEAD` 같은 새 tag를 사용하고 Terraform plan에 `-var "image_tag=<tag>"`를 함께 넘긴다.

실행:

```powershell
$region = "ap-northeast-2"
$accountId = aws sts get-caller-identity --query Account --output text
$registry = "$accountId.dkr.ecr.$region.amazonaws.com"
$tag = "bootstrap"

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registry

$ecr = terraform -chdir=infra/aws output -json ecr_repository_urls | ConvertFrom-Json

docker build `
  -f infra/docker/frontend.Dockerfile `
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://init-jungle.cloud `
  --build-arg NEXT_PUBLIC_TOSS_CLIENT_KEY="<toss-client-key>" `
  -t "$($ecr.frontend):$tag" .
docker build -f infra/docker/api.Dockerfile -t "$($ecr.api):$tag" .
docker build -f infra/docker/worker.Dockerfile -t "$($ecr.worker):$tag" .

docker push "$($ecr.frontend):$tag"
docker push "$($ecr.api):$tag"
docker push "$($ecr.worker):$tag"
```

확인:

```powershell
aws ecr describe-images --repository-name init-main-frontend --image-ids imageTag=$tag
aws ecr describe-images --repository-name init-main-api --image-ids imageTag=$tag
aws ecr describe-images --repository-name init-main-worker --image-ids imageTag=$tag
```

`bootstrap`이 아닌 tag를 사용했다면 migration 전에 ECS task definition도 같은 image tag를 보도록 다시 적용한다. 이때 `desired_counts`가 아직 `0`이면 service traffic은 열리지 않는다.

```powershell
terraform -chdir=infra/aws plan -var-file=env/main.tfvars -var "image_tag=$tag" -out=tfplan-main
terraform -chdir=infra/aws apply tfplan-main
```

중단 기준:

- Docker build가 실패한다.
- API image에서 Prisma Client 또는 `@init/common` 관련 build 오류가 난다.
- ECR push 권한이 없다.

### 8. ECS one-off migration task

DB migration은 API container startup에서 실행하지 않는다. ECS service update 전에 API image를 재사용한 one-off task로 `npx prisma migrate deploy`를 1회 실행한다.

`migration-overrides.json` 파일을 로컬에 만든다. 이 파일은 Git에 커밋하지 않는다.

```json
{
  "containerOverrides": [
    {
      "name": "api",
      "command": ["npx", "prisma", "migrate", "deploy"]
    }
  ]
}
```

실행:

```powershell
$cluster = "init-main"
$vpcId = aws ec2 describe-vpcs `
  --filters "Name=tag:Name,Values=init-main" `
  --query "Vpcs[0].VpcId" `
  --output text

$subnetIds = aws ec2 describe-subnets `
  --filters "Name=vpc-id,Values=$vpcId" "Name=tag:Tier,Values=private-app" `
  --query "Subnets[].SubnetId" `
  --output text

$apiSecurityGroupId = aws ec2 describe-security-groups `
  --filters "Name=vpc-id,Values=$vpcId" "Name=group-name,Values=init-main-ecs-api" `
  --query "SecurityGroups[0].GroupId" `
  --output text

$subnetList = ($subnetIds -split "\s+") -join ","
$networkConfig = "awsvpcConfiguration={subnets=[$subnetList],securityGroups=[$apiSecurityGroupId],assignPublicIp=DISABLED}"

$runTask = aws ecs run-task `
  --cluster $cluster `
  --launch-type FARGATE `
  --task-definition init-main-api `
  --network-configuration $networkConfig `
  --overrides file://migration-overrides.json | ConvertFrom-Json

$taskArn = $runTask.tasks[0].taskArn
aws ecs wait tasks-stopped --cluster $cluster --tasks $taskArn
aws ecs describe-tasks --cluster $cluster --tasks $taskArn `
  --query "tasks[0].containers[?name=='api'].{exitCode:exitCode,reason:reason}"
```

확인:

- `exitCode`가 `0`이어야 한다.
- CloudWatch Logs의 API log group에서 migration 실패 stack trace가 없어야 한다.

중단 기준:

- migration task가 실패한다.
- 일부 DDL이 적용된 뒤 실패했다. 이 경우 service update를 멈추고 보정 migration을 작성한다.
- RDS 연결, secret, private subnet network 오류가 발생한다.
- real AI provider traffic을 받을 예정인데 worker에 SQS visibility heartbeat와 `processLogId` 멱등성 보강이 없다.

### 9. ECS service activation

image, secret, migration이 모두 준비된 뒤 ECS desired count를 올린다.

`infra/aws/env/main.tfvars`:

```hcl
desired_counts = {
  frontend = 1
  api      = 1
  worker   = 1
}
```

실행:

```powershell
$tag = "bootstrap"
terraform -chdir=infra/aws plan -var-file=env/main.tfvars -var "image_tag=$tag" -out=tfplan-main
terraform -chdir=infra/aws apply tfplan-main

aws ecs wait services-stable `
  --cluster init-main `
  --services init-main-frontend init-main-api init-main-worker
```

ALB target group 확인:

```powershell
$frontendTgArn = aws elbv2 describe-target-groups `
  --names init-main-frontend `
  --query "TargetGroups[0].TargetGroupArn" `
  --output text

$apiTgArn = aws elbv2 describe-target-groups `
  --names init-main-api `
  --query "TargetGroups[0].TargetGroupArn" `
  --output text

aws elbv2 describe-target-health --target-group-arn $frontendTgArn
aws elbv2 describe-target-health --target-group-arn $apiTgArn
```

중단 기준:

- ECS service가 stable 상태가 되지 않는다.
- ALB target health가 `healthy`가 아니다.
- API task가 secret, DB, Valkey 연결 오류로 반복 재시작한다.
- worker가 real AI provider traffic을 받을 예정인데 `ChangeMessageVisibility` heartbeat와 duplicate `processLogId` skip/claim 테스트가 없다.

### 10. Domain smoke test

단일 도메인에서 frontend와 API가 모두 응답하는지 확인한다.

실행:

```powershell
curl.exe -I https://init-jungle.cloud
curl.exe https://init-jungle.cloud/api/v1/health
```

CloudFront cache 때문에 배포 확인이 지연되면 invalidation을 실행한다.

```powershell
$distributionId = aws cloudfront list-distributions `
  --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, 'init-jungle.cloud')].Id | [0]" `
  --output text

aws cloudfront create-invalidation `
  --distribution-id $distributionId `
  --paths "/*"
```

확인:

- `https://init-jungle.cloud`가 frontend SSR 응답을 반환한다.
- `https://init-jungle.cloud/api/v1/health`가 API health 응답을 반환한다.
- CloudFront, ALB, ECS log에 5xx가 반복되지 않는다.

중단 기준:

- CloudFront 403/502/504가 발생한다.
- `/api/*`가 frontend로 라우팅된다.
- API health check는 성공하지만 주요 로그인/업로드 경로가 secret 누락으로 실패한다.

### 11. GitHub Actions deploy workflow 구현

수동 구축이 한 번 성공한 뒤 자동 배포 workflow를 만든다. 목표는 `dev`, `main` branch에 PR merge가 완료됐을 때 같은 `init-main-*` 리소스를 갱신하는 것이다. CD 안정성 확인용 임시 branch였던 `infra/test`는 검증 완료 후 workflow trigger에서 제거했다.

GitHub Actions만 사용하되, 배포 권한 경계는 GitHub Environment `init-main`으로 둔다. AWS IAM OIDC trust는 branch ref가 아니라 `repo:seok3m4/init:environment:init-main` subject를 허용한다. 따라서 GitHub Environment의 deployment branch rule은 운영 branch인 `dev`, `main`만 허용해야 한다.

배포 workflow의 GitHub trigger는 `pull_request.closed`가 아니라 `push` on `dev`, `main`이다. PR merge가 완료되면 GitHub가 base branch에 push 이벤트를 만들고, 이때 Environment protection rule은 `refs/heads/dev` 같은 실제 branch ref를 평가한다. `pull_request.closed`를 쓰면 Environment가 `refs/pull/<number>/merge`를 평가해 branch rule에 막힐 수 있다. workflow 내부에서는 push commit이 merged PR과 연결되어 있는지 다시 확인해 direct push 배포를 차단한다.

사용자 사전 작업:

1. GitHub repository `Settings > Environments`에서 `init-main` environment를 만든다.
2. `init-main` environment의 deployment branch rule을 `Selected branches and tags`로 설정하고 `dev`, `main`만 허용한다.
3. merge 즉시 자동 배포가 목표라면 required reviewer는 설정하지 않는다.
4. `Settings > Branches` 또는 `Rulesets`에서 `dev`, `main`에 branch protection을 설정한다.
   - PR merge 필수
   - CI required checks 통과 필수
   - direct push 제한
   - 가능하면 admin bypass 제한
5. `init-main` environment에 아래 값들을 등록한다.

필수 workflow 계약:

| 항목 | 기준 |
| --- | --- |
| trigger | `push` on protected branch `dev`, `main`; workflow 내부에서 associated merged PR 확인 |
| AWS 인증 | GitHub Environment `init-main` subject로 `github_deploy_role_arn` assume |
| concurrency | `aws-main-deploy` 단일 group |
| image tag | push 후 target branch head SHA인 `github.sha` |
| ECR | `init-main-frontend`, `init-main-api`, `init-main-worker` |
| 변경 감지 | frontend/API/worker/common/prisma/Dockerfile 변경 경로 기준 |
| migration | API 또는 Prisma 변경 시 ECS one-off `npx prisma migrate deploy` |
| service update | migration 성공 후 ECS task definition revision 등록 및 service update |
| task definition tag | 기존 task definition tags를 새 revision에 보존. GitHub deploy role은 `init-main-*` task definition revision에 `ecs:TagResource` 허용 |
| smoke | `https://init-jungle.cloud`, `/api/v1/health` |
| cache | 기본/API cache는 disabled이므로 자동 invalidation은 하지 않음. stale 확인 시 수동 invalidation |

Terraform 변경과 application 변경이 같은 PR에 섞이면 workflow는 배포를 중단한다. Terraform 변경은 별도 PR에서 plan/apply를 먼저 검토하고, 앱 배포는 다음 merge에서 수행한다.

GitHub Actions는 ECS task definition revision을 직접 등록하고 service를 갱신한다. Terraform은 service의 `task_definition` drift를 무시해 이후 infra apply가 앱 image tag를 `bootstrap`으로 되돌리지 않게 한다. ECS task definition의 CPU/memory/env/secret 구조를 바꾼 Terraform 변경은 다음 앱 배포 때 새 live revision의 기준으로 사용된다.

GitHub repository에 필요한 값:

| 이름 | 위치 | 값 |
| --- | --- | --- |
| `AWS_REGION` | GitHub Environment `init-main` variable | `ap-northeast-2` |
| `AWS_DEPLOY_ROLE_ARN` | GitHub Environment `init-main` variable | `terraform output github_deploy_role_arn` |
| `APP_BASE_URL` | GitHub Environment `init-main` variable | `https://init-jungle.cloud` |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | GitHub Environment `init-main` secret | Toss public client key |

중단 기준:

- GitHub Environment `init-main`이 없거나 deployment branch rule이 `dev`, `main` 외 branch를 허용한다.
- `dev`, `main`에서 direct push가 가능해 PR merge 기준이 깨진다.
- OIDC assume role이 실패한다.
- GitHub Environment variable/secret이 누락됐다.
- Terraform 변경과 application 배포 변경이 같은 PR에 섞여 있다.
- secret key validation이 실패한다.
- `RegisterTaskDefinition` 중 `ecs:TagResource` 권한 오류가 발생한다.
- migration task가 실패한다.
- smoke test가 실패한다.

### 12. dev/main branch 자동 배포 검증

자동화가 들어간 뒤에는 `dev`와 `main`이 서로 다른 서버가 아니라 같은 main 실배포 환경을 갱신한다는 점을 검증한다.

정식 `dev`, `main` 검증 전에 CD 안정성을 확인하기 위해 임시 branch `infra/test`를 사용했다. 이 검증은 모의 실행이 아니라 실제 `init-main-*` ECS/ECR과 `https://init-jungle.cloud`를 갱신했다.

완료된 임시 검증 흐름:

```text
feature/* -> infra/test PR merge
-> deploy workflow 실행
-> init-main-* ECR image push
-> init-main-* ECS service update
-> https://init-jungle.cloud smoke 통과
```

임시 검증 결과:

- GitHub Actions run `28840157083`을 `Re-run all jobs`로 재실행한 결과 `Success`로 완료됐다.
- run summary 기준 workflow는 `Deploy AWS Main`, event는 `on: push`, branch는 `infra/test`, commit은 `4c8ba7b`, total duration은 `3m 13s`다.
- `Detect Deploy Scope`와 `Deploy to init-main` job이 모두 성공했다.
- AWS 확인 기준 ECR `init-main-frontend`에 image tag `4c8ba7b1f4bfedca05cb274cf9613beb0878cbd5`가 push됐고, ECS `init-main-frontend` service는 task definition `init-main-frontend:2`로 desired/running/pending `1/1/0` 상태다.
- `https://init-jungle.cloud/api/v1/health`는 200 응답이며, CloudWatch alarm `init-main-*` 7개는 모두 `OK` 상태다.
- GitHub Actions annotations에는 Node.js 20 deprecation warning이 남아 있다. 배포 성공 blocker는 아니지만 `actions/github-script`, `actions/checkout`, `aws-actions/configure-aws-credentials` 업그레이드 후보로 관리한다.

임시 검증 후 정리 상태:

1. `.github/workflows/deploy.yml` trigger에서 `infra/test`를 제거했다.
2. `.github/workflows/ci.yml` trigger에서 `infra/test`를 제거했다.
3. 원격 branch는 `git push origin --delete infra/test`로 삭제했다.
4. 로컬 branch는 다른 branch로 이동한 뒤 `git branch -D infra/test`로 삭제했다.
5. GitHub Environment `init-main` deployment branch rule과 branch protection/ruleset에 `infra/test` 임시 rule이 남아 있으면 제거한다.

검증 흐름:

```text
feature/* -> dev PR merge
-> deploy workflow 실행
-> init-main-* ECR image push
-> init-main-* ECS service update
-> https://init-jungle.cloud smoke 통과

dev -> main PR merge
-> 같은 workflow 실행
-> 같은 init-main-* 리소스 갱신
-> https://init-jungle.cloud smoke 통과
```

완료 기준:

- GitHub Actions deploy workflow log에서 `dev`, `main` 모두 성공한다.
- ECS service task definition revision이 최신 target branch head SHA image tag를 참조한다.
- `https://init-jungle.cloud`가 최신 PR merge commit 기준으로 갱신된다.

## AWS 변경 유지보수 원칙

AWS Console에서 직접 수정하지 않는 것을 원칙으로 한다. 리소스 변경은 Terraform 파일을 수정하고 PR에서 `terraform plan` 결과를 리뷰한다.

예외적으로 장애 대응 때문에 Console에서 긴급 수정했다면, 이후 반드시 Terraform 코드에 반영하거나 `terraform import`/state 정리를 수행한다. 그렇지 않으면 다음 apply에서 변경이 되돌아가거나 plan drift가 발생한다.

## 변경 유형별 유지보수 방법

| 변경 유형 | 수정 위치 | 확인할 것 |
| --- | --- | --- |
| VPC/subnet/NAT 변경 | `network.tf`, `env/*.tfvars` | CIDR 충돌, route table, NAT 비용 |
| Security group 변경 | `security-groups.tf` | public ingress 확장 여부, ECS/RDS/Valkey 접근 경계 |
| CloudFront/ALB path 변경 | `alb-cloudfront.tf` | `/api/*`, `/_next/static/*`, S3 asset prefix가 frontend route를 가리지 않는지 |
| Route53/ACM/domain 변경 | `route53-acm.tf`, `providers.tf`, `env/main.tfvars` | 가비아 NS 위임, us-east-1 ACM, A/AAAA alias, DNS validation 완료 여부 |
| ECS CPU/memory/port 변경 | `locals.tf`, `ecs.tf` | Dockerfile exposed port, ALB target group, Fargate 지원 조합 |
| ECS desired count 변경 | `env/main.tfvars` | image와 secret 값이 먼저 준비됐는지 |
| ECR repository 정책 변경 | `ecr.tf` | immutable tag 정책과 deploy workflow tag 전략 |
| RDS class/storage/backup 변경 | `rds.tf`, `env/*.tfvars` | downtime, backup retention, deletion protection |
| Redis protocol cache TLS/auth 변경 | `redis.tf` | 앱 `REDIS_URL`을 `rediss://`로 바꾸는 코드/secret 변경 필요 |
| S3 공개 asset prefix 변경 | `alb-cloudfront.tf`, `s3-sqs.tf` | private bucket 유지, OAC policy 범위 |
| SQS visibility timeout 변경 | `s3-sqs.tf` | worker 처리 시간, DLQ redrive 기준 |
| Secret key 추가/삭제 | `.env.example`, `locals.tf`, Secrets Manager JSON | task definition secret mapping과 실제 secret JSON 일치 |
| GitHub Actions deploy 권한 변경 | `iam.tf` | OIDC trust, GitHub Environment 제한, `iam:PassRole` 범위 |
| Slack 운영 알림 변경 | `cloudwatch.tf`, `iam.tf`, `providers.tf`, `env/main.tfvars` | SNS topic, Q Developer Slack channel configuration, guardrail policy, `alarm_actions`/`ok_actions`, Slack workspace/channel ID |
| VPC endpoint 추가 | `variables.tf`, `network.tf`, `env/*.tfvars` | hourly cost와 NAT 비용 절감 효과 |

## 변경 작업 표준 절차

1. 변경 목적을 정한다.
2. Terraform 파일 또는 `env/main.tfvars`를 수정한다.
3. 포맷과 validate를 실행한다.

```powershell
terraform -chdir=infra/aws fmt -recursive
terraform -chdir=infra/aws validate
```

4. main backend로 초기화한다.

```powershell
terraform -chdir=infra/aws init -backend-config=backend-main.hcl -reconfigure
```

5. plan 파일을 만든다.

```powershell
terraform -chdir=infra/aws plan -var-file=env/main.tfvars -out=tfplan-main
```

6. plan에서 생성/수정/삭제 리소스를 확인한다.
7. PR에 plan 요약을 남긴다.
8. 승인 후 apply한다.

```powershell
terraform -chdir=infra/aws apply tfplan-main
```

9. output과 AWS Console에서 생성 결과를 확인한다.
10. CloudFront/ALB/ECS/RDS/SQS 등 변경된 경로의 smoke test를 수행한다.

## plan 리뷰 체크리스트

아래 항목이 보이면 apply 전에 한 번 더 확인한다.

- RDS replacement 또는 deletion
- Valkey replacement
- VPC/subnet replacement
- ALB/CloudFront distribution replacement
- IAM trust policy 확장
- Security group `0.0.0.0/0` ingress 추가
- S3 public access block 비활성화
- ECS task desired count 증가
- Secrets Manager secret 삭제
- SQS queue replacement
- CloudWatch alarm action 제거 또는 SNS topic 미연결
- Q Developer/Chatbot IAM role 권한 확장

## rollback 기준

Terraform은 application rollback과 다르다. 인프라 변경 rollback은 이전 commit의 Terraform 코드로 되돌린 뒤 다시 `plan/apply`하는 방식이다.

단, 아래 리소스는 rollback 전에 별도 판단이 필요하다.

- RDS: data loss 가능성이 있으므로 삭제/교체 rollback 금지
- Valkey: cache 유실 가능성 확인
- S3: object 삭제 policy 변경 주의
- IAM: 권한 축소 시 deploy workflow가 막힐 수 있음
- CloudFront: propagation 시간이 걸려 즉시 반영되지 않을 수 있음

## 검증 명령

AWS credential 없이 가능한 검증:

```powershell
terraform -chdir=infra/aws fmt -check -recursive
terraform -chdir=infra/aws init -backend=false
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws/bootstrap init -backend=false
terraform -chdir=infra/aws/bootstrap validate
```

AWS credential이 필요한 검증:

```powershell
terraform -chdir=infra/aws plan -var-file=env/main.tfvars
```

프로젝트 하네스:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A
```

현재 작업트리에 role ownership 밖의 미추적 파일이 있으면 위 명령이 ownership 단계에서 실패할 수 있다. 그 경우 원인을 분리하기 위해 아래 명령으로 구현 영향만 확인한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A -SkipOwnership
```

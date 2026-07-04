# AWS Terraform Runbook

이 디렉터리는 `init` 프로젝트의 AWS 인프라 기준선을 Terraform으로 정의한다.

여기서 관리하는 것은 AWS resource다. 애플리케이션 image build/push, ECS service deploy, Secrets Manager 실제 값 seed, Prisma migration 실행은 별도 CI/CD workflow 또는 수동 운영 절차에서 수행한다.

## 구성 원칙

AWS environment는 `main` 단일 실배포 환경만 둔다. `dev`와 `main` Git branch는 모두 같은 VPC, CloudFront distribution, ALB, ECS service, RDS, Redis, S3 bucket, SQS queue, Secrets Manager path를 갱신한다.

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
| `versions.tf`, `providers.tf` | Terraform/AWS provider 버전과 region 설정 |
| `variables.tf`, `locals.tf` | main 실배포 입력값, naming, service/env/secret key 계약 |
| `network.tf` | VPC, subnet, route table, NAT Gateway, VPC endpoint |
| `security-groups.tf` | ALB, ECS, RDS, Redis, VPC endpoint security group |
| `alb-cloudfront.tf` | ALB listener/target group, CloudFront behavior, S3 OAC |
| `route53-acm.tf` | Route53 app record, CloudFront용 us-east-1 ACM 인증서, DNS validation record |
| `ecs.tf` | ECS cluster, task definition, service |
| `ecr.tf` | main 실배포 ECR repository와 lifecycle policy |
| `rds.tf`, `redis.tf` | PostgreSQL RDS, ElastiCache Redis |
| `s3-sqs-ses.tf` | asset bucket, SQS/DLQ, optional SES domain identity |
| `secrets.tf` | service별 Secrets Manager container |
| `iam.tf` | ECS execution/task role, GitHub deploy role |
| `cloudwatch.tf` | log group과 기본 alarm |
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

## 최초 bootstrap

bootstrap은 main 실배포 stack보다 먼저 1회만 실행한다. remote state bucket, Route53 hosted zone, GitHub OIDC provider는 AWS 계정 단위로 공유되는 기반 리소스이기 때문이다.

1. AWS account ID를 확인한다.

```powershell
aws sts get-caller-identity --query Account --output text
```

2. remote state bucket, Route53 hosted zone, GitHub OIDC provider를 생성한다.

```powershell
terraform -chdir=infra/aws/bootstrap init
terraform -chdir=infra/aws/bootstrap plan -var "state_bucket_name=init-tfstate-<aws_account_id>-ap-northeast-2"
terraform -chdir=infra/aws/bootstrap apply -var "state_bucket_name=init-tfstate-<aws_account_id>-ap-northeast-2"
```

3. Route53 NS record를 확인하고 가비아 네임서버에 등록한다.

```powershell
terraform -chdir=infra/aws/bootstrap output route53_name_servers
```

가비아 관리 화면에서 `init-jungle.cloud`의 네임서버를 위 출력값으로 교체한다. 이 위임이 완료되어야 main stack의 ACM DNS validation이 정상 완료된다.

4. GitHub OIDC provider가 이미 있는 계정이면 중복 생성하지 않는다. 이미 존재한다면 bootstrap state로 import한다.

```powershell
terraform -chdir=infra/aws/bootstrap import aws_iam_openid_connect_provider.github arn:aws:iam::<aws_account_id>:oidc-provider/token.actions.githubusercontent.com
```

5. bootstrap 출력값을 확인한다.

```powershell
terraform -chdir=infra/aws/bootstrap output
```

## backend config 준비

`backend-*.hcl` 파일은 실제 account ID가 들어가므로 Git에 커밋하지 않는다. `.gitignore`에서 `infra/aws/backend-*.hcl`을 제외하고 있다.

```powershell
Copy-Item infra\aws\backend-main.hcl.example infra\aws\backend-main.hcl
```

복사 후 `<aws_account_id>`를 실제 계정 ID로 바꾼다.

```hcl
bucket       = "init-tfstate-123456789012-ap-northeast-2"
key          = "init/main/terraform.tfstate"
region       = "ap-northeast-2"
encrypt      = true
use_lockfile = true
```

## main 실배포 적용 절차

`main`은 유일한 실배포 환경이다. `dev`와 `main` branch deploy workflow는 모두 이 환경의 ECR/ECS/Secrets/CloudFront를 대상으로 한다.

```powershell
terraform -chdir=infra/aws init -backend-config=backend-main.hcl -reconfigure
terraform -chdir=infra/aws fmt -check -recursive
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws plan -var-file=env/main.tfvars -out=tfplan-main
terraform -chdir=infra/aws apply tfplan-main
```

적용 후 output을 확인한다.

```powershell
terraform -chdir=infra/aws output
terraform -chdir=infra/aws output cloudfront_domain_name
terraform -chdir=infra/aws output application_url
terraform -chdir=infra/aws output ecr_repository_urls
terraform -chdir=infra/aws output runtime_secret_arns
```

인프라 변경은 PR 리뷰 후 적용한다. 특히 RDS, Redis, CloudFront, IAM 변경은 비용/보안/장애 영향을 같이 확인한다.

## Secrets Manager 값 seed

Terraform은 secret container만 만든다. 실제 값은 Terraform state에 남기지 않기 위해 Terraform 밖에서 넣는다.

ECS task definition은 `secretArn:KEY::` 형식으로 JSON key를 참조한다. 따라서 secret value는 `.env` 텍스트가 아니라 JSON object여야 한다.

예시:

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
  "JWT_SECRET": "change-me",
  "JWT_ACCESS_TOKEN_TTL": "15m",
  "JWT_REFRESH_TOKEN_TTL": "14d",
  "AUTH_REFRESH_COOKIE_NAME": "refreshToken",
  "AUTH_COOKIE_SECURE": "true",
  "AUTH_COOKIE_SAME_SITE": "lax",
  "FRONTEND_ORIGIN": "https://init-jungle.cloud",
  "AWS_REGION": "ap-northeast-2",
  "S3_BUCKET": "init-main-assets-<aws_account_id>",
  "S3_BUCKET_NAME": "init-main-assets-<aws_account_id>",
  "S3_PUBLIC_BASE_URL": "https://init-jungle.cloud",
  "AI_SQS_QUEUE_URL": "<sqs-url>",
  "SQS_QUEUE_URL": "<sqs-url>",
  "OPENAI_API_KEY": "<openai-key>",
  "SMTP_HOST": "<ses-smtp-host>",
  "SMTP_PORT": "587",
  "SMTP_SECURE": "false",
  "SMTP_USER": "<ses-smtp-user>",
  "SMTP_PASS": "<ses-smtp-pass>",
  "SMTP_FROM": "no-reply@example.com"
}
```

RDS master password는 AWS가 생성한다. ARN은 output으로 확인한다.

```powershell
terraform -chdir=infra/aws output rds_master_secret_arn
```

그 secret에서 password를 확인한 뒤 `DATABASE_URL`을 구성한다.

## 애플리케이션 기동 전 준비

Terraform apply만으로 앱이 뜨지 않는다. 현재 `env/*.tfvars`의 ECS desired count는 `0`이다.

앱을 실제로 기동하려면 아래 순서가 필요하다.

1. ECR repository에 image push
   - `init-main-frontend`
   - `init-main-api`
   - `init-main-worker`
2. Secrets Manager JSON 값 seed
3. API image 기반 Prisma migration task 실행
4. `env/main.tfvars`의 `desired_counts`를 `1`로 변경
5. Terraform plan/apply
6. ALB target group health와 CloudFront URL smoke test

예시:

```hcl
desired_counts = {
  frontend = 1
  api      = 1
  worker   = 1
}
```

## AWS 변경 유지보수 원칙

AWS Console에서 직접 수정하지 않는 것을 원칙으로 한다. 리소스 변경은 Terraform 파일을 수정하고 PR에서 `terraform plan` 결과를 리뷰한다.

예외적으로 장애 대응 때문에 Console에서 긴급 수정했다면, 이후 반드시 Terraform 코드에 반영하거나 `terraform import`/state 정리를 수행한다. 그렇지 않으면 다음 apply에서 변경이 되돌아가거나 plan drift가 발생한다.

## 변경 유형별 유지보수 방법

| 변경 유형 | 수정 위치 | 확인할 것 |
| --- | --- | --- |
| VPC/subnet/NAT 변경 | `network.tf`, `env/*.tfvars` | CIDR 충돌, route table, NAT 비용 |
| Security group 변경 | `security-groups.tf` | public ingress 확장 여부, ECS/RDS/Redis 접근 경계 |
| CloudFront/ALB path 변경 | `alb-cloudfront.tf` | `/api/*`, `/_next/static/*`, S3 asset prefix가 frontend route를 가리지 않는지 |
| Route53/ACM/domain 변경 | `route53-acm.tf`, `providers.tf`, `env/main.tfvars` | 가비아 NS 위임, us-east-1 ACM, A/AAAA alias, DNS validation 완료 여부 |
| ECS CPU/memory/port 변경 | `locals.tf`, `ecs.tf` | Dockerfile exposed port, ALB target group, Fargate 지원 조합 |
| ECS desired count 변경 | `env/main.tfvars` | image와 secret 값이 먼저 준비됐는지 |
| ECR repository 정책 변경 | `ecr.tf` | immutable tag 정책과 deploy workflow tag 전략 |
| RDS class/storage/backup 변경 | `rds.tf`, `env/*.tfvars` | downtime, backup retention, deletion protection |
| Redis TLS/auth 변경 | `redis.tf` | 앱 `REDIS_URL`을 `rediss://`로 바꾸는 코드/secret 변경 필요 |
| S3 공개 asset prefix 변경 | `alb-cloudfront.tf`, `s3-sqs-ses.tf` | private bucket 유지, OAC policy 범위 |
| SQS visibility timeout 변경 | `s3-sqs-ses.tf` | worker 처리 시간, DLQ redrive 기준 |
| Secret key 추가/삭제 | `.env.example`, `locals.tf`, Secrets Manager JSON | task definition secret mapping과 실제 secret JSON 일치 |
| GitHub Actions deploy 권한 변경 | `iam.tf` | OIDC trust, branch 제한, `iam:PassRole` 범위 |
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
- Redis replacement
- VPC/subnet replacement
- ALB/CloudFront distribution replacement
- IAM trust policy 확장
- Security group `0.0.0.0/0` ingress 추가
- S3 public access block 비활성화
- ECS task desired count 증가
- Secrets Manager secret 삭제
- SQS queue replacement

## rollback 기준

Terraform은 application rollback과 다르다. 인프라 변경 rollback은 이전 commit의 Terraform 코드로 되돌린 뒤 다시 `plan/apply`하는 방식이다.

단, 아래 리소스는 rollback 전에 별도 판단이 필요하다.

- RDS: data loss 가능성이 있으므로 삭제/교체 rollback 금지
- Redis: cache 유실 가능성 확인
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

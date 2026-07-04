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
| `s3-sqs-ses.tf` | asset bucket, SQS/DLQ, optional SES domain identity, DKIM, custom MAIL FROM DNS |
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
| 5.4 Plan 리뷰 | 위험 변경 확인 | 생성/수정/삭제, replacement, IAM trust, SES DNS, ECS desired count 확인 | RDS/Redis/VPC/CloudFront 삭제 또는 교체, IAM trust 확장, ECS desired count 증가 |
| 5.5 사용자 apply 승인 | 비용 발생 전 명시 승인 확보 | 사용자가 plan 요약 확인 후 승인 | 승인 문구 없음 |
| 5.6 Main apply 실행 | main AWS 리소스 생성 | `terraform apply tfplan-main` | apply 실패 또는 예상 밖 destroy/replacement |
| 5.7 Output/Console 확인 | 다음 단계 입력값 확보 | Terraform output, AWS Console 상태 확인 | 필수 output 누락 또는 ACM/SES validation 실패 |
| 5.8 세션 기록 | 이어받기 가능한 상태 기록 | `infra/APPLY_SESSION.md` 갱신 | secret/password/token 포함 출력 |

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

5.5에서 사용자가 명시적으로 승인한 뒤에만 apply한다.

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
terraform -chdir=infra/aws output ses_domain_identity
terraform -chdir=infra/aws output ses_domain_verification_record
terraform -chdir=infra/aws output ses_dkim_records
terraform -chdir=infra/aws output ses_mail_from_domain
```

AWS Console 확인:

- VPC: `init-main`
- ALB: `init-main-alb`
- CloudFront distribution alias: `init-jungle.cloud`
- ECR repositories: `init-main-frontend`, `init-main-api`, `init-main-worker`
- ECS cluster: `init-main`
- ECS services: `init-main-frontend`, `init-main-api`, `init-main-worker`
- RDS, Redis, S3, SQS, Secrets Manager container가 생성됨
- SES verified identity: `init-jungle.cloud`
- Route53 DNS records: `_amazonses.init-jungle.cloud`, DKIM CNAME 3개, `mail.init-jungle.cloud` MX/TXT

중단 기준:

- plan에 RDS/Redis 삭제 또는 교체가 포함된다.
- CloudFront ACM validation이 완료되지 않는다.
- IAM trust policy가 의도한 GitHub repository/branch보다 넓다.
- SES verification, DKIM, custom MAIL FROM DNS record가 Route53 hosted zone에 생성되지 않는다.

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
  "AWS_REGION": "ap-northeast-2",
  "S3_BUCKET": "init-main-assets-<aws_account_id>",
  "S3_BUCKET_NAME": "init-main-assets-<aws_account_id>",
  "S3_PUBLIC_BASE_URL": "https://init-jungle.cloud",
  "AI_SQS_QUEUE_URL": "<sqs-url>",
  "SQS_QUEUE_URL": "<sqs-url>",
  "OPENAI_API_KEY": "<openai-key>",
  "AI_PROVIDER_API_KEY": "<openai-key>",
  "OPENAI_MODEL": "<model>",
  "OPENAI_EMBEDDING_MODEL": "<embedding-model>",
  "AI_STT_PROVIDER": "openai",
  "OPENAI_STT_MODEL": "<stt-model>",
  "OPENAI_STT_LANGUAGE": "ko",
  "SMTP_HOST": "<ses-smtp-host>",
  "SMTP_PORT": "587",
  "SMTP_SECURE": "false",
  "SMTP_USER": "<ses-smtp-user>",
  "SMTP_PASS": "<ses-smtp-pass>",
  "SMTP_FROM": "no-reply@init-jungle.cloud"
}
```

위 JSON은 형식 예시다. 실제 `api.main.secret.json`에는 `infra/aws/locals.tf`의 `secret_keys.api`에 있는 모든 key를 포함해야 한다.

frontend와 worker도 같은 방식으로 넣는다.

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

docker build -f infra/docker/frontend.Dockerfile -t "$($ecr.frontend):$tag" .
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
- API task가 secret, DB, Redis 연결 오류로 반복 재시작한다.
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

수동 구축이 한 번 성공한 뒤 자동 배포 workflow를 만든다. 목표는 `dev`, `main` branch push가 모두 같은 `init-main-*` 리소스를 갱신하는 것이다.

필수 workflow 계약:

| 항목 | 기준 |
| --- | --- |
| trigger | `push` on `dev`, `main` |
| AWS 인증 | GitHub OIDC로 `github_deploy_role_arn` assume |
| concurrency | `aws-main-deploy` 단일 group |
| image tag | `github.sha` |
| ECR | `init-main-frontend`, `init-main-api`, `init-main-worker` |
| 변경 감지 | frontend/API/worker/common/prisma/env/infra 변경 경로 기준 |
| migration | API 또는 Prisma 변경 시 ECS one-off `npx prisma migrate deploy` |
| service update | migration 성공 후 ECS task definition revision 등록 및 service update |
| smoke | `https://init-jungle.cloud`, `/api/v1/health` |
| cache | 필요 시 CloudFront invalidation |

GitHub repository에 필요한 값:

| 이름 | 위치 | 값 |
| --- | --- | --- |
| `AWS_REGION` | GitHub Actions variable | `ap-northeast-2` |
| `AWS_DEPLOY_ROLE_ARN` | GitHub Actions variable 또는 secret | `terraform output github_deploy_role_arn` |
| `APP_BASE_URL` | GitHub Actions variable | `https://init-jungle.cloud` |

중단 기준:

- OIDC assume role이 실패한다.
- secret key validation이 실패한다.
- migration task가 실패한다.
- smoke test가 실패한다.

### 12. dev/main branch 자동 배포 검증

자동화가 들어간 뒤에는 `dev`와 `main`이 서로 다른 서버가 아니라 같은 main 실배포 환경을 갱신한다는 점을 검증한다.

검증 흐름:

```text
dev push
-> deploy workflow 실행
-> init-main-* ECR image push
-> init-main-* ECS service update
-> https://init-jungle.cloud smoke 통과

main push
-> 같은 workflow 실행
-> 같은 init-main-* 리소스 갱신
-> https://init-jungle.cloud smoke 통과
```

완료 기준:

- GitHub Actions deploy workflow log에서 `dev`, `main` 모두 성공한다.
- ECS service task definition revision이 최신 commit image tag를 참조한다.
- `https://init-jungle.cloud`가 최신 push 커밋 기준으로 갱신된다.

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

# AWS Deployment Solution

이 문서는 개발 진행 중인 `init` 레포에 대해 AWS 배포와 CI/CD를 구축하기 위한 기준 문서다. 목표는 최종 완성본 1회 배포가 아니라, 개발 중 schema, package, runtime 의존성이 바뀌어도 반복적으로 검증하고 배포할 수 있는 기반을 만드는 것이다.

## 현재 로컬 실행 방식

로컬은 전체를 Docker로 띄우지 않는다. Docker는 PostgreSQL, Redis, LocalStack, Mailpit 같은 의존 인프라를 담당하고, 애플리케이션은 각 패키지에서 `npm` 명령으로 실행한다.

| 로컬 구성 | 실행 방식 | 클라우드 대응 |
| --- | --- | --- |
| Frontend | `frontend`, `npm run dev`, port `3000` | ECS Fargate frontend service |
| API | `backend/api`, `npm run dev`, port `3001` | ECS Fargate API service |
| Worker | `backend/worker`, `npm run start:dev` | ECS Fargate worker service |
| PostgreSQL + pgvector | `infra/local/docker-compose.yml` | RDS PostgreSQL + pgvector |
| Redis protocol cache | `infra/local/docker-compose.yml` | ElastiCache Valkey |
| S3 | LocalStack bucket `init-local-assets` | S3 bucket |
| SQS | LocalStack queue `init-ai-jobs` | SQS queue |
| Mailpit | local SMTP inbox | 외부 관리형 SMTP provider |

클라우드에서는 frontend, API, worker를 각각 Docker image로 만든다. 현재 `infra/docker`에는 `frontend.Dockerfile`, `api.Dockerfile`, `worker.Dockerfile`이 추가되어 AWS 배포 image 계약을 검증할 수 있다. `infra/aws`에는 `main` 단일 실배포 환경 기준 AWS 리소스 Terraform 기준선이 추가되어 있다. 실제 ECR push, ECS task definition 갱신, ECS service update는 GitHub Actions deploy workflow가 담당한다.

## 로컬 실행과 AWS 실행 계약 분리

Dockerfile을 추가해도 현재 로컬 개발 방식을 없애지 않는다. 로컬 개발과 AWS 배포는 목적이 다르므로, 둘을 같은 방식으로 강제하지 않고 CI가 둘 다 깨지지 않도록 검증한다.

| 구분 | 역할 | 기준 파일 | 자동화 방식 |
| --- | --- | --- | --- |
| 로컬 개발 실행 | 빠른 개발과 디버깅 | `start-local.ps1`, `infra/local/docker-compose.yml`, 각 package `npm run dev` | 기존 로컬 하네스와 package별 test/build로 검증 |
| Docker production 실행 | ECS에서 실행될 image 계약 | `infra/docker/*.Dockerfile`, root `.dockerignore` | PR/CI에서 Docker build를 실행해 drift 감지 |
| DB schema 변경 | 테이블/컬럼/인덱스 변경 | `backend/api/prisma/schema.prisma`, `backend/api/prisma/migrations` | 배포 시 API image 기반 `npx prisma migrate deploy` 실행 |
| AWS 리소스 변경 | RDS, ElastiCache, ECS, ALB, CloudFront 등 인프라 변경 | `infra/aws` Terraform 파일 | Terraform plan/apply로 변경 diff를 리뷰 |
| 환경변수/secret 변경 | 런타임 설정 key와 실제 값 분리 | `.env.example`, AWS Secrets Manager | key 목록은 Git에서 리뷰, 실제 값은 Secrets Manager에서 관리 |

중요한 점은 Dockerfile이나 Terraform 파일을 코드에서 자동 생성하지 않는다는 것이다. 대신 코드와 설정이 어긋나면 PR 단계에서 build, validation, plan이 실패하도록 만든다.

## 확정된 결정

| 항목 | 결정 |
| --- | --- |
| 도메인 | `init-jungle.cloud` 단일 실배포 도메인 + `/api/*` path routing |
| Frontend 배포 | Next.js SSR이므로 S3 정적 배포가 아니라 ECS container로 배포 |
| 메일 서비스 | provider-neutral Nodemailer SMTP 사용. 실제 provider credential은 Secrets Manager에 두고 발신 도메인/SPF/DKIM/DMARC는 provider 절차로 검증 |
| CloudFront | 처음부터 사용 |
| Route53 | `init-jungle.cloud`를 Route53 hosted zone으로 위임 |
| CloudFront 인증서 | us-east-1 ACM 인증서를 DNS validation으로 발급 |
| ALB | 1개 ALB 사용, listener rule로 frontend/API 분기 |
| ECS subnet | private subnet |
| NAT Gateway | private subnet ECS task의 outbound 통신을 위해 사용 |
| VPC endpoint | S3 Gateway Endpoint는 main stack에 포함. 추가 interface endpoint는 비용/운영 필요 시 후속 검토 |
| Migration | 같은 VPC/private subnet에서 ECS one-off migration task를 1회 실행 |
| Dockerfile 위치 | `infra/docker/*` 단일 경로에 모음 |
| Docker build context | frontend/API/worker 모두 repo root |
| Frontend image 방식 | Next.js `output: "standalone"` 기반 SSR container |
| 로컬 app compose | 이번 Docker 기반 배포 준비 slice에서는 제외. Docker build 안정화 후 추가 |
| AWS IaC 도구 | AWS 리소스 기준선은 Terraform 기준으로 `infra/aws`에 구현 |
| 환경변수와 secret | 모든 실제 값은 AWS Secrets Manager에서 관리 |
| 환경변수 키 목록 | 별도 schema 파일 없이 `.env.example`을 기준으로 관리 |
| Secrets Manager 환경명 | 단일 실배포 환경 기준 `main`만 사용. `dev`, `prod` 명칭은 쓰지 않음 |
| 운영 알림 | Email subscription은 사용하지 않고 CloudWatch Alarm -> SNS Topic -> Amazon Q Developer in chat applications -> Slack 경로를 사용 |
| 운영 dashboard | CloudWatch dashboard `init-main-overview`로 CloudFront, ALB, ECS, RDS, Valkey, SQS 지표를 한 화면에서 확인 |
| 배포 approval | 사용하지 않음. `dev`, `main` 브랜치 모두 같은 실배포 환경에 자동 배포 |
| CI/CD 성격 | 완성본 배포가 아니라 개발 중 schema/package/runtime 변경을 계속 흡수하는 pipeline |

## AWS 리소스 태그 정책

`infra/aws` Terraform 코드에는 리소스 관리와 비용 추적을 위해 태그 정책을 반영한다. 현재 기준은 Terraform AWS provider `v6.53.0`에서 `tags`를 지원하는 리소스에는 명시적 `tags` block을 둔다는 것이다. 실제 AWS 리소스에 태그가 반영되는 시점은 Terraform `plan/apply` 실행 이후다.

공통 태그는 provider `default_tags`로 적용한다.

| 태그 key | 값 |
| --- | --- |
| `Project` | `jungle-init` |
| `Environment` | main stack은 `main`, bootstrap stack은 `bootstrap` |
| `ManagedBy` | `terraform` |
| `Repository` | `var.github_repository` |
| `Owner` | main stack은 `A`, bootstrap stack은 `var.owner` 기본값 `A` |

리소스별 식별 태그는 공통 태그와 별도로 둔다.

| 태그 key | 사용 대상 | 목적 |
| --- | --- | --- |
| `Name` | 대부분의 태그 지원 리소스 | AWS Console, 비용 탐색, 운영 점검에서 사람이 식별 |
| `Tier` | subnet | `public`, `private-app`, `private-data` 구분 |
| `Service` | frontend/API/worker 관련 ECS, target group, security group rule, log group | 서비스별 비용과 장애 범위 추적 |
| `Component` | CloudWatch/SNS/Q Developer 등 공통 감시 리소스 | `alb`, `sqs`, `rds`, `observability`처럼 감시 대상 구분 |
| `Role` | IAM role | `ecs-execution`, `ecs-task`, `github-deploy` 역할 구분 |
| `Source` | 일부 ingress rule | CloudFront 또는 admin CIDR 출처 구분 |

현재 명시적 태그를 둔 주요 리소스 범위는 아래와 같다.

| 범위 | 태그 적용 리소스 |
| --- | --- |
| Network | VPC, subnet, internet gateway, EIP, NAT Gateway, route table, VPC endpoint |
| Security | security group, security group ingress/egress rule |
| Edge/Routing | ALB, target group, listener, listener rule, CloudFront distribution |
| Compute | ECS cluster, ECS task definition, ECS service |
| IAM | ECS execution role, ECS task role, GitHub deploy role |
| Data | RDS subnet group, RDS instance, ElastiCache subnet group, ElastiCache replication group |
| Storage/Queue | S3 assets bucket, SQS queue, SQS DLQ |
| Runtime config | Secrets Manager secret |
| Observability | CloudWatch log group, CloudWatch metric alarm, CloudWatch dashboard, SNS topic, Q Developer Slack channel configuration |
| Bootstrap | Terraform state S3 bucket, GitHub OIDC provider |

ECS service에는 `enable_ecs_managed_tags = true`, `propagate_tags = "SERVICE"`를 둔다. 이렇게 하면 ECS가 관리하는 task에도 service 기준 태그가 전파되어 어떤 service의 실행 task인지 추적하기 쉽다.

RDS instance에는 `copy_tags_to_snapshot = true`를 둔다. 최종 snapshot이나 수동 snapshot을 운영할 때 원본 DB의 관리 태그가 snapshot에도 이어지게 하기 위함이다.

태그를 지원하지 않는 Terraform 리소스는 개별 리소스에 태그를 붙이지 않고, 상위 리소스의 태그로 관리한다.

| 태그 미지원 리소스 | 관리 기준 |
| --- | --- |
| `aws_s3_bucket_public_access_block`, `aws_s3_bucket_versioning`, `aws_s3_bucket_server_side_encryption_configuration`, `aws_s3_bucket_ownership_controls`, `aws_s3_bucket_lifecycle_configuration`, `aws_s3_bucket_cors_configuration`, `aws_s3_bucket_policy` | S3 bucket 자체 태그로 관리 |
| `aws_ecr_lifecycle_policy` | ECR repository 태그로 관리 |
| `aws_iam_role_policy`, `aws_iam_role_policy_attachment` | 연결된 IAM role 태그로 관리 |
| `aws_route_table_association` | route table과 subnet 태그로 관리 |
| `aws_ecs_cluster_capacity_providers` | ECS cluster 태그로 관리 |
| `aws_route53_record` | Route53 hosted zone과 record name으로 관리 |
| `aws_cloudfront_origin_access_control` | CloudFront distribution과 S3 bucket 태그로 관리 |
| `aws_ses_domain_identity` | SES domain identity는 provider schema상 tag 미지원. 도메인명과 Terraform state로 식별 |

태그 누락 검증은 현재 provider schema 기준으로 수행한다.

```powershell
terraform -chdir=infra/aws fmt -check -recursive
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws/bootstrap validate
git diff --check
```

추가로 Terraform AWS provider schema를 조회해 `tags`를 지원하는 리소스 중 명시적 `tags` block이 없는 항목이 없는지 확인한다. 이 검증은 코드 리뷰 보조용이며, 실제 AWS 반영 여부는 `terraform plan`에서 확인한다.

## 목표 아키텍처

```text
User
-> Domain registration for init-jungle.cloud
-> Route53 hosted zone
-> CloudFront
   -> /api/* behavior: ALB /api/* listener rule -> ECS API service
   -> default behavior: ALB default rule -> ECS frontend service

ECS frontend service
-> API calls through same domain /api/*

ECS API service
-> RDS PostgreSQL
-> ElastiCache Valkey
-> S3
-> SQS
-> SES

ECS worker service
  -> SQS polling
  -> RDS PostgreSQL
  -> S3
  -> OpenAI/MediaPipe runtime dependency

CloudWatch Alarm
-> SNS topic init-main-ops-alerts
-> Amazon Q Developer in chat applications
-> Slack channel
```

사용자는 CloudFront에 연결된 `init-jungle.cloud` 단일 도메인만 바라본다. CloudFront와 ALB가 path 기준으로 frontend와 API를 나눈다. `dev`와 `main`은 서로 다른 AWS 환경을 만들지 않고, 같은 `init-main-*` CloudFront/ECS/RDS/Valkey/S3/SQS 세트를 갱신한다.

도메인 소유권은 `init-jungle.cloud`를 기준으로 한다. DNS 관리는 Route53 hosted zone으로 위임한다. bootstrap Terraform이 Route53 hosted zone을 만들고, 출력된 NS record를 가비아 네임서버 설정에 등록해야 한다. 이 위임이 끝나지 않으면 Terraform이 ACM DNS validation record를 만들어도 CloudFront 인증서 검증이 완료되지 않을 수 있다.

## 단일 실배포 도메인 + `/api/*`

단일 도메인 원칙은 실배포 환경 하나에 적용한다. `dev`와 `main` 브랜치는 둘 다 같은 `init-jungle.cloud`와 같은 AWS 리소스를 바라본다. 따라서 나중에 성공한 배포가 실서비스에 반영된다.

```text
https://init-jungle.cloud/                     -> main frontend
https://init-jungle.cloud/api/v1/health        -> main API
```

이 방식의 핵심 이점은 브라우저가 frontend와 API를 같은 origin으로 본다는 점이다. CORS, cookie, OAuth callback, refresh token 처리가 단순해진다.

Terraform domain mapping:

| Environment | Domain | Route53 record | CloudFront certificate |
| --- | --- | --- | --- |
| `main` | `init-jungle.cloud` | A/AAAA alias -> main CloudFront distribution | ACM in `us-east-1`, DNS validation |

CloudFront custom domain을 쓰려면 인증서는 CloudFront 요구사항에 맞춰 `us-east-1` ACM에 있어야 한다. 따라서 `infra/aws`는 기본 `ap-northeast-2` provider 외에 `aws.us_east_1` provider alias를 사용한다.

CloudFront behavior 초안:

| Path pattern | Origin | Cache policy |
| --- | --- | --- |
| `/api/*` | ALB | Cache disabled, Authorization/Cookie/required headers forwarded |
| `/_next/static/*` | ALB | Long cache 가능 |
| `/*` | ALB | SSR 기준 cache disabled로 시작 |

ALB listener rule 초안:

| Rule | Target group |
| --- | --- |
| Path `/api/*` | API ECS target group |
| Default `/*` | Frontend ECS target group |

업데이트: 운영 브라우저 런타임의 frontend API origin 정책은 `https://init-jungle.cloud/api/v1/*` 기준으로 정리됐다. HTTPS 환경에서 loopback build 값이 들어오면 client는 same-origin으로 fallback하며, production Docker build에서는 여전히 `--build-arg NEXT_PUBLIC_API_BASE_URL=https://init-jungle.cloud`를 명시적으로 전달해야 한다.

현재 frontend 코드는 `NEXT_PUBLIC_API_BASE_URL`을 사용해 `http://localhost:3001` 형태로 API를 호출한다. 단일 도메인 배포에서는 가능하면 `/api/v1` 같은 same-origin relative path로 정리하는 것이 좋다. 이 변경은 Docker 문서 반영이 아니라 frontend API client 수정 작업으로 분리한다.

## ECS subnet 결정

ECS task는 private subnet으로 확정한다.

| 구성 | Subnet |
| --- | --- |
| CloudFront | VPC 밖 global edge |
| ALB | public subnet |
| ECS frontend/API/worker task | private subnet |
| RDS PostgreSQL | private subnet |
| ElastiCache Valkey | private subnet |
| NAT Gateway | public subnet |

public subnet에 ECS task를 두면 초기 실습은 쉽지만 task가 인터넷 경계에 가까워진다. 운영 배포에서는 ALB만 public subnet에 두고 ECS task는 private subnet에 두는 편이 명확하다.

## NAT Gateway와 VPC endpoint

초기에는 NAT Gateway를 둔다. 다만 NAT Gateway는 시간당 비용과 처리량 비용이 있으므로, AWS 내부 서비스 트래픽은 VPC endpoint로 빼서 비용과 보안 경계를 개선한다.

| 대상 | 초기 경로 | 최적화 경로 |
| --- | --- | --- |
| ECR image pull | NAT Gateway | ECR API/DKR interface endpoint + S3 gateway endpoint |
| CloudWatch Logs | NAT Gateway | CloudWatch Logs interface endpoint |
| Secrets Manager | NAT Gateway | Secrets Manager interface endpoint |
| S3 | NAT Gateway | S3 gateway endpoint |
| SQS | NAT Gateway | SQS interface endpoint |
| SES | NAT Gateway | SES endpoint 가능 여부 확인 후 결정 |
| OpenAI API | NAT Gateway | 외부 SaaS이므로 NAT 필요 |

1차 배포에서는 NAT Gateway로 성공 경로를 만든다. 2차 최적화에서 S3, ECR, CloudWatch Logs, Secrets Manager, SQS endpoint를 추가한다.

## dev, main 브랜치의 단일 실배포 정책

초기 AWS 환경은 `main` 실배포 환경 하나만 둔다. `dev` 브랜치는 별도 AWS dev 환경이 아니라, 실배포 환경에 자동 배포되는 또 하나의 trigger다. CD 안정성 확인용 임시 branch였던 `infra/test`는 검증 완료 후 workflow trigger와 branch에서 제거했다. `staging`은 발표 전 리허설 또는 운영 검증 환경이 필요해지는 시점에 별도 작업으로 추가한다.

GitHub Actions가 `dev`, `main` PR merge로 생성된 protected branch push를 받아 같은 AWS environment를 갱신한다. AWS가 repository의 branch를 직접 감시하는 것이 아니라, GitHub Actions가 target branch와 GitHub Environment `init-main` 권한 경계를 확인한 뒤 동일한 배포 target을 사용한다.

trigger는 `pull_request.closed`가 아니라 `push`를 사용한다. `pull_request.closed` 이벤트에서 Environment protection rule은 base branch가 아니라 `refs/pull/<number>/merge` ref를 평가할 수 있어 `dev`/`main` branch rule에 막힌다. 따라서 protected branch에 merge 결과가 반영된 `push` 이벤트를 배포 시작점으로 삼고, workflow 내부에서 해당 commit이 merged PR과 연결되어 있는지 확인해 direct push 배포를 차단한다. 이 확인은 commit association 조회를 먼저 사용하고, merge commit이 association 조회에서 누락되는 경우를 보완하기 위해 merged PR의 `merge_commit_sha`가 `github.sha`와 같은지도 함께 확인한다.

| Git branch | AWS environment | 배포 정책 | Migration 정책 |
| --- | --- | --- | --- |
| Pull Request | 없음 | 배포하지 않음. test/build/docker build만 수행 | 실제 DB migration 없음. `prisma validate/generate`만 수행 |
| `dev` | main | merge 후 자동 실배포 | ECS one-off migration task 자동 실행 |
| `main` | main | merge 후 자동 실배포 | ECS one-off migration task 자동 실행 |

환경별 갱신 범위:

| Trigger | 갱신되는 AWS 리소스 | 갱신되지 않는 리소스 |
| --- | --- | --- |
| `dev` PR merge | `init-main-*` ECR/ECS, main RDS/Valkey/S3/SQS, main CloudFront | 없음 |
| `main` PR merge | `init-main-*` ECR/ECS, main RDS/Valkey/S3/SQS, main CloudFront | 없음 |

따라서 `dev`, `main` 중 어느 브랜치든 배포가 성공하면 `init-jungle.cloud`의 실제 서비스가 갱신된다. 여러 브랜치 배포가 겹치면 마지막으로 성공한 배포가 최종 상태가 되므로 deploy workflow에는 같은 concurrency group을 두어 중복 배포를 직렬화한다.

## 서비스별 자동 배포 흐름

GitHub Actions의 배포 workflow는 `docker-compose`를 생성해서 클라우드에 올리는 방식이 아니다. `Dockerfile`로 image를 만들고, ECR에 push한 뒤, ECS task definition의 image URI를 새 image tag로 바꾸어 새 revision을 등록한다. ECS service update 이후 새 task가 ALB target group health check를 통과하면 ECS가 기존 task를 자동으로 제거한다.

기본 흐름:

```text
PR merge로 생성된 target branch push
-> GitHub Actions deploy workflow
-> changed service detection
-> Docker build
-> Amazon ECR push
-> ECS task definition 새 revision 등록
-> API 변경이면 ECS one-off migration task 실행
-> ECS service update
-> ALB target group health check
-> smoke test
-> 새 task 정상 확인 후 기존 task 자동 제거
```

branch별 동작:

| Trigger | 동작 |
| --- | --- |
| Pull Request to `dev`/`main` | test/build/docker build 검증만 수행. ECR push와 ECS update는 하지 않음 |
| Merge to `dev` | 변경된 service만 main ECR/ECS에 자동 실배포 |
| Merge to `main` | 변경된 service만 main ECR/ECS에 자동 실배포 |

서비스별 변경 감지 기준:

| 변경 경로 | Build/Push 대상 | ECS update 대상 | 추가 절차 |
| --- | --- | --- | --- |
| `frontend/**`, `infra/docker/frontend.Dockerfile` | `init-main-frontend` | `init-main-frontend` | frontend smoke test |
| `backend/api/**`, `infra/docker/api.Dockerfile` | `init-main-api` | `init-main-api` | migration task 실행 후 API service update |
| `backend/common/**` | `init-main-api` | `init-main-api` | API가 `@init/common`을 참조하므로 API image 재빌드 |
| `backend/worker/**`, `infra/docker/worker.Dockerfile` | `init-main-worker` | `init-main-worker` | worker startup log 확인 |
| `backend/api/prisma/**` | `init-main-api`, `init-main-worker` | `init-main-api`, `init-main-worker` | API image 기반 migration task 실행. worker가 API generated Prisma Client를 포함하므로 worker도 재빌드 |
| `.env.example` | image build는 변경 service 기준 | 필요 service만 update | Secrets Manager key validation. secret mapping 자체 변경은 Terraform PR로 처리 |
| `infra/aws/**` | 없음 | 없음 | Terraform plan/apply 대상. application image deploy workflow와 분리 |

ECR image tag는 mutable한 `latest`를 배포 기준으로 쓰지 않는다. 기본 tag는 PR merge 후 target branch head인 `github.sha`를 사용하고, 필요하면 사람이 보기 쉬운 branch alias tag를 추가로 붙인다. ECS task definition에는 항상 immutable한 SHA tag image URI를 반영한다. `dev`, `main` 모두 같은 ECR repository에 push하므로 SHA tag를 기준으로 배포 이력을 추적한다.

예를 들어 팀원이 API 코드만 수정해 `dev`에 merge하면 자동화는 아래처럼 동작한다.

```text
backend/api/** 변경 감지
-> infra/docker/api.Dockerfile 기준 Docker build
-> ECR init-main-api:<github.sha> push
-> init-main-api task definition 새 revision 등록
-> npx prisma migrate deploy one-off task 실행
-> init-main-api ECS service update
-> ALB /api/v1/health target health check
-> init-jungle.cloud smoke test 통과
```

동일 실배포 환경에 대한 deploy workflow는 승인 대기 없이 자동으로 진행한다. 배포 충돌을 피하기 위해 향후 workflow에는 예를 들어 `aws-main-deploy` 같은 단일 concurrency group을 둔다.

자동 실배포 절차:

```text
1. PR -> dev 또는 main merge
2. GitHub Actions deploy workflow 자동 시작
3. concurrency group에서 이전 배포 완료 대기
4. 변경된 service image build
5. init-main-* ECR repository에 target branch head SHA tag push
6. API/Prisma 변경이면 main 환경 migration task 실행
7. migration 성공 후 ECS service update
8. smoke test 통과 후 배포 완료
```

자동 배포 전 확인 기준:

| 확인 항목 | 확인 방법 |
| --- | --- |
| CI 통과 | GitHub checks 확인 |
| Docker image build 성공 | deploy workflow build step 확인 |
| package 변경 여부 | `package.json`, `package-lock.json` diff 확인 |
| DB schema/migration 변경 여부 | `backend/api/prisma/schema.prisma`, `migrations/*` diff 확인 |
| migration 위험도 | destructive SQL 여부 확인 |
| env/secret 변경 여부 | `.env.example` diff와 Secrets Manager key 존재 여부 확인 |
| 실배포 검증 | `init-jungle.cloud` smoke test와 주요 화면 확인 |

## Migration 자동화 원칙

API container startup에서 migration을 실행하지 않는다. ECS service는 여러 task가 동시에 뜰 수 있고, 같은 migration을 동시에 잡으면 실패 원인이 된다.

확정 원칙:

```text
deploy workflow
-> build/push image
-> run ECS one-off migration task in private subnet
-> migration success 확인
-> ECS service update
-> smoke test
```

Migration task는 API image를 재사용하고 command만 바꾼다.

```text
npx prisma migrate deploy
```

Migration task가 실패하면 ECS service update를 시작하지 않는다. 이때 기존 production service는 이전 task definition과 이전 DB 상태로 계속 트래픽을 처리한다. 단, DB migration은 실패 지점에 따라 일부 DDL이 적용되었을 가능성이 있으므로 A가 CloudWatch log와 DB 상태를 확인하고 보정 migration을 작성한다.

## Container 배포 단위

Dockerfile은 `infra/docker/*`에 모은다. 현재 frontend/API/worker image 계약은 구현되어 있고, 세 image 모두 repo root를 build context로 사용한다.

| Image | Dockerfile | Build context | 실행 command |
| --- | --- | --- | --- |
| frontend | `infra/docker/frontend.Dockerfile` | repo root | Next standalone SSR server |
| api | `infra/docker/api.Dockerfile` | repo root | `node dist/src/main.js` |
| worker | `infra/docker/worker.Dockerfile` | repo root | `node dist/main.js` |
| migration | API image 재사용 | repo root | `npx prisma migrate deploy` |

`backend/api`는 `@init/common`을 `file:../common`으로 참조하므로 Docker build context는 repo root여야 한다. `.github/workflows/ci.yml`의 `docker-build` job, `scripts/verify-docker.ps1 -Build`, macOS/Linux용 `scripts/check-local.sh --build-docker`는 모두 repo root context로 image를 build하도록 정리되어 있다.

Frontend는 Next.js standalone output을 사용한다. 현재 `frontend/next.config.ts`에 `output: "standalone"`이 반영되어 있고, 중복되던 `next.config.js`는 제거되어 TypeScript 설정 하나로 정리되어 있다.

root `.dockerignore`도 함께 추가되어 있다. repo root를 build context로 쓰면 전체 저장소가 Docker build context에 들어가므로, `node_modules`, `.next`, `dist`, `coverage`, local `.env`, git metadata를 제외한다. 단, 각 package의 `package.json`, `package-lock.json`, source, Prisma schema/migrations는 build에 필요하므로 제외하지 않는다.

## Docker 자동화 원칙

로컬 코드를 Docker 방식으로 대체하지 않는다. Docker는 AWS 배포 image가 현재 코드와 계속 맞는지 확인하는 별도 계약이다.

자동화 대상:

| 변경 상황 | 자동화로 잡는 방법 |
| --- | --- |
| `package.json` 또는 `package-lock.json` 변경 | Docker build 중 `npm ci`가 새 lockfile 기준으로 실행되어 실패 여부를 확인 |
| `backend/common` 변경 | API Docker build가 repo root context에서 common build를 포함해 검증 |
| Prisma schema 변경 | API Docker build 중 `prisma generate`, 배포 workflow의 migration task에서 `prisma migrate deploy` 실행 |
| Frontend build output 변경 | frontend Docker build와 Next standalone output 생성 여부로 확인 |
| Dockerfile과 CI context 불일치 | `.github/workflows/ci.yml`와 `scripts/verify-docker.ps1 -Build`가 repo root context로 build |
| merge 후 service별 배포 대상 판단 | GitHub Actions deploy workflow가 변경 경로를 보고 build/push/update 대상 service를 결정 |

자동화하지 않는 대상:

| 대상 | 이유 |
| --- | --- |
| Dockerfile 자동 수정 | build/runtime command 변경은 명시적 리뷰가 필요한 배포 계약 변경이다. CI는 자동 수정 대신 실패로 drift를 알린다. |
| RDS/ElastiCache/ECS 설정 자동 추론 | instance size, subnet, security group, task CPU/memory는 코드에서 안전하게 추론할 수 없다. Terraform 변경으로 명시한다. |
| Secrets Manager 실제 값 자동 커밋 | secret 값은 Git에 저장하지 않는다. `.env.example`은 key 목록만 관리한다. |
| `docker-compose` 기반 production 배포 | ECS production 배포 기준은 task definition/service/target group이다. compose는 후속 local AWS-like smoke test 용도로만 둔다. |
| 로컬 app compose 즉시 추가 | AWS-like local compose는 유용하지만 Docker build, container env, network 문제를 한 번에 늘리므로 다음 slice로 분리한다. |

## 환경변수와 Secrets Manager

모든 실제 환경변수 값은 Secrets Manager에서 관리한다. ECS task definition에서는 가능한 한 `environment`보다 `secrets` mapping을 사용한다.

단, `NEXT_PUBLIC_*`는 이름과 다르게 secret이 아니다. Next.js client bundle에 포함되면 브라우저 사용자에게 노출된다. 단일 도메인 `/api/*` 방식에서는 가능하면 `NEXT_PUBLIC_API_BASE_URL` 자체를 없애고 same-origin relative path를 사용한다.

환경변수 키 목록은 `.env.example`만 기준으로 관리한다. 별도 `secrets.schema.json` 파일은 만들지 않는다. 새 환경변수를 추가하면 반드시 `.env.example`에 키를 추가하고 PR에서 리뷰받는다.

Secrets Manager 경로는 단일 실배포 환경인 `main`만 사용한다.

| Secret group | 대상 service | 예시 |
| --- | --- | --- |
| `init/main/frontend` | frontend | main frontend runtime env |
| `init/main/api` | API | main API runtime env |
| `init/main/worker` | worker | main worker runtime env |

배포 전 secret 검증은 `.env.example`에 있는 키 중 service별로 필요한 키가 Secrets Manager에 존재하는지 확인하는 방식으로 둔다. 실제 값은 Git에 저장하지 않는다.

API는 `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`으로 provider-neutral SMTP 연결을 만든다. 운영에서는 implicit TLS 또는 STARTTLS를 강제하고, 연결/인사/socket timeout을 제한한다. provider 자격증명과 발신 도메인 검증 정보는 Git에 저장하지 않는다.

개인 Gmail/Naver SMTP를 저용량 MVP에 사용하는 경우 `SMTP_FROM`은 인증한 계정 주소와 동일하게 둔다. 별도 `no-reply` 주소는 provider에서 alias 또는 발신 도메인 검증이 완료된 경우에만 사용한다. 일반 로그인 비밀번호 대신 2단계 인증 기반 애플리케이션 비밀번호를 사용한다.

배포 workflow는 새 API task definition을 서비스에 적용하기 전에 ECS one-off SMTP smoke를 실행한다. smoke가 실패하면 서비스 갱신을 중단하며 `/api/v1/health`에는 SMTP 네트워크 상태를 결합하지 않는다.

`SMTP_SMOKE_TO`는 GitHub Environment `init-main`의 secret으로 두며, 실제로 확인 가능한 팀 전용 수신함을 사용한다. workflow 성공은 SMTP 접수까지의 자동 검증이므로 최초 전환과 credential 교체 시에는 수신함 도착과 스팸 분류를 수동 확인한다.

기존 SES Terraform 리소스와 IAM 권한은 새 SMTP provider로 실제 발송을 검증하는 동안 rollback 용도로 유지한다. 세 발송 흐름 검증과 운영 관찰이 끝난 뒤 Terraform-only 변경으로 제거하며 애플리케이션 변경 PR과 섞지 않는다.

## 실패 모드와 제어

| 실패 모드 | 제어 |
| --- | --- |
| 새 task health check 실패 | ECS deployment circuit breaker rollback |
| DB migration 실패 | ECS service update 전 중단, 기존 service 유지 |
| frontend/API env 불일치 | smoke test에서 `/api/v1/health`, 주요 화면 접근 확인 |
| SQS worker 장애 | SQS oldest age/DLQ CloudWatch alarm, Slack 알림, DLQ 확인 |
| ALB target 장애 | ALB 5xx/unhealthy/latency CloudWatch alarm, Slack 알림, ECS service/target group 확인 |
| 운영 지표 확인 누락 | CloudWatch dashboard에서 CloudFront, ALB, ECS, RDS, Valkey, SQS 지표 확인 |
| NAT 비용 증가 | VPC endpoint 단계적 추가 |
| package lock 불일치 | PR CI에서 `npm ci` 실패 |
| Prisma Client 누락 | Docker build 중 `prisma generate` 실행 |
| Secrets Manager key 누락 | deploy 전 secret key validation job 추가 |

## 릴리즈 게이트

이번 변경의 release type은 `routine`이다. AWS 리소스, DB schema, Secrets Manager 값은 바꾸지 않고 Docker 배포 준비 상태와 검증 계약을 최신화한다.

사전 확인:

| Gate | 기준 |
| --- | --- |
| Dockerfile 감지 | `infra/docker/*.Dockerfile` 3개가 감지되어야 한다 |
| Docker build context | Windows harness, bash harness, GitHub Actions가 모두 repo root를 context로 사용해야 한다 |
| Frontend standalone | `frontend/next.config.ts`의 `output: "standalone"` 기반으로 image가 build되어야 한다 |
| API runtime 의존성 | API image 안에서 `@init/common`과 Prisma Client가 로드되어야 한다 |
| Worker runtime 의존성 | worker image 안에서 API generated Prisma Client가 로드되어야 한다 |

rollout 순서:

```text
문서와 검증 스크립트 갱신
-> git diff --check
-> verify-docker.ps1
-> verify-docker.ps1 -Build
-> check-local.sh --build-docker 가능 시 확인
-> check-local.ps1 -Role A -BuildDocker
```

smoke check는 이번 slice에서 AWS endpoint가 아니라 Docker image 내부 산출물 기준으로 수행한다. frontend는 `server.js`와 `.next/static`, API는 `dist/src/main.js`, `@init/common`, Prisma schema/Client, worker는 `dist/main.js`와 API generated Prisma Client를 확인한다.

rollback 기준은 단순하다. bash harness 변경으로 macOS/Linux role harness가 실패하면 `scripts/check-local.sh`의 Docker 탐색/빌드 부분만 되돌리고, PowerShell과 GitHub Actions의 repo root context 기준은 유지한다. 문서가 Terraform/ECS deploy workflow를 구현 완료처럼 표현하면 `aws-deployment-solution.md`와 `test-strategy.md`만 보정한다.

남은 release risk는 실제 cloud deploy workflow가 임시 `infra/test`에서는 성공했지만 정식 `dev`/`main` merge 흐름은 아직 별도로 검증해야 한다는 점이다. `infra/test` re-run all jobs 기준 ECR push, ECS frontend service update, domain smoke는 통과했고, 임시 workflow trigger와 branch는 제거했다. 최종 완료 판정은 `dev`와 `main` PR merge에서도 같은 workflow가 성공한 뒤 내린다.

## 완료된 작업 단위

현재까지 완료된 Docker 기반 배포 준비는 아래와 같다.

1. Docker 기반 배포 준비
   - `infra/docker/frontend.Dockerfile`
   - `infra/docker/api.Dockerfile`
   - `infra/docker/worker.Dockerfile`
   - root `.dockerignore`
   - frontend Next.js standalone 설정
   - `.github/workflows/ci.yml` docker-build job을 repo root context 기준으로 수정
   - `scripts/verify-docker.ps1 -Build`를 repo root context 기준으로 수정
   - `scripts/check-local.sh --build-docker`를 repo root context 기준으로 수정

## 다음 작업 단위: AWS 인프라 구축 통합 실행 계획

다음 작업은 `AWS 리소스 적용 준비`와 `CI/CD 배포 workflow 구현`을 분리하지 않고 하나의 실행 단위로 진행한다. 이유는 실제 적용 중간에 가비아 네임서버 위임, Secrets Manager 실제 값 입력, AWS Console 확인처럼 코딩 에이전트가 대신할 수 없는 수동 작업이 끼어 있기 때문이다.

실제 단계별 수행 절차의 source of truth는 [`infra/aws/README.md`](../../infra/aws/README.md)다. 이 설계 문서는 배포 방식의 결정, 완료 기준, 중단 기준만 유지하고, 실행 명령과 AWS Console 확인 절차는 runbook 문서에 둔다.

통합 실행 흐름:

```text
Preflight
-> Bootstrap apply
-> Gabia NS 위임
-> backend-main.hcl 준비
-> main Terraform apply
-> Secrets Manager 값 seed
-> 초기 Docker image build/push
-> ECS one-off migration task
-> ECS service activation
-> domain smoke test
-> GitHub Actions deploy workflow 구현
-> dev/main branch 자동 배포 검증
```

작업 단위 완료 기준:

- `infra/aws/bootstrap`과 `infra/aws` main stack의 `terraform plan/apply`가 성공한다.
- 가비아 `init-jungle.cloud` 네임서버가 Route53 hosted zone NS로 위임된다.
- Amazon Q Developer in chat applications의 Slack workspace/channel configuration이 SNS topic `init-main-ops-alerts`와 연결된다.
- CloudWatch alarm action이 Slack 알림용 SNS topic을 바라보고 `init-main-overview` dashboard가 생성된다.
- Secrets Manager `init/main/*` JSON 값이 `.env.example`과 task definition secret key 계약을 만족한다.
- ECR에 frontend/API/worker image가 존재한다.
- ECS one-off migration task가 성공한 뒤 ECS service update가 진행된다.
- ALB target group health check와 `https://init-jungle.cloud` smoke test가 통과한다.
- GitHub Actions deploy workflow가 `dev`, `main` PR merge에서 같은 main 실배포 환경을 갱신한다.

임시 검증 현황:

- `infra/test` GitHub Actions run `28840157083`은 `Re-run all jobs` 후 `Success`로 완료됐다.
- 확인된 결과는 frontend 변경 기준 ECR image tag `4c8ba7b1f4bfedca05cb274cf9613beb0878cbd5` push, ECS `init-main-frontend:2` service update, API health 200, CloudWatch alarm 7개 `OK`다.
- 남은 작업은 `dev`/`main` merge 검증이다. `infra/test` 임시 workflow trigger와 branch는 제거했다.

중단 기준:

- `aws sts get-caller-identity`가 의도한 AWS 계정이 아니다.
- 가비아 네임서버 위임이 완료되지 않아 ACM DNS validation이 장시간 대기 상태다.
- Terraform plan에 RDS, Valkey, CloudFront, IAM의 의도하지 않은 교체 또는 삭제가 포함된다.
- Secrets Manager에 필요한 runtime key가 누락되어 task 기동이 실패한다.
- Prisma migration task가 실패한다.
- ECS service update 후 ALB target health가 정상화되지 않는다.

코딩 에이전트가 대신할 수 없는 수동 작업:

- 실제 AWS 계정 credential/profile 선택과 비용 발생 승인
- 가비아 관리 화면에서 `init-jungle.cloud` 네임서버를 Route53 NS로 변경
- OpenAI, JWT, SES, DB password 등 실제 secret 값 결정 및 입력
- AWS Console에서 비용/보안/상태를 직접 확인하는 최종 판단

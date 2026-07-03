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
| Redis | `infra/local/docker-compose.yml` | ElastiCache Redis |
| S3 | LocalStack bucket `init-local-assets` | S3 bucket |
| SQS | LocalStack queue `init-ai-jobs` | SQS queue |
| Mailpit | local SMTP inbox | Amazon SES |

클라우드에서는 frontend, API, worker를 각각 Docker image로 만든다. 현재 `infra/docker`에는 `frontend.Dockerfile`, `api.Dockerfile`, `worker.Dockerfile`이 추가되어 AWS 배포 image 계약을 검증할 수 있다. `infra/aws`에는 dev/main 기준 AWS 리소스 Terraform 초안이 추가되어 있다. 다만 실제 ECR push, ECS task definition 갱신, ECS service update workflow는 아직 후속 작업이다.

## 로컬 실행과 AWS 실행 계약 분리

Dockerfile을 추가해도 현재 로컬 개발 방식을 없애지 않는다. 로컬 개발과 AWS 배포는 목적이 다르므로, 둘을 같은 방식으로 강제하지 않고 CI가 둘 다 깨지지 않도록 검증한다.

| 구분 | 역할 | 기준 파일 | 자동화 방식 |
| --- | --- | --- | --- |
| 로컬 개발 실행 | 빠른 개발과 디버깅 | `start-local.ps1`, `infra/local/docker-compose.yml`, 각 package `npm run dev` | 기존 로컬 하네스와 package별 test/build로 검증 |
| Docker production 실행 | ECS에서 실행될 image 계약 | `infra/docker/*.Dockerfile`, root `.dockerignore` | PR/CI에서 Docker build를 실행해 drift 감지 |
| DB schema 변경 | 테이블/컬럼/인덱스 변경 | `backend/api/prisma/schema.prisma`, `backend/api/prisma/migrations` | 배포 시 API image 기반 `npx prisma migrate deploy` 실행 |
| AWS 리소스 변경 | RDS, ElastiCache, ECS, ALB, CloudFront 등 인프라 변경 | 후속 `infra/aws` Terraform 파일 | Terraform plan/apply로 변경 diff를 리뷰 |
| 환경변수/secret 변경 | 런타임 설정 key와 실제 값 분리 | `.env.example`, AWS Secrets Manager | key 목록은 Git에서 리뷰, 실제 값은 Secrets Manager에서 관리 |

중요한 점은 Dockerfile이나 Terraform 파일을 코드에서 자동 생성하지 않는다는 것이다. 대신 코드와 설정이 어긋나면 PR 단계에서 build, validation, plan이 실패하도록 만든다.

## 확정된 결정

| 항목 | 결정 |
| --- | --- |
| 도메인 | 환경별 단일 도메인 + `/api/*` path routing |
| Frontend 배포 | Next.js SSR이므로 S3 정적 배포가 아니라 ECS container로 배포 |
| 메일 서비스 | 별도 SMTP 서버 없이 Amazon SES 사용 |
| CloudFront | 처음부터 사용 |
| ALB | 1개 ALB 사용, listener rule로 frontend/API 분기 |
| ECS subnet | private subnet |
| NAT Gateway | private subnet ECS task의 outbound 통신을 위해 사용 |
| VPC endpoint | NAT Gateway 비용 최적화를 위해 후속 단계에서 도입 |
| Migration | 같은 VPC/private subnet에서 ECS one-off migration task를 1회 실행 |
| Dockerfile 위치 | `infra/docker/*` 단일 경로에 모음 |
| Docker build context | frontend/API/worker 모두 repo root |
| Frontend image 방식 | Next.js `output: "standalone"` 기반 SSR container |
| 로컬 app compose | 이번 Docker 기반 배포 준비 slice에서는 제외. Docker build 안정화 후 추가 |
| AWS IaC 도구 | AWS 리소스 초안은 Terraform 기준으로 `infra/aws`에 구현 |
| 환경변수와 secret | 모든 실제 값은 AWS Secrets Manager에서 관리 |
| 환경변수 키 목록 | 별도 schema 파일 없이 `.env.example`을 기준으로 관리 |
| Secrets Manager 환경명 | branch 이름과 맞춰 `dev`, `main` 사용. `prod` 명칭은 쓰지 않음 |
| Production approval | GitHub Environment approval 사용. A 단독 승인 가능, PM 검토는 선택 |
| CI/CD 성격 | 완성본 배포가 아니라 개발 중 schema/package/runtime 변경을 계속 흡수하는 pipeline |

## AWS 리소스 태그 정책

`infra/aws` Terraform 코드에는 리소스 관리와 비용 추적을 위해 태그 정책을 반영한다. 현재 기준은 Terraform AWS provider `v6.53.0`에서 `tags`를 지원하는 리소스에는 명시적 `tags` block을 둔다는 것이다. 실제 AWS 리소스에 태그가 반영되는 시점은 Terraform `plan/apply` 실행 이후다.

공통 태그는 provider `default_tags`로 적용한다.

| 태그 key | 값 |
| --- | --- |
| `Project` | `jungle-init` |
| `Environment` | main stack은 `dev` 또는 `main`, bootstrap stack은 `bootstrap` |
| `ManagedBy` | `terraform` |
| `Repository` | `var.github_repository` |
| `Owner` | main stack은 `A`, bootstrap stack은 `var.owner` 기본값 `A` |

리소스별 식별 태그는 공통 태그와 별도로 둔다.

| 태그 key | 사용 대상 | 목적 |
| --- | --- | --- |
| `Name` | 대부분의 태그 지원 리소스 | AWS Console, 비용 탐색, 운영 점검에서 사람이 식별 |
| `Tier` | subnet | `public`, `private-app`, `private-data` 구분 |
| `Service` | frontend/API/worker 관련 ECS, target group, security group rule, log group | 서비스별 비용과 장애 범위 추적 |
| `Component` | CloudWatch alarm 등 공통 감시 리소스 | `alb`, `sqs`, `rds`처럼 감시 대상 구분 |
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
| Observability | CloudWatch log group, CloudWatch metric alarm |
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
-> Route53
-> CloudFront
   -> /api/* behavior: ALB /api/* listener rule -> ECS API service
   -> default behavior: ALB default rule -> ECS frontend service

ECS frontend service
-> API calls through same domain /api/*

ECS API service
-> RDS PostgreSQL
-> ElastiCache Redis
-> S3
-> SQS
-> SES

ECS worker service
-> SQS polling
-> RDS PostgreSQL
-> S3
-> OpenAI/MediaPipe runtime dependency
```

사용자는 각 환경의 CloudFront에 연결된 단일 도메인만 바라본다. CloudFront와 ALB가 path 기준으로 frontend와 API를 나눈다. `dev`와 `main`은 같은 도메인을 공유하지 않고, 서로 다른 CloudFront/ECS/RDS/Redis/S3/SQS 세트를 가진다.

## 환경별 단일 도메인 + `/api/*`

단일 도메인 원칙은 환경마다 적용한다. 즉 `dev`와 `main`이 하나의 도메인을 서로 덮어쓰는 구조가 아니라, 각 환경 안에서 frontend와 API만 같은 도메인을 공유한다.

```text
https://dev.example.com/                 -> dev frontend
https://dev.example.com/api/v1/health    -> dev API

https://example.com/                     -> main frontend
https://example.com/api/v1/health        -> main API
```

이 방식의 핵심 이점은 브라우저가 frontend와 API를 같은 origin으로 본다는 점이다. CORS, cookie, OAuth callback, refresh token 처리가 단순해진다.

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

현재 frontend 코드는 `NEXT_PUBLIC_API_BASE_URL`을 사용해 `http://localhost:3001` 형태로 API를 호출한다. 단일 도메인 배포에서는 가능하면 `/api/v1` 같은 same-origin relative path로 정리하는 것이 좋다. 이 변경은 Docker 문서 반영이 아니라 frontend API client 수정 작업으로 분리한다.

## ECS subnet 결정

ECS task는 private subnet으로 확정한다.

| 구성 | Subnet |
| --- | --- |
| CloudFront | VPC 밖 global edge |
| ALB | public subnet |
| ECS frontend/API/worker task | private subnet |
| RDS PostgreSQL | private subnet |
| ElastiCache Redis | private subnet |
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

## dev, main 배포 정책

초기 환경은 `dev`와 `main` 두 개만 둔다. `staging`은 발표 전 리허설 또는 운영 검증 환경이 필요해지는 시점에 추가한다.

GitHub branch와 AWS environment는 1:1로 연결한다. AWS가 repository의 두 branch를 직접 감시하는 것이 아니라, GitHub Actions가 push/merge trigger를 받아 해당 branch에 맞는 AWS environment를 갱신한다.

| Git branch | AWS environment | 배포 정책 | Migration 정책 |
| --- | --- | --- | --- |
| Pull Request | 없음 | 배포하지 않음. test/build/docker build만 수행 | 실제 DB migration 없음. `prisma validate/generate`만 수행 |
| `dev` | dev | merge 후 자동 배포 | ECS one-off migration task 자동 실행 |
| `main` | main | workflow는 자동 시작, GitHub Environment approval 후 배포 | approval 후 ECS one-off migration task 실행 |

환경별 갱신 범위:

| Trigger | 갱신되는 AWS 리소스 | 갱신되지 않는 리소스 |
| --- | --- | --- |
| `dev` push/merge | `init-dev-*` ECR/ECS, dev RDS/Redis/S3/SQS, dev CloudFront | `init-main-*`, main CloudFront |
| `main` push/merge + approval | `init-main-*` ECR/ECS, main RDS/Redis/S3/SQS, main CloudFront | `init-dev-*`, dev CloudFront |

따라서 `dev`에 최신 commit이 배포되어도 main 도메인은 바뀌지 않는다. 반대로 `main` 배포가 승인되어도 dev 환경은 별도로 유지된다.

## 서비스별 자동 배포 흐름

GitHub Actions의 배포 workflow는 `docker-compose`를 생성해서 클라우드에 올리는 방식이 아니다. `Dockerfile`로 image를 만들고, ECR에 push한 뒤, ECS task definition의 image URI를 새 image tag로 바꾸어 새 revision을 등록한다. ECS service update 이후 새 task가 ALB target group health check를 통과하면 ECS가 기존 task를 자동으로 제거한다.

기본 흐름:

```text
git push / merge
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
| Merge to `dev` | 변경된 service만 dev ECR/ECS에 자동 배포 |
| Merge to `main` | workflow 시작 후 GitHub Environment approval 대기. A 승인 후 변경된 service만 main ECR/ECS에 배포 |

서비스별 변경 감지 기준:

| 변경 경로 | Build/Push 대상 | ECS update 대상 | 추가 절차 |
| --- | --- | --- | --- |
| `frontend/**`, `infra/docker/frontend.Dockerfile` | `init-{env}-frontend` | `init-{env}-frontend` | frontend smoke test |
| `backend/api/**`, `infra/docker/api.Dockerfile` | `init-{env}-api` | `init-{env}-api` | migration task 실행 후 API service update |
| `backend/common/**` | `init-{env}-api` | `init-{env}-api` | API가 `@init/common`을 참조하므로 API image 재빌드 |
| `backend/worker/**`, `infra/docker/worker.Dockerfile` | `init-{env}-worker` | `init-{env}-worker` | worker startup log 확인 |
| `backend/api/prisma/**` | `init-{env}-api`, `init-{env}-worker` | `init-{env}-api`, `init-{env}-worker` | API image 기반 migration task 실행. worker가 API generated Prisma Client를 포함하므로 worker도 재빌드 |
| `.env.example` | image build는 변경 service 기준 | 필요 service만 update | Secrets Manager key validation. secret mapping 자체 변경은 Terraform PR로 처리 |
| `infra/aws/**` | 없음 | 없음 | Terraform plan/apply 대상. application image deploy workflow와 분리 |

ECR image tag는 mutable한 `latest`를 배포 기준으로 쓰지 않는다. 기본 tag는 `github.sha`를 사용하고, 필요하면 사람이 보기 쉬운 branch alias tag를 추가로 붙인다. ECS task definition에는 항상 immutable한 SHA tag image URI를 반영한다.

예를 들어 팀원이 API 코드만 수정해 `dev`에 merge하면 자동화는 아래처럼 동작한다.

```text
backend/api/** 변경 감지
-> infra/docker/api.Dockerfile 기준 Docker build
-> ECR init-dev-api:<github.sha> push
-> init-dev-api task definition 새 revision 등록
-> npx prisma migrate deploy one-off task 실행
-> init-dev-api ECS service update
-> ALB /api/v1/health target health check
-> dev smoke test 통과
```

`main` 배포 approval은 GitHub Environment protection으로 처리한다. A가 단독으로 승인할 수 있게 설정하고, PM 검토는 발표/검증 관점의 선택 절차로 둔다. 즉 production 배포를 위해 PM 승인이 항상 필수인 구조는 아니다.

Production 배포 절차:

```text
1. PR -> dev merge
2. dev 환경 자동 배포와 smoke test 통과 확인
3. dev에서 검증된 commit을 main으로 PR 생성
4. main PR 리뷰 및 merge
5. GitHub Actions production deploy workflow 자동 시작
6. workflow가 production environment approval에서 대기
7. A가 CI 결과, migration 여부, package/env 변경, dev 검증 결과 확인
8. A가 GitHub UI에서 Approve
9. workflow가 main 환경 migration task 실행
10. migration 성공 후 ECS service update
11. smoke test 통과 후 배포 완료
```

A approval 체크리스트:

| 확인 항목 | 확인 방법 |
| --- | --- |
| CI 통과 | GitHub checks 확인 |
| Docker image build 성공 | deploy workflow build step 확인 |
| package 변경 여부 | `package.json`, `package-lock.json` diff 확인 |
| DB schema/migration 변경 여부 | `backend/api/prisma/schema.prisma`, `migrations/*` diff 확인 |
| migration 위험도 | destructive SQL 여부 확인 |
| env/secret 변경 여부 | `.env.example` diff와 Secrets Manager key 존재 여부 확인 |
| dev 배포 검증 | dev smoke test와 주요 화면 확인 |

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

Secrets Manager 경로는 branch와 맞춘다.

| Secret group | 대상 service | 예시 |
| --- | --- | --- |
| `init/dev/frontend` | frontend | `NODE_ENV`, `PORT` |
| `init/dev/api` | API | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `SMTP_*`, `S3_BUCKET`, `SQS_QUEUE_URL` |
| `init/dev/worker` | worker | `DATABASE_URL`, `S3_BUCKET`, `SQS_QUEUE_URL`, `OPENAI_API_KEY`, `WORKER_*` |
| `init/main/frontend` | frontend | main frontend runtime env |
| `init/main/api` | API | main API runtime env |
| `init/main/worker` | worker | main worker runtime env |

배포 전 secret 검증은 `.env.example`에 있는 키 중 service별로 필요한 키가 Secrets Manager에 존재하는지 확인하는 방식으로 둔다. 실제 값은 Git에 저장하지 않는다.

SES는 초기에는 현재 API 코드 변경 범위를 줄이기 위해 SES SMTP endpoint를 사용한다. 현재 API는 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` 환경변수를 사용한다. AWS SDK SES client로 전환하는 작업은 별도 refactoring으로 분리한다.

## 실패 모드와 제어

| 실패 모드 | 제어 |
| --- | --- |
| 새 task health check 실패 | ECS deployment circuit breaker rollback |
| DB migration 실패 | ECS service update 전 중단, 기존 service 유지 |
| frontend/API env 불일치 | smoke test에서 `/api/v1/health`, 주요 화면 접근 확인 |
| SQS worker 장애 | CloudWatch alarm, DLQ 후속 도입 |
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

남은 release risk는 실제 cloud deploy workflow가 아직 없다는 점이다. 따라서 현재 Docker build 통과는 image 계약 검증일 뿐, ECR push, ECS service update, ALB target health, CloudFront invalidation 성공을 의미하지 않는다.

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

## 다음 작업 단위

1. AWS 리소스 초안 검증과 적용 준비
   - `infra/aws` Terraform fmt/validate/plan 검증
   - bootstrap state bucket 생성 여부 확인
   - dev/main backend config의 account id 반영
   - GitHub OIDC provider가 이미 있는 AWS 계정이면 import 여부 확인
   - Secrets Manager 실제 값 seed 절차 정리

2. CI/CD 배포 workflow
   - GitHub OIDC IAM role
   - service별 변경 감지
   - ECR push
   - ECS task definition image URI 갱신
   - Secrets Manager key validation
   - ECS one-off migration task
   - ECS service update
   - ALB target group health check 대기
   - CloudFront invalidation
   - smoke test

## 후속 결정

| 질문 | 현재 권장 | 결정 필요 시점 |
| --- | --- | --- |
| staging 환경을 추가할까? | 초반에는 dev + main만 사용 | 발표/운영 리허설 환경이 필요할 때 |
| destructive migration 허용 기준 | 별도 리뷰 필요 | 실제 destructive migration이 등장할 때 |
| 로컬 app compose를 추가할까? | Docker build 안정화 후 추가 | AWS-like local smoke test가 필요할 때 |
| PM approval을 필수로 둘까? | 현재는 필수 아님. A 단독 승인 가능 | 팀 운영상 PM gate가 필요해질 때 |

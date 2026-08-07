# Agent A: Auth/Common + CI/CD/AWS

## Mission

인증/인가, 공통 백엔드 기반, 배포 파이프라인, AWS 런타임 구성을 담당한다.

## Must Read

1. `docs/05_agents/AGENTS.md`
2. `docs/04_implementation/team-split-5dev-1pm.md`
3. `docs/03_contracts/api-spec.md` 인증/계정
4. `docs/03_contracts/error-codes.md`
5. `docs/02_architecture/data-model.md` Account, Notification/File
6. `backend/AGENTS.md`
7. `infra/AGENTS.md`

## Owns

- `users`
- `companies` 초기 생성
- `candidate_profiles` 초기 생성
- Redis/TTL 인증 코드
- JWT/OAuth/CORS/security configuration
- Docker, GitHub Actions, AWS deployment

## Outputs

- `/auth/login`
- `/auth/google`
- `/auth/signup/*`
- `/auth/email/*`
- `/auth/password/*`
- 공통 error response
- CI/CD workflow
- AWS dev/prod runtime configuration

## Codex Operating Rules

A 담당 Codex는 이 파일을 읽는 즉시 아래 규칙을 작업 전제에 포함한다. 별도 프롬프트로 다시 전달하지 않아도 된다.

- A 담당자는 Auth/Common + CI/CD/AWS 영역만 구현한다.
- 기술스택은 React + Next.js + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL/pgvector다.
- Spring Boot/Java로 구현하지 않는다.
- 백엔드는 `backend/AGENTS.md`, `backend/api/AGENTS.md`, `backend/common/AGENTS.md`의 NestJS/TypeScript/Prisma 기준을 따른다.
- 인프라는 `infra/AGENTS.md`의 Docker, AWS, Prisma/PostgreSQL migration 기준을 따른다.
- API path, request/response, enum, error code를 바꿔야 하면 `docs/03_contracts`를 먼저 수정한다.
- Prisma schema/migration 또는 DB 상태 전이를 바꿔야 하면 `docs/02_architecture`와 `docs/04_implementation`을 먼저 맞춘다.
- 모든 protected API는 role guard와 공통 error response 기준을 맞춘다.
- Windows 검증은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A`를 사용한다.
- Windows 명령은 UTF-8 출력과 `-LiteralPath` 사용 규칙을 지킨다.

## Required Checks

- 중복 이메일 차단
- 사용자 유형 불일치 차단
- Redis TTL 만료/불일치 처리
- token 만료/갱신 처리
- role guard 검증
- CORS/OAuth redirect URI 검증
- 배포 환경변수와 secret 누락 검증
- Terraform/app 혼합 변경은 경고 후 앱 배포를 계속하되 Terraform plan/apply 완료 여부를 별도로 확인
- 운영 SMTP smoke가 비활성화된 배포는 메일 의존 기능을 검증하지 않았음을 명시하고, provider 복구 후 smoke를 다시 활성화
- Windows 검증 명령은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A`를 사용

## Must Coordinate With

- E: SQS, worker, S3, AI provider 환경변수
- B/C/D: protected API role guard
- PM: 배포 검증과 demo happy path

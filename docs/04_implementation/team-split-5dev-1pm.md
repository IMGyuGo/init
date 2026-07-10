# Team Split: 5 Developers + 1 PM

6명 중 1명이 발표/검증 PM을 맡는 전제로, 개발 5명은 기능 도메인 중심으로 나눈다.

## Roles

| Member | Role | Scope | Main Tables/APIs |
| --- | --- | --- | --- |
| A | Auth/Common + CI/CD/AWS | 로그인, 회원가입, 이메일 인증, 비밀번호 재설정, JWT/권한, 공통 에러, Docker, GitHub Actions, AWS 배포 | `users`, `companies`, `candidate_profiles`, Redis, `/auth/*`, ECR, ECS, CloudFront, RDS PostgreSQL, Redis, S3, SQS |
| B | Company Recruiting | 기업 공고, 공고 상세, 지원자 등록/CSV, 초대 메일, 전형 상태 | `postings`, `applications`, `notifications`, `/company/recruitments`, `/company/applicants` |
| C | Company Interview/Criteria | 면접 설정, 평가 기준, 질문 뱅크, JD 기반 질문 생성 요청부 | `criterion_tags`, `evaluation_criteria`, `question_bank`, `/company/interviews/*` |
| D | Candidate/Application/Interview | 공고 조회, 지원서 제출, 지원현황, 모의/채용 면접 진행, 답변 업로드 | `applications`, `application_documents`, `interview_sessions`, `interview_session_questions`, `interview_answers`, `/candidate/*` |
| E | AI Report/Pipeline | 서류 추출, STT, 꼬리질문, 리포트 생성, 가드레일, 임베딩, worker/SQS 연동 | `ai_process_logs`, `ai_guardrail_logs`, `evaluation_reports`, `report_scores`, `report_evidences`, `embeddings`, `/reports/*`, `/ai/*` |
| PM | 발표/검증 PM | 요구사항 우선순위, API 계약 변경 관리, 테스트 시나리오, 발표 자료, 데모 플로우, QA 체크리스트, PR 검증 기준 | `docs/*`, 발표/검증 산출물 |

## Local OS Baseline

| Member | Local OS | Required Harness Command |
| --- | --- | --- |
| A | Windows 기준 | `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A` |
| B | macOS | `bash scripts/check-local.sh -Role B` |
| C | Windows 기준 | `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role C` |
| D | Windows 기준 | `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D` |
| E | Windows 기준 | `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role E` |
| PM | Windows 기준 | `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role PM` |

B 담당자의 macOS 환경은 PowerShell Core 설치를 요구하지 않는다. B가 Codex에 작업을 맡길 때도 검증 명령은 `bash scripts/check-local.sh -Role B`를 기준으로 한다.

## Package Version Baseline

팀원은 PR을 pull 받은 뒤 각 패키지에서 `npm install`로 버전을 재해석하지 않고 `npm ci`를 사용한다. dependency version은 `package.json`에 exact version으로 고정하고, `package-lock.json`을 함께 커밋한다.

| Package | Key Versions |
| --- | --- |
| `frontend` | Next `16.2.9`, React `19.2.7`, TypeScript `5.9.3`, ESLint `9.39.4` |
| `backend/api` | NestJS `11.1.27`, AWS SDK S3/SQS `3.1075.0`, Prisma/Prisma Client `6.19.3`, TypeScript `5.9.3`, tsx `4.22.4` |
| `backend/worker` | OpenAI `6.45.0`, AWS SDK S3/SQS `3.1075.0`, MediaPipe Tasks Vision `0.10.35` |
| `backend/common` | class-validator `0.15.1`, class-transformer `0.5.1`, TypeScript `5.9.3` |

Prisma는 MVP 기간 동안 `prisma`와 `@prisma/client`를 모두 `6.19.3`으로 고정한다. Prisma 7 전환은 별도 합의 PR로만 진행한다.

### Exact Package Versions

- Runtime은 Node.js `20.x`, npm `>=10`을 기준으로 한다.
- `frontend`: `next` `16.2.9`, `react` `19.2.7`, `react-dom` `19.2.7`, `@types/node` `20.19.43`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, `eslint` `9.39.4`, `eslint-config-next` `16.2.9`, `typescript` `5.9.3`
- `backend/api`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@nestjs/common` `11.1.27`, `@nestjs/config` `4.0.4`, `@nestjs/core` `11.1.27`, `@nestjs/jwt` `11.0.2`, `@nestjs/platform-express` `11.1.27`, `@prisma/client` `6.19.3`, `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `reflect-metadata` `0.2.2`, `rxjs` `7.8.2`, `@types/node` `20.19.43`, `prisma` `6.19.3`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/worker`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@mediapipe/tasks-vision` `0.10.35`, `openai` `6.45.0`, `@types/node` `20.19.43`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/common`: `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `@types/node` `20.19.43`, `typescript` `5.9.3`

### Dependency Change Rules

- 의존성 추가/변경은 담당자가 단독으로 확정하지 않고 A 또는 PM 리뷰를 받는다.
- 의존성 변경 PR은 변경 사유, 영향 package, lockfile 변경 여부를 PR 본문에 적는다.
- `npm install`로 lockfile이 재해석된 diff는 그대로 병합하지 않는다. 합의된 exact version을 `package.json`에 먼저 반영하고 `npm ci` 기준으로 검증한다.
- `package.json`을 바꾸는 PR은 같은 package의 `package-lock.json`을 함께 갱신한다.
- package baseline 자체를 바꾸는 경우 `docs/04_implementation/team-split-5dev-1pm.md`, `docs/04_implementation/one-time-alignment/agent-*.md`, `scripts/verify-package-baseline.*`를 같은 PR에서 함께 수정한다.

## One-Time Alignment Workflow

현재 구현이 이미 시작되었을 수 있으므로 팀원은 본인 담당 영역을 수정하기 전에 `docs/04_implementation/one-time-alignment/agent-<role>.md`를 Codex에 한 번 전달해 실행한다.

| Member | One-Time Instruction |
| --- | --- |
| A | `docs/04_implementation/one-time-alignment/agent-a.md` |
| B | `docs/04_implementation/one-time-alignment/agent-b.md` |
| C | `docs/04_implementation/one-time-alignment/agent-c.md` |
| D | `docs/04_implementation/one-time-alignment/agent-d.md` |
| E | `docs/04_implementation/one-time-alignment/agent-e.md` |
| PM | `docs/04_implementation/one-time-alignment/agent-pm.md` |

각 지시서는 1회용이다. 반영 후에는 코드와 기존 문서가 기준이 되며, CI의 baseline 검증이 기준 위반을 차단한다.

## Baseline Change Protocol

baseline 변경은 원타임 지시서를 다시 실행하기 위한 작업이 아니라, 기준 자체를 바꾸는 PR이다. 따라서 baseline 변경 PR은 변경 대상에 따라 아래 파일을 같은 PR에서 함께 수정한다.

| Change Type | Required Files |
| --- | --- |
| API response, pagination, route, request/response 계약 | `docs/03_contracts/api-spec.md`, 관련 `docs/04_implementation/one-time-alignment/agent-*.md`, `scripts/verify-baseline.*` |
| API module ownership 또는 route distribution | `docs/03_contracts/api-index.md`, `docs/04_implementation/module-boundaries.md`, 관련 `agent-*.md`, `scripts/verify-baseline.*` |
| enum 또는 status transition | `docs/03_contracts/enums.md`, `docs/02_architecture/data-model.md` 필요 시, 관련 `agent-*.md`, `scripts/verify-baseline.*` |
| DTO naming/location 또는 permission matrix | `docs/04_implementation/module-boundaries.md`, 관련 `agent-*.md`, `scripts/verify-baseline.*` |
| package version baseline | `package.json`, `package-lock.json`, `docs/04_implementation/team-split-5dev-1pm.md`, 모든 `agent-*.md`, `scripts/verify-package-baseline.*` |
| CI/harness behavior | `.github/workflows/ci.yml`, `docs/04_implementation/test-strategy.md`, 관련 `scripts/*`, 관련 `agent-*.md` |

원본 문서와 원타임 지시서가 다르면 원본 문서를 우선한다. 단, PR은 원타임 지시서와 verify script까지 동기화된 상태에서만 통과해야 한다. `verify-baseline.*`와 `verify-package-baseline.*`는 알려진 baseline 섹션과 version이 원본 문서, 원타임 지시서, 실제 package 파일에 함께 반영되었는지 확인한다.

## Tech Stack

아래 스택을 MVP 개발 기준으로 사용한다. 실제 팀 결정이 달라지면 이 표를 먼저 갱신한 뒤 구현한다.

| Area | Stack | Owner | Notes |
| --- | --- | --- | --- |
| Frontend | React + Next.js + TypeScript | B/C/D | 기업/지원자 화면 구현. Next.js App Router, API client, 상태 관리 규칙은 초기에 공통화한다. |
| Runtime | Node.js 20 LTS | A | frontend, backend/api, backend/worker의 공통 실행 기반이다. `.nvmrc`와 `.node-version`을 함께 유지한다. |
| Package Manager | npm | A | 모든 package는 `package-lock.json`과 `npm ci` 기준으로 설치/검증한다. pnpm/yarn/bun은 팀 합의 전 사용하지 않는다. |
| Backend API | NestJS + TypeScript | A/B/C/D/E | REST API, 인증/인가, 도메인 비즈니스 로직 구현. |
| ORM | Prisma | A/B/C/D/E | PostgreSQL schema/migration/client generation 기준이다. |
| Database | PostgreSQL + pgvector | A/E | `docs/02_architecture/data-model.md` 기준. 리포트/질문/증거 임베딩은 pgvector 사용을 전제로 설계한다. |
| Cache | Redis | A | 이메일 인증 코드 TTL, 임시 상태, rate limit 보조 용도. |
| Object Storage | AWS S3 | A/D/E | 이력서, 포트폴리오 첨부, 면접 영상/음성 원본 저장. 원본 파일은 DB에 저장하지 않는다. |
| Async Queue | AWS SQS | A/E | STT, 서류 추출, 꼬리질문, 리포트 생성 등 장기 작업 큐. |
| Worker | NestJS worker 또는 Node.js worker process | E | `ai_process_logs` 상태 전이를 소유한다. API 서버와 장기 AI 작업을 분리한다. |
| AI Services | OpenAI Agents SDK, GPT-4 class model, MediaPipe | E | STT, 질문 생성, 평가/리포트 생성, 임베딩, 미디어 분석 전처리. prompt/model/tool version 관리가 필요하다. |
| CI/CD | GitHub Actions | A | test/build, Docker image build, AWS 배포 자동화. |
| Deployment | AWS ECR + ECS + CloudFront + S3 | A | frontend/API/worker는 ECS 기준으로 배포한다. CloudFront는 단일 도메인 진입점이고, S3는 사용자 업로드 파일/object storage 용도로 사용한다. |
| Container | Docker | A | 로컬/배포 실행 환경을 맞춘다. |
| Test | npm scripts, Jest/Vitest, Playwright/API/E2E 테스트 | 각 담당자, PM 검증 | 각 담당 API 단위 테스트와 핵심 happy path 검증. |

## Rationale

기업 영역을 한 명에게 모두 몰면 범위가 커진다. 따라서 기업 쪽은 `공고/지원자 운영`과 `면접 설정/평가 기준`으로 나눈다.

지원자 영역은 화면 수는 많지만 `공고 조회 -> 지원서 제출 -> 지원현황 -> 면접 진행` 흐름이 이어지므로 한 명이 end-to-end로 잡는 편이 낫다.

AI 처리는 일반 API와 병목 성격이 다르다. STT, 꼬리질문, 리포트 생성, 가드레일, 임베딩은 별도 담당자가 큐/worker 기반으로 묶어서 관리한다.

CI/CD와 AWS 배포는 A가 1차 담당한다. 인증/인가, JWT/OAuth, CORS, HTTPS, secret, Redis 인증 코드가 모든 API의 앞단에 걸리므로 배포 런타임 안정성은 Auth/Common 담당자가 소유하는 편이 명확하다.

E는 AI worker, SQS 작업 메시지, S3 파일 참조, AI provider 환경변수, 비동기 처리 상태 전이를 A와 함께 검증한다. PM은 배포 성공 여부와 데모 시나리오를 검증한다.

## MVP Priority

1. A: 인증/권한과 배포 뼈대 먼저 완성
2. B: 기업 공고/지원자 등록/초대
3. D: 지원자 공고 조회/지원서 제출/면접 세션 진행
4. C: 평가 기준/질문 뱅크/면접 설정
5. E: 비동기 AI 처리와 리포트 생성

## Collision Points

### `applications`

B와 D가 함께 사용한다.

- B: 기업 관점 전형 판정, 지원자 관리, 초대 상태
- D: 지원자 제출, 응시 상태, 지원현황

상태 전이 규칙은 구현 전에 문서로 합의해야 한다.

### `interview_sessions`, `interview_session_questions`, `interview_answers`

D와 E가 함께 사용한다.

- D: 세션 진행, 세션별 질문 순서, 질문 이동, 답변 파일 저장
- E: STT, 분석, 꼬리질문, 리포트 생성

D는 면접 런타임까지, E는 AI 분석 이후를 담당한다.

### `question_bank`, `evaluation_criteria`

C와 E가 함께 사용한다.

- C: 설정 CRUD, 질문 뱅크 관리, 평가 기준 관리
- E: AI 생성/추천 결과 저장 규칙, 리포트 평가 기준 사용

## Branch Strategy

```text
dev
feature/auth-common
feature/company-recruiting
feature/company-interview-criteria
feature/candidate-application-interview
feature/ai-report-pipeline
feature/infra-cicd
```

각 개발자는 담당 feature 브랜치에서 작업하고, PR은 `dev`로 보낸다. PM은 기능 기준으로 PR을 검증하고, 발표 데모 흐름을 고정한다.

## Demo Flow

발표 데모는 다음 happy path를 기준으로 한다.

```text
회원가입 -> 기업 공고 생성 -> 지원자 지원 -> AI 면접 -> 리포트 확인
```

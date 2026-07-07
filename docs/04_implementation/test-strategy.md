# Test Strategy

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

모듈별 검증 범위와 회귀 테스트 기준을 정의한다.

| Layer | Target | Required Checks |
| --- |--- |--- |
| Contract | API request/response shape | 03_contracts/api-spec.md 기준 path/method/status 검증 |
| Unit | Module business rules | 상태 전이, 권한, validation, enum mapping |
| Integration | DB and storage | FK 관계, 파일 메타 저장, Redis 인증 코드 TTL |
| E2E | User journeys | 회원가입/로그인, 기업 초대, 지원자 제출, 면접 진행, 리포트 조회 |
| Async | AI process state | PENDING -> RUNNING -> COMPLETED/FAILED, retry, guardrail blocked |
| Security | Access control | 기업 간 공고/지원자 접근 차단, 지원자 본인 데이터 제한 |
| Privacy | Consent and retention | 동의 없을 때 분석 차단, 삭제/보관 정책 검증 |

## Local Harness

GitHub Actions가 없어도 로컬에서 최소 검증을 강제하기 위한 진입점은 OS별로 나눈다. Windows는 `scripts/check-local.ps1`, macOS/Linux는 `scripts/check-local.sh`를 사용한다.

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A
```

```bash
# macOS/Linux
bash scripts/check-local.sh -Role B
```

| Harness | Purpose | Skip Rule |
| --- | --- | --- |
| `verify-docs.ps1` | 필수 문서, API 계약, ERDCloud SQL, 목표 폴더 구조 확인 | 핵심 문서는 없으면 실패 |
| `verify-baseline.ps1` | 구현 baseline 문서 반영, backend/frontend skeleton, 공통 위치, schema naming guard 확인 | 문서/필수 skeleton은 없으면 실패. `schema.prisma`가 있으면 model/enum 이름까지 실패 처리 |
| `verify-package-baseline.ps1` | 패키지별 `package.json`/`package-lock.json` 존재와 정확한 dependency version 확인 | baseline 버전이 다르면 실패 |
| `verify-ownership.ps1` | 역할별 허용 경로 외 변경 감지 | `-SkipOwnership` 지정 시 생략 |
| `docs/04_implementation/ownership-map.json` | PowerShell/bash ownership 검증의 단일 경로 기준 | 새 role/path 추가 시 관련 owner 리뷰 필요 |
| `verify-prisma.ps1` | Prisma schema validate, migration 폴더 확인 | schema가 아직 없으면 skip |
| `verify-docker.ps1` | Dockerfile 기본 구조와 선택적 build 확인 | Dockerfile이 아직 없으면 skip |
| `verify-env.ps1` | 필수 환경변수 이름 확인 | env example이 아직 없으면 skip |
| `verify-dev-auth-seed.ps1` | Dev Auth 계약과 Prisma seed 골격 확인 | seed 골격은 없으면 실패 |
| `verify-ai-golden.ps1` | AI golden case JSON shape 확인 | golden case가 없으면 skip |
| `smoke-local.ps1` | 실행 중인 API `/health` 확인 | base URL 없으면 skip |
| `e2e-auth.ps1` | T1/M1 인증 플로우(회원가입, 로그인, 비밀번호 재설정, Google 지원자 전용 정책) 확인 | 로컬 API, 프론트엔드, Mailpit이 실행 중이어야 함 |

macOS/Linux의 `check-local.sh`는 PowerShell Core 설치를 요구하지 않고 bash, git, grep/find/sed/awk, curl 또는 Node.js만 사용한다. 실행 권한(`chmod +x`)에 의존하지 않도록 문서상 표준 명령은 `bash scripts/check-local.sh`로 둔다. B 담당자는 macOS 사용자이므로 `bash scripts/check-local.sh -Role B`를 기본 검증 명령으로 사용한다.

pre-commit hook은 선택 사항이다. 설치하면 commit 전에 같은 Harness를 실행한다.

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-hooks.ps1 -Role A
```

```bash
# macOS/Linux
bash scripts/install-hooks.sh -Role B
```

## macOS Developer Requirements

Node.js가 설치되어 있다는 전제에서, macOS 개발자가 추가로 준비해야 하는 것은 작업 범위에 따라 다르다.

| 작업 | 추가 준비 | 이유 |
| --- | --- | --- |
| B 담당 문서/계약/폴더 구조 harness 실행 | 없음 | `bash scripts/check-local.sh -Role B`가 macOS 기본 도구와 Node.js만 사용한다. PowerShell/pwsh는 필요하지 않다. |
| Next.js/NestJS 앱 build/test | `npm ci` | 프로젝트 의존성은 저장소에 커밋하지 않으므로 각 package에서 설치해야 한다. |
| Prisma schema validate/generate | `npm ci` 이후 로컬 Prisma CLI | Prisma CLI는 프로젝트 dependency로 관리한다. 전역 설치는 요구하지 않는다. |
| Docker 기반 PostgreSQL/Redis/LocalStack 실행 | Docker Desktop 또는 호환 Docker Engine | DB, Redis, S3/SQS 로컬 대체 환경은 컨테이너 런타임이 필요하다. |
| 실제 AWS/OpenAI 호출 | 로컬 env 값 또는 팀 secret 주입 | 외부 서비스 인증 정보는 Git에 저장하지 않는다. |

macOS 호환성은 `.github/workflows/ci.yml`의 `macos-latest` B harness job으로 강제한다. 이 job은 PowerShell/pwsh 없이 Node.js 20을 준비하고, `backend/api/package-lock.json`이 있을 때만 `npm ci --prefix backend/api`를 실행한 뒤 `bash scripts/check-local.sh -Role B`를 실행해야 한다.

## CI Baseline Source

CI는 특정 개발자 로컬 폴더를 스냅샷으로 저장해 비교하지 않는다. GitHub Actions는 `actions/checkout`으로 현재 push commit 또는 PR merge commit을 checkout한 뒤, 저장소 안의 문서, package 파일, 스크립트를 기준으로 검증한다.

- `pull_request`는 `dev`를 target branch로 하는 PR에서 실행한다.
- 팀 개발 기준 branch는 `dev`이며, 기능 PR은 `dev`를 base branch로 둔다.
- PR 검증은 GitHub가 만든 PR head와 base branch의 merge 결과를 기준으로 실행되므로, 로컬에만 있고 commit되지 않은 파일은 CI 기준에 포함되지 않는다.
- baseline 변경은 로컬 상태가 아니라 PR에 포함된 `docs/*`, `package.json`, `package-lock.json`, `scripts/*`, `.github/workflows/*` 파일로만 확정된다.

## Verification Promotion Gates

초기에는 일부 검증이 산출물 부재로 skip될 수 있다. 아래 조건이 충족되는 PR부터는 skip을 유지하지 말고 실제 검증으로 전환한다.

| Gate | Current Risk | Required Promotion Trigger | Owner |
| --- | --- | --- | --- |
| npm scripts | placeholder `typecheck`/`lint`/`test`/`build`가 실제 오류를 잡지 못함 | 각 package에 첫 실제 TS/React/Nest/worker 코드가 추가되는 PR | 해당 package 수정자, PM 확인 |
| Prisma | `schema.prisma`가 없으면 DB naming 검증 skip | A가 Prisma schema 또는 migration을 추가하는 PR | A |
| Docker | `infra/docker/*.Dockerfile` 기준 image 계약 검증 활성화 | Dockerfile, build context, package/runtime 의존성 변경 PR | A |
| Smoke | `SMOKE_BASE_URL`이 없으면 `/health` 검증 skip | API 서버에 `/health` 또는 equivalent health endpoint가 추가되는 PR | A, PM |
| AI golden | golden case가 없으면 AI 결과 구조 검증 skip | E가 AI report/pipeline fixture 또는 sample output을 추가하는 PR | E |
| npm audit | 보안 경고가 merge blocker인지 불명확 | MVP 보안 기준을 확정하는 PR | PM, A |

skip이 남아 있는 PR은 PR 본문에 skip 사유와 실제 검증 전환 예정 PR을 적는다.

## Docker Deployment Contract Checks

Dockerfile이 추가되었으므로 Docker 검증은 단순 문법 확인에서 production image 계약 검증으로 승격된 상태다. 로컬 개발 방식은 계속 `npm run dev`와 `infra/local/docker-compose.yml`을 사용하지만, AWS/ECS 배포 가능성은 Docker build로 별도 검증한다.

| Check | 기준 | 실패 의미 |
| --- | --- | --- |
| Dockerfile syntax baseline | 모든 `infra/docker/*.Dockerfile`에 `FROM` 존재 | Dockerfile 기본 구조가 깨짐 |
| Docker build context | repo root `.` | `backend/common`, Prisma schema, package lockfile 같은 cross-package 의존성을 못 가져올 수 있음 |
| Frontend image build | `infra/docker/frontend.Dockerfile` | Next.js SSR standalone build 계약이 깨짐 |
| API image build | `infra/docker/api.Dockerfile` | NestJS build, `@init/common`, Prisma Client 생성 계약이 깨짐 |
| Worker image build | `infra/docker/worker.Dockerfile` | worker runtime 또는 API generated Prisma Client 포함 계약이 깨짐 |

Docker 배포 준비 변경 PR부터는 아래 명령을 A 담당 검증에 포함한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-docker.ps1 -Build
```

`.github/workflows/ci.yml`의 `docker-build` job, `scripts/verify-docker.ps1 -Build`, `scripts/check-local.sh --build-docker`는 모두 Dockerfile이 위치한 디렉터리가 아니라 repo root를 build context로 사용해야 한다. Dockerfile은 AWS production image 계약이고, 로컬 개발 방식을 대체하지 않는다.

## Cloud Deploy Contract Checks

Docker build 검증은 image가 만들어지는지 확인하는 단계이고, cloud deploy 검증은 새 image가 실제 ECS service로 안전하게 교체되는지 확인하는 단계다. 배포 workflow가 추가되면 `dev` merge와 `main` merge 모두 같은 `main` 실배포 환경에서 아래 기준을 확인한다.

| Check | 기준 | 실패 의미 |
| --- | --- | --- |
| Merged PR guard | commit association 또는 merged PR `merge_commit_sha`로 target branch PR merge 여부 확인 | PR merge push를 direct push로 오판하거나 direct push 배포를 허용 |
| Changed service detection | 변경 경로에 맞는 service만 build/push/update | 불필요한 service 재시작 또는 필요한 service 누락 |
| ECR push | `init-main-frontend`, `init-main-api`, `init-main-worker`에 `github.sha` tag push | ECS가 새 image를 pull할 수 없음 |
| ECS task definition revision | 기존 task definition 기반으로 image URI만 새 SHA tag로 갱신 | env, secret, IAM, log 설정 drift 가능 |
| Migration gate | API/Prisma 변경 시 service update 전 `npx prisma migrate deploy` one-off task 성공 | 새 application code와 DB schema 불일치 |
| ECS service stability | `aws ecs wait services-stable` 또는 동등한 대기 | 새 task가 정상 기동하지 않음 |
| ALB health check | API는 `/api/v1/health`, frontend는 `/` 접근 확인 | target group이 새 task를 healthy로 보지 않음 |
| Worker verification | worker ECS running task와 CloudWatch startup log 확인 | worker가 SQS polling을 시작하지 못함 |
| Deploy concurrency | `dev`/`main` deploy workflow가 같은 concurrency group을 사용 | 같은 실배포 환경에 동시 service update가 겹침 |

cloud deploy workflow는 production 배포를 `docker-compose`로 수행하지 않는다. `docker-compose`는 후속 local AWS-like smoke test 용도이고, 실제 AWS 배포 기준은 ECR image, ECS task definition, ECS service, ALB target group이다.

## Critical E2E Scenarios

- 기업 회원가입 -> 로그인 -> 공고 관리 진입
- T1/M1 인증: 기업/지원자 회원가입 -> 로그인 -> 기본 화면 진입, 지원자 비밀번호 재설정, Google 로그인 지원자 전용 정책
- 기업 공고 상세 -> 지원자 등록 -> 초대 링크 발송 -> 면접 세션 생성
- 지원자 회원가입 -> 회사 리스트 -> 회사 상세 -> 기업별 이력서 제출
- 지원현황 -> 동의 -> 장치 점검 -> 채용 AI 면접 시작 -> 답변 저장 -> 완료
- AI 처리 실패 시 리포트 생성 실패 상태와 재시도 안내 표시
- 채용 리포트는 기업 상세에는 전체 노출, 지원자 결과 화면에는 제한 노출

## Harness

초기 구현 전에는 문서/계약/폴더 구조 하네스를 먼저 유지한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A
```

이 하네스는 다음을 검증한다.

- 필수 `AGENTS.md`와 담당자별 agent 문서 존재
- 기술스택 기준 폴더 구조 존재
- baseline 기준 문서 반영 여부, backend module skeleton, frontend feature skeleton, backend common enum/DTO/error 위치
- `schema.prisma`가 존재하는 경우 Prisma model/enum baseline과 금지 이름
- 패키지별 version baseline과 `package-lock.json` 존재 여부
- `api-index.md`와 `api-spec.md`의 API ID 정합성
- ERDCloud SQL의 필수 테이블 존재
- ERDCloud SQL이 `docs/02_architecture/erdcloud`에 위치하는지 여부
- role별 허용 경로 밖의 생성/수정/삭제 감지
- ownership 기준은 `docs/04_implementation/ownership-map.json`에서 읽고 PowerShell/bash harness가 같은 map을 사용
- Prisma schema/migration 준비 상태
- Dockerfile 존재 시 최소 문법과 선택적 build
- `.env.example` 필수 변수명
- AI golden case 구조
- `SMOKE_BASE_URL` 설정 시 `/health` smoke test

애플리케이션 코드가 추가되면 이 하네스에 backend test, frontend test, migration validation, smoke test를 단계적으로 연결한다.

### Local Ownership Guard

현재 GitHub Actions나 branch protection을 사용하지 않는 전제에서는 로컬 ownership guard를 실수 방지 장치로 사용한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-ownership.ps1 -Role A -IncludeUntracked
```

pre-commit hook은 선택적으로 설치한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-hooks.ps1 -Role A
```

로컬 hook은 우회 가능하므로 보안 경계가 아니다. 모든 Codex 작업자는 최종 답변에 실행한 하네스 명령과 결과를 보고한다.

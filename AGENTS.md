# AGENTS

이 파일은 프로젝트 루트의 공통 AI/개발 운영 규칙이다. 모든 작업자는 작업 전에 이 파일과 담당 영역의 `AGENTS.md`를 먼저 확인한다.

## Project Stack

- Frontend: React + Next.js + TypeScript
- Runtime: Node.js 20 LTS
- Package Manager: npm
- Backend API: NestJS + TypeScript
- ORM: Prisma
- Database: PostgreSQL
- Vector Extension: pgvector
- Cache: Redis
- Object Storage: AWS S3
- Async Queue: AWS SQS
- Worker: NestJS worker 또는 Node.js worker process
- AI Services: OpenAI Agents SDK, GPT-4 class model, MediaPipe
- CI/CD: GitHub Actions
- Deployment: AWS ECR + AWS ECS + AWS CloudFront + Amazon S3
- Container: Docker

## Runtime Version Policy

- Node.js는 20 LTS를 기준으로 한다.
- Node 버전 파일은 `.nvmrc`와 `.node-version`을 함께 유지한다.
- Package manager는 npm을 사용한다.
- 각 앱/패키지는 `package-lock.json`을 커밋하고 CI와 로컬 검증은 `npm ci`를 기준으로 한다.
- pnpm, yarn, bun lockfile은 팀 합의 전 추가하지 않는다.

## Required Reading Order

1. `docs/05_agents/AGENTS.md`
2. `docs/04_implementation/team-split-5dev-1pm.md`
3. `docs/03_contracts`
4. `docs/02_architecture`
5. 담당 폴더의 `AGENTS.md`
6. 담당 역할별 `docs/05_agents/agent-*.md`

## Work Ownership

- A: Auth/Common + CI/CD/AWS
- B: Company Recruiting
- C: Company Interview/Criteria
- D: Candidate/Application/Interview
- E: AI Report/Pipeline
- PM: 발표, 검증, QA, 문서 계약 관리

## Collaboration Rules

- API path, request/response, enum, error code 변경은 `docs/03_contracts`를 먼저 수정한다.
- DB 테이블/상태 전이 변경은 `docs/02_architecture`와 `docs/04_implementation`을 먼저 수정한다.
- Prisma schema/migration 변경은 ERDCloud SQL과 실제 PostgreSQL 실행 가능성을 함께 확인한다.
- 환경변수 추가/변경은 `.env.example`을 먼저 갱신한다.
- UI 구현은 `design.md`와 `docs/01_product`를 먼저 확인한다.
- AI 결과는 가드레일 검증 전 최종 저장하지 않는다.
- 파일 원본은 DB에 저장하지 않고 S3에 저장한다. DB에는 `file_assets` 메타데이터만 저장한다.
- 장기 작업은 API 서버에서 직접 오래 잡지 않고 SQS/worker와 `ai_process_logs` 상태 전이로 처리한다.
- 각 담당자는 본인 소유 테이블/API 외 변경 시 관련 담당자에게 리뷰를 요청한다.
- 모든 작업자는 최종 답변 또는 작업 종료 전에 본인 OS 기준 로컬 하네스를 실행하고 결과를 보고한다.
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role <A|B|C|D|E|PM>`
  - macOS/Linux: `bash scripts/check-local.sh -Role <A|B|C|D|E|PM>`
  - B 담당자는 macOS 사용자이므로 `bash scripts/check-local.sh -Role B`를 기준으로 하며 PowerShell/pwsh 설치를 요구하지 않는다.
- 담당자 외 파일을 의도적으로 변경한 경우, 최종 답변 또는 PR 메모에 cross-owner review 필요성을 명시한다.
- 모든 작업자는 최종 답변 또는 작업 종료 전에 본인 OS 기준 로컬 하네스를 실행하고 결과를 보고한다:
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role <A|B|C|D|E|PM>`
  - macOS/Linux: `bash scripts/check-local.sh -Role <A|B|C|D|E|PM>`
  - B 담당자는 macOS 사용자이므로 `bash scripts/check-local.sh -Role B`를 기준으로 한다.
- 담당자 외 파일을 의도적으로 변경한 경우, 최종 답변 또는 PR 메모에 cross-owner review 필요성을 명시한다.

## GitHub Issue/PR/Commit Rules

- Codex로 Issue 본문을 생성하거나 Issue에 남길 메시지를 작성할 때는 `.github/ISSUE_TEMPLATE`의 해당 템플릿을 먼저 확인하고 같은 섹션 구조를 따른다.
- 버그 Issue는 `.github/ISSUE_TEMPLATE/bug_report.md`, 기능 요청 Issue는 `.github/ISSUE_TEMPLATE/feature_request.md` 형식을 따른다.
- Codex로 PR 본문을 생성하거나 PR에 남길 메시지를 작성할 때는 `.github/PULL_REQUEST_TEMPLATE.md` 형식을 따른다.
- Issue/PR 템플릿은 GitHub 템플릿 convention에 가깝다. Commit message는 Angular convention 기반의 Conventional Commits 형식을 사용한다.
- 자세한 commit convention은 `docs/04_implementation/commit-convention.md`를 따른다.
- Commit message title 형식은 `<type>(<scope>): <subject>`를 기본으로 한다. scope가 불명확하면 생략해 `<type>: <subject>`로 작성한다.
- Commit type은 `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`, `perf`, `style` 중에서 고른다.
- Commit subject는 명령형 현재 시제의 짧은 한국어 또는 영어 문장으로 작성하고 마침표를 붙이지 않는다.
- 표현해야 할 commit 내용이 3개 이상이면 한 줄 title만 쓰지 말고 title과 content(body)를 함께 작성한다.
- Commit body를 작성할 때는 title 다음 빈 줄을 두고, 변경 내용을 bullet list로 정리한다.
- 관련 Issue가 있으면 commit body 마지막에 `Refs #이슈번호` 또는 해결 커밋이면 `Closes #이슈번호`를 적는다.

### Commit Message Examples

```text
feat(auth): 이메일 인증 코드 검증 추가
```

```text
fix(candidate): 면접 답변 업로드 상태 전이 수정

- 답변 파일 업로드 성공 시 interview_status를 COMPLETED로 갱신
- 업로드 실패 시 ai_process_logs에 FAILED 상태 기록
- 지원현황 화면에서 실패 사유를 조회할 수 있도록 응답 필드 정리

Closes #12
```

## Folder Map

| Folder | Purpose |
| --- | --- |
| `frontend` | React + Next.js + TypeScript 웹 애플리케이션 |
| `backend/api` | NestJS REST API 서버와 Prisma schema |
| `backend/worker` | OpenAI Agents SDK/MediaPipe 기반 AI/비동기 worker |
| `backend/common` | 공통 TypeScript DTO, enum, error, auth/security helper |
| `infra` | AWS ECR/ECS/CloudFront/S3, Docker, Prisma/PostgreSQL migration, local infra |
| `scripts` | 개발/검증 보조 스크립트 |
| `docs` | 제품, 아키텍처, 계약, 분업 문서 |
| `assets` | 로고, 발표/문서용 정적 리소스 |

## Harness

- Windows: `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A`
- macOS/Linux: `bash scripts/check-local.sh -Role A`
- macOS/Linux hook 설치: `bash scripts/install-hooks.sh -Role A`
- CI에서는 `.github/workflows/ci.yml`이 같은 검증을 실행한다.

macOS/Linux에서는 실행 권한(`chmod +x`)에 의존하지 않도록 `bash scripts/*.sh` 형식을 표준 명령으로 사용한다.

## Windows Command Notes

- Windows에서 로컬 명령 실행 시 가능하면 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`를 명시한다.
- 한국어/UTF-8 파일을 PowerShell로 읽을 때는 UTF-8 출력을 명시한다:
  `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8`
- 한글, 공백, 대괄호가 포함된 경로는 `-LiteralPath`를 우선 사용한다.

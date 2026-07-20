# Agent B: Company Recruiting

## Mission

기업 공고, 공고 상세, 지원자 등록/CSV, 초대 메일, 전형 상태를 담당한다.

## Must Read

1. `docs/05_agents/AGENTS.md`
2. `docs/04_implementation/team-split-5dev-1pm.md`
3. `docs/01_product/feature-spec.md` 기업 공고/지원자 영역
4. `docs/01_product/screen-flow.md` 기업 포털
5. `docs/03_contracts/api-spec.md` 기업 - 채용공고, 기업 - 지원자/리포트
6. `docs/02_architecture/data-model.md` Recruiting, Application, Notification/File
7. `frontend/AGENTS.md`
8. `backend/api/AGENTS.md`

## Owns

- `postings`
- `applications` 운영 상태와 screening memo, 자동 전형 판정 기업 조회
- `notifications` 초대/안내 메일 흐름

## Outputs

- `/company/dashboard`
- `/company/recruitments`
- `/company/recruitments/{recruitmentId}`
- `/company/recruitments/{recruitmentId}/applicants`
- `/company/applicants`
- `/company/applicants/invitations`
- `/company/applicants/{applicantId}/screening-status` (legacy, 폐기 예정)

## Codex Operating Rules

B 담당 Codex는 이 파일을 읽는 즉시 아래 규칙을 작업 전제에 포함한다. 별도 프롬프트로 다시 전달하지 않아도 된다.

- B 담당자는 Company Recruiting 영역만 구현한다.
- 기술스택은 React + Next.js + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL/pgvector다.
- Spring Boot/Java로 구현하지 않는다.
- 프론트엔드는 `frontend/AGENTS.md`의 Next.js App Router 기준을 따른다.
- 백엔드는 `backend/api/AGENTS.md`의 NestJS + Prisma 기준을 따른다.
- API path, request/response, enum, error code를 바꿔야 하면 `docs/03_contracts`를 먼저 수정한다.
- DB 테이블/상태 전이를 바꿔야 하면 `docs/02_architecture`와 `docs/04_implementation`을 먼저 맞춘다.
- 기업은 자기 회사 공고/지원자만 접근할 수 있어야 한다.
- `applications` 상태 필드는 D 담당자와 충돌 가능성이 있으므로 변경 시 D 리뷰가 필요하다.
- 자동 판정 결과는 E write field다. B는 지원자별 `PASS/HOLD/FAIL/RETRY`를 직접 변경하지 않는다.
- macOS/Linux 검증은 `bash scripts/check-local.sh -Role B`를 사용한다.
- macOS/Linux 작업자에게 PowerShell Core 설치를 요구하지 않는다.

## Required Checks

- 기업은 자기 회사 공고/지원자만 접근
- 중복 지원자/중복 초대 처리
- 지원자 등록/초대 상태 전이
- 자동 판정 결과 조회 권한과 내부 메모 비노출 검증
- macOS/Linux 검증 명령은 `bash scripts/check-local.sh -Role B`를 사용

## Must Coordinate With

- D: `applications` 지원자 제출/응시 상태
- E: report 상태와 지원자 평가 요약
- A: 기업 role guard, 메일/배포 환경변수

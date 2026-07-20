# Agent D: Candidate/Application/Interview

## Mission

지원자 공고 조회, 지원서 제출, 지원현황, 모의/채용 면접 진행, 답변 업로드를 담당한다.

## Must Read

1. `docs/05_agents/AGENTS.md`
2. `docs/04_implementation/team-split-5dev-1pm.md`
3. `docs/01_product/screen-flow.md` 지원자 포털
4. `docs/03_contracts/api-spec.md` 지원자 도메인
5. `docs/02_architecture/data-model.md` Application, Interview, Notification/File
6. `frontend/AGENTS.md`
7. `backend/api/AGENTS.md`

## Owns

- `applications` 지원자 제출/응시 상태
- `application_documents`
- `consent_records`
- `interview_sessions` 런타임 상태
- `interview_answers` 답변 파일 참조 저장

## Outputs

- `/candidate/jobs`
- `/candidate/jobs/{jobId}`
- `/candidate/jobs/{jobId}/applications`
- `/candidate/applications`
- `/candidate/applications/{applicationId}/consent`
- `/candidate/applications/{applicationId}/interview/start`
- `/candidate/applications/{applicationId}/interview`
- `/candidate/mock-interviews/*`
- `/candidate/interviews/{sessionId}/answers`
- `/candidate/interviews/{sessionId}/next-question`
- `/candidate/interviews/{sessionId}/complete`

## Codex Operating Rules

D 담당 Codex는 이 파일을 읽는 즉시 아래 규칙을 작업 전제에 포함한다. 별도 프롬프트로 다시 전달하지 않아도 된다.

- D 담당자는 Candidate/Application/Interview 영역만 구현한다.
- 기술스택은 React + Next.js + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL/pgvector다.
- Spring Boot/Java로 구현하지 않는다.
- 프론트엔드는 `frontend/AGENTS.md`의 Next.js App Router 기준을 따른다.
- 백엔드는 `backend/api/AGENTS.md`의 NestJS + Prisma 기준을 따른다.
- 지원자는 본인 지원서, 면접 세션, 답변 데이터만 접근할 수 있어야 한다.
- 파일 원본은 DB에 저장하지 않고 S3/file_assets 참조로 연결한다.
- API path, request/response, enum, error code를 바꿔야 하면 `docs/03_contracts`를 먼저 수정한다.
- `applications`, `interview_sessions`, `interview_answers` 구조나 상태 전이를 바꿔야 하면 `docs/02_architecture`와 `docs/04_implementation`을 먼저 맞춘다.
- `applications` 자동 전형 판정은 E write/B 기업 조회 필드다. D는 지원자 제한 결과로만 읽고 내부 reason/점수/메모를 노출하지 않는다.
- `interview_answers`는 E 담당 AI 처리 입력이므로 변경 시 E 리뷰가 필요하다.
- Windows 검증은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`를 사용한다.
- Windows 명령은 UTF-8 출력과 `-LiteralPath` 사용 규칙을 지킨다.

## Required Checks

- 지원자는 본인 데이터만 접근
- 지원 중복 차단
- 필수 동의 없으면 채용 AI 면접 시작 차단
- 장치 점검 완료 전 면접 시작 차단
- 답변 파일 저장 후 `file_assets` 참조 연결
- Windows 검증 명령은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`를 사용

## Must Coordinate With

- B: `applications` 기업 전형 상태
- C: 질문 세트와 질문 표시 정책
- E: STT/리포트 입력이 되는 답변 데이터
- A: S3 upload, role guard, auth token

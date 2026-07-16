# Agent C: Company Interview/Criteria

## Mission

기업 면접 설정, 평가 기준, 질문 뱅크, JD 기반 질문 생성 요청부를 담당한다.

## Must Read

1. `docs/05_agents/AGENTS.md`
2. `docs/04_implementation/team-split-5dev-1pm.md`
3. `docs/03_contracts/api-spec.md` 기업 - 면접관리
4. `docs/02_architecture/data-model.md` Recruiting, Interview
5. `docs/02_architecture/async-ai-pipeline.md`
6. `frontend/AGENTS.md`
7. `backend/api/AGENTS.md`
8. `docs/04_implementation/ncs-recruiting-question-generation-milestones.md`
9. `docs/04_implementation/ncs-recruiting-question-generation-review-requests.md`

## Owns

- `criterion_tags`
- `evaluation_criteria`
- `question_bank`
- `interview_question_generation_policies` (NQ-M1 예정)
- 면접 시간 정책

## Outputs

- `/company/interviews/settings`
- `/company/interviews/evaluation-criteria/suggest`
- `/company/interviews/evaluation-criteria`
- `/company/interviews/questions`
- `/company/interviews/questions/generate`
- `/company/interviews/question-sets`
- `/company/interviews/time-policy`
- `/company/interviews/question-generation-policy`
- `/company/interviews/applications/{applicationId}/resume-questions`
- `/company/interviews/applications/{applicationId}/resume-questions/retry`

## Codex Operating Rules

C 담당 Codex는 이 파일을 읽는 즉시 아래 규칙을 작업 전제에 포함한다. 별도 프롬프트로 다시 전달하지 않아도 된다.

- C 담당자는 Company Interview/Criteria 영역만 구현한다.
- 기술스택은 React + Next.js + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL/pgvector다.
- Spring Boot/Java로 구현하지 않는다.
- 프론트엔드는 `frontend/AGENTS.md`의 Next.js App Router 기준을 따른다.
- 백엔드는 `backend/api/AGENTS.md`의 NestJS + Prisma 기준을 따른다.
- AI 생성 요청 API는 직접 장기 작업을 처리하지 않고 `ai_process_logs`와 worker/SQS 흐름을 전제로 설계한다.
- API path, request/response, enum, error code를 바꿔야 하면 `docs/03_contracts`를 먼저 수정한다.
- `criterion_tags`, `evaluation_criteria`, `question_bank` 구조나 상태 전이를 바꿔야 하면 `docs/02_architecture`와 `docs/04_implementation`을 먼저 맞춘다.
- `question_bank`, `evaluation_criteria`는 E 담당자와 충돌 가능성이 있으므로 변경 시 E 리뷰가 필요하다.
- NCS profile/mode/version과 alignment 판정은 E 계약을 소비하며 C에 threshold를 복제하지 않는다.
- 지원자별 질문 table과 worker 상태는 E, 지원 완료·세션 snapshot은 D 소유다. C는 정책 저장, 조회 UX, 명시적 retry 요청만 담당한다.
- NQ-M0 cross-owner 결정은 `ncs-recruiting-question-generation-review-requests.md`의 Review ID로 추적한다.
- Windows 검증은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role C`를 사용한다.
- Windows 명령은 UTF-8 출력과 `-LiteralPath` 사용 규칙을 지킨다.

## Required Checks

- 평가 기준 배점 합계 검증
- 질문 유형 enum 검증
- 공고별 질문 연결 검증
- JD 기반 생성 결과 저장 전 검증
- Windows 검증 명령은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role C`를 사용

## Must Coordinate With

- E: AI 질문 생성, 리포트 평가 기준 사용
- B: 공고/JD 데이터
- D: 면접 질문 표시와 질문 세트 소비

# Agent E: AI Report/Pipeline

## Mission

서류 추출, STT, 꼬리질문, 리포트 생성, 근거, 가드레일, 임베딩, worker/SQS 연동을 담당한다.

## Must Read

1. `docs/05_agents/AGENTS.md`
2. `docs/04_implementation/team-split-5dev-1pm.md`
3. `docs/02_architecture/async-ai-pipeline.md`
4. `docs/03_contracts/api-spec.md` AI/리포트 처리
5. `docs/03_contracts/enums.md`
6. `docs/02_architecture/data-model.md` Report, AI Infra
7. `docs/04_implementation/ai-job-contracts.md`
8. `backend/worker/AGENTS.md`
9. `backend/api/AGENTS.md`

## Owns

- `ai_process_logs`
- `ai_guardrail_logs`
- `evaluation_reports`
- `report_scores`
- `report_evidences`
- `embeddings`
- `applications` 자동 전형 판정 projection
- AI worker processing

## Outputs

- `/reports/{reportId}/evaluation-context`
- `/reports/{reportId}/answer-evaluation`
- `/reports/{reportId}/communication-analysis`
- `/reports/{reportId}/generate`
- `/candidate/mock-interview/reports/{reportId}/generate`
- `/candidate/documents/extract`
- `/candidate/*/stt`
- `/candidate/*/follow-up-question`
- `/ai/guardrails/validate`

## Codex Operating Rules

E 담당 Codex는 이 파일을 읽는 즉시 아래 규칙을 작업 전제에 포함한다. 별도 프롬프트로 다시 전달하지 않아도 된다.

- E 담당자는 AI Report/Pipeline 영역만 구현한다.
- 기술스택은 React + Next.js + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL/pgvector다.
- Spring Boot/Java로 구현하지 않는다.
- worker는 `backend/worker/AGENTS.md`의 NestJS worker 또는 Node.js/TypeScript worker 기준을 따른다.
- API entrypoint는 `backend/api/AGENTS.md`의 NestJS + Prisma 기준을 따른다.
- 장기 AI 작업은 API 서버에서 직접 오래 처리하지 않고 SQS/worker와 `ai_process_logs` 상태 전이로 처리한다.
- AI 결과는 `ai_guardrail_logs` 검증 전 최종 저장하지 않는다.
- API path, request/response, enum, error code를 바꿔야 하면 `docs/03_contracts`를 먼저 수정한다.
- `ai_process_logs`, `ai_guardrail_logs`, `evaluation_reports`, `report_scores`, `report_evidences`, `embeddings` 구조나 상태 전이를 바꿔야 하면 `docs/02_architecture`와 `docs/04_implementation`을 먼저 맞춘다.
- `question_bank`, `evaluation_criteria` 사용 방식은 C 담당자와 충돌 가능성이 있으므로 변경 시 C 리뷰가 필요하다.
- `interview_answers` 입력 구조는 D 담당자와 충돌 가능성이 있으므로 변경 시 D 리뷰가 필요하다.
- 리포트 final save 이후 C의 공고별 policy snapshot을 사용해 `PASS/HOLD/FAIL/RETRY`를 결정론적으로 저장한다. 판정 가능한 점수가 없으면 FAIL로 변환하지 않는다.
- Windows 검증은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role E`를 사용한다.
- Windows 명령은 UTF-8 출력과 `-LiteralPath` 사용 규칙을 지킨다.

## Required Checks

- `ai_process_logs` 상태 전이 기록
- 가드레일 통과 전 최종 저장 금지
- 근거 없는 점수 저장 금지
- 채용/모의 리포트 표현 정책 분리
- FAILED 상태와 재시도 사유 기록
- 중복 임베딩 생성 방지
- Windows 검증 명령은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role E`를 사용

## Must Coordinate With

- A: SQS, S3, AI provider secret, worker deployment
- C: 평가 기준과 질문 생성
- D: 답변 파일/STT 입력
- B: 기업 지원자 평가 화면의 report 상태

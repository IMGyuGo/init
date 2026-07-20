# One-Time Alignment: Agent E

이 문서는 AI Report/Pipeline 담당자가 Codex에 한 번 전달해 기존 구현을 baseline에 맞추기 위한 1회용 지시서다.

## Read First

1. `docs/02_architecture/async-ai-pipeline.md`
2. `docs/02_architecture/data-model.md`의 AI/Report model 이름
3. `docs/03_contracts/api-index.md`의 `API Module Baseline`
4. `docs/04_implementation/module-boundaries.md`의 `Shared Table Field Owners`
5. `docs/03_contracts/api-spec.md`의 `Response Envelope Baseline`, `Pagination Filter Sort Baseline`
6. `docs/03_contracts/enums.md`의 `Status Transition Baseline`
7. `docs/04_implementation/module-boundaries.md`의 `DTO Naming and Location Baseline`, `Permission Matrix Baseline`

## Package Version Baseline

- Runtime은 Node.js `20.x`, npm `>=10`을 기준으로 한다.
- 모든 dependency version은 exact version으로 유지하고, `package-lock.json`을 함께 커밋한다.
- `frontend`: `next` `16.2.9`, `react` `19.2.7`, `react-dom` `19.2.7`, `@types/node` `20.19.43`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, `eslint` `9.39.4`, `eslint-config-next` `16.2.9`, `typescript` `5.9.3`
- `backend/api`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@nestjs/common` `11.1.27`, `@nestjs/config` `4.0.4`, `@nestjs/core` `11.1.27`, `@nestjs/jwt` `11.0.2`, `@nestjs/platform-express` `11.1.27`, `@prisma/client` `6.19.3`, `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `reflect-metadata` `0.2.2`, `rxjs` `7.8.2`, `@types/node` `20.19.43`, `prisma` `6.19.3`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/worker`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@mediapipe/tasks-vision` `0.10.35`, `openai` `6.45.0`, `@types/node` `20.19.43`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/common`: `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `@types/node` `20.19.43`, `typescript` `5.9.3`

## Verification Promotion Gates

- `backend/worker`, `backend/api`, `backend/common`, `frontend`에 실제 구현을 추가하면 placeholder `typecheck`/`lint`/`test`/`build` script가 실제 오류를 숨기지 않는지 확인한다.
- AI report/pipeline sample output 또는 fixture를 추가하면 `verify-ai-golden`이 skip되지 않도록 golden case를 함께 추가한다.
- OpenAI, MediaPipe, AWS SDK version 변경이 필요하면 PR 본문에 변경 사유와 A 또는 PM 리뷰 필요성을 적는다.

## Apply

- PR을 pull 받은 뒤 `backend/api`, `backend/worker`, `backend/common`에서는 `npm install` 대신 `npm ci`를 사용한다. `package.json`의 exact version과 `package-lock.json`을 임의로 갱신하지 않는다.
- backend 리포트 API는 `backend/api/src/modules/report` 아래로 정렬한다.
- AI 가드레일/status API는 `backend/api/src/modules/ai` 아래로 정렬한다.
- worker 구현은 `backend/worker/src` 아래에서 API module 이름과 같은 domain 이름을 사용한다.
- API-045/API-051/API-071은 서버가 구성한 `CandidateProfileAiContextV1`을 입력으로 받을 수 있으며 `ai_process_logs.input_ref`에는 원문 대신 버전·개수·길이·해시·수정시각만 저장한다.
- 질문 출력은 차별 위험 속성을 추론·평가하지 않고 이메일·전화번호·URL을 포함하지 않도록 가드레일을 적용한다.
- frontend 리포트/AI 상태 component는 `frontend/src/features/ai-report` 아래로 정렬한다.
- `evaluation_reports`는 `EvaluationReport`, `report_scores`는 `ReportScore`, `report_evidences`는 `ReportEvidence`, `ai_process_logs`는 `AiProcessLog`, `ai_guardrail_logs`는 `AiGuardrailLog` 이름을 사용한다.
- `AIProcessLog`, `AIGuardrailLog` 같은 all-caps acronym class 이름을 새로 만들지 않는다.
- `applications.report_status`, `evaluation_reports`, `interview_answers.transcript` write는 E 영역으로 둔다.
- 리포트 final save 이후 공고별 policy snapshot으로 `applications.screening_decision`과 reason/version/decided_at을 결정론적으로 저장한다. 점수 없음·평가 불완전·STT terminal 실패는 FAIL이 아니라 RETRY다.

## Verify

작업 후 아래 명령을 실행하고 실패 항목을 수정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role E
```

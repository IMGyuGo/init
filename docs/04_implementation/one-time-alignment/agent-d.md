# One-Time Alignment: Agent D

이 문서는 Candidate/Application/Interview 담당자가 Codex에 한 번 전달해 기존 구현을 baseline에 맞추기 위한 1회용 지시서다.

## Read First

1. `docs/01_product/screen-flow.md`의 `Frontend Feature Baseline`
2. `docs/03_contracts/api-index.md`의 `API Module Baseline`
3. `docs/04_implementation/module-boundaries.md`의 `Shared Table Field Owners`
4. `docs/02_architecture/data-model.md`의 Application/Interview model 이름
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

- `frontend` 또는 `backend/api`에 실제 구현을 추가하면 placeholder `typecheck`/`lint`/`test`/`build` script가 실제 오류를 숨기지 않는지 확인한다.
- 면접 런타임 API가 health/smoke 대상이 되면 PM/A와 함께 `smoke-local` 전환 필요성을 PR 본문에 적는다.
- 의존성 변경이 필요하면 PR 본문에 변경 사유와 A 또는 PM 리뷰 필요성을 적는다.

## Apply

- PR을 pull 받은 뒤 필요한 패키지 디렉터리에서 `npm install` 대신 `npm ci`를 사용한다. `package.json`의 exact version과 `package-lock.json`을 임의로 갱신하지 않는다.
- 지원자 공고/지원/지원현황/마이페이지 API는 `backend/api/src/modules/candidate` 아래로 정렬한다.
- 면접 런타임 API는 `backend/api/src/modules/interview` 아래로 정렬한다.
- frontend 지원자 화면은 `frontend/src/features/candidate-application-interview` 아래로 정렬한다.
- GET/PUT `/candidate/profile`은 기본정보와 4개 구조화 반복 섹션을 함께 다룬다. 반복 배열은 누락 시 유지, `[]`면 삭제, 전달 시 해당 섹션 전체 교체 계약을 따른다.
- 지원자 프로필 AI 컨텍스트는 클라이언트 입력을 받지 않고 서버의 안전 투영 빌더를 사용하며 이름·이메일·연락처를 제외한다.
- `applications`는 `Application`, `application_documents`는 `ApplicationDocument`, `interview_sessions`는 `InterviewSession`, `interview_answers`는 `InterviewAnswer` 이름을 사용한다.
- `applications` 생성, `submitted_at`, `document_status`, `interview_status` write는 D 영역으로 둔다.
- `interview_answers.transcript`는 E write field이므로 D는 파일/제출 상태만 저장한다.

## Verify

작업 후 아래 명령을 실행하고 실패 항목을 수정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

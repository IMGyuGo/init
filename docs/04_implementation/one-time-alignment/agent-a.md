# One-Time Alignment: Agent A

이 문서는 Auth/Common + CI/CD/AWS 담당자가 Codex에 한 번 전달해 기존 구현을 baseline에 맞추기 위한 1회용 지시서다.

## Read First

1. `docs/02_architecture/data-model.md`의 `Implementation Naming Baseline`
2. `docs/03_contracts/enums.md`의 `Implementation Enum Baseline`
3. `docs/03_contracts/api-index.md`의 `API Module Baseline`
4. `docs/04_implementation/module-boundaries.md`의 `Baseline Boundary Rules`
5. `docs/04_implementation/test-strategy.md`의 baseline harness 항목
6. `docs/03_contracts/api-spec.md`의 `Response Envelope Baseline`, `Pagination Filter Sort Baseline`
7. `docs/03_contracts/enums.md`의 `Status Transition Baseline`
8. `docs/04_implementation/module-boundaries.md`의 `DTO Naming and Location Baseline`, `Permission Matrix Baseline`

## Package Version Baseline

- Runtime은 Node.js `20.x`, npm `>=10`을 기준으로 한다.
- 모든 dependency version은 exact version으로 유지하고, `package-lock.json`을 함께 커밋한다.
- `frontend`: `next` `16.2.9`, `react` `19.2.7`, `react-dom` `19.2.7`, `@types/node` `20.19.43`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, `eslint` `9.39.4`, `eslint-config-next` `16.2.9`, `typescript` `5.9.3`
- `backend/api`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@nestjs/common` `11.1.27`, `@nestjs/config` `4.0.4`, `@nestjs/core` `11.1.27`, `@nestjs/jwt` `11.0.2`, `@nestjs/platform-express` `11.1.27`, `@prisma/client` `6.19.3`, `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `reflect-metadata` `0.2.2`, `rxjs` `7.8.2`, `@types/node` `20.19.43`, `prisma` `6.19.3`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/worker`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@mediapipe/tasks-vision` `0.10.35`, `openai` `6.45.0`, `@types/node` `20.19.43`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/common`: `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `@types/node` `20.19.43`, `typescript` `5.9.3`

## Verification Promotion Gates

- `backend/api` 또는 `backend/common`에 실제 TypeScript 구현을 추가하면 placeholder `typecheck`/`lint`/`test`/`build` script를 실제 검증 명령으로 교체한다.
- `backend/api/prisma/schema.prisma` 또는 migration을 추가하면 `verify-prisma`가 skip되지 않도록 schema validate/generate 기준을 맞춘다.
- Dockerfile, `/health`, local infra를 추가하면 `verify-docker`와 `smoke-local`이 실제 검증으로 전환되었는지 확인한다.
- 의존성 변경이 필요하면 A 단독으로 확정하지 말고 PR 본문에 변경 사유와 PM 리뷰 필요성을 적는다.

## Apply

- PR을 pull 받은 뒤 `backend/api`와 `backend/common`에서는 `npm install` 대신 `npm ci`를 사용한다. `package.json`의 exact version과 `package-lock.json`을 임의로 갱신하지 않는다.
- 기존 Dev Auth, guard, decorator, `CurrentUser`, seed 구현이 있으면 삭제하거나 새로 덮어쓰지 않는다.
- 먼저 기존 인증 구현을 `docs/03_contracts/dev-auth-contract.md`와 비교해 차이점을 보고한 뒤, 동일 개념의 중복 파일을 만들지 말고 기존 구현을 기준 위치와 naming baseline에 맞춰 정렬한다.
- `backend/api/src/modules/auth`를 인증 module 기준 위치로 사용한다.
- `backend/api/src/modules/company-profile`은 회사 프로필/로고/기업 알림 설정 API 위치로 사용한다.
- 공통 enum은 `backend/common/src/enums`, 공통 DTO는 `backend/common/src/dto`, 공통 error mapping은 `backend/common/src/errors`에 둔다.
- Prisma model은 `User`, `Company`, `CandidateProfile`, `CandidateEducation`, `CandidateCareer`, `CandidateActivity`, `CandidateCredential`, `FileAsset` 이름을 사용하고 DB table은 `@@map`으로 기존 table에 연결한다.
- 구조화 프로필 enum은 `CandidateEducationLevel`, `CandidateDegreeType`, `CandidateEducationStatus`, `CandidateActivityType`, `CandidateCredentialType`을 `backend/common/src/enums`와 Prisma에 같은 값으로 정의한다.
- MVP 구현 단계에서는 Prisma CLI/Client를 `6.19.3`으로 고정한다. `prisma`와 `@prisma/client`는 모두 `6.19.3`을 사용하고 `package-lock.json`을 함께 커밋한다.
- `schema.prisma`는 Prisma 6 방식의 `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }` 계약을 유지한다.
- CI나 로컬에서 Prisma CLI 7.x로 인해 `datasource property url is no longer supported` 또는 `P1012`가 발생하면, 이번 alignment 범위에서는 `prisma.config.ts`/adapter 전환을 하지 말고 `prisma`와 `@prisma/client`를 `6.19.3`으로 낮춰 고정한다.
- Prisma 7 전환이 필요하면 A 단독 alignment 작업으로 처리하지 않고, `docs/03_contracts`, `docs/02_architecture`, `docs/04_implementation/test-strategy.md`, 하네스 스크립트 변경을 포함하는 별도 합의 PR로 진행한다.
- Dev Auth는 `docs/03_contracts/dev-auth-contract.md`의 `CurrentUser` shape를 따른다.
- Dev Auth는 local/dev 환경에서만 `X-Dev-User-Id`, `X-Dev-User-Type`, `X-Dev-Company-Id`, `X-Dev-Candidate-Id`를 읽고 production/staging에서는 해당 헤더를 무시하거나 거부한다.
- 인증 정보가 없거나 잘못되면 `COMMON_UNAUTHORIZED`, role이 맞지 않으면 `COMMON_FORBIDDEN`을 반환하도록 기존 공통 error mapping과 맞춘다.
- seed가 이미 있으면 `DEV_COMPANY_USER`, `DEV_CANDIDATE_USER`의 id/role/companyId/candidateId 계약을 보존한 채 `upsert` 기준으로 정렬한다.
- 기존 코드에 `AIProcessLog`, `QuestionBank`, `EvaluationCriteria` 같은 금지 이름이 있으면 baseline 이름으로 바꾼다.

## Verify

작업 후 아래 명령을 실행하고 실패 항목을 수정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A
```

# One-Time Alignment: PM

이 문서는 PM이 Codex에 한 번 전달해 공통 문서와 검증 기준이 baseline과 맞는지 점검하기 위한 1회용 지시서다.

## Read First

1. `docs/01_product/feature-spec.md`
2. `docs/01_product/screen-flow.md`
3. `docs/02_architecture/data-model.md`
4. `docs/03_contracts/api-index.md`
5. `docs/04_implementation/module-boundaries.md`
6. `docs/04_implementation/test-strategy.md`
7. `docs/03_contracts/api-spec.md`의 `Response Envelope Baseline`, `Pagination Filter Sort Baseline`
8. `docs/03_contracts/enums.md`의 `Status Transition Baseline`
9. `docs/04_implementation/module-boundaries.md`의 `DTO Naming and Location Baseline`, `Permission Matrix Baseline`

## Package Version Baseline

- Runtime은 Node.js `20.x`, npm `>=10`을 기준으로 한다.
- 모든 dependency version은 exact version으로 유지하고, `package-lock.json`을 함께 커밋한다.
- `frontend`: `next` `16.2.9`, `react` `19.2.7`, `react-dom` `19.2.7`, `@types/node` `20.19.43`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, `eslint` `9.39.4`, `eslint-config-next` `16.2.9`, `typescript` `5.9.3`
- `backend/api`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@nestjs/common` `11.1.27`, `@nestjs/config` `4.0.4`, `@nestjs/core` `11.1.27`, `@nestjs/jwt` `11.0.2`, `@nestjs/platform-express` `11.1.27`, `@prisma/client` `6.19.3`, `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `reflect-metadata` `0.2.2`, `rxjs` `7.8.2`, `@types/node` `20.19.43`, `prisma` `6.19.3`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/worker`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@mediapipe/tasks-vision` `0.10.35`, `openai` `6.45.0`, `@types/node` `20.19.43`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/common`: `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `@types/node` `20.19.43`, `typescript` `5.9.3`

## Verification Promotion Gates

- PR에서 실제 구현이 추가되었는데 placeholder `typecheck`/`lint`/`test`/`build` script가 그대로 남아 있으면 전환 계획을 요구한다.
- `verify-prisma`, `verify-docker`, `verify-ai-golden`, `smoke-local`이 skip되면 PR 본문에 skip 사유와 실제 검증 전환 예정 PR이 있는지 확인한다.
- 의존성 version 또는 lockfile 변경이 있으면 A 또는 PM 리뷰 필요성이 PR 본문에 표시되어 있는지 확인한다.
- PR base branch가 `dev`인지 확인한다. CI baseline은 로컬 스냅샷이 아니라 PR에 포함된 파일과 `dev` merge 결과를 기준으로 한다.

## Apply

- 기능정의서/와이어프레임 흐름/API 명세/ERD 문서에서 같은 개념이 서로 다른 이름으로 불리는지 확인한다.
- 새 화면/새 API/새 테이블이 추가되면 baseline의 feature folder, backend module, field owner에 배치한다.
- 각 팀원 PR이 `docs/04_implementation/one-time-alignment/agent-*.md` 기준을 한 번 적용했는지 확인한다.
- 각 패키지의 `package.json` dependency version이 exact version인지, 대응하는 `package-lock.json`이 함께 변경되었는지 확인한다.
- 팀원 PR에서 의존성을 추가/변경했다면 `npm install` 결과를 그대로 커밋하지 않고 팀 합의된 version baseline을 먼저 갱신했는지 확인한다.
- CI가 `verify-baseline`과 `verify-package-baseline`을 실행하는지 확인한다.

## Verify

작업 후 아래 명령을 실행하고 실패 항목을 수정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role PM
```

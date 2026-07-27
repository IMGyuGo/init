# One-Time Alignment: Agent B

이 문서는 Company Recruiting 담당자가 Codex에 한 번 전달해 기존 구현을 baseline에 맞추기 위한 1회용 지시서다.

## Read First

1. `docs/03_contracts/api-index.md`의 `API Module Baseline`
2. `docs/01_product/screen-flow.md`의 `Frontend Feature Baseline`
3. `docs/04_implementation/module-boundaries.md`의 `Shared Table Field Owners`
4. `docs/02_architecture/data-model.md`의 Prisma model 이름
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
- B는 macOS에서 PowerShell/pwsh 없이 `bash scripts/check-local.sh -Role B`를 실행하고, PR 본문에 결과를 적는다.
- 의존성 변경이 필요하면 PR 본문에 변경 사유와 A 또는 PM 리뷰 필요성을 적는다.

## Apply

- PR을 pull 받은 뒤 macOS에서 `npm install` 대신 필요한 패키지 디렉터리에서 `npm ci`를 사용한다. `package.json`의 exact version과 `package-lock.json`을 임의로 갱신하지 않는다.
- backend 공고/지원자 운영 API는 `backend/api/src/modules/company-recruiting` 아래로 정렬한다.
- frontend 기업 공고/지원자 화면은 `frontend/src/features/company-recruiting` 아래로 정렬한다.
- `postings`는 `Posting`, `applications`는 `Application`, `notifications`는 `Notification` model 이름을 사용한다.
- `applications.application_status`, 초대/운영 상태와 `screening_memo` write는 B 영역으로 둔다.
- `screening_decision`과 자동 판정 reason/version/decided_at은 E 자동 판정 engine write field다. B는 기업 조회 projection만 제공하고 지원자별 결과를 직접 변경하지 않는다.
- `screening_reviewer_decision`, `screening_final_decision`, override reason, 결과 확정 시각/확정자와 알림 등록은 B 영역이다. B는 자동판정 원본을 보존한 채 필요한 지원자만 검토 초안을 수정하고, 공고 단위 일괄 확정에서 effective decision을 final snapshot으로 저장한다. `UNDECIDED | RETRY`는 수정·확정 대상에서 제외한다.
- D/E 소유 field를 직접 write하는 코드가 있으면 service 경계를 분리하거나 owner 리뷰가 필요하다고 표시한다.
- 기존 route alias가 있더라도 새 구현은 `/api/v1/company/recruitments`, `/api/v1/company/applicants` 기준을 사용한다.

## Verify

작업 후 B 담당자는 macOS에서 PowerShell/pwsh 설치 없이 아래 명령을 실행하고 실패 항목을 수정한다. 실행 권한에 의존하지 않도록 `./scripts/check-local.sh`가 아니라 `bash scripts/check-local.sh`를 사용한다.

```bash
bash scripts/check-local.sh -Role B
```

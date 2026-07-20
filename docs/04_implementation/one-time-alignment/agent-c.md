# One-Time Alignment: Agent C

이 문서는 Company Interview/Criteria 담당자가 Codex에 한 번 전달해 기존 구현을 baseline에 맞추기 위한 1회용 지시서다.

## Read First

1. `docs/03_contracts/api-index.md`의 `API Module Baseline`
2. `docs/01_product/screen-flow.md`의 `Frontend Feature Baseline`
3. `docs/04_implementation/module-boundaries.md`의 `Shared Table Field Owners`
4. `docs/02_architecture/data-model.md`의 `question_bank`/`evaluation_criteria` naming 기준
5. `docs/03_contracts/api-spec.md`의 `Response Envelope Baseline`, `Pagination Filter Sort Baseline`
6. `docs/03_contracts/enums.md`의 `Status Transition Baseline`
7. `docs/04_implementation/module-boundaries.md`의 `DTO Naming and Location Baseline`, `Permission Matrix Baseline`
8. `docs/04_implementation/ncs-recruiting-question-generation-milestones.md`
9. `docs/04_implementation/ncs-recruiting-question-generation-review-requests.md`

## Package Version Baseline

- Runtime은 Node.js `20.x`, npm `>=10`을 기준으로 한다.
- 모든 dependency version은 exact version으로 유지하고, `package-lock.json`을 함께 커밋한다.
- `frontend`: `next` `16.2.9`, `react` `19.2.7`, `react-dom` `19.2.7`, `@types/node` `20.19.43`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, `eslint` `9.39.4`, `eslint-config-next` `16.2.9`, `typescript` `5.9.3`
- `backend/api`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@nestjs/common` `11.1.27`, `@nestjs/config` `4.0.4`, `@nestjs/core` `11.1.27`, `@nestjs/jwt` `11.0.2`, `@nestjs/platform-express` `11.1.27`, `@prisma/client` `6.19.3`, `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `reflect-metadata` `0.2.2`, `rxjs` `7.8.2`, `@types/node` `20.19.43`, `prisma` `6.19.3`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/worker`: `@aws-sdk/client-s3` `3.1075.0`, `@aws-sdk/client-sqs` `3.1075.0`, `@mediapipe/tasks-vision` `0.10.35`, `openai` `6.45.0`, `@types/node` `20.19.43`, `tsx` `4.22.4`, `typescript` `5.9.3`
- `backend/common`: `class-transformer` `0.5.1`, `class-validator` `0.15.1`, `@types/node` `20.19.43`, `typescript` `5.9.3`

## Verification Promotion Gates

- `frontend` 또는 `backend/api`에 실제 구현을 추가하면 placeholder `typecheck`/`lint`/`test`/`build` script가 실제 오류를 숨기지 않는지 확인한다.
- 질문/평가 기준 schema 또는 seed가 필요하면 C 단독으로 DB 계약을 바꾸지 말고 A/PM 리뷰 필요성을 PR 본문에 적는다.
- 의존성 변경이 필요하면 PR 본문에 변경 사유와 A 또는 PM 리뷰 필요성을 적는다.

## Apply

- PR을 pull 받은 뒤 필요한 패키지 디렉터리에서 `npm install` 대신 `npm ci`를 사용한다. `package.json`의 exact version과 `package-lock.json`을 임의로 갱신하지 않는다.
- backend 면접 설정/평가 기준/질문 API는 `backend/api/src/modules/company-interview` 아래로 정렬한다.
- frontend 면접 관리 화면은 `frontend/src/features/company-interview-criteria` 아래로 정렬한다.
- `criterion_tags`는 `CriterionTag`, `evaluation_criteria`는 `EvaluationCriterion`, `question_bank`는 `Question` model 이름을 사용한다.
- `QuestionBank`, `EvaluationCriteria`를 model/class 이름으로 새로 만들지 않는다.
- `question_bank`, `evaluation_criteria` write는 C 영역으로 둔다. E가 AI 생성 결과를 저장해야 하면 C service 또는 명시된 API를 통해 연결한다.
- `auto_screening_policies`와 평가 기준별 `pass_score`는 C 설정 영역이다. C는 정책/version을 저장하지만 지원자별 `screening_decision`을 계산하거나 write하지 않는다.
- NQ-M1의 `interview_question_generation_policies`와 API-097은 C가 구현한다. 정책 미설정은 `policyVersion=0`, 질문 수 0/0 projection으로 처리한다.
- API-098/099는 C route지만 application/document와 AI batch를 직접 소유하지 않는다. D/E repository 계약을 통해 조회·retry를 연결한다.
- NCS evaluator의 profile ID, mode, threshold, version을 C 코드에 하드코딩하지 않는다.

## Verify

작업 후 아래 명령을 실행하고 실패 항목을 수정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role C
```

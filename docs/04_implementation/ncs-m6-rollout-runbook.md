# NCS Question Generation M6 Rollout Runbook

## Scope

이 문서는 NQ-M1~M5에서 구현한 NCS 평가 기준, 공통·개인화 질문, 세션 snapshot, 답변 평가를 배포하고 되돌리는 M6 절차다. 실제 운영 적용은 A가 주도하고 C/D/E/B/PM이 각 소유 경계를 확인한다.

## Release Gate

아래 항목이 하나라도 실패하면 NCS UI를 활성화하지 않는다.

1. `backend/api/prisma/migrations`의 M1~M5 migration이 대상 DB backup 이후 순서대로 적용된다.
2. 공고 설정에서 문제해결·의사소통·디지털 기준이 정확히 하나씩 저장된다.
3. JD 공통 질문과 이력서 개인화 질문을 각각 3개로 설정하고, 공통 질문은 즉시 생성되며 개인화 질문은 문서 추출 완료 후 생성된다.
4. 지원자 A의 개인화 질문이 지원자 B의 조회·세션에 포함되지 않는다.
5. 세션 질문 snapshot 이후 정책·기준·JD 변경이 기존 세션 내용을 바꾸지 않는다.
6. 답변 평가는 `SCORED`에만 점수와 답변 원문 인용 근거가 있고, `INSUFFICIENT_INPUT`, `LOW_ALIGNMENT`, `BLOCKED`는 점수가 NULL이다.
7. API, worker, SQS message, 애플리케이션 로그에 이력서 원문이나 추출 전문이 남지 않는다.
8. C 하네스와 변경 영향 역할 하네스가 통과하고 기업 평가 상세의 desktop/mobile 화면에 겹침이나 잘림이 없다.

## Database Deployment

대상 DB의 backup과 migration table 확인 후 API one-off task에서 다음을 실행한다.

```text
cd backend/api
npx prisma migrate deploy
npx prisma migrate status
```

M6 대상 migration의 순서는 다음과 같다.

1. `20260714090000_ncs_question_generation_policy`
2. `20260714110000_ncs_common_question_metadata`
3. `20260714140000_application_interview_questions`
4. `20260714170000_ncs_session_question_snapshot`
5. `20260714200000_ncs_answer_evaluations`

`migrate deploy` 실패 시 API/worker 새 image 배포를 중단한다. 이미 일부 migration이 적용됐다면 migration 파일을 수정하거나 down migration을 임의 실행하지 않고, 실패 원인을 보정한 새 migration으로 전진 복구한다.

## Rollout

`NEXT_PUBLIC_NCS_QUESTION_POLICY_ENABLED`는 frontend build-time flag다. `false` 문자열만 비활성으로 해석하며 미설정 또는 그 외 값은 활성이다.

1. migration 적용 및 API/worker health 확인
2. `NEXT_PUBLIC_NCS_QUESTION_POLICY_ENABLED=false` image로 legacy 공고·지원·면접 회귀 확인
3. 내부 검증 image에서 flag를 `true`로 설정하고 NCS 3+3 E2E 수행
4. 기업 평가 상세에서 답변별 상태, nullable 점수, exact evidence 확인
5. PM 승인 후 `true` image를 배포하고 queue 실패율과 report 생성 실패를 관찰

환경변수만 런타임에서 바꾸면 화면이 전환되지 않는다. flag 변경 후 frontend를 다시 build하고 배포해야 한다.

## Failure Recovery

| Failure | Expected behavior | Recovery |
| --- | --- | --- |
| Migration 실패 | 신규 image 배포 중단 | backup과 migration status 확인 후 전진 migration |
| OpenAI/provider 실패 | job `FAILED`, 확정 질문·점수 저장 금지 | 원인 제거 후 기존 retry API 또는 새 process log로 재시도 |
| 중복 SQS 전달 | 같은 business key의 batch·질문 중복 없음 | idempotency key와 latest process log 확인 |
| 이력서 질문 미준비 | 면접 세션 생성·시작 409 | 문서 추출·batch 상태 복구 후 재진입 |
| 정렬 미달·근거 부족 | 점수 NULL, 상태 사유 표시 | 질문 재작성 또는 답변 재검토; 0점으로 치환 금지 |
| UI projection 실패 | 기존 report summary와 답변은 유지 | flag false image로 frontend rollback |

## Rollback

롤백은 데이터 삭제가 아니라 신규 NCS 설정 진입 차단을 기본으로 한다.

1. `NEXT_PUBLIC_NCS_QUESTION_POLICY_ENABLED=false`로 frontend를 다시 build·배포한다.
2. API와 worker는 NCS nullable field와 기존 `LEGACY` 공고를 계속 읽을 수 있는 현재 호환 버전을 유지한다.
3. 이미 생성된 NCS criteria, batch, session snapshot, answer evaluation은 감사와 진행 중 세션 보존을 위해 삭제하지 않는다.
4. worker 장애가 원인이면 신규 NCS job 소비만 중단하고 기존 SQS message와 DLQ를 보존한다.
5. migration rollback은 데이터 손실 가능성이 있으므로 이 runbook의 자동 복구 경로에 포함하지 않는다.

## Smoke Evidence

릴리스 기록에는 다음을 남긴다.

- 배포 image SHA와 migration status
- feature flag 값과 frontend build SHA
- 공고 ID, application ID, session ID, process log ID만 기록한 3+3 E2E 결과
- 각 NCS profile의 평가 상태와 점수 NULL 여부
- exact evidence가 해당 답변에 존재하는지 여부만 기록하고 이력서·답변 원문은 복사하지 않음
- role별 harness 결과와 브라우저 desktop/mobile 캡처

## Required Reviews

- A: DB migration, ECS 환경변수, SQS/DLQ, rollback 실행
- B: 기업 평가 상세의 채용 운영 UX와 projection
- D: 지원 완료·세션 snapshot·답변 연결
- E: provider smoke, guardrail, nullable 점수와 evidence
- PM: 지원자 고지, 보관 기간, 운영자 노출 범위, 최종 QA 승인


# NCS Final Evaluation Integration Milestones

## Objective

[`ncs-final-evaluation.md`](../03_contracts/ncs-final-evaluation.md)를 현재 브랜치의 개인화 질문·세션 snapshot·답변별 저장 구조와 팀원 브랜치의 5점 채점·꼬리질문·최종 판정 로직에 적용한다. 질문 문장 생성 알고리즘은 범위에서 제외한다.

## Milestones

| Milestone | Scope | Main deliverables | Exit criteria | Owner / Review | Reasoning |
| --- | --- | --- | --- | --- | --- |
| NE-M0 | 계약 동결 | 정본 계약, enum/error/API/data model delta, 임시 incomplete 정책 | 문서 간 충돌 없음, C/D/E/A/PM 리뷰 요청 준비 | C / 전 owner | `high` |
| NE-M1 | Schema expand와 호환 migration | canonical profile ID, 공통·개인화·세션 binding, profile별 evaluation/evidence row | 기존 singular data backfill, rollback 없는 forward migration, Prisma 검증 | A / C,D,E | `xhigh` |
| NE-M2 | 설정 가중치와 binding 검증 | 가중치 합계 100 gate, 질문당 binding 1~2개, 오류 응답, 설정 UI | 잘못된 weight/binding 저장 차단, 기본 30/30/40 최초값만 제공 | C / E,PM,A | `high` |
| NE-M3 | 세션 snapshot과 최소 문항 gate | 공통·개인화 binding 복사, weight/time snapshot, profile별 최소 2문항 검증 | 원본 변경 불변, 어느 profile도 2문항 미만으로 세션 시작 불가 | D / C,E,A | `xhigh` |
| NE-M4 | 5점 평가 adapter | profile별 행동 0~3, 논리 0~2, 답변별 NULL 상태, exact evidence source | 질문당 최대 2개 profile 평가 row, 미완료를 0점으로 변환하지 않음 | E / C,D | `xhigh` |
| NE-M5 | 꼬리질문 보강 | 동일 mode, 최대 1회, session answerTimeSec, segment 재평가, max 점수 | base/follow-up 근거 분리, 점수 하락 없음, 5점 상한 | E/D / C,PM | `xhigh` |
| NE-M6 | 집계와 임시 AI 판정 | profile 평균, weight, 총점 80, profile 최소 3, incomplete-as-fail, V1 출력용 report field | 경계값 deterministic test, NULL 점수 유지, application 상태 미변경, 정규화 row만으로 V1 재구성 가능 | E/B / C,D,PM | `high` |
| NE-M7 | 리포트 projection과 E2E | API-020 `ncsEvaluation` V1 builder, PASS/FAIL/INCOMPLETE fixture, 답변·profile·근거 상세 | 출력 contract test, 공통+개인화+꼬리질문 E2E, 역할별 harness 통과 | E/B/PM / 전 owner | `high` |
| NE-M8 | 발표 후 정책 보정 | `INCOMPLETE -> HOLD/재평가`, 임시 policy 제거 | fail-closed 제거 migration/feature flag와 회귀 테스트 | PM/B/E | `high` |

## Dependency Order

```text
NE-M0
  -> NE-M1
  -> NE-M2 + NE-M3 준비 병렬 가능
  -> NE-M4
  -> NE-M5
  -> NE-M6
  -> NE-M7
  -> NE-M8
```

- NE-M2 UI는 NE-M1 contract type을 기준으로 먼저 준비할 수 있다.
- NE-M3 session snapshot은 NE-M1 migration 이후에만 최종 반영한다.
- NE-M4와 NE-M5는 같은 evidence/persistence 계약을 쓰므로 별도 해석 타입을 만들지 않는다.
- NE-M6 전에 profile별 최소 2문항과 nullable 상태가 테스트로 고정되어야 한다.
- NE-M7 리포트 consumer는 [`ncs-report-output-contract.md`](../03_contracts/ncs-report-output-contract.md)의 V1 fixture로 NE-M6와 병렬 구현할 수 있다.
- 실제 연결 시 producer projection을 정본으로 사용하며 frontend에서 점수나 판정을 다시 계산하지 않는다.

## NE-M1 Implementation Status (2026-07-14)

팀원 리뷰 대기 항목을 제외한 로컬 구현 완성도는 `100%`다. 리뷰 요청은 [`ncs-recruiting-question-generation-review-requests.md`](./ncs-recruiting-question-generation-review-requests.md)의 `NE-M1 Cross-owner Review Handoff`에서 별도로 추적한다.

| Deliverable | Status | Evidence |
| --- | --- | --- |
| canonical profile binding | COMPLETE | 공통·개인화·세션 binding 3개 table과 legacy ID backfill |
| 답변·profile별 평가 | COMPLETE | `(report_id, answer_id, ncs_profile_id)` unique와 0~5 nullable score field |
| exact evidence | COMPLETE | source answer ID와 BASE/FOLLOW_UP을 저장하는 evidence table |
| profile 집계·판정 저장 기반 | COMPLETE | nullable `report_scores` NCS aggregate field와 `evaluation_reports` NCS output field |
| forward-only compatibility | COMPLETE | singular column 유지, legacy 0~100 row 보존, 신규 0~5 row의 legacy 점수 NULL 허용 |
| Prisma/ERD 동기화 | COMPLETE | Prisma validate/generate, data model, ERDCloud SQL 동기화 |
| migration 검증 | COMPLETE | 빈 PostgreSQL 전체 36개 migration, legacy fixture backfill, 2-binding/점수 제약 양·음수 검증 |
| 소비 경계 호환 | COMPLETE | 회사 조회는 incomplete score NULL 유지, 지원자 피드백은 incomplete 내부 NCS 행 제외 |

검증 결과:

- API Jest: 42 suites, 266 tests passed
- worker TAP: 126 tests passed
- frontend test/typecheck: passed
- `node scripts/verify-ncs-evaluation-m1.mjs`: passed
- 표준 C 하네스: docs 통과 후 cross-owner ownership guard에서 예상 중단
- C 하네스 `-SkipOwnership`: Prisma, baseline, Docker/env, AI golden, smoke 단계 통과

## NE-M2 Implementation Status (2026-07-14)

팀원 리뷰 대기 항목을 제외한 로컬 구현 완성도는 `100%`다. 리뷰 요청은 `ncs-recruiting-question-generation-review-requests.md`의 `NE-M2 Cross-owner Review Handoff`에서 별도로 추적한다.

| Deliverable | Status | Evidence |
| --- | --- | --- |
| canonical profile 설정 | COMPLETE | C API·seed·설정 UI를 `JOB_TECHNICAL`, `COLLABORATION_COMMUNICATION`, `PROBLEM_SOLVING`로 통일 |
| 가중치 저장 gate | COMPLETE | 0 이상 정수·합계 100 검증과 `INTERVIEW_NCS_WEIGHT_INVALID` 422 응답 |
| 최초 기본 가중치 | COMPLETE | NCS 최초 전환에서만 30/30/40 제공, 기존 저장값은 유지 |
| 질문 binding cardinality | COMPLETE | 질문당 canonical profile 1~2개, 중복·3개 이상·다른 공고 criterion 차단 |
| 원자 저장과 호환 projection | COMPLETE | question row와 `question_ncs_bindings`를 한 Prisma mutation으로 저장하고 첫 binding을 단일 필드로 유지 |
| 설정 UI | COMPLETE | NCS 질문 생성·수정 drawer에서 두 번째 평가 기준을 선택적으로 연결 |

검증 결과:

- API typecheck: passed
- C 서비스 테스트: 25 passed
- frontend typecheck 및 전체 테스트: passed
- Prisma Client generate: passed

## Commit Strategy

각 milestone은 기존 Conventional Commits 규칙에 따라 별도 commit으로 유지한다.

| Milestone | Suggested commit title |
| --- | --- |
| NE-M0 | `docs(ncs): 최종 채용 평가 계약과 통합 마일스톤 확정` |
| NE-M1 | `feat(ncs): 다중 역량 평가 저장 구조와 호환 마이그레이션 추가` |
| NE-M2 | `feat(interview): NCS 가중치와 역량 연결 검증 추가` |
| NE-M3 | `feat(interview): NCS 세션 스냅샷과 최소 문항 검증 추가` |
| NE-M4 | `feat(ai): NCS 5점 답변 평가 어댑터 연결` |
| NE-M5 | `feat(ai): NCS 꼬리질문 근거 보강 평가 추가` |
| NE-M6 | `feat(report): NCS 가중 집계와 임시 판정 정책 추가` |
| NE-M7 | `test(ncs): NCS 최종 평가 E2E와 리포트 검증 추가` |
| NE-M8 | `fix(report): NCS 평가 미완료 판정을 보류 정책으로 전환` |

변경 내용이 3개 이상이면 commit body에 주요 변경과 관련 Issue를 bullet로 기록한다.

## Required Contract Tests

- canonical profile ID와 legacy ID migration mapping
- 공통 질문과 개인화 질문 각각 binding 1개·2개
- binding 0개·3개·중복 차단
- 가중치 합계 99·101·음수·소수 차단
- 세 profile 각각 정확히 2문항인 경계와 1문항인 실패
- 답변 하나에서 profile별 평가 row 두 개 저장
- 행동 3 + 논리 2의 0점·3점·5점 경계
- base/follow-up evidence source answer ID 구분
- combined score가 base score보다 낮을 때 base 유지
- `INSUFFICIENT_INPUT`, `LOW_ALIGNMENT`, `BLOCKED`에서 점수 NULL
- `INCOMPLETE`에서 total NULL과 임시 AI decision FAIL 동시 유지
- 총점 79/80, profile 평균 2.99/3 경계
- AI decision이 application screening decision을 자동 변경하지 않음
- API-020 V1 PASS, 정상 FAIL, incomplete fail-closed fixture schema 검증
- V1 finding의 모든 evidence ID가 실제 evidence와 연결됨
- 0점과 NULL, 정상 기준 미달 FAIL과 평가 미완료 FAIL 표시 구분

## Review Gates

1. NE-M1 전 A/D/E가 migration cardinality와 ownership을 승인한다.
2. NE-M3 전 D가 세션 생성 transaction과 `answerTimeSec` snapshot을 승인한다.
3. NE-M4 전 E가 behavior ID, logic dimension, evaluator output adapter를 승인한다.
4. NE-M6 전 PM/B가 임시 `INCOMPLETE -> FAIL` 표시 문구와 application 비변경을 승인한다.
5. NE-M7 전 E/B가 producer projection과 consumer view model이 `NcsReportEvaluationOutputV1` 하나만 공유하는지 확인한다.
6. NE-M7 종료 전 실제 PostgreSQL migration, OpenAI provider smoke test와 PASS/FAIL/INCOMPLETE 브라우저 E2E를 수행한다.
7. NE-M8은 발표 종료 직후 별도 Issue로 추적한다.

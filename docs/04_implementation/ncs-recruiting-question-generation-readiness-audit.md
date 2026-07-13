# NCS Recruiting Question Generation Readiness Audit

## Scope

NQ-M0 계약을 다시 읽고 다음을 분리한다.

1. C가 단독 보완할 수 있는 문서·계약 정합성
2. 팀원 결정이 필요한 cross-owner 항목
3. 후속 milestone에서 구현할 코드·DB 작업

- Audit date: 2026-07-14
- Branch: `feat/ncs-interview-question-generation-readiness`
- Review source: [ncs-recruiting-question-generation-review-requests.md](./ncs-recruiting-question-generation-review-requests.md)

## Current Assessment

| Area | State | Meaning |
| --- | --- | --- |
| NQ-M0 문서 작성 | COMPLETE | API, enum, 논리 모델, 제품 흐름, 테스트 기준 작성 완료 |
| C 자체 정합성 보완 | COMPLETE | 이번 audit에서 발견한 C 범위 모순과 누락 보정 |
| Cross-owner sign-off | PENDING | review request의 M0 blocker 승인 필요 |
| NQ-M1 코드/DB/UI | NOT_STARTED | 리뷰 반영 후 별도 구현 |
| NQ-M2~M4 통합 | NOT_STARTED | E/D/A 계약과 선행 milestone 필요 |

## Hardened In This Audit

| ID | Issue | Resolution |
| --- | --- | --- |
| C-H01 | 질문 생성 정책 table을 NQ-M3로 미뤄 NQ-M1 UI가 저장할 곳이 없음 | 정책 table과 NCS criteria snapshot을 NQ-M1 물리 구현으로 이동 |
| C-H02 | 정책 row가 없는 기존 공고의 API-034 응답이 불명확 | LEGACY, 질문 수 0/0, policyVersion 0, 빈 allocation projection 정의 |
| C-H03 | 설정 화면의 단일 resume status가 여러 지원자 상태로 오해될 수 있음 | API-034는 DISABLED/WAITING_APPLICATION만, 실제 지원자 상태는 API-098로 분리 |
| C-H04 | LEGACY 배점 규칙과 NCS 합계 100 규칙이 섞임 | LEGACY는 현재 1~100 합계, NCS 3개는 합계 100으로 분리 |
| C-H05 | criteriaVersion과 policyVersion 최초 저장·transaction 규칙 누락 | 미설정 version 0, 최초 저장 1, criteria/policy 변경과 version 증가 원자 처리 정의 |
| C-H06 | JD/이력서 개수별 profile allocation 해석이 모호함 | 3/0, 0/3, 1/2, 2/1, 4/2 예시 추가 |
| C-H07 | 수동/AI 질문 저장 시 NCS metadata 출처가 불명확 | criterion에서 snapshot, AI는 process output의 ALIGNED 후보 검증, 수동은 NOT_EVALUATED 정의 |
| C-H08 | milestone의 lowercase draft type이 최종 API enum과 다름 | C API uppercase enum과 E adapter lowercase mapping으로 정리 |
| C-H09 | milestone에 tentative table/status가 확정 계약과 충돌 | 실제 table 이름, version field, batch status로 갱신 |
| C-H10 | 새 계약이 C agent 지시서에 없음 | agent-c와 one-time alignment에 API-097~099와 NQ 문서 추가 |

## Remaining Cross-Owner Decisions

세부 내용은 review request에서만 관리한다. 아래는 우선순위 요약이다.

### M0 Exit Blockers

- `R-E-01`: NCS adapter canonical shape
- `R-E-02`: alignment retry/fallback와 수동 질문 검증
- `R-E-03`: batch/process retry history
- `R-D-01`: 지원 완료·문서 추출 trigger
- `R-D-02`: session gate와 질문 순서
- `R-D-03`: 변경된 정책·기준·JD·이력서의 stale 처리
- `R-B-01`: JD 정본과 `jd_snapshot_hash`
- `R-A-01`: shared enum/DTO/migration 소유권
- `R-A-02`: SQS idempotency/PII
- `R-PM-01`: 질문 개수와 초기 UX
- `R-PM-02`: REVIEW_REQUIRED 운영 방식
- `R-PM-03`: 고정 NCS 태그 콘텐츠
- `R-X-01`: API-039 질문 세트와 API-097 정책의 정본 관계

### Later Milestone Reviews

- `R-E-04`: 질문 privacy/unsafe guardrail
- `R-A-03`: feature flag와 rollout source
- `R-PM-04`: 개인정보 고지·보관·삭제

## C-Owned Follow-Up By Milestone

### NQ-M1

- `criterion_tags`, `evaluation_criteria`에 nullable NCS snapshot 반영
- `interview_question_generation_policies` Prisma model/migration/repository 추가
- API-034/036/097 DTO, validation, optimistic version test 구현
- 기존 공고의 policyVersion 0 projection과 LEGACY 회귀 테스트
- 2단계 JD/이력서 질문 수 control과 allocation preview 구현
- A가 승인한 capability/feature flag로 LEGACY와 NCS 화면 분기

### NQ-M2

- API-038 요청을 저장된 policy/JD/criteria 정본 기반으로 전환
- common question candidate에 NCS metadata/alignment result 표시
- API-037이 `sourceProcessLogId`의 ALIGNED 후보만 적용하도록 검증
- question_bank NCS snapshot과 source process reference 반영
- R-X-01 결정에 따라 API-039/039A를 정책과 동기화

### NQ-M3 And Later

C 단독 구현 대상이 아니다.

- NQ-M3: application batch/question table, document trigger, worker
- NQ-M4: session snapshot과 최종 질문 순서
- NQ-M5: 답변 평가와 점수/근거
- NQ-M6: rollout, privacy, failure recovery E2E

## Additional Risks Found

### JD Mutation Is Not In The Current Business Key

현재 멱등 key는 policy, criteria, resume hash만 포함한다. JD가 변경되면 같은 key로 오래된 개인화 질문을 재사용할 수 있다. `R-B-01`에서 `jd_snapshot_hash` 포함 여부를 승인해야 한다.

### No Stale State

READY 이후 policy/criteria/JD/resume가 바뀌었을 때 사용할 상태가 없다. 현재 enum만으로는 READY를 유지하거나 부정확한 WAITING_DOCUMENT로 되돌려야 한다. `R-D-03`에서 `STALE` 추가 여부를 결정해야 한다.

### Two Question Count Sources

API-039의 `questionCount`와 API-097의 `jdCriteriaQuestionCount`가 동시에 존재한다. NCS에서 둘이 다르면 세션 질문 수가 결정되지 않는다. `R-X-01` 승인 전에는 NQ-M2 질문 세트 구현을 시작하지 않는다.

### Manual NCS Question Alignment

수동 질문은 criterion binding을 snapshot할 수 있지만 alignment 검증 없이 NCS 평가용으로 사용할지 결정되지 않았다. `R-E-02`, `R-PM-02`에서 확정한다.

### Retry Audit Trail

batch에 process log FK 하나만 두면 재시도 이력이 덮인다. `R-E-03` 승인 후 `latest_process_log_id`, `attempt_count`, question의 `source_process_log_id`를 schema에 반영한다.

## Recommended Next Order

1. M0 blocker review 문서를 각 owner에게 전달한다.
2. E, D, B, A, PM 순서가 아니라 병렬로 답변을 받고 Review ID별로 기록한다.
3. 충돌하는 답변만 C/PM이 짧게 조정한다.
4. 승인 결과를 contract -> architecture -> product 순으로 반영한다.
5. NQ-M0 status를 REVIEW_COMPLETE로 바꾼다.
6. NQ-M1은 `medium` 추론 강도로 구현한다.

NQ-M1에서 API/DB 구현이 시작되므로 리뷰 결과가 필드명·상태 enum·migration 위치를 바꿀 가능성이 있다. M0 blocker 승인 전에는 화면 skeleton 이상의 구현을 진행하지 않는다.

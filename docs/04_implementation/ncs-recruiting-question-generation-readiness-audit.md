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
| NQ-M1 코드/DB/UI | COMPLETE | 정책 table/API/UI와 NCS criteria snapshot 구현 완료 |
| NQ-M2 통합 | COMPLETE | worker 정렬 adapter, 서버 요청 snapshot, 질문 metadata 저장 검증, UI 미리보기 구현 완료 |
| NQ-M3 통합 | COMPLETE | 지원 완료·문서 추출·개인화 질문 비동기 파이프라인과 조회·재시도 API 구현 완료 |
| NQ-M4 통합 | COMPLETE | M3 READY batch와 ACTIVE 공통 질문을 불변 세션 snapshot으로 연결 완료 |

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

- [x] API-038 요청을 저장된 policy/JD/criteria 정본 기반으로 전환
- [x] common question candidate에 NCS metadata/alignment result 표시
- [x] API-037이 `sourceProcessLogId`의 ALIGNED 후보만 적용하도록 검증
- [x] question_bank NCS snapshot과 source process reference 반영
- [x] R-X-01 결정에 따라 API-039/039A를 정책과 동기화

검증 결과:

- worker: 97 tests passed
- API: 40 suites, 257 tests passed
- frontend: M3 변경 없음, M2 typecheck 및 전체 test 통과 상태 유지
- Prisma schema: `prisma validate` passed

D/E/A/PM 교차 리뷰는 구현 완료 후 승인 단계로 남긴다. 교차 리뷰에서 계약 변경이 요청되면 후속 보정 커밋으로 반영한다.

### NQ-M3 Implementation

2026-07-14 기준 구현 완료했다.

- `application_interview_question_batches`, `application_interview_questions`와 migration 추가
- 지원서 제출 시 `DOCUMENT_EXTRACT`, 추출 완료 시 `RESUME_QUESTION_GENERATE` 자동 발행
- policy/criteria/JD/resume snapshot business key 기반 멱등 처리와 `STALE` 전이 구현
- NCS alignment, 민감정보 guardrail, 지원자별 결과 격리와 원문 비노출 검증
- API-098 상태·결과 조회와 API-099 명시적 재시도 구현
- M4 세션 합성 전에 `R-D-02`와 M3 cross-owner review를 완료해야 함

### NQ-M4 Implementation

2026-07-14 기준 구현 완료했다.

- `R-D-02` 권장안을 승인하고 API-017/API-065가 동일한 snapshot 준비 함수를 사용하도록 연결
- application advisory lock과 단일 transaction 안에서 현재 정책·기준 version, JD/이력서 hash, 질문 수를 검증
- ACTIVE 질문 세트의 `JD_CRITERIA + ALIGNED` 질문을 먼저, 현재 READY batch의 `RESUME_PERSONALIZED + ALIGNED` 질문을 다음에 저장
- `interview_session_questions`에 원본 FK, session runtime ID, 기준명, NCS profile/mode/version, alignment 결과와 정책 version snapshot 추가
- 이미 질문 snapshot이 있는 세션은 현재 설정 변경과 무관하게 다시 쓰지 않도록 불변성 보장
- 채용 runtime이 session runtime ID와 snapshot 본문을 읽고 답변도 같은 ID로 복원하도록 보정
- 개인화 질문 미준비는 `INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY`, 공통 질문 불일치는 `INTERVIEW_QUESTION_COUNT_INVALID`로 두 진입점 모두 차단

검증 결과:

- Prisma format/generate 통과
- Prisma schema validate 통과 (`DATABASE_URL`은 schema 검증용 로컬 값 사용)
- M4 집중 테스트: 4 suites, 44 tests passed
- 전체 API 회귀: 41 suites, 264 tests passed

D/E/A/PM 교차 리뷰와 실제 PostgreSQL migration 적용 검증은 PR 단계에서 남긴다.

## Additional Risks Found

### JD Mutation In Business Key (Resolved For M3)

멱등 key를 `applicationId + policyVersion + criteriaVersion + jdSnapshotHash + resumeDocumentHash`로 확정했다. JD가 변경되면 새 batch가 생성되고 기존 batch는 `STALE`이 된다.

### Stale State (Resolved For M3)

`STALE` 상태를 공통 enum, DB projection, API-098/099에 반영했다. 기존 interview session에는 소급하지 않는다.

### Two Question Count Sources (Resolved For M2)

NCS에서는 API-097의 `jdCriteriaQuestionCount`를 정본으로 사용한다. API-038과 API-039가 전달받은 legacy `questionCount`는 저장된 값과 다르면 거부하고, ACTIVE 질문 세트에는 `JD_CRITERIA + ALIGNED` 질문만 포함한다.

### Manual NCS Question Alignment

수동 질문은 criterion binding을 snapshot할 수 있지만 alignment 검증 없이 NCS 평가용으로 사용할지 결정되지 않았다. `R-E-02`, `R-PM-02`에서 확정한다.

### Retry Audit Trail (Resolved For M3)

batch에 `latest_process_log_id`, `attempt_count`를 저장하고 재시도마다 새 process log를 만든다. 최종 질문은 `source_process_log_id`로 생성 process를 추적한다.

## Recommended Next Order

1. D/E/A/PM에게 M3/M4 cross-owner 변경과 `R-E-04`, `R-A-01`, `R-PM-04`를 병렬 리뷰 요청한다.
2. 실제 PostgreSQL에 M1~M4 migration을 순서대로 적용하고 NCS 3+3 질문 세션 생성 smoke test를 수행한다.
3. 동료 NCS 평가기 계약을 최신 상태로 비교해 M5 입력 DTO와 근거 부족 상태를 확정한다.
4. NQ-M5는 `xhigh` 추론 강도로 구현한다.

NQ-M1에서 API/DB 구현이 시작되므로 리뷰 결과가 필드명·상태 enum·migration 위치를 바꿀 가능성이 있다. M0 blocker 승인 전에는 화면 skeleton 이상의 구현을 진행하지 않는다.

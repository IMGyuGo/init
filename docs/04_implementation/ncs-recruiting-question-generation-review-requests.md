# NCS Recruiting Question Generation Review Requests

## Purpose

NQ-M0에서 C가 단독 확정할 수 없는 cross-owner 결정만 모은다. 구현 아이디어나 C 자체 보완 항목은 이 문서에 섞지 않는다.

- Review branch: `feat/ncs-interview-question-generation-readiness`
- Contract baseline: `docs/03_contracts`, `docs/02_architecture/ncs-recruiting-question-generation.md`
- Status values: `PENDING`, `APPROVED`, `CHANGE_REQUESTED`, `NOT_APPLICABLE`
- NQ-M0 exit: 모든 `M0 BLOCKER`가 `APPROVED` 또는 반영 완료 상태여야 한다.

리뷰어는 각 ID에 아래 형식으로 답한다.

```text
Review ID: R-E-01
Decision: APPROVED | CHANGE_REQUESTED | NOT_APPLICABLE
Comment: 변경할 필드명, enum, 상태 전이 또는 이유
```

## Review Matrix

| ID | Decision | Primary Reviewer | Additional Review | Blocks | Decision Required |
| --- | --- | --- | --- | --- | --- |
| R-E-01 | APPROVED | E | C, PM | M0, M2, M5 | NCS profile ID/mode/version과 alignment output canonical shape |
| R-E-02 | APPROVED | E | C, PM | M0, M2 | 정렬 재시도, fallback, threshold 소유권 |
| R-E-03 | PENDING | E | A, C, D | M0, M3 | 개인화 질문 batch와 AI process retry 기록 방식 |
| R-E-04 | PENDING | E | A, PM | M3 | 질문 생성 guardrail과 민감정보 제거 결과 |
| R-D-01 | PENDING | D | B, E, C | M0, M3 | 지원 완료·문서 추출 완료 trigger와 이력서 snapshot 시점 |
| R-D-02 | PENDING | D | C, E, PM | M0, M4 | 세션 생성 readiness gate와 공통·개인화 질문 순서 |
| R-D-03 | PENDING | D | B, C, E, PM | M0, M3, M4 | 정책·기준·JD·이력서 변경 후 기존 batch 처리 |
| R-B-01 | APPROVED | B | C, E | M0, M2, M3 | 생성 입력으로 사용할 JD 정본과 JD version/hash |
| R-A-01 | PENDING | A | C, D, E | M0, M1, M3 | shared enum/DTO/error 위치와 migration 소유권 |
| R-A-02 | PENDING | A | E, D | M0, M3 | SQS 멱등 claim/lease, retry, PII log 기준 |
| R-A-03 | PENDING | A | C, PM | M1 | frontend/backend feature flag 이름과 rollout source |
| R-PM-01 | PENDING | PM | C | M0, M1 | 질문 개수 범위·초깃값·경고/차단 UX |
| R-PM-02 | APPROVED | PM | C, E | M0, M2, M3 | REVIEW_REQUIRED 운영 정책과 수동 승인 허용 여부 |
| R-PM-03 | PENDING | PM | C, E | M0, M1 | NCS 3개 태그 표시명·설명·초기 배점·합격점 |
| R-PM-04 | PENDING | PM | A, D, E | M3, M6 | 이력서 질문의 보관 기간·지원자 고지·운영자 노출 범위 |
| R-X-01 | APPROVED | C | D, E, PM | M0, M2, M4 | API-039 질문 세트와 API-097 질문 생성 정책의 정본 관계 |

## E Review

### M2 Implementation Decision (2026-07-14)

사용자가 cross-owner 보류 사항을 저장소 기준으로 해소하고 M2를 진행하도록 승인했다. 아래 결정은 M2 구현 기준이며 E/A/PM 교차 리뷰 대상이다.

- `R-E-01`: worker가 `NcsQuestionAlignmentAdapter`를 소유한다. 외부 결과는 `status`, `score`, `reason`, `evaluatorVersion`, `profileVersion`으로 고정한다.
- `R-E-02`: 같은 profile/mode로 최초 생성 후 최대 2회 재생성하고, 허용된 fallback 1회를 적용한다. 임계값은 worker adapter 내부 버전 상수로만 관리한다.
- `R-B-01`: API body의 JD를 신뢰하지 않고 `postings.job_description`을 정본으로 사용한다. M2 job에는 server-side snapshot만 전달한다.
- `R-PM-02`: `ALIGNED` 후보만 질문 뱅크에 적용할 수 있다. `LOW_ALIGNMENT`, `REVIEW_REQUIRED` 강제 승인은 제공하지 않는다.
- `R-X-01`: NCS 질문 수 정본은 API-097의 `jdCriteriaQuestionCount`다. API-039는 이 값과 동일한 JD 공통 질문만 ACTIVE 세트에 포함한다.

팀원 브랜치의 `profileVersion=2025.12-v1`, question coverage 계산, threshold `0.6`을 worker adapter v1의 초기 구현으로 채택한다. C API/UI에는 threshold를 복제하지 않는다.

### R-E-01 NCS Adapter Canonical Contract

확인할 값:

- E adapter profile ID: `problem-solving`, `communication`, `digital`
- C API enum: `PROBLEM_SOLVING`, `COMMUNICATION`, `DIGITAL`
- question mode: `EXPERIENCE_BEHAVIOR`, `TECHNICAL_KNOWLEDGE`, `SITUATIONAL_DESIGN`
- output: `status`, `score?`, `reason?`, `evaluatorVersion?`, `profileVersion?`
- score 범위와 nullable 조건

권장안:

- 외부 API/DB는 uppercase enum을 사용하고 E adapter 경계에서 lowercase profile ID로 변환한다.
- C는 evaluator threshold와 profile version 값을 하드코딩하지 않는다.
- adapter가 `evaluatorVersion`과 `profileVersion`을 결과에 반드시 포함한다.

승인 후 반영:

- `docs/03_contracts/enums.md`
- `docs/03_contracts/api-spec.md` API-038, API-098
- `backend/common/src/enums` 또는 E 소유 adapter type

### R-E-02 Alignment Retry And Fallback

확인할 값:

- 동일 profile/mode 재작성 최대 횟수
- fallback 허용 조합
- `LOW_ALIGNMENT`와 `REVIEW_REQUIRED`를 나누는 조건
- alignment threshold의 source와 version 정책
- NCS 수동 작성 질문도 alignment 검증을 통과해야 세션에 포함할지

권장안:

- 같은 mode로 최대 2회 재작성한다.
- `PROBLEM_SOLVING`: `EXPERIENCE_BEHAVIOR -> SITUATIONAL_DESIGN`
- `COMMUNICATION`: fallback 없음
- `DIGITAL`: 실제 수행 경험이 있을 때만 `TECHNICAL_KNOWLEDGE -> EXPERIENCE_BEHAVIOR`
- threshold와 판정은 E adapter만 소유한다.

### R-E-03 Batch And Process Retry History

현재 logical model은 business key별 batch 하나를 사용하지만 retry마다 새 `ai_process_logs`가 필요하다.

권장안:

- 같은 business key의 batch는 재사용한다.
- retry마다 새 `processLogId`를 생성한다.
- batch에는 `latest_process_log_id`, `attempt_count`를 둔다.
- 생성된 질문에는 최종 성공 또는 검토 결과를 만든 `source_process_log_id`를 둔다.
- `ai_process_logs.status=COMPLETED`와 batch의 `REVIEW_REQUIRED`를 같은 상태로 합치지 않는다.

### R-E-04 Guardrail Output

확인할 값:

- 학교, 나이, 성별, 외모, 가족관계 등 민감속성 제거 정책
- 이력서에 없는 경험을 전제하는 질문의 차단/재작성 기준
- guardrail 결과와 alignment 결과의 실행 순서
- `alignment_reason`, `failure_reason`에 허용되는 이력서 인용 범위

권장안:

- alignment 검증 후 privacy/unsafe guardrail을 통과한 결과만 저장한다.
- 원문 문장 인용 대신 경험 식별에 필요한 최소 명사구만 질문에 사용한다.
- BLOCKED 결과는 개인화 질문 table에 최종 저장하지 않는다.

## D Review

### R-D-01 Application And Document Trigger

확인할 값:

- trigger source: `application_status=SUBMITTED`와 resume document `parse_status=EXTRACTED`
- 지원 완료 이후 이력서 교체 허용 여부
- document extraction 완료 이벤트를 API가 발행할지 worker가 후속 job을 생성할지
- duplicate event 처리 책임

권장안:

- 두 상태가 모두 충족될 때만 `RESUME_QUESTION_GENERATE`를 생성한다.
- E document worker가 추출 완료 transaction 이후 후속 job 조건을 평가한다.
- 지원 완료 시점의 `application_documents`를 snapshot 정본으로 사용한다.

### R-D-02 Session Gate And Question Order

확인할 값:

- `resumeQuestionCount > 0`인데 batch가 READY가 아닐 때 세션 생성과 면접 시작을 모두 막을지
- JD 공통 질문과 이력서 질문의 합성 순서
- 세션 생성 transaction에서 snapshot 실패 시 전체 rollback 여부

권장안:

- API-017과 API-065 모두 `INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY`로 차단한다.
- 공통 질문을 먼저, 개인화 질문을 다음에 배치하고 각 source 안에서는 allocation `sortOrder`를 사용한다.
- 질문 수·version 검증과 session snapshot 저장은 하나의 transaction으로 처리한다.

### R-D-03 Changed Input And Stale Batch

아래 변경 후 기존 READY batch를 그대로 사용할지 결정해야 한다.

- 질문 개수 정책 변경
- 평가 기준 또는 NCS binding 변경
- JD 변경
- 지원서 이력서 재추출/교체

권장안:

- version/hash가 현재값과 다르면 기존 batch를 세션에 포함하지 않는다.
- projection status에 `STALE`을 추가하고 명시적 재생성 후 READY로 전환한다.
- 이미 생성된 세션에는 변경을 소급하지 않는다.

`STALE` enum 추가는 A/E/D 승인 후 별도 계약 변경으로 진행한다.

## B Review

### R-B-01 JD Source And Version

확인할 값:

- 생성 입력 정본은 `postings.job_description`인지 별도 JD snapshot인지
- 공고가 DRAFT/OPEN인 동안 JD 수정 가능 범위
- JD 변경 시 기존 공통 질문과 지원자별 질문을 무효화할지

권장안:

- API 요청 body의 JD를 신뢰하지 않고 `postings.job_description`을 읽는다.
- generation input에 server-side `jd_snapshot_hash`를 포함한다.
- 개인화 질문 business key는 `applicationId + policyVersion + criteriaVersion + jdSnapshotHash + resumeDocumentHash`로 확장한다.
- OPEN 이후 JD 변경 정책은 B가 확정하며 기존 세션에는 소급하지 않는다.

## A Review

### R-A-01 Shared Contract And Migration Ownership

확인할 값:

- 신규 enum/DTO/error를 `backend/common`에 둘 범위
- Prisma migration 작성자와 적용 순서
- PostgreSQL unique/check constraint와 nullable legacy row 정책

권장안:

- 외부 API와 두 개 이상 package가 공유하는 enum/error만 `backend/common`에 둔다.
- C는 정책 table, E는 batch/question model, D는 session snapshot field 구현을 맡고 하나의 migration owner가 최종 통합한다.
- migration은 expand -> backfill/default projection -> enforce 순서로 적용한다.

### R-A-02 SQS Reliability And PII

확인할 값:

- `processLogId` claim/lease와 visibility heartbeat 구현 위치
- retry/DLQ 최대 횟수
- business key unique conflict 시 ack 정책
- CloudWatch와 `ai_process_logs`에 저장 가능한 input metadata

권장안:

- SQS message에는 ID, version, one-way hash만 포함한다.
- 원문과 extracted text는 message/log에 넣지 않는다.
- process delivery idempotency와 business idempotency를 각각 검증한다.

### R-A-03 Feature Flag And Rollout

확인할 값:

- frontend와 backend가 각각 env flag를 가질지
- API capability response 하나를 source of truth로 사용할지
- dev/staging/production 기본값과 rollback 방식

권장안:

- backend capability를 정본으로 하고 API-034가 `capabilities.ncsQuestionConfiguration`을 반환한다.
- frontend는 capability가 없거나 false이면 기존 LEGACY 화면을 유지한다.
- 실제 flag 이름과 배포 환경변수는 A가 확정한다.

## PM Review

### R-PM-01 Count Policy And UX

현재 권장안:

- 저장 전 projection: JD 0, 이력서 0, `policyVersion=0`
- LEGACY 저장: 합계 1~20
- NCS 저장: 합계 3~20, 각 source 0~20
- profile 미배정은 NCS에서 경고가 아니라 저장 차단

확인할 UX:

- source별 초깃값
- 질문 수 변경 시 기존 생성 결과가 무효화된다는 경고
- 지원자가 있는데 이력서 질문 수를 0으로 바꿀 때 확인 문구

### R-PM-02 REVIEW_REQUIRED Operation

권장안:

- REVIEW_REQUIRED 질문은 자동 포함하지 않는다.
- M0/M1에서는 조회와 재생성만 제공한다.
- 면접관이 alignment 미달 질문을 강제 승인하는 기능은 제공하지 않는다.
- 수동 수정 후 재검증 기능이 필요하면 별도 API와 audit log를 추가한다.
- NCS 수동 작성 질문을 검증 없이 세션에 포함할지 여부는 R-E-02와 함께 확정한다.

### R-PM-03 Fixed NCS Criteria Content

확인할 값:

- 화면 이름: 문제해결능력, 의사소통능력, 디지털능력
- 각 설명과 행동지표 문구
- 초기 배점 합계 100의 배분
- criterion별 `passScore` 사용 여부
- 순서 편집 허용 여부

권장안:

- 기본 순서는 문제해결 -> 의사소통 -> 디지털로 고정한다.
- 배점은 편집 가능하되 합계 100을 강제한다.
- NCS evaluator 점수 체계가 확정되기 전에는 criterion별 `passScore=null`을 기본값으로 둔다.

### R-PM-04 Privacy And Retention

확인할 값:

- 지원자 동의 문구에 개인화 질문 생성을 포함할지
- 개인화 질문과 batch/log 보관 기간
- 기업 화면에서 alignment reason/score를 누구에게 노출할지
- 지원 철회/계정 삭제 시 삭제 범위

## Cross-Domain Review

### R-X-01 Question Set Source Of Truth

현재 API-039는 별도 `questionCount`로 질문 세트를 만들고 API-097도 출처별 질문 수를 저장한다. 두 값이 다르면 세션 질문 개수가 불명확하다.

권장안:

- NCS framework에서는 API-097을 질문 개수 정본으로 사용한다.
- API-039의 `questionCount`는 NCS 요청에서 제거하거나 API-097의 JD count와 같을 때만 허용한다.
- ACTIVE 질문 세트에는 JD 공통 질문만 둔다.
- 개인화 질문은 질문 세트에 저장하지 않고 세션 생성 시 application batch에서 추가한다.
- NCS 세션의 최종 질문 수는 `jdCriteriaQuestionCount + resumeQuestionCount`와 정확히 같아야 한다.

## Review Completion

모든 M0 blocker가 정리되면 아래 순서로 반영한다.

1. 변경 요청을 `docs/03_contracts`에 반영한다.
2. 데이터/상태 변경을 `docs/02_architecture`에 반영한다.
3. 제품 문구와 acceptance를 `docs/01_product`, `test-strategy.md`에 반영한다.
4. 이 문서의 Decision을 갱신하고 리뷰어 이름/PR 링크를 기록한다.
5. NQ-M0 status를 `REVIEW_COMPLETE`로 변경한다.

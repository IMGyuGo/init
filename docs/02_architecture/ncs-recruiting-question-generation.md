# NCS Recruiting Question Generation Architecture

## Status

- Milestone: `NQ-M0`
- Scope: logical contract and ownership freeze
- Physical implementation: `NQ-M3`
- Review required: C, D, E, A, PM

이 문서는 NCS 기반 JD 공통 질문과 지원자별 이력서 질문의 저장 경계, 비동기 상태, 멱등성을 정의한다. NQ-M0에서는 Prisma schema, ERDCloud SQL, migration을 변경하지 않는다. 아래 logical model이 리뷰된 뒤 NQ-M3에서 물리 스키마를 반영한다.

## Design Decisions

1. 평가 체계 `NCS_3_PROFILE_V1`은 문제해결, 의사소통, 디지털 3개 profile을 정확히 한 번씩 사용한다.
2. JD 공통 질문은 `question_bank`에 저장하고 지원자별 이력서 질문은 application scope 저장소에 분리한다.
3. 이력서는 질문을 구체화하는 입력일 뿐 평가 기준이 아니다. 질문의 criterion/profile/mode 귀속은 저장된 공고 평가 기준이 결정한다.
4. 이력서 질문은 지원 완료와 이력서 추출 완료 후 생성한다. 지원서가 없는 공고 설정 단계에서는 개수와 allocation만 저장한다.
5. 면접 세션 생성 시 확정 질문을 `interview_session_questions`에 복사한다. 이후 정책·평가 기준·질문 변경을 기존 세션에 소급하지 않는다.
6. 이력서 원문과 추출 텍스트는 SQS message, 질문 결과, `ai_process_logs.output_ref`에 복제하지 않는다.
7. NCS 정렬 임계값과 판정 로직은 E의 versioned evaluator adapter가 소유한다. C/D는 판정 결과와 버전만 저장·소비한다.

## Logical Models

### criterion_tags and evaluation_criteria extension

`criterion_tags`는 NCS profile의 canonical binding을 제공하고, 공고별 `evaluation_criteria`는 저장 시 해당 binding을 snapshot으로 보존한다.

| Table | Field | Type | Rule |
| --- | --- | --- | --- |
| criterion_tags | ncs_profile_id | VARCHAR(50) NULL | `PROBLEM_SOLVING`, `COMMUNICATION`, `DIGITAL`; legacy tag는 NULL |
| criterion_tags | default_ncs_question_mode | VARCHAR(50) NULL | profile의 기본 question mode |
| criterion_tags | ncs_profile_version | VARCHAR(80) NULL | evaluator profile version |
| evaluation_criteria | ncs_profile_id | VARCHAR(50) NULL | 기준 저장 시 tag binding snapshot |
| evaluation_criteria | ncs_question_mode | VARCHAR(50) NULL | 기준 저장 시 기본 mode snapshot |
| evaluation_criteria | ncs_profile_version | VARCHAR(80) NULL | 기준 저장 시 profile version snapshot |

`NCS_3_PROFILE_V1`에서는 동일 `ncs_profile_version` 안의 profile 중복과 누락을 허용하지 않는다. legacy row는 세 필드가 모두 NULL일 수 있다.

### interview_question_generation_policies

Prisma model 이름은 `InterviewQuestionGenerationPolicy`로 고정한다. 공고별 한 행을 사용한다.

| Column | Definition | Description |
| --- | --- | --- |
| posting_id | BIGINT PRIMARY KEY | 정책이 적용되는 공고 FK |
| evaluation_framework | VARCHAR(50) NOT NULL DEFAULT 'LEGACY' | `LEGACY` 또는 `NCS_3_PROFILE_V1` |
| jd_criteria_question_count | INTEGER NOT NULL DEFAULT 0 | JD·평가 기준 공통 질문 수 |
| resume_question_count | INTEGER NOT NULL DEFAULT 0 | 지원자별 이력서 질문 수 |
| policy_version | INTEGER NOT NULL DEFAULT 1 | 질문 개수·framework 변경 시 증가 |
| criteria_version | INTEGER NOT NULL DEFAULT 1 | 평가 기준 저장 성공 시 증가 |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 수정 시각 |

두 질문 수의 합은 1~20이다. NCS framework에서는 합계가 3 이상이어야 한다. source/profile별 allocation은 위 값과 평가 기준 `sort_order`로 결정 가능하므로 별도 row로 중복 저장하지 않고 API 응답에서 계산한다.

### question_bank extension

JD 공통 질문만 기존 `question_bank`에 저장한다. 사용자가 적용하기 전 AI 후보는 `ai_process_logs` output에 draft로 남고, 적용 후 C 저장 API가 아래 snapshot을 기록한다.

| Field | Type | Rule |
| --- | --- | --- |
| generation_source | VARCHAR(50) NULL | AI 공통 질문은 `JD_CRITERIA`; manual/legacy는 NULL 가능 |
| ncs_profile_id | VARCHAR(50) NULL | 질문이 측정하는 NCS profile snapshot |
| ncs_question_mode | VARCHAR(50) NULL | 질문 생성·평가 mode snapshot |
| ncs_profile_version | VARCHAR(80) NULL | profile version snapshot |
| alignment_status | VARCHAR(40) NULL | `ALIGNED` 질문만 자동 적용 가능 |
| alignment_score | DECIMAL(8,6) NULL | evaluator가 score를 제공한 경우만 저장 |
| alignment_reason | TEXT NULL | 정렬 판정 사유 |
| evaluator_version | VARCHAR(80) NULL | 정렬 adapter version |
| source_process_log_id | BIGINT NULL | 생성 job FK |

각 AI 질문은 하나의 `criterion_id`와 하나의 profile/mode에만 연결한다.

### application_interview_question_batches

Prisma model 이름은 `ApplicationInterviewQuestionBatch`로 고정한다. 지원자별 생성 작업과 입력 snapshot을 추적한다.

| Column | Definition | Description |
| --- | --- | --- |
| batch_id | BIGINT PRIMARY KEY | 개인화 질문 묶음 PK |
| application_id | BIGINT NOT NULL | 지원서 FK |
| source_process_log_id | BIGINT NOT NULL | `RESUME_QUESTION_GENERATE` job FK |
| status | VARCHAR(40) NOT NULL | `GENERATING`, `READY`, `REVIEW_REQUIRED`, `FAILED` |
| policy_version | INTEGER NOT NULL | 생성 당시 정책 version |
| criteria_version | INTEGER NOT NULL | 생성 당시 평가 기준 version |
| input_version | VARCHAR(128) NOT NULL | 원문을 노출하지 않는 입력 snapshot 식별자 |
| resume_document_hash | VARCHAR(128) NOT NULL | 이력서 추출 입력 변경 검출용 hash |
| evaluator_version | VARCHAR(80) | batch 판정에 사용한 adapter version |
| failure_reason | TEXT | 실패 또는 검토 필요 사유 |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 마지막 상태 변경 시각 |

Business unique key:

```text
application_id + policy_version + criteria_version + resume_document_hash
```

`WAITING_APPLICATION`, `WAITING_DOCUMENT`, `DISABLED`는 공고 정책·지원서·문서 상태로 계산하는 projection이며 batch row로 저장하지 않는다.

### application_interview_questions

Prisma model 이름은 `ApplicationInterviewQuestion`으로 고정한다. 이 table은 `question_bank`와 섞지 않는다.

| Column | Definition | Description |
| --- | --- | --- |
| personalized_question_id | BIGINT PRIMARY KEY | 지원자별 질문 PK |
| batch_id | BIGINT NOT NULL | 생성 batch FK |
| criterion_id | BIGINT | 공고 평가 기준 FK; 삭제 시 NULL 허용 |
| criterion_title_snapshot | VARCHAR(200) NOT NULL | 기준 삭제 후에도 남는 표시/평가 snapshot |
| source | VARCHAR(50) NOT NULL DEFAULT 'RESUME_PERSONALIZED' | 질문 생성 출처 |
| question_type | VARCHAR(50) NOT NULL | 런타임 질문 유형 |
| content | TEXT NOT NULL | 최소 경험 맥락만 포함한 질문 본문 |
| ncs_profile_id | VARCHAR(50) NOT NULL | profile snapshot |
| ncs_question_mode | VARCHAR(50) NOT NULL | question mode snapshot |
| ncs_profile_version | VARCHAR(80) NOT NULL | profile version snapshot |
| alignment_status | VARCHAR(40) NOT NULL | `ALIGNED` 또는 `REVIEW_REQUIRED` |
| alignment_score | DECIMAL(8,6) | evaluator score |
| alignment_reason | TEXT | 판정 사유 |
| evaluator_version | VARCHAR(80) | adapter version |
| sort_order | INTEGER NOT NULL | batch 안의 질문 순서 |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |

`(batch_id, sort_order)`는 unique다. `READY` batch에는 요청 개수만큼의 `ALIGNED` 질문만 있어야 한다. `REVIEW_REQUIRED` 질문은 세션으로 복사하지 않는다.

### interview_session_questions extension

채용 면접 세션 질문은 공통 질문 또는 개인화 질문 중 하나를 참조하며 평가 metadata를 불변 snapshot으로 보존한다.

| Field | Type | Rule |
| --- | --- | --- |
| question_id | BIGINT NULL | JD 공통 질문 FK |
| personalized_question_id | BIGINT NULL | application 개인화 질문 FK |
| criterion_id | BIGINT NULL | 생성 당시 평가 기준 FK |
| generation_source | VARCHAR(50) NULL | `JD_CRITERIA`, `RESUME_PERSONALIZED`; legacy는 NULL |
| ncs_profile_id | VARCHAR(50) NULL | profile snapshot |
| ncs_question_mode | VARCHAR(50) NULL | mode snapshot |
| ncs_profile_version | VARCHAR(80) NULL | profile version snapshot |
| alignment_status | VARCHAR(40) NULL | 확정 당시 정렬 상태 |
| policy_version | INTEGER NULL | 세션 생성 당시 정책 version |
| criteria_version | INTEGER NULL | 세션 생성 당시 기준 version |

채용 NCS 질문은 `question_id`와 `personalized_question_id` 중 정확히 하나만 가진다. 기존 모의면접과 legacy 질문은 두 신규 필드 규칙의 적용 대상에서 제외한다.

## Ownership

| Resource | Write Owner | Read/Review Owner | Responsibility |
| --- | --- | --- | --- |
| NCS tag binding, evaluation criteria snapshot | C | E, PM | 3개 profile 구성과 criteria version |
| interview_question_generation_policies | C | D, E | 출처별 개수, framework, version |
| application submit/document state | D | C, E | 생성 선행 상태 제공 |
| application_interview_question_batches | E | C, D, A | worker 상태, 멱등성, 실패 사유 |
| application_interview_questions | E | C, D | 정렬·가드레일을 거친 개인화 질문 |
| question_bank common question snapshot | C | D, E | 면접관 적용 이후 공통 질문 정본 |
| interview_session_questions snapshot | D | C, E | 세션 생성 시 공통·개인화 질문 합성 |
| NCS evaluator and alignment threshold | E | C, D, PM | versioned 판정 및 근거 |
| SQS delivery, lease, deployment | A/E | C, D | 중복 전달과 재시도 안전성 |

## Version And Mutation Rules

- 질문 개수 또는 `evaluation_framework` 변경은 `policy_version`을 증가시킨다.
- 평가 기준 추가·삭제·순서·weight·NCS binding 변경은 `criteria_version`을 증가시킨다.
- 진행 중 batch의 입력 version은 변경하지 않는다. 새 정책/기준을 적용하려면 새 business key로 재생성한다.
- 세션 생성은 정책·기준·질문을 한 트랜잭션 snapshot으로 복사한다.
- 기준 삭제로 FK가 NULL이 되어도 질문의 profile/mode/version과 기준 제목 snapshot은 유지한다.

## Privacy Boundary

- `input_version`과 `resume_document_hash`는 원문 복구가 불가능한 식별자여야 한다.
- SQS message에는 database ID와 version/hash만 넣는다.
- worker는 권한이 있는 repository를 통해 추출 텍스트를 읽고 처리 종료 후 별도 사본을 만들지 않는다.
- 질문에는 학교, 나이, 성별, 외모 등 민감 속성을 포함하지 않는다.
- `alignment_reason`, `failure_reason`, log에는 이력서 원문 전체를 넣지 않는다.

## Physical Implementation Gate

NQ-M3에서 Prisma/SQL을 변경하기 전에 다음을 다시 확인한다.

- E의 NCS profile ID, mode, evaluator output/version 최종 계약
- D의 지원 완료·문서 추출 완료 이벤트와 세션 생성 transaction 경계
- A의 SQS idempotency/lease와 개인정보 로그 정책
- PM의 질문 개수 상한, 검토 필요 상태의 운영 UX

이 검토 전에는 같은 enum이나 table을 각 담당 브랜치에서 별도로 구현하지 않는다.

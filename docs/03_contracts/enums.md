# Enums

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

API와 DB에서 공유해야 하는 상태값을 정리한다.

## Implementation Enum Baseline

문서/DB enum 이름은 기존 `snake_case`를 유지하되 Prisma와 TypeScript에서는 아래 `PascalCase` 이름을 사용한다. 같은 enum을 frontend/backend/worker에서 중복 정의하지 않고 `backend/common/src/enums`를 기준으로 공유한다.

| Contract Enum | Prisma/TypeScript Enum |
| --- | --- |
| `user_type` | `UserType` |
| `current_user_type` | `CurrentUserType` |
| `auth_provider` | `AuthProvider` |
| `user_status` | `UserStatus` |
| `posting_status` | `PostingStatus` |
| `application_status` | `ApplicationStatus` |
| `document_status` | `DocumentStatus` |
| `interview_status` | `InterviewStatus` |
| `report_status` | `ReportStatus` |
| `application_summary_availability_status` | `CandidateApplicationAvailabilityStatus` (API read model only) |
| `application_summary_unavailable_reason` | `CandidateApplicationUnavailableReason` (API read model only) |
| `screening_decision` | `ScreeningDecision` |
| `screening_decision_reason_code` | `ScreeningDecisionReasonCode` |
| `interview_type` | `InterviewType` |
| `report_type` | `ReportType` |
| `document_type` | `DocumentType` |
| `consent_type` | `ConsentType` |
| `question_type` | `QuestionType` |
| `question_origin` | `QuestionOrigin` |
| `evaluation_framework` | `EvaluationFramework` |
| `ncs_profile_id` | `NcsProfileId` |
| `ncs_question_mode` | `NcsQuestionMode` |
| `ncs_threshold_result` | `NcsThresholdResult` |
| `ncs_ai_decision` | `NcsAiDecision` |
| `question_generation_source` | `QuestionGenerationSource` |
| `question_alignment_status` | `QuestionAlignmentStatus` |
| `ncs_answer_score_status` | `NcsAnswerScoreStatus` |
| `resume_question_generation_status` | `ResumeQuestionGenerationStatus` |
| `follow_up_generation_status` | `FollowUpGenerationStatus` |
| `follow_up_reason` | `FollowUpReason` |
| `follow_up_skip_reason` | `FollowUpSkipReason` |
| `notification_channel` | `NotificationChannel` |
| `ai_process_type` | `AiProcessType` |
| `ai_process_status` | `AiProcessStatus` |
| `guardrail_result` | `GuardrailResult` |
| `embedding_source_type` | `EmbeddingSourceType` |
| `posting_job_role_code` | `PostingJobRoleCode` |
| `posting_region_code` | `PostingRegionCode` |
| `posting_employment_type_code` | `PostingEmploymentTypeCode` |
| `posting_recruitment_type` | `PostingRecruitmentType` |
| `candidate_education_level` | `CandidateEducationLevel` |
| `candidate_degree_type` | `CandidateDegreeType` |
| `candidate_education_status` | `CandidateEducationStatus` |
| `candidate_activity_type` | `CandidateActivityType` |
| `candidate_credential_type` | `CandidateCredentialType` |

금지 이름: `EvaluationCriteria`, `QuestionBank`, `AIProcessLog`, `AIGuardrailLog`를 Prisma model/class 이름으로 새로 만들지 않는다.

### Enum Source of Truth

공통 enum의 원천은 이 문서와 `backend/common/src/enums`다. Prisma schema, backend DTO, frontend API client, worker payload에서 같은 enum을 새 이름으로 중복 정의하지 않는다.

- 문서/DB enum 이름: `snake_case`
- Prisma/TypeScript enum 이름: `PascalCase`
- enum value: `UPPER_SNAKE_CASE`
- frontend는 API 응답 string literal을 임의로 재정의하지 않고 `backend/common/src/enums`에서 공유 가능한 타입 또는 API client adapter 타입을 사용한다.
- enum 추가/삭제/rename은 이 문서, Prisma schema, `backend/common/src/enums`, API 계약을 같은 PR에서 수정한다.

### Posting Filter Taxonomy

지원자 공고 필터용 구조화 값이다. 지원자에게 그대로 노출되는 라벨이므로 예외적으로 value를 한글 라벨로 사용한다(UPPER_SNAKE_CASE 규칙 예외). 원천은 `backend/common/src/enums`이며 공고 생성/수정 DTO와 지원자 공고 목록 필터가 공유한다. 값이 없으면 `postings`의 해당 컬럼은 NULL이고 해당 필터 대상에서 제외된다.

| Prisma/TypeScript Enum | Values |
| --- | --- |
| `PostingJobRoleCode` | 서버·백엔드, 프론트엔드, 웹풀스택, 안드로이드, iOS, 크로스플랫폼, DevOps·SRE, 데이터 엔지니어, AI·ML, QA·테스트, 시스템·네트워크, 보안, 블록체인, 개발 PM, 기타 IT·개발 |
| `PostingRegionCode` | 서울, 경기, 인천, 부산, 대구, 광주, 대전, 울산, 세종, 강원, 경남, 경북, 전남, 전북, 충남, 충북, 제주, 해외 |
| `PostingEmploymentTypeCode` | 정규직, 계약직, 인턴, 프리랜서 |
| `PostingRecruitmentType` | 상시, 마감형 |

경력 범위는 enum이 아닌 정수(`career_min_years`, `career_max_years`)로 표현하며 상한 상수는 `POSTING_CAREER_MAX_YEARS`(=10)다. 둘 다 있으면 `career_min_years <= career_max_years`를 만족해야 한다.

## Status Transition Baseline

상태 전이는 아래 표에 있는 방향만 허용한다. 예외 전이가 필요하면 `docs/03_contracts/enums.md`, `docs/02_architecture/data-model.md`, `docs/04_implementation/module-boundaries.md`를 먼저 수정한다.

| Enum | Owner | Allowed Transitions |
| --- | --- | --- |
| `posting_status` | B | `DRAFT -> OPEN -> CLOSING_SOON -> CLOSED -> ARCHIVED`, `DRAFT -> ARCHIVED`, `OPEN -> CLOSED` |
| `application_status` | B/D | `DRAFT -> SUBMITTED -> IN_REVIEW -> INTERVIEW_WAITING -> INTERVIEW_DONE -> COMPLETED`, `SUBMITTED -> CANCELED`, `IN_REVIEW -> CANCELED` |
| `document_status` | D/E | `NOT_SUBMITTED -> SUBMITTED -> EXTRACTING -> EXTRACTED`, `SUBMITTED -> FAILED`, `EXTRACTING -> FAILED`, `FAILED -> SUBMITTED` |
| `interview_status` | D | `NOT_READY -> READY -> IN_PROGRESS -> COMPLETED`, `READY -> FAILED`, `IN_PROGRESS -> FAILED` |
| `report_status` | E | `PENDING -> GENERATING -> COMPLETED`, `PENDING -> FAILED`, `GENERATING -> FAILED`, `FAILED -> GENERATING` |
| `ai_process_status` | E | `PENDING -> RUNNING -> COMPLETED`, `PENDING -> FAILED`, `RUNNING -> FAILED`, `FAILED -> PENDING` for explicit retry only |
| `resume_question_generation_status` | C/D/E | `WAITING_APPLICATION -> WAITING_DOCUMENT -> GENERATING -> READY`, `WAITING_DOCUMENT -> FAILED`, `GENERATING -> REVIEW_REQUIRED`, `GENERATING -> FAILED`, `READY -> STALE`, `REVIEW_REQUIRED -> STALE`, `STALE -> GENERATING`, `REVIEW_REQUIRED -> GENERATING`, `FAILED -> GENERATING` for explicit retry only |
| `screening_decision` | E | `UNDECIDED -> PASS`, `UNDECIDED -> HOLD`, `UNDECIDED -> FAIL`, `UNDECIDED -> RETRY`, `RETRY -> PASS`, `RETRY -> HOLD`, `RETRY -> FAIL`; 자동 판정 engine만 write |

상태를 되돌리는 rollback 전이는 기본 금지다. 운영자가 명시적으로 재처리하는 retry는 audit log 또는 `ai_process_logs`에 사유를 남긴다.

| Enum | Values | Description |
| --- |--- |--- |
| user_type | ADMIN, COMPANY, CANDIDATE | 사용자 유형 |
| current_user_type | ADMIN, COMPANY, CANDIDATE | API 권한 판단에 사용하는 CurrentUser 사용자 유형. `user_type`과 같은 값을 사용한다. |
| auth_provider | LOCAL, GOOGLE | 로그인/가입 방식 |
| user_status | ACTIVE, PENDING, SUSPENDED, DEACTIVATED | 계정 상태 |
| posting_status | DRAFT, OPEN, CLOSING_SOON, CLOSED, ARCHIVED | 공고 상태 |
| application_status | DRAFT, SUBMITTED, IN_REVIEW, INTERVIEW_WAITING, INTERVIEW_DONE, COMPLETED, CANCELED | 지원 진행 상태 |
| document_status | NOT_SUBMITTED, SUBMITTED, EXTRACTING, EXTRACTED, FAILED | 서류 제출/분석 상태 |
| interview_status | NOT_READY, READY, IN_PROGRESS, COMPLETED, FAILED | 면접 세션/응시 상태 |
| report_status | PENDING, GENERATING, COMPLETED, FAILED | 리포트 생성 상태 |
| application_summary_availability_status | AVAILABLE, UNAVAILABLE | `GET /candidate/applications` item의 조회 가능 여부. DB 상태 전이가 아닌 API read model이다. |
| application_summary_unavailable_reason | POSTING_NOT_FOUND, INTERVIEW_SESSION_NOT_FOUND | `availabilityStatus=UNAVAILABLE`일 때 반환하는 누락 의존성 사유 |
| screening_decision | UNDECIDED, PASS, HOLD, FAIL, RETRY | 자동 전형 판정. PASS/HOLD/FAIL은 유효 점수가 필수이며 평가 불가·점수 없음·STT terminal 실패는 RETRY |
| screening_decision_reason_code | PASS_TOTAL_AND_CRITERIA_MET, HOLD_TOTAL_BAND, HOLD_CRITERION_BELOW_PASS_SCORE, FAIL_BELOW_HOLD_THRESHOLD, RETRY_REPORT_FAILED, RETRY_STT_UNAVAILABLE, RETRY_EVALUATION_INCOMPLETE, RETRY_SCORE_MISSING | 자동 판정 사유. 지원자 API에는 노출하지 않음 |
| interview_type | MOCK, RECRUITING | 모의면접/채용면접 구분 |
| report_type | MOCK_INTERVIEW_REPORT, RECRUITING_REPORT | 리포트 구분 |
| document_type | RESUME, PORTFOLIO | 지원 서류 유형 |
| consent_type | PRIVACY_COLLECTION, AI_DOCUMENT_ANALYSIS, AI_INTERVIEW_RECORDING | 필수 동의 유형 |
| question_type | INTRO, TECHNICAL, EXPERIENCE, SITUATION, FOLLOW_UP, CLOSING | 면접 질문 유형 |
| question_origin | MANUAL, AI_GENERATED | 질문 최초 작성 출처 |
| evaluation_framework | LEGACY, NCS_3_PROFILE_V1, NCS_ACTIVE_PROFILE_V2 | 공고 면접 평가 체계. V1은 canonical 3개와 profile별 BASE 2개를 고정하고, V2는 `weight > 0`인 canonical profile 1~3개와 profile별 BASE 1개를 사용한다. |
| interview_session_mode | STANDARD, DEMO_PRESET | 공식 채용면접 질문 선택 모드. 기존 row와 생략 request는 STANDARD로 해석하며 최초 공식 session의 mode는 application에 대해 불변이다. |
| question_usage_scope | STANDARD, DEMO_PRESET | 질문 원본·개인화 batch·application 질문·session 질문의 사용 목적. 기존 row는 STANDARD다. |
| demo_preset_readiness_status | READY, PENDING, UNAVAILABLE | 3문항 공식 시연 면접 준비 projection. 별도 DB 상태로 저장하지 않는다. |
| demo_preset_readiness_reason | CANONICAL_PROFILES_NOT_ALL_ACTIVE, COLLABORATION_COMMON_QUESTION_MISSING, DEMO_PERSONALIZED_QUESTION_GENERATING, DEMO_PERSONALIZED_QUESTION_REVIEW_REQUIRED, DEMO_PERSONALIZED_QUESTION_FAILED, FACTUAL_ANCHOR_MISSING, OFFICIAL_SESSION_EXISTS, OFFICIAL_SESSION_MODE_CONFLICT, CONFIGURATION_COVERAGE_MISMATCH | 시연 면접 준비 또는 시작 불가 사유. READY 신규 session은 null이고 동일 DEMO session resume만 OFFICIAL_SESSION_EXISTS를 사용할 수 있다. |
| ncs_profile_id | JOB_TECHNICAL, COLLABORATION_COMMUNICATION, PROBLEM_SOLVING | 최종 채용 평가 NCS 프로필 식별자. migration 기간에는 `DIGITAL -> JOB_TECHNICAL`, `COMMUNICATION -> COLLABORATION_COMMUNICATION` compatibility read만 허용한다. E evaluator adapter는 각각 `digital`, `communication`, `problem-solving`로 매핑 |
| ncs_question_mode | EXPERIENCE_BEHAVIOR, TECHNICAL_KNOWLEDGE, SITUATIONAL_DESIGN | 답변에서 수집할 NCS 근거 유형. 기존 `question_type`과 별도 관리 |
| ncs_threshold_result | MEETS_THRESHOLD, BELOW_THRESHOLD, INCOMPLETE | deterministic NCS 기준 충족 결과. `INCOMPLETE`는 점수 NULL을 유지한다. |
| ncs_ai_decision | PASS, FAIL | NCS AI 추천 판정. 발표용 `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`에서는 `INCOMPLETE`를 FAIL로 표시하지만 실제 screening decision을 자동 변경하지 않는다. |
| question_generation_source | JD_CRITERIA, RESUME_PERSONALIZED | JD 공통 질문과 지원자별 이력서 질문의 생성 출처 |
| question_alignment_status | NOT_EVALUATED, ALIGNED, LOW_ALIGNMENT, REVIEW_REQUIRED | 질문과 선택 NCS 프로필의 정렬 검증 상태 |
| ncs_answer_score_status | SCORED, INSUFFICIENT_INPUT, LOW_ALIGNMENT, BLOCKED | 답변별 NCS 평가 상태. `SCORED`만 점수를 가지며 나머지 상태는 competency/evidence/total score가 모두 NULL |
| interview_answer_stt_status | NOT_SUBMITTED, PENDING, AVAILABLE, REANSWER_AVAILABLE, UNAVAILABLE, PROCESSING_FAILED | 질문 조회 API의 답변별 STT read model. DB enum이 아니며 `interview_answers`와 `ai_process_logs`에서 계산한다. |
| resume_question_generation_status | DISABLED, WAITING_APPLICATION, WAITING_DOCUMENT, GENERATING, READY, REVIEW_REQUIRED, FAILED | 공고/지원서 관점의 이력서 개인화 질문 준비 상태. `DISABLED`, `WAITING_APPLICATION`은 설정 조회 projection 값 |
| follow_up_generation_status | READY, INSERTED, SKIPPED | guardrail 통과 결과의 저장 상태. `READY`는 같은 transaction에서 즉시 `INSERTED` 또는 `SKIPPED`로 전이하며 정상 종료 후 장기 잔류하지 않는다. |
| follow_up_reason | NCS_EVIDENCE_GAP, FACT_CLARIFICATION, GENERAL_EVIDENCE_GAP | NCS 행동·논리 근거, 팩트 확인 또는 모의면접 일반 근거를 보완하는 꼬리질문 사유. NCS와 팩트 보완이 동시에 필요하면 질문은 하나만 만들고 `FACT_CLARIFICATION`을 정본 사유로 저장한다. |
| follow_up_skip_reason | NOT_REQUIRED, SESSION_NOT_IN_PROGRESS | base 평가상 불필요하거나 결과 저장 시 세션이 진행 중이 아니어서 질문을 추가하지 않은 사유 |
| notification_channel | EMAIL, IN_APP | 알림 채널 |
| ai_process_type | DOCUMENT_EXTRACT, STT, FOLLOW_UP, REPORT_GENERATE, EMBEDDING, GUARDRAIL_VALIDATE, CRITERIA_SUGGEST, QUESTION_GENERATE, RESUME_QUESTION_GENERATE, QUESTION_SET_GENERATE, POSTING_DRAFT_GENERATE | AI 처리 유형 |
| ai_process_status | PENDING, RUNNING, COMPLETED, FAILED | AI 처리 상태 |
| failure_category | RETRYABLE, NON_RETRYABLE, STT_RETRYABLE, REANSWER_REQUIRED, REGENERATION_REQUIRED, RETRY_EXHAUSTED | AI 실패 재시도 가능 여부. `STT_RETRYABLE`은 worker 자동 재시도, `REANSWER_REQUIRED`는 지원자 재답변이 필요한 인식 실패다. `REGENERATION_REQUIRED`는 생성·품질·정렬 검증을 소진해 사용자가 새 job을 시작해야 하는 질문 생성 실패다. `RETRY_EXHAUSTED`는 총 3회 자동 시도를 소진해 운영 확인이 필요한 terminal 실패다. `REGENERATION_REQUIRED`와 `RETRY_EXHAUSTED`는 queue 자동 redelivery를 하지 않고 현재 메시지를 ACK한다. |
| ai_retry_source | INITIAL, OPERATOR | 최초 job과 ADMIN 명시적 재처리 job의 audit source |
| guardrail_result | PASS, BLOCKED, REGENERATED | AI 안전 검증 결과 |
| embedding_source_type | POSTING_JD, CRITERION_TAG, QUESTION, APPLICATION_DOCUMENT, INTERVIEW_ANSWER, EVALUATION_REPORT | 임베딩 원천 유형 |
## NCS Question Mapping

`NcsQuestionMode`는 평가 근거 구조이고 `QuestionType`은 질문 뱅크/런타임 분류다. 두 enum을 같은 이름으로 합치지 않는다.

| NcsProfileId | Default NcsQuestionMode | QuestionType | Allowed Fallback |
| --- | --- | --- | --- |
| `PROBLEM_SOLVING` | `EXPERIENCE_BEHAVIOR` | `EXPERIENCE` | `EXPERIENCE_BEHAVIOR` -> `SITUATIONAL_DESIGN` -> `SITUATION` |
| `COLLABORATION_COMMUNICATION` | `EXPERIENCE_BEHAVIOR` | `EXPERIENCE` | 없음 |
| `JOB_TECHNICAL` | `TECHNICAL_KNOWLEDGE` | `TECHNICAL` | `TECHNICAL_KNOWLEDGE` -> `EXPERIENCE_BEHAVIOR` -> `EXPERIENCE` |

정렬점수 통과를 목적으로 질문 유형만 임의 변경하지 않는다. 최초 호출을 포함해 동일 profile/primary mode로 최대 3회 생성한 뒤 위 표의 directed fallback을 한 번만 허용한다. 허용하지 않은 reverse fallback, 다른 profile의 mode를 사용하는 cross-profile fallback, `COLLABORATION_COMMUNICATION`의 fallback은 모두 거부한다.

### NCS Answer Fact Check

| Enum | Values |
| --- | --- |
| `FactCheckVerdict` | `SUPPORTED`, `CONTRADICTED`, `AMBIGUOUS`, `UNVERIFIABLE`, `NOT_CHECKABLE` |
| `FactCheckProviderStatus` | `COMPLETED`, `FAILED`, `TIMEOUT`, `INVALID_OUTPUT` |
| `FactCheckGateStatus` | `PASS_THROUGH`, `CLARIFICATION_CANDIDATE`, `FACT_CHECK_REQUIRED` |
| `FactClaimType` | `TECHNICAL_FACT`, `PERSONAL_EXPERIENCE`, `OPINION`, `OTHER` |
| `FactClaimRole` | `ANSWER_CORE`, `SUPPORTING` |
| `FactEvidenceSourceKind` | `ANSWER_SNAPSHOT`, `RESUME_SNAPSHOT`, `JD_SNAPSHOT`, `KNOWLEDGE_SNAPSHOT` |

- provider 실행 실패 상태는 claim 판정과 구분한다. `FAILED`, `TIMEOUT`, `INVALID_OUTPUT`을 `UNVERIFIABLE`로 변환하지 않는다.
- gate precedence와 임계치는 [`ncs-answer-fact-check.md`](./ncs-answer-fact-check.md)의 versioned deterministic policy를 따른다.

## Candidate Profile Enums

| candidate_education_level | HIGH_SCHOOL, COLLEGE, UNIVERSITY, GRADUATE_SCHOOL, OTHER | 학력 구분 |
| candidate_degree_type | HIGH_SCHOOL_DIPLOMA, ASSOCIATE, BACHELOR, MASTER, DOCTORATE, OTHER | 학위 또는 대학 구분 |
| candidate_education_status | ENROLLED, LEAVE_OF_ABSENCE, GRADUATED, EXPECTED_GRADUATION, COMPLETED, WITHDRAWN | 재학·졸업 상태 |
| candidate_activity_type | SCHOOL_ACTIVITY, INTERNSHIP, CLUB, PROJECT_TASK, OVERSEAS_TRAINING, EDUCATION | 프로젝트·경험·활동·교육 구분 |
| candidate_credential_type | CERTIFICATE, LANGUAGE_TEST, AWARD | 자격·어학·수상 구분 |

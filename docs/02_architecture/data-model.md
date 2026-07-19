# Data Model

## Payment Addendum

상세 PM ERD 문서: `.PM/payments/결제-erd.md`

1단계 구현 테이블:

| Table | Purpose |
| --- | --- |
| `payment_customers` | 기업 사용자와 Toss `customerKey` 매핑 |
| `payment_orders` | 기업 후원형 AI 면접 크레딧 패키지와 지원자 모의면접 1회 이용권의 1회성 결제 주문, 승인 결과, 실패 기록 저장 |
| `candidate_mock_interview_pass_ledgers` | 신규 무료 3회, 유료 1회권 지급, 모의면접 시작 시 사용 차감 기록 |

이번 MVP에서는 결제 승인 주문과 지원자 모의면접 이용권 장부까지 저장한다.
`candidate_mock_interview_pass_ledgers.source`는 `FREE_SIGNUP`, `PURCHASE`, `USAGE`를 기본으로 쓰고,
테스트/데모 지급은 결제와 분리해 `DEV_GRANT`로만 기록한다.
`FREE_SIGNUP` 최초 지급은 동시 요청에서도 후보자당 한 번만 생성되도록
`candidate_id, source` 부분 유일 인덱스(`source = 'FREE_SIGNUP'`)로 보호한다.
기업 크레딧 지급/차감 장부는 다음 단계에서 `company_credit_ledgers` 같은 별도 테이블로 추가한다.
`payment_customers`와 `payment_orders`는 `company_id` 또는 `candidate_id` 중 하나만 가진다.
향후 구독/자동결제 단계에서는 `billing_keys`, `subscriptions`를 추가하고, 갱신 결제는
`payment_orders.type = SUBSCRIPTION_RENEWAL`로 기록한다.

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

도메인별 데이터 소유권과 주요 필드를 정리한다.

NCS 질문 생성의 NQ-M0 logical model과 version/privacy 규칙은 [ncs-recruiting-question-generation.md](./ncs-recruiting-question-generation.md)를 따른다. 해당 문서의 신규 table/column은 표에 지정된 milestone의 Prisma·SQL migration 전까지 물리 구현 baseline이 아니다.

## Implementation Naming Baseline

구현 시작 이후 팀별 이름 충돌을 줄이기 위해 DB, Prisma, TypeScript 코드에서 사용할 이름을 아래처럼 고정한다.

- DB table은 ERDCloud와 기존 계약 문서 기준의 `snake_case` 복수형을 유지한다.
- Prisma model은 `PascalCase` 단수형을 사용하고 DB table은 `@@map`으로 연결한다.
- Prisma field는 TypeScript 친화적인 `camelCase`를 사용하고 DB column은 `@map`으로 연결한다.
- Prisma enum은 `PascalCase`, enum value는 `UPPER_SNAKE_CASE`를 사용한다.
- 기존 구현에 다른 이름이 있다면 물리 DB rename보다 Prisma `@@map`/`@map`으로 먼저 흡수한다.

| DB Table | Prisma Model | Primary Owner |
| --- | --- | --- |
| `users` | `User` | A |
| `companies` | `Company` | A |
| `candidate_profiles` | `CandidateProfile` | A/D |
| `candidate_educations` | `CandidateEducation` | A/D |
| `candidate_careers` | `CandidateCareer` | A/D |
| `candidate_activities` | `CandidateActivity` | A/D |
| `candidate_credentials` | `CandidateCredential` | A/D |
| `candidate_folders` | `CandidateFolder` | D |
| `file_assets` | `FileAsset` | A/D/E |
| `postings` | `Posting` | B |
| `criterion_tags` | `CriterionTag` | C |
| `evaluation_criteria` | `EvaluationCriterion` | C |
| `question_bank` | `Question` | C |
| `question_ncs_bindings` | `QuestionNcsBinding` | C/E |
| `interview_time_policies` | `InterviewTimePolicy` | C |
| `applications` | `Application` | B/D |
| `application_documents` | `ApplicationDocument` | D/E |
| `consent_records` | `ConsentRecord` | D |
| `interview_sessions` | `InterviewSession` | D/E |
| `interview_session_ncs_policies` | `InterviewSessionNcsPolicy` | D/E |
| `interview_session_questions` | `InterviewSessionQuestion` | D/E |
| `application_question_ncs_bindings` | `ApplicationQuestionNcsBinding` | C/E |
| `session_question_ncs_bindings` | `SessionQuestionNcsBinding` | D/E |
| `interview_answers` | `InterviewAnswer` | D/E |
| `follow_up_questions` | `FollowUpQuestion` | E |
| `evaluation_reports` | `EvaluationReport` | E |
| `ncs_answer_evaluations` | `NcsAnswerEvaluation` | E |
| `ncs_answer_evaluation_evidences` | `NcsAnswerEvaluationEvidence` | E |
| `answer_fact_check_runs` | `AnswerFactCheckRun` | E |
| `answer_fact_check_claims` | `AnswerFactCheckClaim` | E |
| `answer_fact_check_evidences` | `AnswerFactCheckEvidence` | E |
| `report_scores` | `ReportScore` | E |
| `report_evidences` | `ReportEvidence` | E |
| `manual_evaluations` | `ManualEvaluation` | B/E |
| `notifications` | `Notification` | A/B |
| `ai_process_logs` | `AiProcessLog` | E |
| `ai_guardrail_logs` | `AiGuardrailLog` | E |
| `embeddings` | `Embedding` | E |

`question_bank`는 DB table 이름만 유지하고 Prisma model은 `Question`으로 둔다. row 하나가 질문 한 건이기 때문이다. `evaluation_criteria`의 Prisma model은 복수형 `EvaluationCriteria`가 아니라 단수형 `EvaluationCriterion`이다. `ai_*` 계열 class/model 이름은 TypeScript 관례에 맞춰 `AiProcessLog`, `AiGuardrailLog`처럼 쓴다.

### NQ-M0 Planned Naming

아래 이름은 계약 단계에서 고정한 logical target이다. 각 Physical Milestone 전에는 ERDCloud SQL이나 Prisma schema에 존재한다고 가정하지 않는다.

| DB Table | Prisma Model | Primary Owner | Physical Milestone |
| --- | --- | --- | --- |
| `interview_question_generation_policies` | `InterviewQuestionGenerationPolicy` | C | NQ-M1 |
| `application_interview_question_batches` | `ApplicationInterviewQuestionBatch` | E | NQ-M3 |
| `application_interview_questions` | `ApplicationInterviewQuestion` | E | NQ-M3 |

## Aggregates

| Aggregate | Owned Tables | Responsibility |
| --- |--- |--- |
| Account | users, companies, candidate_profiles, candidate_educations, candidate_careers, candidate_activities, candidate_credentials | 로그인 계정, 기업/지원자 구조화 프로필, 기본 파일 참조 |
| Recruiting | postings, criterion_tags, evaluation_criteria, question_bank, question_ncs_bindings, application_question_ncs_bindings, interview_time_policies | 공고, JD, 평가 기준, 질문, 면접 시간 정책 관리 |
| Application | applications, application_documents, consent_records | 지원서 제출, 서류 파싱, 동의 이력 |
| Interview | interview_sessions, interview_session_ncs_policies, interview_session_questions, session_question_ncs_bindings, interview_answers, follow_up_questions | 모의/채용 AI 면접 실행, 세션별 시간·가중치 정책과 질문 순서·profile snapshot, 답변 |
| Report | evaluation_reports, ncs_answer_evaluations, ncs_answer_evaluation_evidences, answer_fact_check_runs, answer_fact_check_claims, answer_fact_check_evidences, report_scores, report_evidences, manual_evaluations | 답변·profile별 NCS 평가, 점수와 분리된 사실 검증, exact evidence, AI 집계 결과와 면접관 검토 |
| AI Infra | ai_process_logs, ai_guardrail_logs, embeddings | AI 처리 상태, 안전성 검증, 검색/추천 |
| Notification/File | notifications, file_assets | 알림과 업로드 파일 메타데이터 |

## Table Columns

### users

| Column | Definition | Description |
| --- |--- |--- |
| user_id | BIGINT PRIMARY KEY | 서비스 내부 사용자 PK |
| email | VARCHAR(255) NOT NULL UNIQUE | 로그인 이메일. LOCAL/GOOGLE 모두 이메일은 계정 식별 및 알림에 사용 |
| password_hash | VARCHAR(255) | LOCAL 가입자는 필수, GOOGLE OAuth2 가입자는 NULL 가능 |
| user_type | VARCHAR(30) NOT NULL | 사용자 유형: ADMIN, COMPANY, CANDIDATE |
| name | VARCHAR(100) NOT NULL | 사용자 이름 |
| phone | VARCHAR(50) | 연락처 |
| status | VARCHAR(30) NOT NULL | 계정 상태: ACTIVE, PENDING, SUSPENDED, DEACTIVATED |
| created_at | TIMESTAMP NOT NULL | 계정 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 계정 수정 시각 |
| auth_provider | VARCHAR(30) NOT NULL | 인증 방식: LOCAL, GOOGLE |
| provider_user_id | VARCHAR(255) | OAuth2 provider가 내려주는 사용자 고유 ID 예: Google OAuth2의 sub 값 109876543210123456789 |

### companies

| Column | Definition | Description |
| --- |--- |--- |
| company_id | BIGINT PRIMARY KEY | 회사 PK |
| owner_user_id | BIGINT NOT NULL | 회사를 최초 등록한 기업 사용자 FK |
| name | VARCHAR(150) NOT NULL | 회사명 |
| business_registration_number | VARCHAR(10) NOT NULL UNIQUE | 사업자등록번호. DB에는 숫자만 정규화하여 저장하는 것을 권장 |
| verification_status | VARCHAR(30) NOT NULL | 사업자/회사 검증 상태: PENDING, VERIFIED, REJECTED |
| logo_file_id | BIGINT | 회사 로고 파일 메타데이터 FK. 원본 파일은 S3에 저장하고 DB에는 `file_assets` 참조만 저장 |
| industry | VARCHAR(100) | 산업군: IT, 제조, 금융, 교육 등 |
| profile | TEXT | 회사 소개글 |
| talent_profile | TEXT | 회사가 원하는 인재상. AI 평가 기준/질문 생성 참고 정보 |
| evaluation_policy | TEXT | 평가 정책. 예: 기술 50%, 협업 30%, 커뮤니케이션 20% |
| created_at | TIMESTAMP NOT NULL | 회사 정보 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 회사 정보 수정 시각 |

### file_assets

| Column | Definition | Description |
| --- |--- |--- |
| file_id | BIGINT PRIMARY KEY | 업로드 파일 PK |
| owner_user_id | BIGINT NOT NULL | 파일 소유 사용자 FK |
| storage_key | VARCHAR(500) NOT NULL | 스토리지 내부 키. 예: S3 object key |
| original_name | VARCHAR(255) NOT NULL | 원본 파일명 |
| mime_type | VARCHAR(100) NOT NULL | MIME 타입 |
| size_bytes | BIGINT NOT NULL | 파일 크기 byte |
| status | VARCHAR(30) NOT NULL | 파일 상태: ACTIVE, DELETED, FAILED 등 |
| created_at | TIMESTAMP NOT NULL | 파일 생성/업로드 시각 |

### candidate_profiles

| Column | Definition | Description |
| --- |--- |--- |
| candidate_id | BIGINT PRIMARY KEY | 지원자 프로필 PK |
| user_id | BIGINT NOT NULL UNIQUE | 연결된 사용자 계정 FK |
| default_resume_file_id | BIGINT | 기본 이력서 파일 FK |
| portfolio_url | VARCHAR(500) | 대표 포트폴리오 URL |
| github_url | VARCHAR(500) | GitHub 주소 |
| blog_url | VARCHAR(500) | 블로그 URL (#272 프로필 정본화로 추가) |
| summary | TEXT | 지원자 자기소개/요약 정보. AI 분석 또는 프로필 표시용 |
| cover_letter | TEXT | 선택 자기소개서. 지원서 스냅샷과 맞춤 질문 생성의 원본 |
| created_at | TIMESTAMP NOT NULL | 지원자 프로필 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 지원자 프로필 수정 시각 |

구조화 프로필 자식 테이블은 모두 `candidate_id` FK(`ON DELETE CASCADE`), 1부터 시작하는 `sort_order`, `created_at`, `updated_at`을 가지며 `(candidate_id, sort_order)`를 유일하게 유지한다. 반복 섹션 교체 시 부모 `candidate_profiles.updated_at`도 갱신한다.

### candidate_educations

| Column | Definition | Description |
| --- | --- | --- |
| education_id | BIGINT PRIMARY KEY | 학력 항목 PK |
| candidate_id | BIGINT NOT NULL | 지원자 프로필 FK |
| sort_order | INTEGER NOT NULL | 화면/응답 순서 |
| education_level | VARCHAR(30) NOT NULL | 학력 구분 enum |
| school_name | VARCHAR(150) NOT NULL | 학교명 |
| major | VARCHAR(150) | 전공 |
| degree_type | VARCHAR(30) NOT NULL | 학위 또는 대학 구분 enum |
| status | VARCHAR(30) NOT NULL | 재학·졸업 상태 enum |
| start_month | DATE NOT NULL | 입학월(월 첫날 저장) |
| end_month | DATE | 졸업/예정월(월 첫날 저장) |
| created_at / updated_at | TIMESTAMP NOT NULL | 생성/수정 시각 |

### candidate_careers

| Column | Definition | Description |
| --- | --- | --- |
| career_id | BIGINT PRIMARY KEY | 경력 항목 PK |
| candidate_id / sort_order | BIGINT / INTEGER NOT NULL | 지원자 FK와 표시 순서 |
| company_name | VARCHAR(150) NOT NULL | 회사명 |
| start_month / end_month | DATE NOT NULL / DATE | 입사월/퇴사월 |
| is_current | BOOLEAN NOT NULL | 재직 중 여부 |
| job_role | VARCHAR(100) NOT NULL | 직무 |
| department / position | VARCHAR(100) | 부서/직급·직책 |
| responsibilities | VARCHAR(1000) NOT NULL | 담당업무 |
| created_at / updated_at | TIMESTAMP NOT NULL | 생성/수정 시각 |

### candidate_activities

| Column | Definition | Description |
| --- | --- | --- |
| activity_id | BIGINT PRIMARY KEY | 활동 항목 PK |
| candidate_id / sort_order | BIGINT / INTEGER NOT NULL | 지원자 FK와 표시 순서 |
| activity_type | VARCHAR(30) NOT NULL | 활동 구분 enum |
| organization_name | VARCHAR(150) NOT NULL | 기관·회사명 |
| start_date / end_date | DATE NOT NULL / DATE | 시작일/종료일 |
| is_ongoing | BOOLEAN NOT NULL | 진행 중 여부 |
| description | VARCHAR(1000) NOT NULL | 활동 내용 |
| created_at / updated_at | TIMESTAMP NOT NULL | 생성/수정 시각 |

### candidate_credentials

| Column | Definition | Description |
| --- | --- | --- |
| credential_id | BIGINT PRIMARY KEY | 자격·어학·수상 항목 PK |
| candidate_id / sort_order | BIGINT / INTEGER NOT NULL | 지원자 FK와 표시 순서 |
| credential_type | VARCHAR(30) NOT NULL | 자격/어학/수상 구분 enum |
| name / issuer | VARCHAR(150) NOT NULL | 명칭과 발행·주최기관 |
| acquired_month | DATE NOT NULL | 취득월(월 첫날 저장) |
| result | VARCHAR(200) | 점수·등급·수상 결과 |
| created_at / updated_at | TIMESTAMP NOT NULL | 생성/수정 시각 |

프로필 AI 컨텍스트는 위 구조화 항목과 summary/coverLetter/URL만 투영한다. 이름·이메일·전화번호, 자식 PK, `candidate_id`는 제외한다. 섹션별 현재/최신 5개, summary 1,000자, coverLetter 3,000자, 담당업무·활동내용 각 500자, 전체 JSON 20,000자 제한을 적용하고 초과하면 오래된 항목부터 제거한다.

### candidate_folders

| Column | Definition | Description |
| --- |--- |--- |
| id | BIGINT PRIMARY KEY | 기업별 지원서 세트 PK |
| candidate_id | BIGINT NOT NULL | 지원자 프로필 FK. 지원자 삭제 시 cascade |
| name | VARCHAR(100) NOT NULL | 지원서 세트 이름 |
| github_url | VARCHAR(500) | GitHub URL |
| blog_url | VARCHAR(500) | 블로그 URL |
| portfolio_url | VARCHAR(500) | 포트폴리오 URL |
| resume_file_id | BIGINT | 폴더에 연결된 이력서 file_assets FK. 파일 삭제 시 NULL |
| portfolio_file_id | BIGINT | 폴더에 연결된 포트폴리오 PDF file_assets FK. 파일 삭제 시 NULL (#272 P1-2) |
| motivation | TEXT | 지원 동기 |
| extra_note | TEXT | 추가 설명 |
| profile_snapshot | JSONB | 생성/최초 수정 시 고정한 `CandidateProfileSnapshotV1`. 기존 행은 NULL 가능 |
| created_at | TIMESTAMP NOT NULL | 폴더 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 폴더 수정 시각 |

### postings

| Column | Definition | Description |
| --- |--- |--- |
| posting_id | BIGINT PRIMARY KEY | 채용 공고 PK |
| company_id | BIGINT NOT NULL | 이 공고를 올린 회사 FK |
| title | VARCHAR(200) NOT NULL | 공고 제목. 예: 2026 신입 백엔드 채용 |
| job_role | VARCHAR(100) NOT NULL | 직무명. 예: Backend Developer |
| job_description | TEXT | 직무 설명/JD |
| career_requirement | VARCHAR(150) | 선택 입력 경력 조건. 예: 신입, 경력 3년 이상, 경력무관 |
| education_requirement | VARCHAR(150) | 선택 입력 학력 조건. 예: 학력무관, 대졸 이상 |
| salary_info | VARCHAR(150) | 선택 입력 급여 정보. 예: 회사 내규에 따름, 연봉 4,000만원 이상 |
| work_location | VARCHAR(150) | 선택 입력 근무지역. 예: 서울, 판교, 원격 |
| employment_type | VARCHAR(150) | 선택 입력 근무형태. 예: 정규직, 계약직, 인턴 |
| job_role_code | VARCHAR(50) | 지원자 필터용 직무 분류 코드. `PostingJobRoleCode` taxonomy 값(한글). 미분류면 NULL |
| region_code | VARCHAR(30) | 지원자 필터용 근무 지역 코드. `PostingRegionCode` taxonomy 값(한글). 미분류면 NULL |
| career_min_years | INTEGER | 지원자 필터용 요구 경력 최소(년). 0~10. 경력무관이면 NULL |
| career_max_years | INTEGER | 지원자 필터용 요구 경력 최대(년). 0~10. career_min_years 이상 |
| employment_type_code | VARCHAR(20) | 지원자 필터용 근무형태 코드. `PostingEmploymentTypeCode` taxonomy 값. 미분류면 NULL |
| recruitment_type | VARCHAR(20) | 지원자 필터용 채용형태 코드. `PostingRecruitmentType`(상시/마감형). 미분류면 NULL |
| workplace_address | VARCHAR(300) | 회사 위치 도로명 주소(공고 생성 시 주소 검색). 미입력이면 NULL |
| workplace_lat | DOUBLE PRECISION | 회사 위치 위도(지원자 상세 지도 핀). 좌표 없으면 NULL. workplace_lng와 함께 저장 |
| workplace_lng | DOUBLE PRECISION | 회사 위치 경도. 좌표 없으면 NULL. workplace_lat와 함께 저장 |
| starts_on | DATE | 지원 시작일 |
| ends_on | DATE | 지원 마감일 |
| status | VARCHAR(30) NOT NULL | 공고 상태: DRAFT, OPEN, CLOSING_SOON, CLOSED, ARCHIVED |
| created_at | TIMESTAMP NOT NULL | 공고 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 공고 수정 시각 |

### criterion_tags

| Column | Definition | Description |
| --- |--- |--- |
| tag_id | BIGINT PRIMARY KEY | 평가 태그 PK |
| job_role | VARCHAR(100) NOT NULL | 이 태그가 주로 쓰이는 직무. 예: Backend, Frontend, AI Engineer, Common |
| name | VARCHAR(100) NOT NULL | 태그 이름. 예: API 설계, DB 모델링, 장애 대응 |
| description | TEXT | 태그 설명. AI가 질문/평가할 때 참고하는 기준 역량 |
| category | VARCHAR(80) NOT NULL | 태그 분류. 예: 기술역량, 문제해결, 협업, 커뮤니케이션 |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | 현재 추천/선택 가능한 태그인지 여부 |
| sort_order | INTEGER NOT NULL | 화면 표시 순서 |

### evaluation_criteria

| Column | Definition | Description |
| --- |--- |--- |
| criterion_id | BIGINT PRIMARY KEY | 공고별 선택 평가 기준 PK |
| posting_id | BIGINT NOT NULL | 이 기준이 적용되는 채용 공고 FK |
| tag_id | BIGINT NOT NULL | 선택된 평가 태그 FK |
| description | TEXT | 이 공고에서 사용하는 평가 기준 상세 설명 스냅샷. 공용 태그 설명과 독립적으로 수정 가능 |
| weight | INTEGER NOT NULL | 가중치. 예: 30 |
| pass_score | INTEGER | 이 항목에서 통과로 볼 최소 점수 |
| sort_order | INTEGER NOT NULL | 화면 표시 순서 |

### question_bank

| Column | Definition | Description |
| --- |--- |--- |
| question_id | BIGINT PRIMARY KEY | 질문 PK |
| company_id | BIGINT NOT NULL | 이 질문을 보유한 회사 FK |
| posting_id | BIGINT | 특정 공고에 연결된 질문이면 공고 FK. 공통 질문이면 NULL 가능 |
| criterion_id | BIGINT | 어떤 공고별 평가 기준과 연결된 질문인지 |
| question_type | VARCHAR(50) NOT NULL | 질문 유형: INTRO, TECHNICAL, EXPERIENCE, SITUATION, FOLLOW_UP, CLOSING |
| content | TEXT NOT NULL | 실제 질문 문장 |
| origin | QuestionOrigin NOT NULL DEFAULT MANUAL | 최초 작성 출처: MANUAL, AI_GENERATED |
| is_ai_edited | BOOLEAN NOT NULL DEFAULT FALSE | AI 생성 질문이 사용자에 의해 수정되었는지 여부 |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | 현재 사용 가능한 질문인지 여부 |
| usage_scope | QuestionUsageScope NOT NULL DEFAULT STANDARD | 질문 원본의 저장 목적. 기존·일반 공통 질문은 STANDARD이며 demo 공통 후보도 확정 STANDARD 풀에서 선택 |

### interview_question_sets

| Column | Definition | Description |
| --- |--- |--- |
| question_set_id | BIGINT PRIMARY KEY | 질문 세트 PK |
| posting_id | BIGINT NOT NULL | 질문 세트가 적용되는 채용 공고 FK |
| title | VARCHAR(200) NOT NULL | 질문 세트 이름 |
| status | VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' | 질문 세트 상태. 같은 공고에는 하나의 ACTIVE만 유지 |
| created_by_process_log_id | BIGINT | AI 질문 세트 구성 job에서 확정된 경우 연결되는 ai_process_logs FK |
| created_at | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 수정 시각 |

### interview_question_set_items

| Column | Definition | Description |
| --- |--- |--- |
| question_set_item_id | BIGINT PRIMARY KEY | 질문 세트 항목 PK |
| question_set_id | BIGINT NOT NULL | 소속 질문 세트 FK |
| question_id | BIGINT NOT NULL | 소비할 질문 FK |
| criterion_id | BIGINT | 질문이 연결된 평가 기준 FK |
| sort_order | INTEGER NOT NULL | 면접 런타임 질문 순서 |

질문 세트 런타임 소비 정책:

- D 담당 채용 면접 런타임은 세션 생성 시 공고의 `ACTIVE` 질문 세트가 있으면 `interview_question_set_items.sort_order` 순서로 질문을 소비한다.
- LEGACY 공고에서 `ACTIVE` 질문 세트가 없으면 기존 공고별 활성 `question_bank` 질문을 사용할 수 있다.
- `NCS_3_PROFILE_V1` 공고는 `ACTIVE` 질문 세트가 필수다. 세트에는 `JD_CRITERIA`, `ALIGNED`, canonical 1~2 binding 조건을 만족한 질문만 들어가며 legacy/seed 질문을 자동 혼합하지 않는다.
- NCS 질문 세트 확정 시 V1은 canonical profile별 binding 최소 2개, V2는 활성 profile별 binding 최소 1개인지 검증한다.
- 세션 생성 이후 질문 세트 변경은 이미 생성된 세션에 소급 적용하지 않는다.

### interview_time_policies

| Column | Definition | Description |
| --- |--- |--- |
| posting_id | BIGINT PRIMARY KEY | 시간 정책이 적용되는 채용 공고 FK |
| preparation_time_sec | INTEGER NOT NULL DEFAULT 0 | 질문 표시 후 답변 전 준비 시간(초) |
| answer_time_sec | INTEGER NOT NULL DEFAULT 90 | 답변 제한 시간(초) |
| retry_allowed | BOOLEAN NOT NULL DEFAULT FALSE | 지원자의 재시도 허용 여부 |
| created_at | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 수정 시각 |

### interview_question_generation_policies and personalized question scope

`interview_question_generation_policies.evaluation_framework`는 `LEGACY`, `NCS_3_PROFILE_V1`, `NCS_ACTIVE_PROFILE_V2`를 허용한다. 기존 V1의 세 profile·profile별 최소 2개 계약은 유지하고, V2만 `weight > 0`인 canonical profile 1~3개와 profile별 최소 1개를 사용한다.

두 table은 `usage_scope QuestionUsageScope NOT NULL DEFAULT STANDARD`를 가진다. 기존 row는 STANDARD다. DEMO_PRESET 개인화 1개는 STANDARD `resume_question_count`에 포함하지 않으며 별도 batch로 생성한다.

batch business unique key는 `(application_id, usage_scope, policy_version, criteria_version, jd_snapshot_hash, resume_document_hash)`다. stale/retry/status 전이는 같은 usage scope 안에서만 적용한다. `application_interview_questions.usage_scope`는 parent batch와 같아야 하며 write transaction에서 검증한다.

### applications

| Column | Definition | Description |
| --- |--- |--- |
| application_id | BIGINT PRIMARY KEY | 지원서/지원 이력 PK |
| posting_id | BIGINT NOT NULL | 어떤 공고에 지원했는지 |
| candidate_id | BIGINT NOT NULL | 누가 지원했는지 |
| applicant_name | VARCHAR(100) | 제출 당시 지원자 이름 스냅샷. 기존 데이터는 NULL 가능 |
| applicant_email | VARCHAR(255) | 제출 당시 이메일 스냅샷. 기존 데이터는 NULL 가능 |
| applicant_phone | VARCHAR(50) | 제출 당시 연락처 스냅샷. 기존 데이터는 NULL 가능 |
| github_url | VARCHAR(500) | 해당 지원서에 제출한 GitHub URL |
| blog_url | VARCHAR(500) | 해당 지원서에 제출한 블로그 URL |
| portfolio_url | VARCHAR(500) | 해당 지원서에 제출한 포트폴리오 URL. 포트폴리오 PDF 제출 시 NULL 가능 |
| motivation | TEXT | 해당 공고 지원동기 |
| additional_info | TEXT | 지원자가 함께 제출한 추가 설명 |
| profile_snapshot | JSONB | 제출 당시 전체 `CandidateProfileSnapshotV1`. 기존/공개 지원은 NULL 가능 |
| application_status | VARCHAR(40) NOT NULL | 지원 전체 진행 상태: DRAFT, SUBMITTED, IN_REVIEW, INTERVIEW_WAITING, INTERVIEW_DONE, COMPLETED, CANCELED |
| document_status | VARCHAR(40) NOT NULL | 서류 제출/분석 상태: NOT_SUBMITTED, SUBMITTED, EXTRACTING, EXTRACTED, FAILED |
| interview_status | VARCHAR(40) NOT NULL | AI 면접 응시 상태: NOT_READY, READY, IN_PROGRESS, COMPLETED, FAILED |
| report_status | VARCHAR(40) NOT NULL | 평가 리포트 생성 상태: PENDING, GENERATING, COMPLETED, FAILED |
| screening_decision | VARCHAR(40) | 기업 담당자의 다음 전형 판정: UNDECIDED, PASS, HOLD, FAIL |
| screening_memo | TEXT | 기업 담당자 메모 |
| submitted_at | TIMESTAMP | 지원서 최종 제출 시각 |
| updated_at | TIMESTAMP NOT NULL | 지원 건 마지막 수정 시각 |

신규 회원 지원서는 이름, 이메일, 연락처, GitHub URL, 블로그 URL, 이력서 PDF, 지원동기, 추가 설명과 전체 프로필 스냅샷을 제출한다. 포트폴리오는 URL 또는 PDF 중 하나 이상을 제출한다. 프로필 값이 이후 변경되어도 기업은 지원 당시 스냅샷을 확인한다. 기존/공개 지원의 NULL 스냅샷은 현재 프로필로 역보정하지 않는다.

동일한 `(posting_id, candidate_id)`에는 `application_status <> 'CANCELED'`인 활성 지원서가 최대 하나만 존재한다. 이 조건은 PostgreSQL 부분 유일 인덱스로 보장한다. 지원 취소 후 재지원할 때는 취소된 row를 복구하지 않고 새 `applications` row와 새 서류·동의·면접 세션을 생성하며, 취소 row와 연결된 질문·세션 snapshot은 감사·추적을 위해 보존한다. 기업의 활성 지원자 목록과 `applicantCount`에서는 `CANCELED`를 제외하지만, 평가 기준·질문 설정 잠금의 제출 이력 판단에는 취소 row도 계속 포함한다.

### application_documents

| Column | Definition | Description |
| --- |--- |--- |
| document_id | BIGINT PRIMARY KEY | 지원서 첨부 서류 PK |
| application_id | BIGINT NOT NULL | 연결된 지원서 FK |
| file_id | BIGINT | 업로드 파일 FK |
| document_type | VARCHAR(50) NOT NULL | 서류 유형: RESUME, PORTFOLIO |
| parse_status | VARCHAR(40) NOT NULL | 파싱 상태: SUBMITTED, EXTRACTING, EXTRACTED, FAILED |
| extracted_text | TEXT | AI가 추출한 텍스트 |
| uploaded_at | TIMESTAMP NOT NULL | 업로드 시각 |

### consent_records

| Column | Definition | Description |
| --- |--- |--- |
| consent_id | BIGINT PRIMARY KEY | 동의 기록 PK |
| application_id | BIGINT NOT NULL | 연결된 지원서 FK |
| consent_type | VARCHAR(80) NOT NULL | 동의 유형: PRIVACY_COLLECTION, AI_DOCUMENT_ANALYSIS, AI_INTERVIEW_RECORDING |
| agreed | BOOLEAN NOT NULL | 동의 여부 |
| agreed_at | TIMESTAMP | 동의 시각 |

### interview_sessions

| Column | Definition | Description |
| --- |--- |--- |
| session_id | BIGINT PRIMARY KEY | 면접 세션 PK |
| application_id | BIGINT | 채용 AI 면접이면 지원서 FK, 모의면접이면 NULL 가능 |
| candidate_id | BIGINT NOT NULL | 면접 응시 지원자 FK |
| interview_type | VARCHAR(40) NOT NULL | 면접 유형: MOCK, RECRUITING |
| session_mode | InterviewSessionMode NOT NULL DEFAULT STANDARD | 공식 채용면접 선택 snapshot: STANDARD, DEMO_PRESET. 기존 row와 기존 request는 STANDARD |
| status | VARCHAR(40) NOT NULL | 면접 상태: NOT_READY, READY, IN_PROGRESS, COMPLETED, FAILED |
| title | VARCHAR(100) | 연습(모의면접) 세션 사용자 지정 제목. NULL이면 기본 '세션 #N' 표기 |
| show_question_text | BOOLEAN NOT NULL DEFAULT FALSE | 면접 질문 텍스트 표시 여부 |
| preparation_time_sec_snapshot | INTEGER | 세션 확정 당시 준비 시간. legacy 세션은 NULL |
| answer_time_sec_snapshot | INTEGER | 세션 확정 당시 본 질문·꼬리질문 공통 답변 시간. legacy 세션은 NULL |
| retry_allowed_snapshot | BOOLEAN | 세션 확정 당시 재답변 허용 여부. legacy 세션은 NULL |
| ncs_scoring_version | VARCHAR(80) | 세션에 고정한 NCS 점수 계산 계약 version. legacy 세션은 NULL |
| started_at | TIMESTAMP | 면접 시작 시각 |
| completed_at | TIMESTAMP | 면접 완료 시각 |

### interview_session_ncs_policies

| Column | Definition | Description |
| --- | --- | --- |
| session_id | BIGINT NOT NULL | 연결된 면접 세션 FK |
| ncs_profile_id | VARCHAR(50) NOT NULL | canonical NCS profile ID |
| criterion_id | BIGINT | 세션 확정 당시 평가 기준 FK. 삭제 시 NULL 허용 |
| criterion_title_snapshot | VARCHAR(200) NOT NULL | 세션 확정 당시 평가 기준 표시명 |
| weight | INTEGER NOT NULL | 세션에 고정한 profile 가중치. 세 profile 합계 100 |
| minimum_average_score | DECIMAL(5,2) NOT NULL DEFAULT 3 | profile 최소 통과 평균 |
| required_question_count | INTEGER NOT NULL DEFAULT 2 | profile별 최소 scoring BASE 수. V1 snapshot은 2, V2 활성 profile snapshot은 1 |
| ncs_profile_version | VARCHAR(80) NOT NULL | profile version snapshot |

`(session_id, ncs_profile_id)`를 PK로 사용한다. V1은 canonical profile 세 개를 각각 한 행씩 저장하고 profile별 최소 2개를 검증한다. V2는 `weight > 0`인 활성 profile만 행으로 저장하고 `required_question_count=1`, 가중치 합계 100을 검증한다. 세션 시작 이후 평가 기준·가중치·시간 정책 원본 변경은 이 snapshot에 소급하지 않는다. legacy 세션은 정책 행이 없을 수 있으며 평가 시 임의 기본값을 채우지 않고 `INCOMPLETE`로 처리한다.

### interview_session_questions

| Column | Definition | Description |
| --- |--- |--- |
| session_question_id | BIGINT PRIMARY KEY | 세션 질문 행 PK |
| session_id | BIGINT NOT NULL | 연결된 면접 세션 FK |
| question_id | BIGINT | 기업 `question_bank` 질문 원본 FK. 개인 질문은 NULL |
| personalized_question_id | BIGINT | `application_interview_questions` 개인화 질문 원본 FK. 공통/legacy 질문은 NULL |
| runtime_question_id | BIGINT | API에서 사용하는 session 전용 질문 ID. NCS 공통·개인화 질문과 개인 모의면접 질문에 발급 |
| criterion_id | BIGINT | 생성 당시 평가 기준 FK. 삭제 시 NULL 허용 |
| criterion_title_snapshot | VARCHAR(200) | 생성 당시 평가 기준 표시명 snapshot |
| generation_source | VARCHAR(50) | `JD_CRITERIA`, `RESUME_PERSONALIZED`; legacy는 NULL |
| question_type | VARCHAR(40) | session 질문 유형 snapshot |
| content | TEXT | session 질문 본문 snapshot. 지원서 원문 전체는 저장하지 않음 |
| ncs_profile_id | VARCHAR(50) | NCS profile snapshot |
| ncs_question_mode | VARCHAR(50) | NCS question mode snapshot |
| ncs_profile_version | VARCHAR(80) | NCS profile version snapshot |
| alignment_status | VARCHAR(40) | 세션 확정 시 정렬 상태 |
| alignment_score | DECIMAL(8,6) | 세션 확정 시 정렬 점수 |
| alignment_reason | TEXT | 세션 확정 시 정렬 사유 |
| evaluator_version | VARCHAR(80) | 정렬 adapter version snapshot |
| policy_version | INTEGER | 세션 생성 당시 질문 정책 version |
| criteria_version | INTEGER | 세션 생성 당시 평가 기준 version |
| usage_scope | QuestionUsageScope NOT NULL DEFAULT STANDARD | session에서 소비한 질문 목적. DEMO_PRESET session의 공통·개인화·follow-up은 모두 DEMO_PRESET |
| sort_order | INTEGER NOT NULL | 세션 안의 질문 표시 순서 |
| created_at | TIMESTAMP NOT NULL | 세션 질문 연결 생성 시각 |

`(session_id, sort_order)`와 `runtime_question_id`는 unique다. NCS 채용 질문은 `question_id`와 `personalized_question_id` 중 정확히 하나를 원본으로 가지며 session 전용 `runtime_question_id`, 본문·유형·NCS metadata snapshot을 사용한다. 공통 질문을 먼저, 개인화 질문을 다음에 저장하고 세션 생성 이후 원본 변경을 소급하지 않는다. 세션 삭제 시 snapshot도 함께 삭제한다.

### NCS question binding tables

세 binding table은 기존 singular `ncs_profile_id`를 제거하지 않고 확장한다. 신규 row는 canonical profile ID만 저장하고 `binding_order`는 1 또는 2다.

| Table | Parent key | Criterion | Snapshot fields | Delete behavior |
| --- | --- | --- | --- | --- |
| `question_ncs_bindings` | `question_id` | `criterion_id` 필수 | profile/version, alignment status/score/reason, evaluator version | 질문 삭제 시 CASCADE, 기준 삭제 RESTRICT |
| `application_question_ncs_bindings` | `personalized_question_id` | `criterion_id` nullable | profile/version, alignment status/score/reason, evaluator version | 질문 삭제 시 CASCADE, 기준 삭제 SET NULL |
| `session_question_ncs_bindings` | `session_question_id` | `criterion_id` nullable | criterion title, profile/version, alignment status/score/reason, evaluator version | 세션 질문 삭제 시 CASCADE, 기준 삭제 SET NULL |

각 table은 `(parent_id, ncs_profile_id)`를 PK로 사용하고 `(parent_id, binding_order)`를 unique로 둔다. PostgreSQL은 parent별 row count 2 이하를 check constraint 하나로 보장할 수 없으므로 M2/M3/M4의 write boundary가 길이 1~2와 profile 중복을 검증한다.

### interview_answers

| Column | Definition | Description |
| --- |--- |--- |
| answer_id | BIGINT PRIMARY KEY | 질문별 답변 PK |
| session_id | BIGINT NOT NULL | 연결된 면접 세션 FK |
| question_id | BIGINT | 답변한 질문 FK |
| session_question_id | BIGINT | 개인 런타임 질문 또는 세션 질문 연결 FK |
| video_file_id | BIGINT | 답변 영상 파일 FK |
| audio_file_id | BIGINT | 답변 음성 파일 FK |
| transcript | TEXT | STT로 변환된 답변 스크립트 |
| duration_seconds | INTEGER | 답변 시간 초 단위 |
| submitted_at | TIMESTAMP | 답변 제출 시각 |

채용면접 런타임에서 `interview_session_questions.sort_order`와 `interview_answers`가 진행 상태의 정본이다. 일반 답변 저장은 세션 질문 단위로 멱등 처리하며, 동일 질문의 재전송은 최초 답변을 그대로 반환한다. 명시적 재답변만 기존 답변 행을 갱신한다. 현재 질문 index는 별도 클라이언트 cursor로 확정하지 않고, 저장된 답변이 없는 첫 세션 질문을 매 조회·전환 시 계산한다. 따라서 API 재시작, 응답 유실, 중복 다음 질문 요청 이후에도 질문을 건너뛰지 않는다. 답변 저장 transaction과 first-unanswered 계산 사이에는 AI process 상태를 전제조건으로 두지 않는다.

STT와 재답변 상태는 별도 컬럼을 추가하지 않고 `interview_answers.submitted_at`과 해당 답변을 참조하는 `ai_process_logs`의 STT 기록으로 계산한다. 최초 `REANSWER_REQUIRED`가 현재 제출 이후 발생하면 재답변 가능, 두 번째 발생이면 인식 불가 확정이다. 재답변은 같은 answer row의 파일, transcript, `submitted_at`을 갱신하므로 새로고침과 API 재시작 이후에도 사용 여부를 복원할 수 있다. `STT_RETRYABLE` 자동 재시도와 provider 실패는 이 횟수에 포함하지 않는다.

### follow_up_questions

| Column | Definition | Description |
| --- |--- |--- |
| follow_up_id | BIGINT PRIMARY KEY | 꼬리질문 PK |
| answer_id | BIGINT NOT NULL | 어떤 답변에서 파생된 꼬리질문인지 |
| source_session_question_id | BIGINT | 원본 base session question FK. 정식 M4 기록은 필수이며 과거 매핑 불가 row만 NULL 허용 |
| inserted_session_question_id | BIGINT | 실제 세션에 추가된 private FOLLOW_UP question FK |
| content | TEXT NOT NULL | 생성된 꼬리질문. 불필요 판정이면 빈 문자열 |
| generation_status | VARCHAR(40) NOT NULL | READY, INSERTED, SKIPPED |
| policy | VARCHAR(40) NOT NULL | MOCK, RECRUITING |
| reason | VARCHAR(40) | NCS_EVIDENCE_GAP, FACT_CLARIFICATION, GENERAL_EVIDENCE_GAP |
| skip_reason | VARCHAR(50) | NOT_REQUIRED, SESSION_NOT_IN_PROGRESS |
| question_mode | VARCHAR(50) | 원본 base question의 NCS question mode snapshot |
| answer_time_sec | INTEGER | 세션 확정 당시 꼬리질문 답변 제한 시간 snapshot |
| inserted_at | TIMESTAMP | private session question 승격 시각 |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 상태 갱신 시각 |

`(answer_id, policy)`는 unique이며 base 답변 하나당 꼬리질문 결정은 최대 한 번만 저장한다. `INSERTED` 전이는 worker guardrail 통과 결과 저장 transaction에서 원본 `interview_session_questions.sort_order` 바로 다음 순서 확보와 private runtime question 생성을 함께 처리한다. 원본보다 뒤에 있는 질문은 같은 transaction에서 한 칸씩 이동하며 상대 순서는 유지한다. 추가 질문은 `question_bank`에 등록하지 않고 해당 세션의 private runtime question으로만 저장하며, 원본 질문의 canonical `session_question_ncs_bindings` 1~2개를 같은 transaction에서 복제한다. NCS 근거와 fact clarification이 동시에 필요하면 질문은 하나만 만들고 `FACT_CLARIFICATION`을 우선 사유로 저장한다. `SKIPPED`는 질문을 생성하지 않으며 worker 실패·timeout은 이 테이블의 판정으로 변환하지 않고 `ai_process_logs` 실패 상태를 유지한다.

### evaluation_reports

| Column | Definition | Description |
| --- |--- |--- |
| report_id | BIGINT PRIMARY KEY | 평가 리포트 PK |
| application_id | BIGINT | 채용 지원서 FK. 모의면접 리포트면 NULL 가능 |
| session_id | BIGINT | 면접 세션 FK |
| report_type | VARCHAR(50) NOT NULL | 리포트 유형: MOCK_INTERVIEW_REPORT, RECRUITING_REPORT |
| status | VARCHAR(40) NOT NULL | 리포트 상태: PENDING, GENERATING, COMPLETED, FAILED |
| total_score | INTEGER | 총점 |
| summary | TEXT | 리포트 요약 |
| ncs_completion_status | VARCHAR(40) | NCS 평가 완료 상태: COMPLETE, INCOMPLETE |
| ncs_threshold_result | VARCHAR(40) | MEETS_THRESHOLD, BELOW_THRESHOLD, INCOMPLETE |
| ncs_ai_decision | VARCHAR(20) | AI 추천 판정: PASS, FAIL. 실제 applications.screening_decision과 별도 |
| ncs_decision_reason_code | VARCHAR(80) | threshold 또는 평가 미완료 판정 사유 |
| ncs_scoring_version | VARCHAR(80) | NCS 점수 계산 계약 version |
| ncs_decision_policy_version | VARCHAR(80) | NCS 판정 정책 version |
| ncs_summary_json | JSONB | finding, notice, incomplete reason 표시 snapshot. 점수 정본으로 사용 금지 |
| generated_at | TIMESTAMP | 리포트 생성 시각 |
| failure_category | VARCHAR(40) | 실패 구분: RETRYABLE, NON_RETRYABLE |
| failure_reason | TEXT | 실패 사유. 재시도 가능 여부와 함께 화면/운영 로그에 사용 |

### report_scores

| Column | Definition | Description |
| --- |--- |--- |
| score_id | BIGINT PRIMARY KEY | 평가 항목별 점수 PK |
| report_id | BIGINT NOT NULL | 연결된 리포트 FK |
| criterion_id | BIGINT | 평가 기준 FK |
| score | INTEGER | legacy 점수. NCS profile 집계 row에서는 canonical NCS 필드를 사용하며 미완료를 0으로 채우지 않음 |
| rationale | TEXT | 평가 사유 |
| ncs_profile_id | VARCHAR(50) | NCS profile별 집계 row 식별자 |
| average_score | DECIMAL(5,2) | 유효 질문의 profile 평균 0~5 |
| normalized_score | INTEGER | average_score를 0~100으로 정규화한 값 |
| weight | INTEGER | 세션 시작 시 snapshot한 profile 가중치 |
| weighted_score | DECIMAL(5,2) | normalized_score에 weight를 적용한 점수 |
| minimum_average_score | DECIMAL(5,2) | profile 최소 통과 평균. V1 기본값 3 |
| assigned_question_count | INTEGER | 세션에 배정된 profile 질문 수 |
| valid_question_count | INTEGER | SCORED 상태로 평균에 포함된 질문 수 |

NCS 리포트의 `report_scores`에는 `ncs_answer_evaluations.score_status=SCORED`인 답변만 profile별로 평균 집계한다. 평가 불충분·미정렬·차단 결과는 0점으로 만들지 않는다.

NCS profile 집계 row는 `(report_id, ncs_profile_id)`를 unique key로 사용한다. profile이 불완전하면 `average_score`, `normalized_score`, `weighted_score`는 NULL로 유지하고 배정·유효 문항 수는 그대로 저장한다.

최종 NCS 평가 target model은 공통 질문, 개인화 질문, 세션 질문에 각각 1~2개의 profile binding 관계를 둔다. `question_ncs_bindings`, `application_question_ncs_bindings`, `session_question_ncs_bindings`를 사용하며 세션 binding은 원본 변경이 소급되지 않는 snapshot이다. 세션 확정 시 V1은 canonical profile마다 scoring BASE 최소 2개, V2는 세션 policy snapshot의 활성 profile마다 BASE 최소 1개인지 검증한다.

### ncs_answer_evaluations

| Column | Definition | Description |
| --- |--- |--- |
| ncs_evaluation_id | BIGINT PRIMARY KEY | 답변별 NCS 평가 PK |
| report_id | BIGINT NOT NULL | 평가 리포트 FK |
| answer_id | BIGINT NOT NULL | 평가한 base 답변 FK |
| session_question_id | BIGINT NOT NULL | 평가 질문 snapshot FK |
| criterion_id | BIGINT | 평가 기준 FK. 기준 삭제 후 snapshot 보존을 위해 NULL 가능 |
| criterion_title_snapshot | VARCHAR(200) NOT NULL | 평가 당시 기준명 |
| ncs_profile_id | VARCHAR(50) NOT NULL | NCS profile snapshot |
| ncs_question_mode | VARCHAR(50) NOT NULL | NCS question mode snapshot |
| ncs_profile_version | VARCHAR(80) NOT NULL | NCS profile version |
| score_status | VARCHAR(40) NOT NULL | SCORED, INSUFFICIENT_INPUT, LOW_ALIGNMENT, BLOCKED |
| competency_score | INTEGER | legacy 0~100 역량 진단. 신규 0~5 평가 row에서는 NULL 허용, SCORED가 아니면 NULL |
| evidence_score | INTEGER | legacy 0~100 수행 근거 진단. 신규 0~5 평가 row에서는 NULL 허용, SCORED가 아니면 NULL |
| total_score | INTEGER | legacy 0~100 총점. 신규 0~5 평가 row에서는 NULL 허용, SCORED가 아니면 NULL |
| behavior_points | INTEGER | 원답의 NCS 행동 포인트 0~3. SCORED가 아니면 NULL |
| logic_points | INTEGER | 원답의 질문 유형별 논리 구조 포인트 0~2. SCORED가 아니면 NULL |
| base_score | INTEGER | 원답 점수 0~5. SCORED가 아니면 NULL |
| effective_score | INTEGER | 꼬리답변 보강 반영 점수 0~5. SCORED가 아니면 NULL |
| follow_up_applied | BOOLEAN NOT NULL DEFAULT FALSE | 꼬리답변 보강 적용 여부 |
| coverage | DECIMAL(8,6) NOT NULL | 질문/profile 정렬 coverage |
| confidence | VARCHAR(20) NOT NULL | HIGH, MEDIUM, LOW |
| rubric_version | VARCHAR(80) NOT NULL | 점수 rubric version |
| prompt_version | VARCHAR(100) NOT NULL | prompt contract version |
| provider_mode | VARCHAR(20) NOT NULL | mock, openai |
| model_name | VARCHAR(120) | 실제 provider model |
| result_json | JSONB NOT NULL | competencies, evidence maturity, growth, guardrail canonical output |
| created_at | TIMESTAMP NOT NULL | 최초 평가 시각 |
| updated_at | TIMESTAMP NOT NULL | 최종 평가 갱신 시각 |

신규 정본 unique key는 `(report_id, answer_id, ncs_profile_id)`다. `SCORED`이면 신규 0~5 점수 필드가 범위 안에 있고, 나머지 상태이면 신규 점수 필드는 모두 NULL인 check constraint를 둔다. 기존 0~100 세 점수는 evaluator 상세 진단과 migration 호환용이며 최종 NCS 채용 점수에는 사용하지 않는다.

`ncs_answer_evaluation_evidences`는 평가 row, source answer, `BASE | FOLLOW_UP`, exact quote와 순서를 저장한다. 원답과 꼬리답변을 하나의 문자열로 덮어쓰지 않는다. profile 평균과 가중 점수는 `report_scores`, 전체 threshold result와 임시 AI decision은 `evaluation_reports`에 저장한다. `ncs_summary_json`은 finding과 notice를 위한 display snapshot일 뿐 점수 재계산의 입력으로 사용하지 않는다. 정본 계산·판정 계약은 [`ncs-final-evaluation.md`](../03_contracts/ncs-final-evaluation.md), API 출력 계약은 [`ncs-report-output-contract.md`](../03_contracts/ncs-report-output-contract.md)를 따른다.

### ncs_answer_evaluation_evidences

| Column | Definition | Description |
| --- | --- | --- |
| evidence_id | BIGINT PRIMARY KEY | NCS exact evidence PK |
| ncs_evaluation_id | BIGINT NOT NULL | 답변·profile 평가 row FK |
| source_answer_id | BIGINT NOT NULL | quote가 실제로 나온 원답 또는 꼬리답변 FK |
| source_kind | VARCHAR(20) NOT NULL | BASE, FOLLOW_UP |
| quote | TEXT NOT NULL | 원문에서 검증된 비어 있지 않은 exact quote |
| sort_order | INTEGER NOT NULL | 같은 source answer 안의 근거 순서, 1 이상 |

기존 `result_json`에서 source answer를 확정할 수 없는 근거는 migration이 추측하여 이 table로 옮기지 않는다. M4 이후 새 평가부터 source answer가 검증된 row만 저장한다.

### answer_fact_check_runs

| Column | Definition | Description |
| --- | --- | --- |
| fact_check_run_id | BIGINT PRIMARY KEY | 답변 사실 검증 실행 PK |
| report_id | BIGINT NOT NULL | 평가 리포트 FK |
| answer_id | BIGINT NOT NULL | 검증한 base 답변 FK |
| follow_up_answer_id | BIGINT | 합산 재검증에 사용한 꼬리답변 FK |
| input_composition_version | VARCHAR(50) NOT NULL | BASE_ONLY_V1, BASE_FOLLOW_UP_V1 |
| provider_status | VARCHAR(40) NOT NULL | COMPLETED, FAILED, TIMEOUT, INVALID_OUTPUT |
| gate_status | VARCHAR(40) | PASS_THROUGH, CLARIFICATION_CANDIDATE, FACT_CHECK_REQUIRED. provider 실패면 NULL |
| provider_mode | VARCHAR(20) NOT NULL | mock, openai |
| model_version | VARCHAR(120) NOT NULL | 실행에 사용한 provider model |
| prompt_version | VARCHAR(100) NOT NULL | strict prompt contract version |
| knowledge_snapshot_version | VARCHAR(100) NOT NULL | provider에 전달한 지식 snapshot 버전 |
| policy_version | VARCHAR(100) NOT NULL | deterministic gate policy 버전 |
| failure_reason | TEXT | provider 실패 또는 invalid output 사유 |
| started_at | TIMESTAMP NOT NULL | 실행 시작 시각 |
| completed_at | TIMESTAMP | 실행 완료 시각 |
| created_at | TIMESTAMP NOT NULL | 최초 저장 시각 |
| updated_at | TIMESTAMP NOT NULL | 최종 갱신 시각 |

정본 unique key는 `(report_id, answer_id, policy_version)`다. `BASE_ONLY_V1`이면 `follow_up_answer_id`는 NULL이고, `BASE_FOLLOW_UP_V1`이면 같은 base 질문에서 파생된 꼬리답변 ID가 필수다. 합산 문자열은 `baseTranscript + "\n" + followUpTranscript`로 재구성하며 claim offset은 이 문자열 기준이다. provider 실패는 `gate_status=NULL`로 저장하며 `UNVERIFIABLE` claim을 만들지 않는다.

### answer_fact_check_claims

| Column | Definition | Description |
| --- | --- | --- |
| fact_check_claim_id | BIGINT PRIMARY KEY | 사실 검증 claim PK |
| fact_check_run_id | BIGINT NOT NULL | 실행 FK |
| claim_text | TEXT NOT NULL | 답변 원문 exact segment |
| answer_start_offset | INTEGER NOT NULL | 답변 원문의 UTF-16 시작 offset |
| answer_end_offset | INTEGER NOT NULL | 답변 원문의 UTF-16 종료 offset, exclusive |
| claim_type | VARCHAR(40) NOT NULL | TECHNICAL_FACT, PERSONAL_EXPERIENCE, OPINION, OTHER |
| claim_role | VARCHAR(40) NOT NULL | ANSWER_CORE, SUPPORTING |
| verdict | VARCHAR(40) NOT NULL | SUPPORTED, CONTRADICTED, AMBIGUOUS, UNVERIFIABLE, NOT_CHECKABLE |
| confidence | DECIMAL(5,4) NOT NULL | 0 이상 1 이하 provider confidence |
| rationale | TEXT NOT NULL | claim 판정의 간단한 설명 |
| sort_order | INTEGER NOT NULL | 실행 내 claim 순서, 1 이상 |

`claim_text`는 `interview_answers.transcript`의 offset 구간과 정확히 일치해야 한다. 원본 답변을 수정하거나 claim으로 대체하지 않는다.

### answer_fact_check_evidences

| Column | Definition | Description |
| --- | --- | --- |
| fact_check_evidence_id | BIGINT PRIMARY KEY | claim 근거 연결 PK |
| fact_check_claim_id | BIGINT NOT NULL | claim FK |
| evidence_ledger_id | VARCHAR(80) NOT NULL | provider 입력 ledger의 요청 범위 식별자 |
| source_snapshot_id | VARCHAR(160) NOT NULL | 이력서/JD/답변/지식 snapshot 불변 ID |
| source_kind | VARCHAR(40) NOT NULL | ANSWER_SNAPSHOT, RESUME_SNAPSHOT, JD_SNAPSHOT, KNOWLEDGE_SNAPSHOT |
| source_start_offset | INTEGER NOT NULL | source snapshot 시작 offset |
| source_end_offset | INTEGER NOT NULL | source snapshot 종료 offset, exclusive |
| sort_order | INTEGER NOT NULL | claim 내 근거 순서, 1 이상 |

민감 원문은 snapshot과 offset으로 재현하고 evidence row에 중복 저장하지 않는다. source snapshot이 없으면 저장 근거로 인정하지 않는다.

### report_evidences

| Column | Definition | Description |
| --- |--- |--- |
| evidence_id | BIGINT PRIMARY KEY | 평가 근거 PK |
| score_id | BIGINT NOT NULL | 연결된 점수 FK |
| source_type | VARCHAR(80) NOT NULL | 근거 출처 유형: INTERVIEW_ANSWER, APPLICATION_DOCUMENT |
| answer_id | BIGINT | 근거가 된 답변 FK |
| document_id | BIGINT | 근거가 된 지원서 첨부 서류 FK |
| document_ref | VARCHAR(255) | 서류 원문이 아직 별도 document_id로 연결되지 않았을 때의 참조값 |
| evidence_text | TEXT NOT NULL | 근거 텍스트 |

### manual_evaluations

| Column | Definition | Description |
| --- |--- |--- |
| manual_eval_id | BIGINT PRIMARY KEY | 수동 평가 PK |
| report_id | BIGINT NOT NULL | 연결된 리포트 FK |
| reviewer_user_id | BIGINT NOT NULL | 검토자 사용자 FK |
| decision | VARCHAR(40) | 수동 판정: PASS, HOLD, FAIL, UNDECIDED |
| memo | TEXT | 검토 메모 |
| reviewed_at | TIMESTAMP | 검토 시각 |

### notifications

| Column | Definition | Description |
| --- |--- |--- |
| notification_id | BIGINT PRIMARY KEY | 알림 PK |
| user_id | BIGINT NOT NULL | 알림 수신 사용자 FK |
| application_id | BIGINT | 관련 지원서 FK |
| channel | VARCHAR(40) NOT NULL | 알림 채널: EMAIL, IN_APP |
| notification_type | VARCHAR(80) NOT NULL | 알림 유형 |
| status | VARCHAR(40) NOT NULL | 발송 상태 |
| sent_at | TIMESTAMP | 발송 시각 |

### ai_process_logs

| Column | Definition | Description |
| --- |--- |--- |
| process_log_id | BIGINT PRIMARY KEY | AI 비동기 처리 로그 PK |
| application_id | BIGINT | 관련 지원서 FK |
| session_id | BIGINT | 관련 면접 세션 FK |
| process_type | VARCHAR(80) NOT NULL | 처리 유형: DOCUMENT_EXTRACT, STT, FOLLOW_UP, REPORT_GENERATE, EMBEDDING, GUARDRAIL_VALIDATE, QUESTION_GENERATE, RESUME_QUESTION_GENERATE, POSTING_DRAFT_GENERATE. 폐기된 유형 값은 과거 로그 조회 호환을 위해 enum에 남길 수 있다. |
| status | VARCHAR(40) NOT NULL | 처리 상태: PENDING, RUNNING, COMPLETED, FAILED |
| input_ref | TEXT | 입력 참조값 |
| output_ref | TEXT | 출력 참조값 |
| failure_category | VARCHAR(40) | 실패 구분: RETRYABLE, NON_RETRYABLE, STT_RETRYABLE, REANSWER_REQUIRED |
| failure_reason | TEXT | 실패 사유. 재시도 가능 여부와 함께 기록 |
| lease_owner | VARCHAR(160) | 현재 작업을 원자적으로 claim한 worker 실행 식별자 |
| lease_expires_at | TIMESTAMP | worker claim 만료 시각. heartbeat마다 연장하며 만료된 RUNNING 작업만 재claim할 수 있다. |
| started_at | TIMESTAMP | 현재 처리 시도 시작 시각 |
| completed_at | TIMESTAMP | 처리 완료 또는 실패 시각 |
| duration_ms | INTEGER | 현재 처리 시도의 실행 시간 |
| model_name | VARCHAR(120) | 사용 model 이름 |
| input_tokens | INTEGER | 입력 token 사용량 |
| output_tokens | INTEGER | 출력 token 사용량 |
| audio_seconds | INTEGER | STT 오디오 길이 |
| estimated_cost_usd | DECIMAL(12,6) | 추정 AI 비용 |
| cost_metadata_json | TEXT | 비용 계산 메타데이터 |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |

`(status, lease_expires_at)` 조건부 갱신이 worker claim의 정본이다. `COMPLETED` 재전달은 provider를 호출하지 않고 ack하며, 유효한 lease가 있는 `RUNNING` 중복 메시지도 실행하지 않는다. `PENDING`, `FAILED`, 만료된 `RUNNING`만 새 lease를 획득할 수 있다. migration 이전에 생성된 `lease_expires_at IS NULL`인 `RUNNING` row는 배포 시 기존 worker를 중지한 뒤 새 worker가 한 번 재claim한다.

### ai_guardrail_logs

| Column | Definition | Description |
| --- |--- |--- |
| guardrail_log_id | BIGINT PRIMARY KEY | AI 안전 가드레일 로그 PK |
| process_log_id | BIGINT NOT NULL | 연결된 AI 처리 로그 FK |
| policy_name | VARCHAR(120) NOT NULL | 정책명 |
| result | VARCHAR(40) NOT NULL | 검증 결과: PASS, BLOCKED, REGENERATED |
| reason | TEXT | 사유 |
| failure_category | VARCHAR(40) | BLOCKED 결과의 실패 구분. PASS/REGENERATED는 null |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |

### embeddings

| Column | Definition | Description |
| --- |--- |--- |
| embedding_id | BIGINT PRIMARY KEY | 임베딩 PK |
| posting_id | BIGINT | 공고/JD 임베딩이면 postings FK |
| tag_id | BIGINT | 평가 태그 설명 임베딩이면 criterion_tags FK |
| question_id | BIGINT | 질문 임베딩이면 question_bank FK |
| document_id | BIGINT | 지원서 첨부 서류 임베딩이면 application_documents FK |
| answer_id | BIGINT | 면접 답변 임베딩이면 interview_answers FK |
| report_id | BIGINT | 리포트 요약/근거 임베딩이면 evaluation_reports FK |
| source_type | VARCHAR(80) NOT NULL | 임베딩 대상 유형: POSTING_JD, CRITERION_TAG, QUESTION, APPLICATION_DOCUMENT, INTERVIEW_ANSWER, EVALUATION_REPORT |
| source_text_hash | VARCHAR(128) NOT NULL | 임베딩에 사용한 원문 해시. 중복 생성 방지용 |
| embedding_model | VARCHAR(120) NOT NULL | 임베딩 모델명. 예: text-embedding-3-small |
| embedding_dimension | INTEGER NOT NULL | 임베딩 차원. 예: 1536 |
| embedding_vector | TEXT NOT NULL | ERDCloud 호환을 위해 TEXT로 선언. 실제 PostgreSQL + pgvector 사용 시 VECTOR(1536) 타입으로 교체 권장 |
| metadata_json | TEXT | 검색/필터링용 메타데이터 JSON 문자열 |
| created_at | TIMESTAMP NOT NULL | 생성 시각 |
| updated_at | TIMESTAMP NOT NULL | 수정 시각 |

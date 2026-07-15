-- init v0.5 refined ERDCloud SQL
-- 목적:
-- 1. users OAuth2/일반 로그인 구분 반영
-- 2. email_verifications 테이블 제거: 인증 코드는 Redis/캐시에서 TTL 기반으로 처리
-- 3. 평가 기준은 자연어 직접 입력이 아니라 criterion_tags 기반 선택 구조로 변경
-- 4. AI 검색/추천/평가 근거 활용을 위한 embeddings 테이블 추가
-- 5. ERDCloud import가 쉽도록 표준적인 CREATE TABLE + ALTER TABLE FK 구조로 작성

-- =========================================================
-- 1. 공통 사용자/기업/지원자
-- =========================================================

CREATE TABLE users (
    -- 서비스 내부 사용자 PK
    user_id BIGINT PRIMARY KEY,

    -- 로그인 이메일. LOCAL/GOOGLE 모두 이메일은 계정 식별 및 알림에 사용
    email VARCHAR(255) NOT NULL UNIQUE,

    -- LOCAL 가입자는 필수, GOOGLE OAuth2 가입자는 NULL 가능
    password_hash VARCHAR(255),

    -- 사용자 유형: ADMIN, COMPANY, CANDIDATE
    user_type VARCHAR(30) NOT NULL,

    -- 사용자 이름
    name VARCHAR(100) NOT NULL,

    -- 연락처
    phone VARCHAR(50),

    -- 계정 상태: ACTIVE, PENDING, SUSPENDED, DEACTIVATED
    status VARCHAR(30) NOT NULL,

    -- 계정 생성 시각
    created_at TIMESTAMP NOT NULL,

    -- 계정 수정 시각
    updated_at TIMESTAMP NOT NULL,

    -- 인증 방식: LOCAL, GOOGLE
    auth_provider VARCHAR(30) NOT NULL,

    -- OAuth2 provider가 내려주는 사용자 고유 ID
    -- 예: Google OAuth2의 sub 값 109876543210123456789
    provider_user_id VARCHAR(255)
);

CREATE TABLE companies (
    -- 회사 PK
    company_id BIGINT PRIMARY KEY,

    -- 회사를 최초 등록한 기업 사용자 FK
    owner_user_id BIGINT NOT NULL,

    -- 회사명
    name VARCHAR(150) NOT NULL,

    -- 사업자등록번호. DB에는 숫자만 정규화하여 저장하는 것을 권장
    business_registration_number VARCHAR(10) NOT NULL UNIQUE,

    -- 사업자/회사 검증 상태: PENDING, VERIFIED, REJECTED
    verification_status VARCHAR(30) NOT NULL,

    -- 회사 로고 파일 메타데이터 FK. 원본 파일은 S3에 저장하고 DB에는 file_assets 참조만 저장
    logo_file_id BIGINT,

    -- 산업군: IT, 제조, 금융, 교육 등
    industry VARCHAR(100),

    -- 회사 소개글
    profile TEXT,

    -- 회사가 원하는 인재상. AI 평가 기준/질문 생성 참고 정보
    talent_profile TEXT,

    -- 평가 정책. 예: 기술 50%, 협업 30%, 커뮤니케이션 20%
    evaluation_policy TEXT,

    -- 회사 정보 생성 시각
    created_at TIMESTAMP NOT NULL,

    -- 회사 정보 수정 시각
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE file_assets (
    -- 업로드 파일 PK
    file_id BIGINT PRIMARY KEY,

    -- 파일 소유 사용자 FK
    owner_user_id BIGINT NOT NULL,

    -- 스토리지 내부 키. 예: S3 object key
    storage_key VARCHAR(500) NOT NULL,

    -- 원본 파일명
    original_name VARCHAR(255) NOT NULL,

    -- MIME 타입
    mime_type VARCHAR(100) NOT NULL,

    -- 파일 크기 byte
    size_bytes BIGINT NOT NULL,

    -- 파일 상태: ACTIVE, DELETED, FAILED 등
    status VARCHAR(30) NOT NULL,

    -- 파일 생성/업로드 시각
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE candidate_profiles (
    -- 지원자 프로필 PK
    candidate_id BIGINT PRIMARY KEY,

    -- 연결된 사용자 계정 FK
    user_id BIGINT NOT NULL UNIQUE,

    -- 기본 이력서 파일 FK
    default_resume_file_id BIGINT,

    -- 대표 포트폴리오 URL
    portfolio_url VARCHAR(500),

    -- GitHub 주소
    github_url VARCHAR(500),

    -- 블로그 URL (#272 프로필 정본화)
    blog_url VARCHAR(500),

    -- 지원자 자기소개/요약 정보. AI 분석 또는 프로필 표시용
    summary TEXT,

    -- 맞춤형 면접 질문 생성에 사용하는 자기소개서
    cover_letter TEXT,

    -- 지원자 프로필 생성 시각
    created_at TIMESTAMP NOT NULL,

    -- 지원자 프로필 수정 시각
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE candidate_educations (
    education_id BIGINT PRIMARY KEY,
    candidate_id BIGINT NOT NULL,
    sort_order INTEGER NOT NULL,
    education_level VARCHAR(30) NOT NULL,
    school_name VARCHAR(150) NOT NULL,
    major VARCHAR(150),
    degree_type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    start_month DATE NOT NULL,
    end_month DATE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_candidate_educations_order UNIQUE (candidate_id, sort_order)
);

CREATE TABLE candidate_careers (
    career_id BIGINT PRIMARY KEY,
    candidate_id BIGINT NOT NULL,
    sort_order INTEGER NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    start_month DATE NOT NULL,
    end_month DATE,
    is_current BOOLEAN NOT NULL,
    job_role VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    position VARCHAR(100),
    responsibilities VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_candidate_careers_order UNIQUE (candidate_id, sort_order)
);

CREATE TABLE candidate_activities (
    activity_id BIGINT PRIMARY KEY,
    candidate_id BIGINT NOT NULL,
    sort_order INTEGER NOT NULL,
    activity_type VARCHAR(30) NOT NULL,
    organization_name VARCHAR(150) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_ongoing BOOLEAN NOT NULL,
    description VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_candidate_activities_order UNIQUE (candidate_id, sort_order)
);

CREATE TABLE candidate_credentials (
    credential_id BIGINT PRIMARY KEY,
    candidate_id BIGINT NOT NULL,
    sort_order INTEGER NOT NULL,
    credential_type VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    issuer VARCHAR(150) NOT NULL,
    acquired_month DATE NOT NULL,
    result VARCHAR(200),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_candidate_credentials_order UNIQUE (candidate_id, sort_order)
);

CREATE TABLE candidate_folders (
    -- 기업별 지원서 세트 PK
    id BIGINT PRIMARY KEY,

    -- 지원자 프로필 FK
    candidate_id BIGINT NOT NULL,

    -- 지원서 세트 이름
    name VARCHAR(100) NOT NULL,

    -- GitHub URL
    github_url VARCHAR(500),

    -- 블로그 URL
    blog_url VARCHAR(500),

    -- 포트폴리오 URL
    portfolio_url VARCHAR(500),

    -- 폴더 이력서 파일 FK
    resume_file_id BIGINT,

    -- 폴더 포트폴리오 PDF 파일 FK (#272 P1-2)
    portfolio_file_id BIGINT,

    -- 지원 동기
    motivation TEXT,

    -- 추가 설명
    extra_note TEXT,

    -- 지원서 세트 생성/최초 수정 시 고정한 전체 프로필 복사본
    profile_snapshot JSONB,

    -- 폴더 생성 시각
    created_at TIMESTAMP NOT NULL,

    -- 폴더 수정 시각
    updated_at TIMESTAMP NOT NULL
);

-- =========================================================
-- 2. 채용 공고/평가 태그/질문
-- =========================================================

CREATE TABLE postings (
    -- 채용 공고 PK
    posting_id BIGINT PRIMARY KEY,

    -- 이 공고를 올린 회사 FK
    company_id BIGINT NOT NULL,

    -- 공고 제목. 예: 2026 신입 백엔드 채용
    title VARCHAR(200) NOT NULL,

    -- 직무명. 예: Backend Developer
    job_role VARCHAR(100) NOT NULL,

    -- 직무 설명/JD
    job_description TEXT,

    -- 지원 시작일
    starts_on DATE,

    -- 지원 마감일
    ends_on DATE,

    -- 공고 상태: DRAFT, OPEN, CLOSING_SOON, CLOSED, ARCHIVED
    status VARCHAR(30) NOT NULL,

    -- 공고 생성 시각
    created_at TIMESTAMP NOT NULL,

    -- 공고 수정 시각
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE criterion_tags (
    -- 평가 태그 PK
    tag_id BIGINT PRIMARY KEY,

    -- 이 태그가 주로 쓰이는 직무. 예: Backend, Frontend, AI Engineer, Common
    job_role VARCHAR(100) NOT NULL,

    -- 태그 이름. 예: API 설계, DB 모델링, 장애 대응
    name VARCHAR(100) NOT NULL,

    -- 태그 설명. AI가 질문/평가할 때 참고하는 기준 역량
    description TEXT,

    -- 태그 분류. 예: 기술역량, 문제해결, 협업, 커뮤니케이션
    category VARCHAR(80) NOT NULL,

    -- 현재 추천/선택 가능한 태그인지 여부
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 화면 표시 순서
    sort_order INTEGER NOT NULL,

    ncs_profile_id VARCHAR(50),

    default_ncs_question_mode VARCHAR(50),

    ncs_profile_version VARCHAR(80)
);

CREATE TABLE evaluation_criteria (
    -- 공고별 선택 평가 기준 PK
    criterion_id BIGINT PRIMARY KEY,

    -- 이 기준이 적용되는 채용 공고 FK
    posting_id BIGINT NOT NULL,

    -- 선택된 평가 태그 FK
    tag_id BIGINT NOT NULL,

    -- 이 공고에서 사용하는 평가 기준 상세 설명 스냅샷
    description TEXT,

    -- 가중치. 예: 30
    weight INTEGER NOT NULL,

    -- 이 항목에서 통과로 볼 최소 점수
    pass_score INTEGER,

    -- 화면 표시 순서
    sort_order INTEGER NOT NULL,

    ncs_profile_id VARCHAR(50),

    ncs_question_mode VARCHAR(50),

    ncs_profile_version VARCHAR(80)
);

CREATE TABLE question_bank (
    -- 질문 PK
    question_id BIGINT PRIMARY KEY,

    -- 이 질문을 보유한 회사 FK
    company_id BIGINT NOT NULL,

    -- 특정 공고에 연결된 질문이면 공고 FK. 공통 질문이면 NULL 가능
    posting_id BIGINT,

    -- 어떤 공고별 평가 기준과 연결된 질문인지
    criterion_id BIGINT,

    -- 질문 유형: INTRO, TECHNICAL, EXPERIENCE, SITUATION, FOLLOW_UP, CLOSING
    question_type VARCHAR(50) NOT NULL,

    -- 실제 질문 문장
    content TEXT NOT NULL,

    -- 최초 작성 출처: MANUAL, AI_GENERATED
    origin VARCHAR(30) NOT NULL DEFAULT 'MANUAL',

    -- AI 생성 질문이 사용자에 의해 수정되었는지 여부
    is_ai_edited BOOLEAN NOT NULL DEFAULT FALSE,

    -- 현재 사용 가능한 질문인지 여부
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    generation_source VARCHAR(50),

    ncs_profile_id VARCHAR(50),

    ncs_question_mode VARCHAR(50),

    ncs_profile_version VARCHAR(80),

    alignment_status VARCHAR(40),

    alignment_score DECIMAL(8,6),

    alignment_reason TEXT,

    evaluator_version VARCHAR(80),

    source_process_log_id BIGINT
);

CREATE TABLE interview_question_generation_policies (
    posting_id BIGINT PRIMARY KEY,
    evaluation_framework VARCHAR(50) NOT NULL DEFAULT 'LEGACY',
    jd_criteria_question_count INTEGER NOT NULL DEFAULT 0,
    resume_question_count INTEGER NOT NULL DEFAULT 0,
    policy_version INTEGER NOT NULL DEFAULT 0,
    criteria_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE application_interview_question_batches (
    batch_id BIGINT PRIMARY KEY,
    application_id BIGINT NOT NULL,
    latest_process_log_id BIGINT NOT NULL,
    status VARCHAR(40) NOT NULL,
    policy_version INTEGER NOT NULL,
    criteria_version INTEGER NOT NULL,
    input_version VARCHAR(128) NOT NULL,
    resume_document_hash VARCHAR(128) NOT NULL,
    jd_snapshot_hash VARCHAR(128) NOT NULL,
    evaluator_version VARCHAR(80),
    failure_reason TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE application_interview_questions (
    personalized_question_id BIGINT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    criterion_id BIGINT,
    source_process_log_id BIGINT NOT NULL,
    criterion_title_snapshot VARCHAR(200) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'RESUME_PERSONALIZED',
    question_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    ncs_profile_id VARCHAR(50) NOT NULL,
    ncs_question_mode VARCHAR(50) NOT NULL,
    ncs_profile_version VARCHAR(80) NOT NULL,
    alignment_status VARCHAR(40) NOT NULL,
    alignment_score DECIMAL(8,6),
    alignment_reason TEXT,
    evaluator_version VARCHAR(80),
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_ncs_bindings (
    question_id BIGINT NOT NULL,
    criterion_id BIGINT NOT NULL,
    ncs_profile_id VARCHAR(50) NOT NULL,
    ncs_profile_version VARCHAR(80) NOT NULL,
    alignment_status VARCHAR(40) NOT NULL,
    alignment_score DECIMAL(8,6),
    alignment_reason TEXT,
    evaluator_version VARCHAR(80),
    binding_order INTEGER NOT NULL,
    CONSTRAINT pk_question_ncs_bindings PRIMARY KEY (question_id, ncs_profile_id),
    CONSTRAINT uq_question_ncs_bindings_order UNIQUE (question_id, binding_order)
);

CREATE TABLE application_question_ncs_bindings (
    personalized_question_id BIGINT NOT NULL,
    criterion_id BIGINT,
    ncs_profile_id VARCHAR(50) NOT NULL,
    ncs_profile_version VARCHAR(80) NOT NULL,
    alignment_status VARCHAR(40) NOT NULL,
    alignment_score DECIMAL(8,6),
    alignment_reason TEXT,
    evaluator_version VARCHAR(80),
    binding_order INTEGER NOT NULL,
    CONSTRAINT pk_application_question_ncs_bindings PRIMARY KEY (personalized_question_id, ncs_profile_id),
    CONSTRAINT uq_application_question_ncs_bindings_order UNIQUE (personalized_question_id, binding_order)
);

-- =========================================================
-- 3. 지원/서류/동의/면접
-- =========================================================

CREATE TABLE applications (
    -- 지원서/지원 이력 PK
    application_id BIGINT PRIMARY KEY,

    -- 어떤 공고에 지원했는지
    posting_id BIGINT NOT NULL,

    -- 누가 지원했는지
    candidate_id BIGINT NOT NULL,

    -- 지원 전체 진행 상태:
    -- DRAFT, SUBMITTED, IN_REVIEW, INTERVIEW_WAITING, INTERVIEW_DONE, COMPLETED, CANCELED
    application_status VARCHAR(40) NOT NULL,

    -- 서류 제출/분석 상태:
    -- NOT_SUBMITTED, SUBMITTED, EXTRACTING, EXTRACTED, FAILED
    document_status VARCHAR(40) NOT NULL,

    -- AI 면접 응시 상태:
    -- NOT_READY, READY, IN_PROGRESS, COMPLETED, FAILED
    interview_status VARCHAR(40) NOT NULL,

    -- 평가 리포트 생성 상태:
    -- PENDING, GENERATING, COMPLETED, FAILED
    report_status VARCHAR(40) NOT NULL,

    -- 기업 담당자의 다음 전형 판정:
    -- UNDECIDED, PASS, HOLD, FAIL
    screening_decision VARCHAR(40),

    -- 기업 담당자 메모
    screening_memo TEXT,

    -- 지원서 제출 당시 전체 프로필 복사본
    profile_snapshot JSONB,

    -- 지원서 최종 제출 시각
    submitted_at TIMESTAMP,

    -- 지원 건 마지막 수정 시각
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE application_documents (
    -- 지원서 첨부 서류 PK
    document_id BIGINT PRIMARY KEY,

    -- 연결된 지원서 FK
    application_id BIGINT NOT NULL,

    -- 업로드 파일 FK
    file_id BIGINT,

    -- 서류 유형: RESUME, PORTFOLIO
    document_type VARCHAR(50) NOT NULL,

    -- 파싱 상태: SUBMITTED, EXTRACTING, EXTRACTED, FAILED
    parse_status VARCHAR(40) NOT NULL,

    -- AI가 추출한 텍스트
    extracted_text TEXT,

    -- 업로드 시각
    uploaded_at TIMESTAMP NOT NULL
);

CREATE TABLE consent_records (
    -- 동의 기록 PK
    consent_id BIGINT PRIMARY KEY,

    -- 연결된 지원서 FK
    application_id BIGINT NOT NULL,

    -- 동의 유형: PRIVACY_COLLECTION, AI_DOCUMENT_ANALYSIS, AI_INTERVIEW_RECORDING
    consent_type VARCHAR(80) NOT NULL,

    -- 동의 여부
    agreed BOOLEAN NOT NULL,

    -- 동의 시각
    agreed_at TIMESTAMP
);

CREATE TABLE interview_sessions (
    -- 면접 세션 PK
    session_id BIGINT PRIMARY KEY,

    -- 채용 AI 면접이면 지원서 FK, 모의면접이면 NULL 가능
    application_id BIGINT,

    -- 면접 응시 지원자 FK
    candidate_id BIGINT NOT NULL,

    -- 면접 유형: MOCK, RECRUITING
    interview_type VARCHAR(40) NOT NULL,

    -- 면접 상태: NOT_READY, READY, IN_PROGRESS, COMPLETED, FAILED
    status VARCHAR(40) NOT NULL,

    -- 연습(모의면접) 세션 사용자 지정 제목. NULL이면 기본 '세션 #N' 표기
    title VARCHAR(100),

    -- 면접 질문 텍스트 표시 여부
    show_question_text BOOLEAN NOT NULL DEFAULT FALSE,

    preparation_time_sec_snapshot INTEGER,

    answer_time_sec_snapshot INTEGER,

    retry_allowed_snapshot BOOLEAN,

    ncs_scoring_version VARCHAR(80),

    -- 면접 시작 시각
    started_at TIMESTAMP,

    -- 면접 완료 시각
    completed_at TIMESTAMP
);

CREATE TABLE interview_session_ncs_policies (
    session_id BIGINT NOT NULL,
    ncs_profile_id VARCHAR(50) NOT NULL,
    criterion_id BIGINT,
    criterion_title_snapshot VARCHAR(200) NOT NULL,
    weight INTEGER NOT NULL,
    minimum_average_score DECIMAL(5,2) NOT NULL DEFAULT 3,
    required_question_count INTEGER NOT NULL DEFAULT 2,
    ncs_profile_version VARCHAR(80) NOT NULL,
    CONSTRAINT pk_interview_session_ncs_policies PRIMARY KEY (session_id, ncs_profile_id)
);

CREATE TABLE interview_answers (
    -- 질문별 답변 PK
    answer_id BIGINT PRIMARY KEY,

    -- 연결된 면접 세션 FK
    session_id BIGINT NOT NULL,

    -- 답변한 질문 FK
    question_id BIGINT,

    -- 세션 질문 연결 FK
    session_question_id BIGINT,

    -- 답변 영상 파일 FK
    video_file_id BIGINT,

    -- 답변 음성 파일 FK
    audio_file_id BIGINT,

    -- STT로 변환된 답변 스크립트
    transcript TEXT,

    -- 답변 시간 초 단위
    duration_seconds INTEGER,

    -- 답변 제출 시각
    submitted_at TIMESTAMP
);

CREATE TABLE interview_session_questions (
    -- 세션 질문 행 PK
    session_question_id BIGINT PRIMARY KEY,

    -- 면접 세션 FK
    session_id BIGINT NOT NULL,

    -- 기업 질문 은행 질문 원본 FK. 개인화 질문은 NULL
    question_id BIGINT,

    -- 지원자별 개인화 질문 원본 FK
    personalized_question_id BIGINT,

    -- 전용 시퀀스에서 발급하는 session 런타임 질문 ID
    runtime_question_id BIGINT,

    criterion_id BIGINT,

    criterion_title_snapshot VARCHAR(200),

    generation_source VARCHAR(50),

    question_type VARCHAR(40),

    -- 개인 모의면접 또는 NCS 채용 질문 본문 snapshot
    content TEXT,

    ncs_profile_id VARCHAR(50),

    ncs_question_mode VARCHAR(50),

    ncs_profile_version VARCHAR(80),

    alignment_status VARCHAR(40),

    alignment_score DECIMAL(8,6),

    alignment_reason TEXT,

    evaluator_version VARCHAR(80),

    policy_version INTEGER,

    criteria_version INTEGER,

    -- 세션 안의 질문 표시 순서
    sort_order INTEGER NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_interview_session_questions_order UNIQUE (session_id, sort_order)
);

CREATE TABLE session_question_ncs_bindings (
    session_question_id BIGINT NOT NULL,
    criterion_id BIGINT,
    criterion_title_snapshot VARCHAR(200) NOT NULL,
    ncs_profile_id VARCHAR(50) NOT NULL,
    ncs_profile_version VARCHAR(80) NOT NULL,
    alignment_status VARCHAR(40) NOT NULL,
    alignment_score DECIMAL(8,6),
    alignment_reason TEXT,
    evaluator_version VARCHAR(80),
    binding_order INTEGER NOT NULL,
    CONSTRAINT pk_session_question_ncs_bindings PRIMARY KEY (session_question_id, ncs_profile_id),
    CONSTRAINT uq_session_question_ncs_bindings_order UNIQUE (session_question_id, binding_order)
);

CREATE TABLE follow_up_questions (
    -- 꼬리질문 PK
    follow_up_id BIGINT PRIMARY KEY,

    -- 어떤 답변에서 파생된 꼬리질문인지
    answer_id BIGINT NOT NULL,

    -- 원본 base session question
    source_session_question_id BIGINT,

    -- 실제 세션에 추가된 private FOLLOW_UP question
    inserted_session_question_id BIGINT,

    -- 꼬리질문 내용. 불필요 판정이면 빈 문자열
    content TEXT NOT NULL,

    -- 생성 상태: READY, INSERTED, SKIPPED
    generation_status VARCHAR(40) NOT NULL,

    policy VARCHAR(40) NOT NULL DEFAULT 'RECRUITING',
    reason VARCHAR(40),
    skip_reason VARCHAR(50),
    question_mode VARCHAR(50),
    answer_time_sec INTEGER,
    inserted_at TIMESTAMP,

    -- 생성 시각
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT ck_follow_up_questions_reason
        CHECK (reason IS NULL OR reason IN ('NCS_EVIDENCE_GAP', 'FACT_CLARIFICATION', 'GENERAL_EVIDENCE_GAP'))
);

-- =========================================================
-- 4. 평가 리포트/수동 평가
-- =========================================================

CREATE TABLE evaluation_reports (
    -- 평가 리포트 PK
    report_id BIGINT PRIMARY KEY,

    -- 채용 지원서 FK. 모의면접 리포트면 NULL 가능
    application_id BIGINT,

    -- 면접 세션 FK
    session_id BIGINT,

    -- 리포트 유형: MOCK_INTERVIEW_REPORT, RECRUITING_REPORT
    report_type VARCHAR(50) NOT NULL,

    -- 리포트 상태: PENDING, GENERATING, COMPLETED, FAILED
    status VARCHAR(40) NOT NULL,

    -- 총점
    total_score INTEGER,

    -- 리포트 요약
    summary TEXT,

    ncs_completion_status VARCHAR(40),

    ncs_threshold_result VARCHAR(40),

    ncs_ai_decision VARCHAR(20),

    ncs_decision_reason_code VARCHAR(80),

    ncs_scoring_version VARCHAR(80),

    ncs_decision_policy_version VARCHAR(80),

    ncs_summary_json JSONB,

    -- 리포트 생성 시각
    generated_at TIMESTAMP,

    -- 실패 구분: RETRYABLE, NON_RETRYABLE
    failure_category VARCHAR(40),

    -- 실패 사유
    failure_reason TEXT
);

CREATE TABLE report_scores (
    -- 평가 항목별 점수 PK
    score_id BIGINT PRIMARY KEY,

    -- 연결된 리포트 FK
    report_id BIGINT NOT NULL,

    -- 평가 기준 FK
    criterion_id BIGINT,

    -- 점수
    score INTEGER,

    -- 평가 사유
    rationale TEXT,

    ncs_profile_id VARCHAR(50),

    average_score DECIMAL(5,2),

    normalized_score INTEGER,

    weight INTEGER,

    weighted_score DECIMAL(5,2),

    minimum_average_score DECIMAL(5,2),

    assigned_question_count INTEGER,

    valid_question_count INTEGER
);

CREATE TABLE ncs_answer_evaluations (
    ncs_evaluation_id BIGINT PRIMARY KEY,
    report_id BIGINT NOT NULL,
    answer_id BIGINT NOT NULL,
    follow_up_answer_id BIGINT,
    input_composition_version VARCHAR(50) NOT NULL DEFAULT 'BASE_ONLY_V1',
    session_question_id BIGINT NOT NULL,
    criterion_id BIGINT,
    criterion_title_snapshot VARCHAR(200) NOT NULL,
    ncs_profile_id VARCHAR(50) NOT NULL,
    ncs_question_mode VARCHAR(50) NOT NULL,
    ncs_profile_version VARCHAR(80) NOT NULL,
    score_status VARCHAR(40) NOT NULL,
    competency_score INTEGER,
    evidence_score INTEGER,
    total_score INTEGER,
    behavior_points INTEGER,
    logic_points INTEGER,
    base_score INTEGER,
    effective_score INTEGER,
    follow_up_applied BOOLEAN NOT NULL DEFAULT FALSE,
    coverage DECIMAL(8, 6) NOT NULL,
    confidence VARCHAR(20) NOT NULL,
    rubric_version VARCHAR(80) NOT NULL,
    prompt_version VARCHAR(100) NOT NULL,
    provider_mode VARCHAR(20) NOT NULL,
    model_name VARCHAR(120),
    result_json JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT ck_ncs_answer_evaluations_status
        CHECK (score_status IN ('SCORED', 'INSUFFICIENT_INPUT', 'LOW_ALIGNMENT', 'BLOCKED')),
    CONSTRAINT ck_ncs_answer_evaluations_legacy_score_shape
        CHECK (
            (score_status = 'SCORED'
                AND (
                    (competency_score IS NULL
                        AND evidence_score IS NULL
                        AND total_score IS NULL)
                    OR
                    (competency_score BETWEEN 0 AND 100
                        AND evidence_score BETWEEN 0 AND 100
                        AND total_score BETWEEN 0 AND 100)
                ))
            OR
            (score_status <> 'SCORED'
                AND competency_score IS NULL
                AND evidence_score IS NULL
                AND total_score IS NULL)
        ),
    CONSTRAINT ck_ncs_answer_evaluations_profile
        CHECK (ncs_profile_id IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
    CONSTRAINT ck_ncs_answer_evaluations_mode
        CHECK (ncs_question_mode IN ('EXPERIENCE_BEHAVIOR', 'TECHNICAL_KNOWLEDGE', 'SITUATIONAL_DESIGN')),
    CONSTRAINT ck_ncs_answer_evaluations_confidence
        CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
    CONSTRAINT ck_ncs_answer_evaluations_provider
        CHECK (provider_mode IN ('mock', 'openai')),
    CONSTRAINT ck_ncs_answer_evaluations_coverage
        CHECK (coverage >= 0 AND coverage <= 1)
);

CREATE TABLE ncs_answer_evaluation_evidences (
    evidence_id BIGINT PRIMARY KEY,
    ncs_evaluation_id BIGINT NOT NULL,
    source_answer_id BIGINT NOT NULL,
    source_kind VARCHAR(20) NOT NULL,
    quote TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    CONSTRAINT uq_ncs_answer_evaluation_evidences_source_order
        UNIQUE (ncs_evaluation_id, source_answer_id, sort_order)
);

CREATE TABLE answer_fact_check_runs (
    fact_check_run_id BIGINT PRIMARY KEY,
    report_id BIGINT NOT NULL,
    answer_id BIGINT NOT NULL,
    provider_status VARCHAR(40) NOT NULL,
    gate_status VARCHAR(40),
    provider_mode VARCHAR(20) NOT NULL,
    model_version VARCHAR(120) NOT NULL,
    prompt_version VARCHAR(100) NOT NULL,
    knowledge_snapshot_version VARCHAR(100) NOT NULL,
    policy_version VARCHAR(100) NOT NULL,
    failure_reason TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT ck_answer_fact_check_runs_provider_status
        CHECK (provider_status IN ('COMPLETED', 'FAILED', 'TIMEOUT', 'INVALID_OUTPUT')),
    CONSTRAINT ck_answer_fact_check_runs_gate_status
        CHECK (gate_status IS NULL OR gate_status IN ('PASS_THROUGH', 'CLARIFICATION_CANDIDATE', 'FACT_CHECK_REQUIRED')),
    CONSTRAINT ck_answer_fact_check_runs_status_shape
        CHECK (
            (provider_status = 'COMPLETED' AND gate_status IS NOT NULL AND failure_reason IS NULL)
            OR
            (provider_status <> 'COMPLETED' AND gate_status IS NULL AND failure_reason IS NOT NULL)
        ),
    CONSTRAINT ck_answer_fact_check_runs_input_composition
        CHECK (
            (input_composition_version = 'BASE_ONLY_V1' AND follow_up_answer_id IS NULL)
            OR
            (input_composition_version = 'BASE_FOLLOW_UP_V1' AND follow_up_answer_id IS NOT NULL AND follow_up_answer_id <> answer_id)
        ),
    CONSTRAINT uq_answer_fact_check_runs_report_answer_policy
        UNIQUE (report_id, answer_id, policy_version)
);

CREATE TABLE answer_fact_check_claims (
    fact_check_claim_id BIGINT PRIMARY KEY,
    fact_check_run_id BIGINT NOT NULL,
    claim_text TEXT NOT NULL,
    answer_start_offset INTEGER NOT NULL,
    answer_end_offset INTEGER NOT NULL,
    claim_type VARCHAR(40) NOT NULL,
    claim_role VARCHAR(40) NOT NULL,
    verdict VARCHAR(40) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    rationale TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    CONSTRAINT ck_answer_fact_check_claims_offsets
        CHECK (answer_start_offset >= 0 AND answer_end_offset > answer_start_offset),
    CONSTRAINT ck_answer_fact_check_claims_type
        CHECK (claim_type IN ('TECHNICAL_FACT', 'PERSONAL_EXPERIENCE', 'OPINION', 'OTHER')),
    CONSTRAINT ck_answer_fact_check_claims_role
        CHECK (claim_role IN ('ANSWER_CORE', 'SUPPORTING')),
    CONSTRAINT ck_answer_fact_check_claims_verdict
        CHECK (verdict IN ('SUPPORTED', 'CONTRADICTED', 'AMBIGUOUS', 'UNVERIFIABLE', 'NOT_CHECKABLE')),
    CONSTRAINT ck_answer_fact_check_claims_confidence
        CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT ck_answer_fact_check_claims_sort_order
        CHECK (sort_order >= 1),
    CONSTRAINT uq_answer_fact_check_claims_run_order
        UNIQUE (fact_check_run_id, sort_order)
);

CREATE TABLE answer_fact_check_evidences (
    fact_check_evidence_id BIGINT PRIMARY KEY,
    fact_check_claim_id BIGINT NOT NULL,
    evidence_ledger_id VARCHAR(80) NOT NULL,
    source_snapshot_id VARCHAR(160) NOT NULL,
    source_kind VARCHAR(40) NOT NULL,
    source_start_offset INTEGER NOT NULL,
    source_end_offset INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    CONSTRAINT ck_answer_fact_check_evidences_source_kind
        CHECK (source_kind IN ('ANSWER_SNAPSHOT', 'RESUME_SNAPSHOT', 'JD_SNAPSHOT', 'KNOWLEDGE_SNAPSHOT')),
    CONSTRAINT ck_answer_fact_check_evidences_offsets
        CHECK (source_start_offset >= 0 AND source_end_offset > source_start_offset),
    CONSTRAINT ck_answer_fact_check_evidences_sort_order
        CHECK (sort_order >= 1),
    CONSTRAINT uq_answer_fact_check_evidences_claim_order
        UNIQUE (fact_check_claim_id, sort_order),
    CONSTRAINT uq_answer_fact_check_evidences_claim_ledger
        UNIQUE (fact_check_claim_id, evidence_ledger_id)
);

CREATE TABLE report_evidences (
    -- 평가 근거 PK
    evidence_id BIGINT PRIMARY KEY,

    -- 연결된 점수 FK
    score_id BIGINT NOT NULL,

    -- 근거 출처 유형: INTERVIEW_ANSWER, APPLICATION_DOCUMENT
    source_type VARCHAR(80) NOT NULL,

    -- 근거가 된 답변 FK
    answer_id BIGINT,

    -- 근거가 된 지원서 첨부 서류 FK
    document_id BIGINT,

    -- 서류 원문이 아직 별도 document_id로 연결되지 않았을 때의 참조값
    document_ref VARCHAR(255),

    -- 근거 텍스트
    evidence_text TEXT NOT NULL
);

CREATE TABLE manual_evaluations (
    -- 수동 평가 PK
    manual_eval_id BIGINT PRIMARY KEY,

    -- 연결된 리포트 FK
    report_id BIGINT NOT NULL,

    -- 검토자 사용자 FK
    reviewer_user_id BIGINT NOT NULL,

    -- 수동 판정: PASS, HOLD, FAIL, UNDECIDED
    decision VARCHAR(40),

    -- 검토 메모
    memo TEXT,

    -- 검토 시각
    reviewed_at TIMESTAMP
);

-- =========================================================
-- 5. 알림/AI 처리/임베딩
-- =========================================================

CREATE TABLE notifications (
    -- 알림 PK
    notification_id BIGINT PRIMARY KEY,

    -- 알림 수신 사용자 FK
    user_id BIGINT NOT NULL,

    -- 관련 지원서 FK
    application_id BIGINT,

    -- 알림 채널: EMAIL, IN_APP
    channel VARCHAR(40) NOT NULL,

    -- 알림 유형
    notification_type VARCHAR(80) NOT NULL,

    -- 발송 상태
    status VARCHAR(40) NOT NULL,

    -- 발송 시각
    sent_at TIMESTAMP
);

CREATE TABLE ai_process_logs (
    -- AI 비동기 처리 로그 PK
    process_log_id BIGINT PRIMARY KEY,

    -- 관련 지원서 FK
    application_id BIGINT,

    -- 관련 면접 세션 FK
    session_id BIGINT,

    -- 처리 유형: DOCUMENT_EXTRACT, STT, FOLLOW_UP, REPORT_GENERATE, EMBEDDING, GUARDRAIL_VALIDATE, CRITERIA_SUGGEST, QUESTION_GENERATE, QUESTION_SET_GENERATE, POSTING_DRAFT_GENERATE
    process_type VARCHAR(80) NOT NULL,

    -- 처리 상태: PENDING, RUNNING, COMPLETED, FAILED
    status VARCHAR(40) NOT NULL,

    -- 입력 참조값
    input_ref TEXT,

    -- 출력 참조값
    output_ref TEXT,

    -- 실패 구분: RETRYABLE, NON_RETRYABLE
    failure_category VARCHAR(40),

    -- 실패 사유
    failure_reason TEXT,

    -- 생성 시각
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE ai_guardrail_logs (
    -- AI 안전 가드레일 로그 PK
    guardrail_log_id BIGINT PRIMARY KEY,

    -- 연결된 AI 처리 로그 FK
    process_log_id BIGINT NOT NULL,

    -- 정책명
    policy_name VARCHAR(120) NOT NULL,

    -- 검증 결과: PASS, BLOCKED, REGENERATED
    result VARCHAR(40) NOT NULL,

    -- 사유
    reason TEXT,

    -- BLOCKED 결과의 실패 구분. PASS/REGENERATED는 null
    failure_category VARCHAR(40),

    -- 생성 시각
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE embeddings (
    -- 임베딩 PK
    embedding_id BIGINT PRIMARY KEY,

    -- 공고/JD 임베딩이면 postings FK
    posting_id BIGINT,

    -- 평가 태그 설명 임베딩이면 criterion_tags FK
    tag_id BIGINT,

    -- 질문 임베딩이면 question_bank FK
    question_id BIGINT,

    -- 지원서 첨부 서류 임베딩이면 application_documents FK
    document_id BIGINT,

    -- 면접 답변 임베딩이면 interview_answers FK
    answer_id BIGINT,

    -- 리포트 요약/근거 임베딩이면 evaluation_reports FK
    report_id BIGINT,

    -- 임베딩 대상 유형:
    -- POSTING_JD, CRITERION_TAG, QUESTION, APPLICATION_DOCUMENT, INTERVIEW_ANSWER, EVALUATION_REPORT
    source_type VARCHAR(80) NOT NULL,

    -- 임베딩에 사용한 원문 해시. 중복 생성 방지용
    source_text_hash VARCHAR(128) NOT NULL,

    -- 임베딩 모델명. 예: text-embedding-3-small
    embedding_model VARCHAR(120) NOT NULL,

    -- 임베딩 차원. 예: 1536
    embedding_dimension INTEGER NOT NULL,

    -- ERDCloud 호환을 위해 TEXT로 선언.
    -- 실제 PostgreSQL + pgvector 사용 시 VECTOR(1536) 타입으로 교체 권장
    embedding_vector TEXT NOT NULL,

    -- 검색/필터링용 메타데이터 JSON 문자열
    metadata_json TEXT,

    -- 생성 시각
    created_at TIMESTAMP NOT NULL,

    -- 수정 시각
    updated_at TIMESTAMP NOT NULL
);

-- =========================================================
-- 6. FK 관계
-- =========================================================

ALTER TABLE companies
    ADD CONSTRAINT fk_companies_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id);

ALTER TABLE companies
    ADD CONSTRAINT fk_companies_logo_file
    FOREIGN KEY (logo_file_id) REFERENCES file_assets(file_id);

ALTER TABLE file_assets
    ADD CONSTRAINT fk_file_assets_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id);

ALTER TABLE candidate_profiles
    ADD CONSTRAINT fk_candidate_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE candidate_profiles
    ADD CONSTRAINT fk_candidate_profiles_default_resume
    FOREIGN KEY (default_resume_file_id) REFERENCES file_assets(file_id);

ALTER TABLE candidate_educations
    ADD CONSTRAINT fk_candidate_educations_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id) ON DELETE CASCADE;

ALTER TABLE candidate_careers
    ADD CONSTRAINT fk_candidate_careers_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id) ON DELETE CASCADE;

ALTER TABLE candidate_activities
    ADD CONSTRAINT fk_candidate_activities_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id) ON DELETE CASCADE;

ALTER TABLE candidate_credentials
    ADD CONSTRAINT fk_candidate_credentials_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id) ON DELETE CASCADE;

ALTER TABLE candidate_folders
    ADD CONSTRAINT fk_candidate_folders_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id) ON DELETE CASCADE;

ALTER TABLE candidate_folders
    ADD CONSTRAINT fk_candidate_folders_resume_file
    FOREIGN KEY (resume_file_id) REFERENCES file_assets(file_id) ON DELETE SET NULL;

ALTER TABLE candidate_folders
    ADD CONSTRAINT fk_candidate_folders_portfolio_file
    FOREIGN KEY (portfolio_file_id) REFERENCES file_assets(file_id) ON DELETE SET NULL;

ALTER TABLE postings
    ADD CONSTRAINT fk_postings_company
    FOREIGN KEY (company_id) REFERENCES companies(company_id);

ALTER TABLE evaluation_criteria
    ADD CONSTRAINT fk_evaluation_criteria_posting
    FOREIGN KEY (posting_id) REFERENCES postings(posting_id);

ALTER TABLE evaluation_criteria
    ADD CONSTRAINT fk_evaluation_criteria_tag
    FOREIGN KEY (tag_id) REFERENCES criterion_tags(tag_id);

ALTER TABLE question_bank
    ADD CONSTRAINT fk_question_bank_company
    FOREIGN KEY (company_id) REFERENCES companies(company_id);

ALTER TABLE question_bank
    ADD CONSTRAINT fk_question_bank_posting
    FOREIGN KEY (posting_id) REFERENCES postings(posting_id);

ALTER TABLE question_bank
    ADD CONSTRAINT fk_question_bank_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id);

ALTER TABLE question_bank
    ADD CONSTRAINT fk_question_bank_source_process
    FOREIGN KEY (source_process_log_id) REFERENCES ai_process_logs(process_log_id)
    ON DELETE SET NULL;

ALTER TABLE interview_question_generation_policies
    ADD CONSTRAINT fk_interview_question_generation_policies_posting
    FOREIGN KEY (posting_id) REFERENCES postings(posting_id)
    ON DELETE CASCADE;

ALTER TABLE application_interview_question_batches
    ADD CONSTRAINT fk_application_interview_question_batches_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id)
    ON DELETE CASCADE;

ALTER TABLE application_interview_question_batches
    ADD CONSTRAINT fk_application_interview_question_batches_process
    FOREIGN KEY (latest_process_log_id) REFERENCES ai_process_logs(process_log_id)
    ON DELETE RESTRICT;

ALTER TABLE application_interview_questions
    ADD CONSTRAINT fk_application_interview_questions_batch
    FOREIGN KEY (batch_id) REFERENCES application_interview_question_batches(batch_id)
    ON DELETE CASCADE;

ALTER TABLE application_interview_questions
    ADD CONSTRAINT fk_application_interview_questions_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id)
    ON DELETE SET NULL;

ALTER TABLE application_interview_questions
    ADD CONSTRAINT fk_application_interview_questions_process
    FOREIGN KEY (source_process_log_id) REFERENCES ai_process_logs(process_log_id)
    ON DELETE RESTRICT;

ALTER TABLE question_ncs_bindings
    ADD CONSTRAINT fk_question_ncs_bindings_question
    FOREIGN KEY (question_id) REFERENCES question_bank(question_id)
    ON DELETE CASCADE;

ALTER TABLE question_ncs_bindings
    ADD CONSTRAINT fk_question_ncs_bindings_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id)
    ON DELETE RESTRICT;

ALTER TABLE application_question_ncs_bindings
    ADD CONSTRAINT fk_application_question_ncs_bindings_question
    FOREIGN KEY (personalized_question_id) REFERENCES application_interview_questions(personalized_question_id)
    ON DELETE CASCADE;

ALTER TABLE application_question_ncs_bindings
    ADD CONSTRAINT fk_application_question_ncs_bindings_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id)
    ON DELETE SET NULL;

ALTER TABLE applications
    ADD CONSTRAINT fk_applications_posting
    FOREIGN KEY (posting_id) REFERENCES postings(posting_id);

ALTER TABLE applications
    ADD CONSTRAINT fk_applications_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id);

ALTER TABLE application_documents
    ADD CONSTRAINT fk_application_documents_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id);

ALTER TABLE application_documents
    ADD CONSTRAINT fk_application_documents_file
    FOREIGN KEY (file_id) REFERENCES file_assets(file_id);

ALTER TABLE consent_records
    ADD CONSTRAINT fk_consent_records_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id);

ALTER TABLE interview_sessions
    ADD CONSTRAINT fk_interview_sessions_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id);

ALTER TABLE interview_sessions
    ADD CONSTRAINT fk_interview_sessions_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidate_profiles(candidate_id);

ALTER TABLE interview_session_ncs_policies
    ADD CONSTRAINT fk_interview_session_ncs_policies_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(session_id)
    ON DELETE CASCADE;

ALTER TABLE interview_session_ncs_policies
    ADD CONSTRAINT fk_interview_session_ncs_policies_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id)
    ON DELETE SET NULL;

ALTER TABLE interview_answers
    ADD CONSTRAINT fk_interview_answers_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(session_id);

ALTER TABLE interview_answers
    ADD CONSTRAINT fk_interview_answers_session_question
    FOREIGN KEY (session_question_id) REFERENCES interview_session_questions(session_question_id)
    ON DELETE SET NULL;

ALTER TABLE interview_session_questions
    ADD CONSTRAINT fk_interview_session_questions_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(session_id)
    ON DELETE CASCADE;

ALTER TABLE interview_session_questions
    ADD CONSTRAINT fk_interview_session_questions_question
    FOREIGN KEY (question_id) REFERENCES question_bank(question_id)
    ON DELETE RESTRICT;

ALTER TABLE interview_session_questions
    ADD CONSTRAINT fk_interview_session_questions_personalized_question
    FOREIGN KEY (personalized_question_id) REFERENCES application_interview_questions(personalized_question_id)
    ON DELETE SET NULL;

ALTER TABLE interview_session_questions
    ADD CONSTRAINT fk_interview_session_questions_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id)
    ON DELETE SET NULL;

ALTER TABLE session_question_ncs_bindings
    ADD CONSTRAINT fk_session_question_ncs_bindings_session_question
    FOREIGN KEY (session_question_id) REFERENCES interview_session_questions(session_question_id)
    ON DELETE CASCADE;

ALTER TABLE session_question_ncs_bindings
    ADD CONSTRAINT fk_session_question_ncs_bindings_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id)
    ON DELETE SET NULL;

ALTER TABLE interview_answers
    ADD CONSTRAINT fk_interview_answers_question
    FOREIGN KEY (question_id) REFERENCES question_bank(question_id);

ALTER TABLE interview_answers
    ADD CONSTRAINT fk_interview_answers_video_file
    FOREIGN KEY (video_file_id) REFERENCES file_assets(file_id);

ALTER TABLE interview_answers
    ADD CONSTRAINT fk_interview_answers_audio_file
    FOREIGN KEY (audio_file_id) REFERENCES file_assets(file_id);

ALTER TABLE follow_up_questions
    ADD CONSTRAINT fk_follow_up_questions_answer
    FOREIGN KEY (answer_id) REFERENCES interview_answers(answer_id);

ALTER TABLE follow_up_questions
    ADD CONSTRAINT fk_follow_up_questions_source_session_question
    FOREIGN KEY (source_session_question_id) REFERENCES interview_session_questions(session_question_id);

ALTER TABLE follow_up_questions
    ADD CONSTRAINT fk_follow_up_questions_inserted_session_question
    FOREIGN KEY (inserted_session_question_id) REFERENCES interview_session_questions(session_question_id);

ALTER TABLE evaluation_reports
    ADD CONSTRAINT fk_evaluation_reports_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id);

ALTER TABLE evaluation_reports
    ADD CONSTRAINT fk_evaluation_reports_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(session_id);

ALTER TABLE report_scores
    ADD CONSTRAINT fk_report_scores_report
    FOREIGN KEY (report_id) REFERENCES evaluation_reports(report_id);

ALTER TABLE report_scores
    ADD CONSTRAINT fk_report_scores_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id);

ALTER TABLE ncs_answer_evaluations
    ADD CONSTRAINT fk_ncs_answer_evaluations_report
    FOREIGN KEY (report_id) REFERENCES evaluation_reports(report_id);

ALTER TABLE ncs_answer_evaluations
    ADD CONSTRAINT fk_ncs_answer_evaluations_answer
    FOREIGN KEY (answer_id) REFERENCES interview_answers(answer_id);

ALTER TABLE ncs_answer_evaluations
    ADD CONSTRAINT fk_ncs_answer_evaluations_session_question
    FOREIGN KEY (session_question_id) REFERENCES interview_session_questions(session_question_id);

ALTER TABLE ncs_answer_evaluations
    ADD CONSTRAINT fk_ncs_answer_evaluations_criterion
    FOREIGN KEY (criterion_id) REFERENCES evaluation_criteria(criterion_id);

ALTER TABLE ncs_answer_evaluation_evidences
    ADD CONSTRAINT fk_ncs_answer_evaluation_evidences_evaluation
    FOREIGN KEY (ncs_evaluation_id) REFERENCES ncs_answer_evaluations(ncs_evaluation_id)
    ON DELETE CASCADE;

ALTER TABLE ncs_answer_evaluation_evidences
    ADD CONSTRAINT fk_ncs_answer_evaluation_evidences_source_answer
    FOREIGN KEY (source_answer_id) REFERENCES interview_answers(answer_id)
    ON DELETE CASCADE;

ALTER TABLE answer_fact_check_runs
    ADD CONSTRAINT fk_answer_fact_check_runs_report
    FOREIGN KEY (report_id) REFERENCES evaluation_reports(report_id)
    ON DELETE CASCADE;

ALTER TABLE answer_fact_check_runs
    ADD CONSTRAINT fk_answer_fact_check_runs_answer
    FOREIGN KEY (answer_id) REFERENCES interview_answers(answer_id)
    ON DELETE CASCADE;

ALTER TABLE answer_fact_check_runs
    ADD CONSTRAINT fk_answer_fact_check_runs_follow_up_answer
    FOREIGN KEY (follow_up_answer_id) REFERENCES interview_answers(answer_id)
    ON DELETE CASCADE;

ALTER TABLE answer_fact_check_claims
    ADD CONSTRAINT fk_answer_fact_check_claims_run
    FOREIGN KEY (fact_check_run_id) REFERENCES answer_fact_check_runs(fact_check_run_id)
    ON DELETE CASCADE;

ALTER TABLE answer_fact_check_evidences
    ADD CONSTRAINT fk_answer_fact_check_evidences_claim
    FOREIGN KEY (fact_check_claim_id) REFERENCES answer_fact_check_claims(fact_check_claim_id)
    ON DELETE CASCADE;

ALTER TABLE report_evidences
    ADD CONSTRAINT fk_report_evidences_score
    FOREIGN KEY (score_id) REFERENCES report_scores(score_id);

ALTER TABLE report_evidences
    ADD CONSTRAINT fk_report_evidences_answer
    FOREIGN KEY (answer_id) REFERENCES interview_answers(answer_id);

ALTER TABLE report_evidences
    ADD CONSTRAINT fk_report_evidences_document
    FOREIGN KEY (document_id) REFERENCES application_documents(document_id);

ALTER TABLE manual_evaluations
    ADD CONSTRAINT fk_manual_evaluations_report
    FOREIGN KEY (report_id) REFERENCES evaluation_reports(report_id);

ALTER TABLE manual_evaluations
    ADD CONSTRAINT fk_manual_evaluations_reviewer
    FOREIGN KEY (reviewer_user_id) REFERENCES users(user_id);

ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id);

ALTER TABLE ai_process_logs
    ADD CONSTRAINT fk_ai_process_logs_application
    FOREIGN KEY (application_id) REFERENCES applications(application_id);

ALTER TABLE ai_process_logs
    ADD CONSTRAINT fk_ai_process_logs_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(session_id);

ALTER TABLE ai_guardrail_logs
    ADD CONSTRAINT fk_ai_guardrail_logs_process
    FOREIGN KEY (process_log_id) REFERENCES ai_process_logs(process_log_id);

ALTER TABLE embeddings
    ADD CONSTRAINT fk_embeddings_posting
    FOREIGN KEY (posting_id) REFERENCES postings(posting_id);

ALTER TABLE embeddings
    ADD CONSTRAINT fk_embeddings_tag
    FOREIGN KEY (tag_id) REFERENCES criterion_tags(tag_id);

ALTER TABLE embeddings
    ADD CONSTRAINT fk_embeddings_question
    FOREIGN KEY (question_id) REFERENCES question_bank(question_id);

ALTER TABLE embeddings
    ADD CONSTRAINT fk_embeddings_document
    FOREIGN KEY (document_id) REFERENCES application_documents(document_id);

ALTER TABLE embeddings
    ADD CONSTRAINT fk_embeddings_answer
    FOREIGN KEY (answer_id) REFERENCES interview_answers(answer_id);

ALTER TABLE embeddings
    ADD CONSTRAINT fk_embeddings_report
    FOREIGN KEY (report_id) REFERENCES evaluation_reports(report_id);

-- =========================================================
-- 7. 유니크/인덱스
-- =========================================================

-- 같은 OAuth provider 사용자 ID가 중복 가입되지 않도록 방지
CREATE UNIQUE INDEX uk_users_provider_user
    ON users(auth_provider, provider_user_id);

-- 같은 공고에서 같은 평가 태그를 중복 선택하지 않도록 방지
CREATE UNIQUE INDEX uk_evaluation_criteria_posting_tag
    ON evaluation_criteria(posting_id, tag_id);

CREATE INDEX idx_companies_owner_user ON companies(owner_user_id);
CREATE INDEX idx_postings_company ON postings(company_id);
CREATE INDEX idx_criterion_tags_job_role ON criterion_tags(job_role);
CREATE INDEX idx_evaluation_criteria_posting ON evaluation_criteria(posting_id);
CREATE INDEX idx_question_bank_posting ON question_bank(posting_id);
CREATE INDEX idx_question_ncs_bindings_criterion ON question_ncs_bindings(criterion_id);
CREATE INDEX idx_application_question_ncs_bindings_criterion ON application_question_ncs_bindings(criterion_id);
CREATE INDEX idx_applications_posting ON applications(posting_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_interview_sessions_application ON interview_sessions(application_id);
CREATE INDEX idx_interview_session_ncs_policies_criterion ON interview_session_ncs_policies(criterion_id);
CREATE INDEX idx_interview_answers_session_question ON interview_answers(session_question_id);
CREATE UNIQUE INDEX uq_interview_session_questions_runtime_question
    ON interview_session_questions(runtime_question_id);

CREATE UNIQUE INDEX uq_follow_up_questions_answer_policy
    ON follow_up_questions(answer_id, policy);

CREATE UNIQUE INDEX uq_follow_up_questions_inserted_session_question
    ON follow_up_questions(inserted_session_question_id);
CREATE INDEX idx_interview_session_questions_question ON interview_session_questions(question_id);
CREATE INDEX idx_interview_session_questions_personalized ON interview_session_questions(personalized_question_id);
CREATE INDEX idx_interview_session_questions_criterion ON interview_session_questions(criterion_id);
CREATE INDEX idx_session_question_ncs_bindings_criterion ON session_question_ncs_bindings(criterion_id);
CREATE INDEX idx_evaluation_reports_application ON evaluation_reports(application_id);
CREATE UNIQUE INDEX uq_report_scores_report_ncs_profile
    ON report_scores(report_id, ncs_profile_id);
CREATE UNIQUE INDEX uq_ncs_answer_evaluations_report_answer_profile
    ON ncs_answer_evaluations(report_id, answer_id, ncs_profile_id);
CREATE INDEX idx_ncs_answer_evaluations_answer ON ncs_answer_evaluations(answer_id);
CREATE INDEX idx_ncs_answer_evaluations_session_question ON ncs_answer_evaluations(session_question_id);
CREATE INDEX idx_ncs_answer_evaluations_criterion ON ncs_answer_evaluations(criterion_id);
CREATE INDEX idx_ncs_answer_evaluations_report_status ON ncs_answer_evaluations(report_id, score_status);
CREATE INDEX idx_ncs_answer_evaluation_evidences_source_answer ON ncs_answer_evaluation_evidences(source_answer_id);
CREATE INDEX idx_answer_fact_check_runs_answer ON answer_fact_check_runs(answer_id);
CREATE INDEX idx_answer_fact_check_runs_report_status ON answer_fact_check_runs(report_id, provider_status);
CREATE INDEX idx_answer_fact_check_claims_verdict ON answer_fact_check_claims(verdict);
CREATE INDEX idx_answer_fact_check_evidences_snapshot ON answer_fact_check_evidences(source_snapshot_id);
CREATE INDEX idx_ai_process_logs_application ON ai_process_logs(application_id);
CREATE INDEX idx_embeddings_source_type ON embeddings(source_type);
CREATE INDEX idx_embeddings_source_hash ON embeddings(source_text_hash);

CREATE TABLE IF NOT EXISTS application_documents (
    document_id BIGINT PRIMARY KEY,
    application_id BIGINT NOT NULL,
    file_id BIGINT,
    document_type VARCHAR(50) NOT NULL,
    parse_status VARCHAR(40) NOT NULL,
    extracted_text TEXT,
    uploaded_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_documents_application_id
    ON application_documents(application_id);

CREATE TABLE IF NOT EXISTS interview_answers (
    answer_id BIGINT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    question_id BIGINT,
    video_file_id BIGINT,
    audio_file_id BIGINT,
    transcript TEXT,
    duration_seconds INTEGER,
    submitted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interview_answers_session_id
    ON interview_answers(session_id);

CREATE TABLE IF NOT EXISTS follow_up_questions (
    follow_up_id BIGINT PRIMARY KEY,
    answer_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    generation_status VARCHAR(40) NOT NULL,
    policy VARCHAR(40) NOT NULL DEFAULT 'RECRUITING',
    created_at TIMESTAMP NOT NULL
);

ALTER TABLE follow_up_questions
    ADD COLUMN IF NOT EXISTS policy VARCHAR(40) NOT NULL DEFAULT 'RECRUITING';

CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_up_questions_answer_policy
    ON follow_up_questions(answer_id, policy);

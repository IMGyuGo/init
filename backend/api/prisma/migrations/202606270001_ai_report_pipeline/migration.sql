CREATE TABLE IF NOT EXISTS evaluation_reports (
    report_id BIGINT PRIMARY KEY,
    application_id BIGINT,
    session_id BIGINT,
    report_type VARCHAR(50) NOT NULL,
    status VARCHAR(40) NOT NULL,
    total_score INTEGER,
    summary TEXT,
    generated_at TIMESTAMP,
    failure_category VARCHAR(40),
    failure_reason TEXT
);

CREATE TABLE IF NOT EXISTS report_scores (
    score_id BIGINT PRIMARY KEY,
    report_id BIGINT NOT NULL REFERENCES evaluation_reports(report_id) ON DELETE CASCADE,
    criterion_id BIGINT,
    score INTEGER NOT NULL,
    rationale TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_scores_report_id ON report_scores(report_id);

CREATE TABLE IF NOT EXISTS report_evidences (
    evidence_id BIGINT PRIMARY KEY,
    score_id BIGINT NOT NULL REFERENCES report_scores(score_id) ON DELETE CASCADE,
    source_type VARCHAR(80) NOT NULL,
    answer_id BIGINT,
    document_id BIGINT,
    document_ref VARCHAR(255),
    evidence_text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_evidences_score_id ON report_evidences(score_id);

CREATE TABLE IF NOT EXISTS ai_process_logs (
    process_log_id BIGINT PRIMARY KEY,
    application_id BIGINT,
    session_id BIGINT,
    process_type VARCHAR(80) NOT NULL,
    status VARCHAR(40) NOT NULL,
    input_ref TEXT,
    output_ref TEXT,
    failure_category VARCHAR(40),
    failure_reason TEXT,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_guardrail_logs (
    guardrail_log_id BIGINT PRIMARY KEY,
    process_log_id BIGINT NOT NULL REFERENCES ai_process_logs(process_log_id) ON DELETE CASCADE,
    policy_name VARCHAR(120) NOT NULL,
    result VARCHAR(40) NOT NULL,
    reason TEXT,
    failure_category VARCHAR(40),
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_guardrail_logs_process_log_id ON ai_guardrail_logs(process_log_id);

CREATE TABLE IF NOT EXISTS embeddings (
    embedding_id BIGINT PRIMARY KEY,
    posting_id BIGINT,
    tag_id BIGINT,
    question_id BIGINT,
    document_id BIGINT,
    answer_id BIGINT,
    report_id BIGINT,
    source_type VARCHAR(80) NOT NULL,
    source_text_hash VARCHAR(128) NOT NULL,
    embedding_model VARCHAR(120) NOT NULL,
    embedding_dimension INTEGER NOT NULL,
    embedding_vector TEXT NOT NULL,
    metadata_json TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_embeddings_source_hash UNIQUE (source_type, source_text_hash)
);

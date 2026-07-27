-- CreateTable
CREATE TABLE "users" (
    "user_id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "user_type" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(50),
    "status" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "auth_provider" VARCHAR(30) NOT NULL,
    "provider_user_id" VARCHAR(255),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "company_id" BIGSERIAL NOT NULL,
    "owner_user_id" BIGINT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "business_registration_number" VARCHAR(10) NOT NULL,
    "verification_status" VARCHAR(30) NOT NULL,
    "industry" VARCHAR(100),
    "profile" TEXT,
    "talent_profile" TEXT,
    "evaluation_policy" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "file_id" BIGSERIAL NOT NULL,
    "owner_user_id" BIGINT NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("file_id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "candidate_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "default_resume_file_id" BIGINT,
    "portfolio_url" VARCHAR(500),
    "github_url" VARCHAR(500),
    "summary" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("candidate_id")
);

-- CreateTable
CREATE TABLE "postings" (
    "posting_id" BIGSERIAL NOT NULL,
    "company_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "job_role" VARCHAR(100) NOT NULL,
    "job_description" TEXT,
    "starts_on" DATE,
    "ends_on" DATE,
    "status" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "postings_pkey" PRIMARY KEY ("posting_id")
);

-- CreateTable
CREATE TABLE "criterion_tags" (
    "tag_id" BIGSERIAL NOT NULL,
    "job_role" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "criterion_tags_pkey" PRIMARY KEY ("tag_id")
);

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "criterion_id" BIGSERIAL NOT NULL,
    "posting_id" BIGINT NOT NULL,
    "tag_id" BIGINT NOT NULL,
    "weight" INTEGER NOT NULL,
    "pass_score" INTEGER,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("criterion_id")
);

-- CreateTable
CREATE TABLE "question_bank" (
    "question_id" BIGSERIAL NOT NULL,
    "company_id" BIGINT NOT NULL,
    "posting_id" BIGINT,
    "criterion_id" BIGINT,
    "question_type" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "applications" (
    "application_id" BIGSERIAL NOT NULL,
    "posting_id" BIGINT NOT NULL,
    "candidate_id" BIGINT NOT NULL,
    "application_status" VARCHAR(40) NOT NULL,
    "document_status" VARCHAR(40) NOT NULL,
    "interview_status" VARCHAR(40) NOT NULL,
    "report_status" VARCHAR(40) NOT NULL,
    "screening_decision" VARCHAR(40),
    "screening_memo" TEXT,
    "submitted_at" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "document_id" BIGSERIAL NOT NULL,
    "application_id" BIGINT NOT NULL,
    "file_id" BIGINT,
    "document_type" VARCHAR(50) NOT NULL,
    "parse_status" VARCHAR(40) NOT NULL,
    "extracted_text" TEXT,
    "uploaded_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "consent_id" BIGSERIAL NOT NULL,
    "application_id" BIGINT NOT NULL,
    "consent_type" VARCHAR(80) NOT NULL,
    "agreed" BOOLEAN NOT NULL,
    "agreed_at" TIMESTAMP(6),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("consent_id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "session_id" BIGSERIAL NOT NULL,
    "application_id" BIGINT,
    "candidate_id" BIGINT NOT NULL,
    "interview_type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "show_question_text" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "answer_id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "question_id" BIGINT,
    "video_file_id" BIGINT,
    "audio_file_id" BIGINT,
    "transcript" TEXT,
    "duration_seconds" INTEGER,
    "submitted_at" TIMESTAMP(6),

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("answer_id")
);

-- CreateTable
CREATE TABLE "follow_up_questions" (
    "follow_up_id" BIGSERIAL NOT NULL,
    "answer_id" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "generation_status" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "follow_up_questions_pkey" PRIMARY KEY ("follow_up_id")
);

-- CreateTable
CREATE TABLE "evaluation_reports" (
    "report_id" BIGSERIAL NOT NULL,
    "application_id" BIGINT,
    "session_id" BIGINT,
    "report_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "total_score" INTEGER,
    "summary" TEXT,
    "generated_at" TIMESTAMP(6),

    CONSTRAINT "evaluation_reports_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "report_scores" (
    "score_id" BIGSERIAL NOT NULL,
    "report_id" BIGINT NOT NULL,
    "criterion_id" BIGINT,
    "score" INTEGER NOT NULL,
    "rationale" TEXT,

    CONSTRAINT "report_scores_pkey" PRIMARY KEY ("score_id")
);

-- CreateTable
CREATE TABLE "report_evidences" (
    "evidence_id" BIGSERIAL NOT NULL,
    "score_id" BIGINT NOT NULL,
    "answer_id" BIGINT,
    "evidence_text" TEXT NOT NULL,

    CONSTRAINT "report_evidences_pkey" PRIMARY KEY ("evidence_id")
);

-- CreateTable
CREATE TABLE "manual_evaluations" (
    "manual_eval_id" BIGSERIAL NOT NULL,
    "report_id" BIGINT NOT NULL,
    "reviewer_user_id" BIGINT NOT NULL,
    "decision" VARCHAR(40),
    "memo" TEXT,
    "reviewed_at" TIMESTAMP(6),

    CONSTRAINT "manual_evaluations_pkey" PRIMARY KEY ("manual_eval_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "application_id" BIGINT,
    "channel" VARCHAR(40) NOT NULL,
    "notification_type" VARCHAR(80) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "sent_at" TIMESTAMP(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "ai_process_logs" (
    "process_log_id" BIGSERIAL NOT NULL,
    "application_id" BIGINT,
    "session_id" BIGINT,
    "process_type" VARCHAR(80) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "input_ref" TEXT,
    "output_ref" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ai_process_logs_pkey" PRIMARY KEY ("process_log_id")
);

-- CreateTable
CREATE TABLE "ai_guardrail_logs" (
    "guardrail_log_id" BIGSERIAL NOT NULL,
    "process_log_id" BIGINT NOT NULL,
    "policy_name" VARCHAR(120) NOT NULL,
    "result" VARCHAR(40) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ai_guardrail_logs_pkey" PRIMARY KEY ("guardrail_log_id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "embedding_id" BIGSERIAL NOT NULL,
    "posting_id" BIGINT,
    "tag_id" BIGINT,
    "question_id" BIGINT,
    "document_id" BIGINT,
    "answer_id" BIGINT,
    "report_id" BIGINT,
    "source_type" VARCHAR(80) NOT NULL,
    "source_text_hash" VARCHAR(128) NOT NULL,
    "embedding_model" VARCHAR(120) NOT NULL,
    "embedding_dimension" INTEGER NOT NULL,
    "embedding_vector" TEXT NOT NULL,
    "metadata_json" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("embedding_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uk_users_provider_user" ON "users"("auth_provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_business_registration_number_key" ON "companies"("business_registration_number");

-- CreateIndex
CREATE INDEX "idx_companies_owner_user" ON "companies"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_user_id_key" ON "candidate_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_postings_company" ON "postings"("company_id");

-- CreateIndex
CREATE INDEX "idx_criterion_tags_job_role" ON "criterion_tags"("job_role");

-- CreateIndex
CREATE INDEX "idx_evaluation_criteria_posting" ON "evaluation_criteria"("posting_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_evaluation_criteria_posting_tag" ON "evaluation_criteria"("posting_id", "tag_id");

-- CreateIndex
CREATE INDEX "idx_question_bank_posting" ON "question_bank"("posting_id");

-- CreateIndex
CREATE INDEX "idx_applications_posting" ON "applications"("posting_id");

-- CreateIndex
CREATE INDEX "idx_applications_candidate" ON "applications"("candidate_id");

-- CreateIndex
CREATE INDEX "idx_interview_sessions_application" ON "interview_sessions"("application_id");

-- CreateIndex
CREATE INDEX "idx_evaluation_reports_application" ON "evaluation_reports"("application_id");

-- CreateIndex
CREATE INDEX "idx_ai_process_logs_application" ON "ai_process_logs"("application_id");

-- CreateIndex
CREATE INDEX "idx_embeddings_source_type" ON "embeddings"("source_type");

-- CreateIndex
CREATE INDEX "idx_embeddings_source_hash" ON "embeddings"("source_text_hash");

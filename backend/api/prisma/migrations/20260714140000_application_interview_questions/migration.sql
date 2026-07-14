ALTER TYPE "AiProcessType" ADD VALUE IF NOT EXISTS 'RESUME_QUESTION_GENERATE';

CREATE TABLE "application_interview_question_batches" (
  "batch_id" BIGSERIAL PRIMARY KEY,
  "application_id" BIGINT NOT NULL,
  "latest_process_log_id" BIGINT NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "policy_version" INTEGER NOT NULL,
  "criteria_version" INTEGER NOT NULL,
  "input_version" VARCHAR(128) NOT NULL,
  "resume_document_hash" VARCHAR(128) NOT NULL,
  "jd_snapshot_hash" VARCHAR(128) NOT NULL,
  "evaluator_version" VARCHAR(80),
  "failure_reason" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ck_application_interview_question_batches_status"
    CHECK ("status" IN ('GENERATING', 'READY', 'REVIEW_REQUIRED', 'FAILED', 'STALE')),
  CONSTRAINT "ck_application_interview_question_batches_attempt"
    CHECK ("attempt_count" >= 1),
  CONSTRAINT "application_interview_question_batches_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_interview_question_batches_latest_process_log_id_fkey"
    FOREIGN KEY ("latest_process_log_id") REFERENCES "ai_process_logs"("process_log_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_application_interview_question_batches_business"
  ON "application_interview_question_batches"("application_id", "policy_version", "criteria_version", "jd_snapshot_hash", "resume_document_hash");
CREATE INDEX "idx_application_interview_question_batches_status"
  ON "application_interview_question_batches"("application_id", "status");
CREATE INDEX "idx_application_interview_question_batches_process"
  ON "application_interview_question_batches"("latest_process_log_id");

CREATE TABLE "application_interview_questions" (
  "personalized_question_id" BIGSERIAL PRIMARY KEY,
  "batch_id" BIGINT NOT NULL,
  "criterion_id" BIGINT,
  "source_process_log_id" BIGINT NOT NULL,
  "criterion_title_snapshot" VARCHAR(200) NOT NULL,
  "source" VARCHAR(50) NOT NULL DEFAULT 'RESUME_PERSONALIZED',
  "question_type" "QuestionType" NOT NULL,
  "content" TEXT NOT NULL,
  "ncs_profile_id" VARCHAR(50) NOT NULL,
  "ncs_question_mode" VARCHAR(50) NOT NULL,
  "ncs_profile_version" VARCHAR(80) NOT NULL,
  "alignment_status" VARCHAR(40) NOT NULL,
  "alignment_score" DECIMAL(8,6),
  "alignment_reason" TEXT,
  "evaluator_version" VARCHAR(80),
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_application_interview_questions_source"
    CHECK ("source" = 'RESUME_PERSONALIZED'),
  CONSTRAINT "ck_application_interview_questions_alignment"
    CHECK ("alignment_status" IN ('ALIGNED', 'REVIEW_REQUIRED')),
  CONSTRAINT "ck_application_interview_questions_sort_order"
    CHECK ("sort_order" >= 1),
  CONSTRAINT "application_interview_questions_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "application_interview_question_batches"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_interview_questions_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "application_interview_questions_source_process_log_id_fkey"
    FOREIGN KEY ("source_process_log_id") REFERENCES "ai_process_logs"("process_log_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_application_interview_questions_order"
  ON "application_interview_questions"("batch_id", "sort_order");
CREATE INDEX "idx_application_interview_questions_criterion"
  ON "application_interview_questions"("criterion_id");
CREATE INDEX "idx_application_interview_questions_process"
  ON "application_interview_questions"("source_process_log_id");

-- Foundation for NCS_ACTIVE_PROFILE_V2 and the one official three-question demo preset.
-- This is expand-only: existing V1 criteria, bindings, sessions, evaluations, and reports are not rewritten.

CREATE TYPE "InterviewSessionMode" AS ENUM ('STANDARD', 'DEMO_PRESET');
CREATE TYPE "QuestionUsageScope" AS ENUM ('STANDARD', 'DEMO_PRESET');

ALTER TABLE "interview_sessions"
  ADD COLUMN "session_mode" "InterviewSessionMode" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "question_bank"
  ADD COLUMN "usage_scope" "QuestionUsageScope" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "application_interview_question_batches"
  ADD COLUMN "usage_scope" "QuestionUsageScope" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "application_interview_questions"
  ADD COLUMN "usage_scope" "QuestionUsageScope" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "interview_session_questions"
  ADD COLUMN "usage_scope" "QuestionUsageScope" NOT NULL DEFAULT 'STANDARD';

-- V2 remains an explicit framework. Existing LEGACY/V1 rows retain their values.
ALTER TABLE "interview_question_generation_policies"
  DROP CONSTRAINT "ck_interview_question_generation_policy_framework",
  ADD CONSTRAINT "ck_interview_question_generation_policy_framework"
    CHECK ("evaluation_framework" IN ('LEGACY', 'NCS_3_PROFILE_V1', 'NCS_ACTIVE_PROFILE_V2'));

-- V1 snapshots keep required_question_count=2. The relaxed lower bound only permits
-- new V2 active-profile snapshots to store their contract value of 1.
ALTER TABLE "interview_session_ncs_policies"
  DROP CONSTRAINT "ck_interview_session_ncs_policies_required_count",
  ADD CONSTRAINT "ck_interview_session_ncs_policies_required_count"
    CHECK ("required_question_count" >= 1);

-- STANDARD and DEMO_PRESET personalized slots must not collide on the legacy business key.
DROP INDEX "uq_application_interview_question_batches_business";
CREATE UNIQUE INDEX "uq_application_interview_question_batches_business"
  ON "application_interview_question_batches"(
    "application_id",
    "usage_scope",
    "policy_version",
    "criteria_version",
    "jd_snapshot_hash",
    "resume_document_hash"
  );

CREATE INDEX "idx_question_bank_posting_usage_active"
  ON "question_bank"("posting_id", "usage_scope", "is_active");

CREATE INDEX "idx_application_interview_question_batches_usage_status"
  ON "application_interview_question_batches"("application_id", "usage_scope", "status");

CREATE INDEX "idx_interview_sessions_application_mode_deleted"
  ON "interview_sessions"("application_id", "interview_type", "session_mode", "deleted_at");

-- Adding NOT NULL columns with DEFAULT STANDARD backfills every existing row in PostgreSQL.
-- Fail the migration instead of recording a partial/nullable compatibility state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "interview_sessions" WHERE "session_mode" IS NULL)
    OR EXISTS (SELECT 1 FROM "question_bank" WHERE "usage_scope" IS NULL)
    OR EXISTS (SELECT 1 FROM "application_interview_question_batches" WHERE "usage_scope" IS NULL)
    OR EXISTS (SELECT 1 FROM "application_interview_questions" WHERE "usage_scope" IS NULL)
    OR EXISTS (SELECT 1 FROM "interview_session_questions" WHERE "usage_scope" IS NULL)
  THEN
    RAISE EXCEPTION 'NCS demo preset compatibility backfill did not produce STANDARD values';
  END IF;
END $$;

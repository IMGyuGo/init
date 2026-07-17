ALTER TABLE "question_bank"
ADD COLUMN "generation_source" VARCHAR(50),
ADD COLUMN "ncs_profile_id" VARCHAR(50),
ADD COLUMN "ncs_question_mode" VARCHAR(50),
ADD COLUMN "ncs_profile_version" VARCHAR(80),
ADD COLUMN "alignment_status" VARCHAR(40),
ADD COLUMN "alignment_score" DECIMAL(8,6),
ADD COLUMN "alignment_reason" TEXT,
ADD COLUMN "evaluator_version" VARCHAR(80),
ADD COLUMN "source_process_log_id" BIGINT;

ALTER TABLE "question_bank"
ADD CONSTRAINT "question_bank_source_process_log_id_fkey"
FOREIGN KEY ("source_process_log_id") REFERENCES "ai_process_logs"("process_log_id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "question_bank"
ADD CONSTRAINT "ck_question_bank_generation_source"
CHECK ("generation_source" IS NULL OR "generation_source" IN ('JD_CRITERIA', 'RESUME_PERSONALIZED'));

ALTER TABLE "question_bank"
ADD CONSTRAINT "ck_question_bank_alignment_status"
CHECK (
  "alignment_status" IS NULL
  OR "alignment_status" IN ('NOT_EVALUATED', 'ALIGNED', 'LOW_ALIGNMENT', 'REVIEW_REQUIRED')
);

ALTER TABLE "question_bank"
ADD CONSTRAINT "ck_question_bank_alignment_score"
CHECK ("alignment_score" IS NULL OR "alignment_score" BETWEEN 0 AND 1);

CREATE INDEX "idx_question_bank_source_process_log"
ON "question_bank"("source_process_log_id");

UPDATE "criterion_tags"
SET "ncs_profile_version" = '2025.12-v1'
WHERE "ncs_profile_id" IS NOT NULL;

UPDATE "evaluation_criteria"
SET "ncs_profile_version" = '2025.12-v1'
WHERE "ncs_profile_id" IS NOT NULL;

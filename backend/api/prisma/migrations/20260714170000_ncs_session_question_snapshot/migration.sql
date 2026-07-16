ALTER TABLE "interview_session_questions"
  DROP CONSTRAINT IF EXISTS "interview_session_questions_private_shape_check";

ALTER TABLE "interview_session_questions"
  ADD COLUMN "personalized_question_id" BIGINT,
  ADD COLUMN "criterion_id" BIGINT,
  ADD COLUMN "criterion_title_snapshot" VARCHAR(200),
  ADD COLUMN "generation_source" VARCHAR(50),
  ADD COLUMN "ncs_profile_id" VARCHAR(50),
  ADD COLUMN "ncs_question_mode" VARCHAR(50),
  ADD COLUMN "ncs_profile_version" VARCHAR(80),
  ADD COLUMN "alignment_status" VARCHAR(40),
  ADD COLUMN "alignment_score" DECIMAL(8,6),
  ADD COLUMN "alignment_reason" TEXT,
  ADD COLUMN "evaluator_version" VARCHAR(80),
  ADD COLUMN "policy_version" INTEGER,
  ADD COLUMN "criteria_version" INTEGER;

ALTER TABLE "interview_session_questions"
  ADD CONSTRAINT "interview_session_questions_personalized_question_id_fkey"
    FOREIGN KEY ("personalized_question_id")
    REFERENCES "application_interview_questions"("personalized_question_id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "interview_session_questions_criterion_id_fkey"
    FOREIGN KEY ("criterion_id")
    REFERENCES "evaluation_criteria"("criterion_id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_interview_session_questions_generation_source"
    CHECK ("generation_source" IS NULL OR "generation_source" IN ('JD_CRITERIA', 'RESUME_PERSONALIZED')),
  ADD CONSTRAINT "ck_interview_session_questions_ncs_snapshot"
    CHECK (
      "generation_source" IS NULL
      OR (
        "runtime_question_id" IS NOT NULL
        AND "question_type" IS NOT NULL
        AND "content" IS NOT NULL
        AND "criterion_title_snapshot" IS NOT NULL
        AND "ncs_profile_id" IS NOT NULL
        AND "ncs_question_mode" IS NOT NULL
        AND "ncs_profile_version" IS NOT NULL
        AND "alignment_status" = 'ALIGNED'
        AND "policy_version" IS NOT NULL
        AND "criteria_version" IS NOT NULL
        AND (
          ("generation_source" = 'JD_CRITERIA' AND "question_id" IS NOT NULL AND "personalized_question_id" IS NULL)
          OR
          ("generation_source" = 'RESUME_PERSONALIZED' AND "question_id" IS NULL)
        )
      )
    );

CREATE UNIQUE INDEX "uq_interview_session_questions_personalized"
  ON "interview_session_questions"("session_id", "personalized_question_id");
CREATE INDEX "idx_interview_session_questions_personalized"
  ON "interview_session_questions"("personalized_question_id");
CREATE INDEX "idx_interview_session_questions_criterion"
  ON "interview_session_questions"("criterion_id");

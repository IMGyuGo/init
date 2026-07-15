ALTER TABLE "follow_up_questions"
  DROP CONSTRAINT "ck_follow_up_questions_reason";

ALTER TABLE "follow_up_questions"
  ADD CONSTRAINT "ck_follow_up_questions_reason"
    CHECK ("reason" IS NULL OR "reason" IN ('NCS_EVIDENCE_GAP', 'FACT_CLARIFICATION', 'GENERAL_EVIDENCE_GAP'));

ALTER TABLE "answer_fact_check_runs"
  ADD COLUMN "follow_up_answer_id" BIGINT,
  ADD COLUMN "input_composition_version" VARCHAR(50) NOT NULL DEFAULT 'BASE_ONLY_V1';

ALTER TABLE "answer_fact_check_runs"
  ADD CONSTRAINT "answer_fact_check_runs_follow_up_answer_id_fkey"
    FOREIGN KEY ("follow_up_answer_id") REFERENCES "interview_answers"("answer_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_answer_fact_check_runs_input_composition"
    CHECK (
      (
        "input_composition_version" = 'BASE_ONLY_V1'
        AND "follow_up_answer_id" IS NULL
      )
      OR
      (
        "input_composition_version" = 'BASE_FOLLOW_UP_V1'
        AND "follow_up_answer_id" IS NOT NULL
        AND "follow_up_answer_id" <> "answer_id"
      )
    );

CREATE INDEX "idx_answer_fact_check_runs_follow_up_answer"
  ON "answer_fact_check_runs"("follow_up_answer_id");

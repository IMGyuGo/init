ALTER TABLE "follow_up_questions"
  ADD COLUMN "source_session_question_id" BIGINT,
  ADD COLUMN "inserted_session_question_id" BIGINT,
  ADD COLUMN "reason" VARCHAR(40),
  ADD COLUMN "skip_reason" VARCHAR(50),
  ADD COLUMN "question_mode" VARCHAR(50),
  ADD COLUMN "answer_time_sec" INTEGER,
  ADD COLUMN "inserted_at" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "follow_up_questions" AS follow_up
SET "source_session_question_id" = COALESCE(
  answer."session_question_id",
  session_question."session_question_id"
)
FROM "interview_answers" AS answer
LEFT JOIN "interview_session_questions" AS session_question
  ON session_question."session_id" = answer."session_id"
 AND session_question."question_id" = answer."question_id"
WHERE follow_up."answer_id" = answer."answer_id";

UPDATE "follow_up_questions"
SET
  "generation_status" = CASE
    WHEN "generation_status" = 'GENERATED' THEN 'READY'
    ELSE "generation_status"
  END,
  "reason" = CASE
    WHEN "policy" = 'MOCK' THEN 'GENERAL_EVIDENCE_GAP'
    ELSE 'NCS_EVIDENCE_GAP'
  END,
  "updated_at" = COALESCE("created_at", CURRENT_TIMESTAMP);

ALTER TABLE "follow_up_questions"
  ADD CONSTRAINT "follow_up_questions_source_session_question_id_fkey"
    FOREIGN KEY ("source_session_question_id") REFERENCES "interview_session_questions"("session_question_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "follow_up_questions_inserted_session_question_id_fkey"
    FOREIGN KEY ("inserted_session_question_id") REFERENCES "interview_session_questions"("session_question_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_follow_up_questions_generation_status"
    CHECK ("generation_status" IN ('READY', 'INSERTED', 'SKIPPED')),
  ADD CONSTRAINT "ck_follow_up_questions_policy"
    CHECK ("policy" IN ('MOCK', 'RECRUITING')),
  ADD CONSTRAINT "ck_follow_up_questions_reason"
    CHECK ("reason" IS NULL OR "reason" IN ('NCS_EVIDENCE_GAP', 'GENERAL_EVIDENCE_GAP')),
  ADD CONSTRAINT "ck_follow_up_questions_skip_reason"
    CHECK ("skip_reason" IS NULL OR "skip_reason" IN ('NOT_REQUIRED', 'SESSION_NOT_IN_PROGRESS')),
  ADD CONSTRAINT "ck_follow_up_questions_question_mode"
    CHECK ("question_mode" IS NULL OR "question_mode" IN ('EXPERIENCE_BEHAVIOR', 'TECHNICAL_KNOWLEDGE', 'SITUATIONAL_DESIGN')),
  ADD CONSTRAINT "ck_follow_up_questions_answer_time"
    CHECK ("answer_time_sec" IS NULL OR "answer_time_sec" > 0),
  ADD CONSTRAINT "ck_follow_up_questions_state_shape"
    CHECK (
      (
        "generation_status" = 'READY'
        AND "content" IS NOT NULL
        AND LENGTH(BTRIM("content")) > 0
        AND "inserted_session_question_id" IS NULL
        AND "inserted_at" IS NULL
        AND "skip_reason" IS NULL
      )
      OR (
        "generation_status" = 'INSERTED'
        AND "source_session_question_id" IS NOT NULL
        AND "content" IS NOT NULL
        AND LENGTH(BTRIM("content")) > 0
        AND "inserted_session_question_id" IS NOT NULL
        AND "inserted_at" IS NOT NULL
        AND "skip_reason" IS NULL
      )
      OR (
        "generation_status" = 'SKIPPED'
        AND LENGTH(BTRIM("content")) = 0
        AND "inserted_session_question_id" IS NULL
        AND "inserted_at" IS NULL
        AND "skip_reason" IS NOT NULL
      )
    );

CREATE UNIQUE INDEX "uq_follow_up_questions_inserted_session_question"
  ON "follow_up_questions"("inserted_session_question_id");
CREATE INDEX "idx_follow_up_questions_source_session_question"
  ON "follow_up_questions"("source_session_question_id");
CREATE INDEX "idx_follow_up_questions_generation_status"
  ON "follow_up_questions"("generation_status");

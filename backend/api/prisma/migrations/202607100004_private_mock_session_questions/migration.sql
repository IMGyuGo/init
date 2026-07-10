ALTER TABLE "interview_session_questions"
  ADD COLUMN "session_question_id" BIGSERIAL,
  ADD COLUMN "runtime_question_id" BIGINT,
  ADD COLUMN "question_type" "QuestionType",
  ADD COLUMN "content" TEXT;

CREATE SEQUENCE "interview_runtime_question_id_seq"
  AS BIGINT
  START WITH 1000000000000000
  INCREMENT BY 1;

ALTER TABLE "interview_session_questions"
  DROP CONSTRAINT "interview_session_questions_pkey",
  ALTER COLUMN "question_id" DROP NOT NULL,
  ADD CONSTRAINT "interview_session_questions_pkey" PRIMARY KEY ("session_question_id"),
  ADD CONSTRAINT "uq_interview_session_questions_question" UNIQUE ("session_id", "question_id"),
  ADD CONSTRAINT "uq_interview_session_questions_runtime_question" UNIQUE ("runtime_question_id");

ALTER TABLE "interview_answers"
  ADD COLUMN "session_question_id" BIGINT;

UPDATE "interview_answers" AS answer
SET "session_question_id" = session_question."session_question_id"
FROM "interview_session_questions" AS session_question
WHERE session_question."session_id" = answer."session_id"
  AND session_question."question_id" = answer."question_id";

ALTER TABLE "interview_answers"
  ADD CONSTRAINT "interview_answers_session_question_id_fkey"
  FOREIGN KEY ("session_question_id")
  REFERENCES "interview_session_questions"("session_question_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "idx_interview_answers_session_question"
  ON "interview_answers"("session_question_id");

ALTER TABLE "interview_session_questions"
  ADD CONSTRAINT "interview_session_questions_private_shape_check"
  CHECK (
    ("question_id" IS NOT NULL AND "runtime_question_id" IS NULL AND "question_type" IS NULL AND "content" IS NULL)
    OR
    ("question_id" IS NULL AND "runtime_question_id" IS NOT NULL AND "question_type" IS NOT NULL AND "content" IS NOT NULL)
  );

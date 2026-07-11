CREATE TABLE "interview_session_questions" (
  "session_id" BIGINT NOT NULL,
  "question_id" BIGINT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "interview_session_questions_pkey" PRIMARY KEY ("session_id", "question_id")
);

CREATE UNIQUE INDEX "uq_interview_session_questions_order"
  ON "interview_session_questions"("session_id", "sort_order");

CREATE INDEX "idx_interview_session_questions_question"
  ON "interview_session_questions"("question_id");

ALTER TABLE "interview_session_questions"
  ADD CONSTRAINT "interview_session_questions_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("session_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_session_questions"
  ADD CONSTRAINT "interview_session_questions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "question_bank"("question_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ncs_answer_evaluations" (
  "ncs_evaluation_id" BIGSERIAL PRIMARY KEY,
  "report_id" BIGINT NOT NULL,
  "answer_id" BIGINT NOT NULL,
  "session_question_id" BIGINT NOT NULL,
  "criterion_id" BIGINT,
  "criterion_title_snapshot" VARCHAR(200) NOT NULL,
  "ncs_profile_id" VARCHAR(50) NOT NULL,
  "ncs_question_mode" VARCHAR(50) NOT NULL,
  "ncs_profile_version" VARCHAR(80) NOT NULL,
  "score_status" VARCHAR(40) NOT NULL,
  "competency_score" INTEGER,
  "evidence_score" INTEGER,
  "total_score" INTEGER,
  "coverage" DECIMAL(8,6) NOT NULL,
  "confidence" VARCHAR(20) NOT NULL,
  "rubric_version" VARCHAR(80) NOT NULL,
  "prompt_version" VARCHAR(100) NOT NULL,
  "provider_mode" VARCHAR(20) NOT NULL,
  "model_name" VARCHAR(120),
  "result_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ck_ncs_answer_evaluations_status"
    CHECK ("score_status" IN ('SCORED', 'INSUFFICIENT_INPUT', 'LOW_ALIGNMENT', 'BLOCKED')),
  CONSTRAINT "ck_ncs_answer_evaluations_score_shape"
    CHECK (
      (
        "score_status" = 'SCORED'
        AND "competency_score" BETWEEN 0 AND 100
        AND "evidence_score" BETWEEN 0 AND 100
        AND "total_score" BETWEEN 0 AND 100
      )
      OR (
        "score_status" <> 'SCORED'
        AND "competency_score" IS NULL
        AND "evidence_score" IS NULL
        AND "total_score" IS NULL
      )
    ),
  CONSTRAINT "ck_ncs_answer_evaluations_profile"
    CHECK ("ncs_profile_id" IN ('PROBLEM_SOLVING', 'COMMUNICATION', 'DIGITAL')),
  CONSTRAINT "ck_ncs_answer_evaluations_mode"
    CHECK ("ncs_question_mode" IN ('EXPERIENCE_BEHAVIOR', 'TECHNICAL_KNOWLEDGE', 'SITUATIONAL_DESIGN')),
  CONSTRAINT "ck_ncs_answer_evaluations_confidence"
    CHECK ("confidence" IN ('HIGH', 'MEDIUM', 'LOW')),
  CONSTRAINT "ck_ncs_answer_evaluations_provider"
    CHECK ("provider_mode" IN ('mock', 'openai')),
  CONSTRAINT "ck_ncs_answer_evaluations_coverage"
    CHECK ("coverage" >= 0 AND "coverage" <= 1)
);

ALTER TABLE "ncs_answer_evaluations"
  ADD CONSTRAINT "ncs_answer_evaluations_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "evaluation_reports"("report_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ncs_answer_evaluations_answer_id_fkey"
    FOREIGN KEY ("answer_id") REFERENCES "interview_answers"("answer_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ncs_answer_evaluations_session_question_id_fkey"
    FOREIGN KEY ("session_question_id") REFERENCES "interview_session_questions"("session_question_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ncs_answer_evaluations_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_ncs_answer_evaluations_report_answer"
  ON "ncs_answer_evaluations"("report_id", "answer_id");
CREATE INDEX "idx_ncs_answer_evaluations_answer"
  ON "ncs_answer_evaluations"("answer_id");
CREATE INDEX "idx_ncs_answer_evaluations_session_question"
  ON "ncs_answer_evaluations"("session_question_id");
CREATE INDEX "idx_ncs_answer_evaluations_criterion"
  ON "ncs_answer_evaluations"("criterion_id");
CREATE INDEX "idx_ncs_answer_evaluations_report_status"
  ON "ncs_answer_evaluations"("report_id", "score_status");

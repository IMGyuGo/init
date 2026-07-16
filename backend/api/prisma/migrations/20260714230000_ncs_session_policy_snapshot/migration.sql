-- NE-M3 freezes the NCS scoring policy and time limits at session confirmation.
-- Existing sessions remain nullable and are handled as legacy/incomplete by evaluation.

ALTER TABLE "interview_sessions"
  ADD COLUMN "preparation_time_sec_snapshot" INTEGER,
  ADD COLUMN "answer_time_sec_snapshot" INTEGER,
  ADD COLUMN "ncs_scoring_version" VARCHAR(80);

ALTER TABLE "interview_sessions"
  ADD CONSTRAINT "ck_interview_sessions_preparation_time_snapshot"
    CHECK ("preparation_time_sec_snapshot" IS NULL OR "preparation_time_sec_snapshot" >= 0),
  ADD CONSTRAINT "ck_interview_sessions_answer_time_snapshot"
    CHECK ("answer_time_sec_snapshot" IS NULL OR "answer_time_sec_snapshot" > 0);

CREATE TABLE "interview_session_ncs_policies" (
  "session_id" BIGINT NOT NULL,
  "ncs_profile_id" VARCHAR(50) NOT NULL,
  "criterion_id" BIGINT,
  "criterion_title_snapshot" VARCHAR(200) NOT NULL,
  "weight" INTEGER NOT NULL,
  "minimum_average_score" DECIMAL(5,2) NOT NULL DEFAULT 3,
  "required_question_count" INTEGER NOT NULL DEFAULT 2,
  "ncs_profile_version" VARCHAR(80) NOT NULL,
  CONSTRAINT "interview_session_ncs_policies_pkey"
    PRIMARY KEY ("session_id", "ncs_profile_id"),
  CONSTRAINT "ck_interview_session_ncs_policies_profile"
    CHECK ("ncs_profile_id" IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
  CONSTRAINT "ck_interview_session_ncs_policies_weight"
    CHECK ("weight" BETWEEN 0 AND 100),
  CONSTRAINT "ck_interview_session_ncs_policies_minimum"
    CHECK ("minimum_average_score" BETWEEN 0 AND 5),
  CONSTRAINT "ck_interview_session_ncs_policies_required_count"
    CHECK ("required_question_count" >= 2),
  CONSTRAINT "interview_session_ncs_policies_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("session_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "interview_session_ncs_policies_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_interview_session_ncs_policies_criterion"
  ON "interview_session_ncs_policies"("criterion_id");

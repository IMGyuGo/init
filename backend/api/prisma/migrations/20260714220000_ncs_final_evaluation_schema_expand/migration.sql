-- NE-M1 expands the existing singular NCS shape without removing compatibility columns.
-- New binding rows and persisted evaluation profile IDs use canonical profile IDs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "question_bank"
    WHERE "ncs_profile_id" IS NOT NULL
      AND "ncs_profile_id" NOT IN (
        'PROBLEM_SOLVING', 'COMMUNICATION', 'DIGITAL',
        'JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION'
      )
  ) OR EXISTS (
    SELECT 1
    FROM "application_interview_questions"
    WHERE "ncs_profile_id" NOT IN (
      'PROBLEM_SOLVING', 'COMMUNICATION', 'DIGITAL',
      'JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION'
    )
  ) OR EXISTS (
    SELECT 1
    FROM "interview_session_questions"
    WHERE "ncs_profile_id" IS NOT NULL
      AND "ncs_profile_id" NOT IN (
        'PROBLEM_SOLVING', 'COMMUNICATION', 'DIGITAL',
        'JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION'
      )
  ) OR EXISTS (
    SELECT 1
    FROM "ncs_answer_evaluations"
    WHERE "ncs_profile_id" NOT IN (
      'PROBLEM_SOLVING', 'COMMUNICATION', 'DIGITAL',
      'JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION'
    )
  ) THEN
    RAISE EXCEPTION 'unsupported legacy NCS profile ID blocks NE-M1 migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "question_bank"
    WHERE "ncs_profile_id" IS NOT NULL
      AND "criterion_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'common NCS question without criterion blocks binding backfill';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "interview_session_questions"
    WHERE "ncs_profile_id" IS NOT NULL
      AND (
        "criterion_title_snapshot" IS NULL
        OR "ncs_profile_version" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'incomplete NCS session snapshot blocks binding backfill';
  END IF;
END $$;

CREATE TABLE "question_ncs_bindings" (
  "question_id" BIGINT NOT NULL,
  "criterion_id" BIGINT NOT NULL,
  "ncs_profile_id" VARCHAR(50) NOT NULL,
  "ncs_profile_version" VARCHAR(80) NOT NULL,
  "alignment_status" VARCHAR(40) NOT NULL,
  "alignment_score" DECIMAL(8,6),
  "alignment_reason" TEXT,
  "evaluator_version" VARCHAR(80),
  "binding_order" INTEGER NOT NULL,
  CONSTRAINT "question_ncs_bindings_pkey" PRIMARY KEY ("question_id", "ncs_profile_id"),
  CONSTRAINT "ck_question_ncs_bindings_profile"
    CHECK ("ncs_profile_id" IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
  CONSTRAINT "ck_question_ncs_bindings_order"
    CHECK ("binding_order" IN (1, 2)),
  CONSTRAINT "ck_question_ncs_bindings_alignment_status"
    CHECK ("alignment_status" IN ('NOT_EVALUATED', 'ALIGNED', 'LOW_ALIGNMENT', 'REVIEW_REQUIRED')),
  CONSTRAINT "ck_question_ncs_bindings_alignment_score"
    CHECK ("alignment_score" IS NULL OR "alignment_score" BETWEEN 0 AND 1),
  CONSTRAINT "question_ncs_bindings_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "question_bank"("question_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "question_ncs_bindings_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_question_ncs_bindings_order"
  ON "question_ncs_bindings"("question_id", "binding_order");
CREATE INDEX "idx_question_ncs_bindings_criterion"
  ON "question_ncs_bindings"("criterion_id");

CREATE TABLE "application_question_ncs_bindings" (
  "personalized_question_id" BIGINT NOT NULL,
  "criterion_id" BIGINT,
  "ncs_profile_id" VARCHAR(50) NOT NULL,
  "ncs_profile_version" VARCHAR(80) NOT NULL,
  "alignment_status" VARCHAR(40) NOT NULL,
  "alignment_score" DECIMAL(8,6),
  "alignment_reason" TEXT,
  "evaluator_version" VARCHAR(80),
  "binding_order" INTEGER NOT NULL,
  CONSTRAINT "application_question_ncs_bindings_pkey"
    PRIMARY KEY ("personalized_question_id", "ncs_profile_id"),
  CONSTRAINT "ck_application_question_ncs_bindings_profile"
    CHECK ("ncs_profile_id" IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
  CONSTRAINT "ck_application_question_ncs_bindings_order"
    CHECK ("binding_order" IN (1, 2)),
  CONSTRAINT "ck_application_question_ncs_bindings_alignment_status"
    CHECK ("alignment_status" IN ('ALIGNED', 'LOW_ALIGNMENT', 'REVIEW_REQUIRED')),
  CONSTRAINT "ck_application_question_ncs_bindings_alignment_score"
    CHECK ("alignment_score" IS NULL OR "alignment_score" BETWEEN 0 AND 1),
  CONSTRAINT "application_question_ncs_bindings_personalized_question_id_fkey"
    FOREIGN KEY ("personalized_question_id")
    REFERENCES "application_interview_questions"("personalized_question_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_question_ncs_bindings_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_application_question_ncs_bindings_order"
  ON "application_question_ncs_bindings"("personalized_question_id", "binding_order");
CREATE INDEX "idx_application_question_ncs_bindings_criterion"
  ON "application_question_ncs_bindings"("criterion_id");

CREATE TABLE "session_question_ncs_bindings" (
  "session_question_id" BIGINT NOT NULL,
  "criterion_id" BIGINT,
  "criterion_title_snapshot" VARCHAR(200) NOT NULL,
  "ncs_profile_id" VARCHAR(50) NOT NULL,
  "ncs_profile_version" VARCHAR(80) NOT NULL,
  "alignment_status" VARCHAR(40) NOT NULL,
  "alignment_score" DECIMAL(8,6),
  "alignment_reason" TEXT,
  "evaluator_version" VARCHAR(80),
  "binding_order" INTEGER NOT NULL,
  CONSTRAINT "session_question_ncs_bindings_pkey"
    PRIMARY KEY ("session_question_id", "ncs_profile_id"),
  CONSTRAINT "ck_session_question_ncs_bindings_profile"
    CHECK ("ncs_profile_id" IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
  CONSTRAINT "ck_session_question_ncs_bindings_order"
    CHECK ("binding_order" IN (1, 2)),
  CONSTRAINT "ck_session_question_ncs_bindings_alignment_status"
    CHECK ("alignment_status" IN ('ALIGNED', 'LOW_ALIGNMENT', 'REVIEW_REQUIRED')),
  CONSTRAINT "ck_session_question_ncs_bindings_alignment_score"
    CHECK ("alignment_score" IS NULL OR "alignment_score" BETWEEN 0 AND 1),
  CONSTRAINT "session_question_ncs_bindings_session_question_id_fkey"
    FOREIGN KEY ("session_question_id") REFERENCES "interview_session_questions"("session_question_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "session_question_ncs_bindings_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_session_question_ncs_bindings_order"
  ON "session_question_ncs_bindings"("session_question_id", "binding_order");
CREATE INDEX "idx_session_question_ncs_bindings_criterion"
  ON "session_question_ncs_bindings"("criterion_id");

INSERT INTO "question_ncs_bindings" (
  "question_id", "criterion_id", "ncs_profile_id", "ncs_profile_version",
  "alignment_status", "alignment_score", "alignment_reason", "evaluator_version", "binding_order"
)
SELECT
  "question_id",
  "criterion_id",
  CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
    WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
    ELSE "ncs_profile_id"
  END,
  COALESCE("ncs_profile_version", '2025.12-v1'),
  COALESCE("alignment_status", 'NOT_EVALUATED'),
  "alignment_score",
  "alignment_reason",
  "evaluator_version",
  1
FROM "question_bank"
WHERE "ncs_profile_id" IS NOT NULL;

INSERT INTO "application_question_ncs_bindings" (
  "personalized_question_id", "criterion_id", "ncs_profile_id", "ncs_profile_version",
  "alignment_status", "alignment_score", "alignment_reason", "evaluator_version", "binding_order"
)
SELECT
  "personalized_question_id",
  "criterion_id",
  CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
    WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
    ELSE "ncs_profile_id"
  END,
  "ncs_profile_version",
  "alignment_status",
  "alignment_score",
  "alignment_reason",
  "evaluator_version",
  1
FROM "application_interview_questions";

INSERT INTO "session_question_ncs_bindings" (
  "session_question_id", "criterion_id", "criterion_title_snapshot", "ncs_profile_id",
  "ncs_profile_version", "alignment_status", "alignment_score", "alignment_reason",
  "evaluator_version", "binding_order"
)
SELECT
  "session_question_id",
  "criterion_id",
  "criterion_title_snapshot",
  CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
    WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
    ELSE "ncs_profile_id"
  END,
  "ncs_profile_version",
  COALESCE("alignment_status", 'REVIEW_REQUIRED'),
  "alignment_score",
  "alignment_reason",
  "evaluator_version",
  1
FROM "interview_session_questions"
WHERE "ncs_profile_id" IS NOT NULL;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "question_bank" WHERE "ncs_profile_id" IS NOT NULL)
     <> (SELECT COUNT(*) FROM "question_ncs_bindings" WHERE "binding_order" = 1) THEN
    RAISE EXCEPTION 'question_ncs_bindings backfill count mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM "application_interview_questions")
     <> (SELECT COUNT(*) FROM "application_question_ncs_bindings" WHERE "binding_order" = 1) THEN
    RAISE EXCEPTION 'application_question_ncs_bindings backfill count mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM "interview_session_questions" WHERE "ncs_profile_id" IS NOT NULL)
     <> (SELECT COUNT(*) FROM "session_question_ncs_bindings" WHERE "binding_order" = 1) THEN
    RAISE EXCEPTION 'session_question_ncs_bindings backfill count mismatch';
  END IF;
END $$;

ALTER TABLE "ncs_answer_evaluations"
  ADD COLUMN "behavior_points" INTEGER,
  ADD COLUMN "logic_points" INTEGER,
  ADD COLUMN "base_score" INTEGER,
  ADD COLUMN "effective_score" INTEGER,
  ADD COLUMN "follow_up_applied" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "ncs_answer_evaluations"
  DROP CONSTRAINT "ck_ncs_answer_evaluations_profile",
  DROP CONSTRAINT "ck_ncs_answer_evaluations_score_shape";

UPDATE "ncs_answer_evaluations"
SET "ncs_profile_id" = CASE "ncs_profile_id"
  WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
  WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
  ELSE "ncs_profile_id"
END;

DROP INDEX "uq_ncs_answer_evaluations_report_answer";

ALTER TABLE "ncs_answer_evaluations"
  ADD CONSTRAINT "ck_ncs_answer_evaluations_profile"
    CHECK ("ncs_profile_id" IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
  ADD CONSTRAINT "ck_ncs_answer_evaluations_legacy_score_shape"
    CHECK (
      (
        "score_status" = 'SCORED'
        AND (
          (
            "competency_score" IS NULL
            AND "evidence_score" IS NULL
            AND "total_score" IS NULL
          )
          OR (
            "competency_score" BETWEEN 0 AND 100
            AND "evidence_score" BETWEEN 0 AND 100
            AND "total_score" BETWEEN 0 AND 100
          )
        )
      )
      OR (
        "score_status" <> 'SCORED'
        AND "competency_score" IS NULL
        AND "evidence_score" IS NULL
        AND "total_score" IS NULL
      )
    ),
  ADD CONSTRAINT "ck_ncs_answer_evaluations_ncs_score_shape"
    CHECK (
      (
        "behavior_points" IS NULL
        AND "logic_points" IS NULL
        AND "base_score" IS NULL
        AND "effective_score" IS NULL
      )
      OR (
        "score_status" = 'SCORED'
        AND "behavior_points" BETWEEN 0 AND 3
        AND "logic_points" BETWEEN 0 AND 2
        AND "base_score" BETWEEN 0 AND 5
        AND "effective_score" BETWEEN 0 AND 5
        AND "base_score" = "behavior_points" + "logic_points"
        AND "effective_score" >= "base_score"
      )
    ),
  ADD CONSTRAINT "ck_ncs_answer_evaluations_follow_up_applied"
    CHECK (NOT "follow_up_applied" OR "effective_score" IS NOT NULL);

CREATE UNIQUE INDEX "uq_ncs_answer_evaluations_report_answer_profile"
  ON "ncs_answer_evaluations"("report_id", "answer_id", "ncs_profile_id");

CREATE TABLE "ncs_answer_evaluation_evidences" (
  "evidence_id" BIGSERIAL PRIMARY KEY,
  "ncs_evaluation_id" BIGINT NOT NULL,
  "source_answer_id" BIGINT NOT NULL,
  "source_kind" VARCHAR(20) NOT NULL,
  "quote" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "ck_ncs_answer_evaluation_evidences_source_kind"
    CHECK ("source_kind" IN ('BASE', 'FOLLOW_UP')),
  CONSTRAINT "ck_ncs_answer_evaluation_evidences_quote"
    CHECK (LENGTH(BTRIM("quote")) > 0),
  CONSTRAINT "ck_ncs_answer_evaluation_evidences_sort_order"
    CHECK ("sort_order" >= 1),
  CONSTRAINT "ncs_answer_evaluation_evidences_ncs_evaluation_id_fkey"
    FOREIGN KEY ("ncs_evaluation_id") REFERENCES "ncs_answer_evaluations"("ncs_evaluation_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ncs_answer_evaluation_evidences_source_answer_id_fkey"
    FOREIGN KEY ("source_answer_id") REFERENCES "interview_answers"("answer_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_ncs_answer_evaluation_evidences_source_order"
  ON "ncs_answer_evaluation_evidences"("ncs_evaluation_id", "source_answer_id", "sort_order");
CREATE INDEX "idx_ncs_answer_evaluation_evidences_source_answer"
  ON "ncs_answer_evaluation_evidences"("source_answer_id");

-- Existing result_json remains the compatibility evidence source. Exact source rows
-- are written only when a source answer can be proven; this migration does not infer it.

ALTER TABLE "evaluation_reports"
  ADD COLUMN "ncs_completion_status" VARCHAR(40),
  ADD COLUMN "ncs_threshold_result" VARCHAR(40),
  ADD COLUMN "ncs_ai_decision" VARCHAR(20),
  ADD COLUMN "ncs_decision_reason_code" VARCHAR(80),
  ADD COLUMN "ncs_scoring_version" VARCHAR(80),
  ADD COLUMN "ncs_decision_policy_version" VARCHAR(80),
  ADD COLUMN "ncs_summary_json" JSONB;

ALTER TABLE "evaluation_reports"
  ADD CONSTRAINT "ck_evaluation_reports_ncs_completion_status"
    CHECK ("ncs_completion_status" IS NULL OR "ncs_completion_status" IN ('COMPLETE', 'INCOMPLETE')),
  ADD CONSTRAINT "ck_evaluation_reports_ncs_threshold_result"
    CHECK ("ncs_threshold_result" IS NULL OR "ncs_threshold_result" IN ('MEETS_THRESHOLD', 'BELOW_THRESHOLD', 'INCOMPLETE')),
  ADD CONSTRAINT "ck_evaluation_reports_ncs_ai_decision"
    CHECK ("ncs_ai_decision" IS NULL OR "ncs_ai_decision" IN ('PASS', 'FAIL'));

ALTER TABLE "report_scores"
  ALTER COLUMN "score" DROP NOT NULL,
  ADD COLUMN "ncs_profile_id" VARCHAR(50),
  ADD COLUMN "average_score" DECIMAL(5,2),
  ADD COLUMN "normalized_score" INTEGER,
  ADD COLUMN "weight" INTEGER,
  ADD COLUMN "weighted_score" DECIMAL(5,2),
  ADD COLUMN "minimum_average_score" DECIMAL(5,2),
  ADD COLUMN "assigned_question_count" INTEGER,
  ADD COLUMN "valid_question_count" INTEGER;

ALTER TABLE "report_scores"
  ADD CONSTRAINT "ck_report_scores_ncs_profile"
    CHECK ("ncs_profile_id" IS NULL OR "ncs_profile_id" IN ('JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION', 'PROBLEM_SOLVING')),
  ADD CONSTRAINT "ck_report_scores_average_score"
    CHECK ("average_score" IS NULL OR "average_score" BETWEEN 0 AND 5),
  ADD CONSTRAINT "ck_report_scores_normalized_score"
    CHECK ("normalized_score" IS NULL OR "normalized_score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ck_report_scores_weight"
    CHECK ("weight" IS NULL OR "weight" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ck_report_scores_weighted_score"
    CHECK ("weighted_score" IS NULL OR "weighted_score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ck_report_scores_minimum_average_score"
    CHECK ("minimum_average_score" IS NULL OR "minimum_average_score" BETWEEN 0 AND 5),
  ADD CONSTRAINT "ck_report_scores_question_counts"
    CHECK (
      ("assigned_question_count" IS NULL OR "assigned_question_count" >= 0)
      AND ("valid_question_count" IS NULL OR "valid_question_count" >= 0)
      AND (
        "assigned_question_count" IS NULL
        OR "valid_question_count" IS NULL
        OR "valid_question_count" <= "assigned_question_count"
      )
    );

CREATE UNIQUE INDEX "uq_report_scores_report_ncs_profile"
  ON "report_scores"("report_id", "ncs_profile_id");

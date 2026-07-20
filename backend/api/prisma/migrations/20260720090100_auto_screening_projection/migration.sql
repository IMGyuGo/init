-- AUTO_SCREENING_DECISION_V1 persistence foundation (#398)

CREATE TYPE "ScreeningDecisionReasonCode" AS ENUM (
  'PASS_TOTAL_AND_CRITERIA_MET',
  'HOLD_TOTAL_BAND',
  'HOLD_CRITERION_BELOW_PASS_SCORE',
  'FAIL_BELOW_HOLD_THRESHOLD',
  'RETRY_REPORT_FAILED',
  'RETRY_STT_UNAVAILABLE',
  'RETRY_EVALUATION_INCOMPLETE',
  'RETRY_SCORE_MISSING'
);

CREATE TABLE "auto_screening_policies" (
  "posting_id" BIGINT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "pass_min_total_score" INTEGER NOT NULL,
  "hold_min_total_score" INTEGER NOT NULL,
  "require_all_criteria_pass" BOOLEAN NOT NULL DEFAULT true,
  "policy_version" INTEGER NOT NULL DEFAULT 1,
  "decision_policy_version" VARCHAR(80) NOT NULL DEFAULT 'AUTO_SCREENING_DECISION_V1',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auto_screening_policies_pkey" PRIMARY KEY ("posting_id"),
  CONSTRAINT "ck_auto_screening_policy_total_scores" CHECK (
    "hold_min_total_score" >= 0
    AND "hold_min_total_score" < "pass_min_total_score"
    AND "pass_min_total_score" <= 100
  ),
  CONSTRAINT "ck_auto_screening_policy_v1" CHECK (
    "require_all_criteria_pass" = true
    AND "policy_version" >= 1
    AND "decision_policy_version" = 'AUTO_SCREENING_DECISION_V1'
  )
);

ALTER TABLE "auto_screening_policies"
  ADD CONSTRAINT "auto_screening_policies_posting_id_fkey"
  FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applications"
  ADD COLUMN "screening_decision_reason_code" "ScreeningDecisionReasonCode",
  ADD COLUMN "screening_decision_policy_version" VARCHAR(80),
  ADD COLUMN "screening_policy_version" INTEGER,
  ADD COLUMN "screening_criteria_version" INTEGER,
  ADD COLUMN "screening_decision_report_id" BIGINT,
  ADD COLUMN "screening_decided_at" TIMESTAMP(3);

ALTER TABLE "applications"
  ADD CONSTRAINT "uk_applications_screening_decision_report"
  UNIQUE ("screening_decision_report_id");

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_screening_decision_report_id_fkey"
  FOREIGN KEY ("screening_decision_report_id") REFERENCES "evaluation_reports"("report_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applications"
  ADD CONSTRAINT "ck_applications_screening_reason_matches_decision" CHECK (
    "screening_decision_reason_code" IS NULL
    OR ("screening_decision" = 'PASS' AND "screening_decision_reason_code" = 'PASS_TOTAL_AND_CRITERIA_MET')
    OR ("screening_decision" = 'HOLD' AND "screening_decision_reason_code" IN ('HOLD_TOTAL_BAND', 'HOLD_CRITERION_BELOW_PASS_SCORE'))
    OR ("screening_decision" = 'FAIL' AND "screening_decision_reason_code" = 'FAIL_BELOW_HOLD_THRESHOLD')
    OR ("screening_decision" = 'RETRY' AND "screening_decision_reason_code" IN ('RETRY_REPORT_FAILED', 'RETRY_STT_UNAVAILABLE', 'RETRY_EVALUATION_INCOMPLETE', 'RETRY_SCORE_MISSING'))
  );

ALTER TABLE "applications"
  ADD CONSTRAINT "ck_applications_screening_snapshot_complete" CHECK (
    "screening_decision_reason_code" IS NULL
    OR (
      "screening_decision_policy_version" IS NOT NULL
      AND "screening_policy_version" IS NOT NULL
      AND "screening_policy_version" >= 1
      AND "screening_criteria_version" IS NOT NULL
      AND "screening_criteria_version" >= 1
      AND "screening_decision_report_id" IS NOT NULL
      AND "screening_decided_at" IS NOT NULL
    )
  );

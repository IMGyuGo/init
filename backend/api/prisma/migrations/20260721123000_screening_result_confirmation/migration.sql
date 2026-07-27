-- SCREENING_RESULT_CONFIRMATION_V1 (#429)

ALTER TABLE "auto_screening_policies"
  DROP CONSTRAINT "ck_auto_screening_policy_total_scores",
  ADD CONSTRAINT "ck_auto_screening_policy_total_scores" CHECK (
    "hold_min_total_score" >= 0
    AND "hold_min_total_score" <= "pass_min_total_score"
    AND "pass_min_total_score" <= 100
  );

ALTER TABLE "applications"
  ADD COLUMN "screening_reviewer_decision" "ScreeningDecision",
  ADD COLUMN "screening_final_decision" "ScreeningDecision",
  ADD COLUMN "screening_decision_override_reason" TEXT,
  ADD COLUMN "screening_result_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "screening_result_confirmed_by_user_id" BIGINT;

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_screening_result_confirmed_by_user_id_fkey"
  FOREIGN KEY ("screening_result_confirmed_by_user_id") REFERENCES "users"("user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applications"
  ADD CONSTRAINT "ck_applications_screening_reviewer_override" CHECK (
    (
      "screening_reviewer_decision" IS NULL
      AND "screening_decision_override_reason" IS NULL
    )
    OR (
      "screening_reviewer_decision" IN ('PASS', 'HOLD', 'FAIL')
      AND "screening_reviewer_decision" <> "screening_decision"
      AND char_length(btrim("screening_decision_override_reason")) BETWEEN 10 AND 1000
    )
  );

ALTER TABLE "applications"
  ADD CONSTRAINT "ck_applications_screening_confirmation_complete" CHECK (
    (
      "screening_result_confirmed_at" IS NULL
      AND "screening_result_confirmed_by_user_id" IS NULL
      AND "screening_final_decision" IS NULL
    )
    OR (
      "screening_result_confirmed_at" IS NOT NULL
      AND "screening_result_confirmed_by_user_id" IS NOT NULL
      AND "screening_final_decision" IN ('PASS', 'HOLD', 'FAIL')
      AND "screening_final_decision" = COALESCE("screening_reviewer_decision", "screening_decision")
    )
  );

CREATE INDEX "idx_applications_posting_screening_reviewer"
  ON "applications"("posting_id", "screening_reviewer_decision");

CREATE INDEX "idx_applications_posting_screening_final"
  ON "applications"("posting_id", "screening_final_decision");

CREATE INDEX "idx_applications_posting_screening_confirmed"
  ON "applications"("posting_id", "screening_result_confirmed_at");

CREATE UNIQUE INDEX "uq_notifications_screening_result_delivery"
  ON "notifications"("application_id", "user_id", "channel", "notification_type")
  WHERE "notification_type" = 'SCREENING_RESULT_CONFIRMED';

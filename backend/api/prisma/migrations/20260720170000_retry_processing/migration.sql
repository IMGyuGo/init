CREATE TYPE "AiRetrySource" AS ENUM ('INITIAL', 'OPERATOR');

ALTER TABLE "ai_process_logs"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "next_retry_at" TIMESTAMP(3),
  ADD COLUMN "retry_source" "AiRetrySource" NOT NULL DEFAULT 'INITIAL',
  ADD COLUMN "retry_of_process_log_id" BIGINT;

ALTER TABLE "ai_process_logs"
  ADD CONSTRAINT "chk_ai_process_logs_attempt_count"
    CHECK (attempt_count BETWEEN 1 AND 3),
  ADD CONSTRAINT "chk_ai_process_logs_max_attempts"
    CHECK (max_attempts = 3),
  ADD CONSTRAINT "fk_ai_process_logs_retry_of"
    FOREIGN KEY ("retry_of_process_log_id")
    REFERENCES "ai_process_logs"("process_log_id")
    ON DELETE SET NULL;

UPDATE "ai_process_logs"
SET "next_retry_at" = CURRENT_TIMESTAMP
WHERE "status" = 'FAILED'
  AND "failure_category" IN ('RETRYABLE', 'STT_RETRYABLE')
  AND "process_type" = 'REPORT_GENERATE'
  AND "input_ref" IS NOT NULL
  AND "attempt_count" < "max_attempts"
  AND "next_retry_at" IS NULL;

UPDATE "ai_process_logs"
SET "failure_category" = 'RETRY_EXHAUSTED',
    "failure_reason" = 'Legacy retry state requires operator review after retry migration.',
    "next_retry_at" = NULL
WHERE "status" = 'FAILED'
  AND "failure_category" IN ('RETRYABLE', 'STT_RETRYABLE')
  AND "attempt_count" < "max_attempts"
  AND "next_retry_at" IS NULL;

CREATE INDEX "idx_ai_process_logs_retry_of"
  ON "ai_process_logs"("retry_of_process_log_id");

WITH ranked_active_reports AS (
  SELECT "process_log_id",
         ROW_NUMBER() OVER (
           PARTITION BY "application_id"
           ORDER BY "created_at" DESC, "process_log_id" DESC
         ) AS active_rank
  FROM "ai_process_logs"
  WHERE "application_id" IS NOT NULL
    AND "process_type" = 'REPORT_GENERATE'
    AND (
      "status" IN ('PENDING', 'RUNNING')
      OR (
        "status" = 'FAILED'
        AND "failure_category" IN ('RETRYABLE', 'STT_RETRYABLE')
        AND "attempt_count" < 3
        AND "next_retry_at" IS NOT NULL
      )
    )
)
UPDATE "ai_process_logs" AS process_log
SET "status" = 'FAILED',
    "failure_category" = 'NON_RETRYABLE',
    "failure_reason" = 'Superseded by the active report job during retry migration.',
    "completed_at" = CURRENT_TIMESTAMP,
    "lease_owner" = NULL,
    "lease_expires_at" = NULL
FROM ranked_active_reports
WHERE process_log."process_log_id" = ranked_active_reports."process_log_id"
  AND ranked_active_reports.active_rank > 1;

CREATE UNIQUE INDEX "uq_ai_process_logs_active_report_application"
  ON "ai_process_logs"("application_id")
  WHERE "application_id" IS NOT NULL
    AND "process_type" = 'REPORT_GENERATE'
    AND (
      "status" IN ('PENDING', 'RUNNING')
      OR (
        "status" = 'FAILED'
        AND "failure_category" IN ('RETRYABLE', 'STT_RETRYABLE')
        AND "attempt_count" < 3
        AND "next_retry_at" IS NOT NULL
      )
    );

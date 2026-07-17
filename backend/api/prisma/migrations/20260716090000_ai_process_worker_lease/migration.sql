ALTER TABLE "ai_process_logs"
  ADD COLUMN "lease_owner" VARCHAR(160),
  ADD COLUMN "lease_expires_at" TIMESTAMP(3);

CREATE INDEX "idx_ai_process_logs_status_lease"
  ON "ai_process_logs"("status", "lease_expires_at");

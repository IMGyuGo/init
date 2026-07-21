CREATE TYPE "PassMailDeliveryStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

ALTER TABLE "applications"
  ADD COLUMN "pass_mail_delivery_status" "PassMailDeliveryStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "pass_mail_sent_at" TIMESTAMP(3),
  ADD COLUMN "pass_mail_failed_at" TIMESTAMP(3),
  ADD COLUMN "pass_mail_failure_reason" VARCHAR(500);

CREATE INDEX "idx_applications_posting_pass_mail_delivery"
  ON "applications"("posting_id", "pass_mail_delivery_status");

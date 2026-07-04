-- Allow payment ownership by either a company or a candidate.
ALTER TABLE "payment_customers" ADD COLUMN "candidate_id" BIGINT;
ALTER TABLE "payment_orders" ADD COLUMN "candidate_id" BIGINT;

ALTER TABLE "payment_customers" ALTER COLUMN "company_id" DROP NOT NULL;
ALTER TABLE "payment_orders" ALTER COLUMN "company_id" DROP NOT NULL;

CREATE UNIQUE INDEX "uk_payment_customers_provider_candidate" ON "payment_customers"("provider", "candidate_id");
CREATE INDEX "idx_payment_orders_candidate_created" ON "payment_orders"("candidate_id", "created_at");

ALTER TABLE "payment_customers"
  ADD CONSTRAINT "payment_customers_candidate_id_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_candidate_id_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_customers"
  ADD CONSTRAINT "payment_customers_exactly_one_owner_ck"
  CHECK (
    ("company_id" IS NOT NULL AND "candidate_id" IS NULL)
    OR ("company_id" IS NULL AND "candidate_id" IS NOT NULL)
  );

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_exactly_one_owner_ck"
  CHECK (
    ("company_id" IS NOT NULL AND "candidate_id" IS NULL)
    OR ("company_id" IS NULL AND "candidate_id" IS NOT NULL)
  );


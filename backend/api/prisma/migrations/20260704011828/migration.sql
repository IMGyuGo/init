-- DropForeignKey
ALTER TABLE "payment_customers" DROP CONSTRAINT "payment_customers_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_customers" DROP CONSTRAINT "payment_customers_company_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_orders" DROP CONSTRAINT "payment_orders_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_orders" DROP CONSTRAINT "payment_orders_company_id_fkey";

-- AddForeignKey
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE SET NULL ON UPDATE CASCADE;

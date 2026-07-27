-- CreateTable
CREATE TABLE "payment_customers" (
    "payment_customer_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "company_id" BIGINT NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "customer_key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payment_customers_pkey" PRIMARY KEY ("payment_customer_id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "payment_order_id" BIGSERIAL NOT NULL,
    "payment_customer_id" BIGINT NOT NULL,
    "company_id" BIGINT NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "order_id" VARCHAR(100) NOT NULL,
    "payment_key" VARCHAR(200),
    "product_code" VARCHAR(50) NOT NULL,
    "order_name" VARCHAR(150) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "method" VARCHAR(30),
    "receipt_url" TEXT,
    "failure_code" VARCHAR(100),
    "failure_message" TEXT,
    "provider_payload" JSONB,
    "requested_at" TIMESTAMP(6),
    "approved_at" TIMESTAMP(6),
    "failed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("payment_order_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uk_payment_customers_provider_customer_key" ON "payment_customers"("provider", "customer_key");

-- CreateIndex
CREATE UNIQUE INDEX "uk_payment_customers_provider_company" ON "payment_customers"("provider", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_payment_orders_provider_order" ON "payment_orders"("provider", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_payment_orders_provider_payment_key" ON "payment_orders"("provider", "payment_key");

-- CreateIndex
CREATE INDEX "idx_payment_orders_company_created" ON "payment_orders"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_payment_orders_status_created" ON "payment_orders"("status", "created_at");

-- AddForeignKey
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_payment_customer_id_fkey" FOREIGN KEY ("payment_customer_id") REFERENCES "payment_customers"("payment_customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

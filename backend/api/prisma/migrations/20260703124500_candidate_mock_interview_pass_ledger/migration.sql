CREATE TABLE "candidate_mock_interview_pass_ledgers" (
    "ledger_id" BIGSERIAL NOT NULL,
    "candidate_id" BIGINT NOT NULL,
    "payment_order_id" BIGINT,
    "used_session_id" BIGINT,
    "source" VARCHAR(40) NOT NULL,
    "change_amount" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_mock_interview_pass_ledgers_pkey" PRIMARY KEY ("ledger_id")
);

CREATE INDEX "idx_candidate_mock_pass_candidate_created"
    ON "candidate_mock_interview_pass_ledgers"("candidate_id", "created_at");

CREATE INDEX "idx_candidate_mock_pass_candidate_expires"
    ON "candidate_mock_interview_pass_ledgers"("candidate_id", "expires_at");

CREATE UNIQUE INDEX "uk_candidate_mock_pass_payment_order"
    ON "candidate_mock_interview_pass_ledgers"("payment_order_id");

ALTER TABLE "candidate_mock_interview_pass_ledgers"
    ADD CONSTRAINT "candidate_mock_interview_pass_ledgers_candidate_id_fkey"
    FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "candidate_mock_interview_pass_ledgers"
    ADD CONSTRAINT "candidate_mock_interview_pass_ledgers_payment_order_id_fkey"
    FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("payment_order_id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "candidate_mock_interview_pass_ledgers"
    ADD CONSTRAINT "candidate_mock_interview_pass_ledgers_used_session_id_fkey"
    FOREIGN KEY ("used_session_id") REFERENCES "interview_sessions"("session_id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "candidate_mock_interview_pass_ledgers"
    ADD CONSTRAINT "ck_candidate_mock_pass_nonzero_change"
    CHECK ("change_amount" <> 0);

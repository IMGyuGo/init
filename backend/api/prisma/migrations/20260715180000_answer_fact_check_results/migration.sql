CREATE TABLE "answer_fact_check_runs" (
  "fact_check_run_id" BIGSERIAL PRIMARY KEY,
  "report_id" BIGINT NOT NULL,
  "answer_id" BIGINT NOT NULL,
  "provider_status" VARCHAR(40) NOT NULL,
  "gate_status" VARCHAR(40),
  "provider_mode" VARCHAR(20) NOT NULL,
  "model_version" VARCHAR(120) NOT NULL,
  "prompt_version" VARCHAR(100) NOT NULL,
  "knowledge_snapshot_version" VARCHAR(100) NOT NULL,
  "policy_version" VARCHAR(100) NOT NULL,
  "failure_reason" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ck_answer_fact_check_runs_provider_status"
    CHECK ("provider_status" IN ('COMPLETED', 'FAILED', 'TIMEOUT', 'INVALID_OUTPUT')),
  CONSTRAINT "ck_answer_fact_check_runs_gate_status"
    CHECK ("gate_status" IS NULL OR "gate_status" IN ('PASS_THROUGH', 'CLARIFICATION_CANDIDATE', 'FACT_CHECK_REQUIRED')),
  CONSTRAINT "ck_answer_fact_check_runs_provider_mode"
    CHECK ("provider_mode" IN ('mock', 'openai')),
  CONSTRAINT "ck_answer_fact_check_runs_status_shape"
    CHECK (
      (
        "provider_status" = 'COMPLETED'
        AND "gate_status" IS NOT NULL
        AND "failure_reason" IS NULL
      )
      OR (
        "provider_status" <> 'COMPLETED'
        AND "gate_status" IS NULL
        AND LENGTH(BTRIM("failure_reason")) > 0
      )
    )
);

CREATE TABLE "answer_fact_check_claims" (
  "fact_check_claim_id" BIGSERIAL PRIMARY KEY,
  "fact_check_run_id" BIGINT NOT NULL,
  "claim_text" TEXT NOT NULL,
  "answer_start_offset" INTEGER NOT NULL,
  "answer_end_offset" INTEGER NOT NULL,
  "claim_type" VARCHAR(40) NOT NULL,
  "claim_role" VARCHAR(40) NOT NULL,
  "verdict" VARCHAR(40) NOT NULL,
  "confidence" DECIMAL(5,4) NOT NULL,
  "rationale" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "ck_answer_fact_check_claims_text"
    CHECK (LENGTH("claim_text") > 0),
  CONSTRAINT "ck_answer_fact_check_claims_offsets"
    CHECK ("answer_start_offset" >= 0 AND "answer_end_offset" > "answer_start_offset"),
  CONSTRAINT "ck_answer_fact_check_claims_type"
    CHECK ("claim_type" IN ('TECHNICAL_FACT', 'PERSONAL_EXPERIENCE', 'OPINION', 'OTHER')),
  CONSTRAINT "ck_answer_fact_check_claims_role"
    CHECK ("claim_role" IN ('ANSWER_CORE', 'SUPPORTING')),
  CONSTRAINT "ck_answer_fact_check_claims_verdict"
    CHECK ("verdict" IN ('SUPPORTED', 'CONTRADICTED', 'AMBIGUOUS', 'UNVERIFIABLE', 'NOT_CHECKABLE')),
  CONSTRAINT "ck_answer_fact_check_claims_confidence"
    CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "ck_answer_fact_check_claims_rationale"
    CHECK (LENGTH(BTRIM("rationale")) > 0),
  CONSTRAINT "ck_answer_fact_check_claims_sort_order"
    CHECK ("sort_order" >= 1)
);

CREATE TABLE "answer_fact_check_evidences" (
  "fact_check_evidence_id" BIGSERIAL PRIMARY KEY,
  "fact_check_claim_id" BIGINT NOT NULL,
  "evidence_ledger_id" VARCHAR(80) NOT NULL,
  "source_snapshot_id" VARCHAR(160) NOT NULL,
  "source_kind" VARCHAR(40) NOT NULL,
  "source_start_offset" INTEGER NOT NULL,
  "source_end_offset" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "ck_answer_fact_check_evidences_identifiers"
    CHECK (LENGTH(BTRIM("evidence_ledger_id")) > 0 AND LENGTH(BTRIM("source_snapshot_id")) > 0),
  CONSTRAINT "ck_answer_fact_check_evidences_source_kind"
    CHECK ("source_kind" IN ('ANSWER_SNAPSHOT', 'RESUME_SNAPSHOT', 'JD_SNAPSHOT', 'KNOWLEDGE_SNAPSHOT')),
  CONSTRAINT "ck_answer_fact_check_evidences_offsets"
    CHECK ("source_start_offset" >= 0 AND "source_end_offset" > "source_start_offset"),
  CONSTRAINT "ck_answer_fact_check_evidences_sort_order"
    CHECK ("sort_order" >= 1)
);

ALTER TABLE "answer_fact_check_runs"
  ADD CONSTRAINT "answer_fact_check_runs_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "evaluation_reports"("report_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "answer_fact_check_runs_answer_id_fkey"
    FOREIGN KEY ("answer_id") REFERENCES "interview_answers"("answer_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "answer_fact_check_claims"
  ADD CONSTRAINT "answer_fact_check_claims_fact_check_run_id_fkey"
    FOREIGN KEY ("fact_check_run_id") REFERENCES "answer_fact_check_runs"("fact_check_run_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "answer_fact_check_evidences"
  ADD CONSTRAINT "answer_fact_check_evidences_fact_check_claim_id_fkey"
    FOREIGN KEY ("fact_check_claim_id") REFERENCES "answer_fact_check_claims"("fact_check_claim_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_answer_fact_check_runs_report_answer_policy"
  ON "answer_fact_check_runs"("report_id", "answer_id", "policy_version");
CREATE INDEX "idx_answer_fact_check_runs_answer"
  ON "answer_fact_check_runs"("answer_id");
CREATE INDEX "idx_answer_fact_check_runs_report_status"
  ON "answer_fact_check_runs"("report_id", "provider_status");
CREATE UNIQUE INDEX "uq_answer_fact_check_claims_run_order"
  ON "answer_fact_check_claims"("fact_check_run_id", "sort_order");
CREATE INDEX "idx_answer_fact_check_claims_verdict"
  ON "answer_fact_check_claims"("verdict");
CREATE UNIQUE INDEX "uq_answer_fact_check_evidences_claim_order"
  ON "answer_fact_check_evidences"("fact_check_claim_id", "sort_order");
CREATE UNIQUE INDEX "uq_answer_fact_check_evidences_claim_ledger"
  ON "answer_fact_check_evidences"("fact_check_claim_id", "evidence_ledger_id");
CREATE INDEX "idx_answer_fact_check_evidences_snapshot"
  ON "answer_fact_check_evidences"("source_snapshot_id");

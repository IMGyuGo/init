CREATE TABLE "synthetic_applicant_datasets" (
    "dataset_id" VARCHAR(64) NOT NULL,
    "environment" VARCHAR(30) NOT NULL,
    "posting_id" BIGINT NOT NULL,
    "company_id" BIGINT NOT NULL,
    "active_count" INTEGER NOT NULL,
    "canceled_count" INTEGER NOT NULL,
    "interactive_count" INTEGER NOT NULL,
    "pipeline_selection_count" INTEGER NOT NULL DEFAULT 0,
    "batch_size" INTEGER NOT NULL,
    "options_hash" VARCHAR(64) NOT NULL,
    "manifest_version" VARCHAR(40) NOT NULL DEFAULT 'SYNTHETIC_APPLICANT_MANIFEST_V1',
    "status" VARCHAR(30) NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "cleaned_at" TIMESTAMP(3),

    CONSTRAINT "synthetic_applicant_datasets_pkey" PRIMARY KEY ("dataset_id"),
    CONSTRAINT "ck_synthetic_applicant_datasets_counts" CHECK (
        "active_count" >= 100
        AND "active_count" <= 5000
        AND "canceled_count" >= 0
        AND "canceled_count" <= "active_count"
        AND "interactive_count" = 10
        AND "pipeline_selection_count" BETWEEN 0 AND 10
        AND "batch_size" BETWEEN 10 AND 500
    ),
    CONSTRAINT "ck_synthetic_applicant_datasets_status" CHECK (
        "status" IN ('APPLYING', 'APPLIED', 'PARTIAL', 'FAILED', 'CLEANING', 'CLEANED')
    )
);

CREATE TABLE "synthetic_applicant_records" (
    "record_id" BIGSERIAL NOT NULL,
    "dataset_id" VARCHAR(64) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "user_id" BIGINT NOT NULL,
    "candidate_id" BIGINT NOT NULL,
    "application_id" BIGINT NOT NULL,
    "is_interactive" BOOLEAN NOT NULL DEFAULT false,
    "is_canceled" BOOLEAN NOT NULL DEFAULT false,
    "lifecycle_stage" VARCHAR(40) NOT NULL,
    "data_depth" VARCHAR(40) NOT NULL,
    "pipeline_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleaned_at" TIMESTAMP(3),

    CONSTRAINT "synthetic_applicant_records_pkey" PRIMARY KEY ("record_id"),
    CONSTRAINT "ck_synthetic_applicant_records_ordinal" CHECK ("ordinal" >= 1),
    CONSTRAINT "ck_synthetic_applicant_records_stage" CHECK (
        "lifecycle_stage" IN (
            'DOCUMENT_PROCESSING', 'DOCUMENT_REVIEW', 'INTERVIEW_WAITING',
            'INTERVIEW_IN_PROGRESS', 'REPORT_COMPLETED', 'FAILED', 'CANCELED'
        )
    ),
    CONSTRAINT "ck_synthetic_applicant_records_depth" CHECK (
        "data_depth" IN ('LIGHTWEIGHT', 'PROFILE', 'INTERVIEW', 'REPORT')
    )
);

ALTER TABLE "synthetic_applicant_datasets"
    ADD CONSTRAINT "fk_synthetic_applicant_datasets_posting"
    FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "synthetic_applicant_datasets"
    ADD CONSTRAINT "fk_synthetic_applicant_datasets_company"
    FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "synthetic_applicant_records"
    ADD CONSTRAINT "fk_synthetic_applicant_records_dataset"
    FOREIGN KEY ("dataset_id") REFERENCES "synthetic_applicant_datasets"("dataset_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_synthetic_applicant_records_dataset_ordinal"
    ON "synthetic_applicant_records"("dataset_id", "ordinal");
CREATE UNIQUE INDEX "uq_synthetic_applicant_records_user"
    ON "synthetic_applicant_records"("user_id");
CREATE UNIQUE INDEX "uq_synthetic_applicant_records_candidate"
    ON "synthetic_applicant_records"("candidate_id");
CREATE UNIQUE INDEX "uq_synthetic_applicant_records_application"
    ON "synthetic_applicant_records"("application_id");
CREATE INDEX "idx_synthetic_applicant_datasets_posting_status"
    ON "synthetic_applicant_datasets"("posting_id", "status");
CREATE INDEX "idx_synthetic_applicant_datasets_company_status"
    ON "synthetic_applicant_datasets"("company_id", "status");
CREATE INDEX "idx_synthetic_applicant_records_dataset_cleaned"
    ON "synthetic_applicant_records"("dataset_id", "cleaned_at");

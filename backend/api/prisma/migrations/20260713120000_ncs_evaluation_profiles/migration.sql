CREATE TYPE "EvaluationCriterionSource" AS ENUM (
  'COMPANY_CUSTOM',
  'NCS_OFFICIAL',
  'COMPANY_TALENT',
  'SERVICE_COMMON'
);

CREATE TYPE "EvaluationProfileStatus" AS ENUM ('DRAFT', 'ACTIVE');

ALTER TABLE "evaluation_criteria"
  ADD COLUMN "source_type" "EvaluationCriterionSource" NOT NULL DEFAULT 'COMPANY_CUSTOM',
  ADD COLUMN "source_code" VARCHAR(80),
  ADD COLUMN "source_version" VARCHAR(80),
  ADD COLUMN "source_name" VARCHAR(200),
  ADD COLUMN "behavior_indicators" JSONB,
  ADD COLUMN "alignment_rationale" TEXT,
  ADD COLUMN "ncs_unit_id" BIGINT;

CREATE TABLE "ncs_competency_units" (
  "ncs_unit_id" BIGSERIAL NOT NULL,
  "unit_code" VARCHAR(80) NOT NULL,
  "classification_code" VARCHAR(80) NOT NULL,
  "unit_name" VARCHAR(200) NOT NULL,
  "definition" TEXT,
  "unit_level" VARCHAR(30),
  "development_year" VARCHAR(10),
  "version" VARCHAR(50) NOT NULL,
  "ncs_degree" VARCHAR(30) NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "large_category_code" VARCHAR(20) NOT NULL,
  "large_category_name" VARCHAR(120) NOT NULL,
  "medium_category_code" VARCHAR(20) NOT NULL,
  "medium_category_name" VARCHAR(120) NOT NULL,
  "small_category_code" VARCHAR(20) NOT NULL,
  "small_category_name" VARCHAR(120) NOT NULL,
  "subdivision_code" VARCHAR(20) NOT NULL,
  "subdivision_name" VARCHAR(160) NOT NULL,
  "duty_definition" TEXT,
  "source_provider" VARCHAR(120) NOT NULL DEFAULT '한국산업인력공단',
  "source_url" VARCHAR(500) NOT NULL,
  "source_updated_at" DATE,
  "raw_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ncs_competency_units_pkey" PRIMARY KEY ("ncs_unit_id")
);

CREATE TABLE "ncs_competency_elements" (
  "ncs_element_id" BIGSERIAL NOT NULL,
  "ncs_unit_id" BIGINT NOT NULL,
  "element_code" VARCHAR(80) NOT NULL,
  "element_number" VARCHAR(30) NOT NULL,
  "element_name" VARCHAR(250) NOT NULL,
  "element_level" VARCHAR(30),
  "raw_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ncs_competency_elements_pkey" PRIMARY KEY ("ncs_element_id")
);

CREATE TABLE "posting_evaluation_profiles" (
  "profile_id" BIGSERIAL NOT NULL,
  "posting_id" BIGINT NOT NULL,
  "status" "EvaluationProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "ncs_weight" INTEGER NOT NULL DEFAULT 60,
  "company_weight" INTEGER NOT NULL DEFAULT 25,
  "service_weight" INTEGER NOT NULL DEFAULT 15,
  "rubric_version" VARCHAR(80) NOT NULL DEFAULT 'NCS_EVIDENCE_RUBRIC_V1',
  "company_talent_snapshot" TEXT,
  "evaluation_policy_snapshot" TEXT,
  "source_snapshot" JSONB,
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "posting_evaluation_profiles_pkey" PRIMARY KEY ("profile_id")
);

CREATE TABLE "posting_ncs_selections" (
  "selection_id" BIGSERIAL NOT NULL,
  "profile_id" BIGINT NOT NULL,
  "ncs_unit_id" BIGINT NOT NULL,
  "weight" INTEGER NOT NULL,
  "relevance_score" INTEGER,
  "rationale" TEXT,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posting_ncs_selections_pkey" PRIMARY KEY ("selection_id")
);

CREATE UNIQUE INDEX "uk_ncs_units_classification_version"
  ON "ncs_competency_units"("classification_code", "version");
CREATE INDEX "idx_ncs_units_name" ON "ncs_competency_units"("unit_name");
CREATE INDEX "idx_ncs_units_subdivision_current"
  ON "ncs_competency_units"("subdivision_code", "is_current");
CREATE UNIQUE INDEX "uk_ncs_elements_unit_code"
  ON "ncs_competency_elements"("ncs_unit_id", "element_code");
CREATE UNIQUE INDEX "posting_evaluation_profiles_posting_id_key"
  ON "posting_evaluation_profiles"("posting_id");
CREATE UNIQUE INDEX "uk_posting_ncs_profile_unit"
  ON "posting_ncs_selections"("profile_id", "ncs_unit_id");
CREATE INDEX "idx_posting_ncs_unit" ON "posting_ncs_selections"("ncs_unit_id");
CREATE INDEX "idx_evaluation_criteria_posting_source"
  ON "evaluation_criteria"("posting_id", "source_type");
CREATE INDEX "idx_evaluation_criteria_ncs_unit"
  ON "evaluation_criteria"("ncs_unit_id");

ALTER TABLE "ncs_competency_elements"
  ADD CONSTRAINT "ncs_competency_elements_ncs_unit_id_fkey"
  FOREIGN KEY ("ncs_unit_id") REFERENCES "ncs_competency_units"("ncs_unit_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posting_evaluation_profiles"
  ADD CONSTRAINT "posting_evaluation_profiles_posting_id_fkey"
  FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posting_ncs_selections"
  ADD CONSTRAINT "posting_ncs_selections_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "posting_evaluation_profiles"("profile_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posting_ncs_selections"
  ADD CONSTRAINT "posting_ncs_selections_ncs_unit_id_fkey"
  FOREIGN KEY ("ncs_unit_id") REFERENCES "ncs_competency_units"("ncs_unit_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evaluation_criteria"
  ADD CONSTRAINT "evaluation_criteria_ncs_unit_id_fkey"
  FOREIGN KEY ("ncs_unit_id") REFERENCES "ncs_competency_units"("ncs_unit_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

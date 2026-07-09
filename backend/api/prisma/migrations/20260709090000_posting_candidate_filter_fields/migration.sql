ALTER TABLE "postings"
  ADD COLUMN "job_role_code" VARCHAR(50),
  ADD COLUMN "region_code" VARCHAR(30),
  ADD COLUMN "career_min_years" INTEGER,
  ADD COLUMN "career_max_years" INTEGER,
  ADD COLUMN "employment_type_code" VARCHAR(20),
  ADD COLUMN "recruitment_type" VARCHAR(20);

CREATE INDEX "postings_job_role_code_idx" ON "postings" ("job_role_code");
CREATE INDEX "postings_region_code_idx" ON "postings" ("region_code");

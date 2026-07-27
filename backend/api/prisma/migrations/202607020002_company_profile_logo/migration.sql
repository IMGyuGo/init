ALTER TABLE "companies"
  ADD COLUMN "logo_file_id" BIGINT;

ALTER TABLE "companies"
  ADD CONSTRAINT "fk_companies_logo_file"
  FOREIGN KEY ("logo_file_id") REFERENCES "file_assets"("file_id");

CREATE INDEX "idx_companies_logo_file"
  ON "companies"("logo_file_id");

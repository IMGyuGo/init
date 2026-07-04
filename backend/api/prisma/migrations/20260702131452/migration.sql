-- DropForeignKey
ALTER TABLE "companies" DROP CONSTRAINT "fk_companies_logo_file";

-- DropIndex
DROP INDEX "idx_companies_logo_file";

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "file_assets"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

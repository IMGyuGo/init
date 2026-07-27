-- Add optional structured posting info for company recruiting filters.
ALTER TABLE "postings" ADD COLUMN "career_requirement" VARCHAR(150);
ALTER TABLE "postings" ADD COLUMN "education_requirement" VARCHAR(150);
ALTER TABLE "postings" ADD COLUMN "salary_info" VARCHAR(150);
ALTER TABLE "postings" ADD COLUMN "work_location" VARCHAR(150);
ALTER TABLE "postings" ADD COLUMN "employment_type" VARCHAR(150);

ALTER TABLE "applications"
  ADD COLUMN "applicant_name" VARCHAR(100),
  ADD COLUMN "applicant_email" VARCHAR(255),
  ADD COLUMN "applicant_phone" VARCHAR(50),
  ADD COLUMN "github_url" VARCHAR(500),
  ADD COLUMN "blog_url" VARCHAR(500),
  ADD COLUMN "portfolio_url" VARCHAR(500),
  ADD COLUMN "motivation" TEXT,
  ADD COLUMN "additional_info" TEXT;

UPDATE "applications" AS application
SET
  "applicant_name" = candidate_user."name",
  "applicant_email" = candidate_user."email",
  "applicant_phone" = candidate_user."phone",
  "github_url" = candidate_profile."github_url",
  "portfolio_url" = candidate_profile."portfolio_url"
FROM "candidate_profiles" AS candidate_profile
JOIN "users" AS candidate_user
  ON candidate_user."user_id" = candidate_profile."user_id"
WHERE candidate_profile."candidate_id" = application."candidate_id";

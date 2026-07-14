ALTER TABLE "candidate_profiles"
ADD COLUMN "cover_letter" TEXT;

ALTER TABLE "candidate_folders"
ADD COLUMN "profile_snapshot" JSONB;

ALTER TABLE "applications"
ADD COLUMN "profile_snapshot" JSONB;

CREATE TABLE "candidate_folders" (
  "id" BIGSERIAL NOT NULL,
  "candidate_id" BIGINT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "github_url" VARCHAR(500),
  "blog_url" VARCHAR(500),
  "portfolio_url" VARCHAR(500),
  "resume_file_id" BIGINT,
  "motivation" TEXT,
  "extra_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "candidate_folders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_candidate_folders_candidate_id" ON "candidate_folders"("candidate_id");

ALTER TABLE "candidate_folders"
  ADD CONSTRAINT "candidate_folders_candidate_id_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "candidate_folders"
  ADD CONSTRAINT "candidate_folders_resume_file_id_fkey"
  FOREIGN KEY ("resume_file_id") REFERENCES "file_assets"("file_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

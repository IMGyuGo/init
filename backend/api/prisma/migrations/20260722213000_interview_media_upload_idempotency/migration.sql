ALTER TABLE "file_assets"
  ADD COLUMN "upload_request_id" UUID;

CREATE UNIQUE INDEX "uq_file_assets_owner_upload_request"
  ON "file_assets"("owner_user_id", "upload_request_id");

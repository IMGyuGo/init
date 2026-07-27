ALTER TABLE "interview_answers"
  ADD COLUMN "media_upload_request_id" UUID;

CREATE UNIQUE INDEX "uq_interview_answers_session_media_upload_request"
  ON "interview_answers"("session_id", "media_upload_request_id");

ALTER TABLE "interview_sessions"
ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "idx_interview_sessions_candidate_type_deleted"
ON "interview_sessions"("candidate_id", "interview_type", "deleted_at");

-- Preserve canceled application history while allowing a candidate to reapply to the same posting.
DROP INDEX "applications_posting_id_candidate_id_key";

-- PostgreSQL partial uniqueness keeps the submit race safe without treating canceled history as active.
CREATE UNIQUE INDEX "applications_active_posting_id_candidate_id_key"
ON "applications"("posting_id", "candidate_id")
WHERE "application_status" <> 'CANCELED';

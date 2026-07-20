-- Keep large applicant lists and status summaries index-backed as demo data grows.
CREATE INDEX "idx_applications_posting_updated_id"
    ON "applications"("posting_id", "updated_at" DESC, "application_id" DESC);

CREATE INDEX "idx_applications_posting_document_status"
    ON "applications"("posting_id", "document_status");

CREATE INDEX "idx_applications_posting_interview_status"
    ON "applications"("posting_id", "interview_status");

CREATE INDEX "idx_applications_posting_report_status"
    ON "applications"("posting_id", "report_status");

CREATE INDEX "idx_applications_posting_screening_decision"
    ON "applications"("posting_id", "screening_decision");

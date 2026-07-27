CREATE TABLE "interview_time_policies" (
    "posting_id" BIGINT NOT NULL,
    "preparation_time_sec" INTEGER NOT NULL DEFAULT 0,
    "answer_time_sec" INTEGER NOT NULL DEFAULT 90,
    "retry_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_time_policies_pkey" PRIMARY KEY ("posting_id")
);

ALTER TABLE "interview_time_policies"
    ADD CONSTRAINT "interview_time_policies_posting_id_fkey"
    FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "interview_question_sets" (
    "question_set_id" BIGSERIAL NOT NULL,
    "posting_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "created_by_process_log_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_question_sets_pkey" PRIMARY KEY ("question_set_id")
);

CREATE TABLE "interview_question_set_items" (
    "question_set_item_id" BIGSERIAL NOT NULL,
    "question_set_id" BIGINT NOT NULL,
    "question_id" BIGINT NOT NULL,
    "criterion_id" BIGINT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "interview_question_set_items_pkey" PRIMARY KEY ("question_set_item_id")
);

CREATE INDEX "idx_interview_question_sets_posting_status" ON "interview_question_sets"("posting_id", "status");
CREATE UNIQUE INDEX "uq_interview_question_set_items_order" ON "interview_question_set_items"("question_set_id", "sort_order");

ALTER TABLE "interview_question_sets" ADD CONSTRAINT "interview_question_sets_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interview_question_sets" ADD CONSTRAINT "interview_question_sets_created_by_process_log_id_fkey" FOREIGN KEY ("created_by_process_log_id") REFERENCES "ai_process_logs"("process_log_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interview_question_set_items" ADD CONSTRAINT "interview_question_set_items_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "interview_question_sets"("question_set_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interview_question_set_items" ADD CONSTRAINT "interview_question_set_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("question_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interview_question_set_items" ADD CONSTRAINT "interview_question_set_items_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id") ON DELETE SET NULL ON UPDATE CASCADE;

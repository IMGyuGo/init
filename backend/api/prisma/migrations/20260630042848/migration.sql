/*
  Warnings:

  - A unique constraint covering the columns `[source_type,source_text_hash]` on the table `embeddings` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiProcessType" ADD VALUE 'GUARDRAIL_VALIDATE';
ALTER TYPE "AiProcessType" ADD VALUE 'CRITERIA_SUGGEST';
ALTER TYPE "AiProcessType" ADD VALUE 'QUESTION_GENERATE';
ALTER TYPE "AiProcessType" ADD VALUE 'QUESTION_SET_GENERATE';

-- DropIndex
DROP INDEX "idx_ai_guardrail_logs_process_log_id";

-- DropIndex
DROP INDEX "idx_application_documents_application_id";

-- DropIndex
DROP INDEX "idx_interview_answers_session_id";

-- DropIndex
DROP INDEX "idx_report_evidences_score_id";

-- DropIndex
DROP INDEX "idx_report_scores_report_id";

-- AlterTable
ALTER TABLE "ai_process_logs" ADD COLUMN     "failure_category" VARCHAR(40),
ADD COLUMN     "failure_reason" TEXT;

-- AlterTable
ALTER TABLE "evaluation_reports" ADD COLUMN     "failure_category" VARCHAR(40),
ADD COLUMN     "failure_reason" TEXT;

-- AlterTable
ALTER TABLE "report_evidences" ADD COLUMN     "document_id" BIGINT,
ADD COLUMN     "document_ref" VARCHAR(255),
ADD COLUMN     "source_type" VARCHAR(80) NOT NULL DEFAULT 'INTERVIEW_ANSWER';

-- CreateIndex
CREATE INDEX "idx_embeddings_source_type" ON "embeddings"("source_type");

-- CreateIndex
CREATE INDEX "idx_embeddings_source_hash" ON "embeddings"("source_text_hash");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_source_type_source_text_hash_key" ON "embeddings"("source_type", "source_text_hash");

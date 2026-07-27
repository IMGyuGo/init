/*
  Warnings:

  - The `status` column on the `ai_process_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `application_status` column on the `applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `document_status` column on the `applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `interview_status` column on the `applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `report_status` column on the `applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `screening_decision` column on the `applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `evaluation_reports` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `interview_sessions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `decision` column on the `manual_evaluations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `postings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `auth_provider` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[posting_id,candidate_id]` on the table `applications` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[owner_user_id]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `result` on the `ai_guardrail_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `process_type` on the `ai_process_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `document_type` on the `application_documents` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `parse_status` on the `application_documents` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `consent_type` on the `consent_records` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `source_type` on the `embeddings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `report_type` on the `evaluation_reports` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `interview_type` on the `interview_sessions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `channel` on the `notifications` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `question_type` on the `question_bank` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_type` on the `users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ADMIN', 'COMPANY', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSING_SOON', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'INTERVIEW_WAITING', 'INTERVIEW_DONE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('NOT_READY', 'READY', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScreeningDecision" AS ENUM ('UNDECIDED', 'PASS', 'HOLD', 'FAIL');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('MOCK', 'RECRUITING');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MOCK_INTERVIEW_REPORT', 'RECRUITING_REPORT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RESUME', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_COLLECTION', 'AI_DOCUMENT_ANALYSIS', 'AI_INTERVIEW_RECORDING');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('INTRO', 'TECHNICAL', 'EXPERIENCE', 'SITUATION', 'FOLLOW_UP', 'CLOSING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "AiProcessType" AS ENUM ('DOCUMENT_EXTRACT', 'STT', 'FOLLOW_UP', 'REPORT_GENERATE', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "AiProcessStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GuardrailResult" AS ENUM ('PASS', 'BLOCKED', 'REGENERATED');

-- CreateEnum
CREATE TYPE "EmbeddingSourceType" AS ENUM ('POSTING_JD', 'CRITERION_TAG', 'QUESTION', 'APPLICATION_DOCUMENT', 'INTERVIEW_ANSWER', 'EVALUATION_REPORT');

-- DropIndex
DROP INDEX "idx_ai_process_logs_application";

-- DropIndex
DROP INDEX "idx_applications_candidate";

-- DropIndex
DROP INDEX "idx_applications_posting";

-- DropIndex
DROP INDEX "idx_companies_owner_user";

-- DropIndex
DROP INDEX "idx_criterion_tags_job_role";

-- DropIndex
DROP INDEX "idx_embeddings_source_hash";

-- DropIndex
DROP INDEX "idx_embeddings_source_type";

-- DropIndex
DROP INDEX "idx_evaluation_criteria_posting";

-- DropIndex
DROP INDEX "uk_evaluation_criteria_posting_tag";

-- DropIndex
DROP INDEX "idx_evaluation_reports_application";

-- DropIndex
DROP INDEX "idx_interview_sessions_application";

-- DropIndex
DROP INDEX "idx_postings_company";

-- DropIndex
DROP INDEX "idx_question_bank_posting";

-- AlterTable
ALTER TABLE "ai_guardrail_logs" DROP COLUMN "result",
ADD COLUMN     "result" "GuardrailResult" NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ai_process_logs" DROP COLUMN "process_type",
ADD COLUMN     "process_type" "AiProcessType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AiProcessStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "application_documents" DROP COLUMN "document_type",
ADD COLUMN     "document_type" "DocumentType" NOT NULL,
DROP COLUMN "parse_status",
ADD COLUMN     "parse_status" "DocumentStatus" NOT NULL,
ALTER COLUMN "uploaded_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "uploaded_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "applications" DROP COLUMN "application_status",
ADD COLUMN     "application_status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
DROP COLUMN "document_status",
ADD COLUMN     "document_status" "DocumentStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
DROP COLUMN "interview_status",
ADD COLUMN     "interview_status" "InterviewStatus" NOT NULL DEFAULT 'NOT_READY',
DROP COLUMN "report_status",
ADD COLUMN     "report_status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "screening_decision",
ADD COLUMN     "screening_decision" "ScreeningDecision" DEFAULT 'UNDECIDED',
ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "consent_records" DROP COLUMN "consent_type",
ADD COLUMN     "consent_type" "ConsentType" NOT NULL,
ALTER COLUMN "agreed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "embeddings" DROP COLUMN "source_type",
ADD COLUMN     "source_type" "EmbeddingSourceType" NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "evaluation_reports" DROP COLUMN "report_type",
ADD COLUMN     "report_type" "ReportType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "generated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "file_assets" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "follow_up_questions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "interview_answers" ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "interview_sessions" DROP COLUMN "interview_type",
ADD COLUMN     "interview_type" "InterviewType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "InterviewStatus" NOT NULL DEFAULT 'NOT_READY',
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "manual_evaluations" DROP COLUMN "decision",
ADD COLUMN     "decision" "ScreeningDecision",
ALTER COLUMN "reviewed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "channel",
ADD COLUMN     "channel" "NotificationChannel" NOT NULL,
ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "postings" DROP COLUMN "status",
ADD COLUMN     "status" "PostingStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "question_bank" DROP COLUMN "question_type",
ADD COLUMN     "question_type" "QuestionType" NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "user_type",
ADD COLUMN     "user_type" "UserType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
DROP COLUMN "auth_provider",
ADD COLUMN     "auth_provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL';

-- CreateIndex
CREATE INDEX "applications_posting_id_application_status_idx" ON "applications"("posting_id", "application_status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_posting_id_candidate_id_key" ON "applications"("posting_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_owner_user_id_key" ON "companies"("owner_user_id");

-- CreateIndex
CREATE INDEX "postings_company_id_status_idx" ON "postings"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uk_users_provider_user" ON "users"("auth_provider", "provider_user_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_default_resume_file_id_fkey" FOREIGN KEY ("default_resume_file_id") REFERENCES "file_assets"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postings" ADD CONSTRAINT "postings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "criterion_tags"("tag_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_assets"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("question_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_video_file_id_fkey" FOREIGN KEY ("video_file_id") REFERENCES "file_assets"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_audio_file_id_fkey" FOREIGN KEY ("audio_file_id") REFERENCES "file_assets"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_questions" ADD CONSTRAINT "follow_up_questions_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "interview_answers"("answer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_reports" ADD CONSTRAINT "evaluation_reports_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_reports" ADD CONSTRAINT "evaluation_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_scores" ADD CONSTRAINT "report_scores_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "evaluation_reports"("report_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_scores" ADD CONSTRAINT "report_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("criterion_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_evidences" ADD CONSTRAINT "report_evidences_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "report_scores"("score_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_evidences" ADD CONSTRAINT "report_evidences_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "interview_answers"("answer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_evaluations" ADD CONSTRAINT "manual_evaluations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "evaluation_reports"("report_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_evaluations" ADD CONSTRAINT "manual_evaluations_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_process_logs" ADD CONSTRAINT "ai_process_logs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_process_logs" ADD CONSTRAINT "ai_process_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_guardrail_logs" ADD CONSTRAINT "ai_guardrail_logs_process_log_id_fkey" FOREIGN KEY ("process_log_id") REFERENCES "ai_process_logs"("process_log_id") ON DELETE RESTRICT ON UPDATE CASCADE;

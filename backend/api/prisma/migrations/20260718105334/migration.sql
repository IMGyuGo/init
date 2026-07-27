-- AlterTable
ALTER TABLE "follow_up_questions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "application_interview_question_batches" RENAME CONSTRAINT "application_interview_question_batches_latest_process_log_id_fk" TO "application_interview_question_batches_latest_process_log__fkey";

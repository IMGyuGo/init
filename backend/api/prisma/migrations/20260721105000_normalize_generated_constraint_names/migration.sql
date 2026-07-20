DO $$
BEGIN
  IF to_regclass('public.synthetic_applicant_datasets') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.synthetic_applicant_datasets'::regclass
        AND conname = 'fk_synthetic_applicant_datasets_company'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.synthetic_applicant_datasets'::regclass
        AND conname = 'synthetic_applicant_datasets_company_id_fkey'
    )
  THEN
    ALTER TABLE "synthetic_applicant_datasets"
      RENAME CONSTRAINT "fk_synthetic_applicant_datasets_company"
      TO "synthetic_applicant_datasets_company_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.synthetic_applicant_datasets') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.synthetic_applicant_datasets'::regclass
        AND conname = 'fk_synthetic_applicant_datasets_posting'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.synthetic_applicant_datasets'::regclass
        AND conname = 'synthetic_applicant_datasets_posting_id_fkey'
    )
  THEN
    ALTER TABLE "synthetic_applicant_datasets"
      RENAME CONSTRAINT "fk_synthetic_applicant_datasets_posting"
      TO "synthetic_applicant_datasets_posting_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.synthetic_applicant_records') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.synthetic_applicant_records'::regclass
        AND conname = 'fk_synthetic_applicant_records_dataset'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.synthetic_applicant_records'::regclass
        AND conname = 'synthetic_applicant_records_dataset_id_fkey'
    )
  THEN
    ALTER TABLE "synthetic_applicant_records"
      RENAME CONSTRAINT "fk_synthetic_applicant_records_dataset"
      TO "synthetic_applicant_records_dataset_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ai_process_logs') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_process_logs'
        AND column_name = 'retry_of_process_log_id'
    )
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.ai_process_logs'::regclass
        AND conname = 'fk_ai_process_logs_retry_of'
    )
  THEN
    ALTER TABLE "ai_process_logs"
      DROP CONSTRAINT "fk_ai_process_logs_retry_of";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ai_process_logs') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_process_logs'
        AND column_name = 'retry_of_process_log_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.ai_process_logs'::regclass
        AND conname = 'ai_process_logs_retry_of_process_log_id_fkey'
    )
  THEN
    ALTER TABLE "ai_process_logs"
      ADD CONSTRAINT "ai_process_logs_retry_of_process_log_id_fkey"
      FOREIGN KEY ("retry_of_process_log_id")
      REFERENCES "ai_process_logs"("process_log_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

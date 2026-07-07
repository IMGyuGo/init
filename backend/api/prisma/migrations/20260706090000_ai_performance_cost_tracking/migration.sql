ALTER TABLE "ai_process_logs"
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "duration_ms" INTEGER,
  ADD COLUMN "model_name" VARCHAR(120),
  ADD COLUMN "input_tokens" INTEGER,
  ADD COLUMN "output_tokens" INTEGER,
  ADD COLUMN "audio_seconds" INTEGER,
  ADD COLUMN "estimated_cost_usd" DECIMAL(12,6),
  ADD COLUMN "cost_metadata_json" TEXT;

CREATE TABLE "ai_process_timing_events" (
  "timing_event_id" BIGSERIAL NOT NULL,
  "process_log_id" BIGINT NOT NULL,
  "event_name" VARCHAR(80) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "metadata_json" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_process_timing_events_pkey" PRIMARY KEY ("timing_event_id")
);

CREATE TABLE "client_performance_logs" (
  "client_performance_log_id" BIGSERIAL NOT NULL,
  "event_name" VARCHAR(80) NOT NULL,
  "process_log_id" BIGINT,
  "session_id" BIGINT,
  "application_id" BIGINT,
  "question_id" BIGINT,
  "duration_ms" INTEGER NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "metadata_json" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_performance_logs_pkey" PRIMARY KEY ("client_performance_log_id")
);

CREATE INDEX "idx_ai_process_timing_events_process_event" ON "ai_process_timing_events"("process_log_id", "event_name");
CREATE INDEX "idx_ai_process_timing_events_event_created" ON "ai_process_timing_events"("event_name", "created_at");
CREATE INDEX "idx_client_performance_logs_event_created" ON "client_performance_logs"("event_name", "created_at");
CREATE INDEX "idx_client_performance_logs_session_event" ON "client_performance_logs"("session_id", "event_name");
CREATE INDEX "idx_client_performance_logs_process_log" ON "client_performance_logs"("process_log_id");

ALTER TABLE "ai_process_timing_events"
  ADD CONSTRAINT "ai_process_timing_events_process_log_id_fkey"
  FOREIGN KEY ("process_log_id") REFERENCES "ai_process_logs"("process_log_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_performance_logs"
  ADD CONSTRAINT "client_performance_logs_process_log_id_fkey"
  FOREIGN KEY ("process_log_id") REFERENCES "ai_process_logs"("process_log_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_performance_logs"
  ADD CONSTRAINT "client_performance_logs_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_performance_logs"
  ADD CONSTRAINT "client_performance_logs_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE ai_guardrail_logs
    ADD COLUMN IF NOT EXISTS failure_category VARCHAR(40);

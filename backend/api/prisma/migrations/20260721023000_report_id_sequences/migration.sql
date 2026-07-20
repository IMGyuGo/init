-- Legacy API code inserted time-and-random values into these BIGSERIAL columns.
-- Re-align every owned sequence before relying on Prisma's database defaults.
SELECT setval(pg_get_serial_sequence('report_scores', 'score_id'),
  COALESCE((SELECT MAX(score_id) FROM report_scores), 1), true);
SELECT setval(pg_get_serial_sequence('report_evidences', 'evidence_id'),
  COALESCE((SELECT MAX(evidence_id) FROM report_evidences), 1), true);
SELECT setval(pg_get_serial_sequence('ncs_answer_evaluation_evidences', 'evidence_id'),
  COALESCE((SELECT MAX(evidence_id) FROM ncs_answer_evaluation_evidences), 1), true);
SELECT setval(pg_get_serial_sequence('ai_process_logs', 'process_log_id'),
  COALESCE((SELECT MAX(process_log_id) FROM ai_process_logs), 1), true);
SELECT setval(pg_get_serial_sequence('ai_guardrail_logs', 'guardrail_log_id'),
  COALESCE((SELECT MAX(guardrail_log_id) FROM ai_guardrail_logs), 1), true);

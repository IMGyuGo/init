-- Disposable PostgreSQL fixture for verifying the NE-M1 forward-only backfill.
-- Apply after migrations through 20260714200000 and before 20260714220000.

BEGIN;

INSERT INTO "users" (
  "user_id", "email", "user_type", "name", "status", "auth_provider", "created_at", "updated_at"
) VALUES
  (1, 'm1.company@example.com', 'COMPANY', 'M1 Company', 'ACTIVE', 'LOCAL', NOW(), NOW()),
  (2, 'm1.candidate@example.com', 'CANDIDATE', 'M1 Candidate', 'ACTIVE', 'LOCAL', NOW(), NOW());

INSERT INTO "companies" (
  "company_id", "owner_user_id", "name", "business_registration_number",
  "verification_status", "created_at", "updated_at"
) VALUES (1, 1, 'M1 Company', '1234567890', 'VERIFIED', NOW(), NOW());

INSERT INTO "candidate_profiles" ("candidate_id", "user_id", "created_at", "updated_at")
VALUES (1, 2, NOW(), NOW());

INSERT INTO "criterion_tags" (
  "tag_id", "job_role", "name", "category", "is_active", "sort_order",
  "ncs_profile_id", "default_ncs_question_mode", "ncs_profile_version"
) VALUES (1, 'Common', '기술 직무', 'NCS', TRUE, 1, 'DIGITAL', 'TECHNICAL_KNOWLEDGE', '2025.12-v1');

INSERT INTO "postings" (
  "posting_id", "company_id", "title", "job_role", "status", "created_at", "updated_at"
) VALUES (1, 1, 'M1 Legacy Posting', 'Backend', 'DRAFT', NOW(), NOW());

INSERT INTO "evaluation_criteria" (
  "criterion_id", "posting_id", "tag_id", "weight", "sort_order",
  "ncs_profile_id", "ncs_question_mode", "ncs_profile_version"
) VALUES (1, 1, 1, 100, 1, 'DIGITAL', 'TECHNICAL_KNOWLEDGE', '2025.12-v1');

INSERT INTO "question_bank" (
  "question_id", "company_id", "posting_id", "criterion_id", "question_type", "content",
  "origin", "is_ai_edited", "is_active", "generation_source", "ncs_profile_id",
  "ncs_question_mode", "ncs_profile_version", "alignment_status", "alignment_score"
) VALUES (
  1, 1, 1, 1, 'TECHNICAL', '기술 선택 근거를 설명해주세요.',
  'AI_GENERATED', FALSE, TRUE, 'JD_CRITERIA', 'DIGITAL',
  'TECHNICAL_KNOWLEDGE', '2025.12-v1', 'ALIGNED', 0.950000
);

INSERT INTO "applications" ("application_id", "posting_id", "candidate_id", "updated_at")
VALUES (1, 1, 1, NOW());

INSERT INTO "ai_process_logs" (
  "process_log_id", "application_id", "process_type", "status", "created_at"
) VALUES (1, 1, 'RESUME_QUESTION_GENERATE', 'COMPLETED', NOW());

INSERT INTO "application_interview_question_batches" (
  "batch_id", "application_id", "latest_process_log_id", "status", "policy_version",
  "criteria_version", "input_version", "resume_document_hash", "jd_snapshot_hash",
  "attempt_count", "created_at", "updated_at"
) VALUES (1, 1, 1, 'READY', 1, 1, 'v1', 'resume-hash', 'jd-hash', 1, NOW(), NOW());

INSERT INTO "application_interview_questions" (
  "personalized_question_id", "batch_id", "criterion_id", "source_process_log_id",
  "criterion_title_snapshot", "source", "question_type", "content", "ncs_profile_id",
  "ncs_question_mode", "ncs_profile_version", "alignment_status", "alignment_score",
  "sort_order", "created_at"
) VALUES (
  1, 1, 1, 1, '협업 의사소통', 'RESUME_PERSONALIZED', 'EXPERIENCE',
  '갈등 조정 경험을 설명해주세요.', 'COMMUNICATION', 'EXPERIENCE_BEHAVIOR',
  '2025.12-v1', 'ALIGNED', 0.910000, 1, NOW()
);

INSERT INTO "interview_sessions" (
  "session_id", "application_id", "candidate_id", "interview_type", "status", "show_question_text"
) VALUES (1, 1, 1, 'RECRUITING', 'READY', TRUE);

INSERT INTO "interview_session_questions" (
  "session_question_id", "session_id", "question_id", "runtime_question_id", "criterion_id",
  "criterion_title_snapshot", "generation_source", "question_type", "content", "ncs_profile_id",
  "ncs_question_mode", "ncs_profile_version", "alignment_status", "alignment_score",
  "policy_version", "criteria_version", "sort_order", "created_at"
) VALUES
  (
    1, 1, 1, 1001, 1, '기술 직무', 'JD_CRITERIA', 'TECHNICAL',
    '기술 선택 근거를 설명해주세요.', 'DIGITAL', 'TECHNICAL_KNOWLEDGE',
    '2025.12-v1', 'ALIGNED', 0.950000, 1, 1, 1, NOW()
  ),
  (
    2, 1, NULL, 1002, 1, '협업 의사소통', 'RESUME_PERSONALIZED', 'EXPERIENCE',
    '갈등 조정 경험을 설명해주세요.', 'COMMUNICATION', 'EXPERIENCE_BEHAVIOR',
    '2025.12-v1', 'ALIGNED', 0.910000, 1, 1, 2, NOW()
  );

INSERT INTO "interview_answers" (
  "answer_id", "session_id", "question_id", "session_question_id", "transcript", "submitted_at"
) VALUES (1, 1, 1, 1, '로그와 지표를 비교해 원인을 확인했습니다.', NOW());

INSERT INTO "evaluation_reports" (
  "report_id", "application_id", "session_id", "report_type", "status", "generated_at"
) VALUES (1, 1, 1, 'RECRUITING_REPORT', 'COMPLETED', NOW());

INSERT INTO "ncs_answer_evaluations" (
  "ncs_evaluation_id", "report_id", "answer_id", "session_question_id", "criterion_id",
  "criterion_title_snapshot", "ncs_profile_id", "ncs_question_mode", "ncs_profile_version",
  "score_status", "competency_score", "evidence_score", "total_score", "coverage", "confidence",
  "rubric_version", "prompt_version", "provider_mode", "result_json", "created_at", "updated_at"
) VALUES (
  1, 1, 1, 1, 1, '기술 직무', 'DIGITAL', 'TECHNICAL_KNOWLEDGE', '2025.12-v1',
  'SCORED', 80, 80, 80, 0.800000, 'HIGH', 'legacy-v1', 'legacy-v1', 'mock', '{}'::jsonb,
  NOW(), NOW()
);

COMMIT;

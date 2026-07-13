ALTER TABLE "criterion_tags"
ADD COLUMN "ncs_profile_id" VARCHAR(50),
ADD COLUMN "default_ncs_question_mode" VARCHAR(50),
ADD COLUMN "ncs_profile_version" VARCHAR(80);

ALTER TABLE "evaluation_criteria"
ADD COLUMN "ncs_profile_id" VARCHAR(50),
ADD COLUMN "ncs_question_mode" VARCHAR(50),
ADD COLUMN "ncs_profile_version" VARCHAR(80);

CREATE TABLE "interview_question_generation_policies" (
    "posting_id" BIGINT NOT NULL,
    "evaluation_framework" VARCHAR(50) NOT NULL DEFAULT 'LEGACY',
    "jd_criteria_question_count" INTEGER NOT NULL DEFAULT 0,
    "resume_question_count" INTEGER NOT NULL DEFAULT 0,
    "policy_version" INTEGER NOT NULL DEFAULT 0,
    "criteria_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_question_generation_policies_pkey" PRIMARY KEY ("posting_id"),
    CONSTRAINT "ck_interview_question_generation_policy_framework"
      CHECK ("evaluation_framework" IN ('LEGACY', 'NCS_3_PROFILE_V1')),
    CONSTRAINT "ck_interview_question_generation_policy_counts"
      CHECK (
        "jd_criteria_question_count" BETWEEN 0 AND 20
        AND "resume_question_count" BETWEEN 0 AND 20
        AND "jd_criteria_question_count" + "resume_question_count" BETWEEN 0 AND 20
      ),
    CONSTRAINT "ck_interview_question_generation_policy_versions"
      CHECK ("policy_version" >= 0 AND "criteria_version" >= 0)
);

ALTER TABLE "interview_question_generation_policies"
ADD CONSTRAINT "interview_question_generation_policies_posting_id_fkey"
FOREIGN KEY ("posting_id") REFERENCES "postings"("posting_id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "criterion_tags"
SET
  "ncs_profile_id" = CASE "tag_id"
    WHEN 2 THEN 'PROBLEM_SOLVING'
    WHEN 4 THEN 'COMMUNICATION'
    WHEN 1 THEN 'DIGITAL'
  END,
  "default_ncs_question_mode" = CASE "tag_id"
    WHEN 2 THEN 'EXPERIENCE_BEHAVIOR'
    WHEN 4 THEN 'EXPERIENCE_BEHAVIOR'
    WHEN 1 THEN 'TECHNICAL_KNOWLEDGE'
  END,
  "ncs_profile_version" = 'NCS_3_PROFILE_V1'
WHERE "tag_id" IN (1, 2, 4);

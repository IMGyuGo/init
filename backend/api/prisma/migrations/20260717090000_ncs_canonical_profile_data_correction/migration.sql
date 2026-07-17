BEGIN;

-- Production deploys run `prisma migrate deploy` without the development seed.
-- Keep the three service-owned NCS tags available on both existing and fresh databases.
INSERT INTO "criterion_tags" (
  "tag_id", "job_role", "name", "description", "category", "is_active", "sort_order",
  "ncs_profile_id", "default_ncs_question_mode", "ncs_profile_version"
)
VALUES
  (
    1, 'Common', '직무/기술 역량',
    'JD와 연결되는 기술 지식, 구현 경험, 설계 판단을 답변 근거로 확인한다.',
    '서비스 기본 평가', TRUE, 1,
    'JOB_TECHNICAL', 'TECHNICAL_KNOWLEDGE', '2025.12-v1'
  ),
  (
    2, 'Common', '문제 해결력',
    '문제 원인을 나누어 확인하고 제약, 대안, 해결 과정을 설명하는지 확인한다.',
    '서비스 기본 평가', TRUE, 2,
    'PROBLEM_SOLVING', 'EXPERIENCE_BEHAVIOR', '2025.12-v1'
  ),
  (
    4, 'Common', '협업/커뮤니케이션',
    '상황, 역할, 의사소통 방식, 협업 조정 과정을 구조적으로 전달하는지 확인한다.',
    '서비스 기본 평가', TRUE, 4,
    'COLLABORATION_COMMUNICATION', 'EXPERIENCE_BEHAVIOR', '2025.12-v1'
  )
ON CONFLICT ("tag_id") DO UPDATE
SET
  "is_active" = TRUE,
  "ncs_profile_id" = EXCLUDED."ncs_profile_id",
  "default_ncs_question_mode" = EXCLUDED."default_ncs_question_mode",
  "ncs_profile_version" = EXCLUDED."ncs_profile_version";

-- Explicit system IDs must not leave the BIGSERIAL sequence behind on a fresh database.
SELECT setval(
  pg_get_serial_sequence('"criterion_tags"', 'tag_id'),
  GREATEST(
    (SELECT COALESCE(MAX("tag_id"), 1) FROM "criterion_tags"),
    (SELECT "last_value" FROM "criterion_tags_tag_id_seq")
  ),
  TRUE
);

-- Only NCS-policy postings inherit the canonical profile contract from their tag.
-- LEGACY postings retain nullable NCS metadata.
UPDATE "evaluation_criteria" AS ec
SET
  "ncs_profile_id" = CASE ec."tag_id"
    WHEN 1 THEN 'JOB_TECHNICAL'
    WHEN 2 THEN 'PROBLEM_SOLVING'
    WHEN 4 THEN 'COLLABORATION_COMMUNICATION'
  END,
  "ncs_question_mode" = CASE ec."tag_id"
    WHEN 1 THEN 'TECHNICAL_KNOWLEDGE'
    WHEN 2 THEN 'EXPERIENCE_BEHAVIOR'
    WHEN 4 THEN 'EXPERIENCE_BEHAVIOR'
  END,
  "ncs_profile_version" = '2025.12-v1'
FROM "interview_question_generation_policies" AS policy
WHERE policy."posting_id" = ec."posting_id"
  AND policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
  AND ec."tag_id" IN (1, 2, 4)
  AND ROW(ec."ncs_profile_id", ec."ncs_question_mode", ec."ncs_profile_version")
    IS DISTINCT FROM ROW(
      CASE ec."tag_id"
        WHEN 1 THEN 'JOB_TECHNICAL'
        WHEN 2 THEN 'PROBLEM_SOLVING'
        WHEN 4 THEN 'COLLABORATION_COMMUNICATION'
      END,
      CASE ec."tag_id"
        WHEN 1 THEN 'TECHNICAL_KNOWLEDGE'
        WHEN 2 THEN 'EXPERIENCE_BEHAVIOR'
        WHEN 4 THEN 'EXPERIENCE_BEHAVIOR'
      END,
      '2025.12-v1'
    );

-- Normalize legacy profile IDs wherever a persisted question snapshot still carries them.
UPDATE "question_bank"
SET
  "ncs_profile_id" = CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
    WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
  END,
  "ncs_question_mode" = CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'TECHNICAL_KNOWLEDGE'
    WHEN 'COMMUNICATION' THEN 'EXPERIENCE_BEHAVIOR'
  END,
  "ncs_profile_version" = '2025.12-v1'
WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION');

UPDATE "application_interview_questions"
SET
  "ncs_profile_id" = CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
    WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
  END,
  "ncs_question_mode" = CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'TECHNICAL_KNOWLEDGE'
    WHEN 'COMMUNICATION' THEN 'EXPERIENCE_BEHAVIOR'
  END,
  "ncs_profile_version" = '2025.12-v1'
WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION');

UPDATE "interview_session_questions"
SET
  "ncs_profile_id" = CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'
    WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'
  END,
  "ncs_question_mode" = CASE "ncs_profile_id"
    WHEN 'DIGITAL' THEN 'TECHNICAL_KNOWLEDGE'
    WHEN 'COMMUNICATION' THEN 'EXPERIENCE_BEHAVIOR'
  END,
  "ncs_profile_version" = '2025.12-v1'
WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION');

-- For NCS-policy postings, singular compatibility columns follow the linked criterion.
UPDATE "question_bank" AS question
SET
  "ncs_profile_id" = criterion."ncs_profile_id",
  "ncs_question_mode" = criterion."ncs_question_mode",
  "ncs_profile_version" = criterion."ncs_profile_version"
FROM "evaluation_criteria" AS criterion
JOIN "interview_question_generation_policies" AS policy
  ON policy."posting_id" = criterion."posting_id"
WHERE question."criterion_id" = criterion."criterion_id"
  AND policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
  AND question."ncs_profile_id" IS NOT NULL
  AND ROW(question."ncs_profile_id", question."ncs_question_mode", question."ncs_profile_version")
    IS DISTINCT FROM ROW(
      criterion."ncs_profile_id",
      criterion."ncs_question_mode",
      criterion."ncs_profile_version"
    );

UPDATE "application_interview_questions" AS question
SET
  "ncs_profile_id" = criterion."ncs_profile_id",
  "ncs_question_mode" = criterion."ncs_question_mode",
  "ncs_profile_version" = criterion."ncs_profile_version"
FROM "evaluation_criteria" AS criterion
JOIN "interview_question_generation_policies" AS policy
  ON policy."posting_id" = criterion."posting_id"
WHERE question."criterion_id" = criterion."criterion_id"
  AND policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
  AND ROW(question."ncs_profile_id", question."ncs_question_mode", question."ncs_profile_version")
    IS DISTINCT FROM ROW(
      criterion."ncs_profile_id",
      criterion."ncs_question_mode",
      criterion."ncs_profile_version"
    );

UPDATE "interview_session_questions" AS question
SET
  "ncs_profile_id" = criterion."ncs_profile_id",
  "ncs_question_mode" = criterion."ncs_question_mode",
  "ncs_profile_version" = criterion."ncs_profile_version"
FROM "evaluation_criteria" AS criterion
JOIN "interview_question_generation_policies" AS policy
  ON policy."posting_id" = criterion."posting_id"
WHERE question."criterion_id" = criterion."criterion_id"
  AND policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
  AND question."ncs_profile_id" IS NOT NULL
  AND ROW(question."ncs_profile_id", question."ncs_question_mode", question."ncs_profile_version")
    IS DISTINCT FROM ROW(
      criterion."ncs_profile_id",
      criterion."ncs_question_mode",
      criterion."ncs_profile_version"
    );

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "criterion_tags"
    WHERE "is_active" = TRUE
      AND "ncs_profile_id" IS NOT NULL
  ) <> 3
  OR EXISTS (
    SELECT expected."ncs_profile_id"
    FROM (
      VALUES
        ('JOB_TECHNICAL'),
        ('PROBLEM_SOLVING'),
        ('COLLABORATION_COMMUNICATION')
    ) AS expected("ncs_profile_id")
    LEFT JOIN "criterion_tags" AS tag
      ON tag."is_active" = TRUE
      AND tag."ncs_profile_id" = expected."ncs_profile_id"
    GROUP BY expected."ncs_profile_id"
    HAVING COUNT(tag."tag_id") <> 1
  ) THEN
    RAISE EXCEPTION 'active NCS criterion tags must contain each canonical profile exactly once';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (1::BIGINT, 'JOB_TECHNICAL', 'TECHNICAL_KNOWLEDGE', '2025.12-v1'),
        (2::BIGINT, 'PROBLEM_SOLVING', 'EXPERIENCE_BEHAVIOR', '2025.12-v1'),
        (4::BIGINT, 'COLLABORATION_COMMUNICATION', 'EXPERIENCE_BEHAVIOR', '2025.12-v1')
    ) AS expected("tag_id", "ncs_profile_id", "ncs_question_mode", "ncs_profile_version")
    LEFT JOIN "criterion_tags" AS tag ON tag."tag_id" = expected."tag_id"
    WHERE ROW(
      tag."ncs_profile_id",
      tag."default_ncs_question_mode",
      tag."ncs_profile_version"
    ) IS DISTINCT FROM ROW(
      expected."ncs_profile_id",
      expected."ncs_question_mode",
      expected."ncs_profile_version"
    )
  ) THEN
    RAISE EXCEPTION 'canonical NCS criterion tag metadata is inconsistent';
  END IF;

  IF EXISTS (
    SELECT policy."posting_id"
    FROM "interview_question_generation_policies" AS policy
    LEFT JOIN "evaluation_criteria" AS criterion
      ON criterion."posting_id" = policy."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
    GROUP BY policy."posting_id"
    HAVING COUNT(criterion."criterion_id") <> 3
      OR COUNT(*) FILTER (WHERE criterion."ncs_profile_id" = 'JOB_TECHNICAL') <> 1
      OR COUNT(*) FILTER (WHERE criterion."ncs_profile_id" = 'PROBLEM_SOLVING') <> 1
      OR COUNT(*) FILTER (WHERE criterion."ncs_profile_id" = 'COLLABORATION_COMMUNICATION') <> 1
      OR COUNT(*) FILTER (WHERE criterion."ncs_profile_version" = '2025.12-v1') <> 3
      OR COUNT(*) FILTER (
        WHERE criterion."ncs_profile_id" = 'JOB_TECHNICAL'
          AND criterion."ncs_question_mode" = 'TECHNICAL_KNOWLEDGE'
      ) <> 1
      OR COUNT(*) FILTER (
        WHERE criterion."ncs_profile_id" IN ('PROBLEM_SOLVING', 'COLLABORATION_COMMUNICATION')
          AND criterion."ncs_question_mode" = 'EXPERIENCE_BEHAVIOR'
      ) <> 2
  ) THEN
    RAISE EXCEPTION 'NCS_3_PROFILE_V1 posting criteria do not match the canonical three-profile contract';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "criterion_tags"
    WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION')
  ) OR EXISTS (
    SELECT 1
    FROM "evaluation_criteria" AS criterion
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND criterion."ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION')
  ) OR EXISTS (
    SELECT 1 FROM "question_bank"
    WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION')
  ) OR EXISTS (
    SELECT 1 FROM "application_interview_questions"
    WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION')
  ) OR EXISTS (
    SELECT 1 FROM "interview_session_questions"
    WHERE "ncs_profile_id" IN ('DIGITAL', 'COMMUNICATION')
  ) THEN
    RAISE EXCEPTION 'legacy DIGITAL or COMMUNICATION NCS profile remains in target data';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "question_bank" AS question
    JOIN "evaluation_criteria" AS criterion
      ON criterion."criterion_id" = question."criterion_id"
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND question."ncs_profile_id" IS NOT NULL
      AND ROW(question."ncs_profile_id", question."ncs_question_mode", question."ncs_profile_version")
        IS DISTINCT FROM ROW(
          criterion."ncs_profile_id",
          criterion."ncs_question_mode",
          criterion."ncs_profile_version"
        )
  ) OR EXISTS (
    SELECT 1
    FROM "application_interview_questions" AS question
    JOIN "evaluation_criteria" AS criterion
      ON criterion."criterion_id" = question."criterion_id"
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND ROW(question."ncs_profile_id", question."ncs_question_mode", question."ncs_profile_version")
        IS DISTINCT FROM ROW(
          criterion."ncs_profile_id",
          criterion."ncs_question_mode",
          criterion."ncs_profile_version"
        )
  ) OR EXISTS (
    SELECT 1
    FROM "interview_session_questions" AS question
    JOIN "evaluation_criteria" AS criterion
      ON criterion."criterion_id" = question."criterion_id"
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND question."ncs_profile_id" IS NOT NULL
      AND ROW(question."ncs_profile_id", question."ncs_question_mode", question."ncs_profile_version")
        IS DISTINCT FROM ROW(
          criterion."ncs_profile_id",
          criterion."ncs_question_mode",
          criterion."ncs_profile_version"
        )
  ) THEN
    RAISE EXCEPTION 'NCS question compatibility metadata does not match its criterion';
  END IF;

  -- These tables were canonicalized by the NE-M1 migration. Verify only; do not rewrite them.
  IF EXISTS (
    SELECT 1 FROM "question_ncs_bindings"
    WHERE "ncs_profile_id" NOT IN (
      'JOB_TECHNICAL', 'PROBLEM_SOLVING', 'COLLABORATION_COMMUNICATION'
    )
  ) OR EXISTS (
    SELECT 1 FROM "application_question_ncs_bindings"
    WHERE "ncs_profile_id" NOT IN (
      'JOB_TECHNICAL', 'PROBLEM_SOLVING', 'COLLABORATION_COMMUNICATION'
    )
  ) OR EXISTS (
    SELECT 1 FROM "session_question_ncs_bindings"
    WHERE "ncs_profile_id" NOT IN (
      'JOB_TECHNICAL', 'PROBLEM_SOLVING', 'COLLABORATION_COMMUNICATION'
    )
  ) THEN
    RAISE EXCEPTION 'legacy or unsupported profile remains in an NCS binding table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "question_ncs_bindings" AS binding
    JOIN "evaluation_criteria" AS criterion
      ON criterion."criterion_id" = binding."criterion_id"
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND (
        binding."ncs_profile_id" IS DISTINCT FROM criterion."ncs_profile_id"
        OR binding."ncs_profile_version" IS DISTINCT FROM criterion."ncs_profile_version"
      )
  ) OR EXISTS (
    SELECT 1
    FROM "application_question_ncs_bindings" AS binding
    JOIN "evaluation_criteria" AS criterion
      ON criterion."criterion_id" = binding."criterion_id"
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND (
        binding."ncs_profile_id" IS DISTINCT FROM criterion."ncs_profile_id"
        OR binding."ncs_profile_version" IS DISTINCT FROM criterion."ncs_profile_version"
      )
  ) OR EXISTS (
    SELECT 1
    FROM "session_question_ncs_bindings" AS binding
    JOIN "evaluation_criteria" AS criterion
      ON criterion."criterion_id" = binding."criterion_id"
    JOIN "interview_question_generation_policies" AS policy
      ON policy."posting_id" = criterion."posting_id"
    WHERE policy."evaluation_framework" = 'NCS_3_PROFILE_V1'
      AND (
        binding."ncs_profile_id" IS DISTINCT FROM criterion."ncs_profile_id"
        OR binding."ncs_profile_version" IS DISTINCT FROM criterion."ncs_profile_version"
      )
  ) THEN
    RAISE EXCEPTION 'canonical NCS binding metadata does not match its criterion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "question_bank" AS question
    LEFT JOIN "question_ncs_bindings" AS binding
      ON binding."question_id" = question."question_id"
      AND binding."binding_order" = 1
    WHERE question."ncs_profile_id" IS NOT NULL
      AND (
        binding."question_id" IS NULL
        OR binding."criterion_id" IS DISTINCT FROM question."criterion_id"
        OR binding."ncs_profile_id" IS DISTINCT FROM question."ncs_profile_id"
        OR binding."ncs_profile_version" IS DISTINCT FROM question."ncs_profile_version"
      )
  ) OR EXISTS (
    SELECT 1
    FROM "application_interview_questions" AS question
    LEFT JOIN "application_question_ncs_bindings" AS binding
      ON binding."personalized_question_id" = question."personalized_question_id"
      AND binding."binding_order" = 1
    WHERE binding."personalized_question_id" IS NULL
      OR binding."criterion_id" IS DISTINCT FROM question."criterion_id"
      OR binding."ncs_profile_id" IS DISTINCT FROM question."ncs_profile_id"
      OR binding."ncs_profile_version" IS DISTINCT FROM question."ncs_profile_version"
  ) OR EXISTS (
    SELECT 1
    FROM "interview_session_questions" AS question
    LEFT JOIN "session_question_ncs_bindings" AS binding
      ON binding."session_question_id" = question."session_question_id"
      AND binding."binding_order" = 1
    WHERE question."ncs_profile_id" IS NOT NULL
      AND (
        binding."session_question_id" IS NULL
        OR binding."criterion_id" IS DISTINCT FROM question."criterion_id"
        OR binding."ncs_profile_id" IS DISTINCT FROM question."ncs_profile_id"
        OR binding."ncs_profile_version" IS DISTINCT FROM question."ncs_profile_version"
      )
  ) THEN
    RAISE EXCEPTION 'primary NCS binding does not match its question compatibility metadata';
  END IF;
END $$;

COMMIT;

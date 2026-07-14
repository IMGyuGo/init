CREATE TYPE "CandidateEducationLevel" AS ENUM ('HIGH_SCHOOL', 'COLLEGE', 'UNIVERSITY', 'GRADUATE_SCHOOL', 'OTHER');
CREATE TYPE "CandidateDegreeType" AS ENUM ('HIGH_SCHOOL_DIPLOMA', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER');
CREATE TYPE "CandidateEducationStatus" AS ENUM ('ENROLLED', 'LEAVE_OF_ABSENCE', 'GRADUATED', 'EXPECTED_GRADUATION', 'COMPLETED', 'WITHDRAWN');
CREATE TYPE "CandidateActivityType" AS ENUM ('SCHOOL_ACTIVITY', 'INTERNSHIP', 'CLUB', 'PROJECT_TASK', 'OVERSEAS_TRAINING', 'EDUCATION');
CREATE TYPE "CandidateCredentialType" AS ENUM ('CERTIFICATE', 'LANGUAGE_TEST', 'AWARD');

CREATE TABLE "candidate_educations" (
  "education_id" BIGSERIAL PRIMARY KEY,
  "candidate_id" BIGINT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "education_level" "CandidateEducationLevel" NOT NULL,
  "school_name" VARCHAR(150) NOT NULL,
  "major" VARCHAR(150),
  "degree_type" "CandidateDegreeType" NOT NULL,
  "status" "CandidateEducationStatus" NOT NULL,
  "start_month" DATE NOT NULL,
  "end_month" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "uk_candidate_educations_order" UNIQUE ("candidate_id", "sort_order"),
  CONSTRAINT "candidate_educations_sort_order_check" CHECK ("sort_order" > 0),
  CONSTRAINT "candidate_educations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_educations_end_month_check" CHECK (
    (("status" IN ('ENROLLED', 'LEAVE_OF_ABSENCE')) AND "end_month" IS NULL)
    OR (("status" NOT IN ('ENROLLED', 'LEAVE_OF_ABSENCE')) AND "end_month" IS NOT NULL AND "start_month" <= "end_month")
  ),
  CONSTRAINT "candidate_educations_degree_check" CHECK (
    ("education_level" = 'HIGH_SCHOOL' AND "degree_type" IN ('HIGH_SCHOOL_DIPLOMA', 'OTHER'))
    OR ("education_level" = 'COLLEGE' AND "degree_type" IN ('ASSOCIATE', 'OTHER'))
    OR ("education_level" = 'UNIVERSITY' AND "degree_type" IN ('BACHELOR', 'OTHER'))
    OR ("education_level" = 'GRADUATE_SCHOOL' AND "degree_type" IN ('MASTER', 'DOCTORATE', 'OTHER'))
    OR ("education_level" = 'OTHER' AND "degree_type" = 'OTHER')
  )
);

CREATE TABLE "candidate_careers" (
  "career_id" BIGSERIAL PRIMARY KEY,
  "candidate_id" BIGINT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "company_name" VARCHAR(150) NOT NULL,
  "start_month" DATE NOT NULL,
  "end_month" DATE,
  "is_current" BOOLEAN NOT NULL,
  "job_role" VARCHAR(100) NOT NULL,
  "department" VARCHAR(100),
  "position" VARCHAR(100),
  "responsibilities" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "uk_candidate_careers_order" UNIQUE ("candidate_id", "sort_order"),
  CONSTRAINT "candidate_careers_sort_order_check" CHECK ("sort_order" > 0),
  CONSTRAINT "candidate_careers_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_careers_period_check" CHECK (
    ("is_current" AND "end_month" IS NULL)
    OR (NOT "is_current" AND "end_month" IS NOT NULL AND "start_month" <= "end_month")
  )
);

CREATE TABLE "candidate_activities" (
  "activity_id" BIGSERIAL PRIMARY KEY,
  "candidate_id" BIGINT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "activity_type" "CandidateActivityType" NOT NULL,
  "organization_name" VARCHAR(150) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "is_ongoing" BOOLEAN NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "uk_candidate_activities_order" UNIQUE ("candidate_id", "sort_order"),
  CONSTRAINT "candidate_activities_sort_order_check" CHECK ("sort_order" > 0),
  CONSTRAINT "candidate_activities_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_activities_period_check" CHECK (
    ("is_ongoing" AND "end_date" IS NULL)
    OR (NOT "is_ongoing" AND "end_date" IS NOT NULL AND "start_date" <= "end_date")
  )
);

CREATE TABLE "candidate_credentials" (
  "credential_id" BIGSERIAL PRIMARY KEY,
  "candidate_id" BIGINT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "credential_type" "CandidateCredentialType" NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "issuer" VARCHAR(150) NOT NULL,
  "acquired_month" DATE NOT NULL,
  "result" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "uk_candidate_credentials_order" UNIQUE ("candidate_id", "sort_order"),
  CONSTRAINT "candidate_credentials_sort_order_check" CHECK ("sort_order" > 0),
  CONSTRAINT "candidate_credentials_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("candidate_id") ON DELETE CASCADE ON UPDATE CASCADE
);

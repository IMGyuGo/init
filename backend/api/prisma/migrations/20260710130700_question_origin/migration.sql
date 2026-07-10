CREATE TYPE "QuestionOrigin" AS ENUM ('MANUAL', 'AI_GENERATED');

ALTER TABLE "question_bank"
ADD COLUMN "origin" "QuestionOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "is_ai_edited" BOOLEAN NOT NULL DEFAULT false;

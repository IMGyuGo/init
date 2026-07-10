ALTER TABLE "evaluation_criteria"
ADD COLUMN "description" TEXT;

UPDATE "evaluation_criteria" AS ec
SET "description" = ct."description"
FROM "criterion_tags" AS ct
WHERE ec."tag_id" = ct."tag_id";

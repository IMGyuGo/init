import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = read("backend/api/prisma/schema.prisma");
const migrationPath = "backend/api/prisma/migrations/20260714220000_ncs_final_evaluation_schema_expand/migration.sql";
const migration = read(migrationPath);
const dataModel = read("docs/02_architecture/data-model.md");
const erd = read("docs/02_architecture/erdcloud/init_erd_v0.5_refined_erdcloud.sql");
const workerRepository = read("backend/worker/src/prisma-ai-result.repository.ts");
const legacyFixture = read("scripts/fixtures/ncs-evaluation-m1-legacy.sql");

for (const model of [
  "QuestionNcsBinding",
  "ApplicationQuestionNcsBinding",
  "SessionQuestionNcsBinding",
  "NcsAnswerEvaluationEvidence",
]) {
  requireText(schema, `model ${model} {`, `Prisma model ${model}`);
}

for (const table of [
  "question_ncs_bindings",
  "application_question_ncs_bindings",
  "session_question_ncs_bindings",
  "ncs_answer_evaluation_evidences",
]) {
  requireText(migration, `CREATE TABLE \"${table}\"`, `migration table ${table}`);
  requireText(dataModel, `\`${table}\``, `data-model table ${table}`);
  requireText(erd, `CREATE TABLE ${table}`, `ERDCloud table ${table}`);
}

for (const canonicalProfile of [
  "JOB_TECHNICAL",
  "COLLABORATION_COMMUNICATION",
  "PROBLEM_SOLVING",
]) {
  requireText(migration, canonicalProfile, `canonical profile ${canonicalProfile}`);
}

for (const mapping of [
  "WHEN 'DIGITAL' THEN 'JOB_TECHNICAL'",
  "WHEN 'COMMUNICATION' THEN 'COLLABORATION_COMMUNICATION'",
]) {
  requireText(migration, mapping, `legacy mapping ${mapping}`);
}

for (const invariant of [
  "uq_ncs_answer_evaluations_report_answer_profile",
  "ck_ncs_answer_evaluations_legacy_score_shape",
  "ck_ncs_answer_evaluations_ncs_score_shape",
  'DROP CONSTRAINT "ck_ncs_answer_evaluations_score_shape"',
  "ck_ncs_answer_evaluation_evidences_source_kind",
  "question_ncs_bindings backfill count mismatch",
  "application_question_ncs_bindings backfill count mismatch",
  "session_question_ncs_bindings backfill count mismatch",
]) {
  requireText(migration, invariant, `migration invariant ${invariant}`);
}

for (const scoreField of [
  "behaviorPoints",
  "logicPoints",
  "baseScore",
  "effectiveScore",
  "followUpApplied",
]) {
  requireText(schema, scoreField, `Prisma evaluation field ${scoreField}`);
}

requireText(
  schema,
  '@@unique([reportId, answerId, ncsProfileId], map: "uq_ncs_answer_evaluations_report_answer_profile")',
  "profile evaluation unique key",
);
requireText(workerRepository, "canonicalNcsProfileId(evaluation.ncsProfileId)", "canonical persistence adapter");
for (const fixtureSource of [
  'INSERT INTO "question_bank"',
  'INSERT INTO "application_interview_questions"',
  'INSERT INTO "interview_session_questions"',
  'INSERT INTO "ncs_answer_evaluations"',
]) {
  requireText(legacyFixture, fixtureSource, `legacy fixture source ${fixtureSource}`);
}

if (/DROP\s+COLUMN\s+"?(ncs_profile_id|ncs_question_mode|ncs_profile_version)"?/i.test(migration)) {
  fail("NE-M1 must not remove singular compatibility columns");
}

if (!/model ReportScore \{[\s\S]*?\n\s+score\s+Int\?/m.test(schema)) {
  fail("ReportScore.score must be nullable so INCOMPLETE is not stored as zero");
}

const migrationDirectories = fs
  .readdirSync(path.join(root, "backend/api/prisma/migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (migrationDirectories.at(-1) !== "20260714220000_ncs_final_evaluation_schema_expand") {
  fail("NE-M1 migration must remain the latest ordered migration");
}

const doBlockOpenCount = (migration.match(/DO \$\$/g) ?? []).length;
const doBlockCloseCount = (migration.match(/END \$\$;/g) ?? []).length;
if (doBlockOpenCount !== doBlockCloseCount) {
  fail(`unbalanced PostgreSQL DO blocks: ${doBlockOpenCount} open, ${doBlockCloseCount} close`);
}

console.log("[ok] verify-ncs-evaluation-m1 passed");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireText(text, expected, label) {
  if (!text.includes(expected)) fail(`missing ${label}`);
}

function fail(message) {
  console.error(`[fail] ${message}`);
  process.exit(1);
}

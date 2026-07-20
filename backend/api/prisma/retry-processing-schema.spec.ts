import { readFileSync } from "fs";
import { join } from "path";

describe("issue #397 retry persistence contract", () => {
  const prismaRoot = __dirname;
  const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
  const migration = readFileSync(
    join(prismaRoot, "migrations/20260720170000_retry_processing/migration.sql"),
    "utf8",
  );
  const erd = readFileSync(
    join(prismaRoot, "../../../docs/02_architecture/erdcloud/init_erd_v0.5_refined_erdcloud.sql"),
    "utf8",
  );

  it("stores attempt, backoff and explicit retry audit fields", () => {
    expect(schema).toMatch(/enum AiRetrySource\s*{[\s\S]*INITIAL[\s\S]*OPERATOR[\s\S]*}/);
    expect(schema).toMatch(/attemptCount\s+Int\s+@default\(1\)/);
    expect(schema).toMatch(/maxAttempts\s+Int\s+@default\(3\)/);
    expect(schema).toMatch(/nextRetryAt\s+DateTime\?/);
    expect(schema).toMatch(/retrySource\s+AiRetrySource\s+@default\(INITIAL\)/);
    expect(schema).toMatch(/retryOfProcessLogId\s+BigInt\?/);
  });

  it("enforces three total attempts and one active report job per application", () => {
    expect(migration).toContain("attempt_count BETWEEN 1 AND 3");
    expect(migration).toContain("max_attempts = 3");
    expect(migration).toContain("CREATE UNIQUE INDEX \"uq_ai_process_logs_active_report_application\"");
    expect(migration).toContain("\"process_type\" = 'REPORT_GENERATE'");
    expect(migration).toContain("\"status\" IN ('PENDING', 'RUNNING')");
    expect(migration).toContain("\"status\" = 'FAILED'");
    expect(migration).toContain("\"attempt_count\" < 3");
    expect(migration).toContain("SET \"next_retry_at\" = CURRENT_TIMESTAMP");
    expect(migration).toContain("\"process_type\" = 'REPORT_GENERATE'");
    expect(migration).toContain("\"input_ref\" IS NOT NULL");
    expect(migration).toContain("SET \"failure_category\" = 'RETRY_EXHAUSTED'");
    expect(migration).toContain("\"failure_category\" IN ('RETRYABLE', 'STT_RETRYABLE')");
  });

  it("places retry columns on ai_process_logs in the ERDCloud SQL", () => {
    const aiProcessLogs = tableBlock(erd, "ai_process_logs");
    const factCheckRuns = tableBlock(erd, "answer_fact_check_runs");

    expect(aiProcessLogs).toContain("attempt_count INTEGER NOT NULL DEFAULT 1");
    expect(aiProcessLogs).toContain("max_attempts INTEGER NOT NULL DEFAULT 3");
    expect(aiProcessLogs).toContain("next_retry_at TIMESTAMP");
    expect(aiProcessLogs).toContain("retry_source VARCHAR(30) NOT NULL DEFAULT 'INITIAL'");
    expect(aiProcessLogs).toContain("retry_of_process_log_id BIGINT");
    expect(factCheckRuns).not.toContain("retry_of_process_log_id");
  });
});

function tableBlock(sql: string, tableName: string): string {
  const match = sql.match(new RegExp(`CREATE TABLE ${tableName} \\(([\\s\\S]*?)\\n\\);`));
  if (!match?.[1]) throw new Error(`Table ${tableName} was not found.`);
  return match[1];
}

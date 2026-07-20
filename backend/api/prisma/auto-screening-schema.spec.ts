import { readFileSync } from "fs";
import { join } from "path";

describe("AUTO_SCREENING_DECISION_V1 persistence contract", () => {
  const prismaRoot = __dirname;
  const repositoryRoot = join(__dirname, "../../..");
  const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");

  it("stores the posting policy and the full application decision snapshot", () => {
    expect(schema).toMatch(/model AutoScreeningPolicy\s*{/);
    expect(schema).toMatch(/autoScreeningPolicy\s+AutoScreeningPolicy\?/);
    expect(schema).toMatch(/screeningDecisionReasonCode\s+ScreeningDecisionReasonCode\?/);
    expect(schema).toMatch(/screeningDecisionPolicyVersion\s+String\?/);
    expect(schema).toMatch(/screeningPolicyVersion\s+Int\?/);
    expect(schema).toMatch(/screeningCriteriaVersion\s+Int\?/);
    expect(schema).toMatch(/screeningDecisionReportId\s+BigInt\?/);
    expect(schema).toMatch(/screeningDecidedAt\s+DateTime\?/);
  });

  it("documents a missing policy as UNDECIDED without inventing thresholds", () => {
    const apiSpec = readFileSync(
      join(repositoryRoot, "docs/03_contracts/api-spec.md"),
      "utf8",
    );
    const decisionContract = readFileSync(
      join(repositoryRoot, "docs/03_contracts/automatic-screening-decision.md"),
      "utf8",
    );

    expect(apiSpec).toContain(
      "자동 판정 정책 row가 없으면 `screeningPolicy=null`을 반환하며 자동 판정은 `UNDECIDED`를 유지한다.",
    );
    expect(apiSpec).not.toContain(
      "정책 row가 없으면 같은 transaction에서 기본 정책 row를 생성",
    );
    expect(decisionContract).toContain("screening_decision_report_id");
    expect(decisionContract).toContain("API 응답에는 노출하지 않는다");
  });

  it("commits the RETRY enum before constraints use the new value", () => {
    const enumMigration = readFileSync(
      join(
        prismaRoot,
        "migrations/20260720090000_auto_screening_engine/migration.sql",
      ),
      "utf8",
    );
    const projectionMigration = readFileSync(
      join(
        prismaRoot,
        "migrations/20260720090100_auto_screening_projection/migration.sql",
      ),
      "utf8",
    );

    expect(enumMigration).toContain(
      'ALTER TYPE "ScreeningDecision" ADD VALUE IF NOT EXISTS \'RETRY\'',
    );
    expect(enumMigration).not.toContain("CREATE TABLE");
    expect(projectionMigration).toContain(
      '"screening_decision" = \'RETRY\'',
    );
  });
});

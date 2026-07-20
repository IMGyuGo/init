import { buildSyntheticApplicantPlanV2, V2_EMAIL_DOMAINS } from "./synthetic-applicant-importer.v2";
import type { SyntheticImporterOptions } from "./synthetic-applicant-importer.contract";

describe("synthetic applicant importer V2", () => {
  const plan = buildSyntheticApplicantPlanV2(options());

  it("builds deterministic identities without synthetic markers", () => {
    expect(buildSyntheticApplicantPlanV2(options())).toEqual(plan);
    expect(plan).toHaveLength(1_050);
    expect(new Set(plan.map((record) => record.email)).size).toBe(1_050);
    expect(plan.every((record) => V2_EMAIL_DOMAINS.some((domain) => record.email.endsWith(`@${domain}`)))).toBe(true);
    expect(plan.every((record) => !/demo|dataset|issue411|\d{5}/i.test(`${record.name} ${record.email}`))).toBe(true);
    expect(new Set(plan.map((record) => record.name)).size).toBeLessThan(plan.length);
    expect(plan.every((record) => /^010-\*{4}-\d{4}$/.test(record.phone))).toBe(true);
  });

  it("keeps the approved stage and depth totals while interleaving the first page", () => {
    const active = plan.filter((record) => !record.isCanceled);
    const counts = countBy(active, (record) => record.lifecycleStage);
    const depths = countBy(active, (record) => record.dataDepth);

    expect(counts).toEqual({
      DOCUMENT_PROCESSING: 350,
      DOCUMENT_REVIEW: 250,
      INTERVIEW_WAITING: 180,
      INTERVIEW_IN_PROGRESS: 100,
      REPORT_COMPLETED: 100,
      FAILED: 20,
    });
    expect(depths).toEqual({ PROFILE: 150, LIGHTWEIGHT: 800, INTERVIEW: 40, REPORT: 10 });
    const firstPageDecisions = active.slice(0, 20).map((record) => record.screeningDecision);
    expect(firstPageDecisions).toContain("PASS");
    expect(firstPageDecisions).toContain("FAIL");
  });

  it("creates one hundred diverse completed reports with a 20/80 decision split", () => {
    const reports = plan.filter((record) => record.lifecycleStage === "REPORT_COMPLETED");
    const pass = reports.filter((record) => record.screeningDecision === "PASS");
    const fail = reports.filter((record) => record.screeningDecision === "FAIL");

    expect(reports).toHaveLength(100);
    expect(pass).toHaveLength(20);
    expect(fail).toHaveLength(80);
    expect(reports.filter((record) => record.screeningDecision === "HOLD")).toHaveLength(0);
    expect(pass.every((record) => between(record.reportFixture?.totalScore, 80, 96))).toBe(true);
    expect(fail.every((record) => between(record.reportFixture?.totalScore, 45, 79))).toBe(true);
    expect(new Set(reports.map((record) => record.reportFixture?.totalScore)).size).toBeGreaterThan(20);
  });

  it("keeps every profile score in range and its weighted sum equal to the total", () => {
    const reports = plan.filter((record) => record.reportFixture !== null);
    expect(reports).toHaveLength(100);
    for (const record of reports) {
      const fixture = record.reportFixture!;
      expect(fixture.profiles).toHaveLength(3);
      expect(fixture.profiles.every((profile) => profile.score >= 0 && profile.score <= 100)).toBe(true);
      const weighted = fixture.profiles.reduce((total, profile) => total + profile.score * profile.weight / 100, 0);
      expect(Math.round(weighted)).toBe(fixture.totalScore);
    }
  });
});

function options(): SyntheticImporterOptions {
  return {
    action: "plan",
    environment: "production",
    companyId: 2n,
    postingId: 36n,
    datasetId: "issue411-production-posting36-realistic-20260721",
    activeCount: 1_000,
    canceledCount: 50,
    interactiveCount: 10,
    pipelineSelectionCount: 0,
    batchSize: 100,
  };
}

function countBy<T>(records: T[], selector: (record: T) => string) {
  return records.reduce<Record<string, number>>((counts, record) => {
    const key = selector(record);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function between(value: number | undefined, minimum: number, maximum: number) {
  return value !== undefined && value >= minimum && value <= maximum;
}

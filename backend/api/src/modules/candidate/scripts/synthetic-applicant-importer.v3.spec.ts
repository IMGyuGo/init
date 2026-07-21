import { V3_GIVEN_NAMES } from "./synthetic-applicant-given-names.v3";
import { buildSyntheticApplicantPlanV3 } from "./synthetic-applicant-importer.v3";
import { V2_EMAIL_DOMAINS } from "./synthetic-applicant-importer.v2";
import type { SyntheticApplicantPlanRecord, SyntheticImporterOptions } from "./synthetic-applicant-importer.contract";

describe("synthetic applicant importer V3", () => {
  it("owns exactly 525 distinct realistic two-syllable given names and ASCII email transliterations", () => {
    expect(V3_GIVEN_NAMES).toHaveLength(525);
    expect(new Set(V3_GIVEN_NAMES.map(([name]) => name)).size).toBe(525);
    expect(new Set(V3_GIVEN_NAMES.map(([, transliteration]) => transliteration)).size).toBe(525);
    expect(V3_GIVEN_NAMES.every(([name, transliteration]) => (
      /^[가-힣]{2}$/.test(name) && /^[a-z]+$/.test(transliteration)
    ))).toBe(true);
  });

  it.each(["issue411-v3-alpha", "issue411-v3-bravo", "issue411-v3-charlie"])(
    "builds deterministic unique identities for dataset %s",
    (datasetId) => {
      const plan = buildSyntheticApplicantPlanV3(options({ datasetId }));
      expect(buildSyntheticApplicantPlanV3(options({ datasetId }))).toEqual(plan);
      expect(plan).toHaveLength(1_050);
      expect(new Set(plan.map((record) => record.name)).size).toBe(1_050);
      expect(new Set(plan.map((record) => record.email)).size).toBe(1_050);
      expect(new Set(plan.map((record) => record.phone)).size).toBe(1_050);
      expect(plan.every((record) => V2_EMAIL_DOMAINS.some((domain) => record.email.endsWith(`@${domain}`)))).toBe(true);
      expect(plan.every((record) => /^010-\*{4}-\d{4}$/.test(record.phone))).toBe(true);

      const byGivenName = groupBy(plan, givenName);
      expect(byGivenName.size).toBe(525);
      for (const records of byGivenName.values()) {
        expect(records).toHaveLength(2);
        expect(new Set(records.map((record) => surname(record))).size).toBe(2);
      }

      for (let start = 0; start <= plan.length - 20; start += 1) {
        expect(new Set(plan.slice(start, start + 20).map(givenName)).size).toBe(20);
      }
      expect(new Set(plan.slice(0, 20).map(surname)).size).toBe(20);
      expect(new Set(plan.slice(0, 20).map(givenName)).size).toBe(20);
    },
  );

  it("changes deterministic identity ordering with datasetId", () => {
    const first = buildSyntheticApplicantPlanV3(options({ datasetId: "issue411-v3-order-a" }));
    const second = buildSyntheticApplicantPlanV3(options({ datasetId: "issue411-v3-order-b" }));
    expect(first.map((record) => record.name)).not.toEqual(second.map((record) => record.name));
  });

  it("keeps the exact V3 lifecycle and data-depth totals", () => {
    const plan = buildSyntheticApplicantPlanV3(options());
    const active = plan.filter((record) => !record.isCanceled);
    expect(countBy(active, (record) => record.lifecycleStage)).toEqual({
      DOCUMENT_PROCESSING: 10,
      DOCUMENT_REVIEW: 10,
      INTERVIEW_WAITING: 30,
      INTERVIEW_IN_PROGRESS: 28,
      REPORT_COMPLETED: 920,
      FAILED: 2,
    });
    expect(countBy(plan.filter((record) => record.isCanceled), (record) => record.lifecycleStage)).toEqual({ CANCELED: 50 });
    expect(countBy(active, (record) => record.dataDepth)).toEqual({
      PROFILE: 150,
      LIGHTWEIGHT: 800,
      INTERVIEW: 40,
      REPORT: 10,
    });
  });

  it("creates 920 completed reports with the exact PASS/FAIL split and score contract", () => {
    const reports = buildSyntheticApplicantPlanV3(options())
      .filter((record) => record.lifecycleStage === "REPORT_COMPLETED");
    const pass = reports.filter((record) => record.screeningDecision === "PASS");
    const fail = reports.filter((record) => record.screeningDecision === "FAIL");

    expect(reports).toHaveLength(920);
    expect(pass).toHaveLength(184);
    expect(fail).toHaveLength(736);
    expect(reports.filter((record) => record.screeningDecision === "HOLD")).toHaveLength(0);
    expect(pass.every((record) => between(record.reportFixture?.totalScore, 80, 96))).toBe(true);
    expect(fail.every((record) => between(record.reportFixture?.totalScore, 45, 79))).toBe(true);
    expect(new Set(reports.map((record) => record.reportFixture?.totalScore)).size).toBeGreaterThan(20);
    for (const record of reports) assertReportFixture(record);
  });

  it.each(["issue411-v3-showcase-a", "issue411-v3-showcase-b"])(
    "keeps PASS and FAIL completed-report showcases on the first page for %s",
    (datasetId) => {
      const firstPage = buildSyntheticApplicantPlanV3(options({ datasetId })).slice(0, 20);
      expect(firstPage.some((record) => record.lifecycleStage === "REPORT_COMPLETED" && record.screeningDecision === "PASS")).toBe(true);
      expect(firstPage.some((record) => record.lifecycleStage === "REPORT_COMPLETED" && record.screeningDecision === "FAIL")).toBe(true);
    },
  );
});

function options(overrides: Partial<SyntheticImporterOptions> = {}): SyntheticImporterOptions {
  return {
    action: "plan",
    environment: "production",
    companyId: 2n,
    postingId: 36n,
    datasetId: "issue411-production-posting36-v3-20260721",
    activeCount: 1_000,
    canceledCount: 50,
    interactiveCount: 10,
    pipelineSelectionCount: 0,
    batchSize: 100,
    ...overrides,
  };
}

function surname(record: SyntheticApplicantPlanRecord) {
  return record.name.slice(0, 1);
}

function givenName(record: SyntheticApplicantPlanRecord) {
  return record.name.slice(1);
}

function countBy<T>(records: T[], selector: (record: T) => string) {
  return records.reduce<Record<string, number>>((counts, record) => {
    const key = selector(record);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function groupBy<T>(records: T[], selector: (record: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const key = selector(record);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  return grouped;
}

function between(value: number | undefined, minimum: number, maximum: number) {
  return value !== undefined && value >= minimum && value <= maximum;
}

function assertReportFixture(record: SyntheticApplicantPlanRecord) {
  expect(record.reportFixture).not.toBeNull();
  const fixture = record.reportFixture!;
  expect(fixture.profiles).toHaveLength(3);
  expect(fixture.profiles.map((profile) => profile.id)).toEqual([
    "JOB_TECHNICAL",
    "COLLABORATION_COMMUNICATION",
    "PROBLEM_SOLVING",
  ]);
  expect(fixture.profiles.every((profile) => profile.score >= 0 && profile.score <= 100)).toBe(true);
  const weighted = fixture.profiles.reduce((total, profile) => total + profile.score * profile.weight / 100, 0);
  expect(Math.round(weighted)).toBe(fixture.totalScore);
}

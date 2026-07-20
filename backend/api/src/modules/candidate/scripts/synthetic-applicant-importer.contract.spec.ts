import { createHash } from "node:crypto";

import {
  SYNTHETIC_MANIFEST_V1,
  SYNTHETIC_MANIFEST_V2,
  assertV2SyntheticOperationalContract,
  buildSyntheticApplicantPlan,
  parseSyntheticImporterArgs,
  sanitizeSyntheticError,
  summarizeSyntheticPlan,
  syntheticOptionsHash,
  validateSyntheticEnvironment,
  type SyntheticImporterOptions,
} from "./synthetic-applicant-importer.contract";

describe("synthetic applicant importer contract", () => {
  it("parses plan as the default action and fixes interactive accounts at ten", () => {
    const options = parseSyntheticImporterArgs([
      "--environment=local",
      "--company-id=1",
      "--posting-id=2",
      "--dataset-id=demo-1000",
    ]);

    expect(options).toEqual({
      action: "plan",
      environment: "local",
      companyId: 1n,
      postingId: 2n,
      datasetId: "demo-1000",
      activeCount: 1000,
      canceledCount: 50,
      interactiveCount: 10,
      pipelineSelectionCount: 0,
      batchSize: 100,
    });
  });

  it.each([
    [100, 5],
    [1000, 50],
    [5000, 250],
  ])("builds a deterministic and unique %i applicant fixture", (activeCount, canceledCount) => {
    const options = fixtureOptions({ activeCount, canceledCount });
    const first = buildSyntheticApplicantPlan(options, SYNTHETIC_MANIFEST_V1);
    const second = buildSyntheticApplicantPlan(options, SYNTHETIC_MANIFEST_V1);
    const summary = summarizeSyntheticPlan(first);

    expect(first).toEqual(second);
    expect(summary.total).toBe(activeCount + canceledCount);
    expect(summary.active).toBe(activeCount);
    expect(summary.canceled).toBe(canceledCount);
    expect(summary.interactive).toBe(10);
    expect(summary.pipelineSelected).toBe(3);
    expect(new Set(first.map((record) => record.email)).size).toBe(first.length);
    expect(first.filter((record) => !record.isInteractive).every((record) => record.email.endsWith("@demo.invalid"))).toBe(true);
  });

  it("keeps the official 1,000 applicant stage and depth distribution", () => {
    const summary = summarizeSyntheticPlan(buildSyntheticApplicantPlan(fixtureOptions(), SYNTHETIC_MANIFEST_V1));

    expect(summary.stages).toEqual({
      DOCUMENT_PROCESSING: 350,
      DOCUMENT_REVIEW: 250,
      INTERVIEW_WAITING: 180,
      INTERVIEW_IN_PROGRESS: 100,
      REPORT_COMPLETED: 100,
      FAILED: 20,
      CANCELED: 50,
    });
    expect(summary.depths).toEqual({
      PROFILE: 150,
      LIGHTWEIGHT: 800,
      INTERVIEW: 40,
      REPORT: 10,
    });
  });

  it("keeps the V1 options hash and legacy identity stable", () => {
    const options = fixtureOptions();
    const plan = buildSyntheticApplicantPlan(options, SYNTHETIC_MANIFEST_V1);
    const completedReports = plan.filter((record) => record.lifecycleStage === "REPORT_COMPLETED");

    expect(plan[0]).toMatchObject({
      email: "demo+demo-1000-00001@example.com",
      name: "시연 지원자 00001",
    });
    expect(plan[10].email).toBe("candidate-demo-1000-00011@demo.invalid");
    expect(completedReports).toHaveLength(100);
    expect(completedReports.every((record) => record.reportFixture?.totalScore === 81)).toBe(true);
    expect(completedReports.filter((record) => record.reportFixture?.profiles.length === 3)).toHaveLength(10);
    expect(completedReports.filter((record) => record.dataDepth !== "REPORT")
      .every((record) => record.reportFixture?.profiles.length === 0)).toBe(true);
    expect(syntheticOptionsHash(options, SYNTHETIC_MANIFEST_V1)).toBe(
      createHash("sha256").update(JSON.stringify({
        manifestVersion: SYNTHETIC_MANIFEST_V1,
        environment: options.environment,
        companyId: options.companyId.toString(),
        postingId: options.postingId.toString(),
        datasetId: options.datasetId,
        activeCount: options.activeCount,
        canceledCount: options.canceledCount,
        interactiveCount: options.interactiveCount,
        pipelineSelectionCount: options.pipelineSelectionCount,
        batchSize: options.batchSize,
      })).digest("hex"),
    );
  });

  it("uses V2 for a new plan and rejects an unknown manifest version", () => {
    const options = fixtureOptions();
    expect(buildSyntheticApplicantPlan(options)[0].name).not.toContain("시연 지원자");
    expect(syntheticOptionsHash(options)).toBe(syntheticOptionsHash(options, SYNTHETIC_MANIFEST_V2));
    expect(syntheticOptionsHash(options)).not.toBe(syntheticOptionsHash(options, SYNTHETIC_MANIFEST_V1));
    expect(() => buildSyntheticApplicantPlan(options, "UNKNOWN" as never)).toThrow("manifest version");
  });

  it("accepts only the exact posting-36 V2 operational contract", () => {
    const valid = fixtureOptions({ postingId: 36n, pipelineSelectionCount: 0 });
    expect(() => assertV2SyntheticOperationalContract(valid)).not.toThrow();

    for (const invalid of [
      { ...valid, postingId: 35n },
      { ...valid, activeCount: 999 },
      { ...valid, canceledCount: 51 },
      { ...valid, interactiveCount: 9 },
      { ...valid, pipelineSelectionCount: 1 },
    ]) {
      expect(() => assertV2SyntheticOperationalContract(invalid)).toThrow("V2 operational contract");
    }
  });

  it("rejects a different environment, disabled writes, weak passwords and missing production ACK", () => {
    const plan = fixtureOptions({ action: "plan" });
    expect(() => validateSyntheticEnvironment(plan, { SYNTHETIC_APPLICANT_ALLOWED_ENV: "dev" })).toThrow("environment");

    const apply = fixtureOptions({ action: "apply" });
    expect(() => validateSyntheticEnvironment(apply, { SYNTHETIC_APPLICANT_ALLOWED_ENV: "local" })).toThrow("WRITE_ENABLED");
    expect(() => validateSyntheticEnvironment(apply, {
      SYNTHETIC_APPLICANT_ALLOWED_ENV: "local",
      SYNTHETIC_APPLICANT_WRITE_ENABLED: "true",
      SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD: "weak",
    })).toThrow("12자");
    expect(() => validateSyntheticEnvironment({ ...apply, environment: "production" }, {
      SYNTHETIC_APPLICANT_ALLOWED_ENV: "production",
      SYNTHETIC_APPLICANT_WRITE_ENABLED: "true",
      SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD: "DemoPassword1234",
    })).toThrow("ACK");
  });

  it("rejects unknown arguments and any interactive count other than ten", () => {
    expect(() => parseSyntheticImporterArgs([
      "--environment=local",
      "--company-id=1",
      "--posting-id=2",
      "--dataset-id=demo-1000",
      "--interactive-count=9",
    ])).toThrow("정확히 10");
    expect(() => parseSyntheticImporterArgs([
      "--environment=local",
      "--company-id=1",
      "--posting-id=2",
      "--dataset-id=demo-1000",
      "--send-sqs=true",
    ])).toThrow("알 수 없는 인자");
  });

  it("redacts database credentials and password material from persisted errors", () => {
    const bcryptHash = "$2b$12$12345678901234567890123456789012345678901234567890123";
    const sanitized = sanitizeSyntheticError(new Error(
      `failed postgresql://operator:secret@db.example/init\npasswordHash=${bcryptHash}`,
    ));

    expect(sanitized).not.toContain("operator:secret");
    expect(sanitized).not.toContain(bcryptHash);
    expect(sanitized).not.toContain("\n");
    expect(sanitized).toContain("[REDACTED]");
  });
});

function fixtureOptions(overrides: Partial<SyntheticImporterOptions> = {}): SyntheticImporterOptions {
  return {
    action: "plan",
    environment: "local",
    companyId: 1n,
    postingId: 2n,
    datasetId: "demo-1000",
    activeCount: 1000,
    canceledCount: 50,
    interactiveCount: 10,
    pipelineSelectionCount: 3,
    batchSize: 100,
    ...overrides,
  };
}

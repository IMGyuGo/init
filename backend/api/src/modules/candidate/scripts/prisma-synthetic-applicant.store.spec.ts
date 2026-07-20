import {
  SYNTHETIC_MANIFEST_V1,
  SYNTHETIC_MANIFEST_V2,
  buildSyntheticApplicantPlan,
  type SyntheticImporterOptions,
} from "./synthetic-applicant-importer.contract";
import {
  buildSyntheticReportWrite,
  syntheticApplicationUpdatedAt,
} from "./prisma-synthetic-applicant.store";

describe("synthetic report persistence shape", () => {
  it("keeps the legacy V1 report total at 81", () => {
    const record = buildSyntheticApplicantPlan(options(), SYNTHETIC_MANIFEST_V1)
      .find((candidate) => candidate.lifecycleStage === "REPORT_COMPLETED" && candidate.dataDepth === "REPORT");
    expect(record).toBeDefined();
    const write = buildSyntheticReportWrite(record!);
    expect(write.report.totalScore).toBe(81);
    expect(write.scores.map((score) => score.score)).toEqual([84, 78, 81]);
  });

  it("writes a profile score set for every V2 completed report", () => {
    const records = buildSyntheticApplicantPlan(options(), SYNTHETIC_MANIFEST_V2)
      .filter((candidate) => candidate.lifecycleStage === "REPORT_COMPLETED");
    const writes = records.map(buildSyntheticReportWrite);
    expect(writes).toHaveLength(100);
    expect(writes.every((write) => write.scores.length === 3)).toBe(true);
    expect(new Set(writes.map((write) => write.report.totalScore)).size).toBeGreaterThan(20);
  });
});

describe("synthetic application timestamps", () => {
  const baseNow = Date.parse("2026-07-21T00:00:00.000Z");

  it("makes lower V2 ordinals newer for the default descending UI sort", () => {
    const first = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V2, 1, baseNow);
    const eleventh = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V2, 11, baseNow);

    expect(first?.getTime()).toBe(baseNow - 60_000);
    expect(eleventh?.getTime()).toBe(baseNow - 11 * 60_000);
    expect(first!.getTime()).toBeGreaterThan(eleventh!.getTime());
  });

  it("keeps application updatedAt omitted for V1", () => {
    expect(syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V1, 1, baseNow)).toBeUndefined();
  });
});

function options(): SyntheticImporterOptions {
  return {
    action: "apply",
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

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
  const datasetCreatedAt = new Date("2026-07-21T00:00:00.000Z");

  it("makes lower V2 ordinals newer for the default descending UI sort", () => {
    const first = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V2, 1, datasetCreatedAt);
    const eleventh = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V2, 11, datasetCreatedAt);

    expect(first?.getTime()).toBe(datasetCreatedAt.getTime() - 60_000);
    expect(eleventh?.getTime()).toBe(datasetCreatedAt.getTime() - 11 * 60_000);
    expect(first!.getTime()).toBeGreaterThan(eleventh!.getTime());
  });

  it("returns the same V2 timestamp when a later resume reuses the dataset anchor", () => {
    const initial = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V2, 11, datasetCreatedAt);
    const resumed = syntheticApplicationUpdatedAt(
      SYNTHETIC_MANIFEST_V2,
      11,
      new Date(datasetCreatedAt.getTime()),
    );

    expect(resumed).toEqual(initial);
  });

  it("keeps application updatedAt omitted for V1", () => {
    expect(syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V1, 1, datasetCreatedAt)).toBeUndefined();
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

import {
  SYNTHETIC_MANIFEST_V1,
  SYNTHETIC_MANIFEST_V2,
  SYNTHETIC_MANIFEST_V3,
  buildSyntheticApplicantPlan,
  type SyntheticImporterOptions,
} from "./synthetic-applicant-importer.contract";
import {
  buildSyntheticReportWrite,
  PrismaSyntheticApplicantStore,
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

  it("makes lower V3 ordinals newer using the dataset timestamp anchor", () => {
    const first = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V3, 1, datasetCreatedAt);
    const nineHundredTwentieth = syntheticApplicationUpdatedAt(SYNTHETIC_MANIFEST_V3, 920, datasetCreatedAt);

    expect(first?.getTime()).toBe(datasetCreatedAt.getTime() - 60_000);
    expect(nineHundredTwentieth?.getTime()).toBe(datasetCreatedAt.getTime() - 920 * 60_000);
    expect(first!.getTime()).toBeGreaterThan(nineHundredTwentieth!.getTime());
  });
});

describe("synthetic report score persistence", () => {
  it("batches every completed report profile score into one createMany call", async () => {
    const record = buildSyntheticApplicantPlan(options(), SYNTHETIC_MANIFEST_V2)
      .find((candidate) => candidate.lifecycleStage === "REPORT_COMPLETED")!;
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    const create = jest.fn();
    const tx = {
      evaluationReport: { create: jest.fn().mockResolvedValue({ reportId: 91n }) },
      reportScore: { create, createMany },
    };
    const store = new PrismaSyntheticApplicantStore({} as never);

    await invokeCreateReportFixture(store, tx, record);

    expect(create).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          reportId: 91n,
          criterionId: null,
          ncsProfileId: "JOB_TECHNICAL",
          rationale: "합성 면접 답변에서 문제 구조화와 협업 근거를 확인했습니다.",
        }),
      ]),
    });
    expect(createMany.mock.calls[0][0].data).toHaveLength(3);
  });

  it("does not call createMany when a legacy failed report has no score rows", async () => {
    const record = buildSyntheticApplicantPlan(options(), SYNTHETIC_MANIFEST_V1)
      .find((candidate) => candidate.reportStatus === "FAILED")!;
    const createMany = jest.fn();
    const tx = {
      evaluationReport: { create: jest.fn().mockResolvedValue({ reportId: 92n }) },
      reportScore: { create: jest.fn(), createMany },
    };
    const store = new PrismaSyntheticApplicantStore({} as never);

    await invokeCreateReportFixture(store, tx, record);

    expect(createMany).not.toHaveBeenCalled();
  });
});

async function invokeCreateReportFixture(
  store: PrismaSyntheticApplicantStore,
  tx: object,
  record: ReturnType<typeof buildSyntheticApplicantPlan>[number],
) {
  const createReportFixture = (store as unknown as {
    createReportFixture(
      transaction: object,
      applicationId: bigint,
      sessionId: bigint | null,
      planRecord: typeof record,
      now: Date,
    ): Promise<void>;
  }).createReportFixture;

  await createReportFixture.call(store, tx, 71n, 81n, record, new Date("2026-07-21T00:00:00.000Z"));
}

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

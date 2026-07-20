import {
  SYNTHETIC_MANIFEST_V1,
  SYNTHETIC_MANIFEST_V2,
  syntheticOptionsHash,
  type SyntheticApplicantPlanRecord,
  type SyntheticImporterOptions,
  type SyntheticManifestVersion,
} from "./synthetic-applicant-importer.contract";
import {
  SyntheticApplicantImporterService,
  type SyntheticApplicantStore,
  type SyntheticDatasetManifest,
  type SyntheticManifestRecord,
} from "./synthetic-applicant-importer.service";

describe("SyntheticApplicantImporterService", () => {
  it("keeps plan read-only", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);

    const result = await service.plan(fixtureOptions());

    expect(result.summary.active).toBe(100);
    expect(result.summary.interactive).toBe(10);
    expect(store.createBatchCalls).toBe(0);
    expect(store.dataset).toBeNull();
  });

  it("applies once and returns the existing manifest on the same dataset rerun", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    const options = fixtureOptions();

    const first = await service.apply(options, "hashed-password");
    const callsAfterFirst = store.createBatchCalls;
    const second = await service.apply(options, "hashed-password");

    expect(first.created).toEqual({ total: 105, active: 100, canceled: 5, interactive: 10 });
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(store.createBatchCalls).toBe(callsAfterFirst);
    expect(new Set(store.records.map((record) => record.applicationId)).size).toBe(105);
  });

  it("records a partial batch failure and resumes only missing ordinals", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    const options = fixtureOptions({ batchSize: 50 });
    store.failOnCreateBatchCall = 2;

    await expect(service.apply(options, "hashed-password")).rejects.toThrow("simulated batch failure");
    expect(store.dataset?.status).toBe("PARTIAL");
    expect(store.records).toHaveLength(50);

    store.failOnCreateBatchCall = null;
    const resumed = await service.apply(options, "hashed-password");

    expect(resumed.created.total).toBe(105);
    expect(new Set(store.records.map((record) => record.ordinal)).size).toBe(105);
    expect(store.dataset?.status).toBe("APPLIED");
  });

  it("rejects reuse of a datasetId with different options", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    await service.apply(fixtureOptions(), "hashed-password");

    await expect(service.apply(fixtureOptions({ activeCount: 101 }), "hashed-password")).rejects.toThrow("다른 옵션");
    expect(store.records).toHaveLength(105);
  });

  it("cleans only manifest records and preserves the audit manifest", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    const options = fixtureOptions();
    await service.apply(options, "hashed-password");
    const expectedApplicationIds = store.records.map((record) => record.applicationId);

    const preview = await service.previewCleanup({ ...options, action: "cleanup" });
    const result = await service.cleanup({ ...options, action: "cleanup" });

    expect(preview.deleteExpected).toEqual({ records: 105, active: 100, canceled: 5, interactive: 10 });
    expect(result.remainingRecords).toBe(0);
    expect(result.cleanedRecords).toBe(105);
    expect(store.dataset?.status).toBe("CLEANED");
    expect(store.dataset).not.toBeNull();
    expect(preview.manifestScope.recordCount).toBe(105);
    expect(store.cleanedApplicationIds).toEqual(expectedApplicationIds);
  });

  it("creates new datasets as V2 and resumes an existing V1 dataset with V1 hash", async () => {
    const v2Store = new FakeSyntheticApplicantStore();
    const v2Service = new SyntheticApplicantImporterService(v2Store);
    await v2Service.apply(fixtureOptions(), "hashed-password");
    expect(v2Store.dataset?.manifestVersion).toBe("SYNTHETIC_APPLICANT_MANIFEST_V2");

    const v1Store = new FakeSyntheticApplicantStore();
    v1Store.seedExistingDataset(fixtureOptions(), "SYNTHETIC_APPLICANT_MANIFEST_V1");
    const v1Service = new SyntheticApplicantImporterService(v1Store);
    const result = await v1Service.apply(fixtureOptions(), "hashed-password");
    expect(result.datasetStatus).toBe("APPLIED");
    expect(v1Store.dataset?.manifestVersion).toBe("SYNTHETIC_APPLICANT_MANIFEST_V1");
  });

  it("fails closed for an unsupported stored manifest version", async () => {
    const store = new FakeSyntheticApplicantStore();
    store.seedExistingDataset(fixtureOptions(), "UNSUPPORTED");
    const service = new SyntheticApplicantImporterService(store);
    await expect(service.plan(fixtureOptions())).rejects.toThrow("manifest version");
  });
});

class FakeSyntheticApplicantStore implements SyntheticApplicantStore {
  dataset: SyntheticDatasetManifest | null = null;
  records: SyntheticManifestRecord[] = [];
  createBatchCalls = 0;
  failOnCreateBatchCall: number | null = null;
  cleanedApplicationIds: bigint[] = [];

  async findTargetPosting(postingId: bigint) {
    return { postingId, companyId: 1n, title: "Synthetic target", status: "OPEN" };
  }

  async findDataset() {
    return this.dataset;
  }

  async createDataset(
    options: SyntheticImporterOptions,
    optionsHash: string,
    manifestVersion: SyntheticManifestVersion,
  ) {
    this.dataset = {
      datasetId: options.datasetId,
      environment: options.environment,
      postingId: options.postingId,
      companyId: options.companyId,
      activeCount: options.activeCount,
      canceledCount: options.canceledCount,
      interactiveCount: options.interactiveCount,
      pipelineSelectionCount: options.pipelineSelectionCount,
      batchSize: options.batchSize,
      manifestVersion,
      optionsHash,
      status: "APPLYING",
      lastError: null,
      appliedAt: null,
      cleanedAt: null,
    };
    return this.dataset;
  }

  seedExistingDataset(options: SyntheticImporterOptions, manifestVersion: string) {
    const optionsHash = manifestVersion === SYNTHETIC_MANIFEST_V1 || manifestVersion === SYNTHETIC_MANIFEST_V2
      ? syntheticOptionsHash(options, manifestVersion)
      : "unsupported-test-options-hash";
    this.dataset = {
      datasetId: options.datasetId,
      environment: options.environment,
      postingId: options.postingId,
      companyId: options.companyId,
      activeCount: options.activeCount,
      canceledCount: options.canceledCount,
      interactiveCount: options.interactiveCount,
      pipelineSelectionCount: options.pipelineSelectionCount,
      batchSize: options.batchSize,
      manifestVersion,
      optionsHash,
      status: "APPLYING",
      lastError: null,
      appliedAt: null,
      cleanedAt: null,
    };
  }

  async updateDataset(_datasetId: string, data: { status: string; lastError?: string | null; appliedAt?: Date | null; cleanedAt?: Date | null }) {
    if (!this.dataset) throw new Error("missing dataset");
    this.dataset = { ...this.dataset, ...data };
  }

  async listRecords() {
    return this.records.map((record) => ({ ...record }));
  }

  async createBatch(_datasetId: string, records: SyntheticApplicantPlanRecord[]) {
    this.createBatchCalls += 1;
    if (this.failOnCreateBatchCall === this.createBatchCalls) throw new Error("simulated batch failure");
    this.records.push(...records.map((record) => ({
      ordinal: record.ordinal,
      userId: BigInt(10_000 + record.ordinal),
      candidateId: BigInt(20_000 + record.ordinal),
      applicationId: BigInt(30_000 + record.ordinal),
      isInteractive: record.isInteractive,
      isCanceled: record.isCanceled,
      lifecycleStage: record.lifecycleStage,
      dataDepth: record.dataDepth,
      pipelineSelected: record.pipelineSelected,
      cleanedAt: null,
    })));
  }

  async cleanupBatch(_datasetId: string, records: SyntheticManifestRecord[]) {
    this.cleanedApplicationIds.push(...records.map((record) => record.applicationId));
    const ordinals = new Set(records.map((record) => record.ordinal));
    this.records = this.records.map((record) => ordinals.has(record.ordinal) ? { ...record, cleanedAt: new Date() } : record);
  }
}

function fixtureOptions(overrides: Partial<SyntheticImporterOptions> = {}): SyntheticImporterOptions {
  return {
    action: "apply",
    environment: "local",
    companyId: 1n,
    postingId: 2n,
    datasetId: "demo-service",
    activeCount: 100,
    canceledCount: 5,
    interactiveCount: 10,
    pipelineSelectionCount: 2,
    batchSize: 25,
    ...overrides,
  };
}

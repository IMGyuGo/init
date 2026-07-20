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

    expect(result.summary.active).toBe(1_000);
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

    expect(first.created).toEqual({ total: 1_050, active: 1_000, canceled: 50, interactive: 10 });
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(store.createBatchCalls).toBe(callsAfterFirst);
    expect(new Set(store.records.map((record) => record.applicationId)).size).toBe(1_050);
  });

  it("records a partial batch failure and resumes only missing ordinals", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    const options = fixtureOptions({ batchSize: 500 });
    store.failOnCreateBatchCall = 2;

    await expect(service.apply(options, "hashed-password")).rejects.toThrow("simulated batch failure");
    expect(store.dataset?.status).toBe("PARTIAL");
    expect(store.records).toHaveLength(500);

    store.failOnCreateBatchCall = null;
    const resumed = await service.apply(options, "hashed-password");

    expect(resumed.created.total).toBe(1_050);
    expect(new Set(store.records.map((record) => record.ordinal)).size).toBe(1_050);
    expect(store.dataset?.status).toBe("APPLIED");
  });

  it("rejects reuse of a datasetId with different options", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    await service.apply(fixtureOptions(), "hashed-password");

    await expect(service.apply(fixtureOptions({ batchSize: 200 }), "hashed-password")).rejects.toThrow("다른 옵션");
    expect(store.records).toHaveLength(1_050);
  });

  it("cleans only manifest records and preserves the audit manifest", async () => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    const options = fixtureOptions();
    await service.apply(options, "hashed-password");
    const expectedApplicationIds = store.records.map((record) => record.applicationId);

    const preview = await service.previewCleanup({ ...options, action: "cleanup" });
    const result = await service.cleanup({ ...options, action: "cleanup" });

    expect(preview.deleteExpected).toEqual({ records: 1_050, active: 1_000, canceled: 50, interactive: 10 });
    expect(result.remainingRecords).toBe(0);
    expect(result.cleanedRecords).toBe(1_050);
    expect(store.dataset?.status).toBe("CLEANED");
    expect(store.dataset).not.toBeNull();
    expect(preview.manifestScope.recordCount).toBe(1_050);
    expect(store.cleanedApplicationIds).toEqual(expectedApplicationIds);
  });

  it("creates new datasets as V2 and resumes an existing V1 dataset with V1 hash", async () => {
    const v2Store = new FakeSyntheticApplicantStore();
    const v2Service = new SyntheticApplicantImporterService(v2Store);
    await v2Service.apply(fixtureOptions(), "hashed-password");
    expect(v2Store.dataset?.manifestVersion).toBe("SYNTHETIC_APPLICANT_MANIFEST_V2");

    const v1Store = new FakeSyntheticApplicantStore();
    const legacy = legacyFixtureOptions();
    v1Store.seedExistingDataset(legacy, "SYNTHETIC_APPLICANT_MANIFEST_V1");
    const v1Service = new SyntheticApplicantImporterService(v1Store);
    const result = await v1Service.apply(legacy, "hashed-password");
    expect(result.datasetStatus).toBe("APPLIED");
    expect(v1Store.dataset?.manifestVersion).toBe("SYNTHETIC_APPLICANT_MANIFEST_V1");
  });

  it("preserves V1 plan, partial resume, already-applied, preview and cleanup semantics", async () => {
    const options = legacyFixtureOptions({ batchSize: 25 });
    const store = new FakeSyntheticApplicantStore();
    store.seedExistingDataset(options, SYNTHETIC_MANIFEST_V1);
    const service = new SyntheticApplicantImporterService(store);

    const plan = await service.plan({ ...options, action: "plan" });
    expect(plan.summary).toMatchObject({ total: 105, active: 100, canceled: 5, interactive: 10 });

    store.failOnCreateBatchCall = 2;
    await expect(service.apply(options, "hashed-password")).rejects.toThrow("simulated batch failure");
    expect(store.records).toHaveLength(25);
    expect(store.dataset?.status).toBe("PARTIAL");

    store.failOnCreateBatchCall = null;
    const resumed = await service.apply(options, "hashed-password");
    const callsAfterResume = store.createBatchCalls;
    const alreadyApplied = await service.apply(options, "hashed-password");
    expect(resumed.created.total).toBe(105);
    expect(alreadyApplied.idempotent).toBe(true);
    expect(store.createBatchCalls).toBe(callsAfterResume);

    const cleanupOptions = { ...options, action: "cleanup" as const };
    const preview = await service.previewCleanup(cleanupOptions);
    const cleanup = await service.cleanup(cleanupOptions);
    expect(preview.manifestScope).toEqual({ recordCount: 105, firstOrdinal: 1, lastOrdinal: 105 });
    expect(cleanup).toMatchObject({ cleanedRecords: 105, remainingRecords: 0 });
    expect(store.cleanedApplicationIds).toHaveLength(105);
  });

  it("fails closed for an unsupported stored manifest version", async () => {
    const store = new FakeSyntheticApplicantStore();
    store.seedExistingDataset(fixtureOptions(), "UNSUPPORTED");
    const service = new SyntheticApplicantImporterService(store);
    await expect(service.plan(fixtureOptions())).rejects.toThrow("manifest version");
  });

  it.each([
    ["plan", { activeCount: 999, canceledCount: 51 }],
    ["plan", { pipelineSelectionCount: 1 }],
    ["apply", { activeCount: 999, canceledCount: 51 }],
    ["apply", { pipelineSelectionCount: 1 }],
  ] as const)("rejects a non-contract V2 %s before any write or manifest record read", async (action, overrides) => {
    const store = new FakeSyntheticApplicantStore();
    const service = new SyntheticApplicantImporterService(store);
    const options = fixtureOptions({ action, ...overrides });

    const operation = action === "plan"
      ? service.plan(options)
      : service.apply(options, "hashed-password");

    await expect(operation).rejects.toThrow("V2");
    expect(store.createDatasetCalls).toBe(0);
    expect(store.listRecordsCalls).toBe(0);
    expect(store.updateDatasetCalls).toBe(0);
    expect(store.createBatchCalls).toBe(0);
  });

  it.each(["plan", "apply"] as const)(
    "rejects a malformed stored V2 dataset during %s before any write or manifest record read",
    async (action) => {
      const options = fixtureOptions({ action });
      const store = new FakeSyntheticApplicantStore();
      store.seedExistingDataset(options, SYNTHETIC_MANIFEST_V2);
      store.dataset = {
        ...store.dataset!,
        activeCount: 999,
        canceledCount: 51,
        optionsHash: syntheticOptionsHash(options, SYNTHETIC_MANIFEST_V2),
      };
      const service = new SyntheticApplicantImporterService(store);

      const operation = action === "plan"
        ? service.plan(options)
        : service.apply(options, "hashed-password");

      await expect(operation).rejects.toThrow("V2 operational contract");
      expect(store.createDatasetCalls).toBe(0);
      expect(store.listRecordsCalls).toBe(0);
      expect(store.updateDatasetCalls).toBe(0);
      expect(store.createBatchCalls).toBe(0);
    },
  );

  it("allows only matching manifest-scoped cleanup recovery for a malformed partial V2 dataset", async () => {
    const options = fixtureOptions({
      action: "cleanup",
      activeCount: 999,
      canceledCount: 51,
      pipelineSelectionCount: 1,
    });
    const store = new FakeSyntheticApplicantStore();
    store.seedExistingDataset(options, SYNTHETIC_MANIFEST_V2);
    store.dataset = { ...store.dataset!, status: "PARTIAL" };
    store.records = [
      fixtureManifestRecord(1, { isInteractive: true, pipelineSelected: true }),
      fixtureManifestRecord(1_050, { isCanceled: true, lifecycleStage: "CANCELED" }),
    ];
    const service = new SyntheticApplicantImporterService(store);

    await expect(service.previewCleanup({ ...options, batchSize: 200 })).rejects.toThrow("다른 옵션");
    expect(store.listRecordsCalls).toBe(0);
    expect(store.updateDatasetCalls).toBe(0);

    await expect(service.previewCleanup({ ...options, environment: "staging" })).rejects.toThrow("environment");
    await expect(service.previewCleanup({ ...options, postingId: 35n })).rejects.toThrow("companyId/postingId");

    store.dataset = { ...store.dataset!, manifestVersion: "UNSUPPORTED" };
    await expect(service.previewCleanup(options)).rejects.toThrow("manifest version");
    store.dataset = { ...store.dataset!, manifestVersion: SYNTHETIC_MANIFEST_V2 };

    const preview = await service.previewCleanup(options);
    const result = await service.cleanup(options);

    expect(preview.deleteExpected).toEqual({ records: 2, active: 1, canceled: 1, interactive: 1 });
    expect(result).toMatchObject({ datasetStatus: "CLEANED", cleanedRecords: 2, remainingRecords: 0 });
    expect(store.cleanedApplicationIds).toEqual([30_001n, 31_050n]);
    expect(store.cleanedApplicationIds).not.toContain(99_999n);
    expect(store.dataset?.status).toBe("CLEANED");
  });
});

class FakeSyntheticApplicantStore implements SyntheticApplicantStore {
  dataset: SyntheticDatasetManifest | null = null;
  records: SyntheticManifestRecord[] = [];
  createBatchCalls = 0;
  createDatasetCalls = 0;
  listRecordsCalls = 0;
  updateDatasetCalls = 0;
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
    this.createDatasetCalls += 1;
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
    this.updateDatasetCalls += 1;
    if (!this.dataset) throw new Error("missing dataset");
    this.dataset = { ...this.dataset, ...data };
  }

  async listRecords() {
    this.listRecordsCalls += 1;
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
    postingId: 36n,
    datasetId: "demo-service",
    activeCount: 1_000,
    canceledCount: 50,
    interactiveCount: 10,
    pipelineSelectionCount: 0,
    batchSize: 100,
    ...overrides,
  };
}

function legacyFixtureOptions(overrides: Partial<SyntheticImporterOptions> = {}): SyntheticImporterOptions {
  return fixtureOptions({
    postingId: 2n,
    datasetId: "demo-service-v1",
    activeCount: 100,
    canceledCount: 5,
    pipelineSelectionCount: 2,
    batchSize: 25,
    ...overrides,
  });
}

function fixtureManifestRecord(
  ordinal: number,
  overrides: Partial<SyntheticManifestRecord> = {},
): SyntheticManifestRecord {
  return {
    ordinal,
    userId: BigInt(10_000 + ordinal),
    candidateId: BigInt(20_000 + ordinal),
    applicationId: BigInt(30_000 + ordinal),
    isInteractive: false,
    isCanceled: false,
    lifecycleStage: "DOCUMENT_PROCESSING",
    dataDepth: "LIGHTWEIGHT",
    pipelineSelected: false,
    cleanedAt: null,
    ...overrides,
  };
}

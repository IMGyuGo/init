import {
  SYNTHETIC_MANIFEST_V1,
  SYNTHETIC_MANIFEST_V2,
  buildSyntheticApplicantPlan,
  formatSyntheticImporterFailure,
  serializeSyntheticImporterOutput,
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

const FORBIDDEN_MARKERS = /email|phone|password|hash|userId|candidateId|applicationId|name/i;

describe("synthetic applicant importer CLI output", () => {
  it("serializes actual V1/V2 plan and V2 apply/cleanup results without identity or internal ID data", async () => {
    const options = fixedOptions();
    const store = new OutputStore();
    const service = new SyntheticApplicantImporterService(store);
    const plan = await service.plan({ ...options, action: "plan" });
    const apply = await service.apply(options, "hashed-password");
    const cleanupPreview = await service.previewCleanup({ ...options, action: "cleanup" });
    const cleanup = await service.cleanup({ ...options, action: "cleanup" });

    const legacyOptions = legacyFixtureOptions();
    const legacyStore = new OutputStore();
    legacyStore.seedDataset(legacyOptions, SYNTHETIC_MANIFEST_V1);
    const legacyPlan = await new SyntheticApplicantImporterService(legacyStore).plan(legacyOptions);

    const v1Identity = buildSyntheticApplicantPlan(legacyOptions, SYNTHETIC_MANIFEST_V1)[0];
    const v2Identity = buildSyntheticApplicantPlan(options, SYNTHETIC_MANIFEST_V2)[0];
    const knownSensitiveValues = [
      v1Identity.email,
      v1Identity.name,
      v1Identity.phone,
      v2Identity.email,
      v2Identity.name,
      v2Identity.phone,
      "10001",
      "20001",
      "30001",
    ];

    for (const [label, result] of [
      ["plan", plan],
      ["legacy-plan", legacyPlan],
      ["apply", apply],
      ["cleanup-preview", cleanupPreview],
      ["cleanup", cleanup],
    ] as const) {
      const serialized = serializeSyntheticImporterOutput(result);
      expect(serialized).not.toMatch(FORBIDDEN_MARKERS);
      for (const value of knownSensitiveValues) {
        expect(serialized).not.toContain(value);
      }
      expect(serialized).toContain(`"action": "${label === "legacy-plan" ? "plan" : label}"`);
    }
  });

  it("formats a CLI failure without sensitive markers or supplied V1/V2 identity values", () => {
    const v1Identity = buildSyntheticApplicantPlan(legacyFixtureOptions(), SYNTHETIC_MANIFEST_V1)[0];
    const v2Identity = buildSyntheticApplicantPlan(fixedOptions(), SYNTHETIC_MANIFEST_V2)[0];
    const bcryptHash = "$2b$12$12345678901234567890123456789012345678901234567890123";
    const error = new Error([
      `email=${v2Identity.email}`,
      `phone=${v1Identity.phone}`,
      `name='${v1Identity.name}'`,
      "password=Secret123456",
      `passwordHash=${bcryptHash}`,
      "userId=10001",
      "candidateId=20001",
      "applicationId=30001",
    ].join(" "));

    const serialized = formatSyntheticImporterFailure(error);

    expect(serialized).not.toMatch(FORBIDDEN_MARKERS);
    for (const value of [v1Identity.email, v1Identity.name, v1Identity.phone, v2Identity.email, bcryptHash, "10001", "20001", "30001"]) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).toContain("synthetic-applicant-importer failed:");
  });
});

class OutputStore implements SyntheticApplicantStore {
  dataset: SyntheticDatasetManifest | null = null;
  records: SyntheticManifestRecord[] = [];

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
    this.dataset = manifest(options, optionsHash, manifestVersion);
    return this.dataset;
  }

  seedDataset(options: SyntheticImporterOptions, manifestVersion: SyntheticManifestVersion) {
    this.dataset = manifest(options, syntheticOptionsHash(options, manifestVersion), manifestVersion);
  }

  async updateDataset(
    _datasetId: string,
    data: { status: string; lastError?: string | null; appliedAt?: Date | null; cleanedAt?: Date | null },
  ) {
    if (!this.dataset) throw new Error("missing dataset");
    this.dataset = { ...this.dataset, ...data };
  }

  async listRecords() {
    return this.records.map((record) => ({ ...record }));
  }

  async createBatch(_datasetId: string, records: SyntheticApplicantPlanRecord[]) {
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
    const ordinals = new Set(records.map((record) => record.ordinal));
    this.records = this.records.map((record) => ordinals.has(record.ordinal)
      ? { ...record, cleanedAt: new Date() }
      : record);
  }
}

function manifest(
  options: SyntheticImporterOptions,
  optionsHash: string,
  manifestVersion: SyntheticManifestVersion,
): SyntheticDatasetManifest {
  return {
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

function fixedOptions(overrides: Partial<SyntheticImporterOptions> = {}): SyntheticImporterOptions {
  return {
    action: "apply",
    environment: "local",
    companyId: 1n,
    postingId: 36n,
    datasetId: "output-v2",
    activeCount: 1_000,
    canceledCount: 50,
    interactiveCount: 10,
    pipelineSelectionCount: 0,
    batchSize: 500,
    ...overrides,
  };
}

function legacyFixtureOptions(): SyntheticImporterOptions {
  return fixedOptions({
    action: "plan",
    postingId: 2n,
    datasetId: "output-v1",
    activeCount: 100,
    canceledCount: 5,
    pipelineSelectionCount: 2,
    batchSize: 25,
  });
}

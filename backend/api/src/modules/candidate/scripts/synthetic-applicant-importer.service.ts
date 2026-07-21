import {
  SYNTHETIC_MANIFEST_V2,
  SYNTHETIC_MANIFEST_V3,
  assertSyntheticManifestVersion,
  assertV2SyntheticOperationalContract,
  assertV3SyntheticOperationalContract,
  buildSyntheticApplicantPlan,
  chunkSyntheticRecords,
  sanitizeSyntheticError,
  summarizeSyntheticPlan,
  syntheticOptionsHash,
  type SyntheticApplicantPlanRecord,
  type SyntheticImporterOptions,
  type SyntheticManifestVersion,
} from "./synthetic-applicant-importer.contract";

export type SyntheticTargetPosting = {
  postingId: bigint;
  companyId: bigint;
  title: string;
  status: string;
};

export type SyntheticDatasetManifest = {
  datasetId: string;
  environment: string;
  postingId: bigint;
  companyId: bigint;
  activeCount: number;
  canceledCount: number;
  interactiveCount: number;
  pipelineSelectionCount: number;
  batchSize: number;
  manifestVersion: string;
  optionsHash: string;
  status: string;
  lastError: string | null;
  appliedAt: Date | null;
  cleanedAt: Date | null;
};

export type SyntheticManifestRecord = {
  ordinal: number;
  userId: bigint;
  candidateId: bigint;
  applicationId: bigint;
  isInteractive: boolean;
  isCanceled: boolean;
  lifecycleStage: string;
  dataDepth: string;
  pipelineSelected: boolean;
  cleanedAt: Date | null;
};

export interface SyntheticApplicantStore {
  findTargetPosting(postingId: bigint): Promise<SyntheticTargetPosting | null>;
  findDataset(datasetId: string): Promise<SyntheticDatasetManifest | null>;
  createDataset(
    options: SyntheticImporterOptions,
    optionsHash: string,
    manifestVersion: SyntheticManifestVersion,
  ): Promise<SyntheticDatasetManifest>;
  updateDataset(
    datasetId: string,
    data: { status: string; lastError?: string | null; appliedAt?: Date | null; cleanedAt?: Date | null },
  ): Promise<void>;
  listRecords(datasetId: string): Promise<SyntheticManifestRecord[]>;
  createBatch(datasetId: string, records: SyntheticApplicantPlanRecord[], passwordHash: string): Promise<void>;
  cleanupBatch(datasetId: string, records: SyntheticManifestRecord[]): Promise<void>;
}

export class SyntheticApplicantImporterService {
  constructor(private readonly store: SyntheticApplicantStore) {}

  async plan(options: SyntheticImporterOptions) {
    const target = await this.requireTarget(options);
    const existing = await this.store.findDataset(options.datasetId);
    const manifestVersion = this.resolveManifestVersion(existing);
    if (manifestVersion === SYNTHETIC_MANIFEST_V2) {
      assertV2SyntheticOperationalContract(options);
      if (existing) assertV2SyntheticOperationalContract(existing);
    }
    if (manifestVersion === SYNTHETIC_MANIFEST_V3) {
      assertV3SyntheticOperationalContract(options);
      if (existing) assertV3SyntheticOperationalContract(existing);
    }
    const records = buildSyntheticApplicantPlan(options, manifestVersion);
    const optionsHash = syntheticOptionsHash(options, manifestVersion);
    if (existing && existing.optionsHash !== optionsHash) {
      throw new Error("같은 datasetId가 다른 옵션으로 이미 존재합니다.");
    }
    return {
      action: "plan" as const,
      target,
      datasetId: options.datasetId,
      manifestVersion,
      existingDatasetStatus: existing?.status ?? null,
      summary: summarizeSyntheticPlan(records),
      interactiveEvidence: summarizeOutputRecords(records.filter((record) => record.isInteractive)),
      pipelineEvidence: summarizeOutputRecords(records.filter((record) => record.pipelineSelected)),
    };
  }

  async apply(options: SyntheticImporterOptions, passwordHash: string) {
    const target = await this.requireTarget(options);
    let dataset = await this.store.findDataset(options.datasetId);
    const manifestVersion = this.resolveManifestVersion(dataset);
    if (manifestVersion === SYNTHETIC_MANIFEST_V2) {
      assertV2SyntheticOperationalContract(options);
      if (dataset) assertV2SyntheticOperationalContract(dataset);
    }
    if (manifestVersion === SYNTHETIC_MANIFEST_V3) {
      assertV3SyntheticOperationalContract(options);
      if (dataset) assertV3SyntheticOperationalContract(dataset);
    }
    const plannedRecords = buildSyntheticApplicantPlan(options, manifestVersion);
    const optionsHash = syntheticOptionsHash(options, manifestVersion);
    if (!dataset) dataset = await this.store.createDataset(options, optionsHash, manifestVersion);
    this.assertDatasetContract(dataset, options, optionsHash);

    const existingRecords = await this.store.listRecords(options.datasetId);
    if (dataset.status === "APPLIED") {
      this.assertCompletedCount(plannedRecords, existingRecords);
      return this.applyResult(target, dataset, existingRecords, true);
    }
    if (dataset.status === "CLEANED") {
      throw new Error("CLEANED datasetId는 재사용하지 않습니다. 새 datasetId를 지정해 주세요.");
    }

    const existingOrdinals = new Set(existingRecords.filter((record) => !record.cleanedAt).map((record) => record.ordinal));
    const missingRecords = plannedRecords.filter((record) => !existingOrdinals.has(record.ordinal));
    await this.store.updateDataset(options.datasetId, { status: "APPLYING", lastError: null });

    try {
      for (const batch of chunkSyntheticRecords(missingRecords, options.batchSize)) {
        await this.store.createBatch(options.datasetId, batch, passwordHash);
      }
      const completedRecords = await this.store.listRecords(options.datasetId);
      this.assertCompletedCount(plannedRecords, completedRecords);
      const appliedAt = new Date();
      await this.store.updateDataset(options.datasetId, { status: "APPLIED", lastError: null, appliedAt });
      dataset = { ...dataset, status: "APPLIED", appliedAt };
      return this.applyResult(target, dataset, completedRecords, missingRecords.length === 0);
    } catch (error) {
      const current = await this.store.listRecords(options.datasetId);
      await this.store.updateDataset(options.datasetId, {
        status: current.some((record) => !record.cleanedAt) ? "PARTIAL" : "FAILED",
        lastError: sanitizeSyntheticError(error),
      });
      throw error;
    }
  }

  async cleanup(options: SyntheticImporterOptions) {
    const target = await this.requireTarget(options);
    const dataset = await this.store.findDataset(options.datasetId);
    if (!dataset) throw new Error("cleanup할 dataset manifest를 찾을 수 없습니다.");
    const manifestVersion = this.resolveManifestVersion(dataset);
    this.assertCleanupContract(dataset, options, manifestVersion);
    const records = await this.store.listRecords(options.datasetId);
    const pending = records.filter((record) => !record.cleanedAt);

    if (dataset.status === "CLEANED" || pending.length === 0) {
      return this.cleanupResult(target, dataset, records, true);
    }

    await this.store.updateDataset(options.datasetId, { status: "CLEANING", lastError: null });
    try {
      for (const batch of chunkSyntheticRecords(pending, options.batchSize)) {
        await this.store.cleanupBatch(options.datasetId, batch);
      }
      const cleanedAt = new Date();
      await this.store.updateDataset(options.datasetId, { status: "CLEANED", lastError: null, cleanedAt });
      const completed = await this.store.listRecords(options.datasetId);
      return this.cleanupResult(target, { ...dataset, status: "CLEANED", cleanedAt }, completed, false);
    } catch (error) {
      await this.store.updateDataset(options.datasetId, { status: "PARTIAL", lastError: sanitizeSyntheticError(error) });
      throw error;
    }
  }

  async previewCleanup(options: SyntheticImporterOptions) {
    const target = await this.requireTarget(options);
    const dataset = await this.store.findDataset(options.datasetId);
    if (!dataset) throw new Error("cleanup할 dataset manifest를 찾을 수 없습니다.");
    const manifestVersion = this.resolveManifestVersion(dataset);
    this.assertCleanupContract(dataset, options, manifestVersion);
    const records = await this.store.listRecords(options.datasetId);
    const pending = records.filter((record) => !record.cleanedAt);
    return {
      action: "cleanup-preview" as const,
      target,
      datasetId: dataset.datasetId,
      datasetStatus: dataset.status,
      deleteExpected: {
        records: pending.length,
        active: pending.filter((record) => !record.isCanceled).length,
        canceled: pending.filter((record) => record.isCanceled).length,
        interactive: pending.filter((record) => record.isInteractive).length,
      },
      manifestScope: {
        recordCount: pending.length,
        firstOrdinal: pending[0]?.ordinal ?? null,
        lastOrdinal: pending.at(-1)?.ordinal ?? null,
      },
    };
  }

  private async requireTarget(options: SyntheticImporterOptions) {
    const target = await this.store.findTargetPosting(options.postingId);
    if (!target) throw new Error("대상 postingId를 찾을 수 없습니다.");
    if (target.companyId !== options.companyId) throw new Error("postingId의 소유 기업이 --company-id와 일치하지 않습니다.");
    return target;
  }

  private resolveManifestVersion(dataset: SyntheticDatasetManifest | null): SyntheticManifestVersion {
    if (!dataset) return SYNTHETIC_MANIFEST_V3;
    assertSyntheticManifestVersion(dataset.manifestVersion);
    return dataset.manifestVersion;
  }

  private assertDatasetContract(dataset: SyntheticDatasetManifest, options: SyntheticImporterOptions, optionsHash: string) {
    if (dataset.optionsHash !== optionsHash) throw new Error("같은 datasetId가 다른 옵션으로 이미 존재합니다.");
    this.assertCleanupTarget(dataset, options);
  }

  private assertCleanupTarget(dataset: SyntheticDatasetManifest, options: SyntheticImporterOptions) {
    if (dataset.environment !== options.environment) throw new Error("dataset 환경이 실행 environment와 일치하지 않습니다.");
    if (dataset.postingId !== options.postingId || dataset.companyId !== options.companyId) {
      throw new Error("dataset의 companyId/postingId가 실행 대상과 일치하지 않습니다.");
    }
  }

  private assertCleanupContract(
    dataset: SyntheticDatasetManifest,
    options: SyntheticImporterOptions,
    manifestVersion: SyntheticManifestVersion,
  ) {
    this.assertCleanupTarget(dataset, options);
    if (dataset.optionsHash !== syntheticOptionsHash(options, manifestVersion)) {
      throw new Error("같은 datasetId가 다른 옵션으로 이미 존재합니다.");
    }
  }

  private assertCompletedCount(planned: SyntheticApplicantPlanRecord[], actual: SyntheticManifestRecord[]) {
    const active = actual.filter((record) => !record.cleanedAt);
    if (active.length !== planned.length) {
      throw new Error(`manifest 생성 건수가 목표와 다릅니다: expected=${planned.length}, actual=${active.length}`);
    }
    const ordinals = new Set(active.map((record) => record.ordinal));
    if (ordinals.size !== planned.length || planned.some((record) => !ordinals.has(record.ordinal))) {
      throw new Error("manifest ordinal에 누락 또는 중복이 있습니다.");
    }
  }

  private applyResult(
    target: SyntheticTargetPosting,
    dataset: SyntheticDatasetManifest,
    records: SyntheticManifestRecord[],
    idempotent: boolean,
  ) {
    const activeRecords = records.filter((record) => !record.cleanedAt);
    return {
      action: "apply" as const,
      idempotent,
      target,
      datasetId: dataset.datasetId,
      manifestVersion: dataset.manifestVersion,
      datasetStatus: dataset.status,
      created: {
        total: activeRecords.length,
        active: activeRecords.filter((record) => !record.isCanceled).length,
        canceled: activeRecords.filter((record) => record.isCanceled).length,
        interactive: activeRecords.filter((record) => record.isInteractive).length,
      },
      interactiveEvidence: summarizeOutputRecords(activeRecords.filter((record) => record.isInteractive)),
      pipelineEvidence: summarizeOutputRecords(activeRecords.filter((record) => record.pipelineSelected)),
    };
  }

  private cleanupResult(
    target: SyntheticTargetPosting,
    dataset: SyntheticDatasetManifest,
    records: SyntheticManifestRecord[],
    idempotent: boolean,
  ) {
    return {
      action: "cleanup" as const,
      idempotent,
      target,
      datasetId: dataset.datasetId,
      datasetStatus: dataset.status,
      manifestRecords: records.length,
      cleanedRecords: records.filter((record) => record.cleanedAt).length,
      remainingRecords: records.filter((record) => !record.cleanedAt).length,
    };
  }
}

type SyntheticOutputRecord = Pick<
  SyntheticApplicantPlanRecord | SyntheticManifestRecord,
  "ordinal" | "lifecycleStage" | "dataDepth"
>;

function summarizeOutputRecords(records: SyntheticOutputRecord[]) {
  const ordinals = records.map((record) => record.ordinal);
  return {
    count: records.length,
    ordinalRange: {
      first: ordinals.length === 0 ? null : Math.min(...ordinals),
      last: ordinals.length === 0 ? null : Math.max(...ordinals),
    },
    stages: countOutputRecords(records, "lifecycleStage"),
    depths: countOutputRecords(records, "dataDepth"),
  };
}

function countOutputRecords(records: SyntheticOutputRecord[], field: "lifecycleStage" | "dataDepth") {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = record[field];
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

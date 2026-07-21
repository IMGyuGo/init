import type { SyntheticImporterOptions } from "./synthetic-applicant-importer.contract";

export const SYNTHETIC_V3_OPERATIONAL_CONTRACT = {
  postingId: 36n,
  activeCount: 1_000,
  canceledCount: 50,
  interactiveCount: 10,
  pipelineSelectionCount: 0,
  batchSize: 100,
} as const;

export function assertV3SyntheticOperationalContract(
  actual: Pick<
    SyntheticImporterOptions,
    "postingId" | "activeCount" | "canceledCount" | "interactiveCount" | "pipelineSelectionCount" | "batchSize"
  >,
) {
  for (const field of [
    "postingId",
    "activeCount",
    "canceledCount",
    "interactiveCount",
    "pipelineSelectionCount",
    "batchSize",
  ] as const) {
    if (actual[field] !== SYNTHETIC_V3_OPERATIONAL_CONTRACT[field]) {
      throw new Error(
        `V3 operational contract ${field}가 승인값과 다릅니다: expected=${SYNTHETIC_V3_OPERATIONAL_CONTRACT[field]}, actual=${actual[field]}`,
      );
    }
  }
}

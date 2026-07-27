import { createHash } from "node:crypto";
import { ANSWER_FACT_CHECK_MOCK_MODEL_VERSION } from "./answer-fact-check";
import {
  FACT_EVIDENCE_SOURCE_KINDS,
  NO_EXTERNAL_KNOWLEDGE_VERSION,
  type AnswerFactCheckProvider,
  type FactCheckProviderMode,
  type FactEvidenceLedgerItem,
} from "./answer-fact-check.types";
import type { NcsAnswerFactCheckContext } from "./ncs-report-evaluation.adapter";
import { NonRetryableAiWorkerFailure } from "./worker-errors";

export interface FactCheckContextOptions {
  provider?: AnswerFactCheckProvider;
  configuredModelVersion?: string;
  providerMode?: FactCheckProviderMode;
  jobDescription?: string;
  documentSummary?: string;
}

export function factCheckContextOf(
  value: unknown,
  options: FactCheckContextOptions = {},
): NcsAnswerFactCheckContext {
  if (value === undefined || value === null) {
    return fallbackFactCheckContext(options);
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new NonRetryableAiWorkerFailure("factCheckContext must be an object");
  }
  const record = value as Record<string, unknown>;
  const knowledgeSnapshotVersion = requiredText(
    record.knowledgeSnapshotVersion,
    "factCheckContext.knowledgeSnapshotVersion",
  );
  if (!Array.isArray(record.evidenceLedger)) {
    throw new NonRetryableAiWorkerFailure("factCheckContext.evidenceLedger must be an array");
  }
  const evidenceIds = new Set<string>();
  const evidenceLedger = record.evidenceLedger.map((item, index): FactEvidenceLedgerItem => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new NonRetryableAiWorkerFailure(`factCheckContext.evidenceLedger[${index}] must be an object`);
    }
    const evidence = item as Record<string, unknown>;
    const evidenceId = requiredText(evidence.evidenceId, `factCheckContext.evidenceLedger[${index}].evidenceId`);
    if (evidenceIds.has(evidenceId)) {
      throw new NonRetryableAiWorkerFailure(`duplicate fact-check evidence ID: ${evidenceId}`);
    }
    evidenceIds.add(evidenceId);
    const sourceKind = evidence.sourceKind;
    if (
      typeof sourceKind !== "string" ||
      !(FACT_EVIDENCE_SOURCE_KINDS as readonly string[]).includes(sourceKind)
    ) {
      throw new NonRetryableAiWorkerFailure(`factCheckContext.evidenceLedger[${index}].sourceKind is unsupported`);
    }
    const text = requiredText(evidence.text, `factCheckContext.evidenceLedger[${index}].text`);
    const startOffset = nonNegativeInteger(
      evidence.startOffset,
      `factCheckContext.evidenceLedger[${index}].startOffset`,
    );
    const endOffset = positiveInteger(
      evidence.endOffset,
      `factCheckContext.evidenceLedger[${index}].endOffset`,
    );
    if (endOffset <= startOffset || endOffset - startOffset !== text.length) {
      throw new NonRetryableAiWorkerFailure(`factCheckContext.evidenceLedger[${index}] offsets do not match text`);
    }
    return {
      evidenceId,
      sourceSnapshotId: requiredText(
        evidence.sourceSnapshotId,
        `factCheckContext.evidenceLedger[${index}].sourceSnapshotId`,
      ),
      sourceKind: sourceKind as FactEvidenceLedgerItem["sourceKind"],
      startOffset,
      endOffset,
      text,
    };
  });
  return baseContext(options, knowledgeSnapshotVersion, evidenceLedger);
}

function fallbackFactCheckContext(options: FactCheckContextOptions): NcsAnswerFactCheckContext {
  const evidenceLedger = [
    evidenceOf("JD_SNAPSHOT", options.jobDescription),
    evidenceOf("RESUME_SNAPSHOT", options.documentSummary),
  ].filter((item): item is FactEvidenceLedgerItem => item !== undefined);
  const knowledgeSnapshotVersion = evidenceLedger.length === 0
    ? NO_EXTERNAL_KNOWLEDGE_VERSION
    : `FOLLOW_UP_CONTEXT_V1:${hash(evidenceLedger.map((item) => item.sourceSnapshotId).join(":"))}`;
  return baseContext(options, knowledgeSnapshotVersion, evidenceLedger);
}

function baseContext(
  options: FactCheckContextOptions,
  knowledgeSnapshotVersion: string,
  evidenceLedger: FactEvidenceLedgerItem[],
): NcsAnswerFactCheckContext {
  return {
    provider: options.provider,
    providerMode: options.providerMode ?? (options.provider ? "openai" : "mock"),
    configuredModelVersion:
      options.configuredModelVersion?.trim() || ANSWER_FACT_CHECK_MOCK_MODEL_VERSION,
    knowledgeSnapshotVersion,
    evidenceLedger,
  };
}

function evidenceOf(
  sourceKind: "JD_SNAPSHOT" | "RESUME_SNAPSHOT",
  value: string | undefined,
): FactEvidenceLedgerItem | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const digest = hash(text);
  return {
    evidenceId: `${sourceKind.toLowerCase()}:${digest}`,
    sourceKind,
    sourceSnapshotId: digest,
    startOffset: 0,
    endOffset: text.length,
    text,
  };
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new NonRetryableAiWorkerFailure(`${name} is required`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new NonRetryableAiWorkerFailure(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new NonRetryableAiWorkerFailure(`${name} must be a positive integer`);
  }
  return parsed;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

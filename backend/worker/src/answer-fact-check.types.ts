import type { NcsQuestionMode } from "./ncs-text-evaluation.types";

export const ANSWER_FACT_CHECK_PROMPT_VERSION = "NCS_ANSWER_FACT_CHECK_PROMPT_V4" as const;
export const ANSWER_FACT_CHECK_POLICY_VERSION = "NCS_ANSWER_FACT_CHECK_POLICY_V1" as const;
export const NO_EXTERNAL_KNOWLEDGE_VERSION = "NO_EXTERNAL_KNOWLEDGE_V1" as const;

export const FACT_CHECK_VERDICTS = [
  "SUPPORTED",
  "CONTRADICTED",
  "AMBIGUOUS",
  "UNVERIFIABLE",
  "NOT_CHECKABLE",
] as const;
export const FACT_CLAIM_TYPES = [
  "TECHNICAL_FACT",
  "PERSONAL_EXPERIENCE",
  "OPINION",
  "OTHER",
] as const;
export const FACT_CLAIM_ROLES = ["ANSWER_CORE", "SUPPORTING"] as const;
export const FACT_EVIDENCE_SOURCE_KINDS = [
  "ANSWER_SNAPSHOT",
  "RESUME_SNAPSHOT",
  "JD_SNAPSHOT",
  "KNOWLEDGE_SNAPSHOT",
] as const;
export const FACT_CHECK_INPUT_COMPOSITION_VERSIONS = ["BASE_ONLY_V1", "BASE_FOLLOW_UP_V1"] as const;

export type FactCheckVerdict = (typeof FACT_CHECK_VERDICTS)[number];
export type FactClaimType = (typeof FACT_CLAIM_TYPES)[number];
export type FactClaimRole = (typeof FACT_CLAIM_ROLES)[number];
export type FactEvidenceSourceKind = (typeof FACT_EVIDENCE_SOURCE_KINDS)[number];
export type FactCheckInputCompositionVersion = (typeof FACT_CHECK_INPUT_COMPOSITION_VERSIONS)[number];
export type FactCheckProviderMode = "mock" | "openai";
export type FactCheckProviderStatus = "COMPLETED" | "FAILED" | "TIMEOUT" | "INVALID_OUTPUT";
export type FactCheckGateStatus = "PASS_THROUGH" | "CLARIFICATION_CANDIDATE" | "FACT_CHECK_REQUIRED";
export type TranscriptUsability = "USABLE" | "UNUSABLE";

export interface FactEvidenceLedgerItem {
  evidenceId: string;
  sourceKind: FactEvidenceSourceKind;
  sourceSnapshotId: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface AnswerFactCheckInput {
  answerId: number;
  question: string;
  answerText: string;
  questionMode: NcsQuestionMode;
  knowledgeSnapshotVersion: string;
  evidenceLedger: FactEvidenceLedgerItem[];
}

export interface AnswerFactCheckClaim {
  claimText: string;
  startOffset: number;
  endOffset: number;
  claimType: FactClaimType;
  claimRole: FactClaimRole;
  verdict: FactCheckVerdict;
  confidence: number;
  evidenceIds: string[];
  rationale: string;
}

export interface AnswerFactCheckProviderResult {
  transcriptUsability?: TranscriptUsability;
  claims: AnswerFactCheckClaim[];
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface AnswerFactCheckProvider {
  evaluate(input: AnswerFactCheckInput): Promise<AnswerFactCheckProviderResult>;
}

export class AnswerFactCheckInputError extends Error {
  readonly code = "FACT_CHECK_INPUT_INVALID";
}

export class AnswerFactCheckInvalidOutputError extends Error {
  readonly code = "FACT_CHECK_INVALID_OUTPUT";
}

export class AnswerFactCheckTimeoutError extends Error {
  readonly code = "FACT_CHECK_TIMEOUT";
}

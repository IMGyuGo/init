import type { AnswerFactCheckRunRecord } from "./ai-result.repository";
import {
  ANSWER_FACT_CHECK_POLICY_VERSION,
  ANSWER_FACT_CHECK_PROMPT_VERSION,
  AnswerFactCheckClaim,
  AnswerFactCheckInput,
  AnswerFactCheckInvalidOutputError,
  AnswerFactCheckProvider,
  AnswerFactCheckTimeoutError,
  FactCheckGateStatus,
  FactCheckInputCompositionVersion,
  FactCheckProviderMode,
} from "./answer-fact-check.types";

export const ANSWER_FACT_CHECK_HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const ANSWER_FACT_CHECK_MOCK_MODEL_VERSION = "deterministic-fact-check-noop-v1";

export interface AnswerFactCheckExecution {
  record: AnswerFactCheckRunRecord;
  usage?: {
    modelName: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface RunAnswerFactCheckOptions {
  reportId: number;
  followUpAnswerId?: number;
  inputCompositionVersion?: FactCheckInputCompositionVersion;
  input: AnswerFactCheckInput;
  provider?: AnswerFactCheckProvider;
  providerMode: FactCheckProviderMode;
  configuredModelVersion: string;
  now?: () => Date;
}

export async function runAnswerFactCheck(options: RunAnswerFactCheckOptions): Promise<AnswerFactCheckExecution> {
  const execution = await evaluateAnswerFactCheck(options);
  return {
    ...execution,
    record: {
      reportId: options.reportId,
      ...execution.record,
      ...(options.followUpAnswerId ? { followUpAnswerId: options.followUpAnswerId } : {}),
      inputCompositionVersion: options.inputCompositionVersion ?? "BASE_ONLY_V1",
    },
  };
}

export type AnswerFactCheckPrecheckRecord = Omit<
  AnswerFactCheckRunRecord,
  "reportId" | "followUpAnswerId" | "inputCompositionVersion"
>;

export interface AnswerFactCheckPrecheckExecution {
  record: AnswerFactCheckPrecheckRecord;
  usage?: AnswerFactCheckExecution["usage"];
}

export type EvaluateAnswerFactCheckOptions = Omit<
  RunAnswerFactCheckOptions,
  "reportId" | "followUpAnswerId" | "inputCompositionVersion"
>;

export async function evaluateAnswerFactCheck(
  options: EvaluateAnswerFactCheckOptions,
): Promise<AnswerFactCheckPrecheckExecution> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  try {
    const result = options.provider
      ? await options.provider.evaluate(options.input)
      : { claims: [], model: ANSWER_FACT_CHECK_MOCK_MODEL_VERSION };
    const completedAt = now();
    const claims = result.claims.map((claim) => toStoredClaim(claim, options.input));
    return {
      record: {
        answerId: options.input.answerId,
        providerStatus: "COMPLETED",
        gateStatus: determineFactCheckGate(result.claims),
        providerMode: options.providerMode,
        modelVersion: result.model,
        promptVersion: ANSWER_FACT_CHECK_PROMPT_VERSION,
        knowledgeSnapshotVersion: options.input.knowledgeSnapshotVersion,
        policyVersion: ANSWER_FACT_CHECK_POLICY_VERSION,
        failureReason: null,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        claims,
      },
      ...(result.usage ? {
        usage: {
          modelName: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      } : {}),
    };
  } catch (error) {
    const completedAt = now();
    return {
      record: {
        answerId: options.input.answerId,
        providerStatus: providerFailureStatus(error),
        gateStatus: null,
        providerMode: options.providerMode,
        modelVersion: options.configuredModelVersion,
        promptVersion: ANSWER_FACT_CHECK_PROMPT_VERSION,
        knowledgeSnapshotVersion: options.input.knowledgeSnapshotVersion,
        policyVersion: ANSWER_FACT_CHECK_POLICY_VERSION,
        failureReason: sanitizeFailureReason(error),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        claims: [],
      },
    };
  }
}

export function determineFactCheckGate(claims: readonly AnswerFactCheckClaim[]): FactCheckGateStatus {
  let status: FactCheckGateStatus = "PASS_THROUGH";
  for (const claim of claims) {
    if (
      claim.verdict === "CONTRADICTED" &&
      claim.claimType === "TECHNICAL_FACT" &&
      claim.claimRole === "ANSWER_CORE"
    ) {
      if (claim.confidence >= ANSWER_FACT_CHECK_HIGH_CONFIDENCE_THRESHOLD) {
        return "FACT_CHECK_REQUIRED";
      }
      status = "CLARIFICATION_CANDIDATE";
      continue;
    }
    if (claim.verdict === "AMBIGUOUS") {
      status = "CLARIFICATION_CANDIDATE";
    }
  }
  return status;
}

function toStoredClaim(
  claim: AnswerFactCheckClaim,
  input: AnswerFactCheckInput,
): AnswerFactCheckRunRecord["claims"][number] {
  const evidenceById = new Map(input.evidenceLedger.map((evidence) => [evidence.evidenceId, evidence]));
  return {
    claimText: claim.claimText,
    answerStartOffset: claim.startOffset,
    answerEndOffset: claim.endOffset,
    claimType: claim.claimType,
    claimRole: claim.claimRole,
    verdict: claim.verdict,
    confidence: claim.confidence,
    rationale: claim.rationale,
    evidences: claim.evidenceIds.map((evidenceId) => {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        throw new AnswerFactCheckInvalidOutputError(`unknown fact-check evidence ID: ${evidenceId}`);
      }
      return {
        evidenceLedgerId: evidence.evidenceId,
        sourceSnapshotId: evidence.sourceSnapshotId,
        sourceKind: evidence.sourceKind,
        sourceStartOffset: evidence.startOffset,
        sourceEndOffset: evidence.endOffset,
      };
    }),
  };
}

function providerFailureStatus(error: unknown): "FAILED" | "TIMEOUT" | "INVALID_OUTPUT" {
  if (error instanceof AnswerFactCheckTimeoutError) return "TIMEOUT";
  if (error instanceof AnswerFactCheckInvalidOutputError) return "INVALID_OUTPUT";
  return "FAILED";
}

function sanitizeFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown fact-check provider failure";
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "unknown fact-check provider failure";
}

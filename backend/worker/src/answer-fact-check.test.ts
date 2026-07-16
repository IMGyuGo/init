import assert from "node:assert/strict";
import test from "node:test";
import { ANSWER_FACT_CHECK_GOLDEN_CASES } from "./answer-fact-check.golden";
import {
  ANSWER_FACT_CHECK_HIGH_CONFIDENCE_THRESHOLD,
  determineFactCheckGate,
  runAnswerFactCheck,
} from "./answer-fact-check";
import {
  AnswerFactCheckClaim,
  AnswerFactCheckInvalidOutputError,
  AnswerFactCheckProvider,
  AnswerFactCheckTimeoutError,
} from "./answer-fact-check.types";

test("fact gate applies deterministic precedence across multiple claims", () => {
  const supported = claim("SUPPORTED", 0.99, "ANSWER_CORE");
  const ambiguous = claim("AMBIGUOUS", 0.6, "SUPPORTING");
  const contradicted = claim("CONTRADICTED", ANSWER_FACT_CHECK_HIGH_CONFIDENCE_THRESHOLD, "ANSWER_CORE");

  assert.equal(determineFactCheckGate([supported]), "PASS_THROUGH");
  assert.equal(determineFactCheckGate([supported, ambiguous]), "CLARIFICATION_CANDIDATE");
  assert.equal(determineFactCheckGate([ambiguous, contradicted]), "FACT_CHECK_REQUIRED");
});

test("supporting contradictions and unverifiable personal experiences do not block scores", () => {
  assert.equal(determineFactCheckGate([
    claim("CONTRADICTED", 0.99, "SUPPORTING"),
    {
      ...claim("UNVERIFIABLE", 0.8, "ANSWER_CORE"),
      claimType: "PERSONAL_EXPERIENCE",
      evidenceIds: [],
    },
  ]), "PASS_THROUGH");
});

test("low-confidence core contradiction requests clarification instead of a hard gate", () => {
  assert.equal(
    determineFactCheckGate([claim("CONTRADICTED", ANSWER_FACT_CHECK_HIGH_CONFIDENCE_THRESHOLD - 0.01, "ANSWER_CORE")]),
    "CLARIFICATION_CANDIDATE",
  );
});

test("fact-check runner keeps timeout separate from UNVERIFIABLE", async () => {
  const input = ANSWER_FACT_CHECK_GOLDEN_CASES[0]!.input;
  const execution = await runAnswerFactCheck({
    reportId: 71,
    input,
    providerMode: "openai",
    configuredModelVersion: "gpt-test",
    provider: throwingProvider(new AnswerFactCheckTimeoutError("deadline exceeded")),
  });

  assert.equal(execution.record.providerStatus, "TIMEOUT");
  assert.equal(execution.record.gateStatus, null);
  assert.deepEqual(execution.record.claims, []);
});

test("fact-check runner stores INVALID_OUTPUT without claims", async () => {
  const input = ANSWER_FACT_CHECK_GOLDEN_CASES[0]!.input;
  const execution = await runAnswerFactCheck({
    reportId: 71,
    input,
    providerMode: "openai",
    configuredModelVersion: "gpt-test",
    provider: throwingProvider(new AnswerFactCheckInvalidOutputError("strict schema mismatch")),
  });

  assert.equal(execution.record.providerStatus, "INVALID_OUTPUT");
  assert.equal(execution.record.failureReason, "strict schema mismatch");
  assert.deepEqual(execution.record.claims, []);
});

function claim(
  verdict: AnswerFactCheckClaim["verdict"],
  confidence: number,
  claimRole: AnswerFactCheckClaim["claimRole"],
): AnswerFactCheckClaim {
  return {
    claimText: "C는 객체지향 언어입니다.",
    startOffset: 0,
    endOffset: "C는 객체지향 언어입니다.".length,
    claimType: "TECHNICAL_FACT",
    claimRole,
    verdict,
    confidence,
    evidenceIds: verdict === "SUPPORTED" || verdict === "CONTRADICTED" ? ["K1"] : [],
    rationale: "deterministic gate test",
  };
}

function throwingProvider(error: Error): AnswerFactCheckProvider {
  return {
    async evaluate() {
      throw error;
    },
  };
}

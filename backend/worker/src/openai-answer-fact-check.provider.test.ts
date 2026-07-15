import assert from "node:assert/strict";
import test from "node:test";
import { ANSWER_FACT_CHECK_GOLDEN_CASES } from "./answer-fact-check.golden";
import {
  AnswerFactCheckInputError,
  AnswerFactCheckInvalidOutputError,
} from "./answer-fact-check.types";
import {
  assertAnswerFactCheckInput,
  parseAnswerFactCheckContent,
} from "./openai-answer-fact-check.provider";

for (const golden of ANSWER_FACT_CHECK_GOLDEN_CASES) {
  test(`fact-check golden: ${golden.name}`, () => {
    const parsed = parseAnswerFactCheckContent(JSON.stringify({ claims: golden.claims }), golden.input);
    assert.deepEqual(parsed, golden.claims);
  });
}

test("fact-check rejects unsupported claims without supplied evidence", () => {
  const golden = ANSWER_FACT_CHECK_GOLDEN_CASES[1]!;
  const claim = { ...golden.claims[0]!, evidenceIds: [] };
  assert.throws(
    () => parseAnswerFactCheckContent(JSON.stringify({ claims: [claim] }), golden.input),
    AnswerFactCheckInvalidOutputError,
  );
});

test("fact-check rejects model assertions that cite unknown evidence", () => {
  const golden = ANSWER_FACT_CHECK_GOLDEN_CASES[0]!;
  const claim = { ...golden.claims[0]!, evidenceIds: ["MODEL_MEMORY"] };
  assert.throws(
    () => parseAnswerFactCheckContent(JSON.stringify({ claims: [claim] }), golden.input),
    /unknown evidence ID/,
  );
});

test("fact-check rejects a claim that is not an exact answer segment", () => {
  const golden = ANSWER_FACT_CHECK_GOLDEN_CASES[0]!;
  const claim = { ...golden.claims[0]!, startOffset: 1 };
  assert.throws(
    () => parseAnswerFactCheckContent(JSON.stringify({ claims: [claim] }), golden.input),
    /exact answer segment/,
  );
});

test("fact-check rejects strict schema violations", () => {
  const golden = ANSWER_FACT_CHECK_GOLDEN_CASES[0]!;
  assert.throws(
    () => parseAnswerFactCheckContent(JSON.stringify({ claims: golden.claims, gateStatus: "PASS_THROUGH" }), golden.input),
    /must contain exactly/,
  );
  assert.throws(
    () => parseAnswerFactCheckContent(JSON.stringify({ claims: [{ ...golden.claims[0], confidence: "HIGH" }] }), golden.input),
    /confidence must be between/,
  );
});

test("fact-check input requires unique evidence IDs and exact source ranges", () => {
  const golden = ANSWER_FACT_CHECK_GOLDEN_CASES[0]!;
  const evidence = golden.input.evidenceLedger[0]!;
  assert.throws(
    () => assertAnswerFactCheckInput({ ...golden.input, evidenceLedger: [evidence, evidence] }),
    AnswerFactCheckInputError,
  );
  assert.throws(
    () => assertAnswerFactCheckInput({
      ...golden.input,
      evidenceLedger: [{ ...evidence, endOffset: evidence.endOffset + 1 }],
    }),
    /offsets do not match/,
  );
});

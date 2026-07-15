import assert from "node:assert/strict";
import test from "node:test";
import type { AnswerFactCheckRunRecord } from "./ai-result.repository";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { PrismaAiResultRepository } from "./prisma-ai-result.repository";

test("fact-check repository stores completed claims and snapshot evidence transactionally", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  let transactionCount = 0;
  const client = {
    answerFactCheckRun: {
      async deleteMany(args: unknown) {
        calls.push({ method: "deleteMany", args });
      },
      async create(args: unknown) {
        calls.push({ method: "create", args });
      },
    },
  };
  const prisma = {
    ...client,
    async $transaction<T>(operation: (transaction: typeof client) => Promise<T>): Promise<T> {
      transactionCount += 1;
      return operation(client);
    },
  };
  const repository = new PrismaAiResultRepository(prisma as never);

  await repository.saveAnswerFactChecks(71, [completedRecord()]);

  assert.equal(transactionCount, 1);
  assert.equal(calls[0]?.method, "deleteMany");
  assert.deepEqual(calls[0]?.args, { where: { reportId: 71n } });
  const create = calls[1]?.args as {
    data: {
      providerStatus: string;
      gateStatus: string;
      claims: { create: Array<{ evidences: { create: Array<Record<string, unknown>> } }> };
    };
  };
  assert.equal(create.data.providerStatus, "COMPLETED");
  assert.equal(create.data.gateStatus, "FACT_CHECK_REQUIRED");
  assert.equal(create.data.claims.create.length, 1);
  assert.deepEqual(create.data.claims.create[0]?.evidences.create[0], {
    evidenceLedgerId: "K1",
    sourceSnapshotId: "knowledge:c-language:v1",
    sourceKind: "KNOWLEDGE_SNAPSHOT",
    sourceStartOffset: 0,
    sourceEndOffset: 38,
    sortOrder: 1,
  });
});

test("fact-check repository stores provider failure without claims or a gate", async () => {
  const repository = new InMemoryAiResultRepository();
  const failed: AnswerFactCheckRunRecord = {
    ...completedRecord(),
    providerStatus: "TIMEOUT",
    gateStatus: null,
    failureReason: "provider exceeded 30000ms",
    claims: [],
  };

  await repository.saveAnswerFactChecks(71, [failed]);

  assert.deepEqual(repository.answerFactChecks.get(71), [failed]);
});

test("fact-check repository rejects failure records disguised as unverifiable claims", async () => {
  const repository = new InMemoryAiResultRepository();
  const invalid: AnswerFactCheckRunRecord = {
    ...completedRecord(),
    providerStatus: "FAILED",
    gateStatus: null,
    failureReason: "provider failed",
  };

  await assert.rejects(
    repository.saveAnswerFactChecks(71, [invalid]),
    /invalid fact-check run/,
  );
});

function completedRecord(): AnswerFactCheckRunRecord {
  return {
    reportId: 71,
    answerId: 101,
    providerStatus: "COMPLETED",
    gateStatus: "FACT_CHECK_REQUIRED",
    providerMode: "mock",
    modelVersion: "fixture-v1",
    promptVersion: "NCS_ANSWER_FACT_CHECK_PROMPT_V1",
    knowledgeSnapshotVersion: "NCS_FACT_GOLDEN_2026_07_V1",
    policyVersion: "NCS_ANSWER_FACT_CHECK_POLICY_V1",
    failureReason: null,
    startedAt: "2026-07-15T08:00:00.000Z",
    completedAt: "2026-07-15T08:00:01.000Z",
    claims: [{
      claimText: "C는 객체지향 언어입니다.",
      answerStartOffset: 0,
      answerEndOffset: "C는 객체지향 언어입니다.".length,
      claimType: "TECHNICAL_FACT",
      claimRole: "ANSWER_CORE",
      verdict: "CONTRADICTED",
      confidence: 0.98,
      rationale: "승인된 지식 snapshot과 모순됩니다.",
      evidences: [{
        evidenceLedgerId: "K1",
        sourceSnapshotId: "knowledge:c-language:v1",
        sourceKind: "KNOWLEDGE_SNAPSHOT",
        sourceStartOffset: 0,
        sourceEndOffset: 38,
      }],
    }],
  };
}

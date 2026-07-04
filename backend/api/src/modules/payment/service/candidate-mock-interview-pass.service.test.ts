import assert from "node:assert/strict";
import { describe, it } from "@jest/globals";

import { PrismaService } from "../../../shared/prisma.service";
import {
  CandidateMockInterviewPassService,
  CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES,
} from "./candidate-mock-interview-pass.service";

type FakeLedgerRecord = {
  ledgerId: bigint;
  candidateId: bigint;
  paymentOrderId: bigint | null;
  usedSessionId: bigint | null;
  source: string;
  changeAmount: number;
  expiresAt: Date | null;
  createdAt: Date;
};

describe("CandidateMockInterviewPassService", () => {
  it("grants the initial free passes once when concurrent requests race", async () => {
    const { prisma, records, createAttempts } = createConcurrentInitialFreePassPrisma();
    const service = new CandidateMockInterviewPassService(prisma as unknown as PrismaService);
    const now = new Date("2026-07-04T00:00:00.000Z");

    const [first, second] = await Promise.all([
      service.ensureInitialFreePasses(3, now),
      service.ensureInitialFreePasses(3, now),
    ]);

    assert.equal(first.availablePasses, CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES);
    assert.equal(second.availablePasses, CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES);
    assert.equal(createAttempts.count, 2);
    assert.equal(records.filter((record) => record.candidateId === 3n && record.source === "FREE_SIGNUP").length, 1);
  });
});

function createConcurrentInitialFreePassPrisma() {
  const records: FakeLedgerRecord[] = [];
  const createAttempts = { count: 0 };
  let nextLedgerId = 1n;
  let findFirstCalls = 0;
  let releaseFindFirsts: (() => void) | undefined;
  const bothFindFirstsStarted = new Promise<void>((resolve) => {
    releaseFindFirsts = resolve;
  });

  const ledger = {
    async findFirst(args: { where: { candidateId: bigint; source: string } }) {
      findFirstCalls += 1;
      if (findFirstCalls === 2) {
        releaseFindFirsts?.();
      }
      await bothFindFirstsStarted;
      return records.find(
        (record) => record.candidateId === args.where.candidateId && record.source === args.where.source,
      ) ?? null;
    },
    async findMany(args: { where: { candidateId: bigint } }) {
      return records.filter((record) => record.candidateId === args.where.candidateId);
    },
    async create(args: {
      data: {
        candidateId: bigint;
        paymentOrderId?: bigint | null;
        usedSessionId?: bigint | null;
        source: string;
        changeAmount: number;
        expiresAt?: Date | null;
      };
    }) {
      createAttempts.count += 1;
      if (
        args.data.source === "FREE_SIGNUP" &&
        records.some((record) => record.candidateId === args.data.candidateId && record.source === "FREE_SIGNUP")
      ) {
        const error = new Error("Unique constraint failed on FREE_SIGNUP");
        (error as { code?: string }).code = "P2002";
        throw error;
      }

      const record: FakeLedgerRecord = {
        ledgerId: nextLedgerId,
        candidateId: args.data.candidateId,
        paymentOrderId: args.data.paymentOrderId ?? null,
        usedSessionId: args.data.usedSessionId ?? null,
        source: args.data.source,
        changeAmount: args.data.changeAmount,
        expiresAt: args.data.expiresAt ?? null,
        createdAt: new Date("2026-07-04T00:00:00.000Z"),
      };
      nextLedgerId += 1n;
      records.push(record);
      return record;
    },
  };

  return {
    prisma: {
      candidateMockInterviewPassLedger: ledger,
    },
    records,
    createAttempts,
  };
}

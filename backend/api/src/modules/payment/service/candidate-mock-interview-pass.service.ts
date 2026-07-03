import { Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@init/common";

import { ApiException } from "../../../shared/api-exception";
import { PrismaService } from "../../../shared/prisma.service";

export const CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES = 3;
export const CANDIDATE_MOCK_INTERVIEW_FREE_PASS_EXPIRES_IN_DAYS = 30;

export type CandidateMockInterviewPassSummary = {
  candidateId: number;
  availablePasses: number;
  grantedPasses: number;
  usedPasses: number;
  freePasses: number;
  paidPasses: number;
  freeExpiresAt: Date | null;
  updatedAt: Date;
};

export type CandidateMockInterviewPassPort = {
  ensureInitialFreePasses(candidateId: number, now?: Date): Promise<CandidateMockInterviewPassSummary>;
  grantPurchasedPasses(
    candidateId: number,
    paymentOrderId: number,
    passAmount: number,
    now?: Date,
  ): Promise<CandidateMockInterviewPassSummary>;
  grantDevelopmentPasses?(candidateId: number, passAmount: number, now?: Date): Promise<CandidateMockInterviewPassSummary>;
  consumePass(candidateId: number, passAmount?: number, usedSessionId?: number, now?: Date): Promise<CandidateMockInterviewPassSummary>;
};

type CandidateMockInterviewPassLedgerRecord = {
  ledgerId: bigint;
  candidateId: bigint;
  paymentOrderId: bigint | null;
  usedSessionId: bigint | null;
  source: string;
  changeAmount: number;
  expiresAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class CandidateMockInterviewPassService implements CandidateMockInterviewPassPort {
  constructor(private readonly prisma: PrismaService) {}

  async ensureInitialFreePasses(
    candidateId: number,
    now = new Date(),
  ): Promise<CandidateMockInterviewPassSummary> {
    const existing = await this.ledger.findFirst({
      where: { candidateId: BigInt(candidateId), source: "FREE_SIGNUP" },
      select: { ledgerId: true },
    });

    if (!existing) {
      await this.ledger.create({
        data: {
          candidateId: BigInt(candidateId),
          source: "FREE_SIGNUP",
          changeAmount: CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES,
          expiresAt: addDays(now, CANDIDATE_MOCK_INTERVIEW_FREE_PASS_EXPIRES_IN_DAYS),
        },
      });
    }

    return this.getSummary(candidateId, now);
  }

  async grantPurchasedPasses(
    candidateId: number,
    paymentOrderId: number,
    passAmount: number,
    now = new Date(),
  ): Promise<CandidateMockInterviewPassSummary> {
    if (!Number.isInteger(passAmount) || passAmount < 1) {
      return this.getSummary(candidateId, now);
    }

    const existing = await this.ledger.findFirst({
      where: { paymentOrderId: BigInt(paymentOrderId), source: "PURCHASE" },
      select: { ledgerId: true },
    });
    if (!existing) {
      await this.ledger.create({
        data: {
          candidateId: BigInt(candidateId),
          paymentOrderId: BigInt(paymentOrderId),
          source: "PURCHASE",
          changeAmount: passAmount,
          expiresAt: null,
        },
      });
    }

    return this.getSummary(candidateId, now);
  }

  async grantDevelopmentPasses(
    candidateId: number,
    passAmount: number,
    now = new Date(),
  ): Promise<CandidateMockInterviewPassSummary> {
    if (!Number.isInteger(passAmount) || passAmount < 1) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "지급할 모의면접 이용권 수량이 올바르지 않습니다.", 400);
    }

    await this.ensureInitialFreePasses(candidateId, now);
    await this.ledger.create({
      data: {
        candidateId: BigInt(candidateId),
        source: "DEV_GRANT",
        changeAmount: passAmount,
        expiresAt: null,
      },
    });

    return this.getSummary(candidateId, now);
  }

  async consumePass(
    candidateId: number,
    passAmount = 1,
    usedSessionId?: number,
    now = new Date(),
  ): Promise<CandidateMockInterviewPassSummary> {
    if (!Number.isInteger(passAmount) || passAmount < 1) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "차감할 모의면접 이용권 수량이 올바르지 않습니다.", 400);
    }

    await this.ensureInitialFreePasses(candidateId, now);
    const before = await this.getSummary(candidateId, now);
    if (before.availablePasses < passAmount) {
      throw new ApiException(ERROR_CODES.COMMON_CONFLICT, "사용 가능한 모의면접 이용권이 부족합니다.", 409, [
        { field: "mockInterviewPass", reason: "PASS_REQUIRED", availablePasses: before.availablePasses },
      ]);
    }

    await this.ledger.create({
      data: {
        candidateId: BigInt(candidateId),
        usedSessionId: usedSessionId ? BigInt(usedSessionId) : null,
        source: "USAGE",
        changeAmount: -passAmount,
        expiresAt: null,
      },
    });

    return this.getSummary(candidateId, now);
  }

  private async getSummary(candidateId: number, now: Date): Promise<CandidateMockInterviewPassSummary> {
    const rows = await this.ledger.findMany({
      where: {
        candidateId: BigInt(candidateId),
        OR: [{ changeAmount: { lt: 0 } }, { expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ createdAt: "asc" }, { ledgerId: "asc" }],
    }) as CandidateMockInterviewPassLedgerRecord[];

    const grantedPasses = rows.filter((row) => row.changeAmount > 0).reduce((sum, row) => sum + row.changeAmount, 0);
    const usedPasses = Math.abs(rows.filter((row) => row.changeAmount < 0).reduce((sum, row) => sum + row.changeAmount, 0));
    const freeRows = rows.filter((row) => row.source === "FREE_SIGNUP" && row.changeAmount > 0);
    const freePasses = freeRows.reduce((sum, row) => sum + row.changeAmount, 0);
    const paidPasses = rows
      .filter((row) => row.source === "PURCHASE" && row.changeAmount > 0)
      .reduce((sum, row) => sum + row.changeAmount, 0);

    return {
      candidateId,
      availablePasses: Math.max(0, grantedPasses - usedPasses),
      grantedPasses,
      usedPasses,
      freePasses,
      paidPasses,
      freeExpiresAt: freeRows.map((row) => row.expiresAt).filter((value): value is Date => Boolean(value))[0] ?? null,
      updatedAt: new Date(),
    };
  }

  private get ledger() {
    return (this.prisma as unknown as {
      candidateMockInterviewPassLedger: {
        findFirst(args: unknown): Promise<CandidateMockInterviewPassLedgerRecord | null>;
        findMany(args: unknown): Promise<CandidateMockInterviewPassLedgerRecord[]>;
        create(args: unknown): Promise<CandidateMockInterviewPassLedgerRecord>;
      };
    }).candidateMockInterviewPassLedger;
  }
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

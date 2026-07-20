import { PrismaScreeningRetryRepository } from "./prisma-screening-retry.repository";

describe("PrismaScreeningRetryRepository", () => {
  function prismaFixture(options: { reason?: string; active?: boolean | "BACKOFF" } = {}) {
    const created: Array<Record<string, unknown>> = [];
    const source = {
      processLogId: BigInt(20),
      processType: "REPORT_GENERATE",
      status: "FAILED",
      inputRef: JSON.stringify({ payload: { reportId: 30, reportType: "RECRUITING_REPORT" } }),
      applicationId: BigInt(10),
      sessionId: BigInt(40),
      attemptCount: 3,
      maxAttempts: 3,
      nextRetryAt: null,
    };
    const active = options.active
      ? {
          ...source,
          processLogId: BigInt(21),
          status: options.active === "BACKOFF" ? "FAILED" : "RUNNING",
          failureCategory: options.active === "BACKOFF" ? "RETRYABLE" : null,
          attemptCount: options.active === "BACKOFF" ? 1 : 2,
          nextRetryAt: options.active === "BACKOFF" ? new Date("2026-07-20T12:15:00.000Z") : null,
        }
      : null;
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ application_id: BigInt(10) }]),
      application: {
        findUnique: jest.fn().mockResolvedValue({
          screeningDecision: "RETRY",
          screeningDecisionReasonCode: options.reason ?? "RETRY_REPORT_FAILED",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      aiProcessLog: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(active)
          .mockResolvedValueOnce(source),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { ...source, ...data };
        }),
      },
      evaluationReport: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
      aiProcessLog: {
        findUnique: jest.fn().mockResolvedValue(source),
        update: jest.fn().mockResolvedValue(source),
        findFirst: jest.fn().mockResolvedValue(active),
      },
      evaluationReport: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      application: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    return { prisma, transaction, created };
  }

  it("creates a new OPERATOR audit process from the latest report input", async () => {
    const { prisma, created } = prismaFixture();
    const repository = new PrismaScreeningRetryRepository(prisma as never);

    await expect(repository.prepare(10)).resolves.toMatchObject({
      action: "REPORT_RETRY",
      created: true,
      process: { attempt: 1, maxAttempts: 3 },
    });
    expect(created[0]).toMatchObject({
      applicationId: BigInt(10),
      sessionId: BigInt(40),
      retrySource: "OPERATOR",
      retryOfProcessLogId: BigInt(20),
      attemptCount: 1,
      maxAttempts: 3,
    });
  });

  it("returns the active report process instead of creating a duplicate", async () => {
    const { prisma, transaction, created } = prismaFixture({ active: true });
    const repository = new PrismaScreeningRetryRepository(prisma as never);

    await expect(repository.prepare(10)).resolves.toMatchObject({
      action: "REPORT_RETRY",
      created: false,
      process: { processLogId: 21, status: "RUNNING", attempt: 2 },
    });
    expect(transaction.aiProcessLog.findFirst).toHaveBeenCalledTimes(1);
    expect(created).toEqual([]);
  });

  it("reuses a retryable report process that is waiting for its backoff", async () => {
    const { prisma, transaction, created } = prismaFixture({ active: "BACKOFF" });
    const repository = new PrismaScreeningRetryRepository(prisma as never);

    await expect(repository.prepare(10)).resolves.toMatchObject({
      action: "REPORT_RETRY",
      created: false,
      process: { processLogId: 21, status: "FAILED", attempt: 1 },
    });
    expect(transaction.aiProcessLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            status: "FAILED",
            failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
            attemptCount: { lt: 3 },
          }),
        ]),
      }),
    }));
    expect(created).toEqual([]);
  });

  it("does not create a report job for terminal STT unavailable", async () => {
    const { prisma, created } = prismaFixture({ reason: "RETRY_STT_UNAVAILABLE" });
    const repository = new PrismaScreeningRetryRepository(prisma as never);

    await expect(repository.prepare(10)).resolves.toEqual({ action: "CANDIDATE_REANSWER_REQUIRED" });
    expect(created).toEqual([]);
  });

  it("reuses the active report process when a concurrent insert wins the unique constraint", async () => {
    const { prisma } = prismaFixture({ active: true });
    prisma.$transaction.mockRejectedValue({ code: "P2002" });
    const repository = new PrismaScreeningRetryRepository(prisma as never);

    await expect(repository.prepare(10)).resolves.toMatchObject({
      action: "REPORT_RETRY",
      created: false,
      process: { processLogId: 21, status: "RUNNING", attempt: 2 },
    });
  });
});

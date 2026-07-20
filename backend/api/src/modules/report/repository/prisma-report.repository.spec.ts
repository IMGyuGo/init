import { PrismaReportRepository } from "./prisma-report.repository";

describe("PrismaReportRepository report process locking", () => {
  it("serializes recruiting report process creation on the application row", async () => {
    const fixture = reportProcessFixture();
    const repository = new PrismaReportRepository(fixture.prisma as never);

    await repository.createQueuedProcess("REPORT_GENERATE", "{}", {
      applicationId: 22,
      sessionId: 65,
    });

    expect(fixture.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(fixture.transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "application_id" FROM "applications" WHERE "application_id" = $1 FOR UPDATE',
      BigInt(22),
    );
    expect(fixture.transaction.aiProcessLog.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ processLogId: expect.anything() }),
    });
  });

  it("serializes mock report process creation on the interview session row", async () => {
    const fixture = reportProcessFixture();
    const repository = new PrismaReportRepository(fixture.prisma as never);

    await repository.createQueuedProcess("REPORT_GENERATE", "{}", { sessionId: 65 });

    expect(fixture.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(fixture.transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "session_id" FROM "interview_sessions" WHERE "session_id" = $1 FOR UPDATE',
      BigInt(65),
    );
  });
});

function reportProcessFixture() {
  const aiProcessLog = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      processLogId: 701n,
      ...data,
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: null,
    })),
  };
  const transaction = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    aiProcessLog,
  };
  const prisma = {
    aiProcessLog,
    $transaction: jest.fn(async (operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction)),
  };
  return { prisma, transaction };
}

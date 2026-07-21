import { PrismaReportRepository } from "./prisma-report.repository";
import { SALTLUX_FIXED_DEMO } from "../../../shared/saltlux-fixed-demo";

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

  it("persists the Saltlux fixed report with database-compatible provider and retry values", async () => {
    const fixture = reportProcessFixture();
    const repository = new PrismaReportRepository(fixture.prisma as never);

    await repository.finalizeSaltluxFixedDemo(saltluxFinalizationInput());

    const evaluationCreates = fixture.transaction.ncsAnswerEvaluation.create.mock.calls;
    expect(evaluationCreates).toHaveLength(3);
    expect(evaluationCreates.every(([args]) => args.data.providerMode === "mock")).toBe(true);

    expect(fixture.transaction.aiProcessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        processType: "REPORT_GENERATE",
        status: "COMPLETED",
        attemptCount: 1,
      }),
    });
    const processData = fixture.transaction.aiProcessLog.create.mock.calls[0]?.[0].data;
    expect(processData).not.toHaveProperty("maxAttempts");
  });
});

function reportProcessFixture() {
  const aiProcessLog = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      processLogId: 701n,
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: null,
      ...data,
    })),
  };
  const transaction = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    aiProcessLog,
    evaluationReport: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    reportEvidence: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    reportScore: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    ncsAnswerEvaluation: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    application: {
      findUnique: jest.fn().mockResolvedValue({
        screeningDecisionReportId: null,
        posting: {
          autoScreeningPolicy: null,
          questionGenerationPolicy: null,
          criteria: [],
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    aiProcessLog,
    $transaction: jest.fn(async (operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction)),
  };
  return { prisma, transaction };
}

function saltluxFinalizationInput() {
  const jobBinding = {
    criterionId: 11,
    criterionTitleSnapshot: "직무 전문성",
    ncsProfileId: "JOB_TECHNICAL" as const,
    ncsProfileVersion: "NCS_ACTIVE_PROFILE_V2",
    alignmentStatus: "ALIGNED",
    bindingOrder: 1 as const,
  };
  const collaborationBinding = {
    criterionId: 12,
    criterionTitleSnapshot: "협업 및 의사소통",
    ncsProfileId: "COLLABORATION_COMMUNICATION" as const,
    ncsProfileVersion: "NCS_ACTIVE_PROFILE_V2",
    alignmentStatus: "ALIGNED",
    bindingOrder: 1 as const,
  };
  const problemBinding = {
    criterionId: 13,
    criterionTitleSnapshot: "문제 해결력",
    ncsProfileId: "PROBLEM_SOLVING" as const,
    ncsProfileVersion: "NCS_ACTIVE_PROFILE_V2",
    alignmentStatus: "ALIGNED",
    bindingOrder: 2 as const,
  };

  return {
    reportId: 31,
    applicationId: 21,
    sessionId: 31,
    criteria: [
      { criterionId: 11, name: "직무 전문성", weight: 30 },
      { criterionId: 12, name: "협업 및 의사소통", weight: 30 },
      { criterionId: 13, name: "문제 해결력", weight: 40 },
    ],
    answers: [
      {
        answerId: 101,
        sessionQuestionId: 201,
        question: SALTLUX_FIXED_DEMO.questions.common,
        ncsBindings: [collaborationBinding],
      },
      {
        answerId: 102,
        sessionQuestionId: 202,
        question: SALTLUX_FIXED_DEMO.questions.personalized,
        ncsBindings: [jobBinding, problemBinding],
      },
      {
        answerId: 103,
        sessionQuestionId: 203,
        question: SALTLUX_FIXED_DEMO.questions.followUp,
        isFollowUpAnswer: true,
        parentAnswerId: 102,
        ncsBindings: [jobBinding, problemBinding],
      },
    ],
  };
}

import { ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "../../../common/dev-auth/current-user";
import type { PrismaService } from "../../../shared/prisma.service";
import { AiPerformanceService } from "./ai-performance.service";

describe("AiPerformanceService", () => {
  const candidateUser: CurrentUser = {
    userId: 2,
    userType: "CANDIDATE",
    candidateId: 1
  };
  const companyUser: CurrentUser = {
    userId: 1,
    userType: "COMPANY",
    companyId: 1
  };

  it("records client logs for a candidate-owned interview session", async () => {
    const prisma = createPrisma();
    prisma.interviewSession.findUnique.mockResolvedValue({
      candidateId: BigInt(1),
      application: null
    });
    prisma.clientPerformanceLog.create.mockResolvedValue({
      clientPerformanceLogId: BigInt(77),
      eventName: "ANSWER_TO_NEXT_QUESTION",
      durationMs: 3200,
      createdAt: new Date("2026-07-06T10:00:00.000Z")
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    const result = await service.recordClientLog(
      {
        eventName: "ANSWER_TO_NEXT_QUESTION",
        durationMs: 3200,
        sessionId: 10
      },
      candidateUser
    );

    expect(result).toEqual({
      id: 77,
      eventName: "ANSWER_TO_NEXT_QUESTION",
      durationMs: 3200,
      createdAt: "2026-07-06T10:00:00.000Z"
    });
    expect(prisma.interviewSession.findUnique).toHaveBeenCalledWith({
      where: { sessionId: BigInt(10) },
      select: {
        candidateId: true,
        application: {
          select: {
            candidateId: true,
            posting: { select: { companyId: true } }
          }
        }
      }
    });
    expect(prisma.clientPerformanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventName: "ANSWER_TO_NEXT_QUESTION",
          sessionId: BigInt(10),
          durationMs: 3200
        })
      })
    );
  });

  it("rejects client logs for another candidate's interview session", async () => {
    const prisma = createPrisma();
    prisma.interviewSession.findUnique.mockResolvedValue({
      candidateId: BigInt(999),
      application: null
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 3200,
          sessionId: 10
        },
        candidateUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });

  it("records client logs for a company-owned AI process", async () => {
    const prisma = createPrisma();
    prisma.aiProcessLog.findUnique.mockResolvedValue({
      inputRef: JSON.stringify({
        requestedBy: {
          userId: 1,
          userType: "COMPANY",
          companyId: 1
        }
      }),
      application: null,
      session: null
    });
    prisma.clientPerformanceLog.create.mockResolvedValue({
      clientPerformanceLogId: BigInt(78),
      eventName: "ANSWER_TO_NEXT_QUESTION",
      durationMs: 1200,
      createdAt: new Date("2026-07-06T10:01:00.000Z")
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await service.recordClientLog(
      {
        eventName: "ANSWER_TO_NEXT_QUESTION",
        durationMs: 1200,
        processLogId: 30
      },
      companyUser
    );

    expect(prisma.clientPerformanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processLogId: BigInt(30)
        })
      })
    );
  });

  it("rejects client logs for another user's AI process", async () => {
    const prisma = createPrisma();
    prisma.aiProcessLog.findUnique.mockResolvedValue({
      inputRef: JSON.stringify({
        requestedBy: {
          userId: 4,
          userType: "COMPANY",
          companyId: 2
        }
      }),
      application: null,
      session: null
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 1200,
          processLogId: 30
        },
        companyUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });
});

function createPrisma() {
  return {
    clientPerformanceLog: {
      create: jest.fn()
    },
    aiProcessLog: {
      findUnique: jest.fn()
    },
    interviewSession: {
      findUnique: jest.fn()
    },
    application: {
      findUnique: jest.fn()
    }
  };
}

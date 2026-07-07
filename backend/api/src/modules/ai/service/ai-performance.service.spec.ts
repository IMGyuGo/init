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

  it("records client logs only when the question belongs to the candidate session", async () => {
    const prisma = createPrisma();
    prisma.interviewSession.findUnique
      .mockResolvedValueOnce({
        candidateId: BigInt(1),
        application: null
      })
      .mockResolvedValueOnce({
        interviewType: "MOCK",
        application: null
      });
    prisma.interviewAnswer.findFirst.mockResolvedValue(null);
    prisma.question.findUnique.mockResolvedValue({
      questionType: "TECHNICAL",
      postingId: null,
      content: "Tell me about a backend issue."
    });
    prisma.clientPerformanceLog.create.mockResolvedValue({
      clientPerformanceLogId: BigInt(79),
      eventName: "ANSWER_TO_NEXT_QUESTION",
      durationMs: 900,
      createdAt: new Date("2026-07-06T10:02:00.000Z")
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await service.recordClientLog(
      {
        eventName: "ANSWER_TO_NEXT_QUESTION",
        durationMs: 900,
        sessionId: 10,
        questionId: 3
      },
      candidateUser
    );

    expect(prisma.clientPerformanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: BigInt(10),
          questionId: BigInt(3)
        })
      })
    );
  });

  it("rejects client logs when the question does not belong to the candidate session", async () => {
    const prisma = createPrisma();
    prisma.interviewSession.findUnique
      .mockResolvedValueOnce({
        candidateId: BigInt(1),
        application: null
      })
      .mockResolvedValueOnce({
        interviewType: "MOCK",
        application: null
      });
    prisma.interviewAnswer.findFirst.mockResolvedValue(null);
    prisma.question.findUnique.mockResolvedValue({
      questionType: "TECHNICAL",
      postingId: BigInt(50),
      content: "This is a recruiting question."
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 900,
          sessionId: 10,
          questionId: 50
        },
        candidateUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });

  it("records client logs for a generated follow-up question tied to the follow-up process", async () => {
    const prisma = createPrisma();
    prisma.interviewSession.findUnique
      .mockResolvedValueOnce({
        candidateId: BigInt(1),
        application: null
      })
      .mockResolvedValueOnce({
        interviewType: "MOCK",
        application: null
      });
    prisma.aiProcessLog.findUnique
      .mockResolvedValueOnce({
        inputRef: JSON.stringify({
          requestedBy: {
            userId: 2,
            userType: "CANDIDATE",
            candidateId: 1
          }
        }),
        application: null,
        session: null
      })
      .mockResolvedValueOnce({
        processType: "FOLLOW_UP",
        status: "COMPLETED",
        outputRef: JSON.stringify({
          sessionId: 10,
          content: "평가 항목 답변을 더 구체적인 사례와 수치로 보강해 보세요."
        })
      });
    prisma.interviewAnswer.findFirst.mockResolvedValue(null);
    prisma.question.findUnique.mockResolvedValue({
      questionType: "FOLLOW_UP",
      postingId: null,
      content: "평가 항목 답변을 더 구체적인 사례와 수치로 보강해 보세요."
    });
    prisma.clientPerformanceLog.create.mockResolvedValue({
      clientPerformanceLogId: BigInt(80),
      eventName: "ANSWER_TO_NEXT_QUESTION",
      durationMs: 1500,
      createdAt: new Date("2026-07-06T10:03:00.000Z")
    });
    prisma.aiProcessLog.findUnique.mockResolvedValueOnce({
      sessionId: BigInt(10),
      applicationId: null,
      session: { applicationId: null }
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await service.recordClientLog(
      {
        eventName: "ANSWER_TO_NEXT_QUESTION",
        durationMs: 1500,
        processLogId: 31,
        sessionId: 10,
        questionId: 99
      },
      candidateUser
    );

    expect(prisma.clientPerformanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processLogId: BigInt(31),
          sessionId: BigInt(10),
          questionId: BigInt(99)
        })
      })
    );
  });

  it("rejects client logs when visible process and session references are unrelated", async () => {
    const prisma = createPrisma();
    prisma.aiProcessLog.findUnique
      .mockResolvedValueOnce({
        inputRef: JSON.stringify({
          requestedBy: {
            userId: 2,
            userType: "CANDIDATE",
            candidateId: 1
          }
        }),
        application: null,
        session: null
      })
      .mockResolvedValueOnce({
        sessionId: BigInt(20),
        applicationId: null,
        session: { applicationId: null }
      });
    prisma.interviewSession.findUnique.mockResolvedValue({
      candidateId: BigInt(1),
      application: null
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 900,
          processLogId: 31,
          sessionId: 10
        },
        candidateUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });

  it("rejects client logs when a process without context is combined with a session", async () => {
    const prisma = createPrisma();
    prisma.aiProcessLog.findUnique
      .mockResolvedValueOnce({
        inputRef: JSON.stringify({
          requestedBy: {
            userId: 2,
            userType: "CANDIDATE",
            candidateId: 1
          }
        }),
        application: null,
        session: null
      })
      .mockResolvedValueOnce({
        sessionId: null,
        applicationId: null,
        session: null
      });
    prisma.interviewSession.findUnique.mockResolvedValue({
      candidateId: BigInt(1),
      application: null
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 900,
          processLogId: 31,
          sessionId: 10
        },
        candidateUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });

  it("rejects client logs when the process has inconsistent session and application references", async () => {
    const prisma = createPrisma();
    prisma.aiProcessLog.findUnique
      .mockResolvedValueOnce({
        inputRef: JSON.stringify({
          requestedBy: {
            userId: 2,
            userType: "CANDIDATE",
            candidateId: 1
          }
        }),
        application: null,
        session: null
      })
      .mockResolvedValueOnce({
        sessionId: BigInt(20),
        applicationId: BigInt(9),
        session: { applicationId: BigInt(8) }
      });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 900,
          processLogId: 31
        },
        candidateUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });

  it("rejects client logs when visible session and application references are unrelated", async () => {
    const prisma = createPrisma();
    prisma.interviewSession.findUnique
      .mockResolvedValueOnce({
        candidateId: BigInt(1),
        application: null
      })
      .mockResolvedValueOnce({
        applicationId: BigInt(777)
      });
    prisma.application.findUnique.mockResolvedValue({
      candidateId: BigInt(1),
      posting: { companyId: BigInt(1) }
    });

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 900,
          sessionId: 10,
          applicationId: 9
        },
        candidateUser
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clientPerformanceLog.create).not.toHaveBeenCalled();
  });

  it("rejects client logs when questionId is provided without a verifiable context", async () => {
    const prisma = createPrisma();

    const service = new AiPerformanceService(prisma as unknown as PrismaService);
    await expect(
      service.recordClientLog(
        {
          eventName: "ANSWER_TO_NEXT_QUESTION",
          durationMs: 900,
          questionId: 50
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
    },
    interviewAnswer: {
      findFirst: jest.fn()
    },
    question: {
      findUnique: jest.fn()
    }
  };
}

import assert from "node:assert/strict";
import { PrismaInterviewRepository } from "./prisma-interview.repository";

test("prisma interview repository persists answers through interview_answers", async () => {
  const createCalls: unknown[] = [];
  const submittedAt = "2026-07-01T00:00:00.000Z";
  const repository = new PrismaInterviewRepository({
    interviewAnswer: {
      create: async (args: unknown) => {
        createCalls.push(args);
        return {
          answerId: 101n,
          sessionId: 10001n,
          questionId: 20001n,
          videoFileId: 30001n,
          audioFileId: null,
          transcript: null,
          durationSeconds: 42,
          submittedAt: new Date(submittedAt),
        };
      },
    },
  } as never);

  const answer = await repository.createAnswer({
    sessionId: 10001,
    questionId: 20001,
    videoFileId: 30001,
    durationSeconds: 42,
    submittedAt,
  });

  assert.deepEqual(createCalls, [
    {
      data: {
        sessionId: 10001n,
        questionId: 20001n,
        videoFileId: 30001n,
        audioFileId: null,
        durationSeconds: 42,
        submittedAt: new Date(submittedAt),
      },
    },
  ]);
  assert.equal(answer.answerId, 101);
  assert.equal(answer.sessionId, 10001);
  assert.equal(answer.questionId, 20001);
  assert.equal(answer.videoFileId, 30001);
});

test("prisma interview repository persists mock session question order", async () => {
  const questionCreateManyCalls: unknown[] = [];
  const session = {
    sessionId: 10001n,
    applicationId: null,
    candidateId: 7n,
    interviewType: "MOCK",
    status: "IN_PROGRESS",
    showQuestionText: true,
    startedAt: new Date("2026-07-10T00:00:00.000Z"),
    completedAt: null,
  };
  const transactionClient = {
    interviewSession: {
      create: async () => session,
    },
    interviewSessionQuestion: {
      createMany: async (args: unknown) => {
        questionCreateManyCalls.push(args);
        return { count: 2 };
      },
    },
  };
  const repository = new PrismaInterviewRepository({
    $transaction: async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
    interviewAnswer: {
      findMany: async () => [],
    },
  } as never);

  const created = await repository.createMockSession({
    candidateId: 7,
    showQuestionText: true,
    questionIds: [301, 205],
    startedAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  });

  assert.deepEqual(questionCreateManyCalls, [
    {
      data: [
        { sessionId: 10001n, questionId: 301n, sortOrder: 1 },
        { sessionId: 10001n, questionId: 205n, sortOrder: 2 },
      ],
    },
  ]);
  assert.deepEqual(created.questionIds, [301, 205]);
});

test("prisma interview repository restores persisted questions after restart", async () => {
  const repository = new PrismaInterviewRepository({
    interviewSession: {
      findFirst: async () => ({
        sessionId: 10001n,
        applicationId: null,
        candidateId: 7n,
        interviewType: "MOCK",
        status: "IN_PROGRESS",
        showQuestionText: false,
        startedAt: new Date("2026-07-10T00:00:00.000Z"),
        completedAt: null,
      }),
    },
    interviewSessionQuestion: {
      findMany: async () => [{ questionId: 301n }, { questionId: 205n }],
    },
    interviewAnswer: {
      findMany: async () => [],
    },
  } as never);

  const restored = await repository.findMockSession(10001);

  assert.deepEqual(restored?.questionIds, [301, 205]);
});

test("prisma interview repository persists appended runtime questions", async () => {
  const deleteManyCalls: unknown[] = [];
  const createManyCalls: unknown[] = [];
  const savedSession = {
    sessionId: 10001n,
    applicationId: null,
    candidateId: 7n,
    interviewType: "MOCK",
    status: "IN_PROGRESS",
    showQuestionText: false,
    startedAt: new Date("2026-07-10T00:00:00.000Z"),
    completedAt: null,
    application: null,
  };
  const transactionClient = {
    interviewSession: {
      update: async () => savedSession,
    },
    interviewSessionQuestion: {
      deleteMany: async (args: unknown) => {
        deleteManyCalls.push(args);
        return { count: 2 };
      },
      createMany: async (args: unknown) => {
        createManyCalls.push(args);
        return { count: 3 };
      },
    },
  };
  const repository = new PrismaInterviewRepository({
    $transaction: async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
  } as never);

  await repository.saveRuntimeSession({
    sessionId: 10001,
    candidateId: 7,
    interviewType: "MOCK",
    status: "IN_PROGRESS",
    showQuestionText: false,
    currentQuestionIndex: 1,
    questionIds: [301, 205, 999],
    startedAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:01:00.000Z",
  });

  assert.deepEqual(deleteManyCalls, [{ where: { sessionId: 10001n } }]);
  assert.deepEqual(createManyCalls, [
    {
      data: [
        { sessionId: 10001n, questionId: 301n, sortOrder: 1 },
        { sessionId: 10001n, questionId: 205n, sortOrder: 2 },
        { sessionId: 10001n, questionId: 999n, sortOrder: 3 },
      ],
    },
  ]);
});

test("prisma interview repository resolves inactive questions linked to a session", async () => {
  const repository = new PrismaInterviewRepository({
    question: {
      findUnique: async () => ({
        questionId: 301n,
        companyId: 1n,
        postingId: null,
        criterionId: null,
        questionType: "TECHNICAL",
        content: "폴더 컨텍스트 질문",
        isActive: false,
      }),
    },
    interviewSessionQuestion: {
      findFirst: async () => ({ sessionId: 10001n }),
    },
  } as never);

  const question = await repository.findQuestion(301);

  assert.equal(question?.content, "폴더 컨텍스트 질문");
});

import assert from "node:assert/strict";
import { PrismaInterviewRepository } from "./prisma-interview.repository";

test("prisma interview repository persists answers through interview_answers", async () => {
  const createCalls: unknown[] = [];
  const submittedAt = "2026-07-01T00:00:00.000Z";
  const transcript = "실시간 STT로 변환된 답변입니다.";
  const nonverbalMetadata = {
    cameraWarnings: 1,
    microphoneWarnings: 0,
    longSilenceCount: 2,
    testModeUsed: false,
  };
  const repository = new PrismaInterviewRepository({
    interviewSessionQuestion: {
      findFirst: async () => ({ sessionQuestionId: 501n, questionId: 20001n }),
    },
    interviewAnswer: {
      create: async (args: unknown) => {
        createCalls.push(args);
        return {
          answerId: 101n,
          sessionId: 10001n,
          questionId: 20001n,
          sessionQuestionId: 501n,
          videoFileId: 30001n,
          audioFileId: null,
          transcript,
          nonverbalMetadata,
          durationSeconds: 42,
          submittedAt: new Date(submittedAt),
          sessionQuestion: { runtimeQuestionId: null },
        };
      },
    },
  } as never);

  const answer = await repository.createAnswer({
    sessionId: 10001,
    questionId: 20001,
    videoFileId: 30001,
    transcript,
    nonverbalMetadata,
    durationSeconds: 42,
    submittedAt,
  });

  assert.deepEqual(createCalls, [
    {
      data: {
        sessionId: 10001n,
        questionId: 20001n,
        sessionQuestionId: 501n,
        videoFileId: 30001n,
        audioFileId: null,
        transcript,
        nonverbalMetadata,
        durationSeconds: 42,
        submittedAt: new Date(submittedAt),
      },
      include: { sessionQuestion: { select: { runtimeQuestionId: true } } },
    },
  ]);
  assert.equal(answer.answerId, 101);
  assert.equal(answer.sessionId, 10001);
  assert.equal(answer.questionId, 20001);
  assert.equal(answer.videoFileId, 30001);
  assert.equal(answer.transcript, transcript);
  assert.deepEqual(answer.nonverbalMetadata, nonverbalMetadata);
});

test("prisma interview repository replaces transcript and nonverbal metadata together", async () => {
  const updateCalls: unknown[] = [];
  const submittedAt = "2026-07-01T00:01:00.000Z";
  const transcript = "재답변의 실시간 STT 결과입니다.";
  const nonverbalMetadata = {
    cameraWarnings: 0,
    microphoneWarnings: 0,
    longSilenceCount: 0,
    testModeUsed: false,
    integritySummary: { gazeAwayCount: 1, suspicionLevel: "LOW" as const },
  };
  const repository = new PrismaInterviewRepository({
    interviewAnswer: {
      update: async (args: unknown) => {
        updateCalls.push(args);
        return {
          answerId: 101n,
          sessionId: 10001n,
          questionId: 20001n,
          videoFileId: 30002n,
          audioFileId: null,
          transcript,
          nonverbalMetadata,
          durationSeconds: 36,
          submittedAt: new Date(submittedAt),
        };
      },
    },
  } as never);

  const answer = await repository.replaceAnswer({
    answerId: 101,
    videoFileId: 30002,
    transcript,
    nonverbalMetadata,
    durationSeconds: 36,
    submittedAt,
  });

  assert.deepEqual(updateCalls, [
    {
      where: { answerId: 101n },
      data: {
        videoFileId: 30002n,
        audioFileId: null,
        nonverbalMetadata,
        durationSeconds: 36,
        submittedAt: new Date(submittedAt),
        transcript,
      },
      include: { sessionQuestion: { select: { runtimeQuestionId: true } } },
    },
  ]);
  assert.equal(answer.answerId, 101);
  assert.equal(answer.transcript, transcript);
  assert.deepEqual(answer.nonverbalMetadata, nonverbalMetadata);
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

test("prisma interview repository starts private mock session and consumes pass atomically", async () => {
  const sessionQuestionCreates: unknown[] = [];
  const ledgerCreates: unknown[] = [];
  const session = {
    sessionId: 10002n,
    applicationId: null,
    candidateId: 7n,
    interviewType: "MOCK",
    status: "IN_PROGRESS",
    showQuestionText: true,
    startedAt: new Date("2026-07-10T00:00:00.000Z"),
    completedAt: null,
  };
  let sequence = 9000n;
  const transactionClient = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ questionId: sequence++ }],
    candidateMockInterviewPassLedger: {
      findFirst: async () => ({ ledgerId: 1n }),
      findMany: async () => [{ changeAmount: 3 }],
      create: async (args: unknown) => {
        ledgerCreates.push(args);
        return {};
      },
    },
    interviewSession: { create: async () => session },
    interviewSessionQuestion: {
      create: async (args: unknown) => {
        sessionQuestionCreates.push(args);
        return {};
      },
    },
  };
  const repository = new PrismaInterviewRepository({
    $transaction: async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
    interviewAnswer: { findMany: async () => [] },
  } as never);

  const created = await repository.createMockSessionWithPass({
    candidateId: 7,
    showQuestionText: true,
    contextQuestions: [
      { questionType: "INTRO", content: "제출한 이력서 자료를 바탕으로 소개해주세요.", sortOrder: 1 },
      { questionType: "TECHNICAL", content: "제출한 프로젝트 자료의 기술 선택을 설명해주세요.", sortOrder: 2 },
    ],
    startedAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  });

  assert.deepEqual(created.questionIds, [9000, 9001]);
  assert.deepEqual(ledgerCreates, [{
    data: {
      candidateId: 7n,
      usedSessionId: 10002n,
      source: "USAGE",
      changeAmount: -1,
      expiresAt: null,
    },
  }]);
  assert.equal(sessionQuestionCreates.length, 2);
  assert.deepEqual(sessionQuestionCreates[0], {
    data: {
      sessionId: 10002n,
      questionId: null,
      runtimeQuestionId: 9000n,
      questionType: "INTRO",
      content: "제출한 이력서 자료를 바탕으로 소개해주세요.",
      sortOrder: 1,
    },
  });
});

test("prisma interview repository resolves private session question without company question bank", async () => {
  const repository = new PrismaInterviewRepository({
    question: { findUnique: async () => null },
    interviewSessionQuestion: {
      findUnique: async () => ({
        runtimeQuestionId: 9000n,
        questionType: "INTRO",
        content: "개인 세션 질문",
        sortOrder: 1,
      }),
    },
  } as never);

  const question = await repository.findQuestion(9000);

  assert.equal(question?.content, "개인 세션 질문");
  assert.equal(question?.interviewType, "MOCK");
});

test("prisma interview repository stores mock follow-up questions in the owning session", async () => {
  const sessionQuestionCreates: unknown[] = [];
  const transactionClient = {
    $queryRaw: async () => [{ questionId: 1000000000000000n }],
    interviewSessionQuestion: {
      create: async (args: unknown) => {
        sessionQuestionCreates.push(args);
        return {
          runtimeQuestionId: 1000000000000000n,
          questionType: "FOLLOW_UP",
          content: "구체적인 기술 선택 근거를 설명해주세요.",
          sortOrder: 3,
        };
      },
    },
  };
  const repository = new PrismaInterviewRepository({
    $transaction: async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
    question: {
      findUnique: async () => {
        throw new Error("mock follow-up must not read question_bank");
      },
    },
    company: {
      findFirst: async () => {
        throw new Error("mock follow-up must not select a company");
      },
    },
  } as never);

  const question = await repository.createRuntimeFollowUpQuestion({
    session: {
      sessionId: 10002,
      candidateId: 7,
      interviewType: "MOCK",
      status: "IN_PROGRESS",
      showQuestionText: true,
      currentQuestionIndex: 1,
      questionIds: [1000000000000001, 1000000000000002],
      startedAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
    sourceAnswer: {
      answerId: 11,
      sessionId: 10002,
      questionId: 1000000000000002,
      durationSeconds: 42,
      submittedAt: "2026-07-10T00:01:00.000Z",
    },
    content: "구체적인 기술 선택 근거를 설명해주세요.",
  });

  assert.equal(question.questionId, 1000000000000000);
  assert.equal(question.questionType, "FOLLOW_UP");
  assert.deepEqual(sessionQuestionCreates, [{
    data: {
      sessionId: 10002n,
      questionId: null,
      runtimeQuestionId: 1000000000000000n,
      questionType: "FOLLOW_UP",
      content: "구체적인 기술 선택 근거를 설명해주세요.",
      sortOrder: 3,
    },
  }]);
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
      findMany: async () => [
        { questionId: 301n, runtimeQuestionId: null },
        { questionId: 205n, runtimeQuestionId: null },
      ],
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
  const createCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
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
      findMany: async () => [
        { sessionQuestionId: 1n, questionId: 301n, runtimeQuestionId: null },
        { sessionQuestionId: 2n, questionId: 205n, runtimeQuestionId: null },
      ],
      updateMany: async () => ({ count: 2 }),
      update: async (args: unknown) => {
        updateCalls.push(args);
        return {};
      },
      deleteMany: async (args: unknown) => {
        deleteManyCalls.push(args);
        return { count: 0 };
      },
      create: async (args: unknown) => {
        createCalls.push(args);
        return {};
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

  assert.deepEqual(deleteManyCalls, []);
  assert.deepEqual(updateCalls, [
    { where: { sessionQuestionId: 1n }, data: { sortOrder: 1 } },
    { where: { sessionQuestionId: 2n }, data: { sortOrder: 2 } },
  ]);
  assert.deepEqual(createCalls, [
    {
      data: { sessionId: 10001n, questionId: 999n, sortOrder: 3 },
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

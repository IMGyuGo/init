import "reflect-metadata";
import { strict as assert } from "node:assert";
import { HttpException, RequestMethod } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  CandidateDomainError,
  CandidateService,
  DEV_CANDIDATE_USER,
  InMemoryCandidateRepository,
} from "../../candidate";
import { InterviewController } from "./interview.controller";
import { interviewApiRoutePrefix, interviewApiRoutes } from "../interview.routes";
import { InMemoryInterviewRepository } from "../repository/in-memory-interview.repository";
import { InterviewService } from "../service/interview.service";
import type { CandidateMockInterviewPassPort } from "../../payment/service/candidate-mock-interview-pass.service";
import { InMemoryReportRepository } from "../../report/repository/in-memory-report.repository";
import { AiJobDispatcherService } from "../../report/service/ai-job-dispatcher.service";
import { InMemoryAiJobQueuePublisher } from "../../report/service/ai-job-queue.publisher";

type InterviewControllerRoute =
  | "startMockInterview"
  | "listMockInterviewHistory"
  | "getMockRuntime"
  | "listMockQuestions"
  | "saveMockAnswer"
  | "moveMockNextQuestion"
  | "completeMockInterview"
  | "requestMockStt"
  | "requestMockFollowUpQuestion"
  | "insertMockFollowUpQuestion"
  | "createMockRealtimeSession"
  | "saveDeviceCheck"
  | "startInterview"
  | "getInterviewRuntime"
  | "listRecruitingQuestions"
  | "saveRecruitingAnswer"
  | "uploadInterviewMedia"
  | "moveRecruitingNextQuestion"
  | "completeRecruitingInterview"
  | "requestRecruitingStt"
  | "requestRecruitingFollowUpQuestion"
  | "insertRecruitingFollowUpQuestion"
  | "createRecruitingRealtimeSession";

const validCandidateRequest = {
  headers: {},
  currentUser: { ...DEV_CANDIDATE_USER, companyId: null },
};

const missingCandidateRequest = {
  headers: {},
  currentUser: undefined,
} as never;

function assertRoute(
  methodName: InterviewControllerRoute,
  expectedPath: string,
  expectedMethod: RequestMethod,
  expectedStatusCode?: number,
) {
  const handler = InterviewController.prototype[methodName];

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), expectedPath);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), expectedMethod);
  if (expectedStatusCode) {
    assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, handler), expectedStatusCode);
  }
}

assert.equal(Reflect.getMetadata(PATH_METADATA, InterviewController), interviewApiRoutePrefix);
assertRoute("startMockInterview", interviewApiRoutes.mockInterviews, RequestMethod.POST);
assertRoute("listMockInterviewHistory", interviewApiRoutes.mockHistory, RequestMethod.GET);
assertRoute("getMockRuntime", interviewApiRoutes.mockRuntime, RequestMethod.GET);
assertRoute("listMockQuestions", interviewApiRoutes.mockQuestions, RequestMethod.GET);
assertRoute("saveMockAnswer", interviewApiRoutes.mockAnswers, RequestMethod.POST, 201);
assertRoute("moveMockNextQuestion", interviewApiRoutes.mockNextQuestion, RequestMethod.POST);
assertRoute("completeMockInterview", interviewApiRoutes.mockComplete, RequestMethod.PATCH);
assertRoute("requestMockStt", interviewApiRoutes.mockStt, RequestMethod.POST);
assertRoute("requestMockFollowUpQuestion", interviewApiRoutes.mockFollowUpQuestion, RequestMethod.POST);
assertRoute("insertMockFollowUpQuestion", interviewApiRoutes.mockFollowUpQuestionInsert, RequestMethod.POST);
assertRoute("createMockRealtimeSession", interviewApiRoutes.mockRealtimeSession, RequestMethod.POST);
assertRoute("saveDeviceCheck", interviewApiRoutes.deviceCheck, RequestMethod.POST);
assertRoute("startInterview", interviewApiRoutes.startInterview, RequestMethod.POST);
assertRoute("getInterviewRuntime", interviewApiRoutes.interviewRuntime, RequestMethod.GET);
assertRoute("listRecruitingQuestions", interviewApiRoutes.recruitingQuestions, RequestMethod.GET);
assertRoute("saveRecruitingAnswer", interviewApiRoutes.recruitingAnswers, RequestMethod.POST, 201);
assertRoute("uploadInterviewMedia", interviewApiRoutes.media, RequestMethod.POST, 201);
assertRoute("moveRecruitingNextQuestion", interviewApiRoutes.recruitingNextQuestion, RequestMethod.POST);
assertRoute("completeRecruitingInterview", interviewApiRoutes.recruitingComplete, RequestMethod.PATCH);
assertRoute("requestRecruitingStt", interviewApiRoutes.recruitingStt, RequestMethod.POST);
assertRoute("requestRecruitingFollowUpQuestion", interviewApiRoutes.recruitingFollowUpQuestion, RequestMethod.POST);
assertRoute("insertRecruitingFollowUpQuestion", interviewApiRoutes.recruitingFollowUpQuestionInsert, RequestMethod.POST);
assertRoute("createRecruitingRealtimeSession", interviewApiRoutes.recruitingRealtimeSession, RequestMethod.POST);

test("mock STT handoff includes answer duration for worker usage tracking", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const dispatcher = new AiJobDispatcherService(new InMemoryReportRepository(), new InMemoryAiJobQueuePublisher());
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository, dispatcher));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const questionId = questions.data.questions[0]?.questionId ?? 0;
  const answer = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId,
    audioFile: {
      storageKey: "candidate/1/stt-duration-answer.webm",
      originalName: "stt-duration-answer.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 37,
  });

  const stt = await controller.requestMockStt(validCandidateRequest, String(started.data.sessionId), {
    answerId: answer.data.answer.answerId,
    fileAssetId: answer.data.audioFile?.fileId,
    audioS3Key: answer.data.audioFile?.storageKey,
  });
  assert.equal(stt.data.accepted, true);
  assert.equal(stt.data.processType, "STT");
  assert.ok(stt.data.inputRef?.includes('"durationSeconds":37'));
});

test("mock answer keeps realtime transcript and nonverbal metadata together", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));
  const transcript = "실시간 STT로 변환된 답변입니다.";
  const nonverbalMetadata = {
    cameraWarnings: 0,
    microphoneWarnings: 0,
    longSilenceCount: 0,
    testModeUsed: false,
    integritySummary: {
      gazeAwayCount: 1,
      suspicionLevel: "LOW",
    },
  };

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const questionId = questions.data.questions[0]?.questionId ?? 0;
  const answer = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId,
    audioFile: {
      storageKey: "candidate/1/realtime-stt-nonverbal-answer.webm",
      originalName: "realtime-stt-nonverbal-answer.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    transcript,
    nonverbalMetadata,
    durationSeconds: 37,
  });

  assert.equal(answer.data.answer.transcript, transcript);
  assert.deepEqual(answer.data.answer.nonverbalMetadata, nonverbalMetadata);
});

async function assertInterviewHttpError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
) {
  try {
    await action();
    assert.fail(`Expected ${expectedCode}`);
  } catch (error) {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), expectedStatus);

    const response = error.getResponse() as { code?: string; details?: unknown[] };
    assert.equal(response.code, expectedCode);
    assert.ok(Array.isArray(response.details));
  }
}

test("explicit follow-up insert focuses the inserted question and is idempotent", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const firstQuestionId = questions.data.questions[0]?.questionId ?? 0;

  const answer = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-for-explicit-follow-up.webm",
      originalName: "mock-answer-for-explicit-follow-up.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 30,
  });
  const moved = await controller.moveMockNextQuestion(validCandidateRequest, String(started.data.sessionId));
  assert.equal(moved.data.currentQuestion?.questionType, "TECHNICAL");

  interviewRepository.saveCompletedFollowUpProcess({
    processLogId: 9001,
    sessionId: started.data.sessionId,
    answerId: answer.data.answer.answerId,
    content: "Please explain the cache invalidation tradeoff in more detail.",
    policy: "MOCK",
  });

  const inserted = await controller.insertMockFollowUpQuestion(validCandidateRequest, String(started.data.sessionId), {
    processLogId: 9001,
  });
  assert.equal(inserted.data.inserted, true);
  assert.equal(inserted.data.question.questionType, "FOLLOW_UP");

  const runtimeAfterInsert = await controller.getMockRuntime(validCandidateRequest, String(started.data.sessionId));
  assert.equal(runtimeAfterInsert.data.currentQuestion?.questionId, inserted.data.question.questionId);

  const duplicate = await controller.insertMockFollowUpQuestion(validCandidateRequest, String(started.data.sessionId), {
    processLogId: 9001,
  });
  assert.equal(duplicate.data.inserted, false);
  assert.equal(duplicate.data.question.questionId, inserted.data.question.questionId);

  const questionsAfterDuplicate = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  assert.equal(
    questionsAfterDuplicate.data.questions.filter((question) => question.questionId === inserted.data.question.questionId).length,
    1,
  );
  assert.equal(questionsAfterDuplicate.data.questions[1]?.questionId, inserted.data.question.questionId);
});

test("mock interview start consumes one candidate mock interview pass", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const passCalls: Array<{ candidateId: number; passAmount?: number }> = [];
  const passService: CandidateMockInterviewPassPort = {
    async ensureInitialFreePasses(candidateId) {
      return {
        candidateId,
        availablePasses: 3,
        grantedPasses: 3,
        usedPasses: 0,
        freePasses: 3,
        paidPasses: 0,
        freeExpiresAt: new Date("2026-08-02T00:00:00.000Z"),
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      };
    },
    async grantPurchasedPasses(candidateId) {
      return {
        candidateId,
        availablePasses: 4,
        grantedPasses: 4,
        usedPasses: 0,
        freePasses: 3,
        paidPasses: 1,
        freeExpiresAt: new Date("2026-08-02T00:00:00.000Z"),
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      };
    },
    async consumePass(candidateId, passAmount) {
      passCalls.push({ candidateId, passAmount });
      return {
        candidateId,
        availablePasses: 2,
        grantedPasses: 3,
        usedPasses: 1,
        freePasses: 3,
        paidPasses: 0,
        freeExpiresAt: new Date("2026-08-02T00:00:00.000Z"),
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      };
    },
  };
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository, undefined, undefined, passService));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });

  assert.equal(started.data.interviewType, "MOCK");
  assert.deepEqual(passCalls, [{ candidateId: DEV_CANDIDATE_USER.candidateId, passAmount: 1 }]);
});

test("mock realtime session creates a client handoff for an active interview session", async () => {
  const originalProvider = process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
  process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "mock";
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  try {
    const started = await controller.startMockInterview(validCandidateRequest, {
      questionTypes: ["INTRO"],
      showQuestionText: false,
    });
    const realtime = await controller.createMockRealtimeSession(
      validCandidateRequest,
      String(started.data.sessionId),
      { mode: "realtime-voice" },
    );

    assert.equal(realtime.data.accepted, true);
    assert.equal(realtime.data.sessionId, started.data.sessionId);
    assert.equal(realtime.data.interviewType, "MOCK");
    assert.equal(realtime.data.mode, "realtime-voice");
    assert.equal(realtime.data.provider, "mock");
    assert.equal(realtime.data.transport, "webrtc");
    assert.equal(realtime.data.clientSecretType, "ephemeral");
    assert.match(realtime.data.clientSecret, /^mock-realtime-client-secret-/);
  } finally {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = originalProvider;
  }
});

test("openai realtime session reads client supplied speech events without automatic VAD responses", async () => {
  const originalProvider = process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const requestBodies: string[] = [];
  process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ value: "ephemeral-client-secret", expires_at: 1783300000 }), { status: 200 });
  }) as typeof fetch;

  try {
    const repository = new InMemoryCandidateRepository();
    const candidateService = new CandidateService(repository);
    const interviewRepository = new InMemoryInterviewRepository();
    const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

    const started = await controller.startMockInterview(validCandidateRequest, {
      questionTypes: ["INTRO"],
      showQuestionText: false,
    });
    const realtime = await controller.createMockRealtimeSession(
      validCandidateRequest,
      String(started.data.sessionId),
      { mode: "realtime-voice" },
    );
    const body = JSON.parse(requestBodies[0] ?? "{}") as {
      session?: {
        instructions?: string;
        audio?: {
          input?: {
            turn_detection?: {
              create_response?: boolean;
              interrupt_response?: boolean;
            };
          };
        };
      };
    };

    assert.equal(realtime.data.provider, "openai");
    assert.match(body.session?.instructions ?? "", /Read the provided Korean interview question exactly once/i);
    assert.match(body.session?.instructions ?? "", /backend-generated follow-up question exactly once/i);
    assert.match(body.session?.instructions ?? "", /Do not generate realtime follow-up questions/i);
    assert.equal(body.session?.audio?.input?.turn_detection?.create_response, false);
    assert.equal(body.session?.audio?.input?.turn_detection?.interrupt_response, false);
  } finally {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = originalProvider;
    process.env.OPENAI_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
  }
});

test("REANSWER_REQUIRED allows replacing the current answer once without creating a new answer", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const firstQuestionId = questions.data.questions[0]?.questionId ?? 0;

  const answer = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-before-reanswer.webm",
      originalName: "mock-answer-before-reanswer.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 12,
  });
  const originalAnswerId = answer.data.answer.answerId;
  const originalAudioFileId = answer.data.answer.audioFileId;

  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9101,
    sessionId: started.data.sessionId,
    answerId: originalAnswerId,
    createdAt: new Date(Date.parse(answer.data.answer.submittedAt) + 1000).toISOString(),
    failureReason: "transcript was empty",
  });

  const replaced = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-after-reanswer.webm",
      originalName: "mock-answer-after-reanswer.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 20,
    allowReanswer: true,
  });
  assert.equal(replaced.data.answer.answerId, originalAnswerId);
  assert.equal(replaced.data.answer.questionId, firstQuestionId);
  assert.notEqual(replaced.data.answer.audioFileId, originalAudioFileId);
  assert.equal(await interviewRepository.countAnswersBySession(started.data.sessionId), 1);

  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9102,
    sessionId: started.data.sessionId,
    answerId: originalAnswerId,
    createdAt: new Date(Date.parse(replaced.data.answer.submittedAt) + 1000).toISOString(),
    failureReason: "transcript was still empty after reanswer",
  });

  await assertInterviewHttpError(
    () =>
      controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
        questionId: firstQuestionId,
        audioFile: {
          storageKey: "candidate/1/mock-answer-third-reanswer.webm",
          originalName: "mock-answer-third-reanswer.webm",
          mimeType: "audio/webm",
          sizeBytes: 2048,
        },
        durationSeconds: 20,
        allowReanswer: true,
      }),
    409,
    "COMMON_CONFLICT",
  );
});

test("recording validation skip stores an unanswered answer and allows moving next", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const firstQuestionId = questions.data.questions[0]?.questionId ?? 0;

  const skipped = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    durationSeconds: 0,
    skipReason: "RECORDING_VALIDATION_FAILED",
  });
  assert.equal(skipped.data.answer.durationSeconds, 0);
  assert.equal(skipped.data.answer.transcript, "[NO_ANSWER] Recording validation failed twice.");

  const moved = await controller.moveMockNextQuestion(validCandidateRequest, String(started.data.sessionId));
  assert.equal(moved.data.previousQuestionId, firstQuestionId);
  assert.equal(moved.data.currentQuestion?.questionType, "TECHNICAL");
});

test("mock runtime can add one follow-up per base question", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL", "EXPERIENCE", "CLOSING"],
    showQuestionText: true,
  });
  const sessionId = String(started.data.sessionId);
  let runtime = await controller.getMockRuntime(validCandidateRequest, sessionId);

  const firstAnswer = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: runtime.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-limit-answer-1.webm",
      originalName: "mock-limit-answer-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });
  interviewRepository.saveGeneratedFollowUpQuestionForTest(
    firstAnswer.data.answer.answerId,
    "MOCK",
    "First follow-up question.",
  );
  let moved = await controller.moveMockNextQuestion(validCandidateRequest, sessionId);
  assert.equal(moved.data.currentQuestion?.questionType, "FOLLOW_UP");

  await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: moved.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-limit-follow-up-1.webm",
      originalName: "mock-limit-follow-up-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });
  moved = await controller.moveMockNextQuestion(validCandidateRequest, sessionId);
  assert.equal(moved.data.currentQuestion?.questionType, "TECHNICAL");

  const secondAnswer = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: moved.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-limit-answer-2.webm",
      originalName: "mock-limit-answer-2.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });
  interviewRepository.saveGeneratedFollowUpQuestionForTest(
    secondAnswer.data.answer.answerId,
    "MOCK",
    "Second follow-up question.",
  );
  moved = await controller.moveMockNextQuestion(validCandidateRequest, sessionId);
  assert.equal(moved.data.currentQuestion?.questionType, "FOLLOW_UP");

  await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: moved.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-limit-follow-up-2.webm",
      originalName: "mock-limit-follow-up-2.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });
  moved = await controller.moveMockNextQuestion(validCandidateRequest, sessionId);
  assert.equal(moved.data.currentQuestion?.questionType, "EXPERIENCE");

  const thirdAnswer = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: moved.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-limit-answer-3.webm",
      originalName: "mock-limit-answer-3.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });
  interviewRepository.saveGeneratedFollowUpQuestionForTest(
    thirdAnswer.data.answer.answerId,
    "MOCK",
    "Third follow-up question.",
  );
  moved = await controller.moveMockNextQuestion(validCandidateRequest, sessionId);

  assert.equal(moved.data.currentQuestion?.questionType, "FOLLOW_UP");
  const questions = await controller.listMockQuestions(validCandidateRequest, sessionId);
  assert.equal(questions.data.questions.filter((question) => question.questionType === "FOLLOW_UP").length, 3);
});

test("retry answer replaces the saved answer for the current question", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const firstQuestionId = questions.data.questions[0]?.questionId ?? 0;

  const first = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-retry-first.webm",
      originalName: "mock-answer-retry-first.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 3,
  });
  const retried = await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-retry-second.webm",
      originalName: "mock-answer-retry-second.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 12,
    retryAnswerId: first.data.answer.answerId,
  });

  assert.equal(retried.data.answer.answerId, first.data.answer.answerId);
  assert.equal(retried.data.answer.durationSeconds, 12);
  assert.notEqual(retried.data.answer.audioFileId, first.data.answer.audioFileId);

  const moved = await controller.moveMockNextQuestion(validCandidateRequest, String(started.data.sessionId));
  assert.equal(moved.data.previousQuestionId, firstQuestionId);
  assert.equal(moved.data.currentQuestion?.questionType, "TECHNICAL");
});

test("reanswer is rejected when the answer does not have a REANSWER_REQUIRED failure", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const firstQuestionId = questions.data.questions[0]?.questionId ?? 0;

  await controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-no-reanswer-failure.webm",
      originalName: "mock-answer-no-reanswer-failure.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 12,
  });

  await assertInterviewHttpError(
    () =>
      controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
        questionId: firstQuestionId,
        audioFile: {
          storageKey: "candidate/1/mock-answer-rejected-reanswer.webm",
          originalName: "mock-answer-rejected-reanswer.webm",
          mimeType: "audio/webm",
          sizeBytes: 2048,
        },
        durationSeconds: 20,
        allowReanswer: true,
      }),
    409,
    "COMMON_CONFLICT",
  );
});

async function runControllerRuntimeAssertions() {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const mockStarted = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });
  assert.equal(mockStarted.data.interviewType, "MOCK");
  assert.equal(mockStarted.data.status, "IN_PROGRESS");
  assert.equal(mockStarted.data.showQuestionText, false);
  assert.equal(mockStarted.data.currentQuestion?.content, undefined);
  assert.equal(mockStarted.data.totalQuestions, 2);

  const mockQuestions = await controller.listMockQuestions(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(mockQuestions.data.questions.length, 2);
  assert.equal(mockQuestions.data.questions[0]?.current, true);
  assert.equal(mockQuestions.data.questions[0]?.content, undefined);

  await assertInterviewHttpError(
    () => controller.moveMockNextQuestion(validCandidateRequest, String(mockStarted.data.sessionId)),
    409,
    "COMMON_CONFLICT",
  );

  const firstMockQuestionId = mockQuestions.data.questions[0]?.questionId ?? 0;
  const firstMockAnswer = await controller.saveMockAnswer(validCandidateRequest, String(mockStarted.data.sessionId), {
    questionId: firstMockQuestionId,
    videoFile: {
      storageKey: "candidate/1/mock-answer-1.webm",
      originalName: "mock-answer-1.webm",
      mimeType: "video/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 45,
  });
  assert.equal(firstMockAnswer.data.answer.questionId, firstMockQuestionId);
  assert.equal(firstMockAnswer.data.videoFile?.mimeType, "video/webm");
  assert.equal(firstMockAnswer.data.nextQuestionAvailable, true);

  const mockStt = await controller.requestMockStt(validCandidateRequest, String(mockStarted.data.sessionId), {
    answerId: firstMockAnswer.data.answer.answerId,
    fileAssetId: firstMockAnswer.data.answer.videoFileId,
  });
  assert.equal(mockStt.data.accepted, true);
  assert.equal(mockStt.data.processType, "STT");
  assert.equal(mockStt.data.answerId, firstMockAnswer.data.answer.answerId);
  assert.equal(mockStt.data.fileId, firstMockAnswer.data.answer.videoFileId);
  assert.equal(mockStt.data.fileAssetId, firstMockAnswer.data.answer.videoFileId);

  const mockFollowUp = await controller.requestMockFollowUpQuestion(
    validCandidateRequest,
    String(mockStarted.data.sessionId),
    { answerId: firstMockAnswer.data.answer.answerId },
  );
  assert.equal(mockFollowUp.data.processType, "FOLLOW_UP");
  interviewRepository.saveGeneratedFollowUpQuestionForTest(
    firstMockAnswer.data.answer.answerId,
    "MOCK",
    "방금 답변에서 NestJS와 PostgreSQL 프로젝트를 언급했는데, 본인이 직접 맡은 역할을 더 구체적으로 설명해 주세요.",
  );

  const nextMock = await controller.moveMockNextQuestion(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(nextMock.data.previousQuestionId, firstMockQuestionId);
  assert.equal(nextMock.data.currentQuestion?.current, true);
  assert.equal(nextMock.data.currentQuestion?.questionType, "FOLLOW_UP");
  assert.equal(nextMock.data.currentQuestion?.content, undefined);
  assert.equal(nextMock.data.isLastQuestion, false);

  await controller.saveMockAnswer(validCandidateRequest, String(mockStarted.data.sessionId), {
    questionId: nextMock.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-follow-up-answer.webm",
      originalName: "mock-follow-up-answer.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });

  const secondMock = await controller.moveMockNextQuestion(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(secondMock.data.currentQuestion?.questionType, "TECHNICAL");
  assert.equal(secondMock.data.isLastQuestion, true);

  const secondMockAnswer = await controller.saveMockAnswer(validCandidateRequest, String(mockStarted.data.sessionId), {
    questionId: secondMock.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-answer-2.webm",
      originalName: "mock-answer-2.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });

  interviewRepository.saveGeneratedFollowUpQuestionForTest(
    secondMockAnswer.data.answer.answerId,
    "MOCK",
    "방금 답변에서 NestJS와 PostgreSQL 프로젝트를 언급했는데, 본인이 직접 맡은 역할을 더 구체적으로 설명해 주세요.",
  );

  const lastMockFollowUp = await controller.moveMockNextQuestion(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(lastMockFollowUp.data.previousQuestionId, secondMock.data.currentQuestion?.questionId);
  assert.equal(lastMockFollowUp.data.currentQuestion?.questionType, "FOLLOW_UP");
  assert.equal(lastMockFollowUp.data.isLastQuestion, true);
  assert.notEqual(lastMockFollowUp.data.currentQuestion?.questionId, nextMock.data.currentQuestion?.questionId);

  await controller.saveMockAnswer(validCandidateRequest, String(mockStarted.data.sessionId), {
    questionId: lastMockFollowUp.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-answer-2-follow-up.webm",
      originalName: "mock-answer-2-follow-up.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });

  const completedMock = await controller.completeMockInterview(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(completedMock.data.status, "COMPLETED");
  assert.equal(completedMock.data.answeredCount, 4);
  assert.equal(completedMock.data.totalQuestions, 4);

  const mockHistory = await controller.listMockInterviewHistory(validCandidateRequest);
  assert.equal(mockHistory.data.items[0]?.sessionId, mockStarted.data.sessionId);
  assert.equal(mockHistory.data.items[0]?.reportStatus, "COMPLETED");

  await assertInterviewHttpError(
    () => controller.getMockRuntime(validCandidateRequest, String(mockStarted.data.sessionId)),
    409,
    "COMMON_CONFLICT",
  );

  const submitted = await repository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const session = await repository.findInterviewSessionByApplication(submitted.application.applicationId);
  assert.ok(session);

  await assertInterviewHttpError(
    () => controller.startInterview(validCandidateRequest, String(submitted.application.applicationId)),
    409,
    "COMMON_CONFLICT",
  );

  await assertInterviewHttpError(
    () => controller.saveDeviceCheck(missingCandidateRequest, String(session.sessionId), {
      cameraGranted: true,
      microphoneGranted: true,
      networkStable: true,
    }),
    401,
    "COMMON_UNAUTHORIZED",
  );

  await assert.rejects(
    () =>
      candidateService.saveDeviceCheck(
        session.sessionId,
        { cameraGranted: false, microphoneGranted: true, networkStable: true },
        DEV_CANDIDATE_USER,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "DEVICE_PERMISSION_DENIED",
  );

  await candidateService.saveInterviewConsent(
    submitted.application.applicationId,
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
    DEV_CANDIDATE_USER,
  );

  const pendingRuntime = await controller.getInterviewRuntime(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(pendingRuntime.data.status, "NOT_READY");
  assert.equal(pendingRuntime.data.canRecord, false);

  const pendingQuestions = await controller.listRecruitingQuestions(validCandidateRequest, String(session.sessionId));
  assert.equal(pendingQuestions.data.interviewType, "RECRUITING");
  assert.equal(pendingQuestions.data.questions.length, 4);

  const deviceCheck = await controller.saveDeviceCheck(validCandidateRequest, String(session.sessionId), {
    cameraGranted: true,
    microphoneGranted: true,
    networkStable: true,
  });
  assert.equal(deviceCheck.data.canStart, true);

  const started = await controller.startInterview(validCandidateRequest, String(submitted.application.applicationId));
  assert.equal(started.data.applicationId, submitted.application.applicationId);
  assert.equal(started.data.sessionId, session.sessionId);
  assert.equal(started.data.interviewStatus, "IN_PROGRESS");
  assert.equal(started.data.sessionStatus, "IN_PROGRESS");

  const runtime = await controller.getInterviewRuntime(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(runtime.data.applicationId, submitted.application.applicationId);
  assert.equal(runtime.data.sessionId, session.sessionId);
  assert.equal(runtime.data.status, "IN_PROGRESS");
  assert.equal(runtime.data.canRecord, true);
  assert.deepEqual(runtime.data.timePolicy, {
    preparationTimeSec: 0,
    answerTimeSec: 90,
    retryAllowed: false,
  });

  const recruitingQuestions = await controller.listRecruitingQuestions(validCandidateRequest, String(session.sessionId));
  assert.equal(recruitingQuestions.data.interviewType, "RECRUITING");
  assert.equal(recruitingQuestions.data.questions.length, 4);
  assert.ok(recruitingQuestions.data.questions[0]?.content);

  for (let index = 0; index < recruitingQuestions.data.questions.length; index += 1) {
    const question = recruitingQuestions.data.questions[index];
    assert.ok(question);
    const answer = await controller.saveRecruitingAnswer(validCandidateRequest, String(session.sessionId), {
      questionId: question.questionId,
      videoFile: {
        storageKey: `candidate/1/recruiting-answer-${index + 1}.webm`,
        originalName: `recruiting-answer-${index + 1}.webm`,
        mimeType: "video/webm",
        sizeBytes: 4096,
      },
      durationSeconds: 60,
    });
    assert.equal(answer.data.answer.questionId, question.questionId);

    if (index === 0) {
      const stt = await controller.requestRecruitingStt(validCandidateRequest, String(session.sessionId), {
        answerId: answer.data.answer.answerId,
        fileAssetId: answer.data.answer.videoFileId,
      });
      assert.equal(stt.data.sessionId, session.sessionId);
      assert.equal(stt.data.applicationId, submitted.application.applicationId);
      assert.equal(stt.data.processType, "STT");
      assert.equal(stt.data.answerId, answer.data.answer.answerId);
      assert.equal(stt.data.fileAssetId, answer.data.answer.videoFileId);
    }

    if (index < recruitingQuestions.data.questions.length - 1) {
      await controller.moveRecruitingNextQuestion(validCandidateRequest, String(session.sessionId));
    }
  }

  await assertInterviewHttpError(
    () => controller.moveRecruitingNextQuestion(validCandidateRequest, String(session.sessionId)),
    409,
    "COMMON_CONFLICT",
  );

  const completedRecruiting = await controller.completeRecruitingInterview(
    validCandidateRequest,
    String(session.sessionId),
  );
  assert.equal(completedRecruiting.data.status, "COMPLETED");
  assert.equal(completedRecruiting.data.applicationId, submitted.application.applicationId);

  const applications = await candidateService.listApplications(DEV_CANDIDATE_USER);
  assert.equal(applications.data.items[0]?.interviewStatus, "COMPLETED");
  assert.equal(applications.data.items[0]?.interviewSessionStatus, "COMPLETED");
  assert.equal(applications.data.items[0]?.reportStatus, "PENDING");
}

test("interview controller contract", async () => {
  await runControllerRuntimeAssertions();
});

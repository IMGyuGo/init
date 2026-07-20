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
import { UpdateMockSessionTitleDto } from "../dto/update-mock-session-title.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

type InterviewControllerRoute =
  | "startMockInterview"
  | "listMockInterviewHistory"
  | "updateMockInterviewTitle"
  | "deleteMockInterview"
  | "getMockRuntime"
  | "listMockQuestions"
  | "saveMockAnswer"
  | "moveMockNextQuestion"
  | "completeMockInterview"
  | "requestMockStt"
  | "requestMockFollowUpQuestion"
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
  | "createRecruitingRealtimeSession";

const validCandidateRequest = {
  headers: {},
  currentUser: { ...DEV_CANDIDATE_USER, companyId: null },
};

const missingCandidateRequest = {
  headers: {},
  currentUser: undefined,
} as never;

const otherCandidateRequest = {
  headers: {},
  currentUser: {
    ...DEV_CANDIDATE_USER,
    userId: DEV_CANDIDATE_USER.userId + 1000,
    candidateId: DEV_CANDIDATE_USER.candidateId + 1000,
    companyId: null,
  },
};

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
assertRoute("updateMockInterviewTitle", interviewApiRoutes.mockTitle, RequestMethod.PATCH);
assertRoute("deleteMockInterview", interviewApiRoutes.mockRuntime, RequestMethod.DELETE, 204);
assertRoute("getMockRuntime", interviewApiRoutes.mockRuntime, RequestMethod.GET);
assertRoute("listMockQuestions", interviewApiRoutes.mockQuestions, RequestMethod.GET);
assertRoute("saveMockAnswer", interviewApiRoutes.mockAnswers, RequestMethod.POST, 201);
assertRoute("moveMockNextQuestion", interviewApiRoutes.mockNextQuestion, RequestMethod.POST);
assertRoute("completeMockInterview", interviewApiRoutes.mockComplete, RequestMethod.PATCH);
assertRoute("requestMockStt", interviewApiRoutes.mockStt, RequestMethod.POST);
assertRoute("requestMockFollowUpQuestion", interviewApiRoutes.mockFollowUpQuestion, RequestMethod.POST);
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

test("mock interview start builds questions from candidate folder context", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));
  const resume = await repository.createFileAsset({
    ownerUserId: DEV_CANDIDATE_USER.userId,
    storageKey: "candidate/1/folders/payment-resume.pdf",
    originalName: "payment-resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
  });
  const folder = await candidateService.createFolder(
    {
      name: "결제 플랫폼 백엔드 지원 세트",
      githubUrl: "https://github.com/init/payment-api",
      portfolioUrl: "https://portfolio.example.com/payment",
      resumeFileId: resume.fileId,
      motivation: "대규모 결제 트래픽을 안정적으로 처리하고 싶습니다.",
      extraNote: "NestJS와 PostgreSQL 기반 장애 대응 경험이 있습니다.",
    },
    DEV_CANDIDATE_USER,
  );

  const started = await controller.startMockInterview(validCandidateRequest, {
    folderId: folder.data.id,
    questionTypes: ["INTRO", "TECHNICAL", "EXPERIENCE"],
    showQuestionText: true,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const content = questions.data.questions.map((question) => question.content).join("\n");

  assert.match(content, /이력서/);
  assert.match(content, /GitHub/);
  assert.match(content, /지원동기/);
  assert.doesNotMatch(content, /결제 플랫폼 백엔드 지원 세트/);
  assert.doesNotMatch(content, /payment-resume\.pdf/);
  assert.doesNotMatch(content, /github\.com\/init\/payment-api/);
  assert.doesNotMatch(content, /대규모 결제 트래픽/);
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
    integrityEvents: [
      {
        type: "GAZE_AWAY",
        occurredAt: "2026-07-10T10:00:00.000Z",
        durationMs: 1800,
        direction: "RIGHT",
        source: "COMBINED",
      },
    ],
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
  assert.equal(answer.data.answer.nonverbalMetadata?.source, "CLIENT_RUNTIME_UNVERIFIED");
  assert.equal(answer.data.answer.nonverbalMetadata?.cameraWarnings, 0);
  assert.equal(answer.data.answer.nonverbalMetadata?.integritySummary?.gazeAwayCount, 1);
  assert.equal(answer.data.answer.nonverbalMetadata?.integritySummary?.suspicionLevel, "LOW");
});

test("mock answer rejects unsupported nonverbal metadata fields at the service boundary", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));
  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  const questionId = questions.data.questions[0]?.questionId ?? 0;

  await assertInterviewHttpError(
    () => controller.saveMockAnswer(validCandidateRequest, String(started.data.sessionId), {
      questionId,
      audioFile: {
        storageKey: "candidate/1/invalid-nonverbal-answer.webm",
        originalName: "invalid-nonverbal-answer.webm",
        mimeType: "audio/webm",
        sizeBytes: 2048,
      },
      durationSeconds: 20,
      nonverbalMetadata: { forgedScore: 100 },
    }),
    400,
    "COMMON_VALIDATION_FAILED",
  );
});

test("mock answer requires another recording for any out-of-range gaze offset without saving an answer", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));
  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const sessionId = started.data.sessionId;
  const questions = await controller.listMockQuestions(validCandidateRequest, String(sessionId));
  const questionId = questions.data.questions[0]?.questionId ?? 0;
  const invalidSamples = [
    { field: "horizontalOffset", horizontalOffset: -1.000001, verticalOffset: 0 },
    { field: "horizontalOffset", horizontalOffset: Number.MAX_VALUE, verticalOffset: 0 },
    { field: "verticalOffset", horizontalOffset: 0, verticalOffset: 1.000001 },
    { field: "verticalOffset", horizontalOffset: 0, verticalOffset: -Number.MAX_VALUE },
  ] as const;

  for (const sample of invalidSamples) {
    try {
      await controller.saveMockAnswer(validCandidateRequest, String(sessionId), {
        questionId,
        audioFile: {
          storageKey: `candidate/1/invalid-gaze-${sample.field}-${sample.horizontalOffset}-${sample.verticalOffset}.webm`,
          originalName: "invalid-gaze-answer.webm",
          mimeType: "audio/webm",
          sizeBytes: 2048,
        },
        durationSeconds: 20,
        nonverbalMetadata: {
          gazeTimeline: [{
            tMs: 1000,
            horizontalOffset: sample.horizontalOffset,
            verticalOffset: sample.verticalOffset,
            direction: "CENTER",
          }],
        },
      });
      assert.fail("Expected INTERVIEW_GAZE_DATA_INVALID");
    } catch (error) {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 422);
      const response = error.getResponse() as {
        code?: string;
        details?: Array<{ field?: string; reason?: string }>;
      };
      assert.equal(response.code, "INTERVIEW_GAZE_DATA_INVALID");
      assert.equal(
        response.details?.[0]?.field,
        `nonverbalMetadata.gazeTimeline[0].${sample.field}`,
      );
      assert.match(response.details?.[0]?.reason ?? "", /finite number between -1 and 1/);
    }
  }

  assert.equal(await interviewRepository.countAnswersBySession(sessionId), 0);
});

test("mock interview consumes personalized AI output once and fills missing question types", async () => {
  const candidateService = new CandidateService(new InMemoryCandidateRepository());
  const interviewRepository = new InMemoryInterviewRepository();
  const reportRepository = new InMemoryReportRepository();
  const process = await reportRepository.createQueuedProcess(
    "QUESTION_GENERATE",
    JSON.stringify({
      kind: "MOCK_QUESTION_GENERATE",
      requestedBy: {
        userId: validCandidateRequest.currentUser!.userId,
        userType: "CANDIDATE",
        candidateId: validCandidateRequest.currentUser!.candidateId,
      },
      payload: { questionCount: 2, questionTypes: ["TECHNICAL", "CLOSING"] },
    }),
  );
  await reportRepository.markQueuedProcessCompleted(process.processLogId, JSON.stringify({
    questionCandidates: [{
      content: "Redis 캐시 무효화 전략을 선택한 근거와 운영 결과를 설명해주세요.",
      questionType: "TECHNICAL",
    }],
  }));
  const controller = new InterviewController(new InterviewService(
    candidateService,
    interviewRepository,
    undefined,
    undefined,
    undefined,
    reportRepository,
  ));

  const createMockSession = interviewRepository.createMockSession.bind(interviewRepository);
  let failSessionCreationOnce = true;
  interviewRepository.createMockSession = (input) => {
    if (failSessionCreationOnce) {
      failSessionCreationOnce = false;
      throw new CandidateDomainError("COMMON_CONFLICT", "temporary session creation failure", 409);
    }
    return createMockSession(input);
  };
  await assertInterviewHttpError(
    () => controller.startMockInterview(validCandidateRequest, {
      questionTypes: ["TECHNICAL", "CLOSING"],
      questionProcessLogId: process.processLogId,
      showQuestionText: true,
    }),
    409,
    "COMMON_CONFLICT",
  );

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["TECHNICAL", "CLOSING"],
    questionProcessLogId: process.processLogId,
    showQuestionText: true,
  });
  const questions = await controller.listMockQuestions(validCandidateRequest, String(started.data.sessionId));
  assert.equal(questions.data.questions[0]?.content, "Redis 캐시 무효화 전략을 선택한 근거와 운영 결과를 설명해주세요.");
  assert.equal(questions.data.questions.length, 2);
  assert.match(questions.data.questions[1]?.content ?? "", /강점/);
  await assertInterviewHttpError(
    () => controller.startMockInterview(validCandidateRequest, {
      questionTypes: ["TECHNICAL", "CLOSING"],
      questionProcessLogId: process.processLogId,
      showQuestionText: true,
    }),
    409,
    "COMMON_CONFLICT",
  );
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

test("REANSWER_REQUIRED allows replacing a transcript-bearing answer once without creating a new answer", async () => {
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
  interviewRepository.saveAnswerTranscript(
    originalAnswerId,
    "의미 품질 검사 전 저장된 손상 transcript입니다.",
  );

  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9101,
    sessionId: started.data.sessionId,
    answerId: originalAnswerId,
    createdAt: new Date(Date.parse(answer.data.answer.submittedAt) + 1000).toISOString(),
    failureReason: "transcript was empty",
  });
  const firstFailureQuestions = await controller.listMockQuestions(
    validCandidateRequest,
    String(started.data.sessionId),
  );
  const firstFailureQuestion = firstFailureQuestions.data.questions.find(
    (question) => question.questionId === firstQuestionId,
  );
  assert.equal(firstFailureQuestion?.sttStatus, "REANSWER_AVAILABLE");
  assert.equal(firstFailureQuestion?.reanswerAvailable, true);

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
  const exhaustedQuestions = await controller.listMockQuestions(
    validCandidateRequest,
    String(started.data.sessionId),
  );
  const exhaustedQuestion = exhaustedQuestions.data.questions.find(
    (question) => question.questionId === firstQuestionId,
  );
  assert.equal(exhaustedQuestion?.sttStatus, "UNAVAILABLE");
  assert.equal(exhaustedQuestion?.reanswerAvailable, false);

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

test("STT status restores the single reanswer opportunity and preserves terminal failure after refresh", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO", "TECHNICAL"],
    showQuestionText: false,
  });
  const sessionId = String(started.data.sessionId);
  const questions = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const firstQuestionId = questions.data.questions[0]?.questionId ?? 0;
  const first = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-stt-first.webm",
      originalName: "mock-answer-stt-first.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 10,
  });

  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9301,
    sessionId: started.data.sessionId,
    answerId: first.data.answer.answerId,
    createdAt: first.data.answer.submittedAt,
    failureReason: "speech was not detected",
  });

  const afterFirstFailure = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const failedQuestion = afterFirstFailure.data.questions.find((question) => question.questionId === firstQuestionId);
  assert.equal(failedQuestion?.answerId, first.data.answer.answerId);
  assert.equal(failedQuestion?.sttStatus, "REANSWER_AVAILABLE");
  assert.equal(failedQuestion?.reanswerAvailable, true);
  assert.equal(failedQuestion?.sttFailureReason, "speech was not detected");

  await new Promise((resolve) => setTimeout(resolve, 2));
  const retried = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId: firstQuestionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-stt-retry.webm",
      originalName: "mock-answer-stt-retry.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 14,
    retryAnswerId: first.data.answer.answerId,
  });

  const afterRetry = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const retryQuestion = afterRetry.data.questions.find((question) => question.questionId === firstQuestionId);
  assert.equal(retryQuestion?.sttStatus, "PENDING");
  assert.equal(retryQuestion?.reanswerAvailable, false);

  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9302,
    sessionId: started.data.sessionId,
    answerId: retried.data.answer.answerId,
    createdAt: retried.data.answer.submittedAt,
    failureReason: "speech was still not detected after reanswer",
  });

  const afterSecondFailure = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const unavailableQuestion = afterSecondFailure.data.questions.find((question) => question.questionId === firstQuestionId);
  assert.equal(unavailableQuestion?.sttStatus, "UNAVAILABLE");
  assert.equal(unavailableQuestion?.reanswerAvailable, false);
  assert.equal(unavailableQuestion?.sttFailureReason, "speech was still not detected after reanswer");

  await assertInterviewHttpError(
    () =>
      controller.saveMockAnswer(validCandidateRequest, sessionId, {
        questionId: firstQuestionId,
        audioFile: {
          storageKey: "candidate/1/mock-answer-stt-third.webm",
          originalName: "mock-answer-stt-third.webm",
          mimeType: "audio/webm",
          sizeBytes: 2048,
        },
        durationSeconds: 14,
        retryAnswerId: retried.data.answer.answerId,
      }),
    409,
    "COMMON_CONFLICT",
  );
});

test("provider failure remains distinct from STT recognition failure", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const sessionId = String(started.data.sessionId);
  const questions = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const questionId = questions.data.questions[0]?.questionId ?? 0;
  const answer = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-provider-failure.webm",
      originalName: "mock-answer-provider-failure.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 10,
  });
  interviewRepository.saveSttProcessForTest({
    processLogId: 9401,
    sessionId: started.data.sessionId,
    answerId: answer.data.answer.answerId,
    status: "FAILED",
    failureCategory: "PROVIDER_UNAVAILABLE",
    failureReason: "STT provider timed out",
    createdAt: answer.data.answer.submittedAt,
  });

  const refreshed = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const failedQuestion = refreshed.data.questions.find((question) => question.questionId === questionId);
  assert.equal(failedQuestion?.sttStatus, "PROCESSING_FAILED");
  assert.equal(failedQuestion?.reanswerAvailable, false);
  assert.equal(failedQuestion?.sttFailureReason, "STT provider timed out");
});

test("STT retry exhaustion remains operator review and does not allow candidate reanswer", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const sessionId = String(started.data.sessionId);
  const questions = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const questionId = questions.data.questions[0]?.questionId ?? 0;
  const answer = await controller.saveMockAnswer(validCandidateRequest, sessionId, {
    questionId,
    audioFile: {
      storageKey: "candidate/1/mock-answer-retry-exhausted.webm",
      originalName: "mock-answer-retry-exhausted.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
    durationSeconds: 10,
  });
  interviewRepository.saveSttProcessForTest({
    processLogId: 9402,
    sessionId: started.data.sessionId,
    answerId: answer.data.answer.answerId,
    status: "FAILED",
    failureCategory: "RETRY_EXHAUSTED",
    failureReason: "Automatic retry limit exhausted after 3 total attempts.",
    createdAt: answer.data.answer.submittedAt,
  });

  const refreshed = await controller.listMockQuestions(validCandidateRequest, sessionId);
  const failedQuestion = refreshed.data.questions.find((question) => question.questionId === questionId);
  assert.equal(failedQuestion?.sttStatus, "PROCESSING_FAILED");
  assert.equal(failedQuestion?.reanswerAvailable, false);
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
    nonverbalMetadata: {
      integrityEvents: [
        {
          type: "TAB_HIDDEN",
          occurredAt: "2026-07-10T10:00:00.000Z",
          durationMs: 2500,
        },
      ],
    },
  });
  assert.equal(skipped.data.answer.durationSeconds, 0);
  assert.equal(skipped.data.answer.transcript, "[NO_ANSWER] Recording validation failed twice.");
  assert.equal(skipped.data.answer.nonverbalMetadata?.source, "CLIENT_RUNTIME_UNVERIFIED");
  assert.equal(skipped.data.answer.nonverbalMetadata?.integritySummary?.screenAwayCount, 1);

  const moved = await controller.moveMockNextQuestion(validCandidateRequest, String(started.data.sessionId));
  assert.equal(moved.data.previousQuestionId, firstQuestionId);
  assert.equal(moved.data.currentQuestion?.questionType, "TECHNICAL");
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
  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9201,
    sessionId: started.data.sessionId,
    answerId: first.data.answer.answerId,
    createdAt: new Date(Date.parse(first.data.answer.submittedAt) + 1000).toISOString(),
    failureReason: "speech was not detected",
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
  interviewRepository.saveAnswerTranscript(
    firstMockAnswer.data.answer.answerId,
    "NestJS와 PostgreSQL을 사용해 프로젝트를 구현했습니다.",
  );

  const mockFollowUp = await controller.requestMockFollowUpQuestion(
    validCandidateRequest,
    String(mockStarted.data.sessionId),
    { answerId: firstMockAnswer.data.answer.answerId },
  );
  assert.equal(mockFollowUp.data.processType, "FOLLOW_UP");
  const nextMock = await controller.moveMockNextQuestion(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(nextMock.data.previousQuestionId, firstMockQuestionId);
  assert.equal(nextMock.data.currentQuestion?.current, true);
  assert.equal(nextMock.data.currentQuestion?.questionType, "TECHNICAL");
  assert.equal(nextMock.data.currentQuestion?.content, undefined);
  assert.equal(nextMock.data.isLastQuestion, true);

  const secondMockAnswer = await controller.saveMockAnswer(validCandidateRequest, String(mockStarted.data.sessionId), {
    questionId: nextMock.data.currentQuestion?.questionId ?? 0,
    audioFile: {
      storageKey: "candidate/1/mock-answer-2.webm",
      originalName: "mock-answer-2.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
    durationSeconds: 30,
  });
  assert.equal(secondMockAnswer.data.completionReady, true);

  const completedMock = await controller.completeMockInterview(validCandidateRequest, String(mockStarted.data.sessionId));
  assert.equal(completedMock.data.status, "COMPLETED");
  assert.equal(completedMock.data.answeredCount, 2);
  assert.equal(completedMock.data.totalQuestions, 2);

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
    const answerRequest = {
      questionId: question.questionId,
      videoFile: {
        storageKey: `candidate/1/recruiting-answer-${index + 1}.webm`,
        originalName: `recruiting-answer-${index + 1}.webm`,
        mimeType: "video/webm",
        sizeBytes: 4096,
      },
      durationSeconds: 60,
    };
    const answer = await controller.saveRecruitingAnswer(validCandidateRequest, String(session.sessionId), answerRequest);
    assert.equal(answer.data.answer.questionId, question.questionId);
    assert.equal(answer.data.idempotentReplay, false);
    assert.equal(
      answer.data.currentQuestion?.questionId,
      recruitingQuestions.data.questions[index + 1]?.questionId,
    );
    assert.equal(answer.data.completionReady, index === recruitingQuestions.data.questions.length - 1);

    if (index === 0) {
      const replay = await controller.saveRecruitingAnswer(
        validCandidateRequest,
        String(session.sessionId),
        answerRequest,
      );
      assert.equal(replay.data.answer.answerId, answer.data.answer.answerId);
      assert.equal(replay.data.idempotentReplay, true);
      assert.equal(replay.data.currentQuestion?.questionId, recruitingQuestions.data.questions[1]?.questionId);
      assert.equal(await interviewRepository.countAnswersBySession(session.sessionId), 1);

      const restored = await controller.listRecruitingQuestions(validCandidateRequest, String(session.sessionId));
      assert.equal(restored.data.currentQuestionId, recruitingQuestions.data.questions[1]?.questionId);
      assert.equal(restored.data.questions.filter((candidateQuestion) => candidateQuestion.current).length, 1);
    }

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
      const moved = await controller.moveRecruitingNextQuestion(validCandidateRequest, String(session.sessionId));
      assert.equal(moved.data.currentQuestion?.questionId, recruitingQuestions.data.questions[index + 1]?.questionId);
      assert.equal(moved.data.completionReady, false);
    }
  }

  const completionReady = await controller.moveRecruitingNextQuestion(validCandidateRequest, String(session.sessionId));
  assert.equal(completionReady.data.currentQuestion, undefined);
  assert.equal(completionReady.data.isLastQuestion, true);
  assert.equal(completionReady.data.completionReady, true);

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

test("mock session title update trims, resets on empty, and blocks non-owners", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const sessionId = String(started.data.sessionId);

  // 소유자 저장 시 trim 후 반영되고 이력에도 노출된다.
  const named = await controller.updateMockInterviewTitle(validCandidateRequest, sessionId, {
    title: "  결제 시스템 연습  ",
  });
  assert.equal(named.data.sessionId, started.data.sessionId);
  assert.equal(named.data.title, "결제 시스템 연습");

  const history = await controller.listMockInterviewHistory(validCandidateRequest);
  assert.equal(history.data.items[0]?.title, "결제 시스템 연습");

  // 빈 제목이면 기본값(null)으로 초기화된다.
  const cleared = await controller.updateMockInterviewTitle(validCandidateRequest, sessionId, { title: "   " });
  assert.equal(cleared.data.title, null);

  // 다른 지원자는 접근할 수 없다.
  await assertInterviewHttpError(
    () => controller.updateMockInterviewTitle(otherCandidateRequest, sessionId, { title: "탈취 시도" }),
    403,
    "COMMON_FORBIDDEN",
  );

  // 존재하지 않는 세션은 404.
  await assertInterviewHttpError(
    () => controller.updateMockInterviewTitle(validCandidateRequest, "999999", { title: "없는 세션" }),
    404,
    "COMMON_NOT_FOUND",
  );
});

test("mock session title DTO enforces the 100 character limit", async () => {
  const tooLong = plainToInstance(UpdateMockSessionTitleDto, { title: "가".repeat(101) });
  const tooLongErrors = await validate(tooLong);
  assert.equal(tooLongErrors.length, 1);
  assert.ok(tooLongErrors[0]?.constraints?.maxLength);

  const boundary = plainToInstance(UpdateMockSessionTitleDto, { title: "가".repeat(100) });
  assert.equal((await validate(boundary)).length, 0);
});

test("mock session deletion removes owned history and blocks later access", async () => {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const controller = new InterviewController(new InterviewService(candidateService, interviewRepository));

  const started = await controller.startMockInterview(validCandidateRequest, {
    questionTypes: ["INTRO"],
    showQuestionText: false,
  });
  const sessionId = String(started.data.sessionId);

  await assertInterviewHttpError(
    () => controller.deleteMockInterview(otherCandidateRequest, sessionId),
    403,
    "COMMON_FORBIDDEN",
  );

  assert.equal(await controller.deleteMockInterview(validCandidateRequest, sessionId), undefined);
  const history = await controller.listMockInterviewHistory(validCandidateRequest);
  assert.equal(history.data.items.some((item) => item.sessionId === started.data.sessionId), false);

  await assertInterviewHttpError(
    () => controller.getMockRuntime(validCandidateRequest, sessionId),
    404,
    "COMMON_NOT_FOUND",
  );
  await assertInterviewHttpError(
    () => controller.deleteMockInterview(validCandidateRequest, sessionId),
    404,
    "COMMON_NOT_FOUND",
  );
});

test("interview controller contract", async () => {
  await runControllerRuntimeAssertions();
});

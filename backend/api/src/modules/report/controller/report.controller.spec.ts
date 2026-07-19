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
import {
  InMemoryInterviewMediaStorageAdapter,
  InMemoryInterviewRepository,
  InterviewService,
} from "../../interview";
import { ReportController } from "./report.controller";
import { reportApiRoutePrefix, reportApiRoutes } from "../report.routes";
import { InMemoryCandidateReportRepository } from "../repository/in-memory-candidate-report.repository";
import { InMemoryReportRepository } from "../repository/in-memory-report.repository";
import { AiJobDispatcherService } from "../service/ai-job-dispatcher.service";
import { InMemoryAiJobQueuePublisher } from "../service/ai-job-queue.publisher";
import { ReportService } from "../service/report.service";

type ReportControllerRoute =
  | "listMockReports"
  | "getMockReportFeedback"
  | "getMockReportMedia"
  | "requestMockReportGeneration"
  | "getApplicationReport"
  | "requestApplicationReportGeneration"
  | "getApplicationStatus";

const validCandidateRequest = {
  headers: {},
  currentUser: { ...DEV_CANDIDATE_USER, companyId: null },
};

const otherCandidateRequest = {
  headers: {},
  currentUser: {
    userId: 99,
    userType: "CANDIDATE" as const,
    companyId: null,
    candidateId: 99,
  },
};

function assertRoute(
  methodName: ReportControllerRoute,
  expectedPath: string,
  expectedMethod: RequestMethod,
  expectedStatusCode?: number,
) {
  const handler = ReportController.prototype[methodName];

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), expectedPath);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), expectedMethod);
  if (expectedStatusCode) {
    assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, handler), expectedStatusCode);
  }
}

assert.equal(Reflect.getMetadata(PATH_METADATA, ReportController), reportApiRoutePrefix);
assertRoute("listMockReports", reportApiRoutes.mockReports, RequestMethod.GET);
assertRoute("getMockReportFeedback", reportApiRoutes.mockFeedback, RequestMethod.GET);
assertRoute("getMockReportMedia", reportApiRoutes.mockMedia, RequestMethod.GET);
assertRoute("requestMockReportGeneration", reportApiRoutes.mockGenerate, RequestMethod.POST, 202);
assertRoute("getApplicationReport", reportApiRoutes.applicationReport, RequestMethod.GET);
assertRoute("requestApplicationReportGeneration", reportApiRoutes.applicationReportGenerate, RequestMethod.POST, 202);
assertRoute("getApplicationStatus", reportApiRoutes.applicationStatus, RequestMethod.GET);

async function assertReportHttpError(
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

async function answerAllMockQuestions(interviewService: InterviewService, sessionId: number) {
  const questions = await interviewService.listMockQuestions(sessionId, DEV_CANDIDATE_USER);
  for (let index = 0; index < questions.data.questions.length; index += 1) {
    const question = questions.data.questions[index];
    assert.ok(question);
    await interviewService.saveMockAnswer(sessionId, {
      questionId: question.questionId,
      videoFile: {
        storageKey: `candidate/1/mock-report-answer-${index + 1}.webm`,
        originalName: `mock-report-answer-${index + 1}.webm`,
        mimeType: "video/webm",
        sizeBytes: 1024,
      },
      durationSeconds: 30 + index,
    }, DEV_CANDIDATE_USER);

    if (index < questions.data.questions.length - 1) {
      await interviewService.moveMockNextQuestion(sessionId, DEV_CANDIDATE_USER);
    }
  }
}

async function answerAllRecruitingQuestions(interviewService: InterviewService, sessionId: number) {
  const questions = await interviewService.listRecruitingQuestions(sessionId, DEV_CANDIDATE_USER);
  for (let index = 0; index < questions.data.questions.length; index += 1) {
    const question = questions.data.questions[index];
    assert.ok(question);
    await interviewService.saveRecruitingAnswer(sessionId, {
      questionId: question.questionId,
      audioFile: {
        storageKey: `candidate/1/recruiting-report-answer-${index + 1}.webm`,
        originalName: `recruiting-report-answer-${index + 1}.webm`,
        mimeType: "audio/webm",
        sizeBytes: 2048,
      },
      durationSeconds: 45 + index,
      ...(index === 0
        ? {
            nonverbalMetadata: {
              integrityEvents: [
                {
                  type: "TAB_HIDDEN",
                  occurredAt: "2026-07-10T10:00:00.000Z",
                  durationMs: 2000,
                },
              ],
            },
          }
        : {}),
    }, DEV_CANDIDATE_USER);

    if (index < questions.data.questions.length - 1) {
      await interviewService.moveRecruitingNextQuestion(sessionId, DEV_CANDIDATE_USER);
    }
  }
}

function assertNoRecruitingInternalFields(data: Record<string, unknown>) {
  assert.equal("internalMemo" in data, false);
  assert.equal("companyMemo" in data, false);
  assert.equal("manualEvaluation" in data, false);
  assert.equal("manualEvaluations" in data, false);
}

async function runReportControllerAssertions() {
  const repository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(repository);
  const interviewRepository = new InMemoryInterviewRepository();
  const mediaStorage = new InMemoryInterviewMediaStorageAdapter();
  const interviewService = new InterviewService(candidateService, interviewRepository, undefined, mediaStorage);
  const candidateReportRepository = new InMemoryCandidateReportRepository();
  const reportRepository = new InMemoryReportRepository();
  const queuePublisher = new InMemoryAiJobQueuePublisher();
  const dispatcher = new AiJobDispatcherService(reportRepository, queuePublisher);
  const reportService = new ReportService(
    candidateService,
    interviewRepository,
    candidateReportRepository,
    dispatcher,
    mediaStorage,
  );
  const controller = new ReportController(reportService);

  const startedMock = await interviewService.startMockInterview(
    { questionTypes: ["INTRO", "TECHNICAL"], showQuestionText: true },
    DEV_CANDIDATE_USER,
  );
  const mockReportId = startedMock.data.sessionId;

  await assertReportHttpError(
    () => controller.getMockReportFeedback(validCandidateRequest, String(mockReportId)),
    409,
    "REPORT_NOT_READY",
  );

  await answerAllMockQuestions(interviewService, mockReportId);
  await interviewService.completeMockInterview(mockReportId, DEV_CANDIDATE_USER);

  const reports = await controller.listMockReports(validCandidateRequest);
  assert.equal(reports.data.items.length, 1);
  assert.equal(reports.data.items[0]?.reportId, mockReportId);
  assert.equal(reports.data.items[0]?.reportStatus, "PENDING");

  await assertReportHttpError(
    () => controller.getMockReportFeedback(validCandidateRequest, String(mockReportId)),
    409,
    "REPORT_NOT_READY",
  );

  const mockAnswers = interviewRepository.listAnswersBySession(mockReportId);
  const firstMockAnswer = mockAnswers[0];
  assert.ok(firstMockAnswer);
  mockAnswers.forEach((answer, index) => {
    if (index === 0) {
      interviewRepository.saveAnswerTranscript(
        answer.answerId,
        "I explained the project tradeoffs with concrete examples.",
      );
    }
  });
  const unavailableMockAnswer = mockAnswers[1];
  assert.ok(unavailableMockAnswer);
  interviewRepository.saveReanswerRequiredFailureForTest({
    processLogId: 9101,
    sessionId: mockReportId,
    answerId: unavailableMockAnswer.answerId,
    createdAt: unavailableMockAnswer.submittedAt,
    failureReason: "STT 실패로 음성을 인식하지 못했습니다.",
  });
  candidateReportRepository.saveFollowUpQuestion({
    followUpId: 1,
    answerId: firstMockAnswer.answerId,
    content: "Which tradeoff had the largest impact?",
    generationStatus: "GENERATED",
    policy: "MOCK",
    createdAt: "2026-07-02T00:00:00.000Z",
  });
  candidateReportRepository.saveReport({
    reportId: mockReportId,
    sessionId: mockReportId,
    reportType: "MOCK_INTERVIEW_REPORT",
    status: "COMPLETED",
    totalScore: 82,
    summary: "Practice feedback is ready.",
    generatedAt: "2026-07-02T00:01:00.000Z",
    scores: [
      {
        scoreId: 1,
        criterionId: 1,
        criterionName: "Clarity",
        score: 82,
        rationale: "The answer was structured and evidence-backed.",
        evidences: [
          {
            evidenceId: 1,
            sourceType: "INTERVIEW_ANSWER",
            answerId: firstMockAnswer.answerId,
            evidenceText: "project tradeoffs with concrete examples",
          },
        ],
      },
    ],
  });

  const feedback = await controller.getMockReportFeedback(validCandidateRequest, String(mockReportId));
  assert.equal(feedback.data.reportType, "MOCK_INTERVIEW_REPORT");
  assert.equal(feedback.data.status, "COMPLETED");
  assert.equal(feedback.data.totalScore, 79);
  assert.equal(feedback.data.scores?.[0]?.evidences[0]?.evidenceText, "project tradeoffs with concrete examples");
  assert.equal(feedback.data.visibilityPolicy.excludesHiringDecision, true);
  assert.equal(/합격|탈락|pass|fail|hire|reject/i.test([
    feedback.data.summary,
    ...feedback.data.strengths,
    ...feedback.data.improvements,
    ...feedback.data.nextPractice,
  ].join(" ")), false);

  const media = await controller.getMockReportMedia(validCandidateRequest, String(mockReportId));
  assert.equal(media.data.media.length, 2);
  assert.equal(media.data.media[0]?.videoFile?.status, "ACTIVE");
  assert.equal(media.data.media[0]?.transcriptStatus, "AVAILABLE");
  assert.equal(media.data.media[0]?.transcript, "I explained the project tradeoffs with concrete examples.");
  assert.equal(media.data.media[1]?.transcriptStatus, "UNAVAILABLE");
  assert.equal(media.data.media[1]?.evaluationStatus, "STT_UNAVAILABLE");
  assert.equal(media.data.media[1]?.transcript, undefined);
  assert.match(media.data.media[1]?.transcriptUnavailableReason ?? "", /STT 실패/);
  assert.equal(media.data.media[0]?.followUpQuestions[0]?.content, "Which tradeoff had the largest impact?");
  assert.ok(media.data.media[0]?.questionContent);

  const legacyStarted = await interviewService.startMockInterview(
    { questionTypes: ["INTRO"], showQuestionText: true },
    DEV_CANDIDATE_USER,
  );
  const legacyReportId = legacyStarted.data.sessionId;
  await answerAllMockQuestions(interviewService, legacyReportId);
  await interviewService.completeMockInterview(legacyReportId, DEV_CANDIDATE_USER);
  const legacyAnswer = interviewRepository.listAnswersBySession(legacyReportId)[0];
  assert.ok(legacyAnswer);
  candidateReportRepository.saveReport({
    reportId: legacyReportId,
    sessionId: legacyReportId,
    reportType: "MOCK_INTERVIEW_REPORT",
    status: "COMPLETED",
    totalScore: 0,
    summary: "Legacy practice feedback is available.",
    generatedAt: "2026-07-02T00:02:00.000Z",
    scores: [
      {
        scoreId: 2,
        criterionId: 1,
        criterionName: "Clarity",
        score: 0,
        rationale: "STT 실패로 transcript가 없어 임시 0점 처리되었습니다.",
        evidences: [
          {
            evidenceId: 2,
            sourceType: "INTERVIEW_ANSWER",
            answerId: legacyAnswer.answerId,
            evidenceText: "STT transcript is unavailable.",
          },
        ],
      },
    ],
  });
  const legacyMedia = await controller.getMockReportMedia(validCandidateRequest, String(legacyReportId));
  assert.equal(legacyMedia.data.media[0]?.transcriptStatus, "UNAVAILABLE");
  assert.equal(legacyMedia.data.media[0]?.evaluationStatus, "STT_UNAVAILABLE");
  assert.match(legacyMedia.data.media[0]?.transcriptUnavailableReason ?? "", /임시 0점/);

  const firstVideoFile = media.data.media[0]?.videoFile;
  assert.ok(firstVideoFile);
  await mediaStorage.putObject({
    key: firstVideoFile.storageKey,
    body: Buffer.from("mock-video"),
    contentLength: 10,
    contentType: firstVideoFile.mimeType,
  });
  const playbackSession = await reportService.createMockReportMediaSession(mockReportId, DEV_CANDIDATE_USER);
  assert.equal(playbackSession.cookieName, "candidateMockMediaAccess");
  assert.equal(playbackSession.mediaBasePath, `/api/v1/candidate/mock-interview/reports/${mockReportId}/media`);
  const playbackUser = reportService.verifyMockReportMediaSession(playbackSession.token, mockReportId);
  assert.equal(playbackUser.candidateId, DEV_CANDIDATE_USER.candidateId);
  const streamedMedia = await reportService.getMockReportMediaFile(
    mockReportId,
    firstVideoFile.fileId,
    playbackUser,
    { range: "bytes=0-3" },
  );
  assert.equal(streamedMedia.statusCode, 206);
  assert.equal(streamedMedia.contentRange, "bytes 0-3/10");
  assert.equal(Buffer.isBuffer(streamedMedia.body) ? streamedMedia.body.toString("utf8") : "", "mock");

  await assert.rejects(
    () => reportService.createMockReportMediaSession(mockReportId, otherCandidateRequest.currentUser),
    (error: unknown) => error instanceof CandidateDomainError && error.code === "COMMON_FORBIDDEN",
  );
  await assert.rejects(
    () => reportService.getMockReportMediaFile(mockReportId, 99999, playbackUser),
    (error: unknown) => error instanceof CandidateDomainError && error.code === "COMMON_NOT_FOUND",
  );

  const generation = await controller.requestMockReportGeneration(validCandidateRequest, String(mockReportId));
  assert.equal(generation.data.accepted, true);
  assert.equal(generation.data.queued, true);
  assert.equal(generation.data.processType, "REPORT_GENERATE");
  assert.equal(generation.data.status, "PENDING");
  assert.equal(generation.data.reportStatus, "GENERATING");
  assert.ok(generation.data.processLogId > 0);
  assert.equal(generation.data.reportId, mockReportId);
  assert.equal(generation.data.sessionId, mockReportId);
  assert.equal(generation.data.answerIds.length, 2);
  assert.equal(generation.data.callbackTopic, "ai.report.generate.requested");
  assert.equal(queuePublisher.messages.length, 1);

  await assertReportHttpError(
    () => controller.getMockReportFeedback(otherCandidateRequest, String(mockReportId)),
    403,
    "COMMON_FORBIDDEN",
  );

  const submitted = await repository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const session = await repository.findInterviewSessionByApplication(submitted.application.applicationId);
  assert.ok(session);
  Reflect.set(session, "ncsScoringVersion", "NCS_RECRUITING_SCORING_V2");

  await assertReportHttpError(
    () => controller.getApplicationReport(validCandidateRequest, String(submitted.application.applicationId)),
    409,
    "REPORT_NOT_READY",
  );

  await candidateService.saveInterviewConsent(
    submitted.application.applicationId,
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
    DEV_CANDIDATE_USER,
  );
  await candidateService.saveDeviceCheck(
    session.sessionId,
    { cameraGranted: true, microphoneGranted: true, networkStable: true },
    DEV_CANDIDATE_USER,
  );
  await candidateService.startInterview(submitted.application.applicationId, DEV_CANDIDATE_USER);
  await answerAllRecruitingQuestions(interviewService, session.sessionId);
  await interviewService.completeRecruitingInterview(session.sessionId, DEV_CANDIDATE_USER);

  const applicationStatus = await controller.getApplicationStatus(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(applicationStatus.data.interviewStatus, "COMPLETED");
  assert.equal(applicationStatus.data.interviewSessionStatus, "COMPLETED");
  assert.equal(applicationStatus.data.reportStatus, "PENDING");
  assert.equal(applicationStatus.data.reportAvailable, false);

  await repository.updateApplicationReportStatus(submitted.application.applicationId, "GENERATING");
  const generatingApplicationStatus = await controller.getApplicationStatus(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(generatingApplicationStatus.data.reportStatus, "GENERATING");
  assert.equal(generatingApplicationStatus.data.reportAvailable, false);
  await repository.updateApplicationReportStatus(submitted.application.applicationId, "PENDING");

  const applicationReport = await controller.getApplicationReport(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(applicationReport.data.reportType, "RECRUITING_REPORT");
  assert.equal(applicationReport.data.status, "PENDING");
  assert.deepEqual(applicationReport.data.scores, []);
  assert.equal(applicationReport.data.visibilityPolicy.excludesInternalMemo, true);
  assert.equal(applicationReport.data.visibilityPolicy.excludesManualEvaluation, true);
  assertNoRecruitingInternalFields(applicationReport.data as unknown as Record<string, unknown>);

  const recruitingAnswers = interviewRepository.listAnswersBySession(session.sessionId);
  const firstRecruitingAnswer = recruitingAnswers[0];
  assert.ok(firstRecruitingAnswer);
  assert.equal(firstRecruitingAnswer.nonverbalMetadata?.source, "CLIENT_RUNTIME_UNVERIFIED");
  await assertReportHttpError(
    () => controller.requestApplicationReportGeneration(
      validCandidateRequest,
      String(submitted.application.applicationId),
    ),
    409,
    "COMMON_CONFLICT",
  );
  assert.equal(queuePublisher.messages.length, 1);
  recruitingAnswers.forEach((answer, index) => {
    interviewRepository.saveAnswerTranscript(
      answer.answerId,
      index === 0
        ? "I improved API latency with caching and queue isolation."
        : "I explained production incident handling with clear ownership.",
    );
  });
  candidateReportRepository.saveFollowUpQuestion({
    followUpId: 2,
    answerId: firstRecruitingAnswer.answerId,
    content: "How did you measure the latency improvement?",
    generationStatus: "GENERATED",
    policy: "RECRUITING",
    createdAt: "2026-07-02T00:02:00.000Z",
  });

  const applicationGeneration = await controller.requestApplicationReportGeneration(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(applicationGeneration.data.accepted, true);
  assert.equal(applicationGeneration.data.queued, true);
  assert.equal(applicationGeneration.data.processType, "REPORT_GENERATE");
  assert.equal(applicationGeneration.data.reportType, "RECRUITING_REPORT");
  assert.equal(applicationGeneration.data.reportStatus, "GENERATING");
  assert.equal(applicationGeneration.data.applicationId, submitted.application.applicationId);
  assert.equal(applicationGeneration.data.sessionId, session.sessionId);
  assert.equal(applicationGeneration.data.reportId, session.sessionId);
  assert.equal(applicationGeneration.data.answerIds.length, recruitingAnswers.length);
  assert.equal(queuePublisher.messages.length, 2);
  const recruitingReportJob = queuePublisher.messages.filter((message) => message.processType === "REPORT_GENERATE").at(-1);
  assert.ok(recruitingReportJob);
  const recruitingReportInput = JSON.parse(recruitingReportJob.inputRef) as {
    payload?: {
      answers?: Array<Record<string, unknown>>;
      ncsScoringVersion?: string;
    };
  };
  assert.ok(recruitingReportInput.payload?.answers?.length);
  assert.equal(recruitingReportInput.payload?.ncsScoringVersion, "NCS_RECRUITING_SCORING_V2");
  assert.equal(
    recruitingReportInput.payload?.answers?.some((answer) => "nonverbalMetadata" in answer),
    false,
  );

  candidateReportRepository.saveReport({
    reportId: submitted.application.applicationId,
    applicationId: submitted.application.applicationId,
    sessionId: session.sessionId,
    reportType: "RECRUITING_REPORT",
    status: "COMPLETED",
    totalScore: 88,
    summary: "Recruiting report is ready.",
    generatedAt: "2026-07-02T00:03:00.000Z",
    scores: [
      {
        scoreId: 2,
        criterionId: 1,
        criterionName: "Backend ownership",
        score: 88,
        rationale: "The answer connects implementation choices to measurable results.",
        evidences: [
          {
            evidenceId: 2,
            sourceType: "INTERVIEW_ANSWER",
            answerId: firstRecruitingAnswer.answerId,
            evidenceText: "improved API latency with caching and queue isolation",
          },
        ],
      },
    ],
  });

  const completedApplicationStatus = await controller.getApplicationStatus(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(completedApplicationStatus.data.reportStatus, "COMPLETED");
  assert.equal(completedApplicationStatus.data.reportAvailable, true);

  const completedApplicationReport = await controller.getApplicationReport(
    validCandidateRequest,
    String(submitted.application.applicationId),
  );
  assert.equal(completedApplicationReport.data.status, "COMPLETED");
  assert.equal(completedApplicationReport.data.totalScore, undefined);
  assert.deepEqual(completedApplicationReport.data.scores, []);
  assert.deepEqual(completedApplicationReport.data.answers, []);
  assert.equal(completedApplicationReport.data.visibilityPolicy.excludesDetailedScores, true);
  assert.equal(completedApplicationReport.data.visibilityPolicy.excludesEvaluationEvidence, true);

  await assertReportHttpError(
    () => controller.getApplicationStatus(otherCandidateRequest, String(submitted.application.applicationId)),
    403,
    "COMMON_FORBIDDEN",
  );

  await assertReportHttpError(
    () => controller.getApplicationReport(validCandidateRequest, "99999"),
    404,
    "COMMON_NOT_FOUND",
  );
}

test("candidate report controller contract", async () => {
  await runReportControllerAssertions();
});

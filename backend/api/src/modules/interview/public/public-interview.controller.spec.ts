import "reflect-metadata";
import { strict as assert } from "node:assert";
import { HttpException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CandidateService, DEV_CANDIDATE_USER, InMemoryCandidateRepository } from "../../candidate";
import { InMemoryInterviewRepository } from "../repository/in-memory-interview.repository";
import { InterviewService } from "../service/interview.service";
import type { PublicApplicationAccessVerifier } from "./public-application-access.verifier";
import { PublicInterviewAccessTokenService } from "./public-interview-access-token.service";
import { PublicInterviewController } from "./public-interview.controller";
import { PublicInterviewService } from "./public-interview.service";
import { PublicInterviewCompletionController } from "../../report/controller/public-interview-completion.controller";

function assertRoute(methodName: keyof PublicInterviewController, expectedPath: string, expectedMethod: RequestMethod) {
  const handler = PublicInterviewController.prototype[methodName];
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), expectedPath);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), expectedMethod);
}

assert.equal(Reflect.getMetadata(PATH_METADATA, PublicInterviewController), "public");
assertRoute("startPublicInterview", "applications/:applicationId/interview/start", RequestMethod.POST);
assertRoute("beginPublicInterview", "applications/:applicationId/interview/begin", RequestMethod.POST);
assertRoute("getRuntime", "applications/:applicationId/interview", RequestMethod.GET);
assertRoute("saveDeviceCheck", "interviews/:sessionId/device-check", RequestMethod.POST);
assertRoute("listQuestions", "interviews/:sessionId/questions", RequestMethod.GET);
assertRoute("saveAnswer", "interviews/:sessionId/answers", RequestMethod.POST);
assertRoute("uploadMedia", "interviews/:sessionId/media", RequestMethod.POST);
assertRoute("moveNextQuestion", "interviews/:sessionId/next-question", RequestMethod.POST);
assertRoute("requestStt", "interviews/:sessionId/stt", RequestMethod.POST);
assertRoute("requestFollowUpQuestion", "interviews/:sessionId/follow-up-question", RequestMethod.POST);
assertRoute("createRealtimeSession", "interviews/:sessionId/realtime-session", RequestMethod.POST);

test("public interview completion requests the recruiting report before returning", async () => {
  const requestedApplicationIds: number[] = [];
  const controller = new PublicInterviewCompletionController(
    {
      completeInterview: async () => ({ data: { status: "COMPLETED" }, meta: {} }),
    } as never,
    {
      requestApplicationReportGeneration: async (applicationId: number) => {
        requestedApplicationIds.push(applicationId);
        return { data: {}, meta: {} };
      },
    } as never,
  );
  const request = {
    headers: {},
    publicInterviewAccess: {
      tokenType: "PUBLIC_INTERVIEW" as const,
      applicationId: 44,
      sessionId: 55,
      candidateId: 66,
      userId: 77,
    },
    currentUser: {
      userId: 77,
      userType: "CANDIDATE" as const,
      companyId: null,
      candidateId: 66,
    },
  };

  const result = await controller.completeInterview(request, "55");

  assert.equal(result.data.status, "COMPLETED");
  assert.deepEqual(requestedApplicationIds, [44]);
});

assert.equal(Reflect.getMetadata(PATH_METADATA, PublicInterviewCompletionController), "public");
assert.equal(
  Reflect.getMetadata(PATH_METADATA, PublicInterviewCompletionController.prototype.completeInterview),
  "interviews/:sessionId/complete",
);
assert.equal(
  Reflect.getMetadata(METHOD_METADATA, PublicInterviewCompletionController.prototype.completeInterview),
  RequestMethod.PATCH,
);

function createPublicInterviewFixture() {
  const candidateRepository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(candidateRepository);
  const interviewRepository = new InMemoryInterviewRepository();
  const interviewService = new InterviewService(candidateService, interviewRepository);
  const tokenService = new PublicInterviewAccessTokenService();
  const accessVerifier: PublicApplicationAccessVerifier = {
    async verifyApplicationToken(token) {
      const match = token.match(/^application:(\d+)$/);
      return { applicationId: match ? Number(match[1]) : 999 };
    },
  };
  const service = new PublicInterviewService(
    accessVerifier,
    tokenService,
    candidateService,
    interviewService,
  );
  const controller = new PublicInterviewController(service);
  return { candidateRepository, tokenService, controller };
}

async function submitRecruitingApplication(candidateRepository: InMemoryCandidateRepository) {
  return candidateRepository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"],
  });
}

test("public interview start issues access token and runtime calls use that context", async () => {
  const { candidateRepository, tokenService, controller } = createPublicInterviewFixture();
  const submitted = await submitRecruitingApplication(candidateRepository);

  const started = await controller.startPublicInterview(String(submitted.application.applicationId), {
    token: `application:${submitted.application.applicationId}`,
  });
  assert.equal(started.data.applicationId, submitted.application.applicationId);
  assert.equal(started.data.interviewSessionStatus, "NOT_READY");
  assert.ok(started.data.publicAccessToken);
  assert.equal(
    started.data.runtimePath,
    `/public/applications/${submitted.application.applicationId}/interview/runtime?sessionId=${started.data.sessionId}`,
  );

  const access = tokenService.verify(started.data.publicAccessToken);
  const request = {
    headers: {},
    publicInterviewAccess: access,
    currentUser: {
      userId: access.userId,
      userType: "CANDIDATE" as const,
      companyId: null,
      candidateId: access.candidateId,
    },
  };

  const pendingRuntime = await controller.getRuntime(request, String(submitted.application.applicationId));
  assert.equal(pendingRuntime.data.status, "NOT_READY");
  assert.equal(pendingRuntime.data.nextQuestionEndpoint, `/api/v1/public/interviews/${started.data.sessionId}/next-question`);

  const deviceCheck = await controller.saveDeviceCheck(request, String(started.data.sessionId), {
    cameraGranted: true,
    microphoneGranted: true,
    networkStable: true,
  });
  assert.equal(deviceCheck.data.canStart, true);

  const begun = await controller.beginPublicInterview(request, String(submitted.application.applicationId));
  assert.equal(begun.data.interviewStatus, "IN_PROGRESS");
  assert.equal(begun.data.interviewUrl, started.data.runtimePath);

  const questions = await controller.listQuestions(request, String(started.data.sessionId));
  assert.equal(questions.data.interviewType, "RECRUITING");
  assert.ok(questions.data.questions.length > 0);
});

test("public interview start records required interview consent before begin", async () => {
  const { candidateRepository, tokenService, controller } = createPublicInterviewFixture();
  const submitted = await candidateRepository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });

  const started = await controller.startPublicInterview(String(submitted.application.applicationId), {
    token: `application:${submitted.application.applicationId}`,
  });
  const access = tokenService.verify(started.data.publicAccessToken);
  const request = {
    headers: {},
    publicInterviewAccess: access,
    currentUser: {
      userId: access.userId,
      userType: "CANDIDATE" as const,
      companyId: null,
      candidateId: access.candidateId,
    },
  };

  await controller.saveDeviceCheck(request, String(started.data.sessionId), {
    cameraGranted: true,
    microphoneGranted: true,
    networkStable: true,
  });

  const begun = await controller.beginPublicInterview(request, String(submitted.application.applicationId));
  assert.equal(begun.data.interviewStatus, "IN_PROGRESS");
});

test("public interview begin records required consent for existing runtime access", async () => {
  const { candidateRepository, tokenService, controller } = createPublicInterviewFixture();
  const submitted = await candidateRepository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const session = await candidateRepository.ensureInterviewSessionByApplication(submitted.application.applicationId);
  assert.ok(session);

  const access = tokenService.verify(
    tokenService.issue({
      applicationId: submitted.application.applicationId,
      sessionId: session.sessionId,
      candidateId: DEV_CANDIDATE_USER.candidateId,
      userId: DEV_CANDIDATE_USER.userId,
    }),
  );
  const request = {
    headers: {},
    publicInterviewAccess: access,
    currentUser: {
      userId: access.userId,
      userType: "CANDIDATE" as const,
      companyId: null,
      candidateId: access.candidateId,
    },
  };

  await controller.saveDeviceCheck(request, String(session.sessionId), {
    cameraGranted: true,
    microphoneGranted: true,
    networkStable: true,
  });

  const begun = await controller.beginPublicInterview(request, String(submitted.application.applicationId));
  assert.equal(begun.data.interviewStatus, "IN_PROGRESS");
});

test("public interview start requires a verified application token", async () => {
  const { candidateRepository, controller } = createPublicInterviewFixture();
  const submitted = await candidateRepository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"],
  });

  await assert.rejects(
    () => controller.startPublicInterview(String(submitted.application.applicationId), {}),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 400,
  );
});

test("public interview start creates the recruiting session when it does not exist yet", async () => {
  const { candidateRepository, controller } = createPublicInterviewFixture();
  const submitted = await submitRecruitingApplication(candidateRepository);
  (candidateRepository as unknown as { interviewSessions: unknown[] }).interviewSessions.length = 0;

  const started = await controller.startPublicInterview(String(submitted.application.applicationId), {
    token: `application:${submitted.application.applicationId}`,
  });

  assert.equal(started.data.applicationId, submitted.application.applicationId);
  assert.equal(started.data.interviewSessionStatus, "NOT_READY");
  assert.ok(started.data.sessionId > 0);
});

test("public interview start rejects tokens for a different application", async () => {
  const { candidateRepository, controller } = createPublicInterviewFixture();
  const submitted = await submitRecruitingApplication(candidateRepository);

  await assert.rejects(
    () => controller.startPublicInterview(String(submitted.application.applicationId), { token: "application:999" }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
});

import "reflect-metadata";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { HttpStatus, INestApplication, RequestMethod } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CurrentUser } from "@init/common";
import request from "supertest";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CandidateDomainError } from "../../candidate";
import { InterviewerPreviewRealtimeService } from "../service/interviewer-preview-realtime.service";
import { RealtimeSessionCredentialService } from "../service/realtime-session-credential.service";
import { InterviewerPreviewController } from "./interviewer-preview.controller";

describe("InterviewerPreviewController", () => {
  it("exposes a JwtAuthGuard-protected realtime preview route", () => {
    expect(Reflect.getMetadata(PATH_METADATA, InterviewerPreviewController))
      .toBe("interviewer-preview");
    expect(Reflect.getMetadata(
      PATH_METADATA,
      InterviewerPreviewController.prototype.createRealtimeSession,
    )).toBe("realtime-session");
    expect(Reflect.getMetadata(
      METHOD_METADATA,
      InterviewerPreviewController.prototype.createRealtimeSession,
    )).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(
      HTTP_CODE_METADATA,
      InterviewerPreviewController.prototype.createRealtimeSession,
    )).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(GUARDS_METADATA, InterviewerPreviewController))
      .toContain(JwtAuthGuard);
  });

  it("returns HTTP 200 for a successful live preview credential request", async () => {
    const currentUser: CurrentUser = {
      userId: 3,
      userType: "CANDIDATE",
      candidateId: 11,
      companyId: null,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [InterviewerPreviewController],
      providers: [{
        provide: InterviewerPreviewRealtimeService,
        useValue: {
          createSession: jest.fn().mockResolvedValue({
            data: { accepted: true },
            meta: { traceId: "preview-trace", timestamp: "2026-07-24T00:00:00.000Z" },
          }),
        },
      }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: { switchToHttp(): { getRequest(): { currentUser?: CurrentUser } } }) {
          context.switchToHttp().getRequest().currentUser = currentUser;
          return true;
        },
      })
      .compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    try {
      await request(app.getHttpServer())
        .post("/interviewer-preview/realtime-session")
        .send({ mode: "realtime-voice", transport: "webrtc" })
        .expect(HttpStatus.OK)
        .expect(({ body }) => {
          expect(body.data.accepted).toBe(true);
        });
    } finally {
      await app.close();
    }
  });

  it.each<CurrentUser>([
    { userId: 1, userType: "ADMIN", candidateId: null, companyId: null },
    { userId: 2, userType: "COMPANY", candidateId: null, companyId: 12 },
    { userId: 3, userType: "CANDIDATE", candidateId: 11, companyId: null },
  ])("forwards an authenticated $userType user without role narrowing", async (currentUser) => {
    const createSession = jest.fn().mockResolvedValue({ data: { accepted: true } });
    const controller = new InterviewerPreviewController({ createSession } as never);

    await expect(controller.createRealtimeSession(
      { currentUser } as never,
      { mode: "realtime-voice", transport: "webrtc" },
    )).resolves.toEqual({ data: { accepted: true } });
    expect(createSession).toHaveBeenCalledWith(
      { mode: "realtime-voice", transport: "webrtc" },
      currentUser,
    );
  });

  it("maps candidate domain validation failures to an HTTP exception", async () => {
    const createSession = jest.fn().mockRejectedValue(new CandidateDomainError(
      "COMMON_VALIDATION_FAILED",
      "Realtime session mode is invalid.",
      400,
      [{ field: "mode", reason: "mode must be realtime-voice" }],
    ));
    const controller = new InterviewerPreviewController({ createSession } as never);

    await expect(controller.createRealtimeSession(
      {
        currentUser: {
          userId: 7,
          userType: "CANDIDATE",
          candidateId: 11,
          companyId: null,
        },
      } as never,
      {} as never,
    )).rejects.toMatchObject({
      status: 400,
      response: {
        code: "COMMON_VALIDATION_FAILED",
        message: "Realtime session mode is invalid.",
        details: [{ field: "mode", reason: "mode must be realtime-voice" }],
      },
    });
  });

  it("maps credential transport rejection to the documented 502 error", async () => {
    const originalProvider = process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const credentials = new RealtimeSessionCredentialService(async () => {
      throw new Error("network unavailable");
    });
    const controller = new InterviewerPreviewController(
      new InterviewerPreviewRealtimeService(credentials),
    );

    try {
      await expect(controller.createRealtimeSession(
        {
          currentUser: {
            userId: 7,
            userType: "CANDIDATE",
            candidateId: 11,
            companyId: null,
          },
        } as never,
        { mode: "realtime-voice", transport: "webrtc" },
      )).rejects.toMatchObject({
        status: 502,
        response: {
          code: "COMMON_EXTERNAL_SERVICE_FAILED",
          details: [{ field: "openai", reason: "request failed" }],
        },
      });
    } finally {
      if (originalProvider === undefined) delete process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
      else process.env.AI_INTERVIEWER_REALTIME_PROVIDER = originalProvider;
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it.each([
    { label: "null", dto: null },
    { label: "primitive", dto: 42 },
    { label: "array", dto: [] },
  ])("maps a non-object $label body before issuing credentials", async ({ dto }) => {
    const issueOpenAi = jest.fn();
    const controller = new InterviewerPreviewController(
      new InterviewerPreviewRealtimeService({ issueOpenAi } as never),
    );

    await expect(controller.createRealtimeSession(
      {
        currentUser: {
          userId: 7,
          userType: "CANDIDATE",
          candidateId: 11,
          companyId: null,
        },
      } as never,
      dto as never,
    )).rejects.toMatchObject({
      status: 400,
      response: {
        code: "COMMON_VALIDATION_FAILED",
        message: "Request body is invalid.",
        details: [{ field: "realtimeSession", reason: "realtimeSession must be an object" }],
      },
    });
    expect(issueOpenAi).not.toHaveBeenCalled();
  });
});

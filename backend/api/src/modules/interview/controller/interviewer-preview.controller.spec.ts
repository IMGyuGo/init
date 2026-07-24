import "reflect-metadata";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import type { CurrentUser } from "@init/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CandidateDomainError } from "../../candidate";
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
    expect(Reflect.getMetadata(GUARDS_METADATA, InterviewerPreviewController))
      .toContain(JwtAuthGuard);
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
});

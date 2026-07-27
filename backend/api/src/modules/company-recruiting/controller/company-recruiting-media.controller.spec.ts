import cookieParser from "cookie-parser";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PassThrough, Writable } from "stream";
import type { Response } from "express";

import { ApiExceptionFilter } from "../../../shared/api-exception.filter";
import { ApiResponseInterceptor } from "../../../shared/api-response.interceptor";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { APPLICANT_MEDIA_COOKIE_NAME, CompanyRecruitingService } from "../service/company-recruiting.service";
import { CompanyRecruitingMediaController } from "./company-recruiting-media.controller";

describe("CompanyRecruitingMediaController", () => {
  let app: INestApplication;
  let controller: CompanyRecruitingMediaController;
  const companyUser = {
    userId: 1,
    userType: "COMPANY" as const,
    companyId: 7,
    candidateId: null,
  };
  const service = {
    getApplicantInterviewMedia: jest.fn(),
    verifyApplicantInterviewMediaSession: jest.fn(),
  };
  const jwtAuthGuard = {
    verifyToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CompanyRecruitingMediaController],
      providers: [
        { provide: CompanyRecruitingService, useValue: service },
        { provide: JwtAuthGuard, useValue: jwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    controller = moduleRef.get(CompanyRecruitingMediaController);
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("streams applicant media with partial content headers for Range requests", async () => {
    service.verifyApplicantInterviewMediaSession.mockReturnValue(companyUser);
    service.getApplicantInterviewMedia.mockResolvedValue({
      body: Buffer.from("video"),
      contentLength: 5,
      contentRange: "bytes 0-4/123456",
      contentType: "video/webm",
      originalName: "recruiting-answer.webm",
      statusCode: 206,
    });

    await request(app.getHttpServer())
      .get("/api/v1/company/applicants/77/media/8001")
      .set("Cookie", `${APPLICANT_MEDIA_COOKIE_NAME}=media-token`)
      .set("Range", "bytes=0-4")
      .expect(206)
      .expect("accept-ranges", "bytes")
      .expect("content-length", "5")
      .expect("content-range", "bytes 0-4/123456")
      .expect("content-type", /video\/webm/);

    expect(service.verifyApplicantInterviewMediaSession).toHaveBeenCalledWith("media-token", 77, 8001);
    expect(service.getApplicantInterviewMedia).toHaveBeenCalledWith(companyUser, 77, 8001, { range: "bytes=0-4" });
  });

  it("attaches an error handler before piping streamed media", async () => {
    const body = new PassThrough();
    service.verifyApplicantInterviewMediaSession.mockReturnValue(companyUser);
    service.getApplicantInterviewMedia.mockResolvedValue({
      body,
      contentLength: 5,
      contentType: "video/webm",
      originalName: "recruiting-answer.webm",
      statusCode: 200,
    });

    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & Pick<Response, "destroy" | "end" | "headersSent" | "removeHeader" | "setHeader" | "status">;
    response.status = jest.fn().mockReturnValue(response);
    response.removeHeader = jest.fn();
    response.setHeader = jest.fn();
    response.end = jest.fn();
    response.destroy = jest.fn();
    response.headersSent = false;

    await controller.getApplicantInterviewMedia(
      {
        headers: {},
        cookies: { [APPLICANT_MEDIA_COOKIE_NAME]: "media-token" },
      } as never,
      undefined,
      77,
      8001,
      response as unknown as Response,
    );

    expect(body.listenerCount("error")).toBeGreaterThan(0);
  });

  it("destroys streamed applicant media when the client response closes early", async () => {
    const body = new PassThrough();
    service.verifyApplicantInterviewMediaSession.mockReturnValue(companyUser);
    service.getApplicantInterviewMedia.mockResolvedValue({
      body,
      contentLength: 5,
      contentType: "video/webm",
      originalName: "recruiting-answer.webm",
      statusCode: 200,
    });

    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & Pick<Response, "headersSent" | "removeHeader" | "setHeader" | "status">;
    response.status = jest.fn().mockReturnValue(response);
    response.removeHeader = jest.fn();
    response.setHeader = jest.fn();
    response.headersSent = false;

    await controller.getApplicantInterviewMedia(
      {
        headers: {},
        cookies: { [APPLICANT_MEDIA_COOKIE_NAME]: "media-token" },
      } as never,
      undefined,
      77,
      8001,
      response as unknown as Response,
    );

    response.emit("close");

    expect(body.destroyed).toBe(true);
  });
});

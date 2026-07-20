import cookieParser from "cookie-parser";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Response } from "express";
import { PassThrough, Writable } from "stream";
import request from "supertest";
import { ApiExceptionFilter } from "../../../shared/api-exception.filter";
import { ApiResponseInterceptor } from "../../../shared/api-response.interceptor";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  CANDIDATE_MOCK_MEDIA_COOKIE_NAME,
  ReportService,
} from "../service/report.service";
import { CandidateReportMediaController } from "./candidate-report-media.controller";

describe("CandidateReportMediaController", () => {
  let app: INestApplication;
  let controller: CandidateReportMediaController;
  const candidateUser = {
    userId: 1,
    userType: "CANDIDATE" as const,
    candidateId: 1,
  };
  const service = {
    createMockReportMediaSession: jest.fn(),
    getMockReportMediaFile: jest.fn(),
    verifyMockReportMediaSession: jest.fn(),
  };
  const jwtAuthGuard = {
    canActivate: jest.fn((context: ExecutionContext) => {
      context.switchToHttp().getRequest().currentUser = { ...candidateUser, companyId: null };
      return true;
    }),
    verifyToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CandidateReportMediaController],
      providers: [
        { provide: ReportService, useValue: service },
        { provide: JwtAuthGuard, useValue: jwtAuthGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    controller = moduleRef.get(CandidateReportMediaController);
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

  it("issues a path-scoped HttpOnly playback cookie for an owned mock report", async () => {
    service.createMockReportMediaSession.mockResolvedValue({
      cookieName: CANDIDATE_MOCK_MEDIA_COOKIE_NAME,
      token: "media-token",
      maxAgeSeconds: 900,
      mediaBasePath: "/api/v1/candidate/mock-interview/reports/41/media",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/candidate/mock-interview/reports/41/media/session")
      .expect(201);

    expect(service.createMockReportMediaSession).toHaveBeenCalledWith(41, candidateUser);
    expect(response.body.data).toEqual({
      expiresInSeconds: 900,
      mediaBaseUrl: "/api/v1/candidate/mock-interview/reports/41/media",
    });
    expect(response.headers["set-cookie"]?.[0]).toContain(`${CANDIDATE_MOCK_MEDIA_COOKIE_NAME}=media-token`);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/api/v1/candidate/mock-interview/reports/41/media");
  });

  it("streams candidate mock media with partial content headers", async () => {
    service.verifyMockReportMediaSession.mockReturnValue(candidateUser);
    service.getMockReportMediaFile.mockResolvedValue({
      body: Buffer.from("video"),
      contentLength: 5,
      contentRange: "bytes 0-4/1024",
      contentType: "video/webm",
      originalName: "mock-answer.webm",
      statusCode: 206,
    });

    await request(app.getHttpServer())
      .get("/api/v1/candidate/mock-interview/reports/41/media/8001")
      .set("Cookie", `${CANDIDATE_MOCK_MEDIA_COOKIE_NAME}=media-token`)
      .set("Range", "bytes=0-4")
      .expect(206)
      .expect("accept-ranges", "bytes")
      .expect("content-length", "5")
      .expect("content-range", "bytes 0-4/1024")
      .expect("content-type", /video\/webm/);

    expect(service.verifyMockReportMediaSession).toHaveBeenCalledWith("media-token", 41);
    expect(service.getMockReportMediaFile).toHaveBeenCalledWith(41, 8001, candidateUser, {
      range: "bytes=0-4",
    });
  });

  it("attaches an error handler before piping streamed media", async () => {
    const body = new PassThrough();
    service.verifyMockReportMediaSession.mockReturnValue(candidateUser);
    service.getMockReportMediaFile.mockResolvedValue({
      body,
      contentLength: 5,
      contentType: "video/webm",
      originalName: "mock-answer.webm",
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

    await controller.getMockReportMediaFile(
      {
        headers: {},
        cookies: { [CANDIDATE_MOCK_MEDIA_COOKIE_NAME]: "media-token" },
      } as never,
      undefined,
      41,
      8001,
      response as unknown as Response,
    );

    expect(body.listenerCount("error")).toBeGreaterThan(0);
  });

  it("destroys streamed mock media when the client response closes early", async () => {
    const body = new PassThrough();
    service.verifyMockReportMediaSession.mockReturnValue(candidateUser);
    service.getMockReportMediaFile.mockResolvedValue({
      body,
      contentLength: 5,
      contentType: "video/webm",
      originalName: "mock-answer.webm",
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

    await controller.getMockReportMediaFile(
      {
        headers: {},
        cookies: { [CANDIDATE_MOCK_MEDIA_COOKIE_NAME]: "media-token" },
      } as never,
      undefined,
      41,
      8001,
      response as unknown as Response,
    );

    response.emit("close");

    expect(body.destroyed).toBe(true);
  });
});

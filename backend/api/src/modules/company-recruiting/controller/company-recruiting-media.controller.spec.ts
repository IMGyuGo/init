import cookieParser from "cookie-parser";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { ApiExceptionFilter } from "../../../shared/api-exception.filter";
import { ApiResponseInterceptor } from "../../../shared/api-response.interceptor";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { APPLICANT_MEDIA_COOKIE_NAME, CompanyRecruitingService } from "../service/company-recruiting.service";
import { CompanyRecruitingMediaController } from "./company-recruiting-media.controller";

describe("CompanyRecruitingMediaController", () => {
  let app: INestApplication;
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
});

import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ERROR_CODES } from "@init/common";
import { ApiException } from "../../../shared/api-exception";
import { ApiExceptionFilter } from "../../../shared/api-exception.filter";
import { ApiResponseInterceptor } from "../../../shared/api-response.interceptor";
import { AuthService } from "../service/auth.service";
import { AuthController } from "./auth.controller";

describe("AuthController Google OAuth callback", () => {
  let app: INestApplication;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const authService = {
    googleLoginStart: jest.fn(),
    googleCallback: jest.fn(),
  };

  beforeAll(async () => {
    process.env.FRONTEND_ORIGIN = "http://localhost:3000";

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    if (originalFrontendOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN;
    } else {
      process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    }
  });

  it("defaults Google login start to candidate when userType is omitted", async () => {
    authService.googleLoginStart.mockResolvedValue({
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=CANDIDATE",
    });

    await request(app.getHttpServer())
      .get("/api/v1/auth/google")
      .expect(200)
      .expect((response) => {
        expect(response.body.data.authorizationUrl).toContain("state=CANDIDATE");
      });

    expect(authService.googleLoginStart).toHaveBeenCalledWith("CANDIDATE");
  });

  it("passes company Google login attempts to the auth service policy check", async () => {
    authService.googleLoginStart.mockRejectedValue(
      new ApiException(ERROR_CODES.AUTH_USER_TYPE_MISMATCH, "기업 계정은 Google 로그인을 사용할 수 없습니다.", HttpStatus.FORBIDDEN),
    );

    await request(app.getHttpServer())
      .get("/api/v1/auth/google")
      .query({ userType: "COMPANY" })
      .expect(403)
      .expect((response) => {
        expect(response.body.error.code).toBe(ERROR_CODES.AUTH_USER_TYPE_MISMATCH);
      });

    expect(authService.googleLoginStart).toHaveBeenCalledWith("COMPANY");
  });

  it("accepts Google callback query parameters added by Google", async () => {
    authService.googleCallback.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        userId: 1,
        userType: "CANDIDATE",
        companyId: null,
        candidateId: 1,
        email: "candidate@example.com",
        name: "Candidate",
      },
    });

    await request(app.getHttpServer())
      .get("/api/v1/auth/google/callback")
      .query({
        code: "4/0AbCdEf",
        state: "CANDIDATE",
        scope: "email profile openid",
        authuser: "0",
        prompt: "consent",
        hd: "example.com",
        session_state: "provider-owned",
      })
      .expect(302)
      .expect((response) => {
        expect(response.headers.location).toBe("http://localhost:3000/auth/google/callback");
      });

    expect(authService.googleCallback).toHaveBeenCalledWith("4/0AbCdEf", "CANDIDATE");
  });

  it("redirects provider error callbacks back to login with a visible message", async () => {
    authService.googleCallback.mockRejectedValue(
      new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "Google 인증 코드가 필요합니다.", HttpStatus.BAD_REQUEST),
    );

    await request(app.getHttpServer())
      .get("/api/v1/auth/google/callback")
      .query({
        state: "CANDIDATE",
        error: "access_denied",
        error_description: "The user denied access.",
        error_uri: "https://developers.google.com/identity/protocols/oauth2",
      })
      .expect(302)
      .expect((response) => {
        const location = new URL(response.headers.location);
        expect(`${location.origin}${location.pathname}`).toBe("http://localhost:3000/login");
        expect(location.searchParams.get("errorCode")).toBe(ERROR_CODES.COMMON_VALIDATION_FAILED);
        expect(location.searchParams.get("message")).toBe("Google 인증 코드가 필요합니다.");
      });

    expect(authService.googleCallback).toHaveBeenCalledWith(undefined, "CANDIDATE");
  });
});

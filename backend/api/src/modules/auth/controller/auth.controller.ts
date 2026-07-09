import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ERROR_CODES, isUserType, type CurrentUser } from "@init/common";
import { ApiException } from "../../../shared/api-exception";
import { ApiDevAuthHeaders, ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId } from "../../../swagger/swagger.decorators";
import { CurrentUserResponseDto } from "../../../swagger/swagger.dto";
import { AuthService } from "../service/auth.service";
import { JwtAuthGuard } from "../jwt-auth.guard";
import {
  AuthTokenResponseDto,
  EmailCodeRequestDto,
  GoogleAuthorizationResponseDto,
  GoogleLoginQueryDto,
  LoginDto,
  LogoutResponseDto,
  ResetPasswordDto,
  ResetResponseDto,
  SentResponseDto,
  SignupCandidateDto,
  SignupCompanyDto,
  SignupResponseDto,
  VerifyCodeDto,
  VerifiedResponseDto,
} from "../dto/auth.dto";

@ApiTags("Auth")
@ApiErrorResponses()
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-001")
  @ApiOperation({ summary: "이메일/비밀번호 로그인" })
  @ApiEnvelopeResponse(AuthTokenResponseDto)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const userType = this.parseUserType(body.userType);
    const result = await this.auth.login({ email: body.email, password: body.password, userType });
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Get("google")
  @ApiOperationId("API-002")
  @ApiOperation({ summary: "지원자 전용 Google OAuth 로그인 URL 생성" })
  @ApiEnvelopeResponse(GoogleAuthorizationResponseDto)
  google(@Query() query: GoogleLoginQueryDto) {
    return this.auth.googleLoginStart(this.parseUserType(query.userType ?? "CANDIDATE"));
  }

  @Get("google/callback")
  @ApiOperation({ summary: "Google OAuth callback 처리" })
  @ApiFoundResponse({ description: "Redirects to frontend OAuth callback after Google OAuth succeeds." })
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() response: Response,
  ) {
    try {
      const result = await this.auth.googleCallback(code, state);
      this.setRefreshCookie(response, result.refreshToken);
      response.redirect(HttpStatus.FOUND, this.frontendGoogleCallbackUrl());
    } catch (error) {
      response.redirect(HttpStatus.FOUND, this.frontendLoginErrorUrl(error));
    }
  }

  @Post("signup/candidate")
  @ApiOperationId("API-003")
  @ApiOperation({ summary: "지원자 계정 생성" })
  @ApiEnvelopeResponse(SignupResponseDto, 201)
  signupCandidate(@Body() body: SignupCandidateDto) {
    return this.auth.signupCandidate(body);
  }

  @Post("signup/company")
  @ApiOperationId("API-006")
  @ApiOperation({ summary: "기업 계정 생성" })
  @ApiEnvelopeResponse(SignupResponseDto, 201)
  signupCompany(@Body() body: SignupCompanyDto) {
    return this.auth.signupCompany(body);
  }

  @Post("email/send-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-004")
  @ApiOperation({ summary: "회원가입 이메일 인증 코드 발송" })
  @ApiEnvelopeResponse(SentResponseDto)
  sendEmailCode(@Body() body: EmailCodeRequestDto) {
    return this.auth.sendEmailCode(body.email);
  }

  @Post("email/verify-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-005")
  @ApiOperation({ summary: "회원가입 이메일 인증 코드 확인" })
  @ApiEnvelopeResponse(VerifiedResponseDto)
  verifyEmailCode(@Body() body: VerifyCodeDto) {
    return this.auth.verifyEmailCode(body.email, body.code);
  }

  @Post("password/send-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-008")
  @ApiOperation({ summary: "비밀번호 재설정 인증 코드 발송" })
  @ApiEnvelopeResponse(SentResponseDto)
  sendPasswordCode(@Body() body: EmailCodeRequestDto) {
    return this.auth.sendPasswordCode(body.email);
  }

  @Post("password/verify-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-009")
  @ApiOperation({ summary: "비밀번호 재설정 인증 코드 확인" })
  @ApiEnvelopeResponse(VerifiedResponseDto)
  verifyPasswordCode(@Body() body: VerifyCodeDto) {
    return this.auth.verifyPasswordCode(body.email, body.code);
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-007")
  @ApiOperation({ summary: "비밀번호 재설정" })
  @ApiEnvelopeResponse(ResetResponseDto)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword({
      email: body.email,
      code: body.code,
      password: body.password ?? body.newPassword ?? "",
      passwordConfirm: body.passwordConfirm ?? body.newPasswordConfirm ?? "",
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiBearerAuth("bearer")
  @ApiDevAuthHeaders()
  @ApiOperationId("API-080")
  @ApiOperation({ summary: "현재 로그인 사용자 조회" })
  @ApiEnvelopeResponse(CurrentUserResponseDto)
  me(@Req() request: Request & { currentUser: CurrentUser }) {
    return this.auth.me(request.currentUser);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("refreshToken")
  @ApiOperationId("API-081")
  @ApiOperation({ summary: "refreshToken 쿠키로 accessToken 재발급" })
  @ApiEnvelopeResponse(AuthTokenResponseDto)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieName = process.env.AUTH_REFRESH_COOKIE_NAME ?? "refreshToken";
    const result = await this.auth.refresh(request.cookies?.[cookieName]);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("refreshToken")
  @ApiOperationId("API-082")
  @ApiOperation({ summary: "refreshToken 쿠키 제거" })
  @ApiEnvelopeResponse(LogoutResponseDto)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(process.env.AUTH_REFRESH_COOKIE_NAME ?? "refreshToken", { path: "/" });
    return { loggedOut: true };
  }

  private parseUserType(input: unknown) {
    if (!isUserType(input)) {
      throw new ApiException("COMMON_VALIDATION_FAILED", "사용자 유형을 확인해 주세요.", 400);
    }
    return input;
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie(process.env.AUTH_REFRESH_COOKIE_NAME ?? "refreshToken", refreshToken, {
      httpOnly: true,
      secure: (process.env.AUTH_COOKIE_SECURE ?? "false") === "true",
      sameSite: (process.env.AUTH_COOKIE_SAME_SITE ?? "lax") as "lax" | "strict" | "none",
      path: "/",
    });
  }

  private frontendGoogleCallbackUrl() {
    return new URL("/auth/google/callback", process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").toString();
  }

  private frontendLoginErrorUrl(error: unknown) {
    const loginUrl = new URL("/login", process.env.FRONTEND_ORIGIN ?? "http://localhost:3000");
    const payload = this.oauthErrorPayload(error);
    loginUrl.searchParams.set("errorCode", payload.code);
    loginUrl.searchParams.set("message", payload.message);
    return loginUrl.toString();
  }

  private oauthErrorPayload(error: unknown) {
    if (error instanceof ApiException) {
      return { code: error.code, message: this.httpExceptionMessage(error) };
    }

    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response !== null) {
        const body = response as { code?: string; message?: string };
        return {
          code: body.code ?? ERROR_CODES.COMMON_UNAUTHORIZED,
          message: body.message ?? "Google 로그인에 실패했습니다.",
        };
      }
      if (typeof response === "string" && response.trim()) {
        return { code: ERROR_CODES.COMMON_UNAUTHORIZED, message: response };
      }
    }

    return { code: ERROR_CODES.COMMON_UNAUTHORIZED, message: "Google 로그인에 실패했습니다." };
  }

  private httpExceptionMessage(error: HttpException) {
    const response = error.getResponse();
    if (typeof response === "object" && response !== null && "message" in response) {
      return String((response as { message?: unknown }).message ?? "Google 로그인에 실패했습니다.");
    }
    if (typeof response === "string" && response.trim()) {
      return response;
    }
    return "Google 로그인에 실패했습니다.";
  }
}

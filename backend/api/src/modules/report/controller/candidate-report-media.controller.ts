import {
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { CurrentUser } from "@init/common";
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { pipeReadableToResponse } from "../../../shared/pipe-readable-to-response";
import { ok } from "../../../shared/response-envelope";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  CandidateDomainError,
  resolveCurrentCandidate,
  type CurrentCandidateUser,
} from "../../candidate";
import { reportApiRoutePrefix, reportApiRoutes } from "../report.routes";
import {
  CANDIDATE_MOCK_MEDIA_COOKIE_NAME,
  ReportService,
} from "../service/report.service";

type CandidateRequest = Request & { currentUser: CurrentUser };
type CandidateMediaRequest = Request & { cookies?: Record<string, string | undefined> };

@ApiTags("Candidate Report")
@Controller(reportApiRoutePrefix)
export class CandidateReportMediaController {
  constructor(
    @Inject(ReportService) private readonly reportService: ReportService,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  @Post(reportApiRoutes.mockMediaSession)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "모의면접 리포트 녹화 재생 세션 발급",
    description: "지원자 본인의 완료된 모의면접 리포트에 한해 녹화 파일을 재생할 수 있는 단기 HttpOnly 쿠키 세션을 발급합니다.",
  })
  async createMockReportMediaSession(
    @Req() request: CandidateRequest,
    @Param("reportId", ParseIntPipe) reportId: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.handle(async () => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      const session = await this.reportService.createMockReportMediaSession(reportId, currentUser);
      response.cookie(session.cookieName, session.token, {
        httpOnly: true,
        maxAge: session.maxAgeSeconds * 1000,
        path: session.mediaBasePath,
        sameSite: (process.env.AUTH_COOKIE_SAME_SITE ?? "lax") as "lax" | "strict" | "none",
        secure: (process.env.AUTH_COOKIE_SECURE ?? "false") === "true",
      });
      return ok(request, {
        expiresInSeconds: session.maxAgeSeconds,
        mediaBaseUrl: session.mediaBasePath,
      });
    });
  }

  @Get(reportApiRoutes.mockMediaFile)
  @ApiCookieAuth(CANDIDATE_MOCK_MEDIA_COOKIE_NAME)
  @ApiOperation({
    summary: "모의면접 리포트 녹화 파일 재생",
    description: "재생 세션 또는 지원자 인증을 검증한 뒤 해당 리포트 답변에 연결된 영상·음성 파일을 Range 요청과 함께 스트리밍합니다.",
  })
  async getMockReportMediaFile(
    @Req() request: CandidateMediaRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId", ParseIntPipe) reportId: number,
    @Param("fileId", ParseIntPipe) fileId: number,
    @Res() response: Response,
  ) {
    return this.handle(async () => {
      const currentUser = this.resolveMediaUser(
        authorization,
        request.cookies?.[CANDIDATE_MOCK_MEDIA_COOKIE_NAME],
        reportId,
      );
      const range = typeof request.headers.range === "string" ? request.headers.range : undefined;
      const media = await this.reportService.getMockReportMediaFile(reportId, fileId, currentUser, { range });

      response.status(media.statusCode);
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Cache-Control", "private, max-age=60");
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(media.originalName)}`);
      response.setHeader("Content-Length", String(media.contentLength));
      response.setHeader("Content-Type", media.contentType);
      if (media.contentRange) {
        response.setHeader("Content-Range", media.contentRange);
      }

      if (Buffer.isBuffer(media.body)) {
        response.end(media.body);
        return;
      }
      pipeReadableToResponse(media.body, response);
    });
  }

  private resolveMediaUser(
    authorization: string | undefined,
    mediaToken: string | undefined,
    reportId: number,
  ): CurrentCandidateUser {
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    if (bearerToken) {
      const payload = this.jwtAuthGuard.verifyToken(bearerToken, "access");
      return resolveCurrentCandidate({
        userId: payload.sub,
        userType: payload.userType,
        companyId: payload.companyId,
        candidateId: payload.candidateId,
      });
    }
    return this.reportService.verifyMockReportMediaSession(mediaToken, reportId);
  }

  private async handle<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof CandidateDomainError) {
        throw new HttpException(
          { code: error.code, message: error.message, details: error.details },
          error.statusCode,
        );
      }
      throw error;
    }
  }
}

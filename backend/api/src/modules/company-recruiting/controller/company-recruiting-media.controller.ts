import { Controller, Get, Headers, Inject, Param, ParseIntPipe, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CurrentUser } from "@init/common";
import type { Request, Response } from "express";

import { ApiErrorResponses, ApiOperationId } from "../../../swagger/swagger.decorators";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  APPLICANT_MEDIA_COOKIE_NAME,
  CompanyRecruitingService,
} from "../service/company-recruiting.service";

type MediaRequest = Request & {
  cookies?: Record<string, string | undefined>;
};

@ApiTags("Company Recruiting")
@ApiBearerAuth("bearer")
@ApiErrorResponses()
@Controller("company")
export class CompanyRecruitingMediaController {
  constructor(
    @Inject(CompanyRecruitingService) private readonly companyRecruitingService: CompanyRecruitingService,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  @Get("applicants/:applicantId/media/:fileId")
  @ApiOperationId("API-020-MEDIA")
  @ApiOperation({ summary: "기업 지원자 면접 답변 녹화 조회" })
  async getApplicantInterviewMedia(
    @Req() request: MediaRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("applicantId", ParseIntPipe) applicantId: number,
    @Param("fileId", ParseIntPipe) fileId: number,
    @Res() response: Response,
  ) {
    const currentUser = this.resolveMediaUser(authorization, request.cookies?.[APPLICANT_MEDIA_COOKIE_NAME], applicantId, fileId);
    const range = typeof request.headers.range === "string" ? request.headers.range : undefined;
    const media = await this.companyRecruitingService.getApplicantInterviewMedia(currentUser, applicantId, fileId, { range });

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
    media.body.pipe(response);
  }

  private resolveMediaUser(
    authorization: string | undefined,
    mediaToken: string | undefined,
    applicantId: number,
    fileId: number,
  ): CurrentUser {
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
    if (bearerToken) {
      const payload = this.jwtAuthGuard.verifyToken(bearerToken, "access");
      return {
        userId: payload.sub,
        userType: payload.userType,
        companyId: payload.companyId,
        candidateId: payload.candidateId,
      };
    }

    return this.companyRecruitingService.verifyApplicantInterviewMediaSession(mediaToken, applicantId, fileId);
  }
}

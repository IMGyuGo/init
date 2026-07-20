import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CurrentUser } from "@init/common";
import type { Response } from "express";

import { ok, okList, type RequestLike } from "../../../shared/response-envelope";
import { ApiEnvelopeResponse, ApiErrorResponses, ApiListEnvelopeResponse, ApiOperationId, ApiParamId } from "../../../swagger/swagger.decorators";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CompanyRecruitingService } from "../service/company-recruiting.service";
import {
  ApplicantEvaluationResponseDto,
  ApplicantResponseDto,
  ApplicantSummaryResponseDto,
  JdImageUploadResponseDto,
  PassMailDispatchResponseDto,
  RecruitmentResponseDto,
} from "../dto/company-recruiting-response.dto";
import { CreateRecruitmentDto } from "../dto/create-recruitment.dto";
import { ListApplicantsByRecruitmentQueryDto, ListApplicantsQueryDto, ListQueryDto } from "../dto/list-query.dto";
import { SendRecruitmentPassMailsDto } from "../dto/send-recruitment-pass-mails.dto";
import { UpdateRecruitmentDto } from "../dto/update-recruitment.dto";
import { UpdateScreeningStatusDto } from "../dto/update-screening-status.dto";

type CompanyRequest = RequestLike & { currentUser: CurrentUser };
type UploadedJdImageFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@UseGuards(JwtAuthGuard)
@ApiTags("Company Recruiting")
@ApiBearerAuth("bearer")
@ApiErrorResponses()
@Controller("company")
export class CompanyRecruitingController {
  constructor(@Inject(CompanyRecruitingService) private readonly companyRecruitingService: CompanyRecruitingService) {}

  @Post("recruitments")
  @ApiOperationId("API-080")
  @ApiOperation({ summary: "기업 공고 생성" })
  @ApiEnvelopeResponse(RecruitmentResponseDto, 201)
  async createRecruitment(
    @Req() request: CompanyRequest,
    @Body() dto: CreateRecruitmentDto,
  ) {
    const data = await this.companyRecruitingService.createRecruitment(request.currentUser, dto);
    return ok(request, data);
  }

  @Post("recruitments/jd-images")
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperationId("API-086")
  @ApiOperation({ summary: "JD 에디터 이미지 업로드" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "image/png, image/jpeg, image/webp",
        },
      },
    },
  })
  @ApiEnvelopeResponse(JdImageUploadResponseDto, 201)
  async uploadJobDescriptionImage(
    @Req() request: CompanyRequest,
    @UploadedFile() file?: UploadedJdImageFile,
  ) {
    const data = await this.companyRecruitingService.uploadJobDescriptionImage(
      request.currentUser,
      file
        ? {
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            buffer: file.buffer,
          }
        : undefined,
    );
    return ok(request, {
      ...data,
      createdAt: data.createdAt.toISOString(),
    });
  }

  @Get("recruitments")
  @ApiOperationId("API-011/API-032")
  @ApiOperation({ summary: "회사별 공고 목록 조회와 검색/필터링" })
  @ApiListEnvelopeResponse(RecruitmentResponseDto)
  async listRecruitments(
    @Req() request: CompanyRequest,
    @Query() query: ListQueryDto,
  ) {
    const result = await this.companyRecruitingService.listRecruitments(request.currentUser, query);
    return okList(request, result.items, result.page);
  }

  @Get("recruitments/:recruitmentId")
  @ApiOperationId("API-013")
  @ApiOperation({ summary: "공고 상세 조회" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiEnvelopeResponse(RecruitmentResponseDto)
  async getRecruitment(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
  ) {
    const data = await this.companyRecruitingService.getRecruitment(request.currentUser, recruitmentId);
    return ok(request, data);
  }

  @Patch("recruitments/:recruitmentId")
  @ApiOperationId("API-083")
  @ApiOperation({ summary: "공고 설정 수정" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiEnvelopeResponse(RecruitmentResponseDto)
  async updateRecruitment(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
    @Body() dto: UpdateRecruitmentDto,
  ) {
    const data = await this.companyRecruitingService.updateRecruitment(request.currentUser, recruitmentId, dto);
    return ok(request, data);
  }

  @Delete("recruitments/:recruitmentId")
  @ApiOperationId("API-084")
  @ApiOperation({ summary: "공고 삭제/보관" })
  @ApiParamId("recruitmentId", "삭제할 채용 공고 ID")
  @ApiEnvelopeResponse(RecruitmentResponseDto)
  async deleteRecruitment(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
  ) {
    const data = await this.companyRecruitingService.deleteRecruitment(request.currentUser, recruitmentId);
    return ok(request, data);
  }

  @Post("recruitments/:recruitmentId/copy")
  @ApiOperationId("API-033")
  @ApiOperation({ summary: "마감 공고 복사" })
  @ApiParamId("recruitmentId", "복사할 마감 공고 ID")
  @ApiEnvelopeResponse(RecruitmentResponseDto)
  async copyRecruitment(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
  ) {
    const data = await this.companyRecruitingService.copyRecruitment(request.currentUser, recruitmentId);
    return ok(request, data);
  }

  @Get("recruitments/:recruitmentId/applicants")
  @ApiOperationId("API-014")
  @ApiOperation({ summary: "공고별 지원자 목록 조회" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiListEnvelopeResponse(ApplicantResponseDto)
  async listRecruitmentApplicants(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
    @Query() query: ListApplicantsQueryDto,
  ) {
    const result = await this.companyRecruitingService.listRecruitmentApplicants(request.currentUser, recruitmentId, query);
    return okList(request, result.items, result.page);
  }

  @Get("recruitments/:recruitmentId/applicants/summary")
  @ApiOperationId("API-014-SUMMARY")
  @ApiOperation({ summary: "공고별 지원자 상태 전체 집계" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiEnvelopeResponse(ApplicantSummaryResponseDto)
  async getRecruitmentApplicantSummary(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
  ) {
    const data = await this.companyRecruitingService.getRecruitmentApplicantSummary(request.currentUser, recruitmentId);
    return ok(request, data);
  }

  @Post("recruitments/:recruitmentId/applicants/pass-mails")
  @HttpCode(200)
  @ApiOperationId("API-014-PASS-MAILS")
  @ApiOperation({ summary: "목표 합격자 수 기준 합격 처리 및 합격 메일 발송" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiEnvelopeResponse(PassMailDispatchResponseDto)
  async sendRecruitmentPassMails(
    @Req() request: CompanyRequest,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
    @Body() dto: SendRecruitmentPassMailsDto,
  ) {
    const data = await this.companyRecruitingService.sendRecruitmentPassMails(request.currentUser, recruitmentId, dto);
    return ok(request, data);
  }

  @Get("applicants")
  @ApiOperationId("API-018")
  @ApiOperation({ summary: "지원자 목록 조회" })
  @ApiListEnvelopeResponse(ApplicantResponseDto)
  async listApplicants(
    @Req() request: CompanyRequest,
    @Query() query: ListApplicantsByRecruitmentQueryDto,
  ) {
    const result = await this.companyRecruitingService.listRecruitmentApplicants(request.currentUser, query.recruitmentId, query);
    return okList(request, result.items, result.page);
  }

  @Get("applicants/:applicantId/evaluation")
  @ApiOperationId("API-020")
  @ApiOperation({ summary: "서류 평가와 채용 리포트 통합 조회" })
  @ApiParamId("applicantId", "지원자/application ID")
  @ApiEnvelopeResponse(ApplicantEvaluationResponseDto)
  async getApplicantEvaluation(
    @Req() request: CompanyRequest,
    @Param("applicantId", ParseIntPipe) applicantId: number,
  ) {
    const data = await this.companyRecruitingService.getApplicantEvaluation(request.currentUser, applicantId);
    return ok(request, data);
  }

  @Post("applicants/:applicantId/media/:fileId/session")
  @ApiOperationId("API-020-MEDIA-SESSION")
  @ApiOperation({ summary: "기업 지원자 면접 답변 녹화 재생 세션 발급" })
  async createApplicantInterviewMediaSession(
    @Req() request: CompanyRequest,
    @Param("applicantId", ParseIntPipe) applicantId: number,
    @Param("fileId", ParseIntPipe) fileId: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.companyRecruitingService.createApplicantInterviewMediaSession(
      request.currentUser,
      applicantId,
      fileId,
    );
    response.cookie(session.cookieName, session.token, {
      httpOnly: true,
      maxAge: session.maxAgeSeconds * 1000,
      path: session.mediaPath,
      sameSite: (process.env.AUTH_COOKIE_SAME_SITE ?? "lax") as "lax" | "strict" | "none",
      secure: (process.env.AUTH_COOKIE_SECURE ?? "false") === "true",
    });
    return ok(request, {
      expiresInSeconds: session.maxAgeSeconds,
      mediaUrl: session.mediaPath,
    });
  }

  @Patch("applicants/:applicantId/screening-status")
  @ApiOperationId("API-012")
  @ApiOperation({ summary: "전형 상태 지정" })
  @ApiParamId("applicantId", "지원자/application ID")
  @ApiEnvelopeResponse(ApplicantResponseDto)
  async updateScreeningStatus(
    @Req() request: CompanyRequest,
    @Param("applicantId", ParseIntPipe) applicantId: number,
    @Body() dto: UpdateScreeningStatusDto,
  ) {
    const data = await this.companyRecruitingService.updateScreeningStatus(request.currentUser, applicantId, dto);
    return ok(request, data);
  }
}

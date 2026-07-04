import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Req, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ok, type RequestLike } from "../../../shared/response-envelope";
import { ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId, ApiParamId } from "../../../swagger/swagger.decorators";
import {
  PublicApplicationAccessLinkResponseDto,
  PublicApplicationResponseDto,
  PublicRecruitmentResponseDto,
} from "../dto/company-recruiting-response.dto";
import { RequestPublicApplicationAccessLinkDto } from "../dto/request-public-application-access-link.dto";
import { SubmitPublicApplicationDto } from "../dto/submit-public-application.dto";
import {
  CompanyRecruitingService,
  getConfiguredPublicApplicationDocumentMaxUploadBytes,
} from "../service/company-recruiting.service";

type UploadedPublicApplicationFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type UploadedPublicApplicationFiles = {
  resumeFile?: UploadedPublicApplicationFile[];
  portfolioFile?: UploadedPublicApplicationFile[];
};

const PUBLIC_APPLICATION_TEXT_FIELD_MAX_BYTES = 20 * 1024;

@ApiTags("Public Recruitment")
@ApiErrorResponses()
@Controller("public/recruitments")
export class PublicRecruitmentController {
  constructor(@Inject(CompanyRecruitingService) private readonly companyRecruitingService: CompanyRecruitingService) {}

  @Get(":recruitmentId")
  @ApiOperationId("API-086")
  @ApiOperation({ summary: "공개 공고 상세 조회" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiEnvelopeResponse(PublicRecruitmentResponseDto)
  async getPublicRecruitment(
    @Req() request: RequestLike,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
  ) {
    const data = await this.companyRecruitingService.getPublicRecruitment(recruitmentId);
    return ok(request, data);
  }

  @Post(":recruitmentId/applications")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "resumeFile", maxCount: 1 },
        { name: "portfolioFile", maxCount: 1 },
      ],
      {
        limits: {
          fileSize: getConfiguredPublicApplicationDocumentMaxUploadBytes(),
          files: 2,
          fields: 10,
          fieldSize: PUBLIC_APPLICATION_TEXT_FIELD_MAX_BYTES,
          parts: 12,
        },
      },
    ),
  )
  @ApiOperationId("API-087")
  @ApiOperation({ summary: "공개 지원 폼 제출" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "email", "phone", "resumeFile", "consentAgreed"],
      properties: {
        name: { type: "string", example: "김지원" },
        email: { type: "string", format: "email", example: "candidate@example.com" },
        phone: { type: "string", example: "010-0000-0000" },
        githubBlogUrl: { type: "string", format: "uri", example: "https://github.com/candidate" },
        portfolioMode: { type: "string", enum: ["URL", "FILE"], example: "URL" },
        portfolioUrl: { type: "string", format: "uri", example: "https://portfolio.example.com" },
        portfolioFile: { type: "string", format: "binary", description: "선택, application/pdf" },
        resumeFile: { type: "string", format: "binary", description: "필수, application/pdf" },
        motivation: { type: "string", example: "지원 동기" },
        additionalInfo: { type: "string", example: "추가 설명" },
        consentAgreed: { type: "boolean", example: true },
      },
    },
  })
  @ApiEnvelopeResponse(PublicApplicationResponseDto, 201)
  async submitPublicApplication(
    @Req() request: RequestLike,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
    @Body() dto: SubmitPublicApplicationDto,
    @UploadedFiles() files?: UploadedPublicApplicationFiles,
  ) {
    const data = await this.companyRecruitingService.submitPublicApplication(recruitmentId, dto, {
      resumeFile: toUploadFile(files?.resumeFile?.[0]),
      portfolioFile: toUploadFile(files?.portfolioFile?.[0]),
    });
    return ok(request, data);
  }

  @Post(":recruitmentId/applications/access-link")
  @ApiOperationId("API-088")
  @ApiOperation({ summary: "지원 현황 매직링크 재발급 요청" })
  @ApiParamId("recruitmentId", "채용 공고 ID")
  @ApiEnvelopeResponse(PublicApplicationAccessLinkResponseDto)
  async requestPublicApplicationAccessLink(
    @Req() request: RequestLike,
    @Param("recruitmentId", ParseIntPipe) recruitmentId: number,
    @Body() dto: RequestPublicApplicationAccessLinkDto,
  ) {
    const data = await this.companyRecruitingService.requestPublicApplicationAccessLink(recruitmentId, dto);
    return ok(request, data);
  }
}

function toUploadFile(file: UploadedPublicApplicationFile | undefined) {
  return file
    ? {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        buffer: file.buffer,
      }
    : undefined;
}

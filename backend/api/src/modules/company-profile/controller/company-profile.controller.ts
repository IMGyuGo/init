import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CurrentUser } from "@init/common";

import { ok, type RequestLike } from "../../../shared/response-envelope";
import { ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId } from "../../../swagger/swagger.decorators";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CompanyProfileResponseDto } from "../dto/company-profile-response.dto";
import { UpdateCompanyProfileDto } from "../dto/update-company-profile.dto";
import { CompanyProfileService } from "../service/company-profile.service";

type CompanyRequest = RequestLike & { currentUser: CurrentUser };
type UploadedLogoFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@UseGuards(JwtAuthGuard)
@ApiTags("Company Profile")
@ApiBearerAuth("bearer")
@ApiErrorResponses()
@Controller("company")
export class CompanyProfileController {
  constructor(@Inject(CompanyProfileService) private readonly companyProfileService: CompanyProfileService) {}

  @Get("profile")
  @ApiOperationId("API-087")
  @ApiOperation({ summary: "기업 마이페이지 프로필 조회" })
  @ApiEnvelopeResponse(CompanyProfileResponseDto)
  async getProfile(@Req() request: CompanyRequest) {
    const data = await this.companyProfileService.getProfile(request.currentUser);
    return ok(request, serializeProfile(data));
  }

  @Patch("profile")
  @ApiOperationId("API-041")
  @ApiOperation({ summary: "기업 프로필 수정" })
  @ApiEnvelopeResponse(CompanyProfileResponseDto)
  async updateProfile(
    @Req() request: CompanyRequest,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    const data = await this.companyProfileService.updateProfile(request.currentUser, dto);
    return ok(request, serializeProfile(data));
  }

  @Post("profile/logo")
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperationId("API-042")
  @ApiOperation({ summary: "기업 로고 업로드" })
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
  @ApiEnvelopeResponse(CompanyProfileResponseDto, 201)
  async uploadLogo(
    @Req() request: CompanyRequest,
    @UploadedFile() file?: UploadedLogoFile,
  ) {
    const data = await this.companyProfileService.uploadLogo(
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
    return ok(request, serializeProfile(data));
  }
}

function serializeProfile(data: Awaited<ReturnType<CompanyProfileService["getProfile"]>>) {
  return {
    ...data,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
  };
}

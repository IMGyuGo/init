import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { ok, type RequestLike } from "../../../shared/response-envelope";
import { ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId } from "../../../swagger/swagger.decorators";
import {
  PublicApplicationStatusResponseDto,
  PublicApplicationTokenVerificationResponseDto,
} from "../dto/company-recruiting-response.dto";
import {
  PublicApplicationStatusQueryDto,
  VerifyPublicApplicationTokenDto,
} from "../dto/request-public-application-access-link.dto";
import { CompanyRecruitingService } from "../service/company-recruiting.service";

@ApiTags("Public Application")
@ApiErrorResponses()
@Controller("public/applications")
export class PublicApplicationController {
  constructor(@Inject(CompanyRecruitingService) private readonly companyRecruitingService: CompanyRecruitingService) {}

  @Get("status")
  @ApiOperationId("API-089")
  @ApiOperation({ summary: "매직링크 토큰 기반 지원 현황 조회" })
  @ApiEnvelopeResponse(PublicApplicationStatusResponseDto)
  async getPublicApplicationStatus(@Req() request: RequestLike, @Query() query: PublicApplicationStatusQueryDto) {
    const data = await this.companyRecruitingService.getPublicApplicationStatusByMagicLink(query.token);
    return ok(request, data);
  }

  @Post("token/verify")
  @ApiOperationId("API-089B")
  @ApiOperation({ summary: "D public 면접 시작용 매직링크 토큰 검증" })
  @ApiEnvelopeResponse(PublicApplicationTokenVerificationResponseDto)
  async verifyPublicApplicationToken(@Req() request: RequestLike, @Body() dto: VerifyPublicApplicationTokenDto) {
    const verifySecret = readHeader(request, "x-public-application-verify-secret");
    const data = await this.companyRecruitingService.verifyPublicApplicationTokenForInterviewStart(dto.token, verifySecret);
    return ok(request, data);
  }
}

function readHeader(request: RequestLike, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

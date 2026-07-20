import {
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevAuthAdapter } from "../../../common/dev-auth/dev-auth.adapter";
import { CurrentUser } from "../../../common/dev-auth/current-user";
import { ApiDevAuthHeaders, ApiErrorResponses, ApiOperationId, ApiParamId } from "../../../swagger/swagger.decorators";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  ScreeningRetryConflictError,
  ScreeningRetryNotFoundError,
} from "../repository/screening-retry.repository";
import { ScreeningRetryService } from "../service/screening-retry.service";

type AdminRequest = {
  headers?: Record<string, string | string[] | undefined>;
  currentUser?: CurrentUser;
};

@ApiTags("Admin AI Operations")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@UseGuards(JwtAuthGuard)
@Controller("admin/applications")
export class AdminScreeningRetryController {
  constructor(
    @Inject(DevAuthAdapter) private readonly devAuthAdapter: DevAuthAdapter,
    @Inject(ScreeningRetryService) private readonly screeningRetryService: ScreeningRetryService,
  ) {}

  @Post(":applicationId/screening-retry")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-100")
  @ApiOperation({ summary: "자동 전형 RETRY 리포트 명시적 재처리" })
  @ApiParamId("applicationId", "지원서 ID")
  async retry(@Param("applicationId") applicationIdParam: string, @Req() request: AdminRequest) {
    const currentUser = request.currentUser ?? this.devAuthAdapter.parse(request.headers ?? {});
    this.devAuthAdapter.assertAdmin(currentUser);
    const applicationId = Number(applicationIdParam);
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      throw new BadRequestException({
        code: "COMMON_VALIDATION_FAILED",
        message: "applicationId must be a positive integer.",
      });
    }

    try {
      return await this.screeningRetryService.retry(applicationId);
    } catch (error) {
      if (error instanceof ScreeningRetryNotFoundError) {
        throw new NotFoundException({ code: "COMMON_NOT_FOUND", message: error.message });
      }
      if (error instanceof ScreeningRetryConflictError) {
        throw new ConflictException({ code: "COMMON_CONFLICT", message: error.message });
      }
      throw error;
    }
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CurrentUser } from "../../../common/dev-auth/current-user";
import { ApiDevAuthHeaders, ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId } from "../../../swagger/swagger.decorators";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { AiPerformanceLogResponseDto, AiPerformanceQueryDto, ClientPerformanceLogRequestDto } from "../dto/ai-performance.dto";
import { AiPerformanceService } from "../service/ai-performance.service";

type AiPerformanceRequest = {
  currentUser?: CurrentUser;
};

@ApiTags("AI Performance")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiPerformanceController {
  constructor(private readonly performance: AiPerformanceService) {}

  @Post("performance-logs")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-097")
  @ApiOperation({ summary: "AI client performance log save" })
  @ApiEnvelopeResponse(AiPerformanceLogResponseDto, 202)
  recordClientLog(@Req() request: AiPerformanceRequest, @Body() body: ClientPerformanceLogRequestDto) {
    return this.performance.recordClientLog(body, request.currentUser);
  }

  @Get("performance/jobs")
  @ApiOperationId("API-098")
  @ApiOperation({ summary: "AI process performance jobs" })
  @ApiEnvelopeResponse(Object)
  listJobs(@Query() query: AiPerformanceQueryDto) {
    return this.performance.listJobs(query);
  }

  @Get("performance/client-events")
  @ApiOperationId("API-099")
  @ApiOperation({ summary: "AI client performance events" })
  @ApiEnvelopeResponse(Object)
  listClientEvents(@Query() query: AiPerformanceQueryDto) {
    return this.performance.listClientEvents(query);
  }

  @Get("performance/summary")
  @ApiOperationId("API-100")
  @ApiOperation({ summary: "AI performance and estimated cost summary" })
  @ApiEnvelopeResponse(Object)
  summary(@Query() query: AiPerformanceQueryDto) {
    return this.performance.summary(query);
  }
}

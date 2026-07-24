import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { CurrentUser } from "@init/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  ApiDevAuthHeaders,
  ApiErrorResponses,
  ApiOperationId,
} from "../../../swagger/swagger.decorators";
import { ApiErrorEnvelopeDto } from "../../../swagger/swagger.dto";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CandidateDomainError } from "../../candidate";
import { CreateRealtimeInterviewSessionDto } from "../dto/interview.runtime.dto";
import { InterviewerPreviewRealtimeService } from "../service/interviewer-preview-realtime.service";

@ApiTags("Interviewer Preview")
@ApiErrorResponses()
@Controller("interviewer-preview")
@UseGuards(JwtAuthGuard)
export class InterviewerPreviewController {
  constructor(
    @Inject(InterviewerPreviewRealtimeService)
    private readonly service: InterviewerPreviewRealtimeService,
  ) {}

  @Post("realtime-session")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("bearer")
  @ApiDevAuthHeaders()
  @ApiOperationId("API-097-RT")
  @ApiOperation({ summary: "면접관 립싱크 튜닝용 실시간 AI 세션 생성" })
  @ApiResponse({ status: HttpStatus.OK, description: "Realtime preview ephemeral credential issued" })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ApiErrorEnvelopeDto,
    description: "OpenAI Realtime provider configuration conflict",
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    type: ApiErrorEnvelopeDto,
    description: "OpenAI Realtime credential provider failure",
  })
  createRealtimeSession(
    @Req() request: Request & { currentUser: CurrentUser },
    @Body() dto: CreateRealtimeInterviewSessionDto,
  ) {
    return this.handle(() => this.service.createSession(dto, request.currentUser));
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

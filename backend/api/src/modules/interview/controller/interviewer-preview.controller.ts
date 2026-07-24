import {
  Body,
  Controller,
  HttpException,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { CurrentUser } from "@init/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CandidateDomainError } from "../../candidate";
import { CreateRealtimeInterviewSessionDto } from "../dto/interview.runtime.dto";
import { InterviewerPreviewRealtimeService } from "../service/interviewer-preview-realtime.service";

@Controller("interviewer-preview")
@UseGuards(JwtAuthGuard)
export class InterviewerPreviewController {
  constructor(
    @Inject(InterviewerPreviewRealtimeService)
    private readonly service: InterviewerPreviewRealtimeService,
  ) {}

  @Post("realtime-session")
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

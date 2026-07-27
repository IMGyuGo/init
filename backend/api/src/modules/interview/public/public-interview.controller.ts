import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CandidateDomainError } from "../../candidate";
import { DeviceCheckDto } from "../dto/interview.device-check.dto";
import { AiInterviewRequestDto, CreateRealtimeInterviewSessionDto, SaveInterviewAnswerDto } from "../dto/interview.runtime.dto";
import { PublicInterviewAccessGuard, type PublicInterviewRequest } from "./public-interview-access.guard";
import { PublicInterviewStartDto } from "./public-interview.dto";
import { UploadInterviewMediaDto } from "../dto/upload-interview-media.dto";
import { PublicInterviewService } from "./public-interview.service";

type UploadedInterviewMediaFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller("public")
export class PublicInterviewController {
  constructor(private readonly publicInterviewService: PublicInterviewService) {}

  @Post("applications/:applicationId/interview/start")
  startPublicInterview(@Param("applicationId") applicationId: string, @Body() dto: PublicInterviewStartDto) {
    return this.handle(() => this.publicInterviewService.startPublicInterview(Number(applicationId), dto));
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("applications/:applicationId/interview/begin")
  beginPublicInterview(@Req() request: PublicInterviewRequest, @Param("applicationId") applicationId: string) {
    return this.handle(() =>
      this.publicInterviewService.beginPublicInterview(Number(applicationId), request.publicInterviewAccess),
    );
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Get("applications/:applicationId/interview")
  getRuntime(@Req() request: PublicInterviewRequest, @Param("applicationId") applicationId: string) {
    return this.handle(() => this.publicInterviewService.getRuntime(Number(applicationId), request.publicInterviewAccess));
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/device-check")
  saveDeviceCheck(
    @Req() request: PublicInterviewRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: DeviceCheckDto,
  ) {
    return this.handle(() =>
      this.publicInterviewService.saveDeviceCheck(Number(sessionId), dto, request.publicInterviewAccess),
    );
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Get("interviews/:sessionId/questions")
  listQuestions(@Req() request: PublicInterviewRequest, @Param("sessionId") sessionId: string) {
    return this.handle(() => this.publicInterviewService.listQuestions(Number(sessionId), request.publicInterviewAccess));
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/answers")
  @HttpCode(201)
  saveAnswer(
    @Req() request: PublicInterviewRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: SaveInterviewAnswerDto,
  ) {
    return this.handle(() => this.publicInterviewService.saveAnswer(Number(sessionId), dto, request.publicInterviewAccess));
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/media")
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("file"))
  uploadMedia(
    @Req() request: PublicInterviewRequest,
    @Param("sessionId") sessionId: string,
    @UploadedFile() file?: UploadedInterviewMediaFile,
    @Body() dto: UploadInterviewMediaDto = {},
  ) {
    return this.handle(() =>
      this.publicInterviewService.uploadMedia(
        Number(sessionId),
        file
          ? {
              originalName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              buffer: file.buffer,
            }
          : undefined,
        request.publicInterviewAccess,
        dto.uploadRequestId,
      ),
    );
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/next-question")
  moveNextQuestion(@Req() request: PublicInterviewRequest, @Param("sessionId") sessionId: string) {
    return this.handle(() =>
      this.publicInterviewService.moveNextQuestion(Number(sessionId), request.publicInterviewAccess),
    );
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/stt")
  requestStt(
    @Req() request: PublicInterviewRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiInterviewRequestDto,
  ) {
    return this.handle(() => this.publicInterviewService.requestStt(Number(sessionId), dto, request.publicInterviewAccess));
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/follow-up-question")
  requestFollowUpQuestion(
    @Req() request: PublicInterviewRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiInterviewRequestDto,
  ) {
    return this.handle(() =>
      this.publicInterviewService.requestFollowUpQuestion(Number(sessionId), dto, request.publicInterviewAccess),
    );
  }

  @UseGuards(PublicInterviewAccessGuard)
  @Post("interviews/:sessionId/realtime-session")
  createRealtimeSession(
    @Req() request: PublicInterviewRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateRealtimeInterviewSessionDto,
  ) {
    return this.handle(() =>
      this.publicInterviewService.createRealtimeSession(Number(sessionId), dto, request.publicInterviewAccess),
    );
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

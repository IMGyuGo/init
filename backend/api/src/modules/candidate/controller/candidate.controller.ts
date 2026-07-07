import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { CurrentUser } from "@init/common";
import type { Response } from "express";
import { type RequestLike } from "../../../shared/response-envelope";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { resolveCurrentCandidate } from "./candidate.auth";
import { candidateApiRoutePrefix, candidateApiRoutes } from "../candidate.routes";
import { CandidateDomainError, createCandidateErrorResponse } from "../candidate.errors";
import { CandidateService, MAX_DOCUMENT_SIZE_BYTES } from "../service/candidate.service";
import { CandidateJobListQueryDto } from "../dto/candidate-job-list-query.dto";
import { CreatePortfolioLinkDto } from "../dto/create-portfolio-link.dto";
import { SaveInterviewConsentDto } from "../dto/save-interview-consent.dto";
import { SubmitApplicationDto } from "../dto/submit-application.dto";
import { UploadResumeDto } from "../dto/upload-resume.dto";

type CandidateRequest = RequestLike & { currentUser: CurrentUser };
type UploadedResumeFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Catch(PayloadTooLargeException)
class CandidateDocumentUploadExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = new CandidateDomainError("FILE_SIZE_EXCEEDED", "File size exceeds the allowed limit.", 400, [
      { field: "file", reason: `file must be ${MAX_DOCUMENT_SIZE_BYTES} bytes or smaller` },
    ]);

    response.status(error.statusCode).json(createCandidateErrorResponse(error));
  }
}

@UseGuards(JwtAuthGuard)
@Controller(candidateApiRoutePrefix)
export class CandidateController {
  constructor(@Inject(CandidateService) private readonly candidateService: CandidateService) {}

  @Get(candidateApiRoutes.jobs)
  listJobs(@Req() request: CandidateRequest, @Query() query: CandidateJobListQueryDto) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.listJobs(query, currentUser);
    });
  }

  @Get(candidateApiRoutes.jobDetail)
  getJobDetail(@Req() request: CandidateRequest, @Param("jobId") jobId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.getJobDetail(Number(jobId), currentUser);
    });
  }

  @Get(candidateApiRoutes.applyView)
  getApplyView(@Req() request: CandidateRequest, @Param("jobId") jobId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.getApplyView(Number(jobId), currentUser);
    });
  }

  @Post(candidateApiRoutes.submitApplication)
  @HttpCode(201)
  submitApplication(
    @Req() request: CandidateRequest,
    @Param("jobId") jobId: string,
    @Body() dto: SubmitApplicationDto,
  ) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.submitApplication(Number(jobId), dto, currentUser);
    });
  }

  @Post(candidateApiRoutes.resume)
  @HttpCode(201)
  @UseFilters(new CandidateDocumentUploadExceptionFilter())
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  uploadResume(
    @Req() request: CandidateRequest,
    @Body() dto: UploadResumeDto,
    @UploadedFile() file?: UploadedResumeFile,
  ) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return file
        ? this.candidateService.uploadResumeFile(
            {
              originalName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              buffer: file.buffer,
            },
            currentUser,
          )
        : this.candidateService.uploadResume(dto, currentUser);
    });
  }

  @Post(candidateApiRoutes.portfolioLinks)
  @HttpCode(201)
  createPortfolioLink(@Req() request: CandidateRequest, @Body() dto: CreatePortfolioLinkDto) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.createPortfolioLink(dto, currentUser);
    });
  }

  @Get(candidateApiRoutes.applications)
  listApplications(@Req() request: CandidateRequest) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.listApplications(currentUser);
    });
  }

  @Get(candidateApiRoutes.interviewGuide)
  getInterviewGuide(@Req() request: CandidateRequest, @Param("applicationId") applicationId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.getInterviewGuide(Number(applicationId), currentUser);
    });
  }

  @Post(candidateApiRoutes.interviewConsent)
  saveInterviewConsent(
    @Req() request: CandidateRequest,
    @Param("applicationId") applicationId: string,
    @Body() dto: SaveInterviewConsentDto,
  ) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.candidateService.saveInterviewConsent(Number(applicationId), dto, currentUser);
    });
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

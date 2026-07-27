import { Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiSecurity } from "@nestjs/swagger";
import type { CurrentUser } from "@init/common";
import { type RequestLike } from "../../../shared/response-envelope";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CandidateDomainError, resolveCurrentCandidate } from "../../candidate";
import { reportApiRoutePrefix, reportApiRoutes } from "../report.routes";
import { ReportService } from "../service/report.service";

type CandidateRequest = RequestLike & { currentUser: CurrentUser };

const candidateDevAuthSecurity = {
  "x-dev-user-id": [],
  "x-dev-user-type": [],
  "x-dev-candidate-id": [],
};

@UseGuards(JwtAuthGuard)
@Controller(reportApiRoutePrefix)
export class ReportController {
  constructor(@Inject(ReportService) private readonly reportService: ReportService) {}

  @Get(reportApiRoutes.mockReports)
  listMockReports(@Req() request: CandidateRequest) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return Promise.resolve(this.reportService.listMockReports(currentUser));
    });
  }

  @Get(reportApiRoutes.mockFeedback)
  getMockReportFeedback(@Req() request: CandidateRequest, @Param("reportId") reportId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return Promise.resolve(this.reportService.getMockReportFeedback(Number(reportId), currentUser));
    });
  }

  @Get(reportApiRoutes.mockMedia)
  getMockReportMedia(@Req() request: CandidateRequest, @Param("reportId") reportId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.reportService.getMockReportMedia(Number(reportId), currentUser);
    });
  }

  @Post(reportApiRoutes.mockGenerate)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSecurity(candidateDevAuthSecurity)
  requestMockReportGeneration(@Req() request: CandidateRequest, @Param("reportId") reportId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return Promise.resolve(this.reportService.requestMockReportGeneration(Number(reportId), currentUser));
    });
  }

  @Get(reportApiRoutes.applicationReport)
  getApplicationReport(@Req() request: CandidateRequest, @Param("applicationId") applicationId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.reportService.getApplicationReport(Number(applicationId), currentUser);
    });
  }

  @Post(reportApiRoutes.applicationReportGenerate)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSecurity(candidateDevAuthSecurity)
  requestApplicationReportGeneration(@Req() request: CandidateRequest, @Param("applicationId") applicationId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.reportService.requestApplicationReportGeneration(Number(applicationId), currentUser);
    });
  }

  @Get(reportApiRoutes.applicationStatus)
  getApplicationStatus(@Req() request: CandidateRequest, @Param("applicationId") applicationId: string) {
    return this.handle(() => {
      const currentUser = resolveCurrentCandidate(request.currentUser);
      return this.reportService.getApplicationStatus(Number(applicationId), currentUser);
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

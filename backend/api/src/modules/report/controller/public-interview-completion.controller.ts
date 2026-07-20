import { Controller, HttpException, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { CandidateDomainError } from "../../candidate";
import {
  PublicInterviewAccessGuard,
  type PublicInterviewRequest,
} from "../../interview/public/public-interview-access.guard";
import { PublicInterviewService } from "../../interview/public/public-interview.service";
import { ReportService } from "../service/report.service";

@Controller("public")
export class PublicInterviewCompletionController {
  constructor(
    private readonly publicInterviewService: PublicInterviewService,
    private readonly reportService: ReportService,
  ) {}

  @UseGuards(PublicInterviewAccessGuard)
  @Patch("interviews/:sessionId/complete")
  completeInterview(@Req() request: PublicInterviewRequest, @Param("sessionId") sessionId: string) {
    return this.handle(async () => {
      const result = await this.publicInterviewService.completeInterview(
        Number(sessionId),
        request.publicInterviewAccess,
      );
      await this.reportService.requestApplicationReportGeneration(
        request.publicInterviewAccess.applicationId,
        request.currentUser,
      );
      return result;
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

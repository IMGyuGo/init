import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CandidateModule } from "../candidate";
import { InterviewModule } from "../interview";
import { ReportModule } from "../report/report.module";
import { PrismaService } from "../../shared/prisma.service";
import { AiGuardrailsController } from "./controller/ai-guardrails.controller";
import { AiPerformanceController } from "./controller/ai-performance.controller";
import {
  AiJobsStatusController,
  CandidateAiJobsController,
  CompanyAiJobsController,
  CompanyRecruitmentAiJobsController,
} from "./controller/ai-jobs.controller";
import { AiPerformanceService } from "./service/ai-performance.service";
import { CompanyInterviewModule } from "../company-interview/company-interview.module";

@Module({
  imports: [ReportModule, AuthModule, CandidateModule, InterviewModule, CompanyInterviewModule],
  controllers: [
    AiGuardrailsController,
    CandidateAiJobsController,
    CompanyRecruitmentAiJobsController,
    CompanyAiJobsController,
    AiJobsStatusController,
    AiPerformanceController
  ],
  providers: [AiPerformanceService, PrismaService]
})
export class AiModule {}

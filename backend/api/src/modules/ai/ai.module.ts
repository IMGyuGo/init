import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReportModule } from "../report/report.module";
import { AiGuardrailsController } from "./controller/ai-guardrails.controller";
import {
  AiJobsStatusController,
  CandidateAiJobsController,
  CompanyAiJobsController,
  CompanyRecruitmentAiJobsController,
} from "./controller/ai-jobs.controller";

@Module({
  imports: [ReportModule, AuthModule],
  controllers: [
    AiGuardrailsController,
    CandidateAiJobsController,
    CompanyRecruitmentAiJobsController,
    CompanyAiJobsController,
    AiJobsStatusController
  ]
})
export class AiModule {}

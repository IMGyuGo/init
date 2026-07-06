import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReportModule } from "../report/report.module";
import { PrismaService } from "../../shared/prisma.service";
import { AiGuardrailsController } from "./controller/ai-guardrails.controller";
import { AiPerformanceController } from "./controller/ai-performance.controller";
import { AiJobsStatusController, CandidateAiJobsController, CompanyAiJobsController } from "./controller/ai-jobs.controller";
import { AiPerformanceService } from "./service/ai-performance.service";

@Module({
  imports: [ReportModule, AuthModule],
  controllers: [
    AiGuardrailsController,
    CandidateAiJobsController,
    CompanyAiJobsController,
    AiJobsStatusController,
    AiPerformanceController
  ],
  providers: [AiPerformanceService, PrismaService]
})
export class AiModule {}

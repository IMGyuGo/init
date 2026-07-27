import { Module } from "@nestjs/common";
import { DevAuthAdapter } from "../../common/dev-auth/dev-auth.adapter";
import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CandidateModule } from "../candidate";
import { InterviewModule } from "../interview";
import { CandidateReportMediaController } from "./controller/candidate-report-media.controller";
import { ReportController } from "./controller/report.controller";
import { ReportsController } from "./controller/reports.controller";
import { AdminScreeningRetryController } from "./controller/admin-screening-retry.controller";
import { PublicInterviewCompletionController } from "./controller/public-interview-completion.controller";
import { CANDIDATE_REPORT_REPOSITORY } from "./repository/candidate-report.repository";
import { InMemoryCandidateReportRepository } from "./repository/in-memory-candidate-report.repository";
import { PrismaCandidateReportRepository } from "./repository/prisma-candidate-report.repository";
import { AiReportPipelineService } from "./service/ai-report-pipeline.service";
import { GuardrailService } from "./service/guardrail.service";
import { MockAiReportProvider } from "./service/mock-ai-report.provider";
import { ReportService } from "./service/report.service";
import { AiJobDispatchModule } from "./ai-job-dispatch.module";
import { SCREENING_RETRY_REPOSITORY } from "./repository/screening-retry.repository";
import { PrismaScreeningRetryRepository } from "./repository/prisma-screening-retry.repository";
import { ScreeningRetryService } from "./service/screening-retry.service";

const usePrismaRepository = process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);

const candidateReportRepositoryProvider = usePrismaRepository
  ? {
      provide: CANDIDATE_REPORT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaCandidateReportRepository(prisma),
    }
  : {
      provide: CANDIDATE_REPORT_REPOSITORY,
      useClass: InMemoryCandidateReportRepository,
    };

@Module({
  imports: [AuthModule, CandidateModule, InterviewModule, AiJobDispatchModule],
  controllers: [
    ReportsController,
    ReportController,
    CandidateReportMediaController,
    AdminScreeningRetryController,
    PublicInterviewCompletionController,
  ],
  providers: [
    DevAuthAdapter,
    PrismaService,
    AiReportPipelineService,
    GuardrailService,
    candidateReportRepositoryProvider,
    MockAiReportProvider,
    ReportService,
    ScreeningRetryService,
    {
      provide: SCREENING_RETRY_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaScreeningRetryRepository(prisma),
    },
  ],
  exports: [
    DevAuthAdapter,
    GuardrailService,
    CANDIDATE_REPORT_REPOSITORY,
    ReportService,
    AiJobDispatchModule,
  ],
})
export class ReportModule {}

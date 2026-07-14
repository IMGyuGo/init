import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CandidateModule } from "../candidate";
import { PaymentModule } from "../payment/payment.module";
import { InMemoryReportRepository } from "../report/repository/in-memory-report.repository";
import { PrismaReportRepository } from "../report/repository/prisma-report.repository";
import { REPORT_REPOSITORY } from "../report/repository/report.repository";
import { AiJobDispatcherService } from "../report/service/ai-job-dispatcher.service";
import { AI_JOB_QUEUE_PUBLISHER, createAiJobQueuePublisher } from "../report/service/ai-job-queue.publisher";
import { InterviewController } from "./controller/interview.controller";
import { DefaultPublicApplicationAccessVerifier, PUBLIC_APPLICATION_ACCESS_VERIFIER } from "./public/public-application-access.verifier";
import { PublicInterviewAccessGuard } from "./public/public-interview-access.guard";
import { PublicInterviewAccessTokenService } from "./public/public-interview-access-token.service";
import { PublicInterviewController } from "./public/public-interview.controller";
import { PublicInterviewService } from "./public/public-interview.service";
import { InMemoryInterviewRepository } from "./repository/in-memory-interview.repository";
import { INTERVIEW_REPOSITORY } from "./repository/interview.repository";
import { PrismaInterviewRepository } from "./repository/prisma-interview.repository";
import { INTERVIEW_MEDIA_STORAGE, S3InterviewMediaStorageAdapter } from "./service/interview-media-storage.adapter";
import { InterviewService } from "./service/interview.service";

const usePrismaReportRepository = process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);

const reportRepositoryProviders = usePrismaReportRepository
  ? [
      {
        provide: REPORT_REPOSITORY,
        inject: [PrismaService],
        useFactory: (prisma: PrismaService) => new PrismaReportRepository(prisma),
      },
    ]
  : [
      InMemoryReportRepository,
      {
        provide: REPORT_REPOSITORY,
        useExisting: InMemoryReportRepository,
      },
    ];

@Module({
  imports: [AuthModule, CandidateModule, PaymentModule],
  controllers: [InterviewController, PublicInterviewController],
  providers: [
    PrismaService,
    {
      provide: INTERVIEW_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => {
        if (process.env.INTERVIEW_REPOSITORY_MODE === "memory" || process.env.DISABLE_PRISMA_CONNECT === "true") {
          return new InMemoryInterviewRepository();
        }
        return new PrismaInterviewRepository(prisma);
      },
    },
    AiJobDispatcherService,
    {
      provide: AI_JOB_QUEUE_PUBLISHER,
      useFactory: () => createAiJobQueuePublisher(),
    },
    ...reportRepositoryProviders,
    InterviewService,
    {
      provide: INTERVIEW_MEDIA_STORAGE,
      useClass: S3InterviewMediaStorageAdapter,
    },
    PublicInterviewAccessTokenService,
    PublicInterviewAccessGuard,
    PublicInterviewService,
    {
      provide: PUBLIC_APPLICATION_ACCESS_VERIFIER,
      useClass: DefaultPublicApplicationAccessVerifier,
    },
  ],
  exports: [
    INTERVIEW_REPOSITORY,
    REPORT_REPOSITORY,
    AiJobDispatcherService,
    InterviewService,
    PublicInterviewService,
  ],
})
export class InterviewModule {}

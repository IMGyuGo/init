import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma.service";
import { InMemoryReportRepository } from "./repository/in-memory-report.repository";
import { PrismaReportRepository } from "./repository/prisma-report.repository";
import { REPORT_REPOSITORY } from "./repository/report.repository";
import { AiJobDispatcherService } from "./service/ai-job-dispatcher.service";
import { AI_JOB_QUEUE_PUBLISHER, createAiJobQueuePublisher } from "./service/ai-job-queue.publisher";

const usePrismaRepository = process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);

const repositoryProviders = usePrismaRepository
  ? [
      PrismaService,
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
  providers: [
    AiJobDispatcherService,
    {
      provide: AI_JOB_QUEUE_PUBLISHER,
      useFactory: () => createAiJobQueuePublisher(),
    },
    ...repositoryProviders,
  ],
  exports: [AiJobDispatcherService, AI_JOB_QUEUE_PUBLISHER, REPORT_REPOSITORY],
})
export class AiJobDispatchModule {}

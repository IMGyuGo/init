import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CandidateModule } from "../candidate";
import { PaymentModule } from "../payment/payment.module";
import { AiJobDispatchModule } from "../report/ai-job-dispatch.module";
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

@Module({
  imports: [AuthModule, CandidateModule, PaymentModule, AiJobDispatchModule],
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
  exports: [INTERVIEW_REPOSITORY, InterviewService, PublicInterviewService],
})
export class InterviewModule {}

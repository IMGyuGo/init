import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CandidateController } from "./controller/candidate.controller";
import { PublicCandidateController } from "./controller/public-candidate.controller";
import { InMemoryCandidateRepository } from "./repository/in-memory-candidate.repository";
import { PrismaCandidateRepository } from "./repository/prisma-candidate.repository";
import { CANDIDATE_DOCUMENT_STORAGE, S3CandidateDocumentStorageAdapter } from "./service/candidate-document-storage.adapter";
import { CANDIDATE_REPOSITORY, CandidateService } from "./service/candidate.service";

@Module({
  imports: [AuthModule],
  controllers: [CandidateController, PublicCandidateController],
  providers: [
    PrismaService,
    {
      provide: CANDIDATE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => {
        if (process.env.CANDIDATE_REPOSITORY_MODE === "memory" || process.env.DISABLE_PRISMA_CONNECT === "true") {
          return new InMemoryCandidateRepository({
            seedDemoApplication: process.env.CANDIDATE_DEMO_NO_AUTH === "true",
          });
        }
        return new PrismaCandidateRepository(prisma);
      },
    },
    {
      provide: CANDIDATE_DOCUMENT_STORAGE,
      useClass: S3CandidateDocumentStorageAdapter,
    },
    CandidateService,
  ],
  exports: [CANDIDATE_REPOSITORY, CandidateService],
})
export class CandidateModule {}

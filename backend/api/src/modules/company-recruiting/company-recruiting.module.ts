import { Module } from "@nestjs/common";

import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { MailService } from "../auth/service/mail.service";
import { CompanyRecruitingController } from "./controller/company-recruiting.controller";
import { CompanyRecruitingMediaController } from "./controller/company-recruiting-media.controller";
import { PublicApplicationController } from "./controller/public-application.controller";
import { PublicRecruitmentController } from "./controller/public-recruitment.controller";
import { S3CompanyRecruitingStorageAdapter } from "./service/company-recruiting-storage.adapter";
import {
  PublicApplicationAuthAdapter,
  PublicApplicationMagicLinkStore,
  type PublicApplicationAuthAdapterPort,
} from "./service/public-application-auth.adapter";
import {
  DeferredPublicInterviewEntryAdapter,
  type PublicInterviewEntryAdapterPort,
} from "./service/public-interview-entry.adapter";
import {
  PrismaCompanyRecruitingRepository,
  type CompanyRecruitingRepositoryPort,
} from "./repository/company-recruiting.repository";
import {
  CompanyRecruitingService,
  type CompanyRecruitingStorageAdapterPort,
} from "./service/company-recruiting.service";

@Module({
  imports: [AuthModule],
  controllers: [CompanyRecruitingController, CompanyRecruitingMediaController, PublicRecruitmentController, PublicApplicationController],
  providers: [
    PrismaService,
    MailService,
    PrismaCompanyRecruitingRepository,
    PublicApplicationMagicLinkStore,
    {
      provide: PublicApplicationAuthAdapter,
      useFactory: (magicLinkStore: PublicApplicationMagicLinkStore, mailService: MailService) =>
        new PublicApplicationAuthAdapter(magicLinkStore, mailService),
      inject: [PublicApplicationMagicLinkStore, MailService],
    },
    DeferredPublicInterviewEntryAdapter,
    S3CompanyRecruitingStorageAdapter,
    {
      provide: CompanyRecruitingService,
      useFactory: (
        repository: CompanyRecruitingRepositoryPort,
        storageAdapter: CompanyRecruitingStorageAdapterPort,
        publicApplicationAuthAdapter: PublicApplicationAuthAdapterPort,
        publicInterviewEntryAdapter: PublicInterviewEntryAdapterPort,
      ) => new CompanyRecruitingService(repository, storageAdapter, {}, publicApplicationAuthAdapter, publicInterviewEntryAdapter),
      inject: [
        PrismaCompanyRecruitingRepository,
        S3CompanyRecruitingStorageAdapter,
        PublicApplicationAuthAdapter,
        DeferredPublicInterviewEntryAdapter,
      ],
    },
  ],
})
export class CompanyRecruitingModule {}

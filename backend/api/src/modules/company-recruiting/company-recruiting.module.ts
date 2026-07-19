import { Module } from "@nestjs/common";

import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CompanyInterviewModule } from "../company-interview/company-interview.module";
import { CompanyInterviewService } from "../company-interview/company-interview.service";
import { MailModule } from "../mail/mail.module";
import { MailService } from "../mail/mail.service";
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
  imports: [AuthModule, MailModule, CompanyInterviewModule],
  controllers: [CompanyRecruitingController, CompanyRecruitingMediaController, PublicRecruitmentController, PublicApplicationController],
  providers: [
    PrismaService,
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
        interviewPublicationReadiness: CompanyInterviewService,
      ) => new CompanyRecruitingService(
        repository,
        storageAdapter,
        {},
        publicApplicationAuthAdapter,
        publicInterviewEntryAdapter,
        interviewPublicationReadiness,
      ),
      inject: [
        PrismaCompanyRecruitingRepository,
        S3CompanyRecruitingStorageAdapter,
        PublicApplicationAuthAdapter,
        DeferredPublicInterviewEntryAdapter,
        CompanyInterviewService,
      ],
    },
  ],
})
export class CompanyRecruitingModule {}

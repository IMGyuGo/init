import { Module } from "@nestjs/common";

import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CompanyProfileController } from "./controller/company-profile.controller";
import { PrismaCompanyProfileRepository } from "./repository/company-profile.repository";
import { S3CompanyProfileStorageAdapter } from "./service/company-profile-storage.adapter";
import {
  CompanyProfileService,
  type CompanyProfileRepositoryPort,
  type CompanyProfileStorageAdapterPort,
} from "./service/company-profile.service";

@Module({
  imports: [AuthModule],
  controllers: [CompanyProfileController],
  providers: [
    PrismaService,
    PrismaCompanyProfileRepository,
    S3CompanyProfileStorageAdapter,
    {
      provide: CompanyProfileService,
      useFactory: (repository: CompanyProfileRepositoryPort, storageAdapter: CompanyProfileStorageAdapterPort) =>
        new CompanyProfileService(repository, storageAdapter),
      inject: [PrismaCompanyProfileRepository, S3CompanyProfileStorageAdapter],
    },
  ],
})
export class CompanyProfileModule {}

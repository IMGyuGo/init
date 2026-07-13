import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { CompanyInterviewController } from './company-interview.controller';
import { CompanyInterviewService } from './company-interview.service';
import { NcsEvaluationProfileController } from './ncs-evaluation-profile.controller';
import { COMPANY_INTERVIEW_REPOSITORY } from './repositories/company-interview.repository';
import { NCS_EVALUATION_PROFILE_REPOSITORY } from './repositories/ncs-evaluation-profile.repository';
import { PrismaCompanyInterviewRepository } from './repositories/prisma-company-interview.repository';
import { PrismaNcsEvaluationProfileRepository } from './repositories/prisma-ncs-evaluation-profile.repository';
import { NcsEvaluationProfileService } from './service/ncs-evaluation-profile.service';
import { NcsOfficialApiClient } from './service/ncs-official-api.client';

@Module({
  imports: [AuthModule],
  controllers: [CompanyInterviewController, NcsEvaluationProfileController],
  providers: [
    CompanyInterviewService,
    NcsEvaluationProfileService,
    NcsOfficialApiClient,
    PrismaService,
    {
      provide: COMPANY_INTERVIEW_REPOSITORY,
      useClass: PrismaCompanyInterviewRepository,
    },
    {
      provide: NCS_EVALUATION_PROFILE_REPOSITORY,
      useClass: PrismaNcsEvaluationProfileRepository,
    },
  ],
})
export class CompanyInterviewModule {}

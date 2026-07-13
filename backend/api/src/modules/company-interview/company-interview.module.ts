import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { CompanyInterviewController } from './company-interview.controller';
import { CompanyInterviewService } from './company-interview.service';
import { COMPANY_INTERVIEW_REPOSITORY } from './repositories/company-interview.repository';
import { PrismaCompanyInterviewRepository } from './repositories/prisma-company-interview.repository';

@Module({
  imports: [AuthModule],
  controllers: [CompanyInterviewController],
  providers: [
    CompanyInterviewService,
    PrismaService,
    {
      provide: COMPANY_INTERVIEW_REPOSITORY,
      useClass: PrismaCompanyInterviewRepository,
    },
  ],
})
export class CompanyInterviewModule {}

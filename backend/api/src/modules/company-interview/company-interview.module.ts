import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { CompanyInterviewController } from './company-interview.controller';
import { CompanyInterviewService } from './company-interview.service';
import { COMPANY_INTERVIEW_REPOSITORY } from './repositories/company-interview.repository';
import { PrismaCompanyInterviewRepository } from './repositories/prisma-company-interview.repository';
import { InMemoryCompanyInterviewRepository } from './repositories/in-memory-company-interview.repository';
import { AiJobDispatchModule } from '../report/ai-job-dispatch.module';

const usePrismaRepository = process.env.NODE_ENV !== 'test';

@Module({
  imports: [AuthModule, AiJobDispatchModule],
  controllers: [CompanyInterviewController],
  providers: [
    CompanyInterviewService,
    PrismaService,
    InMemoryCompanyInterviewRepository,
    {
      provide: COMPANY_INTERVIEW_REPOSITORY,
      useClass: usePrismaRepository
        ? PrismaCompanyInterviewRepository
        : InMemoryCompanyInterviewRepository,
    },
  ],
  exports: [CompanyInterviewService, COMPANY_INTERVIEW_REPOSITORY],
})
export class CompanyInterviewModule {}

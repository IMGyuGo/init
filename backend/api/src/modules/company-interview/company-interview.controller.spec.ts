import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyInterviewController } from './company-interview.controller';
import { CompanyInterviewService } from './company-interview.service';
import { COMPANY_INTERVIEW_REPOSITORY } from './repositories/company-interview.repository';
import { InMemoryCompanyInterviewRepository } from './repositories/in-memory-company-interview.repository';

describe('CompanyInterviewController integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CompanyInterviewController],
      providers: [
        CompanyInterviewService,
        JwtAuthGuard,
        {
          provide: COMPANY_INTERVIEW_REPOSITORY,
          useClass: InMemoryCompanyInterviewRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the module with DI and returns settings through the protected route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/company/interviews/settings')
      .query({ postingId: 2 })
      .set('x-dev-user-id', '1')
      .set('x-dev-user-type', 'COMPANY')
      .set('x-dev-company-id', '1')
      .expect(200);

    expect(response.body.data.posting).toEqual(
      expect.objectContaining({
        postingId: 2,
        title: '2026 신입 프론트엔드 채용',
      }),
    );
    expect(response.body.data.questionGenerationPolicy).toEqual(
      expect.objectContaining({
        postingId: 2,
        policyVersion: 0,
      }),
    );
  });
});

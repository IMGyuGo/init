import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { CurrentUser } from '@init/common';
import { ApiOperation } from '@nestjs/swagger';
import { ok, type RequestLike } from '../../shared/response-envelope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyInterviewService } from './company-interview.service';
import { CreateCompanyInterviewSessionDto } from './dto/company-interview-session.dto';

type CompanyRequest = RequestLike & { currentUser: CurrentUser };

@Controller('company/interview-sessions')
@UseGuards(JwtAuthGuard)
export class CompanyInterviewSessionController {
  constructor(private readonly service: CompanyInterviewService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create company interview session',
    description: 'Creates the company-side interview session after validating the configured NCS question policy.',
  })
  async createInterviewSession(
    @Req() request: CompanyRequest,
    @Body() body: CreateCompanyInterviewSessionDto,
  ) {
    const data = await this.service.createInterviewSession(request.currentUser, body);
    return ok(request, data);
  }
}

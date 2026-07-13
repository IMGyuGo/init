import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { CurrentUser } from '@init/common';
import { ok, type RequestLike } from '../../shared/response-envelope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ActivateEvaluationProfileDto,
  EvaluationProfileQueryDto,
  NcsRecommendationDto,
  NcsUnitSearchQueryDto,
  UpsertEvaluationProfileDto,
} from './dto/ncs-evaluation-profile.dto';
import { NcsEvaluationProfileService } from './service/ncs-evaluation-profile.service';

type CompanyRequest = RequestLike & { currentUser: CurrentUser };

@Controller('company/interviews/ncs')
@UseGuards(JwtAuthGuard)
export class NcsEvaluationProfileController {
  constructor(private readonly service: NcsEvaluationProfileService) {}

  @Get('units')
  async searchUnits(
    @Req() request: CompanyRequest,
    @Query() query: NcsUnitSearchQueryDto,
  ) {
    return ok(request, await this.service.searchUnits(request.currentUser, query));
  }

  @Post('recommend')
  async recommendUnits(
    @Req() request: CompanyRequest,
    @Body() body: NcsRecommendationDto,
  ) {
    return ok(request, await this.service.recommendUnits(request.currentUser, body));
  }

  @Get('profile')
  async getProfile(
    @Req() request: CompanyRequest,
    @Query() query: EvaluationProfileQueryDto,
  ) {
    return ok(request, await this.service.getProfile(request.currentUser, query.postingId));
  }

  @Put('profile')
  async saveProfile(
    @Req() request: CompanyRequest,
    @Body() body: UpsertEvaluationProfileDto,
  ) {
    return ok(request, await this.service.saveProfile(request.currentUser, body));
  }

  @Post('profile/activate')
  async activateProfile(
    @Req() request: CompanyRequest,
    @Body() body: ActivateEvaluationProfileDto,
  ) {
    return ok(request, await this.service.activateProfile(request.currentUser, body.postingId));
  }
}

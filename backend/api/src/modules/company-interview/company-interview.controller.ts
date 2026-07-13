import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CurrentUser } from '@init/common';
import { ok, type RequestLike } from '../../shared/response-envelope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyInterviewService } from './company-interview.service';
import { CreateCriterionTagDto } from './dto/criterion-tag.dto';
import { InterviewSettingsQueryDto } from './dto/interview-settings.dto';
import { UpdateEvaluationCriterionDto } from './dto/evaluation-criterion.dto';
import {
  CreateInterviewQuestionDto,
  UpdateInterviewQuestionDto,
} from './dto/question-management.dto';
import { ConfirmQuestionSetDto } from './dto/question-set.dto';
import { UpdateQuestionGenerationPolicyDto } from './dto/question-generation-policy.dto';
import { UpdateInterviewTimePolicyDto } from './dto/time-policy.dto';

type CompanyRequest = RequestLike & { currentUser: CurrentUser };

@Controller('company/interviews')
@UseGuards(JwtAuthGuard)
export class CompanyInterviewController {
  constructor(private readonly service: CompanyInterviewService) {}

  @Get('settings')
  async getSettings(
    @Req() request: CompanyRequest,
    @Query() query: InterviewSettingsQueryDto,
  ) {
    const data = await this.service.getSettings(request.currentUser, query);
    return ok(request, data);
  }

  @Post('criterion-tags')
  async createCriterionTag(
    @Req() request: CompanyRequest,
    @Body() body: CreateCriterionTagDto,
  ) {
    const data = await this.service.createCriterionTag(request.currentUser, body);
    return ok(request, data);
  }

  @Patch('evaluation-criteria')
  async updateEvaluationCriteria(
    @Req() request: CompanyRequest,
    @Body() body: UpdateEvaluationCriterionDto,
  ) {
    const data = await this.service.updateEvaluationCriteria(
      request.currentUser,
      body,
    );
    return ok(request, data);
  }

  @Post('questions')
  async createQuestion(
    @Req() request: CompanyRequest,
    @Body() body: CreateInterviewQuestionDto,
  ) {
    const data = await this.service.createQuestion(request.currentUser, body);
    return ok(request, data);
  }

  @Patch('questions/:questionId')
  async updateQuestion(
    @Req() request: CompanyRequest,
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() body: UpdateInterviewQuestionDto,
  ) {
    const data = await this.service.updateQuestion(
      request.currentUser,
      questionId,
      body,
    );
    return ok(request, data);
  }

  @Delete('questions/:questionId')
  async deleteQuestion(
    @Req() request: CompanyRequest,
    @Param('questionId', ParseIntPipe) questionId: number,
  ) {
    const data = await this.service.deleteQuestion(request.currentUser, questionId);
    return ok(request, data);
  }

  @Patch('time-policy')
  async updateTimePolicy(
    @Req() request: CompanyRequest,
    @Body() body: UpdateInterviewTimePolicyDto,
  ) {
    const data = await this.service.updateTimePolicy(request.currentUser, body);
    return ok(request, data);
  }

  @Patch('question-generation-policy')
  async updateQuestionGenerationPolicy(
    @Req() request: CompanyRequest,
    @Body() body: UpdateQuestionGenerationPolicyDto,
  ) {
    const data = await this.service.updateQuestionGenerationPolicy(
      request.currentUser,
      body,
    );
    return ok(request, data);
  }

  @Get('question-sets/active')
  async getActiveQuestionSet(
    @Req() request: CompanyRequest,
    @Query() query: InterviewSettingsQueryDto,
  ) {
    const data = await this.service.getActiveQuestionSet(
      request.currentUser,
      query.postingId,
    );
    return ok(request, data);
  }

  @Post('question-sets/confirm')
  async confirmQuestionSet(
    @Req() request: CompanyRequest,
    @Body() body: ConfirmQuestionSetDto,
  ) {
    const data = await this.service.confirmQuestionSet(request.currentUser, body);
    return ok(request, data);
  }
}

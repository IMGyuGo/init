import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { QUESTION_USAGE_SCOPES, type QuestionUsageScope } from '@init/common';

export class ResumeQuestionsQueryDto {
  @IsOptional()
  @IsIn(QUESTION_USAGE_SCOPES)
  usageScope?: QuestionUsageScope;
}

export class RetryResumeQuestionsDto {
  @IsOptional()
  @IsIn(QUESTION_USAGE_SCOPES)
  usageScope?: QuestionUsageScope;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPolicyVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

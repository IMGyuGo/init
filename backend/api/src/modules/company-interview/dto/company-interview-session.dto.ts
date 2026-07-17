import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class CreateCompanyInterviewSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicationId!: number;

  @IsOptional()
  @IsIn(['STANDARD', 'DEMO_PRESET'])
  mode?: 'STANDARD' | 'DEMO_PRESET';
}

export class CompanyInterviewSessionResponseDto {
  applicationId!: number;
  sessionId!: number;
  snapshotCreated!: boolean;
  commonQuestionCount!: number;
  personalizedQuestionCount!: number;
  totalQuestionCount!: number;
  policyVersion!: number;
  criteriaVersion!: number;
  sessionMode!: 'STANDARD' | 'DEMO_PRESET';
  questions!: Array<{
    sessionQuestionId: number;
    usageScope: 'STANDARD' | 'DEMO_PRESET';
    ncsProfileIds: string[];
    sortOrder: number;
  }>;
}

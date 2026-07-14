import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateCompanyInterviewSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicationId!: number;
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
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RetryResumeQuestionsDto {
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

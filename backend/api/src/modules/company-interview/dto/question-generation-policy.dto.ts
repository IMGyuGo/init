import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  EvaluationFramework,
  NcsProfileId,
  NcsQuestionMode,
  QuestionGenerationSource,
} from '../company-interview.types';

export class UpdateQuestionGenerationPolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  jdCriteriaQuestionCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  resumeQuestionCount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedPolicyVersion?: number;
}

export class QuestionGenerationAllocationDto {
  source!: QuestionGenerationSource;
  ncsProfileId!: NcsProfileId;
  ncsQuestionMode!: NcsQuestionMode;
  count!: number;
  usageScope!: 'STANDARD';
}

export class ActiveProfileCoverageDto {
  ncsProfileId!: NcsProfileId;
  requiredBaseQuestionCount!: number;
  actualBaseQuestionCount!: number;
  covered!: boolean;
}

export class QuestionGenerationPolicyResponseDto {
  postingId!: number;
  evaluationFramework!: EvaluationFramework;
  jdCriteriaQuestionCount!: number;
  resumeQuestionCount!: number;
  policyVersion!: number;
  criteriaVersion!: number;
  allocations!: QuestionGenerationAllocationDto[];
  activeProfileCoverage!: ActiveProfileCoverageDto[];
  questionSetRequiresReconfirmation!: boolean;
  warnings!: string[];
}

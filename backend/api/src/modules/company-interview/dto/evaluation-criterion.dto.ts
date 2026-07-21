import { Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EVALUATION_FRAMEWORKS,
  EvaluationFramework,
  NcsProfileId,
  NcsQuestionMode,
} from '../company-interview.types';
export class EvaluationCriterionItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  criterionId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  tagId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  weight!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  passScore?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class AutoScreeningPolicyInputDto {
  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  passMinTotalScore!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  holdMinTotalScore!: number;

  @Equals(true)
  requireAllCriteriaPass!: true;
}

export class AutoScreeningPolicyResponseDto extends AutoScreeningPolicyInputDto {
  policyVersion!: number;
  decisionPolicyVersion!: 'AUTO_SCREENING_DECISION_V1';
}

export class UpdateEvaluationCriterionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @IsOptional()
  @IsIn(EVALUATION_FRAMEWORKS)
  evaluationFramework?: EvaluationFramework;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionItemDto)
  criteria!: EvaluationCriterionItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AutoScreeningPolicyInputDto)
  screeningPolicy?: AutoScreeningPolicyInputDto;

  @IsOptional()
  @IsBoolean()
  confirmQuestionImpact?: boolean;
}

export class EvaluationCriterionResponseItemDto {
  criterionId!: number;
  tagId!: number;
  tagName!: string;
  category!: string;
  description!: string | null;
  weight!: number;
  passScore!: number | null;
  sortOrder!: number;
  ncsProfileId!: NcsProfileId | null;
  ncsQuestionMode!: NcsQuestionMode | null;
  ncsProfileVersion!: string | null;
  isActive!: boolean;
}

export class EvaluationCriterionResponseDto {
  postingId!: number;
  criteria!: EvaluationCriterionResponseItemDto[];
  totalWeight!: number;
  evaluationFramework!: EvaluationFramework;
  criteriaVersion!: number;
  configurationLocked!: boolean;
  configurationLockedReason!: 'SUBMITTED_APPLICATION_EXISTS' | null;
  questionImpactByProfile!: Array<{
    ncsProfileId: NcsProfileId;
    exclusivelyBoundActiveQuestionCount: number;
    multiBoundActiveQuestionCount: number;
  }>;
  questionSetRequiresReconfirmation!: boolean;
  screeningPolicy!: AutoScreeningPolicyResponseDto | null;
}

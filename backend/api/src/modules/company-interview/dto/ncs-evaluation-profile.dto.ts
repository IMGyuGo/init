import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class NcsUnitSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

export class NcsRecommendationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(5)
  count?: number;
}

export class EvaluationProfileQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;
}

export class EvaluationProfileSelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ncsUnitId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weight!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  relevanceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rationale?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class UpsertEvaluationProfileDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(80)
  ncsWeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(80)
  companyWeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(80)
  serviceWeight!: number;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EvaluationProfileSelectionDto)
  selections!: EvaluationProfileSelectionDto[];
}

export class ActivateEvaluationProfileDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;
}

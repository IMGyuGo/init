import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
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

export class UpdateEvaluationCriterionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionItemDto)
  criteria!: EvaluationCriterionItemDto[];
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
}

export class EvaluationCriterionResponseDto {
  postingId!: number;
  criteria!: EvaluationCriterionResponseItemDto[];
  totalWeight!: number;
}

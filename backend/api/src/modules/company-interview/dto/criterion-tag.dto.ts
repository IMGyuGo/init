import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCriterionTagDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  tagName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class CriterionTagResponseItemDto {
  tagId!: number;
  jobRole!: string;
  tagName!: string;
  category!: string;
  description!: string | null;
  sortOrder!: number;
}

export class CreateCriterionTagResponseDto {
  postingId!: number;
  tag!: CriterionTagResponseItemDto;
}

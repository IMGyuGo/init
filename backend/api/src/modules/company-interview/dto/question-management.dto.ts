import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  QUESTION_ORIGINS,
  QUESTION_TYPES,
  QuestionOrigin,
  NcsProfileId,
  NcsQuestionMode,
  QuestionGenerationSource,
  QuestionType,
} from '../company-interview.types';

export class CreateInterviewQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  criterionId!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  criterionIds?: number[];

  @IsIn(QUESTION_TYPES)
  questionType!: QuestionType;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  content!: string;

  @IsOptional()
  @IsIn(QUESTION_ORIGINS)
  origin?: QuestionOrigin;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceProcessLogId?: number;
}

export class UpdateInterviewQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  criterionId!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  criterionIds?: number[];

  @IsIn(QUESTION_TYPES)
  questionType!: QuestionType;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  content!: string;
}

export class InterviewQuestionResponseItemDto {
  questionId!: number;
  postingId!: number | null;
  criterionId!: number | null;
  questionType!: QuestionType;
  content!: string;
  origin!: QuestionOrigin;
  isAiEdited!: boolean;
  isActive!: boolean;
  generationSource!: QuestionGenerationSource | null;
  ncsProfileId!: NcsProfileId | null;
  ncsQuestionMode!: NcsQuestionMode | null;
  ncsProfileVersion!: string | null;
  alignmentStatus!: string | null;
  alignmentScore!: number | null;
  alignmentReason!: string | null;
  evaluatorVersion!: string | null;
  sourceProcessLogId!: number | null;
  ncsBindings!: Array<{
    criterionId: number;
    ncsProfileId: NcsProfileId;
    ncsProfileVersion: string;
    alignmentStatus: string;
    alignmentScore: number | null;
    alignmentReason: string | null;
    evaluatorVersion: string | null;
    bindingOrder: number;
  }>;
}

export class CreateInterviewQuestionResponseDto {
  postingId!: number;
  question!: InterviewQuestionResponseItemDto;
}

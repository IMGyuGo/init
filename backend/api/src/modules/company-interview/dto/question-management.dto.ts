import { Type } from 'class-transformer';
import {
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
}

export class CreateInterviewQuestionResponseDto {
  postingId!: number;
  question!: InterviewQuestionResponseItemDto;
}

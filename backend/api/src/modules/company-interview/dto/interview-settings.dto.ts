import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import {
  PostingStatus,
  QuestionOrigin,
  QuestionType,
} from '../company-interview.types';

export class InterviewSettingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId?: number;
}

export class InterviewSettingsPostingDto {
  postingId!: number;
  title!: string;
  status!: PostingStatus;
}

export class InterviewSettingsCriterionDto {
  criterionId!: number;
  tagId!: number;
  tagName!: string;
  category!: string;
  description!: string | null;
  weight!: number;
  passScore!: number | null;
  sortOrder!: number;
}

export class InterviewSettingsAvailableTagDto {
  tagId!: number;
  jobRole!: string;
  tagName!: string;
  category!: string;
  description!: string | null;
  sortOrder!: number;
}

export class InterviewSettingsQuestionDto {
  questionId!: number;
  criterionId!: number | null;
  questionType!: QuestionType;
  content!: string;
  origin!: QuestionOrigin;
  isAiEdited!: boolean;
  isActive!: boolean;
}

export class InterviewTimePolicyDto {
  preparationTimeSec!: number;
  answerTimeSec!: number;
  retryAllowed!: boolean;
}

export class InterviewSettingsResponseDto {
  posting!: InterviewSettingsPostingDto;
  availableTags!: InterviewSettingsAvailableTagDto[];
  criteria!: InterviewSettingsCriterionDto[];
  questions!: InterviewSettingsQuestionDto[];
  timePolicy!: InterviewTimePolicyDto;
}

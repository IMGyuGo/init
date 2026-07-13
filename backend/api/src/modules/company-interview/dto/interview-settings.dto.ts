import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import {
  PostingStatus,
  QuestionOrigin,
  QuestionType,
  EvaluationFramework,
  NcsProfileId,
  NcsQuestionMode,
  QuestionGenerationSource,
  ResumeQuestionGenerationStatus,
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
  ncsProfileId!: NcsProfileId | null;
  ncsQuestionMode!: NcsQuestionMode | null;
  ncsProfileVersion!: string | null;
}

export class InterviewSettingsAvailableTagDto {
  tagId!: number;
  jobRole!: string;
  tagName!: string;
  category!: string;
  description!: string | null;
  sortOrder!: number;
  ncsProfileId!: NcsProfileId | null;
  defaultNcsQuestionMode!: NcsQuestionMode | null;
  ncsProfileVersion!: string | null;
}

export class InterviewSettingsQuestionDto {
  questionId!: number;
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
}

export class InterviewTimePolicyDto {
  preparationTimeSec!: number;
  answerTimeSec!: number;
  retryAllowed!: boolean;
}

export class InterviewQuestionGenerationAllocationDto {
  source!: QuestionGenerationSource;
  ncsProfileId!: NcsProfileId;
  ncsQuestionMode!: NcsQuestionMode;
  count!: number;
}

export class InterviewQuestionGenerationPolicyDto {
  postingId!: number;
  jdCriteriaQuestionCount!: number;
  resumeQuestionCount!: number;
  policyVersion!: number;
  criteriaVersion!: number;
  allocations!: InterviewQuestionGenerationAllocationDto[];
  resumeQuestionStatus!: ResumeQuestionGenerationStatus;
}

export class InterviewSettingsResponseDto {
  posting!: InterviewSettingsPostingDto;
  availableTags!: InterviewSettingsAvailableTagDto[];
  criteria!: InterviewSettingsCriterionDto[];
  questions!: InterviewSettingsQuestionDto[];
  timePolicy!: InterviewTimePolicyDto;
  evaluationFramework!: EvaluationFramework;
  questionGenerationPolicy!: InterviewQuestionGenerationPolicyDto;
}

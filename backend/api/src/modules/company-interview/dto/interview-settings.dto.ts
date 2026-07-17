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
  isActive!: boolean;
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
  usageScope!: 'STANDARD' | 'DEMO_PRESET';
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
  usageScope!: 'STANDARD';
}

export class InterviewQuestionGenerationPolicyDto {
  postingId!: number;
  jdCriteriaQuestionCount!: number;
  resumeQuestionCount!: number;
  policyVersion!: number;
  criteriaVersion!: number;
  allocations!: InterviewQuestionGenerationAllocationDto[];
  resumeQuestionStatus!: ResumeQuestionGenerationStatus;
  activeProfileCoverage!: Array<{
    ncsProfileId: NcsProfileId;
    requiredBaseQuestionCount: number;
    actualBaseQuestionCount: number;
    covered: boolean;
  }>;
  questionSetRequiresReconfirmation!: boolean;
}

export class InterviewSettingsResponseDto {
  posting!: InterviewSettingsPostingDto;
  availableTags!: InterviewSettingsAvailableTagDto[];
  criteria!: InterviewSettingsCriterionDto[];
  questions!: InterviewSettingsQuestionDto[];
  timePolicy!: InterviewTimePolicyDto;
  evaluationFramework!: EvaluationFramework;
  questionGenerationPolicy!: InterviewQuestionGenerationPolicyDto;
  configurationLocked!: boolean;
  configurationLockedReason!: 'SUBMITTED_APPLICATION_EXISTS' | null;
  questionImpactByProfile!: Array<{
    ncsProfileId: NcsProfileId;
    exclusivelyBoundActiveQuestionCount: number;
    multiBoundActiveQuestionCount: number;
  }>;
  questionSetRequiresReconfirmation!: boolean;
}

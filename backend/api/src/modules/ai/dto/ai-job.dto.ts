import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export const POSTING_DRAFT_INPUT_LIMITS = {
  titleMaxLength: 120,
  jobRoleMaxLength: 80,
  summaryMaxLength: 1000,
  careerRequirementMaxLength: 80,
  employmentTypeMaxLength: 40,
  workLocationMaxLength: 120,
  keywordMaxCount: 10,
  keywordMaxLength: 40
} as const;

export class DocumentExtractRequestDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  applicationId!: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(1)
  documentId!: number;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  fileId!: number;

  @ApiPropertyOptional({ example: "candidate/4/resume.pdf" })
  @IsOptional()
  @IsString()
  s3Key?: string;
}

export class SttRequestDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  answerId!: number;

  @ApiProperty({ example: 11 })
  @IsInt()
  @Min(1)
  audioFileId!: number;

  @ApiPropertyOptional({ example: "candidate/4/answer-10.wav" })
  @IsOptional()
  @IsString()
  audioS3Key?: string;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number;
}

export class FollowUpQuestionRequestDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  answerId!: number;

  @ApiProperty({ example: "How did you use Redis?" })
  @IsString()
  @IsNotEmpty()
  previousQuestion!: string;

  @ApiProperty({ example: "I improved read performance with Redis cache." })
  @IsString()
  @IsNotEmpty()
  transcript!: string;

  @ApiPropertyOptional({ example: "Backend engineer with Redis operations." })
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @ApiPropertyOptional({ example: "Resume summary mentioning Redis operations." })
  @IsOptional()
  @IsString()
  documentSummary?: string;
}

export class MockQuestionGenerateRequestDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(6)
  questionCount!: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  folderId?: number;
}

export class CriteriaSuggestRequestDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  postingId!: number;

  @ApiProperty({ example: "Backend engineer with NestJS and PostgreSQL experience." })
  @IsString()
  @IsNotEmpty()
  jobDescription!: string;

  @ApiProperty({ example: "Pragmatic problem solver" })
  @IsString()
  @IsNotEmpty()
  talentProfile!: string;

  @ApiProperty({ example: "Prefer evidence-backed backend ownership." })
  @IsString()
  @IsNotEmpty()
  evaluationPolicy!: string;
}

export class QuestionGenerateCriterionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  criterionId!: number;

  @ApiProperty({ example: "Problem solving" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: "직무역량" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsInt()
  weight?: number;
}

export class QuestionGenerateRequestDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  postingId!: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  jdCriteriaQuestionCount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedPolicyVersion?: number;

  @ApiPropertyOptional({ example: "Backend engineer with NestJS and PostgreSQL experience." })
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  questionCount?: number;

  @ApiPropertyOptional({ type: [QuestionGenerateCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionGenerateCriterionDto)
  criteria?: QuestionGenerateCriterionDto[];
}

export class QuestionSetCriterionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  criterionId!: number;

  @ApiProperty({ example: "Problem solving" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsInt()
  weight?: number;
}

export class QuestionSetGenerateRequestDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  postingId!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  questionCount!: number;

  @ApiProperty({ type: [QuestionSetCriterionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionSetCriterionDto)
  criteria!: QuestionSetCriterionDto[];

  @ApiProperty({ type: [String], example: ["TECHNICAL", "EXPERIENCE"] })
  @IsArray()
  @IsString({ each: true })
  questionTypes!: string[];
}

export class PostingDraftGenerateRequestDto {
  @ApiProperty({ example: "2026 신입 백엔드 채용", maxLength: POSTING_DRAFT_INPUT_LIMITS.titleMaxLength })
  @IsString()
  @IsNotEmpty()
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.titleMaxLength)
  title!: string;

  @ApiProperty({ example: "Backend Developer", maxLength: POSTING_DRAFT_INPUT_LIMITS.jobRoleMaxLength })
  @IsString()
  @IsNotEmpty()
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.jobRoleMaxLength)
  jobRole!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["NestJS", "PostgreSQL", "Redis"],
    maxItems: POSTING_DRAFT_INPUT_LIMITS.keywordMaxCount,
    maxLength: POSTING_DRAFT_INPUT_LIMITS.keywordMaxLength
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POSTING_DRAFT_INPUT_LIMITS.keywordMaxCount)
  @IsString({ each: true })
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.keywordMaxLength, { each: true })
  keywords?: string[];

  @ApiPropertyOptional({ example: "대용량 채용 플랫폼 API를 함께 설계하고 운영합니다.", maxLength: POSTING_DRAFT_INPUT_LIMITS.summaryMaxLength })
  @IsOptional()
  @IsString()
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.summaryMaxLength)
  summary?: string;

  @ApiPropertyOptional({ example: "신입 이상", maxLength: POSTING_DRAFT_INPUT_LIMITS.careerRequirementMaxLength })
  @IsOptional()
  @IsString()
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.careerRequirementMaxLength)
  careerRequirement?: string;

  @ApiPropertyOptional({ example: "정규직", maxLength: POSTING_DRAFT_INPUT_LIMITS.employmentTypeMaxLength })
  @IsOptional()
  @IsString()
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.employmentTypeMaxLength)
  employmentType?: string;

  @ApiPropertyOptional({ example: "서울", maxLength: POSTING_DRAFT_INPUT_LIMITS.workLocationMaxLength })
  @IsOptional()
  @IsString()
  @MaxLength(POSTING_DRAFT_INPUT_LIMITS.workLocationMaxLength)
  workLocation?: string;
}

export class GuardrailEvidenceDto {
  @ApiProperty({ enum: ["INTERVIEW_ANSWER", "APPLICATION_DOCUMENT"], example: "INTERVIEW_ANSWER" })
  @IsIn(["INTERVIEW_ANSWER", "APPLICATION_DOCUMENT"])
  sourceType!: "INTERVIEW_ANSWER" | "APPLICATION_DOCUMENT";

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  answerId?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  documentId?: number;

  @ApiPropertyOptional({ example: "resume.pdf#p1" })
  @IsOptional()
  @IsString()
  documentRef?: string;

  @ApiProperty({ example: "Clear answer." })
  @IsString()
  @IsNotEmpty()
  text!: string;
}

export class GuardrailScoreDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  criterionId!: number;

  @ApiProperty({ example: "Communication" })
  @IsString()
  @IsNotEmpty()
  criterionName!: string;

  @ApiProperty({ example: 80 })
  @IsInt()
  score!: number;

  @ApiProperty({ example: "The answer is clear and evidence-backed." })
  @IsString()
  @IsNotEmpty()
  rationale!: string;

  @ApiProperty({ example: "Matches criterion: Communicates clearly with evidence." })
  @IsOptional()
  @IsString()
  rubricAnchor!: string;

  @ApiProperty({ enum: ["HIGH", "MEDIUM", "LOW"], example: "MEDIUM" })
  @IsOptional()
  @IsIn(["HIGH", "MEDIUM", "LOW"])
  confidence!: "HIGH" | "MEDIUM" | "LOW";

  @ApiProperty({ type: [String], example: ["No explicit measurable outcome was provided."] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  uncertaintyReasons!: string[];

  @ApiProperty({ type: [GuardrailEvidenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardrailEvidenceDto)
  evidences!: GuardrailEvidenceDto[];
}

export class GuardrailQuestionEvaluationDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  criterionId!: number;

  @ApiProperty({ example: "Communication" })
  @IsString()
  @IsNotEmpty()
  criterionName!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  answerId!: number;

  @ApiProperty({ example: "Describe your Redis experience." })
  @IsString()
  @IsNotEmpty()
  question!: string;

  @ApiProperty({ example: "Matches criterion: Communicates clearly with evidence." })
  @IsString()
  @IsNotEmpty()
  rubricAnchor!: string;

  @ApiProperty({ enum: ["HIGH", "MEDIUM", "LOW"], example: "MEDIUM" })
  @IsIn(["HIGH", "MEDIUM", "LOW"])
  confidence!: "HIGH" | "MEDIUM" | "LOW";

  @ApiProperty({ type: [String], example: ["No explicit measurable outcome was provided."] })
  @IsArray()
  @IsString({ each: true })
  uncertaintyReasons!: string[];

  @ApiProperty({ type: [GuardrailEvidenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardrailEvidenceDto)
  evidences!: GuardrailEvidenceDto[];
}

export class GuardrailValidationRequestDto {
  @ApiProperty({ enum: ["RECRUITING_REPORT", "MOCK_INTERVIEW_REPORT"], example: "RECRUITING_REPORT" })
  @IsIn(["RECRUITING_REPORT", "MOCK_INTERVIEW_REPORT"])
  reportType!: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";

  @ApiProperty({ enum: ["REPORT", "SCORES"], example: "SCORES" })
  @IsIn(["REPORT", "SCORES"])
  target!: "REPORT" | "SCORES";

  @ApiPropertyOptional({ example: "AI_GUARDRAIL_VALIDATE" })
  @IsOptional()
  @IsString()
  policyName?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  processLogId?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  regenerated?: boolean;

  @ApiPropertyOptional({ example: "Unsafe wording was regenerated before final validation." })
  @IsOptional()
  @IsString()
  regenerationReason?: string;

  @ApiPropertyOptional({ example: "지원자의 답변은 근거가 명확합니다." })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ example: 82 })
  @IsOptional()
  @IsInt()
  totalScore?: number;

  @ApiProperty({ type: [GuardrailScoreDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardrailScoreDto)
  scores!: GuardrailScoreDto[];

  @ApiPropertyOptional({ type: [GuardrailQuestionEvaluationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardrailQuestionEvaluationDto)
  questionEvaluations?: GuardrailQuestionEvaluationDto[];
}

export class GuardrailDecisionDto {
  @ApiProperty({ enum: ["PASS", "BLOCKED", "REGENERATED"], example: "PASS" })
  result!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  reason!: string | null;

  @ApiPropertyOptional({ enum: ["RETRYABLE", "NON_RETRYABLE"], nullable: true, example: null })
  failureCategory?: string | null;
}

export class GuardrailValidationResultDto {
  @ApiProperty({ enum: ["REPORT", "SCORES"], example: "SCORES" })
  target!: string;

  @ApiProperty({ example: 1 })
  processLogId!: number;

  @ApiProperty({ type: GuardrailDecisionDto })
  guardrail!: GuardrailDecisionDto;

  @ApiPropertyOptional({ example: 1 })
  guardrailLogId?: number;
}

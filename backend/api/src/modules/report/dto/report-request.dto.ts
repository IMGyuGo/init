import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

export class EvaluationCriterionInputDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  criterionId!: number;

  @ApiProperty({ example: "문제 해결력" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: "문제 원인을 나누어 확인하고 제약, 대안, 해결 과정을 설명하는지 확인한다." })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(0)
  @Max(100)
  weight!: number;
}

export class InterviewAnswerInputDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  answerId!: number;

  @ApiProperty({ example: "Describe your Redis experience." })
  @IsString()
  @IsNotEmpty()
  question!: string;

  @ApiPropertyOptional({ example: "I improved read performance with Redis cache, TTL, and invalidation policies." })
  @IsOptional()
  @IsString()
  transcript?: string;

  @ApiPropertyOptional({
    example: {
      cameraWarnings: 1,
      microphoneWarnings: 0,
      longSilenceCount: 2,
      testModeUsed: false
    }
  })
  @IsOptional()
  @IsObject()
  nonverbalMetadata?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ["EVALUATED", "STT_UNAVAILABLE"], example: "EVALUATED" })
  @IsOptional()
  @IsIn(["EVALUATED", "STT_UNAVAILABLE"])
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";

  @ApiPropertyOptional({
    example: "STT transcript is unavailable because speech recognition failed."
  })
  @IsOptional()
  @IsString()
  transcriptUnavailableReason?: string;
}

export class ManualEvaluationInputDto {
  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  reviewerUserId!: number;

  @ApiPropertyOptional({ enum: ["UNDECIDED", "PASS", "HOLD", "FAIL"], example: "HOLD" })
  @IsOptional()
  @IsIn(["UNDECIDED", "PASS", "HOLD", "FAIL"])
  decision?: "UNDECIDED" | "PASS" | "HOLD" | "FAIL";

  @ApiPropertyOptional({ example: "Needs human review." })
  @IsOptional()
  @IsString()
  memo?: string;
}

export class EvaluationContextCompanyDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  companyId!: number;

  @ApiProperty({ example: "Init Corp" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: "Pragmatic problem solver" })
  @IsOptional()
  @IsString()
  talentProfile?: string;
}

export class EvaluationContextPostingDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  postingId!: number;

  @ApiProperty({ example: "Backend Engineer" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: "Backend engineer with NestJS, PostgreSQL, and Redis experience." })
  @IsString()
  @IsNotEmpty()
  jobDescription!: string;
}

export class EvaluationContextApplicationDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  applicationId!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  candidateId!: number;

  @ApiPropertyOptional({ example: "The candidate has worked on NestJS APIs and Redis cache policies." })
  @IsOptional()
  @IsString()
  documentText?: string;
}

export class EvaluationContextRequestDto {
  @ApiProperty({ enum: ["RECRUITING_REPORT"], example: "RECRUITING_REPORT" })
  @IsIn(["RECRUITING_REPORT"])
  reportType!: "RECRUITING_REPORT";

  @ApiProperty({ type: EvaluationContextCompanyDto })
  @ValidateNested()
  @Type(() => EvaluationContextCompanyDto)
  company!: EvaluationContextCompanyDto;

  @ApiProperty({ type: EvaluationContextPostingDto })
  @ValidateNested()
  @Type(() => EvaluationContextPostingDto)
  posting!: EvaluationContextPostingDto;

  @ApiProperty({ type: EvaluationContextApplicationDto })
  @ValidateNested()
  @Type(() => EvaluationContextApplicationDto)
  application!: EvaluationContextApplicationDto;

  @ApiProperty({ type: [EvaluationCriterionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionInputDto)
  criteria!: EvaluationCriterionInputDto[];

  @ApiProperty({ type: [InterviewAnswerInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterviewAnswerInputDto)
  answers!: InterviewAnswerInputDto[];

  @ApiPropertyOptional({ type: [ManualEvaluationInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualEvaluationInputDto)
  manualEvaluations?: ManualEvaluationInputDto[];
}

export class AnswerEvaluationRequestDto {
  @ApiProperty({ enum: ["RECRUITING_REPORT"], example: "RECRUITING_REPORT" })
  @IsIn(["RECRUITING_REPORT"])
  reportType!: "RECRUITING_REPORT";

  @ApiProperty({ type: [EvaluationCriterionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionInputDto)
  criteria!: EvaluationCriterionInputDto[];

  @ApiProperty({ type: [InterviewAnswerInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterviewAnswerInputDto)
  answers!: InterviewAnswerInputDto[];

  @ApiPropertyOptional({ example: "The candidate has worked on NestJS APIs and Redis cache policies." })
  @IsOptional()
  @IsString()
  documentText?: string;
}

export class CommunicationAnalysisRequestDto {
  @ApiProperty({ enum: ["RECRUITING_REPORT"], example: "RECRUITING_REPORT" })
  @IsIn(["RECRUITING_REPORT"])
  reportType!: "RECRUITING_REPORT";

  @ApiProperty({ example: true })
  @IsBoolean()
  consentConfirmed!: boolean;

  @ApiProperty({ enum: ["GOOD", "LOW_AUDIO", "LOW_VIDEO", "FACE_NOT_DETECTED"], example: "LOW_AUDIO" })
  @IsIn(["GOOD", "LOW_AUDIO", "LOW_VIDEO", "FACE_NOT_DETECTED"])
  mediaQuality!: "GOOD" | "LOW_AUDIO" | "LOW_VIDEO" | "FACE_NOT_DETECTED";

  @ApiPropertyOptional({ type: Object, example: { speechPace: "NORMAL", audioClarity: 45 } })
  @IsOptional()
  @IsObject()
  metrics?: {
    speechPace?: "SLOW" | "NORMAL" | "FAST";
    audioClarity?: number;
    eyeContactRatio?: number;
  };

  @ApiPropertyOptional({ type: [String], example: ["Audio was partially noisy."] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notes?: string[];
}

export class GenerateReportRequestDto {
  @ApiProperty({ enum: ["RECRUITING_REPORT", "MOCK_INTERVIEW_REPORT"], example: "RECRUITING_REPORT" })
  @IsIn(["RECRUITING_REPORT", "MOCK_INTERVIEW_REPORT"])
  reportType!: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";

  @ApiProperty({ example: "Backend engineer with NestJS, PostgreSQL, and Redis experience." })
  @IsString()
  @IsNotEmpty()
  jobDescription!: string;

  @ApiPropertyOptional({ example: "The candidate has worked on NestJS APIs and Redis cache policies." })
  @IsOptional()
  @IsString()
  documentText?: string;

  @ApiProperty({ type: [EvaluationCriterionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionInputDto)
  criteria!: EvaluationCriterionInputDto[];

  @ApiProperty({ type: [InterviewAnswerInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterviewAnswerInputDto)
  answers!: InterviewAnswerInputDto[];
}

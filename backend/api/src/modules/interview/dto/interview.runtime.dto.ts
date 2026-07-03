import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Min } from "class-validator";
import type { QuestionType } from "../interview.runtime.types";

export class RuntimeFileAssetDto {
  @IsString()
  storageKey!: string;

  @IsString()
  originalName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @IsPositive()
  sizeBytes!: number;
}

export class StartMockInterviewDto {
  @IsOptional()
  @IsString()
  jobRole?: string;

  @IsOptional()
  @IsIn(["EASY", "NORMAL", "HARD"])
  difficulty?: "EASY" | "NORMAL" | "HARD";

  @IsOptional()
  @IsArray()
  @IsIn(["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "FOLLOW_UP", "CLOSING"], { each: true })
  questionTypes?: QuestionType[];

  @IsOptional()
  @IsBoolean()
  showQuestionText?: boolean;
}

export class SaveInterviewAnswerDto {
  @IsInt()
  @IsPositive()
  questionId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  videoFileId?: number;

  @IsOptional()
  videoFile?: RuntimeFileAssetDto;

  @IsOptional()
  @IsInt()
  @IsPositive()
  audioFileId?: number;

  @IsOptional()
  audioFile?: RuntimeFileAssetDto;

  @IsInt()
  @Min(1)
  durationSeconds!: number;
}

export class AiInterviewRequestDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  answerId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  fileAssetId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  audioFileId?: number;

  @IsOptional()
  @IsString()
  audioS3Key?: string;

  @IsOptional()
  @IsString()
  previousQuestion?: string;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  jobDescription?: string;

  @IsOptional()
  @IsString()
  documentSummary?: string;
}

export class InsertFollowUpQuestionDto {
  @IsInt()
  @IsPositive()
  processLogId!: number;
}

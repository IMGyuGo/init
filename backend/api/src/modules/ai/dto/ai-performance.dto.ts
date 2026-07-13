import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

export class AiPerformanceQueryDto {
  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ example: "STT" })
  @IsOptional()
  @IsString()
  processType?: string;

  @ApiPropertyOptional({ example: "COMPLETED" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "ANSWER_TO_NEXT_QUESTION" })
  @IsOptional()
  @IsString()
  eventName?: string;
}

export class ClientPerformanceLogRequestDto {
  @ApiProperty({ example: "ANSWER_TO_NEXT_QUESTION" })
  @IsString()
  eventName!: string;

  @ApiProperty({ example: 3200 })
  @IsInt()
  @Min(0)
  durationMs!: number;

  @ApiPropertyOptional({ example: 123 })
  @IsOptional()
  @IsInt()
  @Min(1)
  processLogId?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sessionId?: number;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  @Min(1)
  applicationId?: number;

  @ApiPropertyOptional({ example: 11 })
  @IsOptional()
  @IsInt()
  @Min(1)
  questionId?: number;

  @ApiPropertyOptional({ example: "2026-07-06T10:00:00.000Z" })
  @IsOptional()
  @IsString()
  startedAt?: string;

  @ApiPropertyOptional({ example: "2026-07-06T10:00:03.200Z" })
  @IsOptional()
  @IsString()
  completedAt?: string;

  @ApiPropertyOptional({
    type: Object,
    example: {
      outcome: "FOLLOW_UP_READY",
      nextReady: true,
      nextQuestionType: "FOLLOW_UP_QUESTION"
    }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AiPerformanceLogResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "ANSWER_TO_NEXT_QUESTION" })
  eventName!: string;

  @ApiProperty({ example: 3200 })
  durationMs!: number;

  @ApiProperty({ example: "2026-07-06T10:00:03.200Z" })
  createdAt!: string;
}

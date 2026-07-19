import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FailureReasonDto {
  @ApiProperty({
    enum: [
      "RETRYABLE",
      "NON_RETRYABLE",
      "STT_RETRYABLE",
      "REANSWER_REQUIRED",
      "REGENERATION_REQUIRED",
    ],
    example: "RETRYABLE",
  })
  category!: string;

  @ApiProperty({ example: "AI queue publish failed: SQS unavailable" })
  reason!: string;

  @ApiProperty({ example: true })
  retryable!: boolean;
}

export class EvaluationReportSnapshotDto {
  @ApiProperty({ example: 1 })
  reportId!: number;

  @ApiProperty({ enum: ["MOCK_INTERVIEW_REPORT", "RECRUITING_REPORT"], example: "RECRUITING_REPORT" })
  reportType!: string;

  @ApiProperty({ enum: ["PENDING", "GENERATING", "COMPLETED", "FAILED"], example: "GENERATING" })
  status!: string;

  @ApiPropertyOptional({ example: "지원 직무와 경험이 잘 맞습니다." })
  summary?: string;

  @ApiPropertyOptional({ example: 82 })
  totalScore?: number;

  @ApiPropertyOptional({ type: FailureReasonDto })
  failure?: FailureReasonDto;
}

export class AiJobResponseDto {
  @ApiProperty({ example: 1 })
  processLogId!: number;

  @ApiProperty({ example: "REPORT_GENERATE" })
  processType!: string;

  @ApiProperty({ enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"], example: "PENDING" })
  status!: string;

  @ApiProperty({ example: true })
  queued!: boolean;

  @ApiProperty({ example: "{\"kind\":\"REPORT_PIPELINE_STEP\"}" })
  inputRef!: string;

  @ApiPropertyOptional({ example: "{\"items\":[\"Question 1\"]}" })
  outputRef?: string;

  @ApiPropertyOptional({ type: Object })
  output?: unknown;

  @ApiPropertyOptional({ example: 3 })
  applicationId?: number;

  @ApiPropertyOptional({ example: 7 })
  sessionId?: number;

  @ApiPropertyOptional({ example: "2026-07-06T10:00:00.000Z" })
  startedAt?: string;

  @ApiPropertyOptional({ example: "2026-07-06T10:00:03.200Z" })
  completedAt?: string;

  @ApiPropertyOptional({ example: 3200 })
  durationMs?: number;

  @ApiPropertyOptional({ example: "gpt-4o-mini" })
  modelName?: string;

  @ApiPropertyOptional({ example: 1532 })
  inputTokens?: number;

  @ApiPropertyOptional({ example: 240 })
  outputTokens?: number;

  @ApiPropertyOptional({ example: 42 })
  audioSeconds?: number;

  @ApiPropertyOptional({ example: 0.001234 })
  estimatedCostUsd?: number;

  @ApiPropertyOptional({ type: FailureReasonDto })
  failure?: FailureReasonDto;

  @ApiPropertyOptional({ type: EvaluationReportSnapshotDto })
  report?: EvaluationReportSnapshotDto;
}

export class GenerateReportResponseDto extends AiJobResponseDto {
  @ApiProperty({ type: EvaluationReportSnapshotDto })
  declare report: EvaluationReportSnapshotDto;
}

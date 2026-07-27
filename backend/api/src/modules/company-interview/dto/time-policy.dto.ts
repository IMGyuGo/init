import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateInterviewTimePolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postingId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  preparationTimeSec!: number;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(1800)
  answerTimeSec!: number;

  @IsBoolean()
  retryAllowed!: boolean;
}

export class UpdateInterviewTimePolicyResponseDto {
  postingId!: number;
  timePolicy!: {
    preparationTimeSec: number;
    answerTimeSec: number;
    retryAllowed: boolean;
  };
}

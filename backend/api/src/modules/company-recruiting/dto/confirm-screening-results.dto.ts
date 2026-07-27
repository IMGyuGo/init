import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class ConfirmScreeningResultsDto {
  @ApiProperty({ example: 18, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedEligibleCount!: number;
}

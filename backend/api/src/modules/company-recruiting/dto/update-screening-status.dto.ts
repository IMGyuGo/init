import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateScreeningStatusDto {
  @ApiProperty({ enum: ["UNDECIDED", "PASS", "HOLD", "FAIL"], example: "HOLD" })
  @IsIn(["UNDECIDED", "PASS", "HOLD", "FAIL"])
  screeningDecision!: "UNDECIDED" | "PASS" | "HOLD" | "FAIL";

  @ApiPropertyOptional({ example: "추가 확인 필요" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  screeningMemo?: string;
}

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateScreeningReviewDto {
  @ApiPropertyOptional({ enum: ["PASS", "HOLD", "FAIL"], nullable: true, example: "HOLD" })
  @IsOptional()
  @IsIn(["PASS", "HOLD", "FAIL"])
  screeningReviewerDecision?: "PASS" | "HOLD" | "FAIL" | null;

  @ApiPropertyOptional({ nullable: true, minLength: 10, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  overrideReason?: string | null;
}

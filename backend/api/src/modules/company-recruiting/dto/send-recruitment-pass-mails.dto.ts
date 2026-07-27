import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class SendRecruitmentPassMailsDto {
  @ApiProperty({ example: 12, minimum: 0, maximum: 5000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  targetPassCount!: number;
}

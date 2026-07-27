import { ApiProperty } from "@nestjs/swagger";

export class HealthResponseDto {
  @ApiProperty({ type: String, example: "ok" })
  status!: "ok";
}

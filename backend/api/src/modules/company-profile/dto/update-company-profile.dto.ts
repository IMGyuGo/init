import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateCompanyProfileDto {
  @ApiProperty({ example: "Init Labs" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: "AI SaaS" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({ nullable: true, example: "AI 면접 자동화 솔루션을 만드는 기업입니다." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  profile?: string;

  @ApiPropertyOptional({ nullable: true, example: "문제를 구조화하고 명확하게 협업하는 인재" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  talentProfile?: string;

  @ApiPropertyOptional({ nullable: true, example: "직무 역량 60%, 협업 역량 40%" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evaluationPolicy?: string;
}

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class SubmitPublicApplicationDto {
  @ApiProperty({ example: "김지원" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: "candidate@example.com" })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: "010-0000-0000" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone!: string;

  @ApiPropertyOptional({ example: "https://github.com/candidate" })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  githubBlogUrl?: string;

  @ApiPropertyOptional({ enum: ["URL", "FILE"], example: "URL" })
  @IsOptional()
  @IsIn(["URL", "FILE"])
  portfolioMode?: "URL" | "FILE";

  @ApiPropertyOptional({ example: "https://github.com/candidate" })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  portfolioUrl?: string;

  @ApiPropertyOptional({ example: "게임 서버 개발 경험을 바탕으로 지원합니다." })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  motivation?: string;

  @ApiPropertyOptional({ example: "대규모 트래픽 프로젝트 경험이 있습니다." })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  additionalInfo?: string;

  @ApiPropertyOptional({ example: "지원 직무와 관련된 프로젝트 경험을 입력합니다." })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resumeText?: string;

  @ApiProperty({ example: true })
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  consentAgreed!: boolean;
}

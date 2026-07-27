import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CompanyProfileResponseDto {
  @ApiProperty({ example: 1 })
  companyId!: number;

  @ApiProperty({ example: 1 })
  ownerUserId!: number;

  @ApiProperty({ example: "Init Labs" })
  name!: string;

  @ApiProperty({ example: "1234567890" })
  businessRegistrationNumber!: string;

  @ApiProperty({ enum: ["PENDING", "VERIFIED", "REJECTED"], example: "VERIFIED" })
  verificationStatus!: string;

  @ApiPropertyOptional({ nullable: true, example: 77 })
  logoFileId!: number | null;

  @ApiPropertyOptional({ nullable: true, example: "https://cdn.example.com/company/1/profile-logo/logo.png" })
  logoUrl!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "AI SaaS" })
  industry!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "AI 면접 자동화 솔루션을 만드는 기업입니다." })
  profile!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "문제를 구조화하고 명확하게 협업하는 인재" })
  talentProfile!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "직무 역량 60%, 협업 역량 40%" })
  evaluationPolicy!: string | null;

  @ApiProperty({ example: "2026-07-01T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-07-02T00:00:00.000Z" })
  updatedAt!: string;
}

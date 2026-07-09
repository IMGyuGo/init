import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  POSTING_CAREER_MAX_YEARS,
  POSTING_EMPLOYMENT_TYPE_CODES,
  POSTING_JOB_ROLE_CODES,
  POSTING_RECRUITMENT_TYPES,
  POSTING_REGION_CODES,
  type PostingEmploymentTypeCode,
  type PostingJobRoleCode,
  type PostingRecruitmentType,
  type PostingRegionCode,
} from "@init/common";
import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import type { PostingStatusValue } from "../company-recruiting.types";

export class CreateRecruitmentDto {
  @ApiProperty({ example: "2026 신입 백엔드 채용" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: "Backend Developer" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  jobRole!: string;

  @ApiPropertyOptional({ example: "NestJS와 PostgreSQL 기반 API 개발" })
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @ApiPropertyOptional({ example: "경력 3년 이상" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  careerRequirement?: string;

  @ApiPropertyOptional({ example: "대졸 이상" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  educationRequirement?: string;

  @ApiPropertyOptional({ example: "연봉 4,000만원 이상" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  salaryInfo?: string;

  @ApiPropertyOptional({ example: "판교" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  workLocation?: string;

  @ApiPropertyOptional({ example: "정규직" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  employmentType?: string;

  @ApiPropertyOptional({ enum: POSTING_JOB_ROLE_CODES, example: "서버·백엔드" })
  @IsOptional()
  @IsIn(POSTING_JOB_ROLE_CODES as unknown as string[])
  jobRoleCode?: PostingJobRoleCode;

  @ApiPropertyOptional({ enum: POSTING_REGION_CODES, example: "서울" })
  @IsOptional()
  @IsIn(POSTING_REGION_CODES as unknown as string[])
  regionCode?: PostingRegionCode;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: POSTING_CAREER_MAX_YEARS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTING_CAREER_MAX_YEARS)
  careerMinYears?: number;

  @ApiPropertyOptional({ example: POSTING_CAREER_MAX_YEARS, minimum: 0, maximum: POSTING_CAREER_MAX_YEARS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTING_CAREER_MAX_YEARS)
  careerMaxYears?: number;

  @ApiPropertyOptional({ enum: POSTING_EMPLOYMENT_TYPE_CODES, example: "정규직" })
  @IsOptional()
  @IsIn(POSTING_EMPLOYMENT_TYPE_CODES as unknown as string[])
  employmentTypeCode?: PostingEmploymentTypeCode;

  @ApiPropertyOptional({ enum: POSTING_RECRUITMENT_TYPES, example: "마감형" })
  @IsOptional()
  @IsIn(POSTING_RECRUITMENT_TYPES as unknown as string[])
  recruitmentType?: PostingRecruitmentType;

  @ApiPropertyOptional({ example: "2026-06-29" })
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @ApiPropertyOptional({ example: "2026-07-15" })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "OPEN"], example: "OPEN" })
  @IsOptional()
  @IsIn(["DRAFT", "OPEN"])
  status?: PostingStatusValue;
}

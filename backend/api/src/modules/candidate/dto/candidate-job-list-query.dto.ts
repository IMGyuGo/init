import { POSTING_CAREER_MAX_YEARS, POSTING_RECRUITMENT_TYPES, type PostingRecruitmentType } from "@init/common";
import { Transform, Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { PostingStatus, SortOrder } from "../candidate.types";

export class CandidateJobListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  jobRole?: string;

  // 직무 다중 선택. 반복 쿼리 파라미터(jobRoles=a&jobRoles=b) 또는 단일 값을 배열로 정규화한다.
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value === undefined ? undefined : [value]))
  @IsArray()
  @IsString({ each: true })
  jobRoles?: string[];

  @IsOptional()
  @IsString()
  jobGroup?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  careerLevel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTING_CAREER_MAX_YEARS)
  careerMinYears?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTING_CAREER_MAX_YEARS)
  careerMaxYears?: number;

  @IsOptional()
  @IsIn(POSTING_RECRUITMENT_TYPES as unknown as string[])
  recruitmentType?: PostingRecruitmentType;

  @IsOptional()
  @IsIn(["OPEN", "CLOSING_SOON"])
  postingStatus?: PostingStatus;

  @IsOptional()
  @IsIn(["createdAt", "endsOn", "title"])
  sort: "createdAt" | "endsOn" | "title" = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  order: SortOrder = "desc";
}

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

const APPLICATION_STATUSES = ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW_WAITING", "INTERVIEW_DONE", "COMPLETED"] as const;
const DOCUMENT_STATUSES = ["NOT_SUBMITTED", "SUBMITTED", "EXTRACTING", "EXTRACTED", "FAILED"] as const;
const INTERVIEW_STATUSES = ["NOT_READY", "READY", "IN_PROGRESS", "COMPLETED", "FAILED"] as const;
const REPORT_STATUSES = ["PENDING", "GENERATING", "COMPLETED", "FAILED"] as const;
const SCREENING_DECISIONS = ["UNDECIDED", "PASS", "HOLD", "FAIL"] as const;
const APPLICANT_SORT_FIELDS = ["updatedAt", "applicationStatus", "interviewStatus", "reportStatus"] as const;

class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: "backend" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: "backend", description: "q의 alias" })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: "createdAt" })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc";
}

export class ListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ["DRAFT", "OPEN", "CLOSING_SOON", "CLOSED", "ARCHIVED"] })
  @IsOptional()
  @IsIn(["DRAFT", "OPEN", "CLOSING_SOON", "CLOSED", "ARCHIVED"])
  status?: string;
}

export class ListApplicantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: APPLICATION_STATUSES })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  applicationStatus?: string;

  @ApiPropertyOptional({ enum: DOCUMENT_STATUSES })
  @IsOptional()
  @IsIn(DOCUMENT_STATUSES)
  documentStatus?: string;

  @ApiPropertyOptional({ enum: INTERVIEW_STATUSES })
  @IsOptional()
  @IsIn(INTERVIEW_STATUSES)
  interviewStatus?: string;

  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  reportStatus?: string;

  @ApiPropertyOptional({ enum: SCREENING_DECISIONS })
  @IsOptional()
  @IsIn(SCREENING_DECISIONS)
  screeningDecision?: string;

  @ApiPropertyOptional({ enum: APPLICANT_SORT_FIELDS, default: "updatedAt" })
  @IsOptional()
  @IsIn(APPLICANT_SORT_FIELDS)
  override sort?: string = undefined;
}

export class ListApplicantsByRecruitmentQueryDto extends ListApplicantsQueryDto {
  @ApiProperty({ example: 101, description: "조회할 채용 공고 ID" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recruitmentId!: number;
}

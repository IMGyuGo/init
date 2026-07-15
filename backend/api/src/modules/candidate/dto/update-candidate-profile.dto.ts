import { Type } from "class-transformer";
import {
  CANDIDATE_ACTIVITY_TYPES,
  CANDIDATE_CREDENTIAL_TYPES,
  CANDIDATE_DEGREE_TYPES,
  CANDIDATE_EDUCATION_LEVELS,
  CANDIDATE_EDUCATION_STATUSES,
  type CandidateActivityType,
  type CandidateCredentialType,
  type CandidateDegreeType,
  type CandidateEducationLevel,
  type CandidateEducationStatus,
} from "@init/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

class CandidateEducationDto {
  @IsIn(CANDIDATE_EDUCATION_LEVELS)
  educationLevel!: CandidateEducationLevel;

  @IsString()
  @MaxLength(150)
  schoolName!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(150)
  major?: string | null;

  @IsIn(CANDIDATE_DEGREE_TYPES)
  degreeType!: CandidateDegreeType;

  @IsIn(CANDIDATE_EDUCATION_STATUSES)
  status!: CandidateEducationStatus;

  @Matches(YEAR_MONTH_PATTERN)
  startMonth!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(YEAR_MONTH_PATTERN)
  endMonth?: string | null;
}

class CandidateCareerDto {
  @IsString()
  @MaxLength(150)
  companyName!: string;

  @Matches(YEAR_MONTH_PATTERN)
  startMonth!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(YEAR_MONTH_PATTERN)
  endMonth?: string | null;

  @IsBoolean()
  isCurrent!: boolean;

  @IsString()
  @MaxLength(100)
  jobRole!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(100)
  department?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(100)
  position?: string | null;

  @IsString()
  @MaxLength(1000)
  responsibilities!: string;
}

class CandidateActivityDto {
  @IsIn(CANDIDATE_ACTIVITY_TYPES)
  activityType!: CandidateActivityType;

  @IsString()
  @MaxLength(150)
  organizationName!: string;

  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  startDate!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  endDate?: string | null;

  @IsBoolean()
  isOngoing!: boolean;

  @IsString()
  @MaxLength(1000)
  description!: string;
}

class CandidateCredentialDto {
  @IsIn(CANDIDATE_CREDENTIAL_TYPES)
  credentialType!: CandidateCredentialType;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(150)
  issuer!: string;

  @Matches(YEAR_MONTH_PATTERN)
  acquiredMonth!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(200)
  result?: string | null;
}

export class UpdateCandidateProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""))
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  githubUrl?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""))
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  blogUrl?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""))
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  portfolioUrl?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(5000)
  coverLetter?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CandidateEducationDto)
  educations?: CandidateEducationDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerDto)
  careers?: CandidateCareerDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CandidateActivityDto)
  activities?: CandidateActivityDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CandidateCredentialDto)
  credentials?: CandidateCredentialDto[];
}

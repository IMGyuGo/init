import { IsArray, IsEmail, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, MaxLength, Min } from "class-validator";
import type { CandidateProfileSnapshotV1, ConsentType } from "../candidate.types";

export class SubmitApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  candidateName!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  githubUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  blogUrl?: string;

  @IsInt()
  @Min(1)
  resumeFileId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  portfolioFileId?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  portfolioUrl?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  motivation!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  additionalInfo!: string;

  @IsOptional()
  @IsObject()
  profileSnapshot?: CandidateProfileSnapshotV1;

  @IsArray()
  @IsIn(["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"], { each: true })
  consentTypes!: ConsentType[];
}

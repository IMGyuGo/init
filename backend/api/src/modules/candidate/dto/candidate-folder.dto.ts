import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateCandidateFolderDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  githubUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blogUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  portfolioUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  resumeFileId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  portfolioFileId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  motivation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  extraNote?: string | null;
}

export class UpdateCandidateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  githubUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blogUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  portfolioUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  resumeFileId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  portfolioFileId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  motivation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  extraNote?: string | null;
}

import { IsOptional, IsString, MaxLength } from "class-validator";

// 지원자 프로필(내 정보) 수정. 이메일은 로그인 정보라 제외. (#272 프로필 편집)
export class UpdateCandidateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

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
  @IsString()
  @MaxLength(2000)
  summary?: string | null;
}

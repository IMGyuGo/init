import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from "class-validator";

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

  // 값이 비어 있으면(null/undefined/공백만) 삭제로 보고 검증을 건너뛴다(서비스에서 null 정규화).
  // 값이 있으면 문자열+http(s) URL 형식을 검증하고, 숫자 등 비문자열은 @IsString 에서 400으로 걸러진다. (#272 P1/P2)
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""))
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  githubUrl?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""))
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  blogUrl?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""))
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  portfolioUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;
}

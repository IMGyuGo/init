import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

// 이 DTO 는 JSON(metadata-only) 업로드용이다. multipart 파일 업로드 시 body 가 비어 있어도
// 컨트롤러의 file 분기로 진입해야 하므로 필드는 optional 로 두고,
// JSON 경로의 필수 검증은 CandidateService.assertUploadResumeRequest 에서 수행한다.
export class UploadResumeDto {
  @IsOptional()
  @IsString()
  storageKey!: string;

  @IsOptional()
  @IsString()
  originalName!: string;

  @IsOptional()
  @IsIn(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"])
  mimeType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

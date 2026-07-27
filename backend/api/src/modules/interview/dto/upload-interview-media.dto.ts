import { IsOptional, IsUUID } from "class-validator";

export class UploadInterviewMediaDto {
  @IsOptional()
  @IsUUID()
  uploadRequestId?: string;
}

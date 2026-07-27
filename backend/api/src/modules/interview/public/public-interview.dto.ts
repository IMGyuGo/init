import { IsOptional, IsString } from "class-validator";

export class PublicInterviewStartDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  magicToken?: string;
}

export interface PublicInterviewStartResponse {
  sessionId: number;
  applicationId: number;
  interviewStatus: string;
  interviewSessionStatus: string;
  runtimePath: string;
  publicAccessToken: string;
}

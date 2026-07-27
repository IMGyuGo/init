import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "dev-company@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Password123" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ["ADMIN", "COMPANY", "CANDIDATE"], example: "COMPANY" })
  @IsIn(["ADMIN", "COMPANY", "CANDIDATE"])
  userType!: "ADMIN" | "COMPANY" | "CANDIDATE";
}

export class GoogleLoginQueryDto {
  @ApiPropertyOptional({ enum: ["COMPANY", "CANDIDATE"], example: "CANDIDATE" })
  @IsOptional()
  @IsIn(["COMPANY", "CANDIDATE"])
  userType?: "COMPANY" | "CANDIDATE";
}

export class SignupCandidateDto {
  @ApiProperty({ example: "candidate@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: "Password123" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Password123" })
  @IsString()
  @MinLength(8)
  passwordConfirm!: string;

  @ApiProperty({ example: "김지원" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  termsAgreed!: boolean;
}

export class SignupCompanyDto extends SignupCandidateDto {
  @ApiProperty({ example: "Init Corp" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  companyName!: string;

  @ApiPropertyOptional({ example: "1234567890" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  businessRegistrationNumber?: string;
}

export class EmailCodeRequestDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;
}

export class VerifyCodeDto extends EmailCodeRequestDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class ResetPasswordDto extends VerifyCodeDto {
  @ApiPropertyOptional({ example: "Password123" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: "Password123" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  passwordConfirm?: string;

  @ApiPropertyOptional({ example: "Password123", description: "password alias" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

  @ApiPropertyOptional({ example: "Password123", description: "passwordConfirm alias" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPasswordConfirm?: string;
}

export class AuthUserResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ enum: ["ADMIN", "COMPANY", "CANDIDATE"], example: "COMPANY" })
  userType!: "ADMIN" | "COMPANY" | "CANDIDATE";

  @ApiPropertyOptional({ nullable: true, example: 1 })
  companyId?: number | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  candidateId?: number | null;

  @ApiProperty({ example: "dev-company@example.com" })
  email!: string;

  @ApiProperty({ example: "DEV_COMPANY_USER" })
  name!: string;
}

export class AuthTokenResponseDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  accessToken!: string;

  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;
}

export class SignupResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ enum: ["COMPANY", "CANDIDATE"], example: "CANDIDATE" })
  userType!: "COMPANY" | "CANDIDATE";

  @ApiPropertyOptional({ example: 1 })
  companyId?: number;
}

export class SentResponseDto {
  @ApiProperty({ example: true })
  sent!: boolean;
}

export class VerifiedResponseDto {
  @ApiProperty({ example: true })
  verified!: boolean;
}

export class ResetResponseDto {
  @ApiProperty({ example: true })
  reset!: boolean;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  loggedOut!: boolean;
}

export class GoogleAuthorizationResponseDto {
  @ApiProperty({ example: "https://accounts.google.com/o/oauth2/v2/auth?client_id=..." })
  authorizationUrl!: string;
}

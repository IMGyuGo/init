import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RequestPublicApplicationAccessLinkDto {
  @ApiProperty({ example: "candidate@example.com" })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class PublicApplicationStatusQueryDto {
  @ApiProperty({ example: "magic-link-token" })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token!: string;
}

export class VerifyPublicApplicationTokenDto {
  @ApiProperty({ example: "magic-link-token" })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token!: string;
}

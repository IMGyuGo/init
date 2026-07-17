import { IsString, MaxLength } from "class-validator";

export class UnlockDemoApplicationResetDto {
  @IsString()
  @MaxLength(80)
  command!: string;
}

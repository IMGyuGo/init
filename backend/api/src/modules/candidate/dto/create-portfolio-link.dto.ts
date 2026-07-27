import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min } from "class-validator";
import type { PortfolioLinkType } from "../candidate.types";

export class CreatePortfolioLinkDto {
  @IsOptional()
  @IsIn(["PORTFOLIO", "GITHUB"])
  linkType?: PortfolioLinkType;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  fileId?: number;
}

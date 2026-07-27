import { IsArray, IsIn } from "class-validator";
import type { ConsentType } from "../candidate.types";

export class SaveInterviewConsentDto {
  @IsArray()
  @IsIn(["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"], { each: true })
  consentTypes!: ConsentType[];
}

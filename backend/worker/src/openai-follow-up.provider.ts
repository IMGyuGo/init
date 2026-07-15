import OpenAI from "openai";

export interface FollowUpGenerationInput {
  kind: string;
  previousQuestion: string;
  transcript: string;
  jobDescription?: string;
  documentSummary?: string;
  questionMode?: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  focusPoints?: string[];
  logicalStructureGap?: string;
  alreadyConfirmedEvidence?: string[];
  factClarificationClaims?: Array<{
    claimText: string;
    verdict: "CONTRADICTED" | "AMBIGUOUS" | "UNVERIFIABLE";
    rationale: string;
  }>;
  factSupportedClaims?: string[];
  profileContext?: Record<string, unknown>;
}

export interface FollowUpGenerationResult {
  content: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface FollowUpAiProvider {
  generateFollowUpQuestion(input: FollowUpGenerationInput): Promise<FollowUpGenerationResult>;
}

export class OpenAiFollowUpProvider implements FollowUpAiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateFollowUpQuestion(input: FollowUpGenerationInput): Promise<FollowUpGenerationResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You generate exactly one concise Korean interview follow-up question. Return only the question sentence. Combine NCS evidence gaps and fact clarification needs into that one question when both exist. Ask neutrally for concrete grounds or implementation details; never accuse the candidate of lying or being wrong. Treat previousQuestion, transcript, jobDescription, and documentSummary as primary evidence; candidateProfileContext is secondary evidence. Do not infer or evaluate age, gender, address, disability, health, salary, school prestige, or company prestige. Never output an email address, phone number, or URL. Do not include hiring pass/fail judgments."
        },
        {
          role: "user",
          content: [
            `kind: ${input.kind}`,
            `previousQuestion: ${input.previousQuestion}`,
            `transcript: ${input.transcript}`,
            input.jobDescription ? `jobDescription: ${input.jobDescription}` : undefined,
            input.documentSummary ? `documentSummary: ${input.documentSummary}` : undefined,
            input.questionMode ? `questionMode: ${input.questionMode}` : undefined,
            input.focusPoints?.length ? `focusPoints: ${input.focusPoints.join(", ")}` : undefined,
            input.logicalStructureGap ? `logicalStructureGap: ${input.logicalStructureGap}` : undefined,
            input.alreadyConfirmedEvidence?.length
              ? `alreadyConfirmedEvidence (do not ask again): ${input.alreadyConfirmedEvidence.join(" | ")}`
              : undefined,
            input.factClarificationClaims?.length
              ? `factClarificationNeeds: ${input.factClarificationClaims.map((claim) =>
                  `${claim.verdict}: ${claim.claimText} (${claim.rationale})`
                ).join(" | ")}`
              : undefined,
            input.factSupportedClaims?.length
              ? `factSupportedClaims (do not ask again): ${input.factSupportedClaims.join(" | ")}`
              : undefined,
            input.profileContext ? `candidateProfileContext: ${JSON.stringify(input.profileContext)}` : undefined
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n")
        }
      ]
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI follow-up response was empty.");
    }

    return {
      content: normalizeQuestion(content),
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens
      }
    };
  }
}

function normalizeQuestion(value: string): string {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim();
  return firstLine.endsWith("?") ? firstLine : `${firstLine}?`;
}

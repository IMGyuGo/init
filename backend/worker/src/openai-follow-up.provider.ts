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
            "You generate one concise Korean interview follow-up question. Return only the question sentence. Do not include hiring pass/fail judgments."
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
              : undefined
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

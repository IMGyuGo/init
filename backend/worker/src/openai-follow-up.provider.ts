import OpenAI from "openai";

export interface FollowUpGenerationInput {
  kind: string;
  previousQuestion: string;
  transcript: string;
  jobDescription?: string;
  documentSummary?: string;
}

export interface FollowUpGenerationResult {
  content: string;
  model: string;
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
            input.documentSummary ? `documentSummary: ${input.documentSummary}` : undefined
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
      model: this.model
    };
  }
}

function normalizeQuestion(value: string): string {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim();
  return firstLine.endsWith("?") ? firstLine : `${firstLine}?`;
}

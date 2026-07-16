import OpenAI from "openai";
import {
  INTERVIEW_QUESTION_PUNCTUATION_PROMPT,
  normalizeInterviewQuestionPunctuation
} from "./question-punctuation";

export interface FollowUpGenerationInput {
  kind: string;
  previousQuestion: string;
  transcript: string;
  jobDescription?: string;
  documentSummary?: string;
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
          content: [
            "You generate one concise Korean interview follow-up question. Return only the question sentence. Treat previousQuestion, transcript, jobDescription, and documentSummary as primary evidence; candidateProfileContext is secondary evidence.",
            INTERVIEW_QUESTION_PUNCTUATION_PROMPT,
            "Do not infer or evaluate age, gender, address, disability, health, salary, school prestige, or company prestige. Never output an email address, phone number, or URL. Do not include hiring pass/fail judgments."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `kind: ${input.kind}`,
            `previousQuestion: ${input.previousQuestion}`,
            `transcript: ${input.transcript}`,
            input.jobDescription ? `jobDescription: ${input.jobDescription}` : undefined,
            input.documentSummary ? `documentSummary: ${input.documentSummary}` : undefined,
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
      content: normalizeInterviewQuestionPunctuation(firstNonEmptyLine(content)),
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens
      }
    };
  }
}

function firstNonEmptyLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim();
}

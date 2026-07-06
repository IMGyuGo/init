import OpenAI from "openai";

export type ReportGenerationPolicy = "MOCK" | "RECRUITING";

export interface ReportGenerationCriterion {
  criterionId: number;
  name: string;
  description?: string;
  weight?: number;
}

export interface ReportGenerationAnswer {
  answerId: number;
  question?: string;
  transcript: string;
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
}

export interface ReportGenerationInput {
  kind: string;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  policy: ReportGenerationPolicy;
  jobDescription: string;
  criteria: ReportGenerationCriterion[];
  answers: ReportGenerationAnswer[];
  documentText?: string;
}

export interface ReportGenerationResult {
  summary: string;
  feedback?: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ReportAiProvider {
  generateReport(input: ReportGenerationInput): Promise<ReportGenerationResult>;
}

export class OpenAiReportProvider implements ReportAiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReport(input: ReportGenerationInput): Promise<ReportGenerationResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write concise Korean interview feedback reports. Return JSON only with keys summary and feedback. All JSON string values must be written in Korean. Use the answer transcripts as the main evidence. If an answer has evaluationStatus STT_UNAVAILABLE, state that it is temporarily scored as 0 because speech recognition failed and do not infer answer quality from it. Do not include hiring pass/fail judgments. For mock interview reports, never mention acceptance, rejection, hiring fit, or pass/fail."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a short interview report summary and one practice feedback sentence.",
            kind: input.kind,
            reportType: input.reportType,
            policy: input.policy,
            jobDescription: input.jobDescription,
            criteria: input.criteria,
            answers: input.answers,
            documentText: input.documentText
          })
        }
      ]
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI report response was empty.");
    }

    return {
      ...parseReportContent(content),
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens
      }
    };
  }
}

function parseReportContent(content: string): Omit<ReportGenerationResult, "model"> {
  const jsonText = stripMarkdownFence(content);
  try {
    const parsed = JSON.parse(jsonText) as { summary?: unknown; feedback?: unknown };
    const summary = normalizeText(parsed.summary);
    if (!summary) {
      throw new Error("summary is required");
    }
    return {
      summary,
      feedback: normalizeText(parsed.feedback)
    };
  } catch {
    return {
      summary: firstNonEmptyLine(content)
    };
  }
}

function stripMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function firstNonEmptyLine(content: string): string {
  return content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? content.trim();
}

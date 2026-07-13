import OpenAI from "openai";

export type QuestionGenerationDifficulty = "EASY" | "MEDIUM" | "HARD";
export type QuestionGenerationType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";

export interface QuestionGenerationCriterion {
  criterionId: number;
  name: string;
  category?: string;
  weight?: number;
  description?: string;
  questionCount?: number;
  ncsProfileId?: "PROBLEM_SOLVING" | "COMMUNICATION" | "DIGITAL";
  ncsQuestionMode?: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  ncsProfileVersion?: string;
}

export interface QuestionGenerationInput {
  kind: string;
  postingId: number;
  jobDescription: string;
  questionCount: number;
  criteria: QuestionGenerationCriterion[];
}

export interface QuestionGenerationCandidate {
  content: string;
  category: string;
  difficulty: QuestionGenerationDifficulty;
  criterionId: number;
  criterionTitle: string;
  expectedKeywords: string[];
  suggestionReason: string;
  questionType?: QuestionGenerationType;
}

export interface QuestionGenerationResult {
  questionCandidates: QuestionGenerationCandidate[];
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface QuestionAiProvider {
  generateQuestions(input: QuestionGenerationInput): Promise<QuestionGenerationResult>;
}

export class OpenAiQuestionProvider implements QuestionAiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateQuestions(input: QuestionGenerationInput): Promise<QuestionGenerationResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: buildQuestionMessages(input)
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI question generation response was empty.");
    }

    return {
      questionCandidates: parseQuestionContent(content, input),
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens
      }
    };
  }
}

export function buildQuestionMessages(input: QuestionGenerationInput): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You generate Korean common interview question candidates for a company interview settings screen.",
        "Return JSON only with key questionCandidates.",
        "Every question candidate must use exactly one criterionId from the provided criteria array.",
        "When criteria[].questionCount is provided, generate exactly that many candidates for each criterion.",
        "For NCS criteria, make the question collect observable evidence for the provided ncsProfileId and ncsQuestionMode.",
        "Problem solving questions must ask for problem analysis, alternative selection, and result validation evidence.",
        "Communication questions must ask for structured explanation, audience adjustment, and mutual-understanding confirmation evidence.",
        "Digital questions must ask for technical principles, practical application, and risk validation evidence.",
        "Do not invent criterionId values. Do not omit criterionId.",
        "criterionTitle must equal the matched criterion name.",
        "category must equal the matched criterion category when provided, otherwise use a concise Korean category.",
        "Generate only questions that can be saved to the question bank after human review.",
        "Do not include final hiring pass/fail judgments, sensitive attributes, appearance, eye contact, voice tone, age, gender, school, region, disability, or health.",
        "Questions must evaluate observable work evidence through answer content."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate review-only common interview question candidates based on the JD and saved evaluation criteria.",
        kind: input.kind,
        postingId: input.postingId,
        jobDescription: input.jobDescription,
        questionCount: input.questionCount,
        criteria: input.criteria,
        outputContract: {
          questionCandidates: [
            {
              content: "Korean interview question string",
              category: "matched criterion category",
              difficulty: "EASY | MEDIUM | HARD",
              criterionId: "must be one of input criteria[].criterionId",
              criterionTitle: "matched criterion name",
              expectedKeywords: ["2-5 Korean evidence keywords"],
              suggestionReason: "short Korean reason tied to JD and matched criterion",
              questionType: "TECHNICAL | EXPERIENCE | SITUATION"
            }
          ]
        }
      })
    }
  ];
}

function parseQuestionContent(content: string, input: QuestionGenerationInput): QuestionGenerationCandidate[] {
  const parsed = parseJsonObject(stripMarkdownFence(content));
  const rawCandidates = Array.isArray(parsed.questionCandidates) ? parsed.questionCandidates : [];
  const criteriaById = new Map(input.criteria.map((criterion) => [criterion.criterionId, criterion]));
  const candidates = rawCandidates
    .map((item): QuestionGenerationCandidate | undefined => normalizeCandidate(item, criteriaById))
    .filter((item): item is QuestionGenerationCandidate => item !== undefined)
    .slice(0, input.questionCount);

  if (candidates.length === 0) {
    throw new Error("OpenAI question generation returned no candidates with valid criterionId.");
  }

  return candidates;
}

function normalizeCandidate(
  item: unknown,
  criteriaById: Map<number, QuestionGenerationCriterion>
): QuestionGenerationCandidate | undefined {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const record = item as Record<string, unknown>;
  const criterionId = numberOf(record.criterionId);
  if (criterionId === undefined) {
    return undefined;
  }
  const criterion = criteriaById.get(criterionId);
  if (!criterion) {
    return undefined;
  }
  const content = normalizeText(record.content);
  if (!content) {
    return undefined;
  }

  return {
    content: normalizeQuestion(content),
    category: normalizeText(record.category) ?? criterion.category ?? "공통 질문",
    difficulty: difficultyOf(record.difficulty),
    criterionId,
    criterionTitle: criterion.name,
    expectedKeywords: stringArrayOf(record.expectedKeywords).slice(0, 5),
    suggestionReason:
      normalizeText(record.suggestionReason) ??
      `${criterion.name} 평가 기준과 JD 맥락을 확인하기 위한 질문 후보입니다.`,
    questionType: questionTypeOf(record.questionType)
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stripMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function numberOf(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeQuestion(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.endsWith("?") ? normalized : `${normalized}?`;
}

function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function difficultyOf(value: unknown): QuestionGenerationDifficulty {
  return value === "EASY" || value === "HARD" ? value : "MEDIUM";
}

function questionTypeOf(value: unknown): QuestionGenerationType | undefined {
  return value === "INTRO" ||
    value === "TECHNICAL" ||
    value === "EXPERIENCE" ||
    value === "SITUATION" ||
    value === "FOLLOW_UP" ||
    value === "CLOSING"
    ? value
    : undefined;
}

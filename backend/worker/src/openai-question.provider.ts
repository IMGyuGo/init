import OpenAI from "openai";
import type { NcsApiProfileId } from "./ncs-question-alignment.adapter";

export type QuestionGenerationDifficulty = "EASY" | "MEDIUM" | "HARD";
export type QuestionGenerationType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";

export interface QuestionGenerationCriterion {
  criterionId: number;
  name: string;
  category?: string;
  weight?: number;
  description?: string;
  questionCount?: number;
  ncsProfileId?: NcsApiProfileId;
  ncsQuestionMode?: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  ncsProfileVersion?: string;
}

export interface QuestionGenerationInput {
  kind: string;
  jobRole?: string;
  requestedDifficulty?: QuestionGenerationDifficulty;
  postingId?: number;
  jobDescription?: string;
  questionCount: number;
  criteria: QuestionGenerationCriterion[];
  source?: "JD_CRITERIA" | "RESUME_PERSONALIZED";
  resumeText?: string;
  profileContext?: Record<string, unknown>;
  folderContext?: Record<string, unknown>;
  questionTypes?: QuestionGenerationType[];
}

export interface QuestionGenerationCandidate {
  content: string;
  category: string;
  difficulty: QuestionGenerationDifficulty;
  criterionId?: number;
  criterionTitle?: string;
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
  const mock = input.kind.startsWith("MOCK");
  if (mock) {
    return [
      {
        role: "system",
        content: [
          "You generate personalized Korean mock interview questions for one candidate.",
          "Return JSON only with key questionCandidates.",
          "Ground every question in the supplied candidate profile, cover letter, resume text, links, motivation, or activity history.",
          "Ask for verifiable decisions, actions, trade-offs, and outcomes. Do not invent experiences that are absent from context.",
          "Never use or mention name, email, phone, age, gender, address, disability, health, appearance, school prestige, or other sensitive attributes.",
          "Do not make hiring pass/fail judgments. These questions are practice-only and must not be saved to a company question bank."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate personalized mock interview questions from the candidate's actual evidence.",
          questionCount: input.questionCount,
          jobRole: input.jobRole,
          requestedDifficulty: input.requestedDifficulty,
          questionTypes: input.questionTypes,
          profileContext: input.profileContext,
          folderContext: input.folderContext,
          outputContract: {
            questionCandidates: [{
              content: "Korean interview question string",
              category: "맞춤형 모의면접",
              difficulty: "EASY | MEDIUM | HARD",
              expectedKeywords: ["2-5 evidence keywords"],
              suggestionReason: "short reason tied to supplied context",
              questionType: "INTRO | TECHNICAL | EXPERIENCE | SITUATION | FOLLOW_UP | CLOSING"
            }]
          }
        })
      }
    ];
  }
  return [
    {
      role: "system",
      content: [
        input.source === "RESUME_PERSONALIZED"
          ? "You generate Korean resume-personalized recruiting interview questions."
          : "You generate Korean common interview question candidates for a company interview settings screen.",
        "Return JSON only with key questionCandidates.",
        "Every question candidate must use exactly one criterionId from the provided criteria array.",
        "When criteria[].questionCount is provided, generate exactly that many candidates for each criterion.",
        "For NCS criteria, make the question collect observable evidence for the provided ncsProfileId and ncsQuestionMode.",
        "Problem solving questions must ask for problem analysis, alternative selection, and result validation evidence.",
        "COLLABORATION_COMMUNICATION questions must ask for structured explanation, audience adjustment, and mutual-understanding confirmation evidence.",
        "JOB_TECHNICAL questions must ask for technical principles, practical application, and risk validation evidence.",
        "Do not invent criterionId values. Do not omit criterionId.",
        "criterionTitle must equal the matched criterion name.",
        "category must equal the matched criterion category when provided, otherwise use a concise Korean category.",
        "Generate only questions that can be saved to the question bank after human review.",
        "Do not include final hiring pass/fail judgments, sensitive attributes, appearance, eye contact, voice tone, age, gender, school, region, disability, or health.",
        "Questions must evaluate observable work evidence through answer content.",
        "For resume-personalized questions, use only experiences present in resumeText and include only the minimum non-sensitive experience context needed to identify the experience."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: input.source === "RESUME_PERSONALIZED"
          ? "Generate application-specific interview questions based on the JD, saved evaluation criteria, and extracted resume text."
          : "Generate review-only common interview question candidates based on the JD and saved evaluation criteria.",
        kind: input.kind,
        postingId: input.postingId,
        jobDescription: input.jobDescription,
        questionCount: input.questionCount,
        criteria: input.criteria,
        resumeText: input.source === "RESUME_PERSONALIZED" ? input.resumeText : undefined,
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
  const mock = input.kind.startsWith("MOCK");
  const candidates = rawCandidates
    .map((item): QuestionGenerationCandidate | undefined => normalizeCandidate(item, criteriaById, mock))
    .filter((item): item is QuestionGenerationCandidate => item !== undefined)
    .slice(0, input.questionCount);

  if (candidates.length === 0) {
    throw new Error("OpenAI question generation returned no candidates with valid criterionId.");
  }

  return candidates;
}

function normalizeCandidate(
  item: unknown,
  criteriaById: Map<number, QuestionGenerationCriterion>,
  mock: boolean,
): QuestionGenerationCandidate | undefined {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const record = item as Record<string, unknown>;
  const criterionId = numberOf(record.criterionId);
  const criterion = criterionId === undefined ? undefined : criteriaById.get(criterionId);
  if (!mock && (!criterionId || !criterion)) {
    return undefined;
  }
  const content = normalizeText(record.content);
  if (!content) {
    return undefined;
  }

  return {
    content: normalizeQuestion(content),
    category: normalizeText(record.category) ?? criterion?.category ?? (mock ? "맞춤형 모의면접" : "공통 질문"),
    difficulty: difficultyOf(record.difficulty),
    criterionId: mock ? undefined : criterionId,
    criterionTitle: mock ? undefined : criterion?.name,
    expectedKeywords: stringArrayOf(record.expectedKeywords).slice(0, 5),
    suggestionReason:
      normalizeText(record.suggestionReason) ??
      (mock ? "지원자의 실제 경험을 구체적으로 확인하기 위한 연습 질문입니다." : `${criterion?.name} 평가 기준과 JD 맥락을 확인하기 위한 질문 후보입니다.`),
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

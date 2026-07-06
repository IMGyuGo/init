import OpenAI from "openai";
import { sanitizePostingDraftHtml } from "./posting-draft-html";

const POSTING_DRAFT_SECTION_KEYS = [
  "positionDetail",
  "responsibilities",
  "requirements",
  "preferredQualifications",
  "benefits",
  "hiringProcess"
] as const;

type PostingDraftSectionKey = typeof POSTING_DRAFT_SECTION_KEYS[number];

export interface PostingDraftGenerationInput {
  title: string;
  jobRole: string;
  keywords: string[];
  summary?: string;
  careerRequirement?: string;
  employmentType?: string;
  workLocation?: string;
}

export interface PostingDraftGenerationResult {
  title: string;
  jobRole: string;
  sections: Record<PostingDraftSectionKey, string>;
  tags: string[];
  model: string;
}

export interface PostingDraftAiProvider {
  generatePostingDraft(input: PostingDraftGenerationInput): Promise<PostingDraftGenerationResult>;
}

export class OpenAiPostingDraftProvider implements PostingDraftAiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generatePostingDraft(input: PostingDraftGenerationInput): Promise<PostingDraftGenerationResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You draft Korean job posting content for a company recruiting form. Return JSON only with keys title, jobRole, sections, and tags. sections must include positionDetail, responsibilities, requirements, preferredQualifications, benefits, and hiringProcess. Section values must be short HTML using only p, ul, li, strong, and br tags. Do not include candidate personal data, discriminatory wording, or final hiring decisions."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a review-only posting draft. The user will edit it before saving.",
            title: input.title,
            jobRole: input.jobRole,
            keywords: input.keywords,
            summary: input.summary,
            careerRequirement: input.careerRequirement,
            employmentType: input.employmentType,
            workLocation: input.workLocation
          })
        }
      ]
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI posting draft response was empty.");
    }

    return {
      ...parsePostingDraftContent(content, input),
      model: this.model
    };
  }
}

function parsePostingDraftContent(
  content: string,
  input: PostingDraftGenerationInput
): Omit<PostingDraftGenerationResult, "model"> {
  const parsed = parseJsonObject(stripMarkdownFence(content));
  const sections = sectionsOf(parsed.sections, input);
  const tags = tagsOf(parsed.tags, input);

  return {
    title: normalizeText(parsed.title) ?? input.title,
    jobRole: normalizeText(parsed.jobRole) ?? input.jobRole,
    sections,
    tags
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

function sectionsOf(value: unknown, input: PostingDraftGenerationInput): Record<PostingDraftSectionKey, string> {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const section = (key: PostingDraftSectionKey, fallback: string) => {
    const normalized = normalizeText(record[key]);
    if (!normalized) {
      return fallback;
    }
    const sanitized = sanitizePostingDraftHtml(normalized);
    return sanitized.length > 0 ? sanitized : fallback;
  };

  return {
    positionDetail: section("positionDetail", `<p>${escapeHtml(input.title)} ${escapeHtml(input.jobRole)} 포지션입니다.</p>`),
    responsibilities: section("responsibilities", list([`${input.jobRole} 직무의 핵심 업무를 수행합니다.`])),
    requirements: section("requirements", list([`${input.jobRole} 직무에 필요한 기본 역량을 갖춘 분`])),
    preferredQualifications: section("preferredQualifications", list(["관련 도메인 또는 협업 경험이 있는 분"])),
    benefits: section("benefits", list(["업무에 필요한 도구와 성장 기회를 지원합니다."])),
    hiringProcess: section("hiringProcess", list(["서류 검토", "직무 인터뷰", "최종 인터뷰"]))
  };
}

function tagsOf(value: unknown, input: PostingDraftGenerationInput): string[] {
  const fromResponse = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
  const tags = fromResponse.length > 0 ? fromResponse : input.keywords.length > 0 ? input.keywords : [input.jobRole];
  return Array.from(new Set(tags)).slice(0, 10);
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

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

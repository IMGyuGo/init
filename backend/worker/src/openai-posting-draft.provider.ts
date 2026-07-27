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
type PostingDraftMessage = {
  role: "system" | "user";
  content: string;
};

const POSTING_DRAFT_SYSTEM_PROMPT = [
  "You draft Korean job posting content for a company recruiting form.",
  "Return JSON only with keys title, jobRole, sections, and tags.",
  "sections must include positionDetail, responsibilities, requirements, preferredQualifications, benefits, and hiringProcess.",
  "Section values must be short HTML using only p, ul, li, strong, and br tags.",
  "Use concrete, job-related language.",
  "Use only facts provided in the user input. Do not invent compensation, benefits, work policy, equipment, remote work, hiring steps, or company programs.",
  "Avoid age, gender, school prestige, family status, appearance, disability, nationality, candidate personal data, and final hiring-decision wording.",
  "Do not exaggerate benefits or guarantee outcomes.",
  "If benefits or hiring process details are missing, use neutral review-only placeholders instead of making new claims.",
  "",
  "Section rules:",
  "- positionDetail: Explain the company/team/position context in 1-2 short paragraphs.",
  "- responsibilities: Use 3-5 bullet items about observable work.",
  "- requirements: Use job-related minimum skills only; avoid inflated credentials.",
  "- preferredQualifications: Use optional experiences, not hidden requirements.",
  "- benefits: Use only provided support or work conditions. If none are provided, say details will be confirmed according to company policy.",
  "- hiringProcess: Use only provided process steps. If none are provided, use neutral review-only steps without pass/fail, final acceptance, or notification wording.",
  "",
  "Rewrite examples:",
  "Bad: 젊고 에너지 넘치는 남성 개발자를 찾습니다.",
  "Good: 서비스 안정성과 사용자 경험을 함께 개선할 백엔드 개발자를 찾습니다.",
  "Reason: Remove age and gender preference; focus on job-related contribution.",
  "Bad: 명문대 졸업자, 20대 우대",
  "Good: 컴퓨터공학 기초 또는 이에 준하는 실무 경험이 있는 분을 선호합니다.",
  "Reason: Replace school prestige and age preference with relevant knowledge or experience.",
  "Bad: 야근과 주말 근무를 당연하게 받아들일 수 있는 분",
  "Good: 출시 일정에 따라 사전에 협의된 비상 대응이 발생할 수 있습니다.",
  "Reason: Describe work conditions precisely without coercive wording.",
  "Bad: 무조건 빠르게 성장할 수 있는 최고의 회사입니다.",
  "Good: 코드 리뷰, 장애 회고, 기술 공유를 통해 제품과 개발 역량을 함께 개선합니다.",
  "Reason: Replace exaggerated guarantees with concrete support.",
  "Bad: 유연근무, 교육비 지원, 팀 빌딩 활동을 제공합니다.",
  "Good: 복지 및 혜택은 회사 정책에 따라 안내되며, 세부 내용은 채용 과정에서 확인할 수 있습니다.",
  "Reason: Do not invent benefits that were not provided in the input."
].join("\n");

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

export function buildPostingDraftMessages(input: PostingDraftGenerationInput): PostingDraftMessage[] {
  return [
    {
      role: "system",
      content: POSTING_DRAFT_SYSTEM_PROMPT
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
        workLocation: input.workLocation,
        outputContract: {
          title: "string",
          jobRole: "string",
          sections: Object.fromEntries(POSTING_DRAFT_SECTION_KEYS.map((key) => [key, "short safe HTML string"])),
          tags: "up to 10 short strings"
        }
      })
    }
  ];
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
      messages: buildPostingDraftMessages(input)
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
    benefits: section("benefits", list(["복지 및 혜택은 회사 정책에 따라 안내됩니다."])),
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

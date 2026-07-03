export type StructuredJobSectionKey =
  | "positionDetail"
  | "responsibilities"
  | "requirements"
  | "preferredQualifications"
  | "benefits"
  | "hiringProcess";

export type StructuredJobImage = {
  url: string;
  name: string;
};

export type StructuredJobDescription = {
  gallery: StructuredJobImage[];
  sections: Record<StructuredJobSectionKey, string>;
  tags: string[];
  locationNote: string;
};

export type StructuredJobSectionDefinition = {
  key: StructuredJobSectionKey;
  title: string;
  placeholder: string;
};

export const structuredJobSectionDefinitions: StructuredJobSectionDefinition[] = [
  {
    key: "positionDetail",
    title: "포지션 상세",
    placeholder: "팀과 포지션이 해결하는 문제, 합류 후 기대 역할을 입력하세요.",
  },
  {
    key: "responsibilities",
    title: "주요 업무",
    placeholder: "담당하게 될 업무를 bullet list로 입력하세요.",
  },
  {
    key: "requirements",
    title: "자격 요건",
    placeholder: "필수 경험, 기술 역량, 협업 역량을 입력하세요.",
  },
  {
    key: "preferredQualifications",
    title: "우대사항",
    placeholder: "있으면 좋은 경험과 도메인 이해도를 입력하세요.",
  },
  {
    key: "benefits",
    title: "혜택 및 복지",
    placeholder: "근무 환경, 복지, 성장 지원 제도를 입력하세요.",
  },
  {
    key: "hiringProcess",
    title: "채용 전형",
    placeholder: "서류 검토, 기술 인터뷰, 최종 인터뷰 등 전형 순서를 입력하세요.",
  },
];

export const suggestedPostingTags = [
  "커피",
  "스낵바",
  "사내동호회",
  "식대지원",
  "자유로운 휴가",
  "유연근무",
  "인원 급성장",
  "연봉 업계 평균 이상",
  "보너스",
  "누적 투자 100억 이상",
  "워크샵",
  "개발 장비 지원",
  "기술 세미나",
  "코드 리뷰 문화",
  "재택근무",
];

const structuredBlockPattern =
  /<!--\s*init-structured-job-description:start\s*-->[\s\S]*?<!--\s*init-structured-job-description:end\s*-->/i;

export function createEmptyStructuredJobDescription(): StructuredJobDescription {
  return {
    gallery: [],
    sections: Object.fromEntries(structuredJobSectionDefinitions.map((section) => [section.key, ""])) as Record<
      StructuredJobSectionKey,
      string
    >,
    tags: [],
    locationNote: "",
  };
}

export function structuredJobDescriptionToHtml(value: StructuredJobDescription): string {
  const galleryHtml = value.gallery.length
    ? `<section data-init-structured-gallery="true">${value.gallery
        .map(
          (image) =>
            `<figure data-init-structured-gallery-item="true"><img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(
              image.name || "공고 이미지",
            )}" /><figcaption>${escapeHtml(image.name || "공고 이미지")}</figcaption></figure>`,
        )
        .join("")}</section>`
    : "";

  const sectionHtml = structuredJobSectionDefinitions
    .map((section) => {
      const body = value.sections[section.key]?.trim();
      if (!body) {
        return "";
      }
      return `<section data-init-structured-section="${section.key}"><h2>${section.title}</h2><div data-init-structured-section-body="${section.key}">${body}</div></section>`;
    })
    .filter(Boolean)
    .join("");

  const tagHtml = value.tags.length
    ? `<section data-init-structured-tags="true">${value.tags
        .map((tag) => `<span data-init-structured-tag="${escapeAttribute(tag)}">${escapeHtml(tag)}</span>`)
        .join("")}</section>`
    : "";

  const locationHtml = value.locationNote.trim()
    ? `<section data-init-structured-location="true"><h2>근무지역</h2><p>${escapeHtml(value.locationNote.trim())}</p></section>`
    : "";

  return [
    "<!-- init-structured-job-description:start -->",
    '<div data-init-structured-job-description="true">',
    galleryHtml,
    sectionHtml,
    tagHtml,
    locationHtml,
    "</div>",
    "<!-- init-structured-job-description:end -->",
  ].join("");
}

export function composeStructuredJobDescription(jobDescription: string, value: StructuredJobDescription) {
  const fallback = stripStructuredJobDescriptionBlock(jobDescription).trim();
  return [structuredJobDescriptionToHtml(value), fallback].filter(Boolean).join("");
}

export function buildStructuredPreviewJobDescription(value: StructuredJobDescription, locationNote?: string | null) {
  return composeStructuredJobDescription("", {
    ...value,
    locationNote: locationNote?.trim() || value.locationNote,
  });
}

export function extractStructuredJobDescription(jobDescription: string | null | undefined): {
  structured: StructuredJobDescription | null;
  fallbackHtml: string;
} {
  const content = jobDescription?.trim() ?? "";
  const block = content.match(structuredBlockPattern)?.[0] ?? "";

  if (!block) {
    return {
      structured: null,
      fallbackHtml: content,
    };
  }

  const structured = createEmptyStructuredJobDescription();
  structured.gallery = [...block.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*\balt="([^"]*)"[^>]*>/gi)].map((match) => ({
    url: decodeHtml(match[1] ?? ""),
    name: decodeHtml(match[2] ?? ""),
  }));

  for (const section of structuredJobSectionDefinitions) {
    const pattern = new RegExp(
      `<div\\b[^>]*data-init-structured-section-body="${section.key}"[^>]*>([\\s\\S]*?)<\\/div>`,
      "i",
    );
    structured.sections[section.key] = block.match(pattern)?.[1]?.trim() ?? "";
  }

  structured.tags = [...block.matchAll(/<span\b[^>]*data-init-structured-tag="([^"]+)"[^>]*>/gi)].map((match) =>
    decodeHtml(match[1] ?? ""),
  );

  structured.locationNote = stripHtml(
    block.match(/<section\b[^>]*data-init-structured-location="true"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/section>/i)?.[1] ??
      "",
  ).trim();

  return {
    structured,
    fallbackHtml: stripStructuredJobDescriptionBlock(content).trim(),
  };
}

export function stripStructuredJobDescriptionBlock(jobDescription: string | null | undefined) {
  return (jobDescription ?? "").replace(structuredBlockPattern, "");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function decodeHtml(value: string) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

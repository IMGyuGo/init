export type PostingExtraInfoKey = "career" | "education" | "salary" | "location" | "employmentType";
export type PostingExtraInfoApiKey =
  | "careerRequirement"
  | "educationRequirement"
  | "salaryInfo"
  | "workLocation"
  | "employmentType";

export type PostingExtraInfoField = {
  enabled: boolean;
  value: string;
};

export type PostingExtraInfo = Record<PostingExtraInfoKey, PostingExtraInfoField>;

export type PostingExtraInfoFieldDefinition = {
  key: PostingExtraInfoKey;
  apiKey: PostingExtraInfoApiKey;
  label: string;
  placeholder: string;
  options: string[];
};

export type PostingExtraInfoApiFields = Partial<Record<PostingExtraInfoApiKey, string | null | undefined>>;

export const postingExtraInfoFields: PostingExtraInfoFieldDefinition[] = [
  {
    key: "career",
    apiKey: "careerRequirement",
    label: "경력",
    placeholder: "신입 / 경력 3년 이상 / 경력무관",
    options: ["경력무관", "신입", "1년 이상", "3년 이상", "5년 이상"],
  },
  {
    key: "education",
    apiKey: "educationRequirement",
    label: "학력",
    placeholder: "학력무관 / 고졸 / 초대졸 / 대졸 이상",
    options: ["학력무관", "고졸 이상", "초대졸 이상", "대졸 이상"],
  },
  {
    key: "salary",
    apiKey: "salaryInfo",
    label: "급여",
    placeholder: "회사 내규에 따름 / 연봉 4,000만원 이상 / 협의 가능",
    options: ["회사 내규에 따름", "면접 후 결정", "연봉 3,000만원 이상", "연봉 4,000만원 이상"],
  },
  {
    key: "location",
    apiKey: "workLocation",
    label: "근무지역",
    placeholder: "서울 / 판교 / 원격 / 하이브리드",
    options: ["서울", "경기", "판교", "부산", "원격", "하이브리드"],
  },
  {
    key: "employmentType",
    apiKey: "employmentType",
    label: "근무형태",
    placeholder: "정규직 / 계약직 / 인턴 / 프리랜서",
    options: ["정규직", "계약직", "인턴", "프리랜서", "파트타임"],
  },
];

const extraInfoBlockPattern = /<blockquote\b[^>]*data-init-posting-extra-info="true"[^>]*>[\s\S]*?<\/blockquote>/i;
const extraInfoFieldPattern =
  /<p\b[^>]*data-init-posting-extra-info-field="([^"]+)"[^>]*>\s*<strong>[\s\S]*?<\/strong>\s*:\s*([\s\S]*?)<\/p>/gi;

export function createEmptyPostingExtraInfo(): PostingExtraInfo {
  return Object.fromEntries(
    postingExtraInfoFields.map((field) => [field.key, { enabled: false, value: "" }]),
  ) as PostingExtraInfo;
}

export function hasPostingExtraInfo(extraInfo: PostingExtraInfo) {
  return postingExtraInfoFields.some((field) => extraInfo[field.key].enabled && extraInfo[field.key].value.trim());
}

export function composeJobDescriptionWithExtraInfo(jobDescription: string, extraInfo: PostingExtraInfo) {
  const body = stripPostingExtraInfoBlock(jobDescription).trim();
  const extraInfoHtml = buildPostingExtraInfoHtml(extraInfo);

  return [extraInfoHtml, body].filter(Boolean).join("");
}

export function extractPostingExtraInfo(jobDescription: string | null | undefined) {
  const content = jobDescription?.trim() ?? "";
  const extraInfo = createEmptyPostingExtraInfo();
  const block = content.match(extraInfoBlockPattern)?.[0] ?? "";

  if (block) {
    for (const match of block.matchAll(extraInfoFieldPattern)) {
      const key = match[1] as PostingExtraInfoKey;
      if (isPostingExtraInfoKey(key)) {
        extraInfo[key] = {
          enabled: true,
          value: decodeHtml(stripHtml(match[2]).trim()),
        };
      }
    }
  }

  return {
    jobDescription: stripPostingExtraInfoBlock(content).trim(),
    extraInfo,
  };
}

export function postingExtraInfoToApiFields(extraInfo: PostingExtraInfo): Record<PostingExtraInfoApiKey, string | null> {
  return Object.fromEntries(
    postingExtraInfoFields.map((field) => {
      const value = extraInfo[field.key].enabled ? extraInfo[field.key].value.trim() : "";
      return [field.apiKey, value || null];
    }),
  ) as Record<PostingExtraInfoApiKey, string | null>;
}

export function postingExtraInfoFromApiFields(
  fields: PostingExtraInfoApiFields,
  fallback: PostingExtraInfo = createEmptyPostingExtraInfo(),
): PostingExtraInfo {
  const hasApiValue = postingExtraInfoFields.some((field) => normalizeApiValue(fields[field.apiKey]));
  const base = hasApiValue ? createEmptyPostingExtraInfo() : clonePostingExtraInfo(fallback);

  for (const field of postingExtraInfoFields) {
    const value = normalizeApiValue(fields[field.apiKey]);
    if (value) {
      base[field.key] = { enabled: true, value };
    }
  }

  return base;
}

export function stripPostingExtraInfoBlock(jobDescription: string | null | undefined) {
  return (jobDescription ?? "").replace(extraInfoBlockPattern, "");
}

function clonePostingExtraInfo(extraInfo: PostingExtraInfo): PostingExtraInfo {
  return Object.fromEntries(
    postingExtraInfoFields.map((field) => [
      field.key,
      {
        enabled: extraInfo[field.key].enabled,
        value: extraInfo[field.key].value,
      },
    ]),
  ) as PostingExtraInfo;
}

function normalizeApiValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPostingExtraInfoHtml(extraInfo: PostingExtraInfo) {
  const rows = postingExtraInfoFields
    .map((field) => {
      const value = extraInfo[field.key].value.trim();
      if (!extraInfo[field.key].enabled || !value) {
        return "";
      }
      return `<p data-init-posting-extra-info-field="${field.key}"><strong>${field.label}</strong>: ${escapeHtml(value)}</p>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows) {
    return "";
  }

  return `<blockquote data-init-posting-extra-info="true"><p><strong>공고 조건</strong></p>${rows}</blockquote>`;
}

function isPostingExtraInfoKey(value: string): value is PostingExtraInfoKey {
  return postingExtraInfoFields.some((field) => field.key === value);
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

function decodeHtml(value: string) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

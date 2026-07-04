import type { StructuredJobSectionKey } from "./structured-job-description";

/**
 * ⚠️ 데모용 목업 초안 생성기 — 실제 AI 호출이 아닙니다.
 *
 * 입력(제목/직무/키워드/핵심 내용)을 템플릿으로 조합해 공고 섹션 초안을 만듭니다.
 * 실제 AI 연동은 백엔드 async 엔드포인트(예: `POST /company/recruitments/jd/generate`,
 * 202 Accepted → task 큐 → worker(OpenAI) → 결과 폴링)가 준비되면
 * `generateMockPostingDraft` 호출부를 그 fetch 로 교체하면 됩니다.
 * (해당 엔드포인트/계약은 백엔드·AI 소유 영역이라 이 파일은 프론트 목업만 담당합니다.)
 */

export type PostingDraftInput = {
  title: string;
  jobRole: string;
  keywords: string;
  summary: string;
};

export type PostingDraftResult = {
  sections: Partial<Record<StructuredJobSectionKey, string>>;
  tags: string[];
};

function splitKeywords(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bulletList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/**
 * 데모용 목업. 실제 AI 아님. 입력을 규칙 기반 템플릿으로 조합할 뿐입니다.
 */
export function generateMockPostingDraft(input: PostingDraftInput): PostingDraftResult {
  const role = input.jobRole.trim() || "해당 포지션";
  const title = input.title.trim() || "이번 채용";
  const keywords = splitKeywords(input.keywords);
  const summary = input.summary.trim();

  const positionDetail = [
    `<p>${escapeHtml(title)} — ${escapeHtml(role)} 포지션입니다.</p>`,
    summary ? `<p>${escapeHtml(summary)}</p>` : "",
    keywords.length > 0 ? `<p>핵심 키워드: ${escapeHtml(keywords.join(", "))}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const responsibilities = bulletList(
    keywords.length > 0
      ? keywords.map((keyword) => `${keyword} 관련 업무를 주도적으로 수행합니다.`)
      : [`${role} 핵심 업무를 수행합니다.`, "팀과 협업하여 제품/서비스를 개선합니다."],
  );

  const requirements = bulletList(
    keywords.length > 0
      ? keywords.map((keyword) => `${keyword}에 대한 실무 경험 또는 이해도`)
      : [`${role} 관련 실무 경험`, "협업과 커뮤니케이션 역량"],
  );

  const preferredQualifications = bulletList([
    keywords.length > 0 ? `${keywords[0]} 도메인 경험` : "관련 도메인 경험",
    "새로운 기술 학습에 적극적인 분",
    "데이터 기반으로 문제를 정의하고 해결한 경험",
  ]);

  const benefits = bulletList([
    "유연한 근무 환경과 성장 지원 제도",
    "동료와 함께 배우는 리뷰·스터디 문화",
    "업무에 몰입할 수 있는 장비와 도구 지원",
  ]);

  const hiringProcess = bulletList(["서류 검토", "직무 인터뷰", "최종 인터뷰", "처우 협의 및 입사"]);

  return {
    sections: {
      positionDetail,
      responsibilities,
      requirements,
      preferredQualifications,
      benefits,
      hiringProcess,
    },
    tags: keywords,
  };
}

import {
  AI_DRAFT_KEYWORD_MAX_COUNT,
  AI_DRAFT_KEYWORD_MAX_LENGTH,
  aiKeywordSuggestionsFor,
  normalizeDraftKeywords,
  splitDraftKeywords,
  toggleDraftKeyword,
} from "./posting-draft-keywords";
import { formatCareerRangeLabel, POSTING_CAREER_MAX_YEARS } from "./posting-filter-taxonomy";

// splitDraftKeywords: 쉼표/줄바꿈 분리 + trim + 빈값 제거
{
  const parsed = splitDraftKeywords(" React ,, Node.js\n TypeScript , ");
  if (parsed.join("|") !== "React|Node.js|TypeScript") {
    throw new Error(`splitDraftKeywords 파싱 실패: ${parsed.join("|")}`);
  }
}

// normalizeDraftKeywords: 10개 초과 → 10개로 절단 (백엔드 계약)
{
  const raw = Array.from({ length: 15 }, (_, index) => `kw${index}`).join(", ");
  const normalized = normalizeDraftKeywords(raw);
  if (normalized.length !== AI_DRAFT_KEYWORD_MAX_COUNT) {
    throw new Error(`키워드 개수 상한 미적용: ${normalized.length}`);
  }
  if (normalized[0] !== "kw0" || normalized[9] !== "kw9") {
    throw new Error("키워드 상한 절단 순서 오류");
  }
}

// normalizeDraftKeywords: 40자 초과 키워드는 40자로 절단
{
  const longKeyword = "가".repeat(50);
  const [normalized] = normalizeDraftKeywords(longKeyword);
  if (normalized.length !== AI_DRAFT_KEYWORD_MAX_LENGTH) {
    throw new Error(`키워드 길이 상한 미적용: ${normalized.length}`);
  }
}

// normalizeDraftKeywords: 중복 제거
{
  const normalized = normalizeDraftKeywords("React, React, Node.js, React");
  if (normalized.join("|") !== "React|Node.js") {
    throw new Error(`중복 제거 실패: ${normalized.join("|")}`);
  }
}

// toggleDraftKeyword: 추가/제거 토글
{
  const added = toggleDraftKeyword("React", "Node.js");
  if (added !== "React, Node.js") {
    throw new Error(`토글 추가 실패: ${added}`);
  }
  const removed = toggleDraftKeyword("React, Node.js", "React");
  if (removed !== "Node.js") {
    throw new Error(`토글 제거 실패: ${removed}`);
  }
}

// toggleDraftKeyword: 10개 상한 도달 시 새 키워드 추가는 무시
{
  const full = Array.from({ length: AI_DRAFT_KEYWORD_MAX_COUNT }, (_, index) => `kw${index}`).join(", ");
  const afterAdd = toggleDraftKeyword(full, "extra");
  if (afterAdd !== full) {
    throw new Error("상한 도달 후 키워드가 추가됨");
  }
  // 이미 선택된 키워드 제거는 상한과 무관하게 동작해야 한다.
  const afterRemove = toggleDraftKeyword(full, "kw0");
  if (splitDraftKeywords(afterRemove).length !== AI_DRAFT_KEYWORD_MAX_COUNT - 1) {
    throw new Error("상한 도달 상태에서 제거 실패");
  }
}

// aiKeywordSuggestionsFor: 직무별 추천 + 공통 키워드 포함
{
  const backend = aiKeywordSuggestionsFor("서버·백엔드");
  if (!backend.includes("Node.js") || !backend.includes("협업")) {
    throw new Error("직무별 추천 + 공통 키워드 병합 실패");
  }
  const unknown = aiKeywordSuggestionsFor("");
  if (!unknown.includes("협업") || unknown.includes("Node.js")) {
    throw new Error("미지정 직무는 공통 키워드만 노출해야 함");
  }
}

// 경력 슬라이더 라벨 경계값 (formatCareerRangeLabel)
{
  const cases: Array<[number, number, string]> = [
    [0, 0, "신입"],
    [0, POSTING_CAREER_MAX_YEARS, "경력무관"],
    [0, 3, "신입~3년"],
    [3, 3, "3년"],
    [2, 7, "2~7년"],
    [2, POSTING_CAREER_MAX_YEARS, `2~${POSTING_CAREER_MAX_YEARS}년 이상`],
  ];
  for (const [min, max, expected] of cases) {
    const label = formatCareerRangeLabel(min, max);
    if (label !== expected) {
      throw new Error(`경력 라벨 오류 (${min},${max}): ${label} !== ${expected}`);
    }
  }
}

console.log("posting-draft-keywords.spec: all assertions passed");

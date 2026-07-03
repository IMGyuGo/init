import {
  composeStructuredJobDescription,
  createStructuredJobDescriptionFromHtml,
  createEmptyStructuredJobDescription,
  extractStructuredJobDescription,
  getStructuredJobDescriptionGallery,
  suggestedPostingTags,
  structuredJobDescriptionToHtml,
} from "./structured-job-description";

const structured = createEmptyStructuredJobDescription();
structured.gallery = [
  { url: "https://cdn.example.com/company/1/culture-1.webp", name: "culture-1.webp" },
  { url: "https://cdn.example.com/company/1/culture-2.webp", name: "culture-2.webp" },
];
structured.sections.positionDetail = "<p>개발자 채용 플랫폼을 만드는 팀입니다.</p>";
structured.sections.responsibilities = "<ul><li>채용 공고 API 설계</li><li>공개 지원 UX 개선</li></ul>";
structured.sections.requirements = "<p><strong>TypeScript</strong> 기반 제품 개발 경험</p>";
structured.sections.benefits = "<p>커피와 스낵바를 제공합니다.</p>";
structured.tags = ["커피", "스낵바", "유연근무"];
structured.locationNote = "서울 강남구 테헤란로";

const html = structuredJobDescriptionToHtml(structured);

if (!html.includes('data-init-structured-job-description="true"')) {
  throw new Error("Structured JD HTML should include the root marker.");
}

if (!html.includes('data-init-structured-section="responsibilities"')) {
  throw new Error("Structured JD HTML should mark each section by key.");
}

if (!html.includes("채용 공고 API 설계") || !html.includes("TypeScript")) {
  throw new Error("Structured JD HTML should preserve rich section content.");
}

if (!html.includes('data-init-structured-tags="true"') || !html.includes("유연근무")) {
  throw new Error("Structured JD HTML should include selected tags.");
}

const parsed = extractStructuredJobDescription(html);

if (!parsed.structured) {
  throw new Error("Structured JD should be parsed from marked HTML.");
}

if (parsed.structured.gallery.length !== 2 || parsed.structured.gallery[0]?.url !== structured.gallery[0]?.url) {
  throw new Error("Structured JD parser should restore gallery images.");
}

const detailGallery = getStructuredJobDescriptionGallery(html);

if (detailGallery.length !== 2 || detailGallery[1]?.name !== "culture-2.webp") {
  throw new Error("Recruitment detail should be able to read structured gallery images.");
}

if (!parsed.structured.sections.requirements.includes("<strong>TypeScript</strong>")) {
  throw new Error("Structured JD parser should preserve rich text section HTML.");
}

if (parsed.structured.tags.join(",") !== "커피,스낵바,유연근무") {
  throw new Error("Structured JD parser should restore tags in order.");
}

if (parsed.structured.locationNote !== "서울 강남구 테헤란로") {
  throw new Error("Structured JD parser should restore location note.");
}

const recomposed = composeStructuredJobDescription(`${html}<p>legacy</p>`, structured);
const markerCount = (recomposed.match(/data-init-structured-job-description="true"/g) ?? []).length;

if (markerCount !== 1 || !recomposed.includes("legacy")) {
  throw new Error("Composing structured JD should replace an existing structured block and preserve fallback content.");
}

const legacy = extractStructuredJobDescription("<p>기존 JD</p>");

if (legacy.structured !== null || legacy.fallbackHtml !== "<p>기존 JD</p>") {
  throw new Error("Unmarked JD HTML should be returned as fallback content.");
}

const legacyDraft = createStructuredJobDescriptionFromHtml("<p>기존 JD</p>");

if (legacyDraft.sections.positionDetail !== "<p>기존 JD</p>") {
  throw new Error("Existing unstructured JD should hydrate into the position detail section.");
}

if (suggestedPostingTags.length !== 0) {
  throw new Error("Posting tag suggestions should stay empty so only manually added tags are shown.");
}

const noSuggestedTags: readonly [] = suggestedPostingTags;
void noSuggestedTags;

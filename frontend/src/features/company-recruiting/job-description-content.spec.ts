import { buildJobDescriptionEditorContent, isRichJobDescription } from "./job-description-content";

const plainText = `담당 업무
- 백엔드 API 개발
- 채용 플랫폼 운영`;

const plainHtml = buildJobDescriptionEditorContent(plainText);

if (!plainHtml.includes("<p>담당 업무</p>") || !plainHtml.includes("<p>- 백엔드 API 개발</p>")) {
  throw new Error("Plain JD text should be converted to editor-safe paragraphs.");
}

const richHtml = `<h2>담당 업무</h2><p><strong>백엔드 API 개발</strong></p>`;

if (!isRichJobDescription(richHtml)) {
  throw new Error("Rich JD HTML should be detected as rich content.");
}

if (buildJobDescriptionEditorContent(richHtml) !== richHtml) {
  throw new Error("Rich JD HTML should be preserved when opening the editor.");
}

const unsafeText = `Spring <NestJS> & PostgreSQL`;
const escapedHtml = buildJobDescriptionEditorContent(unsafeText);

if (!escapedHtml.includes("Spring &lt;NestJS&gt; &amp; PostgreSQL")) {
  throw new Error("Plain JD text should be escaped before rendering as HTML.");
}

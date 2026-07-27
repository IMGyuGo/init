const richContentPattern = /<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|strong|em|a|img|span|br)\b/i;

export function isRichJobDescription(value: string | null | undefined) {
  return Boolean(value && richContentPattern.test(value));
}

export function buildJobDescriptionEditorContent(value: string | null | undefined) {
  const content = value?.trim() ?? "";
  if (!content) {
    return "";
  }
  if (isRichJobDescription(content)) {
    return content;
  }
  return content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

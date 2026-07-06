const ALLOWED_POSTING_DRAFT_TAGS = new Set(["p", "ul", "li", "strong", "br"]);
const BLOCKED_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template"]);
const HTML_TAG_PATTERN = /<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?>/g;

export function sanitizePostingDraftHtml(value: string): string {
  let sanitized = "";
  let cursor = 0;
  let blockedTag: string | null = null;

  for (const match of value.matchAll(HTML_TAG_PATTERN)) {
    const rawTag = match[0];
    const tagName = match[1].toLowerCase();
    const textBeforeTag = value.slice(cursor, match.index);

    if (!blockedTag) {
      sanitized += escapeHtml(textBeforeTag);
    }

    cursor = match.index + rawTag.length;
    const isClosingTag = rawTag.startsWith("</");

    if (blockedTag) {
      if (isClosingTag && tagName === blockedTag) {
        blockedTag = null;
      }
      continue;
    }

    if (BLOCKED_CONTENT_TAGS.has(tagName)) {
      if (!isClosingTag && !rawTag.endsWith("/>")) {
        blockedTag = tagName;
      }
      continue;
    }

    if (!ALLOWED_POSTING_DRAFT_TAGS.has(tagName)) {
      continue;
    }

    if (tagName === "br") {
      sanitized += "<br>";
      continue;
    }

    sanitized += isClosingTag ? `</${tagName}>` : `<${tagName}>`;
  }

  if (!blockedTag) {
    sanitized += escapeHtml(value.slice(cursor));
  }

  return sanitized.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]+|#[0-9]+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

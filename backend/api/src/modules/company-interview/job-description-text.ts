const POSTING_EXTRA_INFO_BLOCK =
  /<blockquote\b[^>]*data-init-posting-extra-info=["']true["'][^>]*>[\s\S]*?<\/blockquote>/gi;
const NON_TEXT_BLOCK = /<(script|style|figure)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const BLOCK_BOUNDARY = /<\/?(?:address|article|aside|blockquote|br|div|dl|dt|dd|figcaption|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;
const HTML_TAG = /<[^>]+>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function toAiJobDescriptionText(value: string | null | undefined): string {
  return decodeHtmlEntities(
    (value ?? "")
      .replace(POSTING_EXTRA_INFO_BLOCK, "\n")
      .replace(NON_TEXT_BLOCK, "\n")
      .replace(HTML_COMMENT, "\n")
      .replace(BLOCK_BOUNDARY, "\n")
      .replace(HTML_TAG, " "),
  )
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (entity, codePoint: string) => decodeCodePoint(entity, Number.parseInt(codePoint, 16)))
    .replace(/&#(\d+);/g, (entity, codePoint: string) => decodeCodePoint(entity, Number.parseInt(codePoint, 10)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
}

function decodeCodePoint(entity: string, codePoint: number): string {
  try {
    return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
  } catch {
    return entity;
  }
}

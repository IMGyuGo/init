import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePostingDraftHtml } from "./posting-draft-html";

test("sanitizePostingDraftHtml keeps only allowed tags without attributes", () => {
  const sanitized = sanitizePostingDraftHtml(
    '<p onclick="alert(1)">NestJS API 개발<img src=x onerror="alert(1)"></p><script>alert(1)</script><strong data-x="1">TypeScript</strong><br style="clear:both">'
  );

  assert.equal(sanitized, "<p>NestJS API 개발</p><strong>TypeScript</strong><br>");
  assert.equal(sanitized.includes("onclick"), false);
  assert.equal(sanitized.includes("onerror"), false);
  assert.equal(sanitized.includes("<script"), false);
  assert.equal(sanitized.includes("<img"), false);
});

test("sanitizePostingDraftHtml escapes text outside the allowed tag set", () => {
  const sanitized = sanitizePostingDraftHtml('<a href="javascript:alert(1)">채용</a><svg><script>alert(1)</script></svg><p>R&D</p>');

  assert.equal(sanitized, "채용<p>R&amp;D</p>");
  assert.equal(sanitized.includes("javascript:"), false);
  assert.equal(sanitized.includes("<svg"), false);
});

test("sanitizePostingDraftHtml does not double escape existing entities", () => {
  assert.equal(sanitizePostingDraftHtml("<p>R&amp;D</p>"), "<p>R&amp;D</p>");
});

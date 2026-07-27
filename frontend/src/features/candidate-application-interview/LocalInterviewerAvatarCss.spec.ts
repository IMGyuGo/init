import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "CandidatePages.module.css"), "utf8");
const mouthWindowRule = css.match(
  /:global\(\.local-interviewer-avatar__mouth-window\)\s*\{([^}]+)\}/,
)?.[1];
const mouthRule = css.match(/:global\(\.local-interviewer-avatar__mouth\)\s*\{([^}]+)\}/)?.[1];
const mouthUnderlayRule = css.match(
  /:global\(\.local-interviewer-avatar__mouth-underlay\)\s*\{([^}]+)\}/,
)?.[1];

assert.ok(mouthWindowRule);
assert.ok(mouthRule);
assert.ok(mouthUnderlayRule);

assert.match(css, /:global\(\.local-interviewer-avatar\)\s*\{[\s\S]*?aspect-ratio:\s*1086 \/ 1448;/);
assert.match(mouthWindowRule, /left:\s*39\.594843%;/);
assert.match(mouthWindowRule, /top:\s*36\.947514%;/);
assert.match(mouthWindowRule, /width:\s*21\.178637%;/);
assert.match(mouthWindowRule, /height:\s*7\.251381%;/);
assert.match(mouthWindowRule, /overflow:\s*hidden;/);
assert.match(mouthRule, /inset:\s*0;/);
assert.match(mouthUnderlayRule, /inset:\s*0;/);
assert.match(mouthRule, /opacity:\s*0;/);
assert.match(mouthUnderlayRule, /opacity:\s*0;/);
assert.match(
  mouthRule,
  /transform:\s*translate3d\(var\(--mouth-register-x\),\s*var\(--mouth-register-y\),\s*0\);/,
);
assert.match(
  css,
  /:global\(\.local-interviewer-avatar__mouth-underlay\[data-visible="true"\]\),\s*:global\(\.local-interviewer-avatar__mouth\[data-active="true"\]\)\s*\{\s*opacity:\s*1;\s*\}/,
);
assert.doesNotMatch(css, /clip-path:\s*inset\(35% 30% 51% 30%\)/);
assert.doesNotMatch(css, /local-avatar-mouth/);
assert.doesNotMatch(mouthRule, /\btransition(?:-[a-z-]+)?\s*:/);
assert.doesNotMatch(mouthUnderlayRule, /\btransition(?:-[a-z-]+)?\s*:/);

assert.match(css, /:global\(\.local-interviewer-avatar\[data-state="talking"\]\)\s*\{\s*animation: local-avatar-talking/);
assert.match(css, /:global\(\.local-interviewer-avatar\[data-state="listening"\]\)\s*\{\s*animation: local-avatar-listening/);
assert.match(css, /:global\(\.local-interviewer-avatar\[data-state="thinking"\]\)\s*\{\s*animation: local-avatar-thinking/);
assert.doesNotMatch(css, /data-state="(?:talking|listening|thinking)"[^\n]*local-interviewer-avatar__posture/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;/);
assert.match(css, /data-reduced-motion="true"[\s\S]*?animation: none !important;/);

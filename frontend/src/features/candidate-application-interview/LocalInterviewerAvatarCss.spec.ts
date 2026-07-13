import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "CandidatePages.module.css"), "utf8");

assert.match(css, /:global\(\.local-interviewer-avatar\[data-state="talking"\]\)\s*\{\s*animation: local-avatar-talking/);
assert.match(css, /:global\(\.local-interviewer-avatar\[data-state="listening"\]\)\s*\{\s*animation: local-avatar-listening/);
assert.match(css, /:global\(\.local-interviewer-avatar\[data-state="thinking"\]\)\s*\{\s*animation: local-avatar-thinking/);
assert.doesNotMatch(css, /data-state="(?:talking|listening|thinking)"[^\n]*local-interviewer-avatar__posture/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;/);
assert.match(css, /data-reduced-motion="true"[\s\S]*?animation: none !important;/);

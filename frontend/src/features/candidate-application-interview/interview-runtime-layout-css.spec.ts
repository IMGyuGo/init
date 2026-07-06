import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/features/candidate-application-interview/CandidatePages.module.css"), "utf8");

const baseStageRule = css.match(
  /:global\(\.ai-interviewer-stage\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(baseStageRule?.groups?.body, "base interview stage CSS rule should exist");
assert.match(
  baseStageRule.groups.body,
  /aspect-ratio:\s*16\s*\/\s*9;/,
  "compact interview stage should keep a 16:9 frame instead of stretching to a full-height panel",
);

const candidatePrimaryCameraPanelRule = css.match(
  /:global\(\.ai-interviewer-stage--candidate-primary \.candidate-camera-pip\)\s*\{(?<body>[^}]*)\}/,
);

assert.ok(candidatePrimaryCameraPanelRule?.groups?.body, "candidate primary camera panel CSS rule should exist");
assert.match(
  candidatePrimaryCameraPanelRule.groups.body,
  /grid-template-rows:\s*1fr;/,
  "candidate primary camera panel should let the video fill the full stage instead of the base 38px header row",
);

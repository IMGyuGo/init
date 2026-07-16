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

const interviewerFigureRule = css.match(
  /:global\(\.ai-interviewer-figure\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(interviewerFigureRule?.groups?.body, "interviewer figure CSS rule should exist");
assert.match(
  interviewerFigureRule.groups.body,
  /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/,
  "the avatar should shrink inside the stage instead of overlapping the question panel",
);
assert.match(
  interviewerFigureRule.groups.body,
  /min-height:\s*0;/,
  "the interviewer figure should be allowed to shrink inside the stage grid",
);

assert.match(
  css,
  /@media \(max-width:\s*760px\)[\s\S]*?:global\(\.ai-interviewer-stage\)\s*\{[\s\S]*?aspect-ratio:\s*auto;/,
  "mobile interview stage should grow with its content instead of clipping into a 16:9 frame",
);
assert.match(
  css,
  /@media \(max-width:\s*760px\)[\s\S]*?:global\(\.runtime-status-hud\)\s*\{[\s\S]*?position:\s*static;/,
  "mobile runtime status should participate in layout instead of overlapping the question",
);
assert.match(
  css,
  /@media \(max-width:\s*760px\)[\s\S]*?:global\(\.candidate-camera-pip\)\s*\{[\s\S]*?position:\s*relative;/,
  "mobile camera preview should participate in layout instead of covering the question",
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

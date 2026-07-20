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
  /flex:\s*1\s+1\s+auto;/,
  "the interview stage should stretch to fill the viewport column so bottom controls stay visible",
);
assert.doesNotMatch(
  baseStageRule.groups.body,
  /aspect-ratio:/,
  "a fixed stage aspect ratio pushes the control bar below the fold on shorter screens",
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

const fullscreenInterviewerFigureRule = css.match(
  /:global\(\.ai-interviewer-stage:fullscreen \.ai-interviewer-figure\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(fullscreenInterviewerFigureRule?.groups?.body, "fullscreen interviewer figure CSS rule should exist");
assert.match(fullscreenInterviewerFigureRule.groups.body, /grid-template-rows:\s*auto\s+auto;/);
assert.match(fullscreenInterviewerFigureRule.groups.body, /align-self:\s*center;/);
assert.match(fullscreenInterviewerFigureRule.groups.body, /height:\s*auto;/);

const fullscreenInterviewerAvatarRule = css.match(
  /:global\(\.ai-interviewer-stage:fullscreen \.ai-interviewer-figure > \.local-interviewer-avatar\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(fullscreenInterviewerAvatarRule?.groups?.body, "fullscreen interviewer avatar CSS rule should exist");
assert.match(fullscreenInterviewerAvatarRule.groups.body, /width:\s*min\(400px,\s*46vh\);/);
assert.match(fullscreenInterviewerAvatarRule.groups.body, /height:\s*auto;/);

const interviewerAvatarRule = css.match(
  /:global\(\.ai-interviewer-figure > \.local-interviewer-avatar\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(interviewerAvatarRule?.groups?.body, "interviewer avatar CSS rule should exist");
assert.match(
  interviewerAvatarRule.groups.body,
  /max-height:\s*520px;/,
  "the interviewer avatar should use the enlarged desktop presentation size",
);

const reservedInfoFigureRule = css.match(
  /:global\(\.ai-interviewer-stage--reserved-info-gap \.ai-interviewer-figure\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(reservedInfoFigureRule?.groups?.body, "reserved info figure CSS rule should exist");
assert.match(
  reservedInfoFigureRule.groups.body,
  /margin-bottom:\s*20px;/,
  "the left-side info panel should no longer reserve the avatar's vertical presentation space",
);

const interviewerNameRule = css.match(
  /:global\(\.ai-interviewer-copy h1\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(interviewerNameRule?.groups?.body, "interviewer name CSS rule should exist");
assert.match(
  interviewerNameRule.groups.body,
  /font-size:\s*18px;/,
  "the interviewer name should leave more room for the avatar",
);

const interviewerInfoButtonRule = css.match(
  /:global\(\.ai-interviewer-info-button\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(interviewerInfoButtonRule?.groups?.body, "interviewer info button CSS rule should exist");
assert.match(interviewerInfoButtonRule.groups.body, /width:\s*24px;/);
assert.match(interviewerInfoButtonRule.groups.body, /height:\s*24px;/);

const interviewerInfoPanelRule = css.match(
  /:global\(\.ai-interviewer-info-panel\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(interviewerInfoPanelRule?.groups?.body, "interviewer info panel CSS rule should exist");
assert.match(interviewerInfoPanelRule.groups.body, /left:\s*24px;/);
assert.match(interviewerInfoPanelRule.groups.body, /bottom:\s*84px;/);
assert.match(interviewerInfoPanelRule.groups.body, /transform:\s*none;/);

const interviewerStatusRule = css.match(
  /:global\(\.ai-interviewer-session-chip\)\s*\{(?<body>[^}]*)\}/,
);
assert.ok(interviewerStatusRule?.groups?.body, "interviewer status CSS rule should exist");
assert.match(interviewerStatusRule.groups.body, /min-height:\s*22px;/);
assert.match(interviewerStatusRule.groups.body, /font-size:\s*11px;/);

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
assert.match(
  css,
  /@media \(max-width:\s*760px\)[\s\S]*?:global\(\.ai-interviewer-figure > \.local-interviewer-avatar\)\s*\{[\s\S]*?width:\s*min\(230px,\s*68vw\);/,
  "mobile should keep the enlarged interviewer inside the viewport",
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

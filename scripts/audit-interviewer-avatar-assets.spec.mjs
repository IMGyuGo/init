import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let auditInterviewerAvatarAssets;
try {
  ({ auditInterviewerAvatarAssets } = await import("./audit-interviewer-avatar-assets.mjs"));
} catch (error) {
  assert.fail(`avatar asset audit module must exist: ${error instanceof Error ? error.message : String(error)}`);
}

const audit = await auditInterviewerAvatarAssets(
  resolve(projectRoot, "frontend/public/assets/interviewer-avatar"),
);

assert.equal(audit.pose.count, 3);
assert.equal(audit.pose.bytes, 4_332_324);
assert.equal(audit.fullMouth.count, 6);
assert.equal(audit.fullMouth.bytes, 8_785_995);
assert.equal(audit.mouthSprite.count, 9);
assert.equal(audit.currentPackBytes, 13_118_319);
assert.ok(audit.spriteCandidatePackBytes > audit.pose.bytes);
assert.ok(audit.spriteCandidatePackBytes < audit.currentPackBytes);
assert.ok(audit.spriteCandidateSavingsBytes > 0);
assert.ok(audit.spriteCandidateSavingsPercent > 0);

assert.deepEqual(audit.pose.dimensions, [{ width: 1086, height: 1448 }]);
assert.deepEqual(audit.fullMouth.dimensions, [{ width: 1086, height: 1448 }]);
assert.deepEqual(audit.mouthSprite.dimensions, [{ width: 230, height: 105 }]);
const expectedMouthSpritePaths = [
  "mouth-sprite/closed.png",
  "mouth-sprite/open-small.png",
  "mouth-sprite/open.png",
  "mouth-sprite/rest.png",
  "mouth-sprite/round-small.png",
  "mouth-sprite/round.png",
  "mouth-sprite/teeth.png",
  "mouth-sprite/wide-small.png",
  "mouth-sprite/wide.png",
].sort((left, right) => left.localeCompare(right));
assert.deepEqual(
  audit.mouthSprite.files.map((file) => file.path),
  expectedMouthSpritePaths,
);
assert.ok(audit.mouthSprite.files.every((file) => file.bytes > 0));
assert.ok(audit.mouthSprite.files.every((file) => file.hasAlpha === true));
assert.deepEqual(
  audit.mouthSpriteRegistration.pairs.map((pair) => pair.names),
  [
    ["open-small", "open"],
    ["wide-small", "wide"],
    ["round-small", "round"],
  ],
);
for (const pair of audit.mouthSpriteRegistration.pairs) {
  assert.ok(pair.rawDeltaY >= 12, `${pair.names.join("/")} must reproduce the source regression`);
  assert.ok(Math.abs(pair.registeredDeltaY) <= 3, `${pair.names.join("/")} y anchor must align`);
  assert.ok(Math.abs(pair.registeredDeltaX) <= 3, `${pair.names.join("/")} x anchor must align`);
}
assert.deepEqual(
  audit.duplicateGroups.map((group) => group.paths),
  [
    ["listening.png", "mouth/closed.png", "mouth/rest.png"],
    ["mouth-sprite/closed.png", "mouth-sprite/rest.png"],
    ["mouth/open.png", "talking.png"],
  ],
);

const frontendPackage = JSON.parse(
  await readFile(resolve(projectRoot, "frontend/package.json"), "utf8"),
);

assert.equal(frontendPackage.scripts["audit:avatar-assets"], "node ../scripts/audit-interviewer-avatar-assets.mjs");
assert.match(frontendPackage.scripts["test:candidate-avatar"], /InterviewerRiggingPreview\.spec\.tsx/);
assert.match(frontendPackage.scripts["test:candidate-avatar"], /audit-interviewer-avatar-assets\.spec\.mjs/);
assert.doesNotMatch(frontendPackage.scripts["test:candidate-avatar"], /Cubism|cubism|coherent-mouth/);
assert.equal(frontendPackage.devDependencies.tsx, "4.22.4");

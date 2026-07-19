import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let auditCubismMouthRig;
try {
  ({ auditCubismMouthRig } = await import("./audit-cubism-mouth-rig.mjs"));
} catch (error) {
  assert.fail(`Cubism mouth rig audit module must exist: ${error instanceof Error ? error.message : String(error)}`);
}

const result = await auditCubismMouthRig({
  manifestPath: resolve(projectRoot, "assets/interviewer-rigging/existing-look-cubism-v5/manifest.json"),
  model3JsonPath: resolve(
    projectRoot,
    "assets/interviewer-rigging/cubism-proof-archive/v5-layered-mouth-proof/interviewer-v5-layered-mouth-proof.model3.json",
  ),
  coreScriptPath: resolve(projectRoot, "assets/interviewer-rigging/cubism-proof-archive/sdk/live2dcubismcore.min.js"),
});

assert.equal(result.parameter.id, "ParamMouthOpenY");
assert.equal(result.parameter.index >= 0, true);
assert.deepEqual(result.parameter.range, [0, 1]);
assert.deepEqual(result.drawables.MouthUpperLip.opacity, [1, 1]);
assert.deepEqual(result.drawables.MouthLowerLip.opacity, [1, 1]);
assert.equal(Array.isArray(result.drawables.MouthUpperLip.centerY), true);
assert.equal(Array.isArray(result.drawables.MouthLowerLip.centerY), true);
assert.equal(Array.isArray(result.drawables.MouthUpperLip.centerX), true);
assert.equal(Array.isArray(result.drawables.MouthLowerLip.centerX), true);
assert.equal(result.drawables.MouthUpperLip.centerY.every(Number.isFinite), true);
assert.equal(result.drawables.MouthLowerLip.centerY.every(Number.isFinite), true);
assert.equal(result.drawables.MouthUpperLip.centerX.every(Number.isFinite), true);
assert.equal(result.drawables.MouthLowerLip.centerX.every(Number.isFinite), true);
assert.notEqual(result.drawables.MouthUpperLip.centerY[0], result.drawables.MouthUpperLip.centerY[1]);
assert.notEqual(result.drawables.MouthLowerLip.centerY[0], result.drawables.MouthLowerLip.centerY[1]);
assert.ok(Math.abs(result.drawables.MouthUpperLip.centerX[0] - result.drawables.MouthUpperLip.centerX[1]) <= 0.001953);
assert.ok(Math.abs(result.drawables.MouthLowerLip.centerX[0] - result.drawables.MouthLowerLip.centerX[1]) <= 0.001953);
assert.ok(result.drawables.MouthUpperTeeth.maskIds.includes(result.drawables.MouthInterior.id));
assert.ok(result.drawables.MouthTongue.maskIds.includes(result.drawables.MouthInterior.id));
assert.deepEqual(result.parameterBindings.deformers, [
  "mouth-upper-lip-deform",
  "mouth-lower-lip-deform",
  "mouth-interior-deform",
]);
assert.equal(result.drawables.MouthUpperLip.textureUvBounds.every(Number.isFinite), true);

const v6Result = await auditCubismMouthRig({
  manifestPath: resolve(projectRoot, "assets/interviewer-rigging/existing-look-cubism-v6/manifest.json"),
  model3JsonPath: resolve(
    projectRoot,
    "assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.model3.json",
  ),
  coreScriptPath: resolve(projectRoot, "assets/interviewer-rigging/cubism-proof-archive/sdk/live2dcubismcore.min.js"),
});

for (const name of ["MouthUpperLip", "MouthLowerLip", "MouthInterior"]) {
  assert.ok(Math.abs(v6Result.drawables[name].centerX[0] - v6Result.drawables[name].centerX[1]) <= 0.001953);
  assert.ok(v6Result.drawables[name].width[1] / v6Result.drawables[name].width[0] >= 0.95);
  assert.ok(v6Result.drawables[name].width[1] / v6Result.drawables[name].width[0] <= 1.05);
  assert.ok(v6Result.drawables[name].height[1] / v6Result.drawables[name].height[0] >= 0.95);
  assert.ok(v6Result.drawables[name].height[1] / v6Result.drawables[name].height[0] <= 1.08);
}
assert.deepEqual(v6Result.drawables.MouthUpperLip.opacity, [1, 1]);
assert.deepEqual(v6Result.drawables.MouthLowerLip.opacity, [1, 1]);
assert.ok(v6Result.drawables.MouthUpperTeeth.maskIds.includes(v6Result.drawables.MouthInterior.id));
assert.ok(v6Result.drawables.MouthTongue.maskIds.includes(v6Result.drawables.MouthInterior.id));
assert.deepEqual(v6Result.parameterBindings.deformers, [
  "mouth-upper-lip-deform",
  "mouth-lower-lip-deform",
  "mouth-interior-deform",
]);

const frontendPackage = JSON.parse(await readFile(resolve(projectRoot, "frontend/package.json"), "utf8"));
assert.doesNotMatch(frontendPackage.scripts["test:candidate-avatar"], /Cubism|cubism/);

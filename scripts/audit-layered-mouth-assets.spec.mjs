import { strict as assert } from "node:assert";
import { resolve } from "node:path";

let auditLayeredMouthAssets;
try {
  ({ auditLayeredMouthAssets } = await import("./audit-layered-mouth-assets.mjs"));
} catch (error) {
  assert.fail(`layered mouth audit module must exist: ${error instanceof Error ? error.message : String(error)}`);
}

const audit = await auditLayeredMouthAssets(resolve(
  "assets/interviewer-rigging/existing-look-cubism-v5/manifest.json",
));

assert.deepEqual(audit.canvas, { width: 1024, height: 1536 });
assert.deepEqual(audit.layerNames, [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
]);
assert.ok(audit.layers.every((layer) => layer.width === 1024 && layer.height === 1536));
assert.ok(audit.layers.every((layer) => layer.colorType === 6));
assert.ok(audit.layers.every((layer) => layer.nonTransparent));
assert.equal(new Set(audit.layers.map((layer) => layer.sha256)).size, audit.layers.length);

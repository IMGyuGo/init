import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  layerTransformFor,
  uvBoundsToTextureRect,
  verifyV6TextureRepack,
} from "./build-cubism-v6-export.mjs";


test("unit: converts Cubism UV bounds into flipped texture coordinates", () => {
  assert.deepEqual(
    uvBoundsToTextureRect([0.385635, 0.087267, 0.535111, 0.311334], 2048),
    { left: 789, top: 1410, right: 1096, bottom: 1870, width: 307, height: 460 },
  );
});

test("unit: rotates only the upper-teeth full-canvas layer", () => {
  assert.deepEqual(layerTransformFor("MouthUpperTeeth"), { rotate: 90 });
  assert.deepEqual(layerTransformFor("MouthInterior"), { rotate: 0 });
  assert.deepEqual(layerTransformFor("MouthUpperLip"), { rotate: 0 });
});

test("production: exported V6 texture slots match the coherent layers", async () => {
  const result = await verifyV6TextureRepack();
  assert.equal(result.textureSize, 2048);
  assert.equal(result.verified.length, 6);
  assert.ok(result.verified.includes("MouthUpperTeeth"));
});

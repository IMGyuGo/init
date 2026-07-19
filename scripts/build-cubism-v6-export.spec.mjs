import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  layerTransformFor,
  uvBoundsToTextureRect,
  verifyV6TextureRepack,
} from "./build-cubism-v6-export.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

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

test("production: V6 base keeps the natural closed mouth without baked semantic layers", async () => {
  const [exportedBase, naturalMaster, coherentOpenMouth] = await Promise.all([
    readFile(resolve(
      REPOSITORY_ROOT,
      "assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof-base.png",
    )),
    readFile(resolve(REPOSITORY_ROOT, "assets/interviewer-rigging/existing-look/normalized/master.png")),
    readFile(resolve(
      REPOSITORY_ROOT,
      "assets/interviewer-rigging/existing-look-cubism-v6/sources/mouth-open-coherent.png",
    )),
  ]);

  assert.deepEqual(exportedBase, naturalMaster);
  assert.notDeepEqual(exportedBase, coherentOpenMouth);
});

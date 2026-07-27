import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as cubismSdkRuntime from "./CubismSdkRuntime";

const resolveCrossfade = (cubismSdkRuntime as Record<string, unknown>).resolveCubismMouthOpacityCrossfade;

assert.equal(typeof resolveCrossfade, "function");

if (typeof resolveCrossfade === "function") {
  assert.deepEqual(resolveCrossfade(0), {
    parameterId: "ParamMouthOpenY",
    controlType: "opacity-crossfade",
    deformationType: "reference-opacity-crossfade",
    layers: {
      "mouth-rest": 1,
      "mouth-open-reference": 0,
    },
  });

  assert.deepEqual(resolveCrossfade(0.5).layers, {
    "mouth-rest": 0.5,
    "mouth-open-reference": 0.5,
  });

  assert.deepEqual(resolveCrossfade(1).layers, {
    "mouth-rest": 0,
    "mouth-open-reference": 1,
  });

  assert.deepEqual(resolveCrossfade(-0.25).layers, resolveCrossfade(0).layers);
  assert.deepEqual(resolveCrossfade(1.25).layers, resolveCrossfade(1).layers);
}

const manifestPath = join(
  process.cwd(),
  "..",
  "assets",
  "interviewer-rigging",
  "existing-look-cubism-v3",
  "manifest.json",
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  mouthOpenParameter?: {
    id?: string;
    controlType?: string;
    deformationType?: string;
    layers?: Record<string, unknown>;
  };
};

assert.equal(manifest.mouthOpenParameter?.id, "ParamMouthOpenY");
assert.equal(manifest.mouthOpenParameter?.controlType, "opacity-crossfade");
assert.equal(manifest.mouthOpenParameter?.deformationType, "reference-opacity-crossfade");
assert.deepEqual(manifest.mouthOpenParameter?.layers, {
  "mouth-rest": { opacityAt0: 1, opacityAt1: 0 },
  "mouth-open-reference": { opacityAt0: 0, opacityAt1: 1 },
});

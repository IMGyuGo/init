import { strict as assert } from "node:assert";
import {
  CUBISM_PROOF_MODEL_URL,
  getCubismMouthLayerVisibility,
  getCubismMouthOpenValue,
  getCubismRuntimeAvailability,
  resolveCubismProofModelReferences,
} from "./CubismSdkRuntime";

assert.deepEqual(
  getCubismRuntimeAvailability({ hasWebGl: false, hasCore: false, hasModel: false }),
  { kind: "fallback", reason: "webgl-unavailable" },
);

assert.deepEqual(
  getCubismRuntimeAvailability({ hasWebGl: true, hasCore: false, hasModel: false }),
  { kind: "fallback", reason: "core-unavailable" },
);

assert.deepEqual(
  getCubismRuntimeAvailability({ hasWebGl: true, hasCore: true, hasModel: false }),
  { kind: "waiting-model" },
);

assert.deepEqual(
  getCubismRuntimeAvailability({ hasWebGl: true, hasCore: true, hasModel: true }),
  { kind: "ready" },
);

assert.equal(
  CUBISM_PROOF_MODEL_URL,
  "/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.model3.json",
);

assert.deepEqual(
  resolveCubismProofModelReferences(CUBISM_PROOF_MODEL_URL, {
    Version: 3,
    FileReferences: {
      Moc: "interviewer-v6-coherent-mouth-proof.moc3",
      Textures: ["interviewer-v6-coherent-mouth-proof.2048/texture_00.png"],
    },
  }),
  {
    mocUrl: "/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.moc3",
    textureUrls: [
      "/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.2048/texture_00.png",
    ],
  },
);

assert.throws(
  () => resolveCubismProofModelReferences(CUBISM_PROOF_MODEL_URL, {
    Version: 3,
    FileReferences: {
      Moc: "../../outside.moc3",
      Textures: ["interviewer-v6-coherent-mouth-proof.2048/texture_00.png"],
    },
  }),
  /must stay inside the model directory/,
);

assert.equal(getCubismMouthOpenValue("rest"), 0);
assert.equal(getCubismMouthOpenValue("closed"), 0.08);
assert.equal(getCubismMouthOpenValue("teeth"), 0.45);
assert.equal(getCubismMouthOpenValue("round"), 0.6);
assert.equal(getCubismMouthOpenValue("open"), 0.78);
assert.equal(getCubismMouthOpenValue("wide"), 1);

assert.deepEqual(getCubismMouthLayerVisibility(0), {
  interior: 0,
  tongue: 0,
  upperTeeth: 0,
});
assert.deepEqual(getCubismMouthLayerVisibility(1), {
  interior: 1,
  tongue: 1,
  upperTeeth: 1,
});
assert.equal(getCubismMouthLayerVisibility(0.55).interior, 1);
assert.equal(getCubismMouthLayerVisibility(0.55).upperTeeth, 0);

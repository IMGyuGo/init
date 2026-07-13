import { strict as assert } from "node:assert";
import { getCubismRuntimeAvailability } from "./CubismSdkRuntime";

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

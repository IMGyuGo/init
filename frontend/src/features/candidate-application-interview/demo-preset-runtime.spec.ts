import { strict as assert } from "node:assert";

import {
  DEMO_PRESET_TOTAL_QUESTIONS,
  getRecruitingRuntimeTotalQuestions,
} from "./demo-preset-runtime";

assert.equal(DEMO_PRESET_TOTAL_QUESTIONS, 3);
assert.equal(getRecruitingRuntimeTotalQuestions("DEMO_PRESET", 2), 3);
assert.equal(getRecruitingRuntimeTotalQuestions("DEMO_PRESET", 3), 3);
assert.equal(getRecruitingRuntimeTotalQuestions("DEMO_PRESET", 4), 4);
assert.equal(getRecruitingRuntimeTotalQuestions("STANDARD", 2), 2);
assert.equal(getRecruitingRuntimeTotalQuestions(undefined, 2), 2);

console.log("demo-preset-runtime.spec: all assertions passed");

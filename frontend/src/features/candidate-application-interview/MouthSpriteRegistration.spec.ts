import { strict as assert } from "node:assert";
import {
  getMouthSpriteRegistration,
  getMouthSpriteRegistrationCss,
} from "./MouthSpriteRegistration";

assert.deepEqual(getMouthSpriteRegistration("open-small"), { x: 0, y: -14 });
assert.deepEqual(getMouthSpriteRegistration("wide-small"), { x: 0, y: -12 });
assert.deepEqual(getMouthSpriteRegistration("round-small"), { x: 0, y: -13 });
assert.deepEqual(getMouthSpriteRegistration("open"), { x: 0, y: 0 });
assert.deepEqual(getMouthSpriteRegistrationCss("open-small"), {
  x: "0%",
  y: "-13.333333%",
});

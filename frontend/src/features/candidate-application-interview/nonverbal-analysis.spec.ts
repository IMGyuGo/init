import { strict as assert } from "node:assert";
import { normalizeGazeTimelineOffset } from "./nonverbal-analysis";

assert.equal(normalizeGazeTimelineOffset(-1.252), -1);
assert.equal(normalizeGazeTimelineOffset(1.252), 1);
assert.equal(normalizeGazeTimelineOffset(-1), -1);
assert.equal(normalizeGazeTimelineOffset(0), 0);
assert.equal(normalizeGazeTimelineOffset(1), 1);
assert.equal(normalizeGazeTimelineOffset(Number.NaN), undefined);
assert.equal(normalizeGazeTimelineOffset(Number.POSITIVE_INFINITY), undefined);
assert.equal(normalizeGazeTimelineOffset(Number.NEGATIVE_INFINITY), undefined);

import { strict as assert } from "node:assert";
import {
  clearLipSyncTuningSettings,
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
  LIP_SYNC_TUNING_CHANGE_EVENT,
  LIP_SYNC_TUNING_STORAGE_KEY,
  normalizeLipSyncTuningSettings,
  readLipSyncTuningSettings,
  resetLipSyncTuningSettings,
  saveLipSyncTuningSettings,
  writeLipSyncTuningSettings,
} from "./LipSyncTuning";

function createMemoryStorage(initialValue?: string) {
  const values = new Map<string, string>();
  if (initialValue !== undefined) values.set(LIP_SYNC_TUNING_STORAGE_KEY, initialValue);
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

assert.deepEqual(normalizeLipSyncTuningSettings(undefined), DEFAULT_LIP_SYNC_TUNING_SETTINGS);
assert.deepEqual(
  normalizeLipSyncTuningSettings({
    timelineOffsetMs: 999,
    minimumShapeHoldMs: 71,
    silenceHangoverMs: -3,
    fullOpenEnterThreshold: 0.5,
    fullOpenExitThreshold: 0.6,
  }),
  {
    timelineOffsetMs: 200,
    minimumShapeHoldMs: 70,
    silenceHangoverMs: 0,
    fullOpenEnterThreshold: 0.5,
    fullOpenExitThreshold: 0.45,
  },
);
assert.deepEqual(
  normalizeLipSyncTuningSettings({
    timelineOffsetMs: Number.NaN,
    minimumShapeHoldMs: Number.POSITIVE_INFINITY,
    fullOpenEnterThreshold: Number.NaN,
  }),
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
);
assert.deepEqual(
  normalizeLipSyncTuningSettings({
    timelineOffsetMs: "100" as unknown as number,
  }),
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
);

const storage = createMemoryStorage();
assert.deepEqual(readLipSyncTuningSettings(storage), DEFAULT_LIP_SYNC_TUNING_SETTINGS);
const customSettings = normalizeLipSyncTuningSettings({
  timelineOffsetMs: -80,
  minimumShapeHoldMs: 110,
  silenceHangoverMs: 90,
  fullOpenEnterThreshold: 0.66,
  fullOpenExitThreshold: 0.48,
});
assert.deepEqual(writeLipSyncTuningSettings(storage, customSettings), customSettings);
assert.deepEqual(readLipSyncTuningSettings(storage), customSettings);
assert.deepEqual(resetLipSyncTuningSettings(storage), DEFAULT_LIP_SYNC_TUNING_SETTINGS);
assert.deepEqual(readLipSyncTuningSettings(storage), DEFAULT_LIP_SYNC_TUNING_SETTINGS);

assert.deepEqual(
  readLipSyncTuningSettings(createMemoryStorage("not-json")),
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
);
assert.deepEqual(
  readLipSyncTuningSettings(createMemoryStorage(JSON.stringify({ version: 2, settings: customSettings }))),
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
);

const eventTarget = new EventTarget();
let changeEventCount = 0;
eventTarget.addEventListener(LIP_SYNC_TUNING_CHANGE_EVENT, () => {
  changeEventCount += 1;
});
assert.deepEqual(saveLipSyncTuningSettings(customSettings, storage, eventTarget), customSettings);
assert.equal(changeEventCount, 1);
assert.deepEqual(readLipSyncTuningSettings(storage), customSettings);
assert.deepEqual(clearLipSyncTuningSettings(storage, eventTarget), DEFAULT_LIP_SYNC_TUNING_SETTINGS);
assert.equal(changeEventCount, 2);
assert.deepEqual(readLipSyncTuningSettings(storage), DEFAULT_LIP_SYNC_TUNING_SETTINGS);


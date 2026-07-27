import assert from "node:assert/strict";
import {
  buildInterviewCameraConstraints,
  buildInterviewMediaRecorderOptions,
  INTERVIEW_RECORDING_PROFILE,
} from "./view-model";

assert.deepEqual(INTERVIEW_RECORDING_PROFILE, {
  width: 1280,
  height: 720,
  frameRate: 15,
  videoBitsPerSecond: 800_000,
  audioBitsPerSecond: 48_000,
});

assert.deepEqual(buildInterviewCameraConstraints("camera-1"), {
  deviceId: { ideal: "camera-1" },
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 15, max: 15 },
});

assert.deepEqual(buildInterviewCameraConstraints(), {
  facingMode: "user",
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 15, max: 15 },
});

assert.deepEqual(buildInterviewMediaRecorderOptions("video/webm;codecs=vp9,opus"), {
  mimeType: "video/webm;codecs=vp9,opus",
  videoBitsPerSecond: 800_000,
  audioBitsPerSecond: 48_000,
});

assert.deepEqual(buildInterviewMediaRecorderOptions(), {
  videoBitsPerSecond: 800_000,
  audioBitsPerSecond: 48_000,
});

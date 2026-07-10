import type {
  InterviewAnswerNonverbalMetadata,
  InterviewIntegrityEvent,
  InterviewIntegrityEventType,
  InterviewIntegritySummary,
  InterviewIntegritySuspicionLevel,
} from "../interview.runtime.types";

export const INTERVIEW_NONVERBAL_METADATA_MAX_BYTES = 32 * 1024;
export const INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS = 100;

const MAX_COUNTER_VALUE = 1_000_000;
const MAX_EVENT_DURATION_MS = 60 * 60 * 1000;
const MAX_VOICE_PEAK_LEVEL = 100;

const EVENT_TYPES: readonly InterviewIntegrityEventType[] = [
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "CAMERA_LOST",
  "FACE_MISSING",
  "FACE_OUT_OF_FRAME",
  "MULTIPLE_FACES",
  "FACE_POSITION_SHIFT",
  "GAZE_AWAY",
  "VOICE_MOUTH_MISMATCH",
  "VOICE_WITHOUT_FACE",
  "STATIC_VIDEO_FRAME",
  "EARLY_SCREEN_AWAY",
];

const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "source",
  "cameraWarnings",
  "microphoneWarnings",
  "longSilenceCount",
  "shortAnswerCount",
  "testModeUsed",
  "voicePeakLevel",
  "lowAudioFrameCount",
  "observedAudioFrameCount",
  "cameraDisconnectedCount",
  "integrityEvents",
  "integritySummary",
]);

const SUMMARY_FIELDS = new Set([
  "screenAwayCount",
  "tabHiddenCount",
  "windowBlurCount",
  "cameraLostCount",
  "faceMissingCount",
  "faceOutOfFrameCount",
  "multipleFacesCount",
  "facePositionShiftCount",
  "gazeAwayCount",
  "voiceMouthMismatchCount",
  "voiceWithoutFaceCount",
  "staticVideoFrameCount",
  "earlyScreenAwayCount",
  "faceDetectionSupported",
  "faceDetectionFrameCount",
  "gazeDetectionSupported",
  "gazeDetectionFrameCount",
  "headPoseDetectionSupported",
  "headPoseDetectionFrameCount",
  "mouthSyncSupported",
  "mouthSyncFrameCount",
  "mouthSyncMismatchFrameCount",
  "videoFrameMotionSupported",
  "videoFrameSampleCount",
  "staticVideoFrameSampleCount",
  "totalAwayDurationMs",
  "maxAwayDurationMs",
  "suspicionLevel",
]);

const EVENT_FIELDS = new Set(["type", "occurredAt", "durationMs", "direction", "source"]);
const COUNTER_FIELDS = [
  "cameraWarnings",
  "microphoneWarnings",
  "longSilenceCount",
  "shortAnswerCount",
  "lowAudioFrameCount",
  "observedAudioFrameCount",
  "cameraDisconnectedCount",
] as const;
const SUMMARY_BOOLEAN_FIELDS = [
  "faceDetectionSupported",
  "gazeDetectionSupported",
  "headPoseDetectionSupported",
  "mouthSyncSupported",
  "videoFrameMotionSupported",
] as const;
const SUMMARY_COUNTER_FIELDS = [
  "faceDetectionFrameCount",
  "gazeDetectionFrameCount",
  "headPoseDetectionFrameCount",
  "mouthSyncFrameCount",
  "mouthSyncMismatchFrameCount",
  "videoFrameSampleCount",
  "staticVideoFrameSampleCount",
] as const;
const SUMMARY_EVENT_COUNT_FIELDS = [
  "screenAwayCount",
  "tabHiddenCount",
  "windowBlurCount",
  "cameraLostCount",
  "faceMissingCount",
  "faceOutOfFrameCount",
  "multipleFacesCount",
  "facePositionShiftCount",
  "gazeAwayCount",
  "voiceMouthMismatchCount",
  "voiceWithoutFaceCount",
  "staticVideoFrameCount",
  "earlyScreenAwayCount",
] as const;

export class InterviewNonverbalMetadataValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "InterviewNonverbalMetadataValidationError";
  }
}

export function normalizeInterviewNonverbalMetadata(value: unknown): InterviewAnswerNonverbalMetadata | undefined {
  if (value === undefined) return undefined;

  const metadata = requireRecord(value, "nonverbalMetadata");
  assertPayloadSize(metadata);
  assertAllowedFields(metadata, TOP_LEVEL_FIELDS, "nonverbalMetadata");

  const meaningfulFields = Object.keys(metadata).filter((key) => key !== "schemaVersion" && key !== "source");
  if (meaningfulFields.length === 0) return undefined;

  if (metadata.schemaVersion !== undefined && metadata.schemaVersion !== 1) {
    invalid("schemaVersion must be 1");
  }
  if (metadata.source !== undefined && metadata.source !== "CLIENT_RUNTIME_UNVERIFIED") {
    invalid("source is server controlled");
  }

  const normalized: InterviewAnswerNonverbalMetadata = {
    schemaVersion: 1,
    source: "CLIENT_RUNTIME_UNVERIFIED",
  };

  for (const field of COUNTER_FIELDS) {
    const counter = optionalInteger(metadata[field], `nonverbalMetadata.${field}`, MAX_COUNTER_VALUE);
    if (counter !== undefined) normalized[field] = counter;
  }

  const voicePeakLevel = optionalInteger(
    metadata.voicePeakLevel,
    "nonverbalMetadata.voicePeakLevel",
    MAX_VOICE_PEAK_LEVEL,
  );
  if (voicePeakLevel !== undefined) normalized.voicePeakLevel = voicePeakLevel;

  if (metadata.testModeUsed !== undefined) {
    normalized.testModeUsed = requireBoolean(metadata.testModeUsed, "nonverbalMetadata.testModeUsed");
  }

  const events = normalizeEvents(metadata.integrityEvents);
  if (events !== undefined) normalized.integrityEvents = events;

  const summaryInput = metadata.integritySummary === undefined
    ? undefined
    : requireRecord(metadata.integritySummary, "nonverbalMetadata.integritySummary");
  if (summaryInput) {
    assertAllowedFields(summaryInput, SUMMARY_FIELDS, "nonverbalMetadata.integritySummary");
    validateSummaryInput(summaryInput);
  }
  if (events !== undefined || summaryInput !== undefined) {
    normalized.integritySummary = buildNormalizedSummary(events ?? [], summaryInput, normalized.testModeUsed === true);
  }

  return normalized;
}

function normalizeEvents(value: unknown): InterviewIntegrityEvent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalid("integrityEvents must be an array");
  if (value.length > INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS) {
    invalid(`integrityEvents must contain at most ${INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS} events`);
  }

  return value.map((item, index) => {
    const event = requireRecord(item, `nonverbalMetadata.integrityEvents[${index}]`);
    assertAllowedFields(event, EVENT_FIELDS, `nonverbalMetadata.integrityEvents[${index}]`);

    if (typeof event.type !== "string" || !EVENT_TYPES.includes(event.type as InterviewIntegrityEventType)) {
      invalid(`integrityEvents[${index}].type is invalid`);
    }
    if (typeof event.occurredAt !== "string" || event.occurredAt.length > 64) {
      invalid(`integrityEvents[${index}].occurredAt is invalid`);
    }
    const occurredAtMs = Date.parse(event.occurredAt);
    if (!Number.isFinite(occurredAtMs)) invalid(`integrityEvents[${index}].occurredAt is invalid`);

    const normalizedEvent: InterviewIntegrityEvent = {
      type: event.type as InterviewIntegrityEventType,
      occurredAt: new Date(occurredAtMs).toISOString(),
    };
    const durationMs = optionalInteger(
      event.durationMs,
      `nonverbalMetadata.integrityEvents[${index}].durationMs`,
      MAX_EVENT_DURATION_MS,
    );
    if (durationMs !== undefined) normalizedEvent.durationMs = durationMs;

    if (event.direction !== undefined) {
      if (event.direction !== "LEFT" && event.direction !== "RIGHT" && event.direction !== "UP" && event.direction !== "DOWN") {
        invalid(`integrityEvents[${index}].direction is invalid`);
      }
      normalizedEvent.direction = event.direction;
    }
    if (event.source !== undefined) {
      if (event.source !== "IRIS" && event.source !== "HEAD_POSE" && event.source !== "COMBINED") {
        invalid(`integrityEvents[${index}].source is invalid`);
      }
      normalizedEvent.source = event.source;
    }

    return normalizedEvent;
  });
}

function buildNormalizedSummary(
  events: InterviewIntegrityEvent[],
  input: Record<string, unknown> | undefined,
  testModeUsed: boolean,
): InterviewIntegritySummary {
  const count = (type: InterviewIntegrityEventType) => events.filter((event) => event.type === type).length;
  const tabHiddenCount = count("TAB_HIDDEN");
  const windowBlurCount = count("WINDOW_BLUR");
  const cameraLostCount = count("CAMERA_LOST");
  const faceMissingCount = count("FACE_MISSING");
  const faceOutOfFrameCount = count("FACE_OUT_OF_FRAME");
  const multipleFacesCount = count("MULTIPLE_FACES");
  const facePositionShiftCount = count("FACE_POSITION_SHIFT");
  const gazeAwayCount = count("GAZE_AWAY");
  const voiceMouthMismatchCount = count("VOICE_MOUTH_MISMATCH");
  const voiceWithoutFaceCount = count("VOICE_WITHOUT_FACE");
  const staticVideoFrameCount = count("STATIC_VIDEO_FRAME");
  const earlyScreenAwayCount = count("EARLY_SCREEN_AWAY");
  const screenAwayCount = tabHiddenCount + windowBlurCount;
  const awayDurations = events
    .filter((event) => event.type === "TAB_HIDDEN" || event.type === "WINDOW_BLUR")
    .map((event) => event.durationMs ?? 0);
  const totalAwayDurationMs = awayDurations.reduce((sum, duration) => sum + duration, 0);
  const maxAwayDurationMs = awayDurations.length > 0 ? Math.max(...awayDurations) : 0;

  const summary: InterviewIntegritySummary = {
    screenAwayCount,
    tabHiddenCount,
    windowBlurCount,
    cameraLostCount,
    faceMissingCount,
    faceOutOfFrameCount,
    multipleFacesCount,
    facePositionShiftCount,
    gazeAwayCount,
    voiceMouthMismatchCount,
    voiceWithoutFaceCount,
    staticVideoFrameCount,
    earlyScreenAwayCount,
    totalAwayDurationMs,
    maxAwayDurationMs,
    suspicionLevel: deriveSuspicionLevel({
      screenAwayCount,
      cameraLostCount,
      faceMissingCount,
      faceOutOfFrameCount,
      multipleFacesCount,
      facePositionShiftCount,
      gazeAwayCount,
      voiceMouthMismatchCount,
      voiceWithoutFaceCount,
      staticVideoFrameCount,
      earlyScreenAwayCount,
      totalAwayDurationMs,
      maxAwayDurationMs,
      testModeUsed,
    }),
  };

  if (!input) return summary;
  for (const field of SUMMARY_BOOLEAN_FIELDS) {
    if (input[field] !== undefined) summary[field] = requireBoolean(input[field], `nonverbalMetadata.integritySummary.${field}`);
  }
  for (const field of SUMMARY_COUNTER_FIELDS) {
    const counter = optionalInteger(input[field], `nonverbalMetadata.integritySummary.${field}`, MAX_COUNTER_VALUE);
    if (counter !== undefined) summary[field] = counter;
  }

  return summary;
}

function validateSummaryInput(input: Record<string, unknown>) {
  for (const field of SUMMARY_EVENT_COUNT_FIELDS) {
    optionalInteger(input[field], `nonverbalMetadata.integritySummary.${field}`, MAX_COUNTER_VALUE);
  }
  optionalInteger(
    input.totalAwayDurationMs,
    "nonverbalMetadata.integritySummary.totalAwayDurationMs",
    MAX_EVENT_DURATION_MS * INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS,
  );
  optionalInteger(
    input.maxAwayDurationMs,
    "nonverbalMetadata.integritySummary.maxAwayDurationMs",
    MAX_EVENT_DURATION_MS,
  );
  if (
    input.suspicionLevel !== undefined &&
    input.suspicionLevel !== "NONE" &&
    input.suspicionLevel !== "LOW" &&
    input.suspicionLevel !== "MEDIUM" &&
    input.suspicionLevel !== "HIGH"
  ) {
    invalid("nonverbalMetadata.integritySummary.suspicionLevel is invalid");
  }
}

function deriveSuspicionLevel(input: {
  screenAwayCount: number;
  cameraLostCount: number;
  faceMissingCount: number;
  faceOutOfFrameCount: number;
  multipleFacesCount: number;
  facePositionShiftCount: number;
  gazeAwayCount: number;
  voiceMouthMismatchCount: number;
  voiceWithoutFaceCount: number;
  staticVideoFrameCount: number;
  earlyScreenAwayCount: number;
  totalAwayDurationMs: number;
  maxAwayDurationMs: number;
  testModeUsed: boolean;
}): InterviewIntegritySuspicionLevel {
  const faceSignalCount =
    input.faceMissingCount +
    input.faceOutOfFrameCount +
    input.multipleFacesCount +
    input.facePositionShiftCount +
    input.gazeAwayCount +
    input.voiceMouthMismatchCount +
    input.voiceWithoutFaceCount +
    input.staticVideoFrameCount +
    input.earlyScreenAwayCount;
  const signalGroups = [
    input.screenAwayCount > 0,
    input.cameraLostCount > 0,
    faceSignalCount > 0,
    input.testModeUsed,
  ].filter(Boolean).length;

  if (
    signalGroups >= 2 ||
    input.totalAwayDurationMs >= 30_000 ||
    input.multipleFacesCount > 0 ||
    input.facePositionShiftCount > 0 ||
    input.voiceMouthMismatchCount > 0 ||
    input.voiceWithoutFaceCount > 0 ||
    input.staticVideoFrameCount > 0 ||
    input.earlyScreenAwayCount > 0
  ) {
    return "HIGH";
  }
  if (
    input.cameraLostCount > 0 ||
    input.maxAwayDurationMs >= 5_000 ||
    input.totalAwayDurationMs >= 10_000 ||
    input.faceMissingCount > 0 ||
    input.faceOutOfFrameCount > 0 ||
    input.gazeAwayCount >= 2
  ) {
    return "MEDIUM";
  }
  if (input.screenAwayCount > 0 || input.gazeAwayCount > 0 || input.testModeUsed) return "LOW";
  return "NONE";
}

function assertPayloadSize(value: Record<string, unknown>) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid("nonverbalMetadata must be JSON serializable");
  }
  if (Buffer.byteLength(serialized, "utf8") > INTERVIEW_NONVERBAL_METADATA_MAX_BYTES) {
    invalid(`nonverbalMetadata must not exceed ${INTERVIEW_NONVERBAL_METADATA_MAX_BYTES} bytes`);
  }
}

function assertAllowedFields(value: Record<string, unknown>, allowed: Set<string>, path: string) {
  const unsupported = Object.keys(value).find((key) => !allowed.has(key));
  if (unsupported) invalid(`${path}.${unsupported} is not supported`);
}

function optionalInteger(value: unknown, path: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) {
    invalid(`${path} must be an integer between 0 and ${max}`);
  }
  return value as number;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(`${path} must be a boolean`);
  return value;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${path} must be a JSON object`);
  return value as Record<string, unknown>;
}

function invalid(reason: string): never {
  throw new InterviewNonverbalMetadataValidationError(reason);
}

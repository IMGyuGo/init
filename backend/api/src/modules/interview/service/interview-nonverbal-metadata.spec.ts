import {
  INTERVIEW_NONVERBAL_METADATA_MAX_BYTES,
  INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS,
  INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES,
  InterviewNonverbalMetadataValidationError,
  normalizeInterviewNonverbalMetadata,
} from "./interview-nonverbal-metadata";

describe("normalizeInterviewNonverbalMetadata", () => {
  it("allowlists fields and rebuilds integrity counts from normalized events", () => {
    const metadata = normalizeInterviewNonverbalMetadata({
      cameraWarnings: 1,
      testModeUsed: false,
      integrityEvents: [
        {
          type: "TAB_HIDDEN",
          occurredAt: "2026-07-10T19:00:00+09:00",
          durationMs: 3200,
        },
        {
          type: "GAZE_AWAY",
          occurredAt: "2026-07-10T10:00:05.000Z",
          offsetMs: 2500,
          durationMs: 1800,
          direction: "RIGHT",
          source: "COMBINED",
        },
      ],
      integritySummary: {
        screenAwayCount: 999,
        gazeAwayCount: 999,
        suspicionLevel: "NONE",
        faceDetectionSupported: true,
        faceDetectionFrameCount: 12,
        personDetectionSupported: true,
        personDetectionFrameCount: 6,
      },
    });

    expect(metadata?.schemaVersion).toBe(1);
    expect(metadata?.source).toBe("CLIENT_RUNTIME_UNVERIFIED");
    expect(metadata?.integrityEvents?.[0]?.occurredAt).toBe("2026-07-10T10:00:00.000Z");
    expect(metadata?.integrityEvents?.[1]?.offsetMs).toBe(2500);
    expect(metadata?.integritySummary).toMatchObject({
      screenAwayCount: 1,
      tabHiddenCount: 1,
      windowBlurCount: 0,
      gazeAwayCount: 1,
      totalAwayDurationMs: 3200,
      maxAwayDurationMs: 3200,
      faceDetectionSupported: true,
      faceDetectionFrameCount: 12,
      personDetectionSupported: true,
      personDetectionFrameCount: 6,
      suspicionLevel: "HIGH",
    });
  });

  it("rejects unsupported fields and event types", () => {
    expect(() => normalizeInterviewNonverbalMetadata({ forgedScore: 100 })).toThrow(
      InterviewNonverbalMetadataValidationError,
    );
    expect(() => normalizeInterviewNonverbalMetadata({
      integrityEvents: [{ type: "FORGED_EVENT", occurredAt: "2026-07-10T10:00:00.000Z" }],
    })).toThrow("integrityEvents[0].type is invalid");
    expect(() => normalizeInterviewNonverbalMetadata({
      integritySummary: { screenAwayCount: "many" },
    })).toThrow("integritySummary.screenAwayCount must be an integer");
    expect(() => normalizeInterviewNonverbalMetadata({
      integrityEvents: [{
        type: "GAZE_AWAY",
        occurredAt: "2026-07-10T10:00:00.000Z",
        offsetMs: -1,
      }],
    })).toThrow("integrityEvents[0].offsetMs must be an integer between 0");
  });

  it("rejects oversized payloads and excessive event counts", () => {
    expect(() => normalizeInterviewNonverbalMetadata({
      oversized: "x".repeat(INTERVIEW_NONVERBAL_METADATA_MAX_BYTES),
    })).toThrow(`must not exceed ${INTERVIEW_NONVERBAL_METADATA_MAX_BYTES} bytes`);

    const events = Array.from({ length: INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS + 1 }, (_, index) => ({
      type: "GAZE_AWAY",
      occurredAt: new Date(Date.UTC(2026, 6, 10, 10, 0, index)).toISOString(),
    }));
    expect(() => normalizeInterviewNonverbalMetadata({ integrityEvents: events })).toThrow(
      `at most ${INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS} events`,
    );
  });

  it("treats an empty object as absent telemetry", () => {
    expect(normalizeInterviewNonverbalMetadata({})).toBeUndefined();
  });

  it("normalizes bounded gaze and head-pose timelines", () => {
    const metadata = normalizeInterviewNonverbalMetadata({
      gazeTimeline: [
        { tMs: 1000, horizontalOffset: 0.012345, verticalOffset: -0.02, direction: "CENTER" },
        { tMs: 2000, horizontalOffset: 0.18, verticalOffset: 0.01, direction: "RIGHT" },
      ],
      headPoseTimeline: [
        { tMs: 1000, yawDegrees: 1.234, pitchDegrees: -2.345, rollDegrees: 0.456 },
        { tMs: 2000, yawDegrees: 21.2, pitchDegrees: 3.1, rollDegrees: -4.5 },
      ],
    });

    expect(metadata?.gazeTimeline).toEqual([
      { tMs: 1000, horizontalOffset: 0.0123, verticalOffset: -0.02, direction: "CENTER" },
      { tMs: 2000, horizontalOffset: 0.18, verticalOffset: 0.01, direction: "RIGHT" },
    ]);
    expect(metadata?.headPoseTimeline).toEqual([
      { tMs: 1000, yawDegrees: 1.23, pitchDegrees: -2.35, rollDegrees: 0.46 },
      { tMs: 2000, yawDegrees: 21.2, pitchDegrees: 3.1, rollDegrees: -4.5 },
    ]);
  });

  it("rejects malformed, excessive, and unordered timeline samples", () => {
    expect(() => normalizeInterviewNonverbalMetadata({
      gazeTimeline: [{ tMs: 1000, horizontalOffset: 1.1, verticalOffset: 0, direction: "CENTER" }],
    })).toThrow("horizontalOffset must be a finite number between -1 and 1");
    expect(() => normalizeInterviewNonverbalMetadata({
      headPoseTimeline: [
        { tMs: 2000, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0 },
        { tMs: 1000, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0 },
      ],
    })).toThrow("tMs must be greater than the previous sample");
    expect(() => normalizeInterviewNonverbalMetadata({
      gazeTimeline: Array.from({ length: INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES + 1 }, (_, index) => ({
        tMs: index,
        horizontalOffset: 0,
        verticalOffset: 0,
        direction: "CENTER",
      })),
    })).toThrow(`at most ${INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES} samples`);
  });
});

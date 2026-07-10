import {
  INTERVIEW_NONVERBAL_METADATA_MAX_BYTES,
  INTERVIEW_NONVERBAL_METADATA_MAX_EVENTS,
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
      },
    });

    expect(metadata?.schemaVersion).toBe(1);
    expect(metadata?.source).toBe("CLIENT_RUNTIME_UNVERIFIED");
    expect(metadata?.integrityEvents?.[0]?.occurredAt).toBe("2026-07-10T10:00:00.000Z");
    expect(metadata?.integritySummary).toMatchObject({
      screenAwayCount: 1,
      tabHiddenCount: 1,
      windowBlurCount: 0,
      gazeAwayCount: 1,
      totalAwayDurationMs: 3200,
      maxAwayDurationMs: 3200,
      faceDetectionSupported: true,
      faceDetectionFrameCount: 12,
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
});

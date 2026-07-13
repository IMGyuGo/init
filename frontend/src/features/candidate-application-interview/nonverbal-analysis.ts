export type InterviewGazeDirection = "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";

export type InterviewGazeTimelineSample = {
  tMs: number;
  horizontalOffset: number;
  verticalOffset: number;
  direction: InterviewGazeDirection;
};

export type InterviewHeadPoseTimelineSample = {
  tMs: number;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
};

export type InterviewGazeAwayInterval = {
  startMs: number;
  endMs: number;
  direction?: Exclude<InterviewGazeDirection, "CENTER">;
};

export type GazeTimelineSummary = {
  sampleCount: number;
  centeredRatio: number;
  horizontalRange: number;
  verticalRange: number;
  dominantAwayDirection?: Exclude<InterviewGazeDirection, "CENTER">;
};

export type HeadPoseTimelineSummary = {
  sampleCount: number;
  frontalRatio: number;
  maxYawDegrees: number;
  maxPitchDegrees: number;
  maxRollDegrees: number;
};

export const INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES = 120;

const GAZE_DIRECTIONS: readonly InterviewGazeDirection[] = ["CENTER", "LEFT", "RIGHT", "UP", "DOWN"];
const GAZE_AWAY_DIRECTIONS: readonly Exclude<InterviewGazeDirection, "CENTER">[] = ["LEFT", "RIGHT", "UP", "DOWN"];

export function readGazeAwayIntervals(
  metadata: Record<string, unknown> | undefined,
  durationMs: number,
): InterviewGazeAwayInterval[] {
  const events = metadata?.integrityEvents;
  if (!Array.isArray(events) || !Number.isFinite(durationMs) || durationMs <= 0) return [];

  return events
    .map((event) => readRecord(event))
    .filter((event): event is Record<string, unknown> => Boolean(event) && event?.type === "GAZE_AWAY")
    .map((event) => {
      const startMs = readFiniteNumber(event.offsetMs);
      const rawDurationMs = readFiniteNumber(event.durationMs);
      const intervalDurationMs = Number.isFinite(rawDurationMs) ? Math.max(500, rawDurationMs) : 500;
      const direction = GAZE_AWAY_DIRECTIONS.includes(event.direction as Exclude<InterviewGazeDirection, "CENTER">)
        ? event.direction as Exclude<InterviewGazeDirection, "CENTER">
        : undefined;
      return {
        startMs,
        endMs: Math.min(durationMs, startMs + intervalDurationMs),
        ...(direction ? { direction } : {}),
      };
    })
    .filter((interval) => interval.startMs >= 0 && interval.startMs < durationMs && interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs);
}

export function readGazeTimeline(metadata: Record<string, unknown> | undefined): InterviewGazeTimelineSample[] {
  const timeline = metadata?.gazeTimeline;
  if (!Array.isArray(timeline)) return [];

  return timeline
    .slice(0, INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES)
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      tMs: readFiniteNumber(item.tMs),
      horizontalOffset: readFiniteNumber(item.horizontalOffset),
      verticalOffset: readFiniteNumber(item.verticalOffset),
      direction: GAZE_DIRECTIONS.includes(item.direction as InterviewGazeDirection)
        ? item.direction as InterviewGazeDirection
        : "CENTER",
    }))
    .filter((item) => item.tMs >= 0 && Math.abs(item.horizontalOffset) <= 1 && Math.abs(item.verticalOffset) <= 1)
    .sort((left, right) => left.tMs - right.tMs);
}

export function readHeadPoseTimeline(metadata: Record<string, unknown> | undefined): InterviewHeadPoseTimelineSample[] {
  const timeline = metadata?.headPoseTimeline;
  if (!Array.isArray(timeline)) return [];

  return timeline
    .slice(0, INTERVIEW_NONVERBAL_TIMELINE_MAX_SAMPLES)
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      tMs: readFiniteNumber(item.tMs),
      yawDegrees: readFiniteNumber(item.yawDegrees),
      pitchDegrees: readFiniteNumber(item.pitchDegrees),
      rollDegrees: readFiniteNumber(item.rollDegrees),
    }))
    .filter((item) =>
      item.tMs >= 0 &&
      Math.abs(item.yawDegrees) <= 180 &&
      Math.abs(item.pitchDegrees) <= 180 &&
      Math.abs(item.rollDegrees) <= 180,
    )
    .sort((left, right) => left.tMs - right.tMs);
}

export function summarizeGazeTimeline(samples: InterviewGazeTimelineSample[]): GazeTimelineSummary {
  if (samples.length === 0) {
    return { sampleCount: 0, centeredRatio: 0, horizontalRange: 0, verticalRange: 0 };
  }

  const centeredCount = samples.filter((sample) => sample.direction === "CENTER").length;
  const directionCounts = new Map<Exclude<InterviewGazeDirection, "CENTER">, number>();
  for (const sample of samples) {
    if (sample.direction === "CENTER") continue;
    directionCounts.set(sample.direction, (directionCounts.get(sample.direction) ?? 0) + 1);
  }
  const dominantAwayDirection = [...directionCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];

  return {
    sampleCount: samples.length,
    centeredRatio: centeredCount / samples.length,
    horizontalRange: range(samples.map((sample) => sample.horizontalOffset)),
    verticalRange: range(samples.map((sample) => sample.verticalOffset)),
    dominantAwayDirection,
  };
}

export function summarizeHeadPoseTimeline(samples: InterviewHeadPoseTimelineSample[]): HeadPoseTimelineSummary {
  if (samples.length === 0) {
    return { sampleCount: 0, frontalRatio: 0, maxYawDegrees: 0, maxPitchDegrees: 0, maxRollDegrees: 0 };
  }

  const frontalCount = samples.filter((sample) =>
    Math.abs(sample.yawDegrees) < 15 &&
    Math.abs(sample.pitchDegrees) < 12 &&
    Math.abs(sample.rollDegrees) < 12,
  ).length;

  return {
    sampleCount: samples.length,
    frontalRatio: frontalCount / samples.length,
    maxYawDegrees: maximumAbsolute(samples.map((sample) => sample.yawDegrees)),
    maxPitchDegrees: maximumAbsolute(samples.map((sample) => sample.pitchDegrees)),
    maxRollDegrees: maximumAbsolute(samples.map((sample) => sample.rollDegrees)),
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function range(values: number[]): number {
  return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
}

function maximumAbsolute(values: number[]): number {
  return values.length > 0 ? Math.max(...values.map((value) => Math.abs(value))) : 0;
}

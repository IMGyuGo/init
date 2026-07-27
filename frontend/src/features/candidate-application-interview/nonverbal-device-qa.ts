export const NONVERBAL_DEVICE_QA_SCHEMA_VERSION = 1 as const;
export const NONVERBAL_DEVICE_QA_MIN_SCENARIO_DURATION_MS = 3000;

export type NonverbalDeviceQaBrowser = "CHROME" | "EDGE" | "SAFARI" | "FIREFOX" | "OTHER";
export type NonverbalDeviceQaPerformanceStatus = "MEASURING" | "GOOD" | "DEGRADED" | "POOR" | "UNAVAILABLE";
export type NonverbalDeviceQaScenarioKind = "NEUTRAL" | "EYE_AWAY" | "HEAD_AWAY";
export type NonverbalDeviceQaScenarioStatus = "PASS" | "FAIL" | "INCOMPLETE";

export type NonverbalDeviceQaEnvironment = {
  browser: NonverbalDeviceQaBrowser;
  userAgent: string;
  platform: string;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
};

export type NonverbalDeviceQaCamera = {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: string;
};

export type NonverbalDeviceQaObservedEvent = {
  type: string;
  source?: string;
};

export type NonverbalDeviceQaScenarioResult = {
  kind: NonverbalDeviceQaScenarioKind;
  startedAtOffsetMs: number;
  durationMs: number;
  status: NonverbalDeviceQaScenarioStatus;
  observedGazeAwayCount: number;
  observedSources: string[];
  message: string;
};

export type NonverbalDeviceQaActiveScenario = {
  kind: NonverbalDeviceQaScenarioKind;
  startedAtMs: number;
  eventStartIndex: number;
};

export type NonverbalDeviceQaRun = {
  schemaVersion: typeof NONVERBAL_DEVICE_QA_SCHEMA_VERSION;
  runId: string;
  questionId: number;
  startedAt: string;
  startedAtMs: number;
  sampleIntervalMs: number;
  environment: NonverbalDeviceQaEnvironment;
  camera: NonverbalDeviceQaCamera;
  sampleAttempts: number;
  sampleCompleted: number;
  sampleSkippedBusy: number;
  sampleSkippedVideoNotReady: number;
  sampleUnsupported: number;
  sampleErrors: number;
  sampleProcessingDurationsMs: number[];
  firstCompletedSampleAtMs?: number;
  facePresentSampleCount: number;
  irisSampleCount: number;
  headPoseSampleCount: number;
  videoFrameCallbackSupported: boolean;
  videoPresentedFrameCount: number;
  videoDroppedFrameEstimate: number;
  firstVideoFrameAtMs?: number;
  lastVideoFrameAtMs?: number;
  lastPresentedFrames?: number;
  activeScenario?: NonverbalDeviceQaActiveScenario;
  scenarioResults: NonverbalDeviceQaScenarioResult[];
};

export type NonverbalDeviceQaSummary = {
  elapsedMs: number;
  performanceStatus: NonverbalDeviceQaPerformanceStatus;
  completedSamplesPerSecond: number;
  sampleCompletionRate: number;
  averageProcessingMs: number;
  p95ProcessingMs: number;
  maxProcessingMs: number;
  firstSampleLatencyMs?: number;
  faceCoverageRate: number;
  irisCoverageRate: number;
  headPoseCoverageRate: number;
  measuredVideoFps?: number;
  estimatedVideoDropRate?: number;
};

export function detectNonverbalDeviceQaBrowser(userAgent: string): NonverbalDeviceQaBrowser {
  if (/Edg\//i.test(userAgent)) return "EDGE";
  if (/(Chrome|CriOS)\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "CHROME";
  if (/Firefox|FxiOS/i.test(userAgent)) return "FIREFOX";
  if (/Safari\//i.test(userAgent) && !/(Chrome|CriOS|Chromium|Edg)\//i.test(userAgent)) return "SAFARI";
  return "OTHER";
}

export function collectNonverbalDeviceQaEnvironment(): NonverbalDeviceQaEnvironment {
  const extendedNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    browser: detectNonverbalDeviceQaBrowser(navigator.userAgent),
    userAgent: navigator.userAgent,
    platform: navigator.platform || "unknown",
    ...(navigator.hardwareConcurrency ? { hardwareConcurrency: navigator.hardwareConcurrency } : {}),
    ...(extendedNavigator.deviceMemory ? { deviceMemoryGb: extendedNavigator.deviceMemory } : {}),
  };
}

export function readNonverbalDeviceQaCamera(stream: MediaStream): NonverbalDeviceQaCamera {
  const settings = stream.getVideoTracks()[0]?.getSettings();
  if (!settings) return {};
  return {
    ...(settings.width ? { width: settings.width } : {}),
    ...(settings.height ? { height: settings.height } : {}),
    ...(settings.frameRate ? { frameRate: settings.frameRate } : {}),
    ...(settings.facingMode ? { facingMode: settings.facingMode } : {}),
  };
}

export function createNonverbalDeviceQaRun(input: {
  questionId: number;
  startedAtMs: number;
  sampleIntervalMs: number;
  environment: NonverbalDeviceQaEnvironment;
  camera: NonverbalDeviceQaCamera;
}): NonverbalDeviceQaRun {
  return {
    schemaVersion: NONVERBAL_DEVICE_QA_SCHEMA_VERSION,
    runId: `${input.questionId}-${input.startedAtMs}`,
    questionId: input.questionId,
    startedAt: new Date(input.startedAtMs).toISOString(),
    startedAtMs: input.startedAtMs,
    sampleIntervalMs: input.sampleIntervalMs,
    environment: input.environment,
    camera: input.camera,
    sampleAttempts: 0,
    sampleCompleted: 0,
    sampleSkippedBusy: 0,
    sampleSkippedVideoNotReady: 0,
    sampleUnsupported: 0,
    sampleErrors: 0,
    sampleProcessingDurationsMs: [],
    facePresentSampleCount: 0,
    irisSampleCount: 0,
    headPoseSampleCount: 0,
    videoFrameCallbackSupported: false,
    videoPresentedFrameCount: 0,
    videoDroppedFrameEstimate: 0,
    scenarioResults: [],
  };
}

export function summarizeNonverbalDeviceQaRun(
  run: NonverbalDeviceQaRun,
  nowMs = Date.now(),
): NonverbalDeviceQaSummary {
  const elapsedMs = Math.max(0, nowMs - run.startedAtMs);
  const elapsedSeconds = elapsedMs / 1000;
  const durations = [...run.sampleProcessingDurationsMs].sort((left, right) => left - right);
  const averageProcessingMs = durations.length > 0
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : 0;
  const p95ProcessingMs = percentile(durations, 0.95);
  const maxProcessingMs = durations.at(-1) ?? 0;
  const completedSamplesPerSecond = elapsedSeconds > 0 ? run.sampleCompleted / elapsedSeconds : 0;
  const sampleCompletionRate = run.sampleAttempts > 0 ? run.sampleCompleted / run.sampleAttempts : 0;
  const faceCoverageRate = run.sampleCompleted > 0 ? run.facePresentSampleCount / run.sampleCompleted : 0;
  const irisCoverageRate = run.sampleCompleted > 0 ? run.irisSampleCount / run.sampleCompleted : 0;
  const headPoseCoverageRate = run.sampleCompleted > 0 ? run.headPoseSampleCount / run.sampleCompleted : 0;
  const videoMeasurementDurationMs =
    run.firstVideoFrameAtMs !== undefined && run.lastVideoFrameAtMs !== undefined
      ? Math.max(0, run.lastVideoFrameAtMs - run.firstVideoFrameAtMs)
      : 0;
  const measuredVideoFps = videoMeasurementDurationMs > 0
    ? run.videoPresentedFrameCount / (videoMeasurementDurationMs / 1000)
    : undefined;
  const totalEstimatedVideoFrames = run.videoPresentedFrameCount + run.videoDroppedFrameEstimate;
  const estimatedVideoDropRate = totalEstimatedVideoFrames > 0
    ? run.videoDroppedFrameEstimate / totalEstimatedVideoFrames
    : undefined;

  return {
    elapsedMs,
    performanceStatus: classifyNonverbalDeviceQaPerformance({
      elapsedMs,
      sampleCompletionRate,
      p95ProcessingMs,
      sampleCompleted: run.sampleCompleted,
      sampleErrors: run.sampleErrors,
      sampleUnsupported: run.sampleUnsupported,
      measuredVideoFps,
      nominalVideoFps: run.camera.frameRate,
    }),
    completedSamplesPerSecond: roundMetric(completedSamplesPerSecond),
    sampleCompletionRate: roundMetric(sampleCompletionRate),
    averageProcessingMs: roundMetric(averageProcessingMs),
    p95ProcessingMs: roundMetric(p95ProcessingMs),
    maxProcessingMs: roundMetric(maxProcessingMs),
    ...(run.firstCompletedSampleAtMs !== undefined
      ? { firstSampleLatencyMs: Math.max(0, run.firstCompletedSampleAtMs - run.startedAtMs) }
      : {}),
    faceCoverageRate: roundMetric(faceCoverageRate),
    irisCoverageRate: roundMetric(irisCoverageRate),
    headPoseCoverageRate: roundMetric(headPoseCoverageRate),
    ...(measuredVideoFps === undefined ? {} : { measuredVideoFps: roundMetric(measuredVideoFps) }),
    ...(estimatedVideoDropRate === undefined ? {} : { estimatedVideoDropRate: roundMetric(estimatedVideoDropRate) }),
  };
}

export function startNonverbalDeviceQaScenario(
  run: NonverbalDeviceQaRun,
  kind: NonverbalDeviceQaScenarioKind,
  eventStartIndex: number,
  nowMs = Date.now(),
): void {
  run.activeScenario = { kind, startedAtMs: nowMs, eventStartIndex };
}

export function finishNonverbalDeviceQaScenario(
  run: NonverbalDeviceQaRun,
  events: NonverbalDeviceQaObservedEvent[],
  nowMs = Date.now(),
): NonverbalDeviceQaScenarioResult | undefined {
  const activeScenario = run.activeScenario;
  if (!activeScenario) return undefined;

  const durationMs = Math.max(0, nowMs - activeScenario.startedAtMs);
  const observedEvents = events.slice(activeScenario.eventStartIndex);
  const gazeEvents = observedEvents.filter((event) => event.type === "GAZE_AWAY");
  const observedSources = [...new Set(gazeEvents.map((event) => event.source).filter((source): source is string => Boolean(source)))];
  const expectedSource = activeScenario.kind === "EYE_AWAY"
    ? ["IRIS", "COMBINED"]
    : activeScenario.kind === "HEAD_AWAY"
      ? ["HEAD_POSE", "COMBINED"]
      : [];
  const matchingEventCount = expectedSource.length > 0
    ? gazeEvents.filter((event) => event.source && expectedSource.includes(event.source)).length
    : gazeEvents.length;
  const status: NonverbalDeviceQaScenarioStatus = durationMs < NONVERBAL_DEVICE_QA_MIN_SCENARIO_DURATION_MS
    ? "INCOMPLETE"
    : activeScenario.kind === "NEUTRAL"
      ? gazeEvents.length === 0 ? "PASS" : "FAIL"
      : matchingEventCount > 0 ? "PASS" : "FAIL";
  const message = status === "INCOMPLETE"
    ? "최소 3초 이상 측정해야 합니다."
    : activeScenario.kind === "NEUTRAL"
      ? status === "PASS" ? "정면 유지 구간에서 시선 이탈 오탐이 없었습니다." : "정면 유지 구간에서 시선 이탈 신호가 발생했습니다."
      : status === "PASS"
        ? "의도한 이탈 신호가 감지되었습니다."
        : "의도한 이탈 신호가 감지되지 않았습니다.";
  const result: NonverbalDeviceQaScenarioResult = {
    kind: activeScenario.kind,
    startedAtOffsetMs: Math.max(0, activeScenario.startedAtMs - run.startedAtMs),
    durationMs,
    status,
    observedGazeAwayCount: gazeEvents.length,
    observedSources,
    message,
  };

  run.scenarioResults.push(result);
  run.activeScenario = undefined;
  return result;
}

export function buildNonverbalDeviceQaExport(
  runs: NonverbalDeviceQaRun[],
  generatedAt = new Date().toISOString(),
) {
  return {
    schemaVersion: NONVERBAL_DEVICE_QA_SCHEMA_VERSION,
    generatedAt,
    runs: runs.map((run) => ({
      ...run,
      activeScenario: undefined,
      summary: summarizeNonverbalDeviceQaRun(run),
    })),
  };
}

function classifyNonverbalDeviceQaPerformance(input: {
  elapsedMs: number;
  sampleCompletionRate: number;
  p95ProcessingMs: number;
  sampleCompleted: number;
  sampleErrors: number;
  sampleUnsupported: number;
  measuredVideoFps?: number;
  nominalVideoFps?: number;
}): NonverbalDeviceQaPerformanceStatus {
  if (input.sampleUnsupported > 0 && input.sampleCompleted === 0) return "UNAVAILABLE";
  if (input.elapsedMs < 5000 || input.sampleCompleted < 3) return "MEASURING";

  const nominalVideoFps = input.nominalVideoFps ?? 30;
  const videoGood = input.measuredVideoFps === undefined || input.measuredVideoFps >= Math.min(20, nominalVideoFps * 0.75);
  const videoUsable = input.measuredVideoFps === undefined || input.measuredVideoFps >= Math.min(12, nominalVideoFps * 0.5);
  if (
    input.sampleCompletionRate >= 0.85 &&
    input.p95ProcessingMs <= 350 &&
    input.sampleErrors === 0 &&
    videoGood
  ) {
    return "GOOD";
  }
  if (
    input.sampleCompletionRate >= 0.65 &&
    input.p95ProcessingMs <= 600 &&
    videoUsable
  ) {
    return "DEGRADED";
  }
  return "POOR";
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index] ?? 0;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

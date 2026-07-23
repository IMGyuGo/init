"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MouthShape = "rest" | "closed" | "open" | "wide" | "round" | "teeth";

export type VisemeCue = {
  startMs: number;
  endMs: number;
  mouthShape: MouthShape;
  sourceCharacterIndex?: number;
  isPause?: boolean;
};

export type SpeechBoundaryTiming = {
  sequence: number;
  characterIndex: number;
  elapsedMs: number;
};

export type AvatarPresentationState = "idle" | "speaking" | "listening" | "thinking";

export type AvatarInput = {
  presentationState: AvatarPresentationState;
  mouthShape: MouthShape;
  audioSource?: HTMLMediaElement;
  speechTimeline?: VisemeCue[];
  reducedMotion: boolean;
};

export interface LipSyncDriverInput {
  presentationState: AvatarPresentationState;
  audioSource?: HTMLMediaElement | null;
  audioStream?: MediaStream | null;
  speechText: string;
  speechBoundary?: SpeechBoundaryTiming;
  reducedMotion: boolean;
}

export interface LipSyncDriverState {
  mouthShape: MouthShape;
  mouthOpen: number;
}

export interface ResolveLipSyncMouthShapeInput {
  speaking: boolean;
  reducedMotion: boolean;
  rms: number;
  timeline?: VisemeCue[];
  elapsedMs?: number;
  audioAnalysisAvailable?: boolean;
}

export type MouthShapeStabilizationState = {
  mouthShape: MouthShape;
  changedAtMs: number;
  lastVoicedAtMs?: number;
};

export interface StabilizeMouthShapeInput {
  previous: MouthShapeStabilizationState;
  requestedMouthShape: MouthShape;
  nowMs: number;
  voiced: boolean;
  forceRest: boolean;
}

const SILENCE_RMS_THRESHOLD = 0.012;
const OPEN_RMS_THRESHOLD = 0.07;
const MAX_RMS_MOUTH_OPEN = 0.12;
const MOUTH_OPEN_ATTACK = 0.58;
const MOUTH_OPEN_RELEASE = 0.32;
const MAX_LIP_SYNC_FPS = 30;
const MAX_AUDIO_DRIVEN_FRAME_DELTA_MS = 100;
const BROWSER_ESTIMATED_SPEECH_SYLLABLE_MS = 155;
const REALTIME_ESTIMATED_SPEECH_SYLLABLE_MS = 180;
const HANGUL_BASE_CODE_POINT = 0xac00;
const HANGUL_LAST_CODE_POINT = 0xd7a3;
const HANGUL_FINAL_COUNT = 28;
const HANGUL_VOWEL_COUNT = 21;
const HANGUL_SYLLABLE_COUNT = HANGUL_FINAL_COUNT * HANGUL_VOWEL_COUNT;
const BILABIAL_INITIALS = new Set([6, 7, 8, 17]);
const TEETH_INITIALS = new Set([9, 10, 12, 13, 14]);
const BILABIAL_FINALS = new Set([16, 17, 26]);
const OPEN_VOWELS = new Set([0, 2, 4, 6]);
const WIDE_VOWELS = new Set([1, 3, 5, 7, 20]);
const ROUND_VOWELS = new Set([8, 13, 18]);
const COMPOUND_VOWEL_MOUTH_SHAPES = new Map<number, readonly MouthShape[]>([
  [9, ["round", "open"]],
  [10, ["round", "wide"]],
  [11, ["round", "wide"]],
  [14, ["round", "open"]],
  [15, ["round", "wide"]],
  [16, ["round", "teeth"]],
  [19, ["wide", "teeth"]],
]);
const SPEECH_PAUSE_CHARACTERS = new Set([",", ".", ";", ":", "!", "?", "…"]);
const INITIAL_CONSONANT_CUE_WEIGHT = 0.42;
const SIMPLE_VOWEL_CUE_WEIGHT = 1.15;
const COMPOUND_VOWEL_CUE_WEIGHT = 0.72;
const FINAL_CONSONANT_CUE_WEIGHT = 0.36;
const SPEECH_PAUSE_CUE_WEIGHT = 1.65;
const MIN_MOUTH_SHAPE_HOLD_MS = 80;
const SILENCE_HANGOVER_MS = 60;
const mouthOpenValueByShape: Record<MouthShape, number> = {
  rest: 0,
  closed: 0.08,
  teeth: 0.45,
  round: 0.6,
  open: 0.78,
  wide: 1,
};

function clampMouthOpenValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getMouthOpenValueForShape(mouthShape: MouthShape): number {
  return mouthOpenValueByShape[mouthShape];
}

export function getMouthOpenValueForRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= SILENCE_RMS_THRESHOLD) return 0;
  return clampMouthOpenValue(
    (rms - SILENCE_RMS_THRESHOLD) / (MAX_RMS_MOUTH_OPEN - SILENCE_RMS_THRESHOLD),
  );
}

export function smoothMouthOpenValue(previous: number, target: number): number {
  const safePrevious = clampMouthOpenValue(previous);
  const safeTarget = clampMouthOpenValue(target);
  const factor = safeTarget > safePrevious ? MOUTH_OPEN_ATTACK : MOUTH_OPEN_RELEASE;
  return safePrevious + (safeTarget - safePrevious) * factor;
}

export function stabilizeMouthShape(input: StabilizeMouthShapeInput): MouthShapeStabilizationState {
  const safeNowMs = Number.isFinite(input.nowMs)
    ? Math.max(0, input.nowMs)
    : input.previous.changedAtMs;
  if (input.forceRest) {
    return { mouthShape: "rest", changedAtMs: safeNowMs };
  }

  if (input.voiced) {
    const canChange = input.previous.mouthShape === "rest"
      || safeNowMs - input.previous.changedAtMs >= MIN_MOUTH_SHAPE_HOLD_MS;
    const mouthShape = canChange ? input.requestedMouthShape : input.previous.mouthShape;
    return {
      mouthShape,
      changedAtMs: mouthShape === input.previous.mouthShape
        ? input.previous.changedAtMs
        : safeNowMs,
      lastVoicedAtMs: safeNowMs,
    };
  }

  if (
    input.previous.mouthShape !== "rest"
    && input.previous.lastVoicedAtMs !== undefined
    && safeNowMs - input.previous.lastVoicedAtMs < SILENCE_HANGOVER_MS
  ) {
    return input.previous;
  }

  return {
    mouthShape: "rest",
    changedAtMs: input.previous.mouthShape === "rest"
      ? input.previous.changedAtMs
      : safeNowMs,
  };
}

function getHangulIndices(character: string) {
  const codePoint = character.codePointAt(0);
  if (!codePoint || codePoint < HANGUL_BASE_CODE_POINT || codePoint > HANGUL_LAST_CODE_POINT) return undefined;

  const offset = codePoint - HANGUL_BASE_CODE_POINT;
  return {
    initial: Math.floor(offset / HANGUL_SYLLABLE_COUNT),
    vowel: Math.floor((offset % HANGUL_SYLLABLE_COUNT) / HANGUL_FINAL_COUNT),
    final: offset % HANGUL_FINAL_COUNT,
  };
}

export function getMouthShapeForKoreanCharacter(character: string): MouthShape {
  const indices = getHangulIndices(character);
  if (!indices) return "rest";
  if (BILABIAL_INITIALS.has(indices.initial) || BILABIAL_FINALS.has(indices.final)) return "closed";
  if (TEETH_INITIALS.has(indices.initial)) return "teeth";
  return getMouthShapeForKoreanVowel(indices.vowel);
}

export function getRelativeAudioElapsedMs(currentTimeSeconds: number, startedAtSeconds: number): number {
  if (!Number.isFinite(currentTimeSeconds) || !Number.isFinite(startedAtSeconds)) return 0;
  return Math.max(0, Math.round((currentTimeSeconds - startedAtSeconds) * 1000));
}

export function advanceAudioDrivenTimelineElapsedMs(
  previousElapsedMs: number,
  frameDeltaMs: number,
  rms: number,
  audioStarted = previousElapsedMs > 0,
  currentMouthShape?: MouthShape,
): number {
  const safePrevious = Number.isFinite(previousElapsedMs) ? Math.max(0, previousElapsedMs) : 0;
  if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) return safePrevious;
  if (!audioStarted && rms <= SILENCE_RMS_THRESHOLD) return safePrevious;
  if (rms <= SILENCE_RMS_THRESHOLD && currentMouthShape !== "rest") return safePrevious;
  return safePrevious + Math.min(frameDeltaMs, MAX_AUDIO_DRIVEN_FRAME_DELTA_MS);
}

function getMouthShapeForKoreanVowel(vowel: number): MouthShape {
  if (OPEN_VOWELS.has(vowel)) return "open";
  if (WIDE_VOWELS.has(vowel)) return "wide";
  if (ROUND_VOWELS.has(vowel)) return "round";
  return "rest";
}

export function getMouthShapesForKoreanCharacter(character: string): MouthShape[] {
  const indices = getHangulIndices(character);
  if (!indices) return [];

  const mouthShapes: MouthShape[] = [];
  if (BILABIAL_INITIALS.has(indices.initial)) mouthShapes.push("closed");
  else if (TEETH_INITIALS.has(indices.initial)) mouthShapes.push("teeth");

  const compoundVowelShapes = COMPOUND_VOWEL_MOUTH_SHAPES.get(indices.vowel);
  mouthShapes.push(...(compoundVowelShapes ?? [getMouthShapeForKoreanVowel(indices.vowel)]));

  if (BILABIAL_FINALS.has(indices.final)) mouthShapes.push("closed");
  return mouthShapes.filter((mouthShape, index) => index === 0 || mouthShape !== mouthShapes[index - 1]);
}

export function getMouthShapeForRms(rms: number): MouthShape {
  if (rms <= SILENCE_RMS_THRESHOLD) return "rest";
  if (rms <= OPEN_RMS_THRESHOLD) return "closed";
  return "open";
}

export function buildKoreanVisemeTimeline(text: string, durationMs: number): VisemeCue[] {
  const weightedCues: Array<{
    mouthShape: MouthShape;
    sourceCharacterIndex: number;
    weight: number;
    isPause: boolean;
  }> = [];
  let sourceCharacterIndex = 0;

  for (const character of text) {
    const indices = getHangulIndices(character);
    if (indices) {
      const hasInitialCue = BILABIAL_INITIALS.has(indices.initial) || TEETH_INITIALS.has(indices.initial);
      const vowelShapes = COMPOUND_VOWEL_MOUTH_SHAPES.get(indices.vowel)
        ?? [getMouthShapeForKoreanVowel(indices.vowel)];
      const hasFinalCue = BILABIAL_FINALS.has(indices.final);
      const candidates: Array<{ mouthShape: MouthShape; weight: number; isPause: boolean }> = [];

      if (hasInitialCue) {
        candidates.push({
          mouthShape: BILABIAL_INITIALS.has(indices.initial) ? "closed" : "teeth",
          weight: INITIAL_CONSONANT_CUE_WEIGHT,
          isPause: false,
        });
      }
      candidates.push(...vowelShapes.map((mouthShape) => ({
        mouthShape,
        weight: vowelShapes.length > 1 ? COMPOUND_VOWEL_CUE_WEIGHT : SIMPLE_VOWEL_CUE_WEIGHT,
        isPause: false,
      })));
      if (hasFinalCue) {
        candidates.push({
          mouthShape: "closed",
          weight: FINAL_CONSONANT_CUE_WEIGHT,
          isPause: false,
        });
      }

      for (const candidate of candidates) {
        const previous = weightedCues.at(-1);
        if (
          previous?.mouthShape === candidate.mouthShape
          && previous.isPause === candidate.isPause
          && sourceCharacterIndex <= previous.sourceCharacterIndex + 1
        ) {
          previous.weight += candidate.weight;
        } else {
          weightedCues.push({ ...candidate, sourceCharacterIndex });
        }
      }
    } else if (SPEECH_PAUSE_CHARACTERS.has(character)) {
      weightedCues.push({
        mouthShape: "rest",
        sourceCharacterIndex,
        weight: SPEECH_PAUSE_CUE_WEIGHT,
        isPause: true,
      });
    }
    sourceCharacterIndex += character.length;
  }

  if (!weightedCues.length || durationMs <= 0) return [];

  const totalWeight = weightedCues.reduce((total, cue) => total + cue.weight, 0);
  let elapsedWeight = 0;
  let startMs = 0;
  return weightedCues.map((weightedCue, index) => {
    elapsedWeight += weightedCue.weight;
    const endMs = index === weightedCues.length - 1
      ? durationMs
      : Math.round((elapsedWeight / totalWeight) * durationMs);
    const cue = {
      startMs,
      endMs,
      mouthShape: weightedCue.mouthShape,
      sourceCharacterIndex: weightedCue.sourceCharacterIndex,
      isPause: weightedCue.isPause,
    };
    startMs = endMs;
    return cue;
  });
}

export function getTimelineElapsedMsForCharacterIndex(timeline: VisemeCue[], characterIndex: number): number {
  if (!timeline.length) return 0;
  const safeCharacterIndex = Number.isFinite(characterIndex) ? Math.max(0, Math.floor(characterIndex)) : 0;
  const cue = timeline.find((candidate) => (candidate.sourceCharacterIndex ?? 0) >= safeCharacterIndex);
  return cue?.startMs ?? timeline.at(-1)?.endMs ?? 0;
}

export function getBoundaryAlignedTimelineElapsedMs(
  timeline: VisemeCue[],
  characterIndex: number,
  elapsedSinceBoundaryMs: number,
): number {
  const boundaryOffsetMs = getTimelineElapsedMsForCharacterIndex(timeline, characterIndex);
  const safeElapsedSinceBoundaryMs = Number.isFinite(elapsedSinceBoundaryMs)
    ? Math.max(0, elapsedSinceBoundaryMs)
    : 0;
  const timelineEndMs = timeline.at(-1)?.endMs ?? 0;
  return Math.min(timelineEndMs, boundaryOffsetMs + safeElapsedSinceBoundaryMs);
}

function getTimelineCue(
  timeline: VisemeCue[] | undefined,
  elapsedMs: number | undefined,
): VisemeCue | undefined {
  if (!timeline?.length || elapsedMs === undefined) return undefined;
  return timeline.find((cue) => cue.startMs <= elapsedMs && cue.endMs > elapsedMs);
}

function getTimelineMouthShape(
  timeline: VisemeCue[] | undefined,
  elapsedMs: number | undefined,
): MouthShape | undefined {
  return getTimelineCue(timeline, elapsedMs)?.mouthShape;
}

export function resolveLipSyncMouthShape(input: ResolveLipSyncMouthShapeInput): MouthShape {
  if (!input.speaking || input.reducedMotion) return "rest";
  if (input.audioAnalysisAvailable === undefined) return "rest";
  const rmsShape = getMouthShapeForRms(input.rms);
  const timelineShape = getTimelineMouthShape(input.timeline, input.elapsedMs);

  if (input.audioAnalysisAvailable) {
    if (rmsShape === "rest") return "rest";
    return timelineShape ?? rmsShape;
  }

  return timelineShape ?? rmsShape;
}

export function getEstimatedSpeechDurationMs(
  text: string,
  audioDurationMs: number | undefined,
  realtimeAudio = false,
): number {
  if (audioDurationMs && Number.isFinite(audioDurationMs) && audioDurationMs > 0) return audioDurationMs;
  const syllableDurationMs = realtimeAudio
    ? REALTIME_ESTIMATED_SPEECH_SYLLABLE_MS
    : BROWSER_ESTIMATED_SPEECH_SYLLABLE_MS;
  return Math.max(600, [...text].filter((character) => getHangulIndices(character)).length * syllableDurationMs);
}

function calculateRms(samples: Uint8Array<ArrayBuffer>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") return undefined;
  const browserWindow = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
}

type LipSyncAudioSourceFactory = Pick<AudioContext, "createMediaElementSource" | "createMediaStreamSource">;
type CachedMediaElementAudioSource = {
  context: AudioContext;
  sourceNode: MediaElementAudioSourceNode;
};

const mediaElementAudioSources = new WeakMap<HTMLMediaElement, CachedMediaElementAudioSource>();

export function isLipSyncAudioAnalysisAvailable(
  hasAnalyser: boolean,
  contextState: string | undefined,
): boolean {
  return hasAnalyser && contextState === "running";
}

export function createLipSyncAudioSourceNode(
  context: LipSyncAudioSourceFactory,
  audioSource?: HTMLMediaElement | null,
  audioStream?: MediaStream | null,
): MediaElementAudioSourceNode | MediaStreamAudioSourceNode | undefined {
  if (audioStream) return context.createMediaStreamSource(audioStream);
  if (audioSource) {
    const cached = mediaElementAudioSources.get(audioSource);
    if (cached) return cached.sourceNode;

    const sourceNode = context.createMediaElementSource(audioSource);
    mediaElementAudioSources.set(audioSource, {
      context: context as AudioContext,
      sourceNode,
    });
    return sourceNode;
  }
  return undefined;
}

export function useLipSyncDriverState(input: LipSyncDriverInput): LipSyncDriverState {
  const [rms, setRms] = useState(0);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState<number>();
  const [audioAnalysisAvailable, setAudioAnalysisAvailable] = useState<boolean | undefined>(
    input.audioSource || input.audioStream ? undefined : false,
  );
  const [mouthShapeStabilization, setMouthShapeStabilization] = useState<MouthShapeStabilizationState>({
    mouthShape: "rest",
    changedAtMs: 0,
  });
  const speaking = input.presentationState === "speaking";
  const timeline = useMemo(
    () => buildKoreanVisemeTimeline(
      input.speechText,
      getEstimatedSpeechDurationMs(input.speechText, audioDurationMs, Boolean(input.audioStream)),
    ),
    [audioDurationMs, input.audioStream, input.speechText],
  );
  const startTimeRef = useRef(0);
  const audioStartTimeRef = useRef(0);
  const audioDrivenElapsedMsRef = useRef(0);
  const audioDrivenStartedRef = useRef(false);
  const lastAudioDrivenFrameAtRef = useRef(0);
  const boundaryAnchorRef = useRef<{
    characterIndex: number;
    observedAtMs: number;
    sequence: number;
  } | undefined>(undefined);
  const speakingRef = useRef(speaking);
  const reducedMotionRef = useRef(input.reducedMotion);

  useEffect(() => {
    speakingRef.current = speaking;
    reducedMotionRef.current = input.reducedMotion;
  }, [input.reducedMotion, speaking]);

  useEffect(() => {
    const audioSource = input.audioSource;
    if (!audioSource) return;
    const syncDuration = () => {
      const durationMs = audioSource.duration * 1000;
      setAudioDurationMs(Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined);
    };
    syncDuration();
    audioSource.addEventListener("loadedmetadata", syncDuration);
    audioSource.addEventListener("durationchange", syncDuration);
    return () => {
      audioSource.removeEventListener("loadedmetadata", syncDuration);
      audioSource.removeEventListener("durationchange", syncDuration);
    };
  }, [input.audioSource]);

  useEffect(() => {
    if (!speaking || input.reducedMotion) {
      setRms(0);
      setMouthOpen(0);
      setElapsedMs(0);
      setMouthShapeStabilization({ mouthShape: "rest", changedAtMs: performance.now() });
      return;
    }

    startTimeRef.current = performance.now();
    audioStartTimeRef.current = input.audioSource?.currentTime ?? 0;
    audioDrivenElapsedMsRef.current = 0;
    audioDrivenStartedRef.current = false;
    lastAudioDrivenFrameAtRef.current = 0;
    boundaryAnchorRef.current = undefined;
    setMouthOpen(0);
    setMouthShapeStabilization({ mouthShape: "rest", changedAtMs: startTimeRef.current });
  }, [input.audioSource, input.reducedMotion, speaking]);

  useEffect(() => {
    if (!speaking || !input.speechBoundary) return;
    boundaryAnchorRef.current = {
      characterIndex: input.speechBoundary.characterIndex,
      observedAtMs: performance.now(),
      sequence: input.speechBoundary.sequence,
    };
  }, [input.speechBoundary, speaking]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const AudioContextConstructor = getAudioContextConstructor();
    let audioContext: AudioContext | undefined;
    let sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    let samples: Uint8Array<ArrayBuffer> | undefined;
    let frameId = 0;
    let lastFrameAt = 0;
    let active = true;

    if (AudioContextConstructor && input.audioStream) {
      try {
        const context = new AudioContextConstructor();
        audioContext = context;
        sourceNode = createLipSyncAudioSourceNode(context, input.audioSource, input.audioStream);
        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        sourceNode?.connect(analyser);
        samples = new Uint8Array(analyser.fftSize);
      } catch {
        analyser = undefined;
      }
    } else if (AudioContextConstructor && input.audioSource) {
      try {
        const cached = mediaElementAudioSources.get(input.audioSource);
        const context = cached?.context ?? new AudioContextConstructor();
        audioContext = context;
        sourceNode = cached?.sourceNode ?? createLipSyncAudioSourceNode(context, input.audioSource, null);
        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        sourceNode?.connect(analyser);
        analyser.connect(context.destination);
        samples = new Uint8Array(analyser.fftSize);
      } catch {
        analyser = undefined;
      }
    }

    const syncAudioAnalysisAvailability = () => {
      setAudioAnalysisAvailable(
        isLipSyncAudioAnalysisAvailable(Boolean(analyser), audioContext?.state),
      );
    };
    audioContext?.addEventListener("statechange", syncAudioAnalysisAvailability);
    syncAudioAnalysisAvailability();

    const resumeAudioContext = () => {
      void audioContext?.resume()
        .then(syncAudioAnalysisAvailability)
        .catch(() => setAudioAnalysisAvailable(false));
    };
    window.addEventListener("pointerdown", resumeAudioContext, { passive: true });
    window.addEventListener("keydown", resumeAudioContext);

    const update = (now: number) => {
      if (!active) return;
      if (
        speakingRef.current
        && !reducedMotionRef.current
        && now - lastFrameAt >= 1000 / MAX_LIP_SYNC_FPS
      ) {
        lastFrameAt = now;
        let nextRms = 0;
        if (analyser && samples) {
          analyser.getByteTimeDomainData(samples);
          nextRms = calculateRms(samples);
          setRms(nextRms);
          setMouthOpen((current) => smoothMouthOpenValue(current, getMouthOpenValueForRms(nextRms)));
        }

        let sourceElapsedMs: number;
        if (input.audioStream && analyser && samples) {
          const frameDeltaMs = lastAudioDrivenFrameAtRef.current > 0
            ? now - lastAudioDrivenFrameAtRef.current
            : 0;
          lastAudioDrivenFrameAtRef.current = now;
          if (nextRms > SILENCE_RMS_THRESHOLD) audioDrivenStartedRef.current = true;
          const currentMouthShape = getTimelineMouthShape(
            timeline,
            audioDrivenElapsedMsRef.current,
          );
          audioDrivenElapsedMsRef.current = advanceAudioDrivenTimelineElapsedMs(
            audioDrivenElapsedMsRef.current,
            frameDeltaMs,
            nextRms,
            audioDrivenStartedRef.current,
            currentMouthShape,
          );
          sourceElapsedMs = audioDrivenElapsedMsRef.current;
        } else if (boundaryAnchorRef.current) {
          sourceElapsedMs = getBoundaryAlignedTimelineElapsedMs(
            timeline,
            boundaryAnchorRef.current.characterIndex,
            now - boundaryAnchorRef.current.observedAtMs,
          );
        } else if (input.audioSource) {
          sourceElapsedMs = getRelativeAudioElapsedMs(
            input.audioSource.currentTime,
            audioStartTimeRef.current,
          );
        } else {
          sourceElapsedMs = now - startTimeRef.current;
        }
        setElapsedMs(sourceElapsedMs);
      }
      frameId = window.requestAnimationFrame(update);
    };
    frameId = window.requestAnimationFrame(update);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointerdown", resumeAudioContext);
      window.removeEventListener("keydown", resumeAudioContext);
      audioContext?.removeEventListener("statechange", syncAudioAnalysisAvailability);
      if (analyser) sourceNode?.disconnect(analyser);
      analyser?.disconnect();
      if (input.audioStream) void audioContext?.close().catch(() => undefined);
    };
  }, [input.audioSource, input.audioStream, timeline]);

  const requestedMouthShape = resolveLipSyncMouthShape({
    speaking,
    reducedMotion: input.reducedMotion,
    rms,
    timeline,
    elapsedMs,
    audioAnalysisAvailable,
  });
  const currentTimelineCue = getTimelineCue(timeline, elapsedMs);

  useEffect(() => {
    setMouthShapeStabilization((previous) => stabilizeMouthShape({
      previous,
      requestedMouthShape,
      nowMs: performance.now(),
      voiced: audioAnalysisAvailable === true
        ? rms > SILENCE_RMS_THRESHOLD
        : audioAnalysisAvailable === false && speaking,
      forceRest: !speaking || input.reducedMotion || currentTimelineCue?.isPause === true,
    }));
  }, [
    audioAnalysisAvailable,
    currentTimelineCue?.isPause,
    elapsedMs,
    input.reducedMotion,
    requestedMouthShape,
    rms,
    speaking,
  ]);

  return {
    mouthShape: mouthShapeStabilization.mouthShape,
    mouthOpen: !speaking || input.reducedMotion
      ? 0
      : audioAnalysisAvailable
        ? mouthOpen
        : getMouthOpenValueForShape(mouthShape),
  };
}

export function useLipSyncDriver(input: LipSyncDriverInput): MouthShape {
  return useLipSyncDriverState(input).mouthShape;
}

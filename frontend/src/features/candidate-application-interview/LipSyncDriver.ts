"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MouthShape = "rest" | "closed" | "open" | "wide" | "round" | "teeth";

export type VisemeCue = {
  startMs: number;
  endMs: number;
  mouthShape: MouthShape;
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
  reducedMotion: boolean;
}

export interface ResolveLipSyncMouthShapeInput {
  speaking: boolean;
  reducedMotion: boolean;
  rms: number;
  timeline?: VisemeCue[];
  elapsedMs?: number;
  audioAnalysisAvailable?: boolean;
}

export type CubismMouthOpacityCrossfade = {
  parameterId: "ParamMouthOpenY";
  controlType: "opacity-crossfade";
  deformationType: "reference-opacity-crossfade";
  layers: {
    "mouth-rest": number;
    "mouth-open-reference": number;
  };
};

const SILENCE_RMS_THRESHOLD = 0.012;
const OPEN_RMS_THRESHOLD = 0.07;
const MAX_LIP_SYNC_FPS = 30;
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
const SPEECH_PAUSE_CHARACTERS = new Set([",", ".", ";", ":", "!", "?", "…"]);

function clampMouthOpenValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function resolveCubismMouthOpacityCrossfade(mouthOpenValue: number): CubismMouthOpacityCrossfade {
  const openOpacity = clampMouthOpenValue(mouthOpenValue);
  return {
    parameterId: "ParamMouthOpenY",
    controlType: "opacity-crossfade",
    deformationType: "reference-opacity-crossfade",
    layers: {
      "mouth-rest": 1 - openOpacity,
      "mouth-open-reference": openOpacity,
    },
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
  if (OPEN_VOWELS.has(indices.vowel)) return "open";
  if (WIDE_VOWELS.has(indices.vowel)) return "wide";
  if (ROUND_VOWELS.has(indices.vowel)) return "round";
  return "rest";
}

export function getMouthShapeForRms(rms: number): MouthShape {
  if (rms <= SILENCE_RMS_THRESHOLD) return "rest";
  if (rms <= OPEN_RMS_THRESHOLD) return "closed";
  return "open";
}

export function buildKoreanVisemeTimeline(text: string, durationMs: number): VisemeCue[] {
  const mouthShapes = [...text].flatMap((character): MouthShape[] => {
    if (getHangulIndices(character)) return [getMouthShapeForKoreanCharacter(character)];
    if (SPEECH_PAUSE_CHARACTERS.has(character)) return ["rest"];
    return [];
  });
  if (!mouthShapes.length || durationMs <= 0) return [];

  const cueDuration = durationMs / mouthShapes.length;
  return mouthShapes.map((mouthShape, index) => ({
    startMs: Math.round(index * cueDuration),
    endMs: index === mouthShapes.length - 1 ? durationMs : Math.round((index + 1) * cueDuration),
    mouthShape,
  }));
}

function getTimelineMouthShape(timeline: VisemeCue[] | undefined, elapsedMs: number | undefined): MouthShape | undefined {
  if (!timeline?.length || elapsedMs === undefined) return undefined;
  return timeline.find((cue) => cue.startMs <= elapsedMs && cue.endMs > elapsedMs)?.mouthShape;
}

export function resolveLipSyncMouthShape(input: ResolveLipSyncMouthShapeInput): MouthShape {
  if (!input.speaking || input.reducedMotion) return "rest";
  if (input.audioAnalysisAvailable === undefined) return "rest";
  if (input.audioAnalysisAvailable) return getMouthShapeForRms(input.rms);
  return getTimelineMouthShape(input.timeline, input.elapsedMs) ?? getMouthShapeForRms(input.rms);
}

function getEstimatedSpeechDurationMs(text: string, audioDurationMs: number | undefined): number {
  if (audioDurationMs && Number.isFinite(audioDurationMs) && audioDurationMs > 0) return audioDurationMs;
  return Math.max(600, [...text].filter((character) => getHangulIndices(character)).length * 155);
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

export function createLipSyncAudioSourceNode(
  context: LipSyncAudioSourceFactory,
  audioSource?: HTMLMediaElement | null,
  audioStream?: MediaStream | null,
): MediaElementAudioSourceNode | MediaStreamAudioSourceNode | undefined {
  if (audioStream) return context.createMediaStreamSource(audioStream);
  if (audioSource) return context.createMediaElementSource(audioSource);
  return undefined;
}

export function useLipSyncDriver(input: LipSyncDriverInput): MouthShape {
  const [rms, setRms] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState<number>();
  const [audioAnalysisAvailable, setAudioAnalysisAvailable] = useState<boolean | undefined>(
    input.audioSource || input.audioStream ? undefined : false,
  );
  const speaking = input.presentationState === "speaking";
  const timeline = useMemo(
    () => buildKoreanVisemeTimeline(input.speechText, getEstimatedSpeechDurationMs(input.speechText, audioDurationMs)),
    [audioDurationMs, input.speechText],
  );
  const startTimeRef = useRef(0);

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
    if (!speaking || input.reducedMotion || typeof window === "undefined") {
      setRms(0);
      setElapsedMs(0);
      setAudioAnalysisAvailable(input.audioSource || input.audioStream ? undefined : false);
      return;
    }

    startTimeRef.current = performance.now();
    const AudioContextConstructor = getAudioContextConstructor();
    let audioContext: AudioContext | undefined;
    let sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    let samples: Uint8Array<ArrayBuffer> | undefined;
    let frameId = 0;
    let lastFrameAt = 0;
    let active = true;

    if (AudioContextConstructor && (input.audioSource || input.audioStream)) {
      try {
        const context = new AudioContextConstructor();
        audioContext = context;
        sourceNode = createLipSyncAudioSourceNode(context, input.audioSource, input.audioStream);
        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        sourceNode?.connect(analyser);
        if (!input.audioStream) analyser.connect(audioContext.destination);
        samples = new Uint8Array(analyser.fftSize);
      } catch {
        analyser = undefined;
      }
    }
    setAudioAnalysisAvailable(Boolean(analyser));

    const resumeAudioContext = () => {
      void audioContext?.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", resumeAudioContext, { passive: true });
    window.addEventListener("keydown", resumeAudioContext);

    const update = (now: number) => {
      if (!active) return;
      if (now - lastFrameAt >= 1000 / MAX_LIP_SYNC_FPS) {
        lastFrameAt = now;
        const sourceElapsedMs = input.audioSource && input.audioSource.currentTime > 0
          ? input.audioSource.currentTime * 1000
          : now - startTimeRef.current;
        setElapsedMs(sourceElapsedMs);
        if (analyser && samples) {
          analyser.getByteTimeDomainData(samples);
          setRms(calculateRms(samples));
        }
      }
      frameId = window.requestAnimationFrame(update);
    };
    frameId = window.requestAnimationFrame(update);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointerdown", resumeAudioContext);
      window.removeEventListener("keydown", resumeAudioContext);
      sourceNode?.disconnect();
      analyser?.disconnect();
      void audioContext?.close().catch(() => undefined);
    };
  }, [input.audioSource, input.audioStream, input.reducedMotion, speaking]);

  return resolveLipSyncMouthShape({
    speaking,
    reducedMotion: input.reducedMotion,
    rms,
    timeline,
    elapsedMs,
    audioAnalysisAvailable,
  });
}

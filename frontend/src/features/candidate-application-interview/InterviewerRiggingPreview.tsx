"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CubismProofInterviewerAvatar } from "./CubismProofInterviewerAvatar";
import {
  getCubismMouthOpenValue,
  initializeCubismSdk,
  type CubismRuntimeAvailability,
} from "./CubismSdkRuntime";
import { usePrefersReducedMotion } from "./InterviewAvatar";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";
import {
  useLipSyncDriverState,
  type AvatarPresentationState,
  type MouthShape,
} from "./LipSyncDriver";

const STORAGE_KEY = "candidate.interviewer-rigging-preview";

export type RiggingPreviewVariantId = "existing-look" | "rigged-look";
type CubismRuntimeState = CubismRuntimeAvailability["kind"] | "initializing";

type RiggingPreviewVariant = {
  id: RiggingPreviewVariantId;
  label: string;
  imagePath: string;
};

const variants: readonly RiggingPreviewVariant[] = [
  {
    id: "existing-look",
    label: "기존 인상 유지",
    imagePath: "/assets/interviewer-rigging/existing-look/master.png",
  },
  {
    id: "rigged-look",
    label: "리깅 최적화",
    imagePath: "/assets/interviewer-rigging/rigged-look/master.png",
  },
];

const presentationStates: readonly { id: AvatarPresentationState; label: string }[] = [
  { id: "idle", label: "대기" },
  { id: "speaking", label: "질문" },
  { id: "listening", label: "청취" },
  { id: "thinking", label: "생각" },
];

const mouthShapes: readonly MouthShape[] = ["rest", "closed", "open", "wide", "round", "teeth"];
const AUDIO_QA_SAMPLE_RATE = 16_000;
const AUDIO_QA_SPEECH_TEXT = "최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?";
const audioQaSegments = [
  { durationMs: 350, amplitude: 0, frequency: 0 },
  { durationMs: 650, amplitude: 0.04, frequency: 180 },
  { durationMs: 250, amplitude: 0, frequency: 0 },
  { durationMs: 750, amplitude: 0.18, frequency: 220 },
  { durationMs: 550, amplitude: 0.04, frequency: 170 },
  { durationMs: 450, amplitude: 0, frequency: 0 },
] as const;

export type AvatarQaState = {
  presentationState: AvatarPresentationState;
  mouthShape: MouthShape;
  reducedMotion: boolean;
};

export const DEFAULT_AVATAR_QA_STATE: AvatarQaState = {
  presentationState: "speaking",
  mouthShape: "open",
  reducedMotion: false,
};

export function updateAvatarQaState(state: AvatarQaState, update: Partial<AvatarQaState>): AvatarQaState {
  return { ...state, ...update };
}

export function getRiggingPreviewVariant(value: string | null | undefined): RiggingPreviewVariant {
  return variants.find((variant) => variant.id === value) ?? variants[0];
}

function writeWavText(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createAudioQaWavUrl(): string {
  const sampleCount = audioQaSegments.reduce(
    (total, segment) => total + Math.round((segment.durationMs / 1000) * AUDIO_QA_SAMPLE_RATE),
    0,
  );
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);

  writeWavText(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeWavText(view, 8, "WAVE");
  writeWavText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, AUDIO_QA_SAMPLE_RATE, true);
  view.setUint32(28, AUDIO_QA_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavText(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  let sampleIndex = 0;
  for (const segment of audioQaSegments) {
    const segmentSampleCount = Math.round((segment.durationMs / 1000) * AUDIO_QA_SAMPLE_RATE);
    const edgeSampleCount = Math.min(Math.round(AUDIO_QA_SAMPLE_RATE * 0.02), Math.floor(segmentSampleCount / 2));
    for (let segmentIndex = 0; segmentIndex < segmentSampleCount; segmentIndex += 1) {
      const edgeEnvelope = segment.amplitude === 0
        ? 0
        : Math.min(1, segmentIndex / edgeSampleCount, (segmentSampleCount - segmentIndex - 1) / edgeSampleCount);
      const sample = segment.amplitude * edgeEnvelope * Math.sin((2 * Math.PI * segment.frequency * sampleIndex) / AUDIO_QA_SAMPLE_RATE);
      view.setInt16(44 + sampleIndex * 2, Math.round(sample * 0x7fff), true);
      sampleIndex += 1;
    }
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export interface InterviewerAudioLipSyncQaProps {
  reducedMotion: boolean;
}

export function InterviewerAudioLipSyncQa({ reducedMotion }: InterviewerAudioLipSyncQaProps) {
  export interface InterviewerAudioLipSyncQaProps {
    reducedMotion: boolean;
  }

  export function InterviewerAudioLipSyncQa({ reducedMotion }: InterviewerAudioLipSyncQaProps) {
    const qaRootRef = useRef<HTMLDivElement | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState("");
    const [playbackState, setPlaybackState] = useState<"idle" | "playing" | "error">("idle");
    const [playbackError, setPlaybackError] = useState("");
    const [observedMouthShapes, setObservedMouthShapes] = useState<MouthShape[]>(["rest"]);
    const [observedCubismRange, setObservedCubismRange] = useState({ min: 0, max: 0 });
    const playing = playbackState === "playing";
    const presentationState: AvatarPresentationState = playing ? "speaking" : "idle";
    const lipSyncState = useLipSyncDriverState({
      presentationState,
      audioSource: audioElement,
      speechText: AUDIO_QA_SPEECH_TEXT,
      reducedMotion,
    });
    const [observedCubismRange, setObservedCubismRange] = useState({ min: 0, max: 0 });
    const playing = playbackState === "playing";
    const presentationState: AvatarPresentationState = playing ? "speaking" : "idle";
    const lipSyncState = useLipSyncDriverState({
      presentationState,
      audioSource: audioElement,
      speechText: AUDIO_QA_SPEECH_TEXT,
      reducedMotion,
    });

    useEffect(() => {
      const nextAudioUrl = createAudioQaWavUrl();
      setAudioUrl(nextAudioUrl);
      return () => URL.revokeObjectURL(nextAudioUrl);
    }, []);

    useEffect(() => {
      const qaRoot = qaRootRef.current;
      if (!qaRoot || typeof MutationObserver === "undefined") return;

      const recordMouthShape = () => {
        const mouthShape = qaRoot.querySelector(".local-interviewer-avatar")?.getAttribute("data-mouth-shape") as MouthShape | null;
        if (!mouthShape || !mouthShapes.includes(mouthShape)) return;
        setObservedMouthShapes((current) => current.at(-1) === mouthShape ? current : [...current, mouthShape]);
      };
      const observer = new MutationObserver(recordMouthShape);
      observer.observe(qaRoot, {
        attributeFilter: ["data-mouth-shape", "data-state"],
        attributes: true,
        childList: true,
        subtree: true,
      });
      recordMouthShape();
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      setObservedCubismRange((current) => ({
        min: Math.min(current.min, lipSyncState.mouthOpen),
        max: Math.max(current.max, lipSyncState.mouthOpen),
      }));
    }, [lipSyncState.mouthOpen]);

    useEffect(() => {
      setObservedCubismRange((current) => ({
        min: Math.min(current.min, lipSyncState.mouthOpen),
        max: Math.max(current.max, lipSyncState.mouthOpen),
      }));
    }, [lipSyncState.mouthOpen]);

    const bindAudioElement = useCallback((element: HTMLAudioElement | null) => {
      audioElementRef.current = element;
      setAudioElement(element);
    }, []);

    async function togglePlayback() {
      const currentAudioElement = audioElementRef.current;
      if (!currentAudioElement || !audioUrl) return;
      if (!currentAudioElement.paused) {
        currentAudioElement.pause();
        currentAudioElement.currentTime = 0;
        const currentAudioElement = audioElementRef.current;
        if (!currentAudioElement || !audioUrl) return;
        if (!currentAudioElement.paused) {
          currentAudioElement.pause();
          currentAudioElement.currentTime = 0;
          setPlaybackState("idle");
          return;
        }

        currentAudioElement.currentTime = 0;
        currentAudioElement.currentTime = 0;
        setPlaybackError("");
        setObservedMouthShapes(["rest"]);
        setObservedCubismRange({ min: 0, max: 0 });
        try {
          await currentAudioElement.play();
          await currentAudioElement.play();
        } catch (error) {
          setPlaybackError(error instanceof Error ? `${error.name}: ${error.message}` : "Unknown playback error");
          setPlaybackState("error");
        }
      }

      return (
        <div
          className="interviewer-rigging-preview__audio-qa"
          data-audio-qa-cubism-max={observedCubismRange.max.toFixed(3)}
          data-audio-qa-cubism-min={observedCubismRange.min.toFixed(3)}
          data-audio-qa-error={playbackError}
          data-audio-qa-observed-shapes={observedMouthShapes.join(",")}
          data-audio-qa-reduced-motion={reducedMotion ? "true" : "false"}
          data-audio-lip-sync-qa="true"
          data-audio-qa-state={playbackState}
          ref={qaRootRef}
        >
          <div className="interviewer-rigging-preview__audio-qa-controls">
            <strong>RMS 오디오 입력</strong>
            <button type="button" onClick={() => void togglePlayback()}>
              {playing ? "재생 정지" : "로컬 음원 재생"}
            </button>
            <span aria-live="polite">
              {playbackState === "error" ? "재생 실패" : playing ? "재생 중" : "준비"}
            </span>
            <small>
              {observedMouthShapes.join(" -> ")} · Cubism {lipSyncState.mouthOpen.toFixed(3)}
            </small>
            <audio
              aria-label="로컬 RMS QA 음원"
              controls
              onEnded={() => setPlaybackState("idle")}
              onPause={() => setPlaybackState("idle")}
              onPlay={() => {
                setPlaybackError("");
                setPlaybackState("playing");
              }}
              preload="auto"
              ref={bindAudioElement}
              src={audioUrl || undefined}
            />
          </div>
          return (
          <div
            className="interviewer-rigging-preview__audio-qa"
            data-audio-qa-cubism-max={observedCubismRange.max.toFixed(3)}
            data-audio-qa-cubism-min={observedCubismRange.min.toFixed(3)}
            data-audio-qa-error={playbackError}
            data-audio-qa-observed-shapes={observedMouthShapes.join(",")}
            data-audio-qa-reduced-motion={reducedMotion ? "true" : "false"}
            data-audio-lip-sync-qa="true"
            data-audio-qa-state={playbackState}
            ref={qaRootRef}
          >
            <div className="interviewer-rigging-preview__audio-qa-controls">
              <strong>RMS 오디오 입력</strong>
              <button type="button" onClick={() => void togglePlayback()}>
                {playing ? "재생 정지" : "로컬 음원 재생"}
              </button>
              <span aria-live="polite">
                {playbackState === "error" ? "재생 실패" : playing ? "재생 중" : "준비"}
              </span>
              <small>
                {observedMouthShapes.join(" -> ")} · Cubism {lipSyncState.mouthOpen.toFixed(3)}
              </small>
              <audio
                aria-label="로컬 RMS QA 음원"
                controls
                onEnded={() => setPlaybackState("idle")}
                onPause={() => setPlaybackState("idle")}
                onPlay={() => {
                  setPlaybackError("");
                  setPlaybackState("playing");
                }}
                preload="auto"
                ref={bindAudioElement}
                ref={bindAudioElement}
                src={audioUrl || undefined}
              />
            </div>

            <div className="interviewer-rigging-preview__audio-qa-stages">
              <div className="interviewer-rigging-preview__runtime-stage" data-audio-qa-renderer="png">
                <LocalInterviewerAvatar
                  presentationState={presentationState}
                  mouthShape={lipSyncState.mouthShape}
                  reducedMotion={reducedMotion}
                />
              </div>
              <div className="interviewer-rigging-preview__runtime-stage" data-audio-qa-renderer="cubism">
                <CubismProofInterviewerAvatar mouthOpen={lipSyncState.mouthOpen} reducedMotion={reducedMotion} />
              </div>
            </div>
          </div>
          );
}
          <div className="interviewer-rigging-preview__audio-qa-stages">
            <div className="interviewer-rigging-preview__runtime-stage" data-audio-qa-renderer="png">
              <LocalInterviewerAvatar
                presentationState={presentationState}
                mouthShape={lipSyncState.mouthShape}
                reducedMotion={reducedMotion}
              />
            </div>
            <div className="interviewer-rigging-preview__runtime-stage" data-audio-qa-renderer="cubism">
              <CubismProofInterviewerAvatar mouthOpen={lipSyncState.mouthOpen} reducedMotion={reducedMotion} />
            </div>
          </div>
        </div>
      );
    }

    export function InterviewerRiggingPreview() {
      const [selectedId, setSelectedId] = useState<RiggingPreviewVariantId>("existing-look");
      const [cubismRuntime, setCubismRuntime] = useState<CubismRuntimeState>("initializing");
      const [avatarQaState, setAvatarQaState] = useState<AvatarQaState>(DEFAULT_AVATAR_QA_STATE);
      const reducedMotion = usePrefersReducedMotion();
      const selected = getRiggingPreviewVariant(selectedId);
      export function InterviewerRiggingPreview() {
        const [selectedId, setSelectedId] = useState<RiggingPreviewVariantId>("existing-look");
        const [cubismRuntime, setCubismRuntime] = useState<CubismRuntimeState>("initializing");
        const [avatarQaState, setAvatarQaState] = useState<AvatarQaState>(DEFAULT_AVATAR_QA_STATE);
        const reducedMotion = usePrefersReducedMotion();
        const selected = getRiggingPreviewVariant(selectedId);

        useEffect(() => {
          setSelectedId(getRiggingPreviewVariant(window.localStorage.getItem(STORAGE_KEY)).id);
        }, []);

        useEffect(() => {
          let mounted = true;

          void initializeCubismSdk(document, true).then((result) => {
            if (mounted) setCubismRuntime(result.kind);
          });
          void initializeCubismSdk(document, true).then((result) => {
            if (mounted) setCubismRuntime(result.kind);
          });

          return () => {
            mounted = false;
          };
        }, []);

        function selectVariant(id: RiggingPreviewVariantId) {
          setSelectedId(id);
          window.localStorage.setItem(STORAGE_KEY, id);
        }

        return (
          <main className="interviewer-rigging-preview" data-cubism-runtime={cubismRuntime} data-rigging-variant={selected.id}>
            <header className="interviewer-rigging-preview__header">
              <p>AI Interviewer</p>
              <h1>2D 리깅 원본 시안</h1>
            </header>

            <div className="interviewer-rigging-preview__workspace">
              <fieldset className="interviewer-rigging-preview__selector">
                <legend>원본 시안</legend>
                {variants.map((variant) => (
                  <label className="interviewer-rigging-preview__option" data-selected={variant.id === selected.id ? "true" : "false"} key={variant.id}>
                    <input
                      checked={variant.id === selected.id}
                      name="interviewer-rigging-preview"
                      onChange={() => selectVariant(variant.id)}
                      type="radio"
                      value={variant.id}
                    />
                    <span>{variant.label}</span>
                  </label>
                ))}
              </fieldset>

              <figure className="interviewer-rigging-preview__canvas">
                <Image alt={`${selected.label} 면접관 원본 시안`} height={1536} priority src={selected.imagePath} unoptimized width={1024} />
              </figure>
            </div>

            <section className="interviewer-rigging-preview__avatar-qa" data-avatar-qa="true">
              <header className="interviewer-rigging-preview__section-header">
                <p>Runtime QA</p>
                <h2>운영 PNG 렌더러</h2>
              </header>

              <div className="interviewer-rigging-preview__qa-workspace">
                <div className="interviewer-rigging-preview__qa-controls">
                  <fieldset className="interviewer-rigging-preview__segmented-control">
                    <legend>상태</legend>
                    {presentationStates.map((state) => (
                      <label data-selected={state.id === avatarQaState.presentationState ? "true" : "false"} key={state.id}>
                        <input
                          checked={state.id === avatarQaState.presentationState}
                          name="interviewer-avatar-state"
                          onChange={() => setAvatarQaState((current) => updateAvatarQaState(current, { presentationState: state.id }))}
                          type="radio"
                          value={state.id}
                        />
                        <span>{state.label}</span>
                      </label>
                    ))}
                  </fieldset>

                  <fieldset className="interviewer-rigging-preview__segmented-control">
                    <legend>입 모양</legend>
                    {mouthShapes.map((shape) => (
                      <label data-selected={shape === avatarQaState.mouthShape ? "true" : "false"} key={shape}>
                        <input
                          checked={shape === avatarQaState.mouthShape}
                          name="interviewer-avatar-mouth"
                          onChange={() => setAvatarQaState((current) => updateAvatarQaState(current, { mouthShape: shape }))}
                          type="radio"
                          value={shape}
                        />
                        <span>{shape}</span>
                      </label>
                    ))}
                  </fieldset>

                  <label className="interviewer-rigging-preview__toggle">
                    <input
                      checked={avatarQaState.reducedMotion}
                      onChange={(event) => setAvatarQaState((current) => updateAvatarQaState(current, { reducedMotion: event.target.checked }))}
                      type="checkbox"
                    />
                    <span>모션 감소</span>
                  </label>
                </div>

                <div className="interviewer-rigging-preview__runtime-stage">
                  <LocalInterviewerAvatar {...avatarQaState} />
                </div>
              </div>

              <div className="interviewer-rigging-preview__cubism-proof" data-cubism-proof-qa="true">
                <div className="interviewer-rigging-preview__proof-record">
                  <strong>Cubism V4 deformation proof</strong>
                  <code>ParamMouthOpenY · 0 → 1</code>
                  <span>단일 ArtMesh 변형 · 완성형 자연 변형 아님</span>
                </div>
                <div className="interviewer-rigging-preview__runtime-stage">
                  <CubismProofInterviewerAvatar
                    mouthOpen={getCubismMouthOpenValue(avatarQaState.mouthShape)}
                    reducedMotion={avatarQaState.reducedMotion}
                  />
                </div>
              </div>

              <InterviewerAudioLipSyncQa reducedMotion={reducedMotion} />
            </section>
          </main>
        );
      }
          <div className="interviewer-rigging-preview__cubism-proof" data-cubism-proof-qa="true">
            <div className="interviewer-rigging-preview__proof-record">
              <strong>Cubism V4 deformation proof</strong>
              <code>ParamMouthOpenY · 0 → 1</code>
              <span>단일 ArtMesh 변형 · 완성형 자연 변형 아님</span>
            </div>
            <div className="interviewer-rigging-preview__runtime-stage">
              <CubismProofInterviewerAvatar
                mouthOpen={getCubismMouthOpenValue(avatarQaState.mouthShape)}
                reducedMotion={avatarQaState.reducedMotion}
              />
            </div>
          </div>

          <InterviewerAudioLipSyncQa reducedMotion={reducedMotion} />
        </section >
      </main >
    );
    }

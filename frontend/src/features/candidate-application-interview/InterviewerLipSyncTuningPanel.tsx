"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../../api/api-base-url";
import { createCandidateApiClient } from "./api";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";
import {
  getMouthShapeForRms,
  useLipSyncDriverState,
  type MouthShape,
} from "./LipSyncDriver";
import {
  clearLipSyncTuningSettings,
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
  normalizeLipSyncTuningSettings,
  readLipSyncTuningSettings,
  saveLipSyncTuningSettings,
  type LipSyncTuningSettings,
} from "./LipSyncTuning";
import {
  RealtimeLipSyncTuningController,
  type RealtimeLipSyncTuningStatus,
} from "./RealtimeLipSyncTuningController";
import { createRealtimeInterviewWebRtcConnection } from "./realtime-webrtc";

export const DEFAULT_LIP_SYNC_TUNING_SPEECH_TEXT =
  "안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.";

type TuningField = {
  key: keyof LipSyncTuningSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
};

const tuningFields: readonly TuningField[] = [
  {
    key: "timelineOffsetMs",
    label: "입 모양 시간차",
    min: -200,
    max: 200,
    step: 10,
    unit: "ms",
  },
  {
    key: "minimumShapeHoldMs",
    label: "최소 입 모양 유지",
    min: 60,
    max: 120,
    step: 10,
    unit: "ms",
  },
  {
    key: "silenceHangoverMs",
    label: "무음 여운",
    min: 0,
    max: 150,
    step: 10,
    unit: "ms",
  },
  {
    key: "fullOpenEnterThreshold",
    label: "큰 입 전환 기준",
    min: 0.45,
    max: 0.75,
    step: 0.01,
    unit: "",
  },
  {
    key: "fullOpenExitThreshold",
    label: "작은 입 복귀 기준",
    min: 0.25,
    max: 0.6,
    step: 0.01,
    unit: "",
  },
] as const;

type MouthTransition = {
  id: number;
  character: string;
  mouthShape: MouthShape;
  mouthVariant: string;
};

export interface InterviewerLipSyncTuningPanelProps {
  reducedMotion: boolean;
}

export function getRealtimeRmsPreviewMouthShape({
  playing,
  reducedMotion,
  rms,
}: {
  playing: boolean;
  reducedMotion: boolean;
  rms: number;
}): MouthShape {
  if (!playing || reducedMotion) return "rest";
  return getMouthShapeForRms(rms);
}

export function InterviewerLipSyncTuningPanel({
  reducedMotion,
}: InterviewerLipSyncTuningPanelProps) {
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<RealtimeLipSyncTuningController | null>(null);
  const currentCharacterIndexRef = useRef(0);
  const transitionIdRef = useRef(0);
  const [remoteAudioElement, setRemoteAudioElement] = useState<HTMLAudioElement | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [speechText, setSpeechText] = useState(DEFAULT_LIP_SYNC_TUNING_SPEECH_TEXT);
  const [draft, setDraft] = useState<LipSyncTuningSettings>(
    DEFAULT_LIP_SYNC_TUNING_SETTINGS,
  );
  const [playbackState, setPlaybackState] = useState<RealtimeLipSyncTuningStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("기본값으로 준비되었습니다.");
  const [transitions, setTransitions] = useState<MouthTransition[]>([]);
  const playing = playbackState === "playing";
  const connecting = playbackState === "connecting";
  const setRemoteAudioNode = useCallback((element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
    setRemoteAudioElement(element);
  }, []);
  const lipSyncState = useLipSyncDriverState({
    presentationState: playing ? "speaking" : "idle",
    audioSource: remoteAudioElement,
    audioStream: remoteStream,
    speechText,
    reducedMotion,
    tuning: draft,
  });
  const rmsOnlyMouthShape = getRealtimeRmsPreviewMouthShape({
    playing,
    reducedMotion,
    rms: lipSyncState.rms,
  });
  useLayoutEffect(() => {
    if (lipSyncState.sourceCharacterIndex !== undefined) {
      currentCharacterIndexRef.current = lipSyncState.sourceCharacterIndex;
    }
  }, [lipSyncState.sourceCharacterIndex]);

  useEffect(() => {
    setDraft(readLipSyncTuningSettings(window.localStorage));
  }, []);

  useEffect(() => {
    const previewRoot = previewRootRef.current;
    if (!previewRoot || typeof MutationObserver === "undefined") return;

    let previousKey = "";
    const recordTransition = () => {
      const avatar = previewRoot.querySelector(".local-interviewer-avatar");
      const mouthShape = avatar?.getAttribute("data-mouth-shape") as MouthShape | null;
      const mouthVariant = avatar?.getAttribute("data-mouth-variant");
      if (!mouthShape || !mouthVariant) return;

      const transitionKey = `${mouthShape}:${mouthVariant}`;
      if (transitionKey === previousKey) return;
      previousKey = transitionKey;
      transitionIdRef.current += 1;
      const character = speechText.at(currentCharacterIndexRef.current) ?? "-";
      setTransitions((current) => [
        ...current,
        {
          id: transitionIdRef.current,
          character,
          mouthShape,
          mouthVariant,
        },
      ].slice(-24));
    };

    const observer = new MutationObserver(recordTransition);
    observer.observe(previewRoot, {
      attributeFilter: ["data-mouth-shape", "data-mouth-variant", "data-state"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    recordTransition();
    return () => observer.disconnect();
  }, [speechText]);

  useEffect(() => () => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
  }, []);

  function updateDraft(key: keyof LipSyncTuningSettings, value: number) {
    setDraft((current) => normalizeLipSyncTuningSettings({
      ...current,
      [key]: value,
    }));
  }

  function playSpeech() {
    const audioElement = remoteAudioRef.current;
    if (!audioElement) {
      setPlaybackState("error");
      setStatusMessage("Realtime 오디오 출력을 준비하지 못했습니다.");
      return;
    }

    currentCharacterIndexRef.current = 0;
    setTransitions([]);
    if (!controllerRef.current) {
      const apiClient = createCandidateApiClient({ baseUrl: getApiBaseUrl() });
      controllerRef.current = new RealtimeLipSyncTuningController({
        createSession: async () => (
          await apiClient.createInterviewerPreviewRealtimeSession({
            mode: "realtime-voice",
            transport: "webrtc",
          })
        ).data,
        connect: createRealtimeInterviewWebRtcConnection,
        remoteAudioElement: audioElement,
        onSnapshot: (snapshot) => {
          setPlaybackState(snapshot.status);
          setStatusMessage(snapshot.message);
          setRemoteStream(snapshot.remoteStream);
        },
      });
    }
    void controllerRef.current.play(speechText);
  }

  function saveDraft() {
    try {
      const saved = saveLipSyncTuningSettings(draft);
      setDraft(saved);
      setStatusMessage("실제 면접 적용 설정으로 저장했습니다.");
    } catch {
      setStatusMessage("설정을 저장하지 못했습니다.");
    }
  }

  function resetDraft() {
    try {
      const defaults = clearLipSyncTuningSettings();
      setDraft(defaults);
      setStatusMessage("기본값으로 초기화했습니다.");
    } catch {
      setStatusMessage("브라우저 저장소를 초기화하지 못했습니다. 현재 편집값을 유지합니다.");
    }
  }

  return (
    <section
      className="interviewer-rigging-preview__tuning-panel"
      data-lip-sync-tuning-panel="true"
    >
      <audio
        aria-label="OpenAI Realtime 튜닝 음성"
        autoPlay
        hidden
        ref={setRemoteAudioNode}
      />
      <div className="interviewer-rigging-preview__tuning-controls">
        <div>
          <strong>OpenAI Realtime 립싱크 튜닝</strong>
          <p>슬라이더를 조정한 뒤 같은 문장을 반복 재생해 비교하세요.</p>
        </div>

        <label className="interviewer-rigging-preview__speech-input">
          <span>테스트 문장</span>
          <textarea
            onChange={(event) => setSpeechText(event.target.value)}
            rows={3}
            value={speechText}
          />
        </label>

        <div className="interviewer-rigging-preview__speech-actions">
          <button
            disabled={connecting}
            type="button"
            onClick={playing ? () => controllerRef.current?.stop() : playSpeech}
          >
            {playing
              ? "Realtime 음성 테스트 중지"
              : connecting
                ? "Realtime 연결 중..."
                : "Realtime 음성 테스트 시작"}
          </button>
          <span aria-live="polite" className="interviewer-rigging-preview__tuning-status">
            {statusMessage}
          </span>
        </div>

        <div className="interviewer-rigging-preview__tuning-fields">
          {tuningFields.map((field) => (
            <label className="interviewer-rigging-preview__tuning-field" key={field.key}>
              <span>{field.label}</span>
              <output>{draft[field.key]}{field.unit}</output>
              <input
                aria-label={field.label}
                max={field.max}
                min={field.min}
                onChange={(event) => updateDraft(field.key, Number(event.target.value))}
                step={field.step}
                type="range"
                value={draft[field.key]}
              />
            </label>
          ))}
        </div>

        <div className="interviewer-rigging-preview__tuning-actions">
          <button type="button" onClick={saveDraft}>설정 저장</button>
          <button type="button" onClick={resetDraft}>기본값으로 초기화</button>
        </div>
      </div>

      <div className="interviewer-rigging-preview__tuning-preview">
        <div className="interviewer-rigging-preview__tuning-comparison" ref={previewRootRef}>
          <article
            className="interviewer-rigging-preview__tuning-card"
            data-lip-sync-preview-renderer="current"
          >
            <header>
              <strong>현재 · Viseme + RMS</strong>
              <span>{lipSyncState.mouthShape}</span>
            </header>
            <div className="interviewer-rigging-preview__runtime-stage interviewer-rigging-preview__tuning-live">
              <LocalInterviewerAvatar
                fullOpenEnterThreshold={draft.fullOpenEnterThreshold}
                fullOpenExitThreshold={draft.fullOpenExitThreshold}
                mouthOpen={lipSyncState.mouthOpen}
                mouthShape={lipSyncState.mouthShape}
                presentationState={playing ? "speaking" : "idle"}
                reducedMotion={reducedMotion}
              />
            </div>
          </article>

          <article
            className="interviewer-rigging-preview__tuning-card"
            data-lip-sync-preview-renderer="legacy-rms"
          >
            <header>
              <strong>수정 전 · RMS 전용</strong>
              <span>{rmsOnlyMouthShape}</span>
            </header>
            <div className="interviewer-rigging-preview__runtime-stage interviewer-rigging-preview__tuning-live">
              <LocalInterviewerAvatar
                mouthShape={rmsOnlyMouthShape}
                presentationState={playing ? "speaking" : "idle"}
                reducedMotion={reducedMotion}
                rendererMode="legacy-rms"
              />
            </div>
          </article>
        </div>

        <div className="interviewer-rigging-preview__transition-history">
          <strong>최근 입 모양 전환</strong>
          <ol
            aria-label="최근 입 모양 전환 기록"
            className="interviewer-rigging-preview__tuning-history"
          >
            {transitions.length === 0 ? (
              <li>재생하면 전환 기록이 표시됩니다.</li>
            ) : transitions.map((transition) => (
              <li key={transition.id}>
                <span>{transition.character}</span>
                <span>{transition.mouthShape}</span>
                <span>{transition.mouthVariant}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

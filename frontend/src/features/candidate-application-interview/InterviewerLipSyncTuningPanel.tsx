"use client";

import { useEffect, useRef, useState } from "react";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";
import {
  useLipSyncDriverState,
  type MouthShape,
  type SpeechBoundaryTiming,
} from "./LipSyncDriver";
import {
  clearLipSyncTuningSettings,
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
  normalizeLipSyncTuningSettings,
  readLipSyncTuningSettings,
  saveLipSyncTuningSettings,
  type LipSyncTuningSettings,
} from "./LipSyncTuning";

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

type PlaybackState = "idle" | "playing" | "error" | "unsupported";

type MouthTransition = {
  id: number;
  character: string;
  mouthShape: MouthShape;
  mouthVariant: string;
};

export interface InterviewerLipSyncTuningPanelProps {
  reducedMotion: boolean;
}

export function InterviewerLipSyncTuningPanel({
  reducedMotion,
}: InterviewerLipSyncTuningPanelProps) {
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const boundarySequenceRef = useRef(0);
  const currentCharacterIndexRef = useRef(0);
  const transitionIdRef = useRef(0);
  const [speechText, setSpeechText] = useState(DEFAULT_LIP_SYNC_TUNING_SPEECH_TEXT);
  const [draft, setDraft] = useState<LipSyncTuningSettings>(
    DEFAULT_LIP_SYNC_TUNING_SETTINGS,
  );
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [statusMessage, setStatusMessage] = useState("기본값으로 준비되었습니다.");
  const [speechBoundary, setSpeechBoundary] = useState<SpeechBoundaryTiming>();
  const [transitions, setTransitions] = useState<MouthTransition[]>([]);
  const playing = playbackState === "playing";
  const lipSyncState = useLipSyncDriverState({
    presentationState: playing ? "speaking" : "idle",
    speechText,
    speechBoundary,
    reducedMotion,
    tuning: draft,
  });

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
    if (utteranceRef.current && typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      utteranceRef.current = null;
    }
  }, []);

  function updateDraft(key: keyof LipSyncTuningSettings, value: number) {
    setDraft((current) => normalizeLipSyncTuningSettings({
      ...current,
      [key]: value,
    }));
  }

  function stopSpeech(message = "음성 테스트를 중지했습니다.") {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setPlaybackState("idle");
    setSpeechBoundary(undefined);
    setStatusMessage(message);
  }

  function playSpeech() {
    if (
      typeof window === "undefined"
      || !("speechSynthesis" in window)
      || typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setPlaybackState("unsupported");
      setStatusMessage("이 브라우저는 음성 합성을 지원하지 않습니다.");
      return;
    }

    const trimmedSpeechText = speechText.trim();
    if (!trimmedSpeechText) {
      setPlaybackState("error");
      setStatusMessage("테스트 문장을 입력해주세요.");
      return;
    }

    window.speechSynthesis.cancel();
    boundarySequenceRef.current = 0;
    currentCharacterIndexRef.current = 0;
    setSpeechBoundary(undefined);
    setTransitions([]);

    const utterance = new SpeechSynthesisUtterance(trimmedSpeechText);
    utterance.lang = "ko-KR";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.voice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("ko")) ?? null;
    utterance.onboundary = (event) => {
      boundarySequenceRef.current += 1;
      currentCharacterIndexRef.current = event.charIndex;
      setSpeechBoundary({
        sequence: boundarySequenceRef.current,
        characterIndex: event.charIndex,
        elapsedMs: event.elapsedTime * 1000,
      });
    };
    utterance.onstart = () => {
      setPlaybackState("playing");
      setStatusMessage("음성과 입 모양을 재생하고 있습니다.");
    };
    utterance.onend = () => {
      utteranceRef.current = null;
      setPlaybackState("idle");
      setSpeechBoundary(undefined);
      setStatusMessage("음성 테스트가 끝났습니다.");
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      setPlaybackState("error");
      setSpeechBoundary(undefined);
      setStatusMessage("음성 테스트를 재생하지 못했습니다.");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function saveDraft() {
    try {
      const saved = saveLipSyncTuningSettings(draft);
      setDraft(saved);
      setStatusMessage("설정을 저장했습니다. 실제 면접에도 적용됩니다.");
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
      setDraft(DEFAULT_LIP_SYNC_TUNING_SETTINGS);
      setStatusMessage("기본값을 불러왔지만 브라우저 저장소는 초기화하지 못했습니다.");
    }
  }

  return (
    <section
      className="interviewer-rigging-preview__tuning-panel"
      data-lip-sync-tuning-panel="true"
    >
      <div className="interviewer-rigging-preview__tuning-controls">
        <div>
          <strong>브라우저 음성 립싱크 튜닝</strong>
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
          <button type="button" onClick={playing ? () => stopSpeech() : playSpeech}>
            {playing ? "음성 테스트 중지" : "음성 테스트 시작"}
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
        <div
          className="interviewer-rigging-preview__runtime-stage interviewer-rigging-preview__tuning-live"
          ref={previewRootRef}
        >
          <LocalInterviewerAvatar
            fullOpenEnterThreshold={draft.fullOpenEnterThreshold}
            fullOpenExitThreshold={draft.fullOpenExitThreshold}
            mouthOpen={lipSyncState.mouthOpen}
            mouthShape={lipSyncState.mouthShape}
            presentationState={playing ? "speaking" : "idle"}
            reducedMotion={reducedMotion}
          />
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

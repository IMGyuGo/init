"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./InterviewAvatar";
import { InterviewerLipSyncTuningPanel } from "./InterviewerLipSyncTuningPanel";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";
import {
  type AvatarPresentationState,
  type MouthShape,
} from "./LipSyncDriver";

const STORAGE_KEY = "candidate.interviewer-rigging-preview";

export type RiggingPreviewVariantId = "existing-look" | "rigged-look";

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

export function InterviewerRiggingPreview() {
  const [selectedId, setSelectedId] = useState<RiggingPreviewVariantId>("existing-look");
  const [avatarQaState, setAvatarQaState] = useState<AvatarQaState>(DEFAULT_AVATAR_QA_STATE);
  const reducedMotion = usePrefersReducedMotion();
  const selected = getRiggingPreviewVariant(selectedId);

  useEffect(() => {
    setSelectedId(getRiggingPreviewVariant(window.localStorage.getItem(STORAGE_KEY)).id);
  }, []);

  function selectVariant(id: RiggingPreviewVariantId) {
    setSelectedId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  return (
    <main className="interviewer-rigging-preview" data-avatar-renderer="png" data-rigging-variant={selected.id}>
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

        <InterviewerLipSyncTuningPanel reducedMotion={reducedMotion} />
      </section>
    </main>
  );
}

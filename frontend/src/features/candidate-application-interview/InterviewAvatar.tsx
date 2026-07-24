"use client";

import { useEffect, useState } from "react";
import { LocalInterviewerAvatar, getAvatarPresentationState } from "./LocalInterviewerAvatar";
import { useLipSyncDriverState } from "./LipSyncDriver";
import type { SpeechBoundaryTiming } from "./LipSyncDriver";
import { useStoredLipSyncTuningSettings } from "./LipSyncTuning";
import type { InterviewerSessionPhase } from "./view-model";

export interface InterviewAvatarProps {
  phase: InterviewerSessionPhase;
  audioSource?: HTMLMediaElement | null;
  audioStream?: MediaStream | null;
  speechText: string;
  speechBoundary?: SpeechBoundaryTiming;
  className?: string;
}

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function InterviewAvatar({ phase, audioSource, audioStream, speechText, speechBoundary, className }: InterviewAvatarProps) {
  const presentationState = getAvatarPresentationState(phase);
  const reducedMotion = usePrefersReducedMotion();
  const lipSyncTuning = useStoredLipSyncTuningSettings();
  const lipSyncState = useLipSyncDriverState({
    presentationState,
    audioSource,
    audioStream,
    speechText,
    speechBoundary,
    reducedMotion,
    tuning: lipSyncTuning,
  });

  return (
    <LocalInterviewerAvatar
      presentationState={presentationState}
      mouthShape={lipSyncState.mouthShape}
      mouthOpen={lipSyncState.mouthOpen}
      fullOpenEnterThreshold={lipSyncTuning.fullOpenEnterThreshold}
      fullOpenExitThreshold={lipSyncTuning.fullOpenExitThreshold}
      reducedMotion={reducedMotion}
      className={className}
    />
  );
}

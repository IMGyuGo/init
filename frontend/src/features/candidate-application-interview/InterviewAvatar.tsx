"use client";

import { useEffect, useState } from "react";
import { LocalInterviewerAvatar, getAvatarPresentationState } from "./LocalInterviewerAvatar";
import { useLipSyncDriver } from "./LipSyncDriver";
import type { InterviewerSessionPhase } from "./view-model";

export interface InterviewAvatarProps {
  phase: InterviewerSessionPhase;
  audioSource?: HTMLMediaElement | null;
  audioStream?: MediaStream | null;
  speechText: string;
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

export function InterviewAvatar({ phase, audioSource, audioStream, speechText, className }: InterviewAvatarProps) {
  const presentationState = getAvatarPresentationState(phase);
  const reducedMotion = usePrefersReducedMotion();
  const mouthShape = useLipSyncDriver({
    presentationState,
    audioSource,
    audioStream,
    speechText,
    reducedMotion,
  });

  return (
    <LocalInterviewerAvatar
      presentationState={presentationState}
      mouthShape={mouthShape}
      reducedMotion={reducedMotion}
      className={className}
    />
  );
}

"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { InterviewerSessionPhase } from "./view-model";
import {
  getMouthOpenValueForShape,
  type AvatarPresentationState,
  type MouthShape,
} from "./LipSyncDriver";
import { DEFAULT_LIP_SYNC_TUNING_SETTINGS } from "./LipSyncTuning";

const postureImageByState: Record<AvatarPresentationState, string> = {
  idle: "/assets/interviewer-avatar/listening.png",
  speaking: "/assets/interviewer-avatar/listening.png",
  listening: "/assets/interviewer-avatar/listening.png",
  thinking: "/assets/interviewer-avatar/thinking.png",
};

export type MouthOpenness = "small" | "full";
export type MouthSpriteVariant =
  | "rest"
  | "closed"
  | "open-small"
  | "open"
  | "wide-small"
  | "wide"
  | "round-small"
  | "round"
  | "teeth";

export interface MouthOpennessThresholds {
  enter: number;
  exit: number;
}

const DEFAULT_MOUTH_OPENNESS_THRESHOLDS: MouthOpennessThresholds = {
  enter: DEFAULT_LIP_SYNC_TUNING_SETTINGS.fullOpenEnterThreshold,
  exit: DEFAULT_LIP_SYNC_TUNING_SETTINGS.fullOpenExitThreshold,
};

const mouthSpriteVariants: MouthSpriteVariant[] = [
  "rest",
  "closed",
  "open-small",
  "open",
  "wide-small",
  "wide",
  "round-small",
  "round",
  "teeth",
];

const mouthImageByVariant: Record<MouthSpriteVariant, string> = {
  rest: "/assets/interviewer-avatar/mouth-sprite/rest.png",
  closed: "/assets/interviewer-avatar/mouth-sprite/closed.png",
  "open-small": "/assets/interviewer-avatar/mouth-sprite/open-small.png",
  open: "/assets/interviewer-avatar/mouth-sprite/open.png",
  "wide-small": "/assets/interviewer-avatar/mouth-sprite/wide-small.png",
  wide: "/assets/interviewer-avatar/mouth-sprite/wide.png",
  "round-small": "/assets/interviewer-avatar/mouth-sprite/round-small.png",
  round: "/assets/interviewer-avatar/mouth-sprite/round.png",
  teeth: "/assets/interviewer-avatar/mouth-sprite/teeth.png",
};

export function resolveMouthOpenness(
  previous: MouthOpenness,
  mouthOpen: number,
  thresholds: MouthOpennessThresholds = DEFAULT_MOUTH_OPENNESS_THRESHOLDS,
): MouthOpenness {
  if (!Number.isFinite(mouthOpen)) return previous;
  if (previous === "full") {
    return mouthOpen <= thresholds.exit ? "small" : "full";
  }
  return mouthOpen >= thresholds.enter ? "full" : "small";
}

export function getMouthSpriteVariant(
  mouthShape: MouthShape,
  openness: MouthOpenness,
): MouthSpriteVariant {
  if (mouthShape === "open" || mouthShape === "wide" || mouthShape === "round") {
    return openness === "small" ? `${mouthShape}-small` : mouthShape;
  }
  return mouthShape;
}

export interface LocalInterviewerAvatarProps {
  presentationState: AvatarPresentationState;
  mouthShape: MouthShape;
  mouthOpen?: number;
  fullOpenEnterThreshold?: number;
  fullOpenExitThreshold?: number;
  reducedMotion: boolean;
  className?: string;
}

export function getAvatarPresentationState(phase: InterviewerSessionPhase): AvatarPresentationState {
  if (phase === "AI_SPEAKING") return "speaking";
  if (phase === "USER_SPEAKING") return "listening";
  if (phase === "AI_THINKING") return "thinking";
  return "idle";
}

export function LocalInterviewerAvatar({
  presentationState,
  mouthShape,
  mouthOpen = getMouthOpenValueForShape(mouthShape),
  fullOpenEnterThreshold = DEFAULT_MOUTH_OPENNESS_THRESHOLDS.enter,
  fullOpenExitThreshold = DEFAULT_MOUTH_OPENNESS_THRESHOLDS.exit,
  reducedMotion,
  className = "",
}: LocalInterviewerAvatarProps) {
  const [mouthOpenness, setMouthOpenness] = useState<MouthOpenness>(() => (
    resolveMouthOpenness("small", mouthOpen, {
      enter: fullOpenEnterThreshold,
      exit: fullOpenExitThreshold,
    })
  ));

  useEffect(() => {
    if (presentationState !== "speaking" || reducedMotion) {
      setMouthOpenness("small");
      return;
    }
    setMouthOpenness((previous) => resolveMouthOpenness(previous, mouthOpen, {
      enter: fullOpenEnterThreshold,
      exit: fullOpenExitThreshold,
    }));
  }, [fullOpenEnterThreshold, fullOpenExitThreshold, mouthOpen, presentationState, reducedMotion]);

  const renderedMouthShape: MouthShape = presentationState === "speaking" && !reducedMotion ? mouthShape : "rest";
  const renderedMouthVariant = getMouthSpriteVariant(renderedMouthShape, mouthOpenness);
  const renderState = presentationState === "speaking" ? "talking" : presentationState;
  const postureState = presentationState === "speaking" && reducedMotion ? "idle" : presentationState;
  const shouldActivateMouth = presentationState === "speaking"
    && !reducedMotion
    && mouthShape !== "rest"
    && mouthShape !== "closed";

  return (
    <div
      className={["local-interviewer-avatar", className].filter(Boolean).join(" ")}
      data-state={renderState}
      data-mouth-shape={renderedMouthShape}
      data-mouth-variant={renderedMouthVariant}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-hidden="true"
    >
      <Image
        alt=""
        className="local-interviewer-avatar__posture"
        draggable={false}
        height={1448}
        src={postureImageByState[postureState]}
        unoptimized
        width={1086}
      />
      {mouthSpriteVariants.map((variant) => (
        <Image
          key={variant}
          alt=""
          className="local-interviewer-avatar__mouth"
          data-mouth-variant={variant}
          data-active={shouldActivateMouth && variant === renderedMouthVariant ? "true" : "false"}
          draggable={false}
          height={105}
          loading="eager"
          src={mouthImageByVariant[variant]}
          unoptimized
          width={230}
        />
      ))}
    </div>
  );
}

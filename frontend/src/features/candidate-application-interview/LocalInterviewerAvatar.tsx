"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import type { InterviewerSessionPhase } from "./view-model";
import {
  getMouthOpenValueForShape,
  type AvatarPresentationState,
  type MouthShape,
} from "./LipSyncDriver";
import { DEFAULT_LIP_SYNC_TUNING_SETTINGS } from "./LipSyncTuning";
import {
  getMouthSpriteRegistrationCss,
  type MouthSpriteVariant,
} from "./MouthSpriteRegistration";

export type { MouthSpriteVariant } from "./MouthSpriteRegistration";

const postureImageByState: Record<AvatarPresentationState, string> = {
  idle: "/assets/interviewer-avatar/listening.png",
  speaking: "/assets/interviewer-avatar/listening.png",
  listening: "/assets/interviewer-avatar/listening.png",
  thinking: "/assets/interviewer-avatar/thinking.png",
};

export type MouthOpenness = "small" | "full";
export type LocalInterviewerAvatarRendererMode = "current" | "legacy-rms";

type MouthSpriteStyle = CSSProperties & Record<
  "--mouth-register-x" | "--mouth-register-y",
  string
>;

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
const activeMouthSpriteVariants = mouthSpriteVariants.filter(
  (variant) => variant !== "rest",
);

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
  // The small sprites include a separately positioned face patch, so translating
  // them to the lip anchor also shifts the surrounding skin over the base image.
  // Keep the audio hysteresis state, but render only the aligned base variants
  // until small sprites are regenerated from the exact same source geometry.
  void openness;
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
  rendererMode?: LocalInterviewerAvatarRendererMode;
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
  rendererMode = "current",
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
  const postureImagePath = rendererMode === "legacy-rms" && postureState === "speaking"
    ? "/assets/interviewer-avatar/talking.png"
    : postureImageByState[postureState];
  const shouldActivateMouth = presentationState === "speaking"
    && !reducedMotion
    && mouthShape !== "rest"
    && (rendererMode === "legacy-rms" || mouthShape !== "closed");
  const shouldShowMouthUnderlay = presentationState === "speaking" && !reducedMotion;

  return (
    <div
      className={["local-interviewer-avatar", className].filter(Boolean).join(" ")}
      data-state={renderState}
      data-mouth-shape={renderedMouthShape}
      data-mouth-variant={renderedMouthVariant}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-renderer-mode={rendererMode}
      aria-hidden="true"
    >
      <Image
        alt=""
        className="local-interviewer-avatar__posture"
        draggable={false}
        height={1448}
        src={postureImagePath}
        unoptimized
        width={1086}
      />
      <div className="local-interviewer-avatar__mouth-window">
        <Image
          alt=""
          className="local-interviewer-avatar__mouth-underlay"
          data-mouth-layer="underlay"
          data-visible={shouldShowMouthUnderlay ? "true" : "false"}
          draggable={false}
          height={105}
          loading="eager"
          src={mouthImageByVariant.rest}
          unoptimized
          width={230}
        />
        {activeMouthSpriteVariants.map((variant) => {
          const registration = getMouthSpriteRegistrationCss(variant);
          const mouthStyle: MouthSpriteStyle = {
            "--mouth-register-x": registration.x,
            "--mouth-register-y": registration.y,
          };

          return (
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
              style={mouthStyle}
              unoptimized
              width={230}
            />
          );
        })}
      </div>
    </div>
  );
}

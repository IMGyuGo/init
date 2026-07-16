import Image from "next/image";
import type { InterviewerSessionPhase } from "./view-model";
import type { AvatarPresentationState, MouthShape } from "./LipSyncDriver";

const postureImageByState: Record<AvatarPresentationState, string> = {
  idle: "/assets/interviewer-avatar/listening.png",
  speaking: "/assets/interviewer-avatar/talking.png",
  listening: "/assets/interviewer-avatar/listening.png",
  thinking: "/assets/interviewer-avatar/thinking.png",
};

const mouthShapes: MouthShape[] = ["rest", "closed", "open", "wide", "round", "teeth"];

const mouthImageByShape: Record<MouthShape, string> = {
  rest: "/assets/interviewer-avatar/mouth-sprite/rest.png",
  closed: "/assets/interviewer-avatar/mouth-sprite/closed.png",
  open: "/assets/interviewer-avatar/mouth-sprite/open.png",
  wide: "/assets/interviewer-avatar/mouth-sprite/wide.png",
  round: "/assets/interviewer-avatar/mouth-sprite/round.png",
  teeth: "/assets/interviewer-avatar/mouth-sprite/teeth.png",
};

export interface LocalInterviewerAvatarProps {
  presentationState: AvatarPresentationState;
  mouthShape: MouthShape;
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
  reducedMotion,
  className = "",
}: LocalInterviewerAvatarProps) {
  const renderedMouthShape: MouthShape = presentationState === "speaking" && !reducedMotion ? mouthShape : "rest";
  const renderState = presentationState === "speaking" ? "talking" : presentationState;
  const postureState = presentationState === "speaking" && reducedMotion ? "idle" : presentationState;
  const shouldActivateMouth = presentationState === "speaking" && !reducedMotion;

  return (
    <div
      className={["local-interviewer-avatar", className].filter(Boolean).join(" ")}
      data-state={renderState}
      data-mouth-shape={renderedMouthShape}
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
      {mouthShapes.map((shape) => (
        <Image
          key={shape}
          alt=""
          className="local-interviewer-avatar__mouth"
          data-mouth-shape={shape}
          data-active={shouldActivateMouth && shape === mouthShape ? "true" : "false"}
          draggable={false}
          height={105}
          loading="eager"
          src={mouthImageByShape[shape]}
          unoptimized
          width={230}
        />
      ))}
    </div>
  );
}

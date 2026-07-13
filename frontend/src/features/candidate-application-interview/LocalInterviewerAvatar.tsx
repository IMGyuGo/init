import type { InterviewerSessionPhase } from "./view-model";
import type { AvatarPresentationState, MouthShape } from "./LipSyncDriver";

const postureImageByState: Record<AvatarPresentationState, string> = {
  idle: "/assets/interviewer-avatar/listening.png",
  speaking: "/assets/interviewer-avatar/talking.png",
  listening: "/assets/interviewer-avatar/listening.png",
  thinking: "/assets/interviewer-avatar/thinking.png",
};

const mouthImageByShape: Record<MouthShape, string> = {
  rest: "/assets/interviewer-avatar/mouth/rest.png",
  closed: "/assets/interviewer-avatar/mouth/closed.png",
  open: "/assets/interviewer-avatar/mouth/open.png",
  wide: "/assets/interviewer-avatar/mouth/wide.png",
  round: "/assets/interviewer-avatar/mouth/round.png",
  teeth: "/assets/interviewer-avatar/mouth/teeth.png",
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
  const shouldRenderMouthOverlay = presentationState === "speaking" && !reducedMotion;

  return (
    <div
      className={["local-interviewer-avatar", className].filter(Boolean).join(" ")}
      data-state={renderState}
      data-mouth-shape={renderedMouthShape}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-hidden="true"
    >
      <img className="local-interviewer-avatar__posture" src={postureImageByState[postureState]} alt="" draggable={false} />
      {shouldRenderMouthOverlay ? (
        <img className="local-interviewer-avatar__mouth" src={mouthImageByShape[renderedMouthShape]} alt="" draggable={false} />
      ) : null}
    </div>
  );
}

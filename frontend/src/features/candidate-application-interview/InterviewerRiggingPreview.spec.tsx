import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_AVATAR_QA_STATE,
  getRiggingPreviewVariant,
  InterviewerAudioLipSyncQa,
  InterviewerRiggingPreview,
  updateAvatarQaState,
} from "./InterviewerRiggingPreview";
import { CubismProofInterviewerAvatar } from "./CubismProofInterviewerAvatar";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";

assert.equal(getRiggingPreviewVariant("rigged-look").id, "rigged-look");
assert.equal(getRiggingPreviewVariant("unknown").id, "existing-look");

const markup = renderToStaticMarkup(<InterviewerRiggingPreview />);

assert.match(markup, /data-rigging-variant="existing-look"/);
assert.match(markup, /data-cubism-runtime="initializing"/);
assert.match(markup, /src="\/assets\/interviewer-rigging\/existing-look\/master\.png"/);
assert.doesNotMatch(markup, /_next\/image/);
assert.match(markup, /name="interviewer-rigging-preview"/);
assert.match(markup, /data-avatar-qa="true"/);
assert.match(markup, /data-state="talking"/);
assert.match(markup, /data-mouth-shape="open"/);
assert.match(markup, /name="interviewer-avatar-state"/);
assert.match(markup, /name="interviewer-avatar-mouth"/);
assert.match(markup, /type="checkbox"/);
assert.match(markup, /data-audio-lip-sync-qa="true"/);
assert.match(markup, /data-audio-qa-state="idle"/);
assert.match(markup, /data-audio-qa-error=""/);
assert.match(markup, /data-audio-qa-observed-shapes="rest"/);
assert.match(markup, /data-audio-qa-cubism-min="0\.000"/);
assert.match(markup, /data-audio-qa-cubism-max="0\.000"/);
assert.match(markup, /data-audio-qa-renderer="png"/);
assert.match(markup, /data-audio-qa-renderer="cubism"/);
assert.match(markup, /aria-label="로컬 RMS QA 음원"/);
assert.match(markup, /controls=""/);
assert.match(markup, />로컬 음원 재생</);
assert.match(markup, /data-cubism-proof-qa="true"/);
assert.match(markup, /ParamMouthOpenY/);
assert.match(markup, /Cubism V4 deformation proof/);
assert.match(markup, /단일 ArtMesh 변형/);
assert.match(markup, /완성형 자연 변형 아님/);

const reducedAudioQaMarkup = renderToStaticMarkup(
  <InterviewerAudioLipSyncQa reducedMotion />,
);
assert.match(reducedAudioQaMarkup, /data-audio-qa-reduced-motion="true"/);
assert.match(reducedAudioQaMarkup, /data-reduced-motion="true"/);

const previewRouteSource = readFileSync(new URL("../../app/interviewer-preview/page.tsx", import.meta.url), "utf8");
assert.match(previewRouteSource, /CandidatePages\.module\.css/);

const previewCssSource = readFileSync(new URL("./InterviewerRiggingPreview.module.css", import.meta.url), "utf8");
assert.doesNotMatch(previewCssSource, /__runtime-stage \.local-interviewer-avatar/);
assert.match(previewCssSource, /__segmented-control label:focus-within/);

const teethState = updateAvatarQaState(DEFAULT_AVATAR_QA_STATE, { mouthShape: "teeth" });
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...teethState} />), /data-mouth-shape="teeth"/);

const reducedState = updateAvatarQaState(teethState, { reducedMotion: true });
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...reducedState} />), /data-mouth-shape="rest"/);

const listeningState = updateAvatarQaState(DEFAULT_AVATAR_QA_STATE, { presentationState: "listening" });
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...listeningState} />), /data-state="listening"/);
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...listeningState} />), /data-mouth-shape="rest"/);

const cubismProofMarkup = renderToStaticMarkup(
  <CubismProofInterviewerAvatar mouthOpen={0.42} reducedMotion={false} />,
);

assert.match(cubismProofMarkup, /data-cubism-proof-avatar="true"/);
assert.match(cubismProofMarkup, /data-cubism-model-status="loading"/);
assert.match(cubismProofMarkup, /data-cubism-mouth-open="0\.42"/);
assert.match(cubismProofMarkup, /data-cubism-diagnostic=""/);
assert.match(
  cubismProofMarkup,
  /src="\/assets\/interviewer-cubism\/v4-deformation-proof\/interviewer-v4-deformation-proof-base\.png"/,
);
assert.match(cubismProofMarkup, /aria-label="Cubism V4 면접관 변형 proof 모델"/);
assert.match(cubismProofMarkup, /<canvas/);

const clampedCubismProofMarkup = renderToStaticMarkup(
  <CubismProofInterviewerAvatar mouthOpen={2} reducedMotion={false} />,
);
assert.match(clampedCubismProofMarkup, /data-cubism-mouth-open="1"/);

const reducedCubismProofMarkup = renderToStaticMarkup(
  <CubismProofInterviewerAvatar mouthOpen={0.8} reducedMotion />,
);
assert.match(reducedCubismProofMarkup, /data-cubism-mouth-open="0"/);

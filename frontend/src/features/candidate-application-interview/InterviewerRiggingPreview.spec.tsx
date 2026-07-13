import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_AVATAR_QA_STATE,
  getRiggingPreviewVariant,
  InterviewerRiggingPreview,
  updateAvatarQaState,
} from "./InterviewerRiggingPreview";
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
assert.match(markup, /aria-label="로컬 RMS QA 음원"/);
assert.match(markup, /controls=""/);
assert.match(markup, />로컬 음원 재생</);

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

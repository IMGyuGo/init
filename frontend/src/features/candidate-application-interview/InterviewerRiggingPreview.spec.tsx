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
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";

assert.equal(getRiggingPreviewVariant("rigged-look").id, "rigged-look");
assert.equal(getRiggingPreviewVariant("unknown").id, "existing-look");

const markup = renderToStaticMarkup(<InterviewerRiggingPreview />);

assert.match(markup, /data-rigging-variant="existing-look"/);
assert.match(markup, /data-avatar-renderer="png"/);
assert.doesNotMatch(markup, /cubism/i);
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
assert.match(markup, /data-audio-qa-renderer="png"/);
assert.match(markup, /aria-label="로컬 RMS QA 음원"/);
assert.match(markup, /controls=""/);
assert.match(markup, />로컬 음원 재생</);

const reducedAudioQaMarkup = renderToStaticMarkup(
  <InterviewerAudioLipSyncQa reducedMotion />,
);
assert.match(reducedAudioQaMarkup, /data-audio-qa-reduced-motion="true"/);
assert.match(reducedAudioQaMarkup, /data-reduced-motion="true"/);

const previewRouteSource = readFileSync(new URL("../../app/interviewer-preview/page.tsx", import.meta.url), "utf8");
assert.match(previewRouteSource, /CandidatePages\.module\.css/);

const previewSource = readFileSync(new URL("./InterviewerRiggingPreview.tsx", import.meta.url), "utf8");
assert.doesNotMatch(previewSource, /Cubism|interviewer-cubism/);

const interviewAvatarSource = readFileSync(new URL("./InterviewAvatar.tsx", import.meta.url), "utf8");
assert.match(interviewAvatarSource, /LocalInterviewerAvatar/);
assert.doesNotMatch(interviewAvatarSource, /Cubism|interviewer-cubism/);

const lipSyncDriverSource = readFileSync(new URL("./LipSyncDriver.ts", import.meta.url), "utf8");
assert.doesNotMatch(lipSyncDriverSource, /Cubism|interviewer-cubism/);

const candidatePagesSource = readFileSync(new URL("./CandidatePages.tsx", import.meta.url), "utf8");
assert.match(candidatePagesSource, /utterance\.onboundary/);
assert.match(candidatePagesSource, /utterance\.rate\s*=\s*0\.9;/);
assert.doesNotMatch(candidatePagesSource, /utterance\.rate\s*=\s*0\.95;/);
assert.match(candidatePagesSource, /speechBoundary=\{interviewerSpeechBoundary\}/);
assert.match(candidatePagesSource, /interviewerSpeechUsesRealtimeAudio \? realtimeRemoteAudioStream : null/);
assert.match(
  candidatePagesSource,
  /purpose:\s*"interview_encouragement"[\s\S]{0,900}setActiveInterviewerSpeechText\(decision\.text\)[\s\S]{0,300}setInterviewerSpeechUsesRealtimeAudio\(true\)[\s\S]{0,300}setQuestionSpeechPlaying\(true\)/,
  "silence encouragement should drive the same realtime lip-sync presentation as question speech",
);
assert.match(
  candidatePagesSource,
  /metadata\.purpose === "interview_encouragement"[\s\S]{0,500}setQuestionSpeechPlaying\(false\)[\s\S]{0,300}setInterviewerSpeechUsesRealtimeAudio\(false\)/,
  "silence encouragement completion should return the avatar to its listening mouth",
);
assert.match(
  candidatePagesSource,
  /runtimePrimaryScreen === "interviewer"\s*&&\s*showInterviewerPanel\s*&&\s*interviewerInfoOpen/,
  "the interviewer info panel should close out of the candidate-primary layout",
);

const previewCssSource = readFileSync(new URL("./InterviewerRiggingPreview.module.css", import.meta.url), "utf8");
assert.doesNotMatch(previewCssSource, /__runtime-stage \.local-interviewer-avatar/);
assert.doesNotMatch(previewCssSource, /cubism/i);
assert.match(previewCssSource, /__segmented-control label:focus-within/);

const teethState = updateAvatarQaState(DEFAULT_AVATAR_QA_STATE, { mouthShape: "teeth" });
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...teethState} />), /data-mouth-shape="teeth"/);

const reducedState = updateAvatarQaState(teethState, { reducedMotion: true });
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...reducedState} />), /data-mouth-shape="rest"/);

const listeningState = updateAvatarQaState(DEFAULT_AVATAR_QA_STATE, { presentationState: "listening" });
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...listeningState} />), /data-state="listening"/);
assert.match(renderToStaticMarkup(<LocalInterviewerAvatar {...listeningState} />), /data-mouth-shape="rest"/);

import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";

const talkingMarkup = renderToStaticMarkup(
  <LocalInterviewerAvatar presentationState="speaking" mouthShape="wide" reducedMotion={false} />,
);

assert.match(talkingMarkup, /data-state="talking"/);
assert.match(talkingMarkup, /data-mouth-shape="wide"/);
assert.match(talkingMarkup, /src="\/assets\/interviewer-avatar\/talking\.png"/);
assert.match(talkingMarkup, /src="\/assets\/interviewer-avatar\/mouth\/wide\.png"/);

const listeningMarkup = renderToStaticMarkup(
  <LocalInterviewerAvatar presentationState="listening" mouthShape="teeth" reducedMotion={false} />,
);

assert.match(listeningMarkup, /data-state="listening"/);
assert.match(listeningMarkup, /data-mouth-shape="rest"/);
assert.match(listeningMarkup, /src="\/assets\/interviewer-avatar\/listening\.png"/);
assert.doesNotMatch(listeningMarkup, /local-interviewer-avatar__mouth/);

const thinkingMarkup = renderToStaticMarkup(
  <LocalInterviewerAvatar presentationState="thinking" mouthShape="round" reducedMotion />,
);

assert.match(thinkingMarkup, /data-state="thinking"/);
assert.match(thinkingMarkup, /data-reduced-motion="true"/);
assert.match(thinkingMarkup, /src="\/assets\/interviewer-avatar\/thinking\.png"/);
assert.doesNotMatch(thinkingMarkup, /local-interviewer-avatar__mouth/);

const idleMarkup = renderToStaticMarkup(
  <LocalInterviewerAvatar presentationState="idle" mouthShape="open" reducedMotion={false} />,
);

assert.match(idleMarkup, /data-state="idle"/);
assert.match(idleMarkup, /data-mouth-shape="rest"/);
assert.doesNotMatch(idleMarkup, /local-interviewer-avatar__mouth/);

const reducedTalkingMarkup = renderToStaticMarkup(
  <LocalInterviewerAvatar presentationState="speaking" mouthShape="open" reducedMotion />,
);

assert.match(reducedTalkingMarkup, /data-state="talking"/);
assert.match(reducedTalkingMarkup, /data-mouth-shape="rest"/);
assert.match(reducedTalkingMarkup, /src="\/assets\/interviewer-avatar\/listening\.png"/);
assert.doesNotMatch(reducedTalkingMarkup, /local-interviewer-avatar__mouth/);

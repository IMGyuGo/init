import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalInterviewerAvatar } from "./LocalInterviewerAvatar";
import type { AvatarPresentationState, MouthShape } from "./LipSyncDriver";

const mouthShapes: MouthShape[] = ["rest", "closed", "open", "wide", "round", "teeth"];
const mouthSpritePaths = mouthShapes.map(
  (shape) => `/assets/interviewer-avatar/mouth-sprite/${shape}.png`,
);

function renderAvatar(
  presentationState: AvatarPresentationState,
  mouthShape: MouthShape,
  reducedMotion = false,
) {
  return renderToStaticMarkup(
    <LocalInterviewerAvatar
      presentationState={presentationState}
      mouthShape={mouthShape}
      reducedMotion={reducedMotion}
    />,
  );
}

function assertAllMouthSprites(markup: string) {
  for (const path of mouthSpritePaths) {
    const spriteImageSources = [...markup.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(
      ([, src]) => src,
    );
    assert.equal(
      spriteImageSources.filter((src) => src === path).length,
      1,
      `${path} should be mounted exactly once`,
    );
  }

  assert.doesNotMatch(markup, /\/assets\/interviewer-avatar\/mouth\/(?:rest|closed|open|wide|round|teeth)\.png/);
  assert.equal(markup.match(/class="local-interviewer-avatar__mouth"/g)?.length, 6);
  assert.equal(markup.match(/loading="eager"/g)?.length, 6);
  assert.equal(markup.match(/width="230" height="105"/g)?.length, 6);
}

function assertActiveMouthShape(markup: string, activeShape?: MouthShape) {
  assert.equal(markup.match(/data-active="true"/g)?.length ?? 0, activeShape ? 1 : 0);

  for (const shape of mouthShapes) {
    const expectedActive = shape === activeShape ? "true" : "false";
    assert.match(
      markup,
      new RegExp(`data-mouth-shape="${shape}" data-active="${expectedActive}"`),
    );
  }
}

const talkingMarkup = renderAvatar("speaking", "wide");

assert.match(talkingMarkup, /data-state="talking"/);
assert.match(talkingMarkup, /data-mouth-shape="wide"/);
assert.match(talkingMarkup, /src="\/assets\/interviewer-avatar\/listening\.png"/);
assertAllMouthSprites(talkingMarkup);
assertActiveMouthShape(talkingMarkup, "wide");
assert.match(talkingMarkup, /width="1086" height="1448"/);

const nonSpeakingCases: Array<{
  presentationState: AvatarPresentationState;
  mouthShape: MouthShape;
  reducedMotion?: boolean;
  posturePath: string;
}> = [
  {
    presentationState: "idle",
    mouthShape: "open",
    posturePath: "/assets/interviewer-avatar/listening.png",
  },
  {
    presentationState: "listening",
    mouthShape: "teeth",
    posturePath: "/assets/interviewer-avatar/listening.png",
  },
  {
    presentationState: "thinking",
    mouthShape: "round",
    posturePath: "/assets/interviewer-avatar/thinking.png",
  },
  {
    presentationState: "speaking",
    mouthShape: "open",
    reducedMotion: true,
    posturePath: "/assets/interviewer-avatar/listening.png",
  },
];

for (const { presentationState, mouthShape, reducedMotion, posturePath } of nonSpeakingCases) {
  const markup = renderAvatar(presentationState, mouthShape, reducedMotion);
  const renderState = presentationState === "speaking" ? "talking" : presentationState;

  assert.match(markup, new RegExp(`data-state="${renderState}"`));
  assert.match(markup, /data-mouth-shape="rest"/);
  assert.match(markup, new RegExp(`src="${posturePath.replaceAll("/", "\\/")}"`));
  assertAllMouthSprites(markup);
  assertActiveMouthShape(markup);
}

const openTalkingMarkup = renderAvatar("speaking", "open");
const closedTalkingMarkup = renderAvatar("speaking", "closed");
const teethTalkingMarkup = renderAvatar("speaking", "teeth");
const extractMouthSpriteSources = (markup: string) =>
  [...markup.matchAll(/src="(\/assets\/interviewer-avatar\/mouth-sprite\/[^"]+)"/g)].map(
    ([, src]) => src,
  );

assert.deepEqual(extractMouthSpriteSources(openTalkingMarkup), mouthSpritePaths);
assert.deepEqual(extractMouthSpriteSources(teethTalkingMarkup), mouthSpritePaths);
assertActiveMouthShape(openTalkingMarkup, "open");
assertActiveMouthShape(closedTalkingMarkup);
assertActiveMouthShape(teethTalkingMarkup, "teeth");

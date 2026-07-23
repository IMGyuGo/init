import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getMouthSpriteVariant,
  LocalInterviewerAvatar,
  resolveMouthOpenness,
  type MouthSpriteVariant,
} from "./LocalInterviewerAvatar";
import type { AvatarPresentationState, MouthShape } from "./LipSyncDriver";

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
const mouthSpritePaths = mouthSpriteVariants.map(
  (variant) => `/assets/interviewer-avatar/mouth-sprite/${variant}.png`,
);

function renderAvatar(
  presentationState: AvatarPresentationState,
  mouthShape: MouthShape,
  reducedMotion = false,
  mouthOpen?: number,
) {
  return renderToStaticMarkup(
    <LocalInterviewerAvatar
      presentationState={presentationState}
      mouthShape={mouthShape}
      mouthOpen={mouthOpen}
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
  assert.equal(markup.match(/class="local-interviewer-avatar__mouth"/g)?.length, 9);
  assert.equal(markup.match(/loading="eager"/g)?.length, 9);
  assert.equal(markup.match(/width="230" height="105"/g)?.length, 9);
}

function assertActiveMouthVariant(markup: string, activeVariant?: MouthSpriteVariant) {
  assert.equal(markup.match(/data-active="true"/g)?.length ?? 0, activeVariant ? 1 : 0);

  for (const variant of mouthSpriteVariants) {
    const expectedActive = variant === activeVariant ? "true" : "false";
    assert.match(
      markup,
      new RegExp(`data-mouth-variant="${variant}" data-active="${expectedActive}"`),
    );
  }
}

assert.equal(resolveMouthOpenness("small", 0.57), "small");
assert.equal(resolveMouthOpenness("small", 0.58), "full");
assert.equal(resolveMouthOpenness("full", 0.43), "full");
assert.equal(resolveMouthOpenness("full", 0.42), "small");
assert.equal(resolveMouthOpenness("small", Number.NaN), "small");

assert.equal(getMouthSpriteVariant("open", "small"), "open-small");
assert.equal(getMouthSpriteVariant("open", "full"), "open");
assert.equal(getMouthSpriteVariant("wide", "small"), "wide-small");
assert.equal(getMouthSpriteVariant("round", "small"), "round-small");
assert.equal(getMouthSpriteVariant("teeth", "small"), "teeth");
assert.equal(getMouthSpriteVariant("closed", "full"), "closed");

const talkingMarkup = renderAvatar("speaking", "wide");

assert.match(talkingMarkup, /data-state="talking"/);
assert.match(talkingMarkup, /data-mouth-shape="wide"/);
assert.match(talkingMarkup, /data-mouth-variant="wide"/);
assert.match(talkingMarkup, /src="\/assets\/interviewer-avatar\/listening\.png"/);
assertAllMouthSprites(talkingMarkup);
assertActiveMouthVariant(talkingMarkup, "wide");
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
  assertActiveMouthVariant(markup);
}

const openTalkingMarkup = renderAvatar("speaking", "open");
const smallOpenTalkingMarkup = renderAvatar("speaking", "open", false, 0.3);
const closedTalkingMarkup = renderAvatar("speaking", "closed");
const teethTalkingMarkup = renderAvatar("speaking", "teeth");
const extractMouthSpriteSources = (markup: string) =>
  [...markup.matchAll(/src="(\/assets\/interviewer-avatar\/mouth-sprite\/[^"]+)"/g)].map(
    ([, src]) => src,
  );

assert.deepEqual(extractMouthSpriteSources(openTalkingMarkup), mouthSpritePaths);
assert.deepEqual(extractMouthSpriteSources(teethTalkingMarkup), mouthSpritePaths);
assertActiveMouthVariant(openTalkingMarkup, "open");
assertActiveMouthVariant(smallOpenTalkingMarkup, "open-small");
assert.match(smallOpenTalkingMarkup, /data-mouth-variant="open-small"/);
assertActiveMouthVariant(closedTalkingMarkup);
assertActiveMouthVariant(teethTalkingMarkup, "teeth");

import { strict as assert } from "node:assert";
import * as lipSyncDriver from "./LipSyncDriver";
import {
  advanceAudioDrivenTimelineElapsedMs,
  buildKoreanVisemeTimeline,
  getBoundaryAlignedTimelineElapsedMs,
  getEstimatedSpeechDurationMs,
  getMouthOpenValueForRms,
  getMouthOpenValueForShape,
  getMouthShapeForKoreanCharacter,
  getMouthShapesForKoreanCharacter,
  getMouthShapeForRms,
  getRelativeAudioElapsedMs,
  getTimelineElapsedMsForCharacterIndex,
  isLipSyncAudioAnalysisAvailable,
  resolveLipSyncMouthShape,
  smoothMouthOpenValue,
} from "./LipSyncDriver";

type TestAudioSourceNode = { kind: "stream" | "element" };
const createLipSyncAudioSourceNode = Reflect.get(lipSyncDriver, "createLipSyncAudioSourceNode") as unknown as (
  context: {
    createMediaStreamSource(stream: unknown): TestAudioSourceNode;
    createMediaElementSource(element: unknown): TestAudioSourceNode;
  },
  audioElement: unknown,
  audioStream: unknown,
) => TestAudioSourceNode | undefined;
assert.equal(typeof createLipSyncAudioSourceNode, "function");

const remoteStream = { getAudioTracks: () => [{ readyState: "live" }] };
const remoteAudioElement = {};
const selectedSources: string[] = [];
const selectedSourceNode = createLipSyncAudioSourceNode(
  {
    createMediaStreamSource(stream: unknown) {
      assert.equal(stream, remoteStream);
      selectedSources.push("stream");
      return { kind: "stream" };
    },
    createMediaElementSource(element: unknown) {
      assert.equal(element, remoteAudioElement);
      selectedSources.push("element");
      return { kind: "element" };
    },
  },
  remoteAudioElement,
  remoteStream,
);

assert.deepEqual(selectedSources, ["stream"]);
assert.equal(selectedSourceNode?.kind, "stream");

const repeatedAudioElement = {};
let mediaElementSourceCreationCount = 0;
const repeatedMediaElementContext = {
  createMediaStreamSource() {
    return { kind: "stream" as const };
  },
  createMediaElementSource(element: unknown) {
    assert.equal(element, repeatedAudioElement);
    mediaElementSourceCreationCount += 1;
    return { kind: "element" as const };
  },
};
const firstMediaElementSource = createLipSyncAudioSourceNode(
  repeatedMediaElementContext,
  repeatedAudioElement,
  undefined,
);
const replayedMediaElementSource = createLipSyncAudioSourceNode(
  repeatedMediaElementContext,
  repeatedAudioElement,
  undefined,
);
assert.equal(replayedMediaElementSource, firstMediaElementSource);
assert.equal(mediaElementSourceCreationCount, 1);

assert.equal(isLipSyncAudioAnalysisAvailable(true, "running"), true);
assert.equal(isLipSyncAudioAnalysisAvailable(true, "suspended"), false);
assert.equal(isLipSyncAudioAnalysisAvailable(false, "running"), false);

assert.equal(getMouthShapeForKoreanCharacter("마"), "closed");
assert.equal(getMouthShapeForKoreanCharacter("사"), "teeth");
assert.equal(getMouthShapeForKoreanCharacter("아"), "open");
assert.equal(getMouthShapeForKoreanCharacter("이"), "wide");
assert.equal(getMouthShapeForKoreanCharacter("우"), "round");

const preservedSingleVowelShapes = new Map([
  ["아", "open"],
  ["애", "wide"],
  ["야", "open"],
  ["얘", "wide"],
  ["어", "open"],
  ["에", "wide"],
  ["여", "open"],
  ["예", "wide"],
  ["오", "round"],
  ["요", "rest"],
  ["우", "round"],
  ["유", "rest"],
  ["으", "round"],
  ["이", "wide"],
] as const);

for (const [syllable, expectedShape] of preservedSingleVowelShapes) {
  assert.equal(getMouthShapeForKoreanCharacter(syllable), expectedShape, syllable);
}

const koreanSyllableCues = new Map<string, readonly string[]>([
  ["마", ["closed", "open"]],
  ["미", ["closed", getMouthShapeForKoreanCharacter("이")]],
  ["사", ["teeth", "open"]],
  ["소", ["teeth", "round"]],
  ["가", ["open"]],
  ["감", ["open", "closed"]],
  ["와", ["round", "open"]],
  ["왜", ["round", "wide"]],
  ["외", ["round", "wide"]],
  ["워", ["round", "open"]],
  ["웨", ["round", "wide"]],
  ["위", ["round", "teeth"]],
  ["의", ["wide", "teeth"]],
  ["봐", ["closed", "round", "open"]],
  ["쇠", ["teeth", "round", "wide"]],
]);

for (const [syllable, expectedCues] of koreanSyllableCues) {
  assert.deepEqual(getMouthShapesForKoreanCharacter(syllable), expectedCues, syllable);
}

assert.equal(getMouthShapeForRms(0), "rest");
assert.equal(getMouthShapeForRms(0.03), "closed");
assert.equal(getMouthShapeForRms(0.12), "open");

assert.equal(getMouthOpenValueForRms(0), 0);
assert.equal(getMouthOpenValueForRms(0.012), 0);
assert.equal(getMouthOpenValueForRms(0.12), 1);
assert.ok(getMouthOpenValueForRms(0.04) > 0);
assert.ok(getMouthOpenValueForRms(0.04) < 1);
assert.equal(getMouthOpenValueForRms(Number.NaN), 0);
assert.equal(getMouthOpenValueForRms(Number.POSITIVE_INFINITY), 0);

assert.equal(getMouthOpenValueForShape("rest"), 0);
assert.equal(getMouthOpenValueForShape("closed"), 0.08);
assert.equal(getMouthOpenValueForShape("open"), 0.78);
assert.equal(getMouthOpenValueForShape("wide"), 1);

const attackValue = smoothMouthOpenValue(0, 1);
const releaseValue = smoothMouthOpenValue(1, 0);
assert.ok(attackValue > 0 && attackValue < 1);
assert.ok(releaseValue > 0 && releaseValue < 1);
assert.ok(attackValue > 1 - releaseValue);
assert.equal(smoothMouthOpenValue(0, 0), 0);

assert.equal(getRelativeAudioElapsedMs(42.75, 42.5), 250);
assert.equal(getRelativeAudioElapsedMs(42.5, 42.75), 0);
assert.equal(getRelativeAudioElapsedMs(Number.NaN, 42.5), 0);
assert.equal(getEstimatedSpeechDurationMs("가나다라마바사아자차", undefined, false), 1_550);
assert.equal(getEstimatedSpeechDurationMs("가나다라마바사아자차", undefined, true), 1_800);
assert.equal(getEstimatedSpeechDurationMs("가나다라마바사아자차", 2_125, true), 2_125);
assert.equal(advanceAudioDrivenTimelineElapsedMs(0, 34, 0), 0);
assert.equal(advanceAudioDrivenTimelineElapsedMs(0, 34, 0.08), 34);
assert.equal(advanceAudioDrivenTimelineElapsedMs(400, 34, 0, true, "open"), 400);
assert.equal(advanceAudioDrivenTimelineElapsedMs(400, 34, 0, true, "rest"), 434);
assert.equal(advanceAudioDrivenTimelineElapsedMs(400, 34, 0.08, true, "open"), 434);
assert.equal(advanceAudioDrivenTimelineElapsedMs(400, 500, 0.08), 500);

const timeline = buildKoreanVisemeTimeline("안녕하세요", 900);
assert.ok(timeline.length > 0);
assert.equal(timeline[0]?.startMs, 0);
assert.equal(timeline.at(-1)?.endMs, 900);
for (let index = 1; index < timeline.length; index += 1) {
  assert.equal(timeline[index - 1]?.endMs, timeline[index]?.startMs);
}

const weightedMaTimeline = buildKoreanVisemeTimeline("마", 1_000);
assert.equal(weightedMaTimeline.length, 2);
assert.ok(
  weightedMaTimeline[0]!.endMs - weightedMaTimeline[0]!.startMs
    < weightedMaTimeline[1]!.endMs - weightedMaTimeline[1]!.startMs,
);

const weightedPauseTimeline = buildKoreanVisemeTimeline("가,", 1_000);
assert.equal(weightedPauseTimeline.length, 2);
assert.ok(
  weightedPauseTimeline[1]!.endMs - weightedPauseTimeline[1]!.startMs
    > weightedPauseTimeline[0]!.endMs - weightedPauseTimeline[0]!.startMs,
);

const boundaryTimeline = buildKoreanVisemeTimeline("가 나", 1_000);
const secondWordOffsetMs = getTimelineElapsedMsForCharacterIndex(boundaryTimeline, 2);
assert.ok(secondWordOffsetMs > 0);
assert.equal(getTimelineElapsedMsForCharacterIndex(boundaryTimeline, 0), 0);
assert.equal(getBoundaryAlignedTimelineElapsedMs(boundaryTimeline, 2, 75), secondWordOffsetMs + 75);

const compoundTimeline = buildKoreanVisemeTimeline("봐쇠감", 1_001);
assert.deepEqual(
  compoundTimeline.map((cue) => cue.mouthShape),
  ["closed", "round", "open", "teeth", "round", "wide", "open", "closed"],
);
assert.equal(compoundTimeline[0]?.startMs, 0);
assert.equal(compoundTimeline.at(-1)?.endMs, 1_001);
for (let index = 1; index < compoundTimeline.length; index += 1) {
  assert.equal(compoundTimeline[index - 1]?.endMs, compoundTimeline[index]?.startMs);
}

const punctuatedQuestion =
  "NestJS와 PostgreSQL 기반 프로젝트에서 답변 저장, STT 결과, 꼬리질문 표시가 연결되는 흐름을 구현했다고 했는데, 사용자가 답변 완료를 누른 뒤 DB 저장과 지원자 화면 표시까지의 데이터 흐름을 구체적으로 설명해 주세요.";
const punctuatedTimeline = buildKoreanVisemeTimeline(punctuatedQuestion, 12_245);
const hangulCount = [...punctuatedQuestion].filter((character) => /[가-힣]/u.test(character)).length;
const punctuationCount = [...punctuatedQuestion].filter((character) => /[,.;:!?…]/u.test(character)).length;

const expandedHangulCueCount = [...punctuatedQuestion]
  .filter((character) => /[가-힣]/u.test(character))
  .reduce((total, character) => total + getMouthShapesForKoreanCharacter(character).length, 0);

assert.equal(hangulCount > 0, true);
assert.equal(punctuatedTimeline.length, expandedHangulCueCount + punctuationCount);
assert.equal(punctuatedTimeline.at(-1)?.mouthShape, "rest");

assert.equal(resolveLipSyncMouthShape({ speaking: false, reducedMotion: false, rms: 0.12 }), "rest");
assert.equal(resolveLipSyncMouthShape({ speaking: true, reducedMotion: true, rms: 0.12 }), "rest");
assert.equal(
  resolveLipSyncMouthShape({ speaking: true, reducedMotion: false, rms: 0, timeline, elapsedMs: 450, audioAnalysisAvailable: false }),
  timeline.find((cue) => cue.startMs <= 450 && cue.endMs > 450)?.mouthShape ?? "rest",
);
for (const mouthShape of ["closed", "open", "wide", "round", "teeth"] as const) {
  assert.equal(
    resolveLipSyncMouthShape({
      speaking: true,
      reducedMotion: false,
      rms: 0.12,
      timeline: [{ startMs: 0, endMs: 900, mouthShape }],
      elapsedMs: 450,
      audioAnalysisAvailable: true,
    }),
    mouthShape,
  );
}
for (const mouthShape of ["closed", "open", "wide", "round", "teeth"] as const) {
  assert.equal(
    resolveLipSyncMouthShape({
      speaking: true,
      reducedMotion: false,
      rms: 0,
      timeline: [{ startMs: 0, endMs: 900, mouthShape }],
      elapsedMs: 450,
      audioAnalysisAvailable: true,
    }),
    "rest",
  );
}
assert.equal(
  resolveLipSyncMouthShape({
    speaking: true,
    reducedMotion: false,
    rms: 0.12,
    audioAnalysisAvailable: true,
  }),
  "open",
);
assert.equal(
  resolveLipSyncMouthShape({
    speaking: true,
    reducedMotion: false,
    rms: 0,
    timeline: [{ startMs: 0, endMs: 900, mouthShape: "teeth" }],
    elapsedMs: 0,
    audioAnalysisAvailable: undefined,
  }),
  "rest",
);
assert.equal(
  resolveLipSyncMouthShape({ speaking: true, reducedMotion: false, rms: 0.12, audioAnalysisAvailable: false }),
  "open",
);
assert.equal(
  resolveLipSyncMouthShape({ speaking: true, reducedMotion: false, rms: 0, audioAnalysisAvailable: false }),
  "rest",
);

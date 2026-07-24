# Hybrid PNG Mouth Openness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 PNG 면접관이 한국어 발음 형태와 RMS 입 벌림 강도를 함께 사용하고, 짧은 cue와 순간 무음에서 입 모양이 떨리지 않게 한다.

**Architecture:** `LipSyncDriver`는 텍스트 기반 형태 선택과 시간 안정화를 담당하고 연속 `mouthOpen` 값을 그대로 노출한다. `LocalInterviewerAvatar`는 RMS 벌림값에 히스테리시스를 적용해 small/full PNG를 선택하며, 기존 여섯 장에 정렬된 작은 벌림 세 장을 추가한다.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, Node.js 20, TSX 기반 단위 테스트, PNG asset audit

## Global Constraints

- Node.js 20 LTS와 npm을 사용하며 새 의존성을 추가하지 않는다.
- 기존 `rest`, `closed`, `open`, `wide`, `round`, `teeth` 발음 분류와 Realtime 180ms 음절 추정값을 유지한다.
- 새 파일은 `open-small.png`, `wide-small.png`, `round-small.png` 세 장뿐이며 모두 230x105 투명 PNG여야 한다.
- small/full 상승 기준은 0.58, 하강 기준은 0.42다.
- 비무음 형태 최소 유지시간은 80ms, 짧은 무음 완충은 60ms다.
- 문장부호 pause, 발화 상태 종료, 모션 감소 설정은 즉시 `rest`로 전환한다.
- 입 스프라이트 opacity transition과 Cubism/API/DB/환경변수 변경을 추가하지 않는다.
- Windows 최종 검증은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`를 사용한다.

---

## File Structure

- Modify `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`: pause cue 구분, 동일 cue 병합, 80ms 형태 유지와 60ms 무음 완충.
- Modify `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`: 타임라인 병합과 안정화 순수 함수의 RED/GREEN 테스트.
- Modify `frontend/src/features/candidate-application-interview/InterviewAvatar.tsx`: shape-only hook 대신 전체 lip-sync state 전달.
- Modify `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`: small/full 히스테리시스와 아홉 스프라이트 선택.
- Modify `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`: 아홉 에셋, 단계 선택, 기존 rest/closed 동작 검증.
- Modify `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`: 오디오 QA 렌더러에 동적 `mouthOpen` 전달.
- Modify `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`: 운영 wrapper와 QA가 `mouthOpen`을 전달하는지 검증.
- Create `frontend/public/assets/interviewer-avatar/mouth-sprite/open-small.png`: open의 작은 벌림.
- Create `frontend/public/assets/interviewer-avatar/mouth-sprite/wide-small.png`: wide의 작은 벌림.
- Create `frontend/public/assets/interviewer-avatar/mouth-sprite/round-small.png`: round의 작은 벌림.
- Modify `scripts/audit-interviewer-avatar-assets.spec.mjs`: 새 파일명, 개수, 크기 계약 검증.
- Modify `scripts/audit-interviewer-avatar-assets.mjs`: PNG color type에서 알파 채널 보유 여부 노출.

---

### Task 1: 타임라인 cue 병합과 형태 안정화

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`
- Test: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`

**Interfaces:**
- Produces: `VisemeCue.isPause?: boolean`
- Produces: `MouthShapeStabilizationState`
- Produces: `stabilizeMouthShape(input: StabilizeMouthShapeInput): MouthShapeStabilizationState`
- Produces: `buildKoreanVisemeTimeline(text, durationMs)`가 인접한 동일 speech cue를 병합한 결과

- [ ] **Step 1: 인접 cue 병합과 안정화 실패 테스트 작성**

`LipSyncDriver.spec.ts`에 다음 테스트를 추가한다.

```ts
const repeatedOpenTimeline = buildKoreanVisemeTimeline("가가", 1_000);
assert.deepEqual(
  repeatedOpenTimeline.map((cue) => ({ mouthShape: cue.mouthShape, isPause: cue.isPause })),
  [{ mouthShape: "open", isPause: false }],
);
assert.equal(repeatedOpenTimeline[0]?.startMs, 0);
assert.equal(repeatedOpenTimeline[0]?.endMs, 1_000);

const punctuatedOpenTimeline = buildKoreanVisemeTimeline("가,가", 1_000);
assert.deepEqual(
  punctuatedOpenTimeline.map((cue) => ({ mouthShape: cue.mouthShape, isPause: cue.isPause })),
  [
    { mouthShape: "open", isPause: false },
    { mouthShape: "rest", isPause: true },
    { mouthShape: "open", isPause: false },
  ],
);

assert.ok(punctuatedTimeline.length <= expandedHangulCueCount + punctuationCount);

let stabilization = stabilizeMouthShape({
  previous: { mouthShape: "rest", changedAtMs: 0 },
  requestedMouthShape: "open",
  nowMs: 100,
  voiced: true,
  forceRest: false,
});
assert.equal(stabilization.mouthShape, "open");

stabilization = stabilizeMouthShape({
  previous: stabilization,
  requestedMouthShape: "wide",
  nowMs: 150,
  voiced: true,
  forceRest: false,
});
assert.equal(stabilization.mouthShape, "open");

stabilization = stabilizeMouthShape({
  previous: stabilization,
  requestedMouthShape: "wide",
  nowMs: 181,
  voiced: true,
  forceRest: false,
});
assert.equal(stabilization.mouthShape, "wide");

const bufferedSilence = stabilizeMouthShape({
  previous: stabilization,
  requestedMouthShape: "rest",
  nowMs: 220,
  voiced: false,
  forceRest: false,
});
assert.equal(bufferedSilence.mouthShape, "wide");

const sustainedSilence = stabilizeMouthShape({
  previous: bufferedSilence,
  requestedMouthShape: "rest",
  nowMs: 242,
  voiced: false,
  forceRest: false,
});
assert.equal(sustainedSilence.mouthShape, "rest");

const explicitPause = stabilizeMouthShape({
  previous: stabilization,
  requestedMouthShape: "rest",
  nowMs: 200,
  voiced: false,
  forceRest: true,
});
assert.equal(explicitPause.mouthShape, "rest");
```

테스트 import에 `stabilizeMouthShape`를 추가한다.

- [ ] **Step 2: RED 확인**

Run: `npm.cmd run test:candidate-avatar`

Expected: FAIL. 첫 실패는 `stabilizeMouthShape` export가 없거나 `가가`가 두 cue로 남아 있다는 내용이어야 한다.

- [ ] **Step 3: pause 메타데이터와 안정화 순수 함수 구현**

`LipSyncDriver.ts`에 다음 타입과 함수를 추가한다.

```ts
export type VisemeCue = {
  startMs: number;
  endMs: number;
  mouthShape: MouthShape;
  sourceCharacterIndex?: number;
  isPause?: boolean;
};

export type MouthShapeStabilizationState = {
  mouthShape: MouthShape;
  changedAtMs: number;
  lastVoicedAtMs?: number;
};

export interface StabilizeMouthShapeInput {
  previous: MouthShapeStabilizationState;
  requestedMouthShape: MouthShape;
  nowMs: number;
  voiced: boolean;
  forceRest: boolean;
}

const MIN_MOUTH_SHAPE_HOLD_MS = 80;
const SILENCE_HANGOVER_MS = 60;

export function stabilizeMouthShape(input: StabilizeMouthShapeInput): MouthShapeStabilizationState {
  const safeNowMs = Number.isFinite(input.nowMs) ? Math.max(0, input.nowMs) : input.previous.changedAtMs;
  if (input.forceRest) {
    return { mouthShape: "rest", changedAtMs: safeNowMs };
  }

  if (input.voiced) {
    const canChange = input.previous.mouthShape === "rest"
      || safeNowMs - input.previous.changedAtMs >= MIN_MOUTH_SHAPE_HOLD_MS;
    const mouthShape = canChange ? input.requestedMouthShape : input.previous.mouthShape;
    return {
      mouthShape,
      changedAtMs: mouthShape === input.previous.mouthShape ? input.previous.changedAtMs : safeNowMs,
      lastVoicedAtMs: safeNowMs,
    };
  }

  if (
    input.previous.mouthShape !== "rest"
    && input.previous.lastVoicedAtMs !== undefined
    && safeNowMs - input.previous.lastVoicedAtMs < SILENCE_HANGOVER_MS
  ) {
    return input.previous;
  }

  return {
    mouthShape: "rest",
    changedAtMs: input.previous.mouthShape === "rest" ? input.previous.changedAtMs : safeNowMs,
  };
}
```

기존 `assert.equal(punctuatedTimeline.length, expandedHangulCueCount + punctuationCount)`는 위 `assert.ok`로 교체한다. cue 병합 후에는 원시 후보 수보다 작을 수 있기 때문이다.

`buildKoreanVisemeTimeline`의 weighted cue에 `isPause`를 포함한다. speech 후보는 `false`, 문장부호는 `true`로 저장하고 다음 조건으로 문자 경계와 무관하게 weight를 합친다.

```ts
const previous = weightedCues.at(-1);
if (
  previous?.mouthShape === candidate.mouthShape
  && previous.isPause === candidate.isPause
) {
  previous.weight += candidate.weight;
} else {
  weightedCues.push({ ...candidate, sourceCharacterIndex });
}
```

문장부호 후보는 다음 값으로 추가하고 최종 `VisemeCue`에도 `isPause`를 복사한다.

```ts
weightedCues.push({
  mouthShape: "rest",
  sourceCharacterIndex,
  weight: SPEECH_PAUSE_CUE_WEIGHT,
  isPause: true,
});
```

현재 cue와 shape 조회는 같은 탐색 결과를 사용하도록 다음 함수로 정리한다.

```ts
function getTimelineCue(
  timeline: VisemeCue[] | undefined,
  elapsedMs: number | undefined,
): VisemeCue | undefined {
  if (!timeline?.length || elapsedMs === undefined) return undefined;
  return timeline.find((cue) => cue.startMs <= elapsedMs && cue.endMs > elapsedMs);
}

function getTimelineMouthShape(
  timeline: VisemeCue[] | undefined,
  elapsedMs: number | undefined,
): MouthShape | undefined {
  return getTimelineCue(timeline, elapsedMs)?.mouthShape;
}
```

- [ ] **Step 4: hook에 안정화 상태 연결**

`useLipSyncDriverState`에 다음 상태를 추가한다.

```ts
const [mouthShapeStabilization, setMouthShapeStabilization] = useState<MouthShapeStabilizationState>({
  mouthShape: "rest",
  changedAtMs: 0,
});
```

현재 timeline cue를 반환하는 내부 함수를 사용해 `isPause`를 확인하고, 요청 shape 계산 뒤 다음 effect를 추가한다.

```ts
const requestedMouthShape = resolveLipSyncMouthShape({
  speaking,
  reducedMotion: input.reducedMotion,
  rms,
  timeline,
  elapsedMs,
  audioAnalysisAvailable,
});
const currentTimelineCue = getTimelineCue(timeline, elapsedMs);

useEffect(() => {
  const nowMs = performance.now();
  setMouthShapeStabilization((previous) => stabilizeMouthShape({
    previous,
    requestedMouthShape,
    nowMs,
    voiced: audioAnalysisAvailable === true
      ? rms > SILENCE_RMS_THRESHOLD
      : audioAnalysisAvailable === false && speaking,
    forceRest: !speaking || input.reducedMotion || currentTimelineCue?.isPause === true,
  }));
}, [
  audioAnalysisAvailable,
  currentTimelineCue?.isPause,
  input.reducedMotion,
  requestedMouthShape,
  rms,
  speaking,
]);
```

반환값의 `mouthShape`는 `mouthShapeStabilization.mouthShape`를 사용한다. 발화 상태 초기화 effect에서는 안정화 상태도 `rest`로 초기화한다.

- [ ] **Step 5: GREEN과 회귀 확인**

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS. 기존 한국어 단모음·복합모음, Realtime timeline 정지, boundary 정렬 테스트도 함께 통과해야 한다.

- [ ] **Step 6: Task 1 커밋**

```text
git add -- frontend/src/features/candidate-application-interview/LipSyncDriver.ts frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts
git commit -m "feat(candidate): 입 모양 전환 안정화 추가"
```

---

### Task 2: RMS 벌림 단계와 아홉 PNG 렌더러

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/InterviewAvatar.tsx`
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`
- Test: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
- Test: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: `LipSyncDriverState.mouthShape`, `LipSyncDriverState.mouthOpen`
- Produces: `MouthOpenness = "small" | "full"`
- Produces: `MouthSpriteVariant`
- Produces: `resolveMouthOpenness(previous, mouthOpen): MouthOpenness`
- Produces: `getMouthSpriteVariant(mouthShape, openness): MouthSpriteVariant`
- Produces: `LocalInterviewerAvatarProps.mouthOpen?: number`

- [ ] **Step 1: 아홉 프레임과 히스테리시스 실패 테스트 작성**

`LocalInterviewerAvatar.spec.tsx`에서 sprite 목록을 다음 순서로 고정한다.

```ts
const mouthSpriteVariants = [
  "rest",
  "closed",
  "open-small",
  "open",
  "wide-small",
  "wide",
  "round-small",
  "round",
  "teeth",
] as const;
const mouthSpritePaths = mouthSpriteVariants.map(
  (variant) => `/assets/interviewer-avatar/mouth-sprite/${variant}.png`,
);
```

다음 순수 함수 테스트를 추가한다.

```ts
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
```

`renderAvatar`에 선택적 `mouthOpen` 인자를 추가하고 speaking/open/0.3 markup이 `data-mouth-variant="open-small" data-active="true"`를 한 번 포함하는지 검증한다. 기존 full markup은 아홉 이미지를 각각 한 번 eager mount해야 한다.

- [ ] **Step 2: RED 확인**

Run: `npm.cmd run test:candidate-avatar`

Expected: FAIL. 첫 실패는 `resolveMouthOpenness` export 부재 또는 mouth sprite 개수가 6이라는 내용이어야 한다.

- [ ] **Step 3: 벌림 히스테리시스와 프레임 선택 구현**

`LocalInterviewerAvatar.tsx`를 client component로 만들고 다음 타입과 순수 함수를 추가한다.

```ts
export type MouthOpenness = "small" | "full";
export type MouthSpriteVariant =
  | "rest"
  | "closed"
  | "open-small"
  | "open"
  | "wide-small"
  | "wide"
  | "round-small"
  | "round"
  | "teeth";

const FULL_MOUTH_OPEN_ENTER_THRESHOLD = 0.58;
const FULL_MOUTH_OPEN_EXIT_THRESHOLD = 0.42;

export function resolveMouthOpenness(previous: MouthOpenness, mouthOpen: number): MouthOpenness {
  if (!Number.isFinite(mouthOpen)) return previous;
  if (previous === "full") return mouthOpen <= FULL_MOUTH_OPEN_EXIT_THRESHOLD ? "small" : "full";
  return mouthOpen >= FULL_MOUTH_OPEN_ENTER_THRESHOLD ? "full" : "small";
}

export function getMouthSpriteVariant(
  mouthShape: MouthShape,
  openness: MouthOpenness,
): MouthSpriteVariant {
  if (mouthShape === "open" || mouthShape === "wide" || mouthShape === "round") {
    return openness === "small" ? `${mouthShape}-small` : mouthShape;
  }
  return mouthShape;
}
```

`LocalInterviewerAvatarProps`에 `mouthOpen?: number`를 추가한다. 기본값은 `getMouthOpenValueForShape(mouthShape)`로 정하고 `useState`와 `useEffect`로 직전 `MouthOpenness`를 보존한다. `mouthSpriteVariants` 아홉 장을 모두 eager mount하고, 모음 또는 `teeth`일 때 선택 variant 한 장만 활성화한다. 루트에는 `data-mouth-variant`를 추가한다.

- [ ] **Step 4: 운영 wrapper와 QA에 mouthOpen 전달**

`InterviewAvatar.tsx`에서 `useLipSyncDriver`를 `useLipSyncDriverState`로 교체한다.

```tsx
const lipSyncState = useLipSyncDriverState({
  presentationState,
  audioSource,
  audioStream,
  speechText,
  speechBoundary,
  reducedMotion,
});

return (
  <LocalInterviewerAvatar
    presentationState={presentationState}
    mouthShape={lipSyncState.mouthShape}
    mouthOpen={lipSyncState.mouthOpen}
    reducedMotion={reducedMotion}
    className={className}
  />
);
```

`InterviewerRiggingPreview.tsx`의 오디오 QA `LocalInterviewerAvatar`에도 `mouthOpen={lipSyncState.mouthOpen}`을 전달한다. 수동 QA state는 optional 기본값을 사용해 현재 UI를 유지한다.

`InterviewerRiggingPreview.spec.tsx`에는 `InterviewAvatar.tsx`가 `useLipSyncDriverState`와 `mouthOpen={lipSyncState.mouthOpen}`을 포함하고, QA renderer도 동일 값을 전달하는 정규식 검증을 추가한다.

- [ ] **Step 5: GREEN 확인**

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS. static markup에서 small/full 선택, rest/closed 무활성, teeth 단일 활성, 모션 감소 rest가 모두 통과해야 한다.

- [ ] **Step 6: Task 2 커밋**

```text
git add -- frontend/src/features/candidate-application-interview/InterviewAvatar.tsx frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
git commit -m "feat(candidate): PNG 입 벌림 단계 적용"
```

---

### Task 3: 작은 벌림 PNG와 asset audit

**Files:**
- Create: `frontend/public/assets/interviewer-avatar/mouth-sprite/open-small.png`
- Create: `frontend/public/assets/interviewer-avatar/mouth-sprite/wide-small.png`
- Create: `frontend/public/assets/interviewer-avatar/mouth-sprite/round-small.png`
- Test: `scripts/audit-interviewer-avatar-assets.spec.mjs`

**Interfaces:**
- Consumes: 기존 `open.png`, `wide.png`, `round.png`의 230x105 canvas와 알파 경계
- Produces: 같은 기준점의 230x105 transparent small variants

- [ ] **Step 1: 새 파일 계약 실패 테스트 작성**

`scripts/audit-interviewer-avatar-assets.spec.mjs`의 mouth sprite 검증을 다음 계약으로 바꾼다.

```js
const expectedMouthSpritePaths = [
  "mouth-sprite/closed.png",
  "mouth-sprite/open-small.png",
  "mouth-sprite/open.png",
  "mouth-sprite/rest.png",
  "mouth-sprite/round-small.png",
  "mouth-sprite/round.png",
  "mouth-sprite/teeth.png",
  "mouth-sprite/wide-small.png",
  "mouth-sprite/wide.png",
];

assert.equal(audit.mouthSprite.count, 9);
assert.deepEqual(
  audit.mouthSprite.files.map((file) => file.path),
  expectedMouthSpritePaths,
);
assert.deepEqual(audit.mouthSprite.dimensions, [{ width: 230, height: 105 }]);
assert.ok(audit.mouthSprite.files.every((file) => file.bytes > 0));
```

sprite byte 합계와 pack savings의 기존 정확한 숫자 assertion은 생성 결과에 따라 달라지므로 제거한다. pose와 full-mouth 원본의 count, bytes, dimensions assertion은 유지한다.

- [ ] **Step 2: RED 확인**

Run: `node scripts/audit-interviewer-avatar-assets.spec.mjs`

Expected: FAIL with actual mouth sprite count `6` instead of `9`.

- [ ] **Step 3: 원본 세 장을 시각 검사**

`open.png`, `wide.png`, `round.png`를 원본 해상도로 열어 피부 패치 외곽, 입 중심, 입술 높이와 알파 영역을 확인한다. 각 편집은 대응 원본 한 장만 reference로 사용한다.

- [ ] **Step 4: image generation으로 small variants 제작**

각 원본에 다음 편집 지시를 개별 적용한다.

```text
이 230x105 투명 PNG의 캔버스 크기, 투명 배경, 피부 패치 외곽, 입 중심,
입꼬리의 좌우 위치, 조명, 피부색, 입술 질감과 인물 정체성을 정확히 유지한다.
입술 벌림의 세로 높이만 원본의 약 52%로 줄여 같은 발음 형태의 자연스러운
작은 벌림을 만든다. 새 치아나 혀를 추가하지 말고, 캔버스 안의 다른 픽셀과
알파 경계는 바꾸지 않는다. 결과는 단일 230x105 RGBA PNG여야 한다.
```

built-in image generation 결과는 `$CODEX_HOME/generated_images` 아래에 보존한다. 도구가 원본보다 큰 RGB 캔버스를 반환하면 입 모양 편집 결과를 직접 프로젝트 에셋으로 복사하지 않는다. 프로젝트에 이미 설치된 `sharp`로 생성 결과를 230x105 좌표계에 맞추고, 대응 원본 PNG를 base로 사용해 입 주변만 feathered mask로 합성한다. 최종 알파는 원본 패치에서 유지하며 검은 배경과 생성된 외곽 피부가 결과에 들어오지 않게 한다.

규격화 결과를 각각 `open-small.png`, `wide-small.png`, `round-small.png`로 저장한다. 각 파일은 원본 해상도에서 직접 열어 이중 입술, 검은 seam, 피부색 불연속이 없는지 확인한 뒤 asset audit에 투입한다.

- [ ] **Step 5: GREEN과 이미지 계약 확인**

Run: `node scripts/audit-interviewer-avatar-assets.spec.mjs`

Expected: PASS with mouth sprite count `9` and only `230x105` dimensions.

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS including renderer and asset audit tests.

- [ ] **Step 6: Task 3 커밋**

```text
git add -- frontend/public/assets/interviewer-avatar/mouth-sprite/open-small.png frontend/public/assets/interviewer-avatar/mouth-sprite/wide-small.png frontend/public/assets/interviewer-avatar/mouth-sprite/round-small.png scripts/audit-interviewer-avatar-assets.spec.mjs
git commit -m "feat(candidate): 작은 입 모양 에셋 추가"
```

---

### Task 4: 전체 검증과 실제 면접 비교

**Files:**
- Verify only: all files from Tasks 1-3

**Interfaces:**
- Consumes: 완료된 아홉 프레임 렌더러
- Produces: 자동 테스트 결과와 대표 문장 시각 검증 기록

- [ ] **Step 1: candidate avatar 집중 테스트**

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS with no failed assertions.

- [ ] **Step 2: 타입 검사**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

- [ ] **Step 3: production build**

Run: `npm.cmd run build`

Expected: exit code 0 and Next.js production build success.

- [ ] **Step 4: diff 품질 검사**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Windows Role D 하네스**

Run: `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`

Expected: Role D local checks pass.

- [ ] **Step 6: 실제 면접 수동 QA**

로컬 `/candidate/mock-interviews/{id}`에서 다음 문장을 Realtime 음성으로 재생한다.

```text
안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.
```

확인 기준:

- 작은 소리에서는 `open-small`, `wide-small`, `round-small`이 선택된다.
- 큰 소리에서 대응 full variant로 바뀌고 경계에서 반복 교체되지 않는다.
- 80ms보다 짧은 형태 요청은 화면을 흔들지 않는다.
- 60ms 미만 순간 무음에는 작은 벌림이 남고 지속 무음에는 rest로 돌아간다.
- 문장부호 pause와 발화 상태 종료는 즉시 rest로 돌아간다.
- 피부 패치 외곽, 이중 입술, 검은 seam이 보이지 않는다.

- [ ] **Step 7: 최종 상태 확인**

Run: `git status --short`

Expected: 계획 문서 외에 의도하지 않은 파일이 없고, 구현 파일은 계획한 커밋에만 포함돼 있다.

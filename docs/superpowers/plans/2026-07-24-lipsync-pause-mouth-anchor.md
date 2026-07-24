# Lip Sync Pause and Mouth Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문장부호별 110/200/260ms 쉼을 실제 오디오 무음과 동기화하고, 작은 입 이미지가 아래로 내려가지 않도록 고정 입 창과 원본 좌표 등록 보정을 적용한다.

**Architecture:** `LipSyncDriver`가 연속 문장부호를 하나의 절대 pause cue로 만들고, 실제 또는 추정 발화 길이 안에서 발음 예산을 보호하며 쉼 시간을 배분한다. `LocalInterviewerAvatar`는 JSON 등록 계약을 읽어 고정된 입 창 안에서 `rest` 밑바탕과 활성 발음 레이어를 분리하며, asset audit는 같은 JSON과 PNG 픽셀을 사용해 보정 후 기준점 차이를 검증한다.

**Tech Stack:** Next.js 16.2.9, React 19.2.7, TypeScript 5.9.3, Node.js 20 LTS, `tsx`, Node `assert`, `sharp` 0.34.5(기존 Next 설치본), CSS Modules

## Global Constraints

- `.`, `!`, `?`는 200ms, `,`, `;`, `:`는 110ms, `…` 또는 `...`는 260ms 쉼을 사용한다.
- 일반 띄어쓰기에는 pause cue를 만들지 않는다.
- 연속 문장부호는 합산하지 않고 가장 긴 쉼 하나로 축약한다.
- 실제 오디오 길이가 짧으면 비쉼 cue당 40ms 발음 예산을 먼저 보호하고 pause를 같은 비율로 축소한다.
- 실제 RMS 무음이 목표 pause보다 길면 다음 발음 cue를 정지한 채 `rest`를 유지한다.
- 입 창의 top `36.947514%`, left `39.594843%`, width `21.178637%`, height `7.251381%`는 바꾸지 않는다.
- small variant의 원본 좌표 보정은 `open-small: y=-14`, `wide-small: y=-13`, `round-small: y=-15`이며 나머지는 `(0, 0)`이다.
- 보정 후 대응 small/full 이미지의 윗입술 y와 x 중심 차이는 각각 3px 이하여야 한다.
- API, DB, 공용 DTO, 환경변수와 PNG 원본은 변경하지 않는다.
- Node.js 20 LTS와 npm을 사용하며 새 의존성을 추가하지 않는다.
- 프로덕션 코드보다 실패하는 테스트를 먼저 작성하고, 각 RED/Green 결과를 직접 확인한다.

---

## File Map

- Modify `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`: 문장부호 run 파싱, 절대 pause 예산, 추정 duration을 담당한다.
- Modify `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`: pause 길이, run 축약, 짧은 duration, 무음 재개 회귀를 고정한다.
- Modify `frontend/src/features/candidate-application-interview/realtime-webrtc.ts`: 정확 문장 음성에 pause 운율 지시를 추가한다.
- Modify `frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts`: 정확 문장 보존과 pause 지시를 함께 검증한다.
- Create `frontend/src/features/candidate-application-interview/mouth-sprite-registration.json`: 230x105 원본 좌표의 단일 등록 계약이다.
- Create `frontend/src/features/candidate-application-interview/MouthSpriteRegistration.ts`: JSON 등록값을 타입 안전한 CSS 백분율로 변환한다.
- Create `frontend/src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts`: 등록값과 퍼센트 변환을 검증한다.
- Modify `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`: 고정 underlay와 활성 레이어를 렌더링한다.
- Modify `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`: 레이어 수, z-order용 속성, variant 등록 스타일을 검증한다.
- Modify `frontend/src/features/candidate-application-interview/CandidatePages.module.css`: 입 창, underlay, active sprite의 고정 좌표와 clip을 정의한다.
- Modify `frontend/src/features/candidate-application-interview/LocalInterviewerAvatarCss.spec.ts`: 입 창 좌표와 transform 계약을 검증한다.
- Modify `scripts/audit-interviewer-avatar-assets.mjs`: PNG 입술 기준점을 측정하고 JSON 보정 후 차이를 계산한다.
- Modify `scripts/audit-interviewer-avatar-assets.spec.mjs`: 세 small/full pair가 3px 허용 범위를 통과하는지 검증한다.
- Modify `frontend/package.json`: 등록 단위 테스트와 Realtime 음성 테스트를 candidate avatar 회귀 묶음에 포함한다.

---

### Task 1: 문장부호 절대 쉼 타임라인

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`

**Interfaces:**
- Consumes: 기존 `buildKoreanVisemeTimeline(text: string, durationMs: number): VisemeCue[]`, `getEstimatedSpeechDurationMs(text, audioDurationMs, realtimeAudio)`.
- Produces: `getSpeechPauseDurationMs(text: string): number`, 절대 pause duration을 가진 기존 `VisemeCue[]`.

- [ ] **Step 1: 마침표·쉼표·말줄임표의 실패 테스트 작성**

`LipSyncDriver.spec.ts`의 기존 `weightedPauseTimeline` 비례 비교를 제거하고 아래 실제 길이 assertion을 추가한다.

```ts
function getPauseDurations(text: string, durationMs: number): number[] {
  return buildKoreanVisemeTimeline(text, durationMs)
    .filter((cue) => cue.isPause)
    .map((cue) => cue.endMs - cue.startMs);
}

assert.deepEqual(getPauseDurations("안녕하세요. 지금부터", 2_000), [200]);
assert.deepEqual(getPauseDurations("천천히, 다시", 2_000), [110]);
assert.deepEqual(getPauseDurations("잠시… 다시", 2_000), [260]);
assert.deepEqual(getPauseDurations("정말?! 다시", 2_000), [200]);
assert.deepEqual(getPauseDurations("잠시... 다시", 2_000), [260]);
assert.deepEqual(getPauseDurations("가 나", 1_000), []);

assert.equal(getEstimatedSpeechDurationMs("가.나", undefined, false), 600);
assert.equal(getEstimatedSpeechDurationMs("가나다라.마", undefined, false), 975);
```

- [ ] **Step 2: pause 테스트가 기존 비례 구현에서 실패하는지 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`

Working directory: `frontend`

Expected: FAIL. 쉼 길이가 200/110/260ms와 다르거나 `...`가 세 cue로 생성된다.

- [ ] **Step 3: 짧은 실제 duration의 발음 예산 보호 실패 테스트 작성**

```ts
const compressedPauseTimeline = buildKoreanVisemeTimeline("가.나", 250);
const compressedPause = compressedPauseTimeline.find((cue) => cue.isPause);
assert.ok(compressedPause);
assert.ok(compressedPause.endMs - compressedPause.startMs < 200);
assert.ok(compressedPause.endMs - compressedPause.startMs >= 0);
assert.equal(compressedPauseTimeline.at(-1)?.endMs, 250);
for (let index = 1; index < compressedPauseTimeline.length; index += 1) {
  assert.equal(compressedPauseTimeline[index - 1]?.endMs, compressedPauseTimeline[index]?.startMs);
  assert.ok(compressedPauseTimeline[index]!.endMs >= compressedPauseTimeline[index]!.startMs);
}
```

- [ ] **Step 4: 짧은 duration 테스트가 기존 구현에서 올바른 이유로 실패하는지 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`

Expected: FAIL. 기존 가중치 방식의 pause가 새 절대 쉼 축소 규칙과 일치하지 않는다.

- [ ] **Step 5: 문장부호 run 파서와 목표 쉼 계산 구현**

`LipSyncDriver.ts`의 단일 `SPEECH_PAUSE_CHARACTERS`와 `SPEECH_PAUSE_CUE_WEIGHT`를 다음 정책으로 교체한다.

```ts
const SPEECH_PAUSE_CHARACTERS = new Set([",", ".", ";", ":", "!", "?", "…"]);
const SHORT_PAUSE_MS = 110;
const SENTENCE_PAUSE_MS = 200;
const ELLIPSIS_PAUSE_MS = 260;
const MIN_SPEECH_CUE_DURATION_MS = 40;

function getPauseRunDurationMs(pauseRun: string): number {
  if (pauseRun.includes("…") || /\.{3,}/u.test(pauseRun)) return ELLIPSIS_PAUSE_MS;
  if (/[.!?]/u.test(pauseRun)) return SENTENCE_PAUSE_MS;
  return SHORT_PAUSE_MS;
}

export function getSpeechPauseDurationMs(text: string): number {
  const characters = [...text];
  let totalMs = 0;
  for (let index = 0; index < characters.length;) {
    if (!SPEECH_PAUSE_CHARACTERS.has(characters[index]!)) {
      index += 1;
      continue;
    }
    let pauseRun = "";
    while (index < characters.length && SPEECH_PAUSE_CHARACTERS.has(characters[index]!)) {
      pauseRun += characters[index];
      index += 1;
    }
    totalMs += getPauseRunDurationMs(pauseRun);
  }
  return totalMs;
}
```

타임라인 파싱 루프도 연속 문장부호를 모아 하나의 weighted cue로 추가한다.

```ts
type WeightedVisemeCue = {
  mouthShape: MouthShape;
  sourceCharacterIndex: number;
  weight: number;
  isPause: boolean;
  targetDurationMs?: number;
};

// pause run을 만났을 때
weightedCues.push({
  mouthShape: "rest",
  sourceCharacterIndex,
  weight: 0,
  isPause: true,
  targetDurationMs: getPauseRunDurationMs(pauseRun),
});
```

- [ ] **Step 6: pause 예산을 먼저 예약하고 발음 가중치를 나머지 시간에 배분**

`buildKoreanVisemeTimeline`의 `totalWeight` 단일 비례 계산을 다음 계산 순서로 교체한다.

```ts
const speechCues = weightedCues.filter((cue) => !cue.isPause);
const requestedPauseMs = weightedCues.reduce(
  (total, cue) => total + (cue.targetDurationMs ?? 0),
  0,
);
const protectedSpeechMs = Math.min(
  durationMs,
  speechCues.length * MIN_SPEECH_CUE_DURATION_MS,
);
const pauseScale = requestedPauseMs > 0
  ? Math.min(1, Math.max(0, durationMs - protectedSpeechMs) / requestedPauseMs)
  : 0;
const effectivePauseDurations = weightedCues.map((cue) => (
  cue.isPause ? Math.round((cue.targetDurationMs ?? 0) * pauseScale) : 0
));
const effectivePauseMs = effectivePauseDurations.reduce((total, value) => total + value, 0);
const speechBudgetMs = Math.max(0, durationMs - effectivePauseMs);
const totalSpeechWeight = speechCues.reduce((total, cue) => total + cue.weight, 0);
```

cue를 순회할 때 pause는 대응 `effectivePauseDurations[index]`만큼, 발음은
누적 speech weight가 `speechBudgetMs`에서 차지하는 비율만큼 진행한다. 마지막
cue의 `endMs`는 rounding 오차만 흡수하도록 `durationMs`로 고정한다.

- [ ] **Step 7: fallback 추정 duration에 pause 합산**

```ts
const spokenSyllableMs = [...text]
  .filter((character) => getHangulIndices(character))
  .length * syllableDurationMs;
return Math.max(600, spokenSyllableMs + getSpeechPauseDurationMs(text));
```

- [ ] **Step 8: 타임라인 테스트 통과 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`

Expected: PASS with exit code 0 and no stderr.

- [ ] **Step 9: Task 1 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/LipSyncDriver.ts frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts
git commit -m "fix(candidate): 문장부호별 립싱크 쉼 고정"
```

---

### Task 2: Realtime 정확 문장에 같은 호흡 규칙 적용

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/realtime-webrtc.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `createRealtimeInterviewSpeechResponseEvent()`와 기존 exact-script transcript guardrail.
- Produces: exact text는 유지하면서 pause 운율을 요구하는 `response.instructions`.

- [ ] **Step 1: Realtime pause 지시 실패 테스트 작성**

intro와 question event assertion에 다음 검증을 추가한다.

```ts
assert.match(event.response.instructions, /200ms/);
assert.match(event.response.instructions, /110ms/);
assert.match(event.response.instructions, /260ms/);
assert.match(event.response.instructions, /silent pauses/i);
assert.match(event.response.instructions, /say nothing else/i);
```

- [ ] **Step 2: 기존 instructions에서 실패하는지 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/realtime-webrtc.spec.ts`

Working directory: `frontend`

Expected: FAIL because `200ms`, `110ms`, `260ms` pause instructions are absent.

- [ ] **Step 3: exact-script 지시에 pause 운율 한 줄 추가**

`getRealtimeInterviewSpeechInstructions` 반환 배열의 exact-script 금지 문장 뒤에
다음 문장을 추가한다.

```ts
"Use silent pauses at punctuation without changing the words: about 200ms after . ! ?, about 110ms after , ; :, and about 260ms for … or ....",
```

기존 marker와 원문은 그대로 유지한다. `normalizeRealtimeSpokenText`와 transcript
비교 함수는 변경하지 않는다.

- [ ] **Step 4: Realtime 테스트 통과 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/realtime-webrtc.spec.ts`

Expected: PASS with exit code 0.

- [ ] **Step 5: candidate avatar 회귀 명령에 Realtime spec 포함**

`frontend/package.json`의 `test:candidate-avatar`에서 `LipSyncDriver.spec.ts` 다음에
다음을 추가한다.

```json
"tsx src/features/candidate-application-interview/realtime-webrtc.spec.ts"
```

- [ ] **Step 6: 묶음 테스트로 Realtime spec 실행 여부 확인**

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS and output contains execution of `realtime-webrtc.spec.ts`.

- [ ] **Step 7: Task 2 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/realtime-webrtc.ts frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts frontend/package.json
git commit -m "fix(candidate): Realtime 음성 호흡 규칙 추가"
```

---

### Task 3: 원본 좌표 등록 계약과 고정 입 레이어 마크업

**Files:**
- Create: `frontend/src/features/candidate-application-interview/mouth-sprite-registration.json`
- Create: `frontend/src/features/candidate-application-interview/MouthSpriteRegistration.ts`
- Create: `frontend/src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `getMouthSpriteRegistration(variant): { x: number; y: number }`, `getMouthSpriteRegistrationCss(variant): { x: string; y: string }`.
- Consumes: `MouthSpriteVariant`, 230x105 원본 캔버스.

- [ ] **Step 1: 등록 helper 실패 테스트 생성**

`MouthSpriteRegistration.spec.ts`를 다음 내용으로 만든다.

```ts
import { strict as assert } from "node:assert";
import {
  getMouthSpriteRegistration,
  getMouthSpriteRegistrationCss,
} from "./MouthSpriteRegistration";

assert.deepEqual(getMouthSpriteRegistration("open-small"), { x: 0, y: -14 });
assert.deepEqual(getMouthSpriteRegistration("wide-small"), { x: 0, y: -13 });
assert.deepEqual(getMouthSpriteRegistration("round-small"), { x: 0, y: -15 });
assert.deepEqual(getMouthSpriteRegistration("open"), { x: 0, y: 0 });
assert.deepEqual(getMouthSpriteRegistrationCss("open-small"), {
  x: "0%",
  y: "-13.333333%",
});
```

- [ ] **Step 2: helper가 없어서 실패하는지 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts`

Working directory: `frontend`

Expected: FAIL with module-not-found for `MouthSpriteRegistration`.

- [ ] **Step 3: 단일 JSON 등록 계약 작성**

`mouth-sprite-registration.json`:

```json
{
  "canvas": { "width": 230, "height": 105 },
  "variants": {
    "rest": { "x": 0, "y": 0 },
    "closed": { "x": 0, "y": 0 },
    "open-small": { "x": 0, "y": -14 },
    "open": { "x": 0, "y": 0 },
    "wide-small": { "x": 0, "y": -13 },
    "wide": { "x": 0, "y": 0 },
    "round-small": { "x": 0, "y": -15 },
    "round": { "x": 0, "y": 0 },
    "teeth": { "x": 0, "y": 0 }
  }
}
```

- [ ] **Step 4: 타입 안전한 등록 helper 구현**

`MouthSpriteRegistration.ts`:

```ts
import manifest from "./mouth-sprite-registration.json";
import type { MouthSpriteVariant } from "./LocalInterviewerAvatar";

export interface MouthSpriteRegistration {
  x: number;
  y: number;
}

export const MOUTH_SPRITE_CANVAS = manifest.canvas;
export const MOUTH_SPRITE_REGISTRATION = manifest.variants as Record<
  MouthSpriteVariant,
  MouthSpriteRegistration
>;

export function getMouthSpriteRegistration(
  variant: MouthSpriteVariant,
): MouthSpriteRegistration {
  return MOUTH_SPRITE_REGISTRATION[variant] ?? { x: 0, y: 0 };
}

function toPercent(value: number, total: number): string {
  const percent = Math.round((value / total) * 100_000_000) / 1_000_000;
  return `${percent}%`;
}

export function getMouthSpriteRegistrationCss(variant: MouthSpriteVariant) {
  const registration = getMouthSpriteRegistration(variant);
  return {
    x: toPercent(registration.x, MOUTH_SPRITE_CANVAS.width),
    y: toPercent(registration.y, MOUTH_SPRITE_CANVAS.height),
  };
}
```

- [ ] **Step 5: helper 테스트 통과 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts`

Expected: PASS.

- [ ] **Step 6: underlay와 active layer 마크업 실패 테스트 작성**

`LocalInterviewerAvatar.spec.tsx`에서 기존 9개 동일 클래스 가정을 다음 계약으로
바꾼다.

```ts
assert.equal(markup.match(/class="local-interviewer-avatar__mouth-underlay"/g)?.length, 1);
assert.equal(markup.match(/class="local-interviewer-avatar__mouth"/g)?.length, 8);
assert.match(talkingMarkup, /data-mouth-layer="underlay" data-visible="true"/);
assert.match(smallOpenTalkingMarkup, /--mouth-register-y:-13\.333333%/);
assert.match(smallOpenTalkingMarkup, /--mouth-register-x:0%/);
```

non-speaking case에는 다음 assertion을 추가한다.

```ts
assert.match(markup, /data-mouth-layer="underlay" data-visible="false"/);
```

기존 `assertActiveMouthVariant`는 `rest`를 active image 목록에서 제외하도록
다음 배열을 순회한다.

```ts
const activeMouthSpriteVariants = mouthSpriteVariants.filter(
  (variant) => variant !== "rest",
);

for (const variant of activeMouthSpriteVariants) {
  const expectedActive = variant === activeVariant ? "true" : "false";
  assert.match(
    markup,
    new RegExp(`data-mouth-variant="${variant}" data-active="${expectedActive}"`),
  );
}
assert.doesNotMatch(markup, /data-mouth-variant="rest"/);
```

- [ ] **Step 7: 기존 flat 이미지 렌더링에서 실패하는지 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`

Expected: FAIL because no mouth underlay/registration styles exist.

- [ ] **Step 8: `LocalInterviewerAvatar`를 underlay와 active images로 분리**

`rest`를 active variant 배열에서 제외하고 고정 underlay로 한 번 렌더링한다.

```tsx
const activeMouthSpriteVariants = mouthSpriteVariants.filter((variant) => variant !== "rest");
const shouldShowMouthUnderlay = presentationState === "speaking" && !reducedMotion;

<div className="local-interviewer-avatar__mouth-window">
  <Image
    alt=""
    className="local-interviewer-avatar__mouth-underlay"
    data-mouth-layer="underlay"
    data-visible={shouldShowMouthUnderlay ? "true" : "false"}
    draggable={false}
    height={105}
    loading="eager"
    src={mouthImageByVariant.rest}
    unoptimized
    width={230}
  />
  {activeMouthSpriteVariants.map((variant) => {
    const registration = getMouthSpriteRegistrationCss(variant);
    return (
      <Image
        key={variant}
        alt=""
        className="local-interviewer-avatar__mouth"
        data-mouth-variant={variant}
        data-active={shouldActivateMouth && variant === renderedMouthVariant ? "true" : "false"}
        draggable={false}
        height={105}
        loading="eager"
        src={mouthImageByVariant[variant]}
        style={{
          "--mouth-register-x": registration.x,
          "--mouth-register-y": registration.y,
        } as React.CSSProperties}
        unoptimized
        width={230}
      />
    );
  })}
</div>
```

컴포넌트 import와 style 타입은 다음처럼 명시해 `any`를 사용하지 않는다.

```tsx
import { useEffect, useState, type CSSProperties } from "react";

type MouthSpriteStyle = CSSProperties & Record<
  "--mouth-register-x" | "--mouth-register-y",
  string
>;

const mouthStyle: MouthSpriteStyle = {
  "--mouth-register-x": registration.x,
  "--mouth-register-y": registration.y,
};
```

앞선 JSX의 `style`에는 `mouthStyle`을 전달한다.

- [ ] **Step 9: 등록·컴포넌트 테스트 통과 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts`

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`

Expected: both PASS.

- [ ] **Step 10: 새 등록 테스트를 회귀 묶음에 추가**

`frontend/package.json`의 `test:candidate-avatar`에서 `LocalInterviewerAvatar.spec.tsx`
앞에 다음 명령을 추가한다.

```json
"tsx src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts"
```

- [ ] **Step 11: Task 3 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/mouth-sprite-registration.json frontend/src/features/candidate-application-interview/MouthSpriteRegistration.ts frontend/src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx frontend/package.json
git commit -m "fix(candidate): 입 스프라이트 기준점 등록 추가"
```

---

### Task 4: 고정 입 창 CSS

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatarCss.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/CandidatePages.module.css`

**Interfaces:**
- Consumes: `--mouth-register-x`, `--mouth-register-y`, underlay/active layer class.
- Produces: 움직이지 않는 mouth window와 source-coordinate-scaled translation.

- [ ] **Step 1: 고정 입 창 CSS 실패 테스트 작성**

기존 `mouthRule` 좌표 assertion을 `mouthWindowRule`로 이동하고 다음 검증을
추가한다.

```ts
const mouthWindowRule = css.match(
  /:global\(\.local-interviewer-avatar__mouth-window\)\s*\{([^}]+)\}/,
)?.[1];
const mouthRule = css.match(
  /:global\(\.local-interviewer-avatar__mouth\)\s*\{([^}]+)\}/,
)?.[1];

assert.ok(mouthWindowRule);
assert.ok(mouthRule);
assert.match(mouthWindowRule, /top:\s*36\.947514%;/);
assert.match(mouthWindowRule, /left:\s*39\.594843%;/);
assert.match(mouthWindowRule, /width:\s*21\.178637%;/);
assert.match(mouthWindowRule, /height:\s*7\.251381%;/);
assert.match(mouthWindowRule, /overflow:\s*hidden;/);
assert.match(mouthRule, /inset:\s*0;/);
assert.match(
  mouthRule,
  /transform:\s*translate3d\(var\(--mouth-register-x\),\s*var\(--mouth-register-y\),\s*0\);/,
);
assert.match(css, /local-interviewer-avatar__mouth-underlay\[data-visible="true"\]/);
assert.doesNotMatch(mouthRule, /\btransition(?:-[a-z-]+)?\s*:/);
```

- [ ] **Step 2: 기존 CSS에서 mouth window 테스트가 실패하는지 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatarCss.spec.ts`

Working directory: `frontend`

Expected: FAIL because `.local-interviewer-avatar__mouth-window` does not exist.

- [ ] **Step 3: 좌표를 고정 window로 이동하고 레이어 CSS 구현**

`CandidatePages.module.css`의 기존 mouth rule을 다음 세 규칙으로 교체한다.

```css
:global(.local-interviewer-avatar__mouth-window) {
  position: absolute;
  top: 36.947514%;
  left: 39.594843%;
  z-index: 1;
  display: block;
  width: 21.178637%;
  height: 7.251381%;
  overflow: hidden;
  pointer-events: none;
}

:global(.local-interviewer-avatar__mouth-underlay),
:global(.local-interviewer-avatar__mouth) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  pointer-events: none;
  user-select: none;
}

:global(.local-interviewer-avatar__mouth) {
  transform: translate3d(var(--mouth-register-x), var(--mouth-register-y), 0);
}

:global(.local-interviewer-avatar__mouth-underlay[data-visible="true"]),
:global(.local-interviewer-avatar__mouth[data-active="true"]) {
  opacity: 1;
}
```

underlay는 DOM에서 active layer보다 먼저 렌더링되므로 별도 z-index 없이 활성
입 이미지가 위에 온다. opacity transition은 추가하지 않는다.

- [ ] **Step 4: CSS와 컴포넌트 테스트 통과 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatarCss.spec.ts`

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`

Expected: both PASS.

- [ ] **Step 5: Task 4 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/CandidatePages.module.css frontend/src/features/candidate-application-interview/LocalInterviewerAvatarCss.spec.ts
git commit -m "fix(candidate): 입 위치를 고정 창에 정렬"
```

---

### Task 5: PNG 기준점 회귀 감사

**Files:**
- Modify: `scripts/audit-interviewer-avatar-assets.spec.mjs`
- Modify: `scripts/audit-interviewer-avatar-assets.mjs`

**Interfaces:**
- Consumes: `mouth-sprite-registration.json`, PNG RGBA pixels.
- Produces: `audit.mouthSpriteRegistration.pairs[]` with raw/registered anchor deltas.

- [ ] **Step 1: 감사 결과 계약의 실패 테스트 작성**

`audit-interviewer-avatar-assets.spec.mjs`에 다음 assertion을 추가한다.

```js
assert.deepEqual(
  audit.mouthSpriteRegistration.pairs.map((pair) => pair.names),
  [
    ["open-small", "open"],
    ["wide-small", "wide"],
    ["round-small", "round"],
  ],
);
for (const pair of audit.mouthSpriteRegistration.pairs) {
  assert.ok(pair.rawDeltaY >= 12, `${pair.names.join("/")} must reproduce the source regression`);
  assert.ok(Math.abs(pair.registeredDeltaY) <= 3, `${pair.names.join("/")} y anchor must align`);
  assert.ok(Math.abs(pair.registeredDeltaX) <= 3, `${pair.names.join("/")} x anchor must align`);
}
```

- [ ] **Step 2: 현재 감사에 등록 결과가 없어 실패하는지 확인**

Run: `node ../scripts/audit-interviewer-avatar-assets.spec.mjs`

Working directory: `frontend`

Expected: FAIL because `mouthSpriteRegistration` is undefined.

- [ ] **Step 3: PNG 윗입술 bounds 측정 helper 구현**

`audit-interviewer-avatar-assets.mjs`에 기존 프로젝트 방식과 같은 sharp import를
추가한다.

```js
import sharp from "../frontend/node_modules/sharp/lib/index.js";

async function readUpperLipAnchor(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const lipPixel = alpha > 80
        && red < 145
        && green < 115
        && blue < 110
        && red > green * 0.9;
      if (!lipPixel) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
    }
  }

  if (right < left || top >= info.height) {
    throw new Error(`${path} has no measurable upper-lip pixels`);
  }
  return { x: Math.trunc((left + right) / 2), y: top };
}
```

- [ ] **Step 4: JSON 등록을 적용한 pair 감사 구현**

`auditInterviewerAvatarAssets`에서 source 디렉터리의 등록 JSON을 읽고 세 pair를
측정한다.

```js
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registrationManifest = JSON.parse(await readFile(
  resolve(
    projectRoot,
    "frontend/src/features/candidate-application-interview/mouth-sprite-registration.json",
  ),
  "utf8",
));
const pairNames = [
  ["open-small", "open"],
  ["wide-small", "wide"],
  ["round-small", "round"],
];
const pairs = [];
for (const names of pairNames) {
  const [smallName, fullName] = names;
  const smallAnchor = await readUpperLipAnchor(resolve(baseDirectory, `mouth-sprite/${smallName}.png`));
  const fullAnchor = await readUpperLipAnchor(resolve(baseDirectory, `mouth-sprite/${fullName}.png`));
  const smallRegistration = registrationManifest.variants[smallName];
  const fullRegistration = registrationManifest.variants[fullName];
  pairs.push({
    names,
    rawDeltaX: smallAnchor.x - fullAnchor.x,
    rawDeltaY: smallAnchor.y - fullAnchor.y,
    registeredDeltaX: smallAnchor.x + smallRegistration.x - fullAnchor.x - fullRegistration.x,
    registeredDeltaY: smallAnchor.y + smallRegistration.y - fullAnchor.y - fullRegistration.y,
  });
}
```

반환 객체에 다음을 추가한다.

```js
mouthSpriteRegistration: {
  canvas: registrationManifest.canvas,
  pairs,
},
```

- [ ] **Step 5: 감사 테스트 통과 확인**

Run: `node ../scripts/audit-interviewer-avatar-assets.spec.mjs`

Working directory: `frontend`

Expected: PASS. 세 pair의 `rawDeltaY`는 12px 이상이고 보정 후 x/y 차이는 3px 이하.

- [ ] **Step 6: candidate avatar 전체 회귀 통과 확인**

Run: `npm.cmd run test:candidate-avatar`

Working directory: `frontend`

Expected: PASS with all lip-sync, Realtime, registration, renderer, CSS, preview, asset audit tests.

- [ ] **Step 7: Task 5 커밋**

```powershell
git add -- scripts/audit-interviewer-avatar-assets.mjs scripts/audit-interviewer-avatar-assets.spec.mjs
git commit -m "test(candidate): 입 스프라이트 기준점 감사 추가"
```

---

### Task 6: 전체 검증과 대표 문장 수동 확인

**Files:**
- Verify: Tasks 1~5의 모든 변경 파일. 실패 수정은 먼저 해당 회귀 테스트에 재현한다.

**Interfaces:**
- Consumes: Tasks 1~5의 완성된 브랜치.
- Produces: 자동 검증 결과와 대표 문장 시각 확인 결과.

- [ ] **Step 1: 변경 파일과 공백 오류 확인**

Run: `git status --short`

Expected: 계획 문서 외 의도하지 않은 파일이 없고 구현 커밋 뒤 working tree가 clean.

Run: `git diff --check origin/dev...HEAD`

Expected: no output, exit code 0.

- [ ] **Step 2: candidate avatar 회귀 실행**

Run: `npm.cmd run test:candidate-avatar`

Working directory: `frontend`

Expected: PASS.

- [ ] **Step 3: TypeScript 검증**

Run: `npm.cmd run typecheck`

Working directory: `frontend`

Expected: PASS, no TypeScript errors.

- [ ] **Step 4: production build 검증**

Run: `npm.cmd run build`

Working directory: `frontend`

Expected: PASS, Next.js production build completes.

- [ ] **Step 5: Windows Role D 로컬 하네스 실행**

Run: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`

Working directory: repository root.

Expected: Role D harness PASS.

- [ ] **Step 6: 대표 문장 Realtime 시각 검증**

개발 서버에서 모의면접을 열고 다음 문장을 재생한다.

```text
안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.
```

확인 기준:

- `안녕하세요.` 뒤 입이 약 200ms 닫힌다.
- 실제 음성이 더 늦게 재개되면 입도 닫힌 채 기다린다.
- 다음 발화가 시작될 때 입 모양이 함께 재개된다.
- `open-small`, `wide-small`, `round-small` 전환에서 입술이 아래로 떨어지지 않는다.
- 피부 사각형 경계, 이중 입술, opacity crossfade가 보이지 않는다.

- [ ] **Step 7: 브라우저 TTS fallback 시각 검증**

Realtime을 사용할 수 없는 상태에서 같은 문장을 재생한다. 문장부호 타임라인과
browser boundary가 동작하고, 입 위치는 Realtime과 동일하게 고정되어야 한다.

- [ ] **Step 8: 검증 중 수정이 있었다면 테스트부터 재현 후 최종 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/LipSyncDriver.ts frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts frontend/src/features/candidate-application-interview/realtime-webrtc.ts frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts frontend/src/features/candidate-application-interview/MouthSpriteRegistration.ts frontend/src/features/candidate-application-interview/MouthSpriteRegistration.spec.ts frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx frontend/src/features/candidate-application-interview/CandidatePages.module.css frontend/src/features/candidate-application-interview/LocalInterviewerAvatarCss.spec.ts scripts/audit-interviewer-avatar-assets.mjs scripts/audit-interviewer-avatar-assets.spec.mjs frontend/package.json
git commit -m "fix(candidate): 립싱크 쉼과 입 위치 검증 보완"
```

수정이 없으면 추가 커밋을 만들지 않는다.

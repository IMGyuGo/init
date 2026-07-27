# Cubism RMS Lip Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the Cubism V3 proof model's `ParamMouthOpenY` with a continuous 0 to 1 value from the existing RMS audio QA without replacing the production PNG avatar.

**Architecture:** Extend the existing single Web Audio analysis hook to expose both a discrete PNG mouth shape and a smoothed numeric mouth-open value. The preview audio QA consumes that combined state once and passes each output to its corresponding presentational renderer, avoiding duplicate media-element source nodes.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, Web Audio API, Live2D Cubism Web Framework R5, Node assert/tsx tests

## Global Constraints

- Node.js remains 20 LTS and npm remains the package manager.
- The production `InterviewAvatar` continues rendering `LocalInterviewerAvatar`.
- Cubism remains labeled as an opacity-crossfade proof, not natural deformation.
- `prefers-reduced-motion` and an idle presentation state force mouth-open to 0.
- One audio element is connected to no more than one `MediaElementAudioSourceNode`.
- No new dependencies or environment variables are introduced.

## File Map

- Modify `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`: own RMS normalization, smoothing, shape-to-value mapping, and combined hook state.
- Modify `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`: verify the pure numeric behavior and preserved discrete behavior.
- Modify `frontend/src/features/candidate-application-interview/CubismSdkRuntime.ts`: preserve the existing public shape-to-Cubism mapping export while moving domain logic to the lip-sync module.
- Modify `frontend/src/features/candidate-application-interview/CubismProofInterviewerAvatar.tsx`: accept a numeric mouth-open value directly.
- Modify `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`: share one lip-sync result between PNG and Cubism QA stages and capture observed numeric range.
- Modify `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css`: lay out two unframed QA stages without nesting cards.
- Modify `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`: verify the numeric Cubism contract and QA diagnostics.

---

### Task 1: Combined Lip-Sync Signal

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`
- Test: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.ts`

**Interfaces:**
- Consumes: `MouthShape`, `LipSyncDriverInput`, the existing analyser sampling loop.
- Produces: `LipSyncDriverState`, `getMouthOpenValueForShape`, `getMouthOpenValueForRms`, `smoothMouthOpenValue`, and `useLipSyncDriverState(input)`.

- [ ] **Step 1: Write failing pure-function tests**

Add imports and assertions equivalent to:

```ts
import {
  getMouthOpenValueForRms,
  getMouthOpenValueForShape,
  smoothMouthOpenValue,
} from "./LipSyncDriver";

assert.equal(getMouthOpenValueForRms(0), 0);
assert.equal(getMouthOpenValueForRms(0.012), 0);
assert.equal(getMouthOpenValueForRms(0.12), 1);
assert.ok(getMouthOpenValueForRms(0.04) > 0);
assert.ok(getMouthOpenValueForRms(0.04) < 1);
assert.equal(getMouthOpenValueForRms(Number.NaN), 0);
assert.equal(getMouthOpenValueForShape("rest"), 0);
assert.equal(getMouthOpenValueForShape("wide"), 1);
assert.ok(smoothMouthOpenValue(0, 1) > smoothMouthOpenValue(1, 0));
assert.equal(smoothMouthOpenValue(0, 0), 0);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run from `frontend`:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts
```

Expected: FAIL because the three numeric helper exports do not exist.

- [ ] **Step 3: Implement the pure numeric contract**

Add the following public shape and helper behavior to `LipSyncDriver.ts`:

```ts
export interface LipSyncDriverState {
  mouthShape: MouthShape;
  mouthOpen: number;
}

const MAX_RMS_MOUTH_OPEN = 0.12;
const MOUTH_OPEN_ATTACK = 0.58;
const MOUTH_OPEN_RELEASE = 0.32;

const mouthOpenValueByShape: Record<MouthShape, number> = {
  rest: 0,
  closed: 0.08,
  teeth: 0.45,
  round: 0.6,
  open: 0.78,
  wide: 1,
};

export function getMouthOpenValueForShape(shape: MouthShape): number {
  return mouthOpenValueByShape[shape];
}

export function getMouthOpenValueForRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= SILENCE_RMS_THRESHOLD) return 0;
  return Math.min(1, (rms - SILENCE_RMS_THRESHOLD) / (MAX_RMS_MOUTH_OPEN - SILENCE_RMS_THRESHOLD));
}

export function smoothMouthOpenValue(previous: number, target: number): number {
  const factor = target > previous ? MOUTH_OPEN_ATTACK : MOUTH_OPEN_RELEASE;
  return previous + (target - previous) * factor;
}
```

Move the existing shape mapping out of `CubismSdkRuntime.ts` and preserve compatibility there with:

```ts
export { getMouthOpenValueForShape as getCubismMouthOpenValue } from "./LipSyncDriver";
```

- [ ] **Step 4: Extend the hook while preserving its old API**

Rename the existing hook implementation to `useLipSyncDriverState`, add a `mouthOpen` state initialized to 0, and update it in the analyser loop:

```ts
const [mouthOpen, setMouthOpen] = useState(0);

const nextRms = calculateRms(samples);
setRms(nextRms);
setMouthOpen((current) => smoothMouthOpenValue(current, getMouthOpenValueForRms(nextRms)));
```

Reset it beside the existing RMS reset and return one combined result:

```ts
const mouthShape = resolveLipSyncMouthShape({
  speaking,
  reducedMotion: input.reducedMotion,
  rms,
  timeline,
  elapsedMs,
  audioAnalysisAvailable,
});

return {
  mouthShape,
  mouthOpen: !speaking || input.reducedMotion
    ? 0
    : audioAnalysisAvailable
      ? mouthOpen
      : getMouthOpenValueForShape(mouthShape),
};
```

Keep production callers source-compatible:

```ts
export function useLipSyncDriver(input: LipSyncDriverInput): MouthShape {
  return useLipSyncDriverState(input).mouthShape;
}
```

- [ ] **Step 5: Run focused and candidate-avatar tests**

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts
npm.cmd run test:candidate-avatar
```

Expected: PASS; existing Korean timeline and PNG mouth-shape assertions remain unchanged.

- [ ] **Step 6: Commit only when explicitly requested by the user**

Candidate commit:

```text
feat(candidate): Cubism용 연속 립싱크 신호 추가
```

### Task 2: Numeric Cubism Renderer Contract

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/CubismProofInterviewerAvatar.tsx`
- Test: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: a finite `mouthOpen: number` value from manual QA or `useLipSyncDriverState`.
- Produces: `CubismProofInterviewerAvatar({ mouthOpen, reducedMotion, className })` with a clamped `data-cubism-mouth-open` value.

- [ ] **Step 1: Change the component test first**

Replace the shape-based render with a numeric input and add clamp coverage:

```tsx
const cubismProofMarkup = renderToStaticMarkup(
  <CubismProofInterviewerAvatar mouthOpen={0.42} reducedMotion={false} />,
);
assert.match(cubismProofMarkup, /data-cubism-mouth-open="0\.42"/);

const clampedProofMarkup = renderToStaticMarkup(
  <CubismProofInterviewerAvatar mouthOpen={2} reducedMotion={false} />,
);
assert.match(clampedProofMarkup, /data-cubism-mouth-open="1"/);
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Expected: TypeScript/JSX failure because `mouthOpen` is not yet a component prop.

- [ ] **Step 3: Implement the numeric prop**

Replace `mouthShape` with `mouthOpen`, clamp non-finite and out-of-range values locally, and preserve reduced-motion behavior:

```ts
export interface CubismProofInterviewerAvatarProps {
  mouthOpen: number;
  reducedMotion: boolean;
  className?: string;
}

function clampMouthOpen(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const renderedMouthOpen = reducedMotion ? 0 : clampMouthOpen(mouthOpen);
```

Use `renderedMouthOpen` for the ref, renderer updates, and QA attribute.

- [ ] **Step 4: Update the manual proof caller**

In `InterviewerRiggingPreview.tsx`, convert the selected manual mouth shape at the caller boundary:

```tsx
<CubismProofInterviewerAvatar
  mouthOpen={getCubismMouthOpenValue(avatarQaState.mouthShape)}
  reducedMotion={avatarQaState.reducedMotion}
/>
```

- [ ] **Step 5: Run the focused component test**

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Expected: PASS with `0.42`, clamp-to-1, fallback image, and canvas assertions.

- [ ] **Step 6: Commit only when explicitly requested by the user**

Candidate commit:

```text
refactor(candidate): Cubism proof 입력을 연속값으로 변경
```

### Task 3: Shared Audio QA For PNG And Cubism

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css`
- Test: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: `useLipSyncDriverState({ presentationState, audioSource, speechText, reducedMotion })` from Task 1 and numeric Cubism prop from Task 2.
- Produces: one audio QA root with `data-audio-qa-cubism-min`, `data-audio-qa-cubism-max`, a PNG stage, and a Cubism stage.

- [ ] **Step 1: Add failing markup assertions**

Add assertions for the initial shared QA contract:

```ts
assert.match(markup, /data-audio-qa-cubism-min="0\.000"/);
assert.match(markup, /data-audio-qa-cubism-max="0\.000"/);
assert.match(markup, /data-audio-qa-renderer="png"/);
assert.match(markup, /data-audio-qa-renderer="cubism"/);
```

- [ ] **Step 2: Run the preview test and confirm RED**

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Expected: FAIL because the range attributes and renderer labels are absent.

- [ ] **Step 3: Share one hook result**

Inside `InterviewerAudioLipSyncQa`, call the combined hook exactly once:

```ts
const presentationState: AvatarPresentationState = playing ? "speaking" : "idle";
const lipSyncState = useLipSyncDriverState({
  presentationState,
  audioSource: audioElement,
  speechText: AUDIO_QA_SPEECH_TEXT,
  reducedMotion: false,
});
```

Remove the encapsulated `InterviewAvatar` from this QA component. Render the existing presentational PNG component and the Cubism proof from the same result:

```tsx
<div className="interviewer-rigging-preview__runtime-stage" data-audio-qa-renderer="png">
  <LocalInterviewerAvatar
    presentationState={presentationState}
    mouthShape={lipSyncState.mouthShape}
    reducedMotion={false}
  />
</div>
<div className="interviewer-rigging-preview__runtime-stage" data-audio-qa-renderer="cubism">
  <CubismProofInterviewerAvatar mouthOpen={lipSyncState.mouthOpen} reducedMotion={false} />
</div>
```

- [ ] **Step 4: Record the observed numeric range without DOM polling**

Use state updated from the shared numeric signal:

```ts
const [observedCubismRange, setObservedCubismRange] = useState({ min: 0, max: 0 });

useEffect(() => {
  setObservedCubismRange((current) => ({
    min: Math.min(current.min, lipSyncState.mouthOpen),
    max: Math.max(current.max, lipSyncState.mouthOpen),
  }));
}, [lipSyncState.mouthOpen]);
```

Reset it to `{ min: 0, max: 0 }` before playback and expose rounded values:

```tsx
data-audio-qa-cubism-min={observedCubismRange.min.toFixed(3)}
data-audio-qa-cubism-max={observedCubismRange.max.toFixed(3)}
```

Keep the existing `MutationObserver` only for the PNG mouth-shape history.

- [ ] **Step 5: Add stable two-stage layout**

Wrap both renderer stages in an unframed responsive grid:

```css
.interviewer-rigging-preview__audio-qa-stages {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}

@media (max-width: 760px) {
  .interviewer-rigging-preview__audio-qa-stages {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 6: Run all focused tests**

```powershell
npm.cmd run test:candidate-avatar
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Verify the production build**

```powershell
npm.cmd run build
```

Expected: Next.js build exits 0 and `/interviewer-preview` remains generated.

- [ ] **Step 8: Verify local browser behavior**

At `http://localhost:3000/interviewer-preview`:

1. Click `로컬 음원 재생`.
2. Confirm `data-audio-qa-cubism-max` becomes greater than 0.5 during the high-amplitude segment.
3. Confirm `data-cubism-mouth-open` returns to `0` after playback ends.
4. Confirm `data-cubism-model-status="ready"` and no browser console errors.
5. Confirm desktop and mobile widths show no overlap between the two QA stages.

- [ ] **Step 9: Run the required Role D harness**

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

Expected: PASS. If ownership checks identify pre-existing A-owned files or Prisma generation is blocked by the running Windows DLL, report those exact blockers and run the remaining non-destructive checks individually.

- [ ] **Step 10: Commit only when explicitly requested by the user**

Candidate commit:

```text
feat(candidate): Cubism proof에 RMS 립싱크 연결
```

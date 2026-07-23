# Lip Sync Tuning Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 한국어 브라우저 TTS로 립싱크를 조절하고 저장한 값을 모의·채용 면접 PNG 아바타에 적용하는 안전한 튜닝 패널을 만든다.

**Architecture:** 새 `LipSyncTuning.ts`가 버전 1 설정의 기본값·정규화·브라우저 저장·구독을 담당한다. `LipSyncDriver`와 `LocalInterviewerAvatar`는 설정을 주입받고, `/interviewer-preview`의 별도 튜닝 패널은 draft 설정으로 실제 TTS를 재생한다. 실제 `InterviewAvatar`는 저장된 설정만 읽으므로 저장 전 편집은 운영 면접에 영향을 주지 않는다.

**Tech Stack:** Next.js 16.2.9, React 19.2.7, TypeScript 5.9.3, Web Speech API, Web Audio API, localStorage, Node assert/tsx 테스트

## Global Constraints

- Node.js 20 LTS와 npm을 사용하며 새 의존성을 추가하지 않는다.
- API, DB, 환경변수, 기존 TTS 제공자와 Realtime 세션 계약을 변경하지 않는다.
- 기본값은 `timelineOffsetMs=0`, `minimumShapeHoldMs=80`, `silenceHangoverMs=60`, `fullOpenEnterThreshold=0.58`, `fullOpenExitThreshold=0.42`다.
- TTS는 실제 면접과 같은 `ko-KR`, rate `0.9`, pitch `1`을 사용한다.
- draft는 미리보기에만 적용하고 저장된 설정만 실제 면접에 적용한다.
- `prefers-reduced-motion`이면 기존처럼 입 애니메이션을 정지한다.
- UI는 44px 터치 타깃, 명시적 label, `aria-live="polite"`, 760px 단일 열을 제공한다.
- 문서 변경은 PM cross-owner review 대상으로 기록한다.

---

### Task 1: 버전형 립싱크 튜닝 설정

**Files:**
- Create: `frontend/src/features/candidate-application-interview/LipSyncTuning.ts`
- Create: `frontend/src/features/candidate-application-interview/LipSyncTuning.spec.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `LipSyncTuningSettings`, `DEFAULT_LIP_SYNC_TUNING_SETTINGS`, `normalizeLipSyncTuningSettings`, `readLipSyncTuningSettings`, `writeLipSyncTuningSettings`, `resetLipSyncTuningSettings`, `useStoredLipSyncTuningSettings`.
- Storage envelope: `{ version: 1, settings: LipSyncTuningSettings }`.

- [ ] **Step 1: Write the failing settings tests**

```ts
import { strict as assert } from "node:assert";
import {
  DEFAULT_LIP_SYNC_TUNING_SETTINGS,
  normalizeLipSyncTuningSettings,
  readLipSyncTuningSettings,
  resetLipSyncTuningSettings,
  writeLipSyncTuningSettings,
} from "./LipSyncTuning";

const normalized = normalizeLipSyncTuningSettings({
  timelineOffsetMs: 999,
  minimumShapeHoldMs: 71,
  silenceHangoverMs: -3,
  fullOpenEnterThreshold: 0.5,
  fullOpenExitThreshold: 0.6,
});
assert.deepEqual(normalized, {
  timelineOffsetMs: 200,
  minimumShapeHoldMs: 70,
  silenceHangoverMs: 0,
  fullOpenEnterThreshold: 0.5,
  fullOpenExitThreshold: 0.45,
});

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => void values.set(key, value),
  removeItem: (key: string) => void values.delete(key),
};
assert.deepEqual(readLipSyncTuningSettings(storage), DEFAULT_LIP_SYNC_TUNING_SETTINGS);
writeLipSyncTuningSettings(storage, normalized);
assert.deepEqual(readLipSyncTuningSettings(storage), normalized);
resetLipSyncTuningSettings(storage);
assert.deepEqual(readLipSyncTuningSettings(storage), DEFAULT_LIP_SYNC_TUNING_SETTINGS);
```

- [ ] **Step 2: Run the settings test and verify RED**

Run: `npx --no-install tsx src/features/candidate-application-interview/LipSyncTuning.spec.ts`

Expected: FAIL because `./LipSyncTuning` does not exist.

- [ ] **Step 3: Implement normalization, storage and subscription**

```ts
"use client";

import { useEffect, useState } from "react";

export interface LipSyncTuningSettings {
  timelineOffsetMs: number;
  minimumShapeHoldMs: number;
  silenceHangoverMs: number;
  fullOpenEnterThreshold: number;
  fullOpenExitThreshold: number;
}

export const DEFAULT_LIP_SYNC_TUNING_SETTINGS: LipSyncTuningSettings = {
  timelineOffsetMs: 0,
  minimumShapeHoldMs: 80,
  silenceHangoverMs: 60,
  fullOpenEnterThreshold: 0.58,
  fullOpenExitThreshold: 0.42,
};

export const LIP_SYNC_TUNING_STORAGE_KEY = "candidate.interviewer-lip-sync-tuning.v1";
export const LIP_SYNC_TUNING_CHANGE_EVENT = "candidate:interviewer-lip-sync-tuning-change";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stepped(value: number, min: number, max: number, step: number, digits = 0): number {
  const clamped = Math.min(max, Math.max(min, value));
  return Number((Math.round(clamped / step) * step).toFixed(digits));
}

export function normalizeLipSyncTuningSettings(value: Partial<LipSyncTuningSettings> | null | undefined): LipSyncTuningSettings {
  const input = value ?? {};
  const fullOpenEnterThreshold = stepped(
    numeric(input.fullOpenEnterThreshold, DEFAULT_LIP_SYNC_TUNING_SETTINGS.fullOpenEnterThreshold),
    0.45,
    0.75,
    0.01,
    2,
  );
  const requestedExit = stepped(
    numeric(input.fullOpenExitThreshold, DEFAULT_LIP_SYNC_TUNING_SETTINGS.fullOpenExitThreshold),
    0.25,
    0.6,
    0.01,
    2,
  );
  return {
    timelineOffsetMs: stepped(numeric(input.timelineOffsetMs, 0), -200, 200, 10),
    minimumShapeHoldMs: stepped(numeric(input.minimumShapeHoldMs, 80), 60, 120, 10),
    silenceHangoverMs: stepped(numeric(input.silenceHangoverMs, 60), 0, 150, 10),
    fullOpenEnterThreshold,
    fullOpenExitThreshold: Math.min(requestedExit, Number((fullOpenEnterThreshold - 0.05).toFixed(2))),
  };
}

export function readLipSyncTuningSettings(storage: ReadStorage | null | undefined): LipSyncTuningSettings {
  if (!storage) return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
  try {
    const raw = storage.getItem(LIP_SYNC_TUNING_STORAGE_KEY);
    if (!raw) return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
    const parsed = JSON.parse(raw) as { version?: unknown; settings?: unknown };
    if (parsed.version !== 1 || !parsed.settings || typeof parsed.settings !== "object") {
      return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
    }
    return normalizeLipSyncTuningSettings(parsed.settings as Partial<LipSyncTuningSettings>);
  } catch {
    return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
  }
}

export function writeLipSyncTuningSettings(storage: WriteStorage, value: Partial<LipSyncTuningSettings>): LipSyncTuningSettings {
  const settings = normalizeLipSyncTuningSettings(value);
  storage.setItem(LIP_SYNC_TUNING_STORAGE_KEY, JSON.stringify({ version: 1, settings }));
  return settings;
}

export function resetLipSyncTuningSettings(storage: WriteStorage): LipSyncTuningSettings {
  storage.removeItem(LIP_SYNC_TUNING_STORAGE_KEY);
  return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
}

export function saveLipSyncTuningSettings(value: Partial<LipSyncTuningSettings>): LipSyncTuningSettings {
  const settings = writeLipSyncTuningSettings(window.localStorage, value);
  window.dispatchEvent(new Event(LIP_SYNC_TUNING_CHANGE_EVENT));
  return settings;
}

export function clearLipSyncTuningSettings(): LipSyncTuningSettings {
  const settings = resetLipSyncTuningSettings(window.localStorage);
  window.dispatchEvent(new Event(LIP_SYNC_TUNING_CHANGE_EVENT));
  return settings;
}

export function useStoredLipSyncTuningSettings(): LipSyncTuningSettings {
  const [settings, setSettings] = useState(DEFAULT_LIP_SYNC_TUNING_SETTINGS);
  useEffect(() => {
    const sync = () => setSettings(readLipSyncTuningSettings(window.localStorage));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(LIP_SYNC_TUNING_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(LIP_SYNC_TUNING_CHANGE_EVENT, sync);
    };
  }, []);
  return settings;
}
```

Do not accept strings as valid numeric input. The browser-facing helpers above dispatch `LIP_SYNC_TUNING_CHANGE_EVENT` only after localStorage succeeds.

- [ ] **Step 4: Add the test to `test:candidate-avatar` and verify GREEN**

Prepend `tsx src/features/candidate-application-interview/LipSyncTuning.spec.ts &&` to the existing script.

Run: `npm run test:candidate-avatar`

Expected: all candidate avatar tests exit 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add frontend/package.json frontend/src/features/candidate-application-interview/LipSyncTuning.ts frontend/src/features/candidate-application-interview/LipSyncTuning.spec.ts
git commit -m "feat(candidate): 립싱크 튜닝 설정 저장 추가"
```

---

### Task 2: 드라이버와 PNG 렌더러 설정 주입

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`

**Interfaces:**
- Consumes: `LipSyncTuningSettings`, `DEFAULT_LIP_SYNC_TUNING_SETTINGS`.
- Produces: `applyTimelineOffsetMs(elapsedMs, offsetMs, timelineEndMs)`, `getTimelineMouthOpenValue(timeline, elapsedMs)`, configurable stabilization and configurable `resolveMouthOpenness`.

- [ ] **Step 1: Write failing driver and renderer tests**

```ts
assert.equal(applyTimelineOffsetMs(100, 50, 300), 150);
assert.equal(applyTimelineOffsetMs(100, -150, 300), 0);
assert.equal(applyTimelineOffsetMs(280, 50, 300), 300);

const openCue = [{ startMs: 0, endMs: 1_000, mouthShape: "open" as const }];
assert.ok(getTimelineMouthOpenValue(openCue, 20) < 0.58);
assert.ok(getTimelineMouthOpenValue(openCue, 500) >= 0.58);
assert.ok(getTimelineMouthOpenValue(openCue, 980) < 0.58);

assert.equal(stabilizeMouthShape({
  previous: { mouthShape: "open", changedAtMs: 100, lastVoicedAtMs: 100 },
  requestedMouthShape: "wide",
  nowMs: 171,
  voiced: true,
  forceRest: false,
  minimumShapeHoldMs: 70,
  silenceHangoverMs: 90,
}).mouthShape, "wide");
```

```ts
assert.equal(
  resolveMouthOpenness("small", 0.65, { enter: 0.7, exit: 0.5 }),
  "small",
);
assert.equal(
  resolveMouthOpenness("full", 0.55, { enter: 0.7, exit: 0.5 }),
  "full",
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`

Run: `npx --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`

Expected: FAIL for missing functions and unsupported configuration arguments.

- [ ] **Step 3: Implement offset, fallback envelope and configurable stabilization**

```ts
export function applyTimelineOffsetMs(elapsedMs: number, offsetMs: number, timelineEndMs: number): number {
  const safeElapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const safeOffset = Number.isFinite(offsetMs) ? offsetMs : 0;
  const safeEnd = Number.isFinite(timelineEndMs) ? Math.max(0, timelineEndMs) : 0;
  return Math.min(safeEnd, Math.max(0, safeElapsed + safeOffset));
}

export function getTimelineMouthOpenValue(timeline: VisemeCue[], elapsedMs: number): number {
  const cue = getTimelineCue(timeline, elapsedMs);
  if (!cue) return 0;
  const base = getMouthOpenValueForShape(cue.mouthShape);
  if (cue.mouthShape === "rest" || cue.mouthShape === "closed" || cue.mouthShape === "teeth") return base;
  const duration = Math.max(1, cue.endMs - cue.startMs);
  const progress = Math.min(1, Math.max(0, (elapsedMs - cue.startMs) / duration));
  const edgeProgress = Math.min(1, progress / 0.25, (1 - progress) / 0.25);
  return base * (0.45 + 0.55 * edgeProgress);
}
```

Use `input.tuning ?? DEFAULT_LIP_SYNC_TUNING_SETTINGS` inside `useLipSyncDriverState`. Apply offset before `setElapsedMs`, pass configured hold/hangover to `stabilizeMouthShape`, and use `getTimelineMouthOpenValue` only when audio analysis is unavailable.

- [ ] **Step 4: Make PNG openness thresholds configurable**

```ts
export interface MouthOpennessThresholds {
  enter: number;
  exit: number;
}

export function resolveMouthOpenness(previous: MouthOpenness, mouthOpen: number, thresholds = DEFAULT_THRESHOLDS): MouthOpenness {
  if (!Number.isFinite(mouthOpen)) return previous;
  return previous === "full"
    ? mouthOpen <= thresholds.exit ? "small" : "full"
    : mouthOpen >= thresholds.enter ? "full" : "small";
}
```

Add optional `fullOpenEnterThreshold` and `fullOpenExitThreshold` props, and use them for initial state and updates.

- [ ] **Step 5: Run candidate avatar tests and commit Task 2**

Run: `npm run test:candidate-avatar`

Expected: all candidate avatar tests exit 0.

```bash
git add frontend/src/features/candidate-application-interview/LipSyncDriver.ts frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx
git commit -m "feat(candidate): 립싱크 튜닝값 주입 추가"
```

---

### Task 3: 실제 한국어 TTS 튜닝 패널

**Files:**
- Create: `frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css`

**Interfaces:**
- Consumes: Task 1 settings functions, Task 2 driver and renderer props.
- Produces: `InterviewerLipSyncTuningPanel`, default TTS sentence, draft/save/reset UI, live transition history.

- [ ] **Step 1: Write failing component contract tests**

Add static markup/source assertions for:

```ts
assert.match(markup, /data-lip-sync-tuning-panel="true"/);
assert.match(markup, /안녕하세요\. 지금부터 AI 모의면접을 시작하겠습니다\./);
assert.match(markup, /입 모양 시간차/);
assert.match(markup, /최소 입 모양 유지/);
assert.match(markup, /무음 여운/);
assert.match(markup, /큰 입 전환 기준/);
assert.match(markup, /작은 입 복귀 기준/);
assert.match(markup, />설정 저장</);
assert.match(markup, />기본값으로 초기화</);
assert.match(markup, /aria-live="polite"/);
assert.match(previewSource, /InterviewerLipSyncTuningPanel/);
```

- [ ] **Step 2: Run preview test and verify RED**

Run: `npx --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

Expected: FAIL because the tuning panel is not rendered.

- [ ] **Step 3: Implement the TTS playback and draft state**

Create a client component with this state contract:

```ts
export const DEFAULT_LIP_SYNC_TUNING_SPEECH_TEXT =
  "안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.";

type PlaybackState = "idle" | "playing" | "error" | "unsupported";
type TransitionRecord = {
  id: number;
  characterIndex: number;
  character: string;
  mouthShape: MouthShape;
  mouthVariant: string;
};
```

On mount, load saved settings into draft and detect `speechSynthesis`. `play()` must trim the text, cancel only the preview utterance before replacement, create `SpeechSynthesisUtterance`, set `lang="ko-KR"`, `rate=0.9`, `pitch=1`, select the first `ko` voice if available, forward `onboundary` as a monotonically increasing `SpeechBoundaryTiming`, and restore idle state on end. `stop()` must cancel, clear the utterance ref and boundary, and return the avatar to idle.

- [ ] **Step 4: Render controls, preview and transition history**

Define the exact control metadata and render contract:

```tsx
const tuningFields = [
  { key: "timelineOffsetMs", label: "입 모양 시간차", min: -200, max: 200, step: 10, unit: "ms" },
  { key: "minimumShapeHoldMs", label: "최소 입 모양 유지", min: 60, max: 120, step: 10, unit: "ms" },
  { key: "silenceHangoverMs", label: "무음 여운", min: 0, max: 150, step: 10, unit: "ms" },
  { key: "fullOpenEnterThreshold", label: "큰 입 전환 기준", min: 0.45, max: 0.75, step: 0.01, unit: "" },
  { key: "fullOpenExitThreshold", label: "작은 입 복귀 기준", min: 0.25, max: 0.6, step: 0.01, unit: "" },
] as const;

return (
  <section className="interviewer-rigging-preview__tuning-panel" data-lip-sync-tuning-panel="true">
    <div className="interviewer-rigging-preview__tuning-controls">
      <label>
        <span>테스트 문장</span>
        <textarea value={speechText} onChange={(event) => setSpeechText(event.target.value)} />
      </label>
      {tuningFields.map((field) => (
        <label className="interviewer-rigging-preview__tuning-field" key={field.key}>
          <span>{field.label}</span>
          <input
            aria-label={field.label}
            min={field.min}
            max={field.max}
            step={field.step}
            type="range"
            value={draft[field.key]}
            onChange={(event) => setDraft((current) => normalizeLipSyncTuningSettings({
              ...current,
              [field.key]: Number(event.target.value),
            }))}
          />
          <output>{draft[field.key]}{field.unit}</output>
        </label>
      ))}
      <div className="interviewer-rigging-preview__tuning-actions">
        <button type="button" onClick={() => void toggleSpeech()}>{playing ? "TTS 정지" : "TTS 재생"}</button>
        <button type="button" onClick={saveDraft}>설정 저장</button>
        <button type="button" onClick={resetDraft}>기본값으로 초기화</button>
      </div>
      <p aria-live="polite" className="interviewer-rigging-preview__tuning-status">{statusMessage}</p>
      <ol className="interviewer-rigging-preview__tuning-history" aria-label="최근 입 모양 전환 기록">
        {transitionHistory.map((item) => (
          <li key={item.id}>{item.character} · {item.mouthShape} · {item.mouthVariant}</li>
        ))}
      </ol>
    </div>
    <div className="interviewer-rigging-preview__tuning-live" ref={previewRootRef}>
      <LocalInterviewerAvatar
        presentationState={playing ? "speaking" : "idle"}
        mouthShape={lipSyncState.mouthShape}
        mouthOpen={lipSyncState.mouthOpen}
        fullOpenEnterThreshold={draft.fullOpenEnterThreshold}
        fullOpenExitThreshold={draft.fullOpenExitThreshold}
        reducedMotion={reducedMotion}
      />
    </div>
  </section>
);
```

Observe `previewRootRef` with `MutationObserver`. Read the avatar root's `data-mouth-shape` and `data-mouth-variant`, compare the pair with the latest record, append `{ id, characterIndex, character, mouthShape, mouthVariant }` only when it changes, and retain `records.slice(-24)`. `saveDraft` calls `saveLipSyncTuningSettings`, while `resetDraft` calls `clearLipSyncTuningSettings` and restores the returned defaults.

Saving must normalize and write draft settings, dispatch the tuning change event, then report `실제 면접 적용 설정으로 저장했습니다.` Reset must remove storage, restore defaults, dispatch the event and report `기본값으로 초기화했습니다.` Storage errors must leave draft unchanged and set an error status.

- [ ] **Step 5: Add responsive styles**

Add `__tuning-panel`, `__tuning-controls`, `__tuning-field`, `__tuning-actions`, `__tuning-status`, `__tuning-live`, and `__tuning-history` rules. Use white surfaces, `#d8dee6` hairlines, `#0f766e` focus/accent, 8px radius, 8/12/16/24px spacing and 44px controls. Under 760px, make the controls and live area a single column.

- [ ] **Step 6: Run tests and commit Task 3**

Run: `npm run test:candidate-avatar`

Expected: all candidate avatar tests exit 0.

```bash
git add frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css
git commit -m "feat(candidate): 실제 TTS 립싱크 튜닝 패널 추가"
```

---

### Task 4: 실제 면접 적용과 완료 검증

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/InterviewAvatar.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: `useStoredLipSyncTuningSettings` and all configurable driver/renderer inputs.
- Produces: saved settings applied to mock and recruiting avatars through their shared `InterviewAvatar`.

- [ ] **Step 1: Write the failing integration assertion**

```ts
assert.match(interviewAvatarSource, /useStoredLipSyncTuningSettings/);
assert.match(interviewAvatarSource, /tuning:\s*lipSyncTuning/);
assert.match(interviewAvatarSource, /fullOpenEnterThreshold=\{lipSyncTuning\.fullOpenEnterThreshold\}/);
assert.match(interviewAvatarSource, /fullOpenExitThreshold=\{lipSyncTuning\.fullOpenExitThreshold\}/);
```

- [ ] **Step 2: Run preview test and verify RED**

Run: `npx --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

Expected: FAIL because `InterviewAvatar` does not read stored tuning.

- [ ] **Step 3: Wire saved settings into actual interview rendering**

```tsx
const lipSyncTuning = useStoredLipSyncTuningSettings();
const lipSyncState = useLipSyncDriverState({
  presentationState,
  audioSource,
  audioStream,
  speechText,
  speechBoundary,
  reducedMotion,
  tuning: lipSyncTuning,
});

return <LocalInterviewerAvatar
  presentationState={presentationState}
  mouthShape={lipSyncState.mouthShape}
  mouthOpen={lipSyncState.mouthOpen}
  fullOpenEnterThreshold={lipSyncTuning.fullOpenEnterThreshold}
  fullOpenExitThreshold={lipSyncTuning.fullOpenExitThreshold}
  reducedMotion={reducedMotion}
  className={className}
/>;
```

- [ ] **Step 4: Run automated verification**

Run in `frontend`: `npm run test:candidate-avatar`

Expected: exit 0.

Run in `frontend`: `npm run typecheck`

Expected: exit 0.

Run in `frontend`: `npm run build`

Expected: Next build exit 0; restore generated `next-env.d.ts` if Next rewrites only its route reference.

- [ ] **Step 5: Run browser QA**

Open `http://localhost:3000/interviewer-preview`. Verify default TTS produces rest, at least one `*-small`, and at least one full `open|wide|round` variant; change a slider; save; reload and verify persistence; reset and verify defaults; confirm no console error.

- [ ] **Step 6: Run Role D harness and commit Task 4**

Run at repository root:

`powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`

Expected: `[ok] local harness passed` and zero test failures.

```bash
git add frontend/src/features/candidate-application-interview/InterviewAvatar.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
git commit -m "feat(candidate): 저장된 립싱크 튜닝 실제 면접 적용"
```

Finally run `git status --short`, `git diff --check`, and report PM cross-owner review for the design and plan documents.

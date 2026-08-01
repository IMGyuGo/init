# RMS 전용 PNG 립싱크 비교 미리보기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/interviewer-preview`에서 현재 PNG 립싱크와 `a7d4abe8` 직전 RMS 전용 `rest/closed/open` 립싱크를 동일한 오디오 분석 결과로 나란히 표시한다.

**Architecture:** 기존 `useLipSyncDriverState`가 계산하는 RMS를 상태 계약에 추가해 단일 Web Audio 분석 결과를 공유한다. QA 화면은 현재 `mouthShape`과 동일 RMS에서 계산한 과거 `getMouthShapeForRms` 결과를 두 개의 `LocalInterviewerAvatar`에 각각 전달하며, 실제 면접의 `InterviewAvatar` 경로는 변경하지 않는다.

**Tech Stack:** React 19.2.7, Next.js 16.2.9, TypeScript 5.9.3, Node.js 20.x, `tsx` 기반 Node assertion tests, CSS Modules

## Global Constraints

- 비교 대상은 `a7d4abe8` 적용 직전의 RMS 전용 `rest`, `closed`, `open` 전환 규칙이다.
- 수정 전 방식에는 `open-small`, `wide-small`, `round-small`, `wide`, `round`, `teeth`를 활성화하지 않는다.
- 하나의 `HTMLAudioElement`와 하나의 Web Audio 분석 결과만 사용한다.
- 실제 모의 면접 및 채용 면접의 `InterviewAvatar` 호출 경로와 기본 PNG 렌더링은 변경하지 않는다.
- 신규 이미지 에셋, API, 데이터베이스, 환경변수, 의존성을 추가하지 않는다.
- Windows 최종 검증은 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`를 사용한다.

---

### Task 1: 단일 분석기의 RMS 상태 공개

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts:45-49,813-821`

**Interfaces:**
- Consumes: 기존 `useLipSyncDriverState(input: LipSyncDriverInput): LipSyncDriverState`
- Produces: `LipSyncDriverState.rms: number`; 말하지 않거나 모션 감소 상태이면 `0`, 그 외에는 현재 분석 프레임 RMS

- [ ] **Step 1: RMS 공유 계약의 실패 테스트 작성**

`LipSyncDriver.spec.ts`에서 새 RMS 출력 경계 함수를 import하고, 기존 RMS 경계 테스트 다음에 말하기·모션 감소 조건을 검증한다. 이 저장소의 `tsx` 테스트는 타입 검사 없이 변환하므로 런타임에서 관찰할 수 있는 동작을 RED로 사용한다.

```ts
import { getLipSyncOutputRms } from "./LipSyncDriver";

assert.equal(getLipSyncOutputRms(0.12, true, false), 0.12);
assert.equal(getLipSyncOutputRms(0.12, false, false), 0);
assert.equal(getLipSyncOutputRms(0.12, true, true), 0);
```

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`

Expected: FAIL with `TypeError: getLipSyncOutputRms is not a function` because the output boundary does not exist.

- [ ] **Step 3: 최소 RMS 상태 계약 구현**

`getLipSyncOutputRms`를 추가하고 `LipSyncDriverState`와 훅 반환값에 RMS를 연결한다. 상태가 전환되는 한 프레임 동안 이전 RMS가 노출되지 않도록 반환 경계에서 말하기/모션 감소 조건을 적용한다.

```ts
export interface LipSyncDriverState {
  mouthShape: MouthShape;
  mouthOpen: number;
  rms: number;
  sourceCharacterIndex?: number;
}

export function getLipSyncOutputRms(
  rms: number,
  speaking: boolean,
  reducedMotion: boolean,
): number {
  return speaking && !reducedMotion ? rms : 0;
}

return {
  mouthShape: mouthShapeStabilization.mouthShape,
  mouthOpen: !speaking || input.reducedMotion
    ? 0
    : audioAnalysisAvailable
      ? mouthOpen
      : getTimelineMouthOpenValue(timeline, elapsedMs),
  rms: getLipSyncOutputRms(rms, speaking, input.reducedMotion),
  sourceCharacterIndex: currentTimelineCue?.sourceCharacterIndex,
};
```

- [ ] **Step 4: 집중 테스트와 후보자 아바타 테스트 실행**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`

Expected: PASS with exit code 0.

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS with every candidate avatar test command exiting 0.

- [ ] **Step 5: RMS 상태 계약 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/LipSyncDriver.ts frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts
git commit -m "feat(candidate): 립싱크 RMS 상태 공개"
```

### Task 2: 현재 방식과 RMS 전용 방식의 동시 비교 UI

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx:86-174`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx:8-12,116-238`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css:270-390`

**Interfaces:**
- Consumes: `LipSyncDriverState.rms`, `LipSyncDriverState.mouthShape`, `getMouthShapeForRms(rms: number): MouthShape`, `LocalInterviewerAvatar`
- Produces: `LocalInterviewerAvatarProps.rendererMode?: "current" | "legacy-rms"`, `getRmsOnlyPreviewMouthShape(input): MouthShape`, `data-audio-qa-renderer="current-png"`, `data-audio-qa-renderer="legacy-rms-png"`

- [ ] **Step 1: RMS 전용 선택 규칙과 비교 마크업의 실패 테스트 작성**

`InterviewerRiggingPreview.spec.tsx`에서 새 순수 함수를 import하고, 과거 RMS 임계값과 상태 게이트를 검증한다.

```ts
import {
  DEFAULT_AVATAR_QA_STATE,
  getRiggingPreviewVariant,
  getRmsOnlyPreviewMouthShape,
  InterviewerAudioLipSyncQa,
  InterviewerRiggingPreview,
  updateAvatarQaState,
} from "./InterviewerRiggingPreview";

assert.equal(getRmsOnlyPreviewMouthShape({ playing: true, reducedMotion: false, rms: 0 }), "rest");
assert.equal(getRmsOnlyPreviewMouthShape({ playing: true, reducedMotion: false, rms: 0.03 }), "closed");
assert.equal(getRmsOnlyPreviewMouthShape({ playing: true, reducedMotion: false, rms: 0.12 }), "open");
assert.equal(getRmsOnlyPreviewMouthShape({ playing: false, reducedMotion: false, rms: 0.12 }), "rest");
assert.equal(getRmsOnlyPreviewMouthShape({ playing: true, reducedMotion: true, rms: 0.12 }), "rest");
```

기존 `markup` assertion에 다음 비교 화면 계약을 추가한다.

```ts
assert.match(markup, /data-audio-qa-renderer="current-png"/);
assert.match(markup, /data-audio-qa-renderer="legacy-rms-png"/);
assert.match(markup, />현재 · Viseme \+ RMS</);
assert.match(markup, />수정 전 · RMS 전용</);
```

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

Expected: FAIL because `getRmsOnlyPreviewMouthShape` is not exported and the two renderer markers do not exist.

- [ ] **Step 3: RMS 전용 선택 함수 구현**

`InterviewerRiggingPreview.tsx`에서 기존 `getMouthShapeForRms`를 import하고, 재생·모션 감소 상태를 먼저 적용하는 순수 함수를 추가한다.

```ts
import {
  getMouthShapeForRms,
  useLipSyncDriverState,
  type AvatarPresentationState,
  type MouthShape,
} from "./LipSyncDriver";

export function getRmsOnlyPreviewMouthShape({
  playing,
  reducedMotion,
  rms,
}: {
  playing: boolean;
  reducedMotion: boolean;
  rms: number;
}): MouthShape {
  if (!playing || reducedMotion) return "rest";
  return getMouthShapeForRms(rms);
}
```

- [ ] **Step 4: 수정 전 자세와 닫힌 입 동작의 실패 테스트 작성**

`LocalInterviewerAvatar.spec.tsx`에 `rendererMode="legacy-rms"`인 말하기 상태를 렌더링하고, 당시 `talking.png` 자세와 `closed` 스프라이트 활성화를 요구한다.

```tsx
const legacyClosedTalkingMarkup = renderToStaticMarkup(
  <LocalInterviewerAvatar
    presentationState="speaking"
    mouthShape="closed"
    reducedMotion={false}
    rendererMode="legacy-rms"
  />,
);

assert.match(legacyClosedTalkingMarkup, /data-renderer-mode="legacy-rms"/);
assert.match(legacyClosedTalkingMarkup, /src="\/assets\/interviewer-avatar\/talking\.png"/);
assertActiveMouthVariant(legacyClosedTalkingMarkup, "closed");
```

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`

Expected: FAIL because the renderer mode, talking posture, and closed sprite activation do not exist.

- [ ] **Step 5: 수정 전 렌더링 모드 구현**

`LocalInterviewerAvatar`에 기본값 `current`인 `rendererMode`를 추가한다. `legacy-rms`일 때만 말하기 자세를 `talking.png`로 바꾸고 `closed` 스프라이트 활성화를 허용한다.

```ts
export type LocalInterviewerAvatarRendererMode = "current" | "legacy-rms";

const postureImagePath = rendererMode === "legacy-rms" && postureState === "speaking"
  ? "/assets/interviewer-avatar/talking.png"
  : postureImageByState[postureState];

const shouldActivateMouth = presentationState === "speaking"
  && !reducedMotion
  && mouthShape !== "rest"
  && (rendererMode === "legacy-rms" || mouthShape !== "closed");
```

- [ ] **Step 6: 하나의 립싱크 상태로 두 비교 카드 렌더링**

`InterviewerAudioLipSyncQa`에서 `lipSyncState.rms`로 수정 전 입 모양을 한 번 계산한다.

```ts
const rmsOnlyMouthShape = getRmsOnlyPreviewMouthShape({
  playing,
  reducedMotion,
  rms: lipSyncState.rms,
});
```

기존 단일 stage를 두 개의 비교 카드로 교체한다. 현재 카드는 기존 `mouthShape`과 `mouthOpen`을 유지하고, 수정 전 카드는 `rmsOnlyMouthShape`만 전달한다.

```tsx
<div className="interviewer-rigging-preview__audio-qa-stages">
  <article className="interviewer-rigging-preview__audio-qa-card" data-audio-qa-renderer="current-png">
    <header>
      <strong>현재 · Viseme + RMS</strong>
      <span>{lipSyncState.mouthShape}</span>
    </header>
    <div className="interviewer-rigging-preview__runtime-stage">
      <LocalInterviewerAvatar
        presentationState={presentationState}
        mouthShape={lipSyncState.mouthShape}
        mouthOpen={lipSyncState.mouthOpen}
        reducedMotion={reducedMotion}
      />
    </div>
  </article>

  <article className="interviewer-rigging-preview__audio-qa-card" data-audio-qa-renderer="legacy-rms-png">
    <header>
      <strong>수정 전 · RMS 전용</strong>
      <span>{rmsOnlyMouthShape}</span>
    </header>
    <div className="interviewer-rigging-preview__runtime-stage">
      <LocalInterviewerAvatar
        presentationState={presentationState}
        mouthShape={rmsOnlyMouthShape}
        reducedMotion={reducedMotion}
        rendererMode="legacy-rms"
      />
    </div>
  </article>
</div>
```

- [ ] **Step 7: 비교 카드와 반응형 레이아웃 구현**

기본 화면은 두 카드를 같은 너비로 배치하고, 모바일 구간에서는 한 열로 쌓는다.

```css
:global(.interviewer-rigging-preview__audio-qa-stages) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}

:global(.interviewer-rigging-preview__audio-qa-card) {
  display: grid;
  gap: 8px;
  min-width: 0;
}

:global(.interviewer-rigging-preview__audio-qa-card > header) {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  color: #334155;
  font-size: 12px;
}

:global(.interviewer-rigging-preview__audio-qa-card > header span) {
  color: #0f766e;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  :global(.interviewer-rigging-preview__audio-qa-stages) {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 8: 집중 테스트와 회귀 테스트 실행**

Run: `npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

Expected: PASS with exit code 0.

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS with both renderer markers present and all existing avatar assertions green.

Run: `npm.cmd run typecheck`

Expected: PASS with exit code 0.

- [ ] **Step 9: 비교 UI 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css
git commit -m "feat(candidate): RMS 전용 립싱크 비교 추가"
```

### Task 3: 전체 검증과 실행 화면 QA

**Files:**
- Verify only: `frontend/src/features/candidate-application-interview/*`
- Verify only: `scripts/check-local.ps1`

**Interfaces:**
- Consumes: Task 1과 Task 2의 최종 구현
- Produces: 테스트·빌드·Role D 하네스 결과와 실행 중인 `/interviewer-preview` 비교 화면 확인 기록

- [ ] **Step 1: 후보자 아바타 테스트 실행**

Run: `npm.cmd run test:candidate-avatar`

Expected: PASS with exit code 0.

- [ ] **Step 2: 프런트엔드 타입 검사와 프로덕션 빌드 실행**

Run: `npm.cmd run typecheck`

Expected: PASS with exit code 0.

Run: `npm.cmd run build`

Expected: PASS and the `/interviewer-preview` route is included in the build output.

- [ ] **Step 3: diff 무결성 확인**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 4: Role D Windows 로컬 하네스 실행**

Run: `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`

Expected: PASS with the Role D summary reporting no failed checks.

- [ ] **Step 5: 실행 중인 화면을 브라우저에서 확인**

Open: `http://localhost:3000/interviewer-preview`

Verify:

- `현재 · Viseme + RMS`와 `수정 전 · RMS 전용` 카드가 나란히 보인다.
- `로컬 음원 재생`을 누르면 두 카드가 동시에 움직인다.
- 수정 전 카드의 표시 값은 재생 중에도 `rest`, `closed`, `open` 중 하나다.
- 재생 정지 후 두 카드가 `rest`로 돌아간다.
- 브라우저 콘솔에 새 오류가 없다.

- [ ] **Step 6: 최종 작업 상태 확인**

Run: `git status --short`

Expected: 계획 문서 외 미커밋 구현 파일이 없고, 사용자 소유의 기존 변경이 새로 생기지 않는다.

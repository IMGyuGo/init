# Realtime RMS Lip-Sync Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenAI Realtime 립싱크 튜닝에서 한 번 생성한 동일 음성으로 현재 Viseme + RMS 방식과 수정 전 RMS 전용 방식을 동시에 비교한다.

**Architecture:** 기존 `InterviewerLipSyncTuningPanel`의 Realtime 연결과 `useLipSyncDriverState`는 한 번만 유지한다. 현재 카드는 드라이버의 `mouthShape`와 `mouthOpen`을 사용하고, RMS 전용 카드는 같은 드라이버의 `rms`를 임계값 함수에 전달해 `rest`, `closed`, `open`만 선택한다. 기존 합성 WAV 기반 `InterviewerAudioLipSyncQa`는 제거하고, 비교 기록은 두 카드의 입 모양 조합을 한 행으로 저장한다.

**Tech Stack:** React 19, Next.js 16, TypeScript, CSS Modules, Node `assert`, `react-dom/server`, Web Audio API, OpenAI Realtime WebRTC

## Global Constraints

- Node.js 20 LTS와 npm을 사용한다.
- 실제 면접 화면의 기본 PNG 렌더링과 저장된 튜닝 설정 동작은 변경하지 않는다.
- OpenAI Realtime 세션, 오디오 요소, `useLipSyncDriverState`, AudioContext는 비교 재생당 각각 하나만 사용한다.
- RMS 전용 방식은 `rest`, `closed`, `open`만 사용하고 `rendererMode="legacy-rms"`를 유지한다.
- 데스크톱은 좌우, `max-width: 760px` 화면은 현재 방식 위·RMS 전용 아래로 배치한다.
- 구현 완료 전 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`를 실행한다.

## File Structure

- Modify: `frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx`
  - 동일 Realtime 스트림을 사용하는 두 비교 카드와 비교 전환 기록을 담당한다.
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
  - 잘못 추가된 합성 WAV QA 컴포넌트와 호출을 제거한다.
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css`
  - Realtime 비교 카드의 좌우/상하 반응형 배치를 정의하고 합성 WAV QA 스타일을 제거한다.
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
  - 단일 Realtime 소스, 두 렌더러 연결, RMS 계산, 비교 기록, 합성 WAV QA 제거를 회귀 검증한다.
- Reference: `docs/superpowers/specs/2026-08-01-realtime-rms-lip-sync-comparison-design.md`
  - 승인된 화면, 데이터 흐름, 상태 처리, 완료 조건이다.

---

### Task 1: 동일 Realtime 스트림을 사용하는 두 비교 카드

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx:3-330`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css:224-383`
- Test: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: `LipSyncDriverState.rms`, `getMouthShapeForRms(rms: number): MouthShape`, `LocalInterviewerAvatar`의 `rendererMode="legacy-rms"`.
- Produces: `getRealtimeRmsPreviewMouthShape(input): MouthShape`, `data-lip-sync-preview-renderer="current" | "legacy-rms"`, 한 개의 Realtime audio/driver에서 렌더링되는 두 카드.

- [ ] **Step 1: RMS 전용 계산과 비교 카드 연결의 실패 테스트 작성**

`InterviewerRiggingPreview.spec.tsx`에서 helper import를 튜닝 패널로 옮기고 다음 검증을 추가한다.

```tsx
import { getRealtimeRmsPreviewMouthShape } from "./InterviewerLipSyncTuningPanel";

assert.equal(getRealtimeRmsPreviewMouthShape({ playing: true, reducedMotion: false, rms: 0 }), "rest");
assert.equal(getRealtimeRmsPreviewMouthShape({ playing: true, reducedMotion: false, rms: 0.03 }), "closed");
assert.equal(getRealtimeRmsPreviewMouthShape({ playing: true, reducedMotion: false, rms: 0.12 }), "open");
assert.equal(getRealtimeRmsPreviewMouthShape({ playing: false, reducedMotion: false, rms: 0.12 }), "rest");
assert.equal(getRealtimeRmsPreviewMouthShape({ playing: true, reducedMotion: true, rms: 0.12 }), "rest");

assert.match(markup, /data-lip-sync-preview-renderer="current"/);
assert.match(markup, /data-lip-sync-preview-renderer="legacy-rms"/);
assert.match(markup, /data-lip-sync-preview-renderer="legacy-rms"[\s\S]*data-renderer-mode="legacy-rms"/);
assert.match(markup, />현재 · Viseme \+ RMS</);
assert.match(markup, />수정 전 · RMS 전용</);
assert.equal(markup.match(/aria-label="OpenAI Realtime 튜닝 음성"/g)?.length, 1);
assert.equal(tuningPanelSource.match(/useLipSyncDriverState\(/g)?.length, 1);
```

- [ ] **Step 2: 테스트를 실행해 새 helper와 카드 마커 부재로 실패하는지 확인**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Working directory: `frontend`

Expected: `getRealtimeRmsPreviewMouthShape` export 또는 `data-lip-sync-preview-renderer` assertion에서 FAIL.

- [ ] **Step 3: 동일 드라이버 출력으로 두 카드 렌더링**

`InterviewerLipSyncTuningPanel.tsx`에서 RMS helper를 추가한다.

```tsx
import {
  getMouthShapeForRms,
  useLipSyncDriverState,
  type MouthShape,
} from "./LipSyncDriver";

export function getRealtimeRmsPreviewMouthShape({
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

단일 `lipSyncState` 선언 아래에서 legacy 값을 계산한다.

```tsx
const rmsOnlyMouthShape = getRealtimeRmsPreviewMouthShape({
  playing,
  reducedMotion,
  rms: lipSyncState.rms,
});
```

기존 단일 stage를 다음 비교 그리드로 교체한다.

```tsx
<div className="interviewer-rigging-preview__tuning-comparison" ref={previewRootRef}>
  <article
    className="interviewer-rigging-preview__tuning-card"
    data-lip-sync-preview-renderer="current"
  >
    <header><strong>현재 · Viseme + RMS</strong><span>{lipSyncState.mouthShape}</span></header>
    <div className="interviewer-rigging-preview__runtime-stage interviewer-rigging-preview__tuning-live">
      <LocalInterviewerAvatar
        fullOpenEnterThreshold={draft.fullOpenEnterThreshold}
        fullOpenExitThreshold={draft.fullOpenExitThreshold}
        mouthOpen={lipSyncState.mouthOpen}
        mouthShape={lipSyncState.mouthShape}
        presentationState={playing ? "speaking" : "idle"}
        reducedMotion={reducedMotion}
      />
    </div>
  </article>
  <article
    className="interviewer-rigging-preview__tuning-card"
    data-lip-sync-preview-renderer="legacy-rms"
  >
    <header><strong>수정 전 · RMS 전용</strong><span>{rmsOnlyMouthShape}</span></header>
    <div className="interviewer-rigging-preview__runtime-stage interviewer-rigging-preview__tuning-live">
      <LocalInterviewerAvatar
        mouthShape={rmsOnlyMouthShape}
        presentationState={playing ? "speaking" : "idle"}
        reducedMotion={reducedMotion}
        rendererMode="legacy-rms"
      />
    </div>
  </article>
</div>
```

`InterviewerRiggingPreview.module.css`에 비교 레이아웃을 추가한다.

```css
:global(.interviewer-rigging-preview__tuning-comparison) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}

:global(.interviewer-rigging-preview__tuning-card) {
  display: grid;
  gap: 8px;
  min-width: 0;
}

:global(.interviewer-rigging-preview__tuning-card > header) {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  color: #334155;
  font-size: 12px;
}

:global(.interviewer-rigging-preview__tuning-card > header span) {
  color: #0f766e;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  :global(.interviewer-rigging-preview__tuning-comparison) {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: 집중 테스트와 타입 검사를 실행해 통과 확인**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
npm.cmd run typecheck
```

Working directory: `frontend`

Expected: 두 명령 exit 0.

- [ ] **Step 5: 비교 카드 구현 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
git commit -m "feat(candidate): Realtime 립싱크 동시 비교 추가"
```

---

### Task 2: 현재 방식과 RMS 전용 방식의 전환 기록 비교

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx:77-165,297-328`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css:353-383`
- Test: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: Task 1의 `data-lip-sync-preview-renderer="current" | "legacy-rms"` 카드와 `currentCharacterIndexRef`.
- Produces: `MouthComparisonTransition` 행과 `aria-label="최근 입 모양 비교 기록"` 목록.

- [ ] **Step 1: 비교 기록 구조의 실패 테스트 작성**

`InterviewerRiggingPreview.spec.tsx`의 기존 기록 assertion을 다음으로 교체한다.

```tsx
assert.match(markup, /aria-label="최근 입 모양 비교 기록"/);
assert.match(markup, />문자</);
assert.match(markup, />현재</);
assert.match(markup, />RMS 전용</);
assert.match(tuningPanelSource, /data-lip-sync-preview-renderer="current"/);
assert.match(tuningPanelSource, /data-lip-sync-preview-renderer="legacy-rms"/);
assert.match(tuningPanelSource, /currentMouthShape/);
assert.match(tuningPanelSource, /legacyMouthShape/);
```

- [ ] **Step 2: 집중 테스트를 실행해 기존 단일 전환 기록 때문에 실패하는지 확인**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Working directory: `frontend`

Expected: 새 aria-label 또는 비교 필드 assertion에서 FAIL.

- [ ] **Step 3: 두 아바타의 입 모양 조합을 기록하도록 변경**

기존 `MouthTransition`을 다음 타입으로 교체한다.

```tsx
type MouthComparisonTransition = {
  id: number;
  character: string;
  currentMouthShape: MouthShape;
  legacyMouthShape: MouthShape;
};
```

MutationObserver의 `recordTransition`은 두 카드의 아바타를 각각 찾는다.

```tsx
const currentAvatar = previewRoot.querySelector(
  '[data-lip-sync-preview-renderer="current"] .local-interviewer-avatar',
);
const legacyAvatar = previewRoot.querySelector(
  '[data-lip-sync-preview-renderer="legacy-rms"] .local-interviewer-avatar',
);
const currentMouthShape = currentAvatar?.getAttribute("data-mouth-shape") as MouthShape | null;
const legacyMouthShape = legacyAvatar?.getAttribute("data-mouth-shape") as MouthShape | null;
if (!currentMouthShape || !legacyMouthShape) return;

const transitionKey = `${currentMouthShape}:${legacyMouthShape}`;
if (transitionKey === previousKey) return;
previousKey = transitionKey;
transitionIdRef.current += 1;
setTransitions((current) => [...current, {
  id: transitionIdRef.current,
  character: speechText.at(currentCharacterIndexRef.current) ?? "-",
  currentMouthShape,
  legacyMouthShape,
}].slice(-24));
```

observer의 `attributeFilter`는 `data-mouth-shape`, `data-state`만 유지한다. 목록 헤더와 행은 다음 세 열로 렌더링한다.

```tsx
<div className="interviewer-rigging-preview__tuning-history-head" aria-hidden="true">
  <span>문자</span><span>현재</span><span>RMS 전용</span>
</div>
<ol aria-label="최근 입 모양 비교 기록" className="interviewer-rigging-preview__tuning-history">
  {transitions.length === 0 ? (
    <li><span>-</span><span>재생 대기</span><span>재생 대기</span></li>
  ) : transitions.map((transition) => (
    <li key={transition.id}>
      <span>{transition.character}</span>
      <span>{transition.currentMouthShape}</span>
      <span>{transition.legacyMouthShape}</span>
    </li>
  ))}
</ol>
```

CSS의 기록 열도 동일하게 맞춘다.

```css
:global(.interviewer-rigging-preview__tuning-history-head),
:global(.interviewer-rigging-preview__tuning-history li) {
  display: grid;
  grid-template-columns: 40px repeat(2, minmax(0, 1fr));
  gap: 8px;
}
```

- [ ] **Step 4: 집중 테스트와 후보자 아바타 묶음 테스트 실행**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
npm.cmd run test:candidate-avatar
```

Working directory: `frontend`

Expected: 두 명령 exit 0.

- [ ] **Step 5: 비교 기록 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
git commit -m "feat(candidate): 립싱크 비교 전환 기록 추가"
```

---

### Task 3: 합성 WAV 기반 별도 RMS QA 제거

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx:3-280,381-383`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css:385-483,518-528`
- Test: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: Task 1의 Realtime 튜닝 내부 RMS 전용 카드.
- Produces: 합성 WAV, `InterviewerAudioLipSyncQa`, `data-audio-lip-sync-qa`가 없는 단일 비교 진입점.

- [ ] **Step 1: 별도 QA 영역 제거의 실패 테스트 작성**

`InterviewerRiggingPreview.spec.tsx`에서 `InterviewerAudioLipSyncQa` import와 해당 컴포넌트 렌더링을 삭제하고 다음 부정 assertion을 추가한다.

```tsx
assert.doesNotMatch(markup, /data-audio-lip-sync-qa/);
assert.doesNotMatch(markup, /aria-label="로컬 RMS QA 음원"/);
assert.doesNotMatch(markup, />로컬 음원 재생</);
assert.doesNotMatch(previewSource, /InterviewerAudioLipSyncQa/);
assert.doesNotMatch(previewSource, /createAudioQaWavUrl/);
assert.doesNotMatch(previewCssSource, /__audio-qa/);
```

- [ ] **Step 2: 집중 테스트를 실행해 기존 별도 QA 영역 때문에 실패하는지 확인**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Working directory: `frontend`

Expected: `data-audio-lip-sync-qa`, 로컬 음원 또는 source assertion에서 FAIL.

- [ ] **Step 3: 합성 WAV QA 코드와 스타일 제거**

`InterviewerRiggingPreview.tsx`에서 다음 항목을 삭제한다.

- `useCallback`, `useRef`, `getMouthShapeForRms`, `useLipSyncDriverState` import
- `AUDIO_QA_SAMPLE_RATE`, `AUDIO_QA_SPEECH_TEXT`, `audioQaSegments`
- `getRmsOnlyPreviewMouthShape`, `writeWavText`, `createAudioQaWavUrl`
- `InterviewerAudioLipSyncQaProps`, `InterviewerAudioLipSyncQa`
- `<InterviewerAudioLipSyncQa reducedMotion={reducedMotion} />`

`InterviewerRiggingPreview.module.css`에서 `__audio-qa`로 시작하는 모든 규칙과 모바일 override를 삭제한다. Realtime 튜닝의 `__tuning-comparison` 모바일 규칙은 유지한다.

- [ ] **Step 4: 집중 테스트, 전체 아바타 테스트, 타입 검사 실행**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
npm.cmd run test:candidate-avatar
npm.cmd run typecheck
```

Working directory: `frontend`

Expected: 세 명령 exit 0.

- [ ] **Step 5: 잘못된 비교 영역 제거 커밋**

```powershell
git add -- frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
git commit -m "refactor(candidate): 별도 RMS QA 비교 제거"
```

---

### Task 4: 브라우저 및 프로젝트 전체 검증

**Files:**
- Verify: `frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx`
- Verify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
- Verify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.module.css`
- Verify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`

**Interfaces:**
- Consumes: Tasks 1-3의 최종 Realtime 비교 UI.
- Produces: 데스크톱/모바일 배치, 동일 Realtime 재생, 종료 복귀, 전체 하네스 통과 증거.

- [ ] **Step 1: 정적 검증을 새로 실행**

Run:

```powershell
npm.cmd run test:candidate-avatar
npm.cmd run typecheck
git diff --check
```

Working directory: 첫 두 명령은 `frontend`, 마지막 명령은 저장소 루트.

Expected: 모든 명령 exit 0, 테스트 실패 0.

- [ ] **Step 2: 프로덕션 빌드 실행**

Run:

```powershell
npm.cmd run build
```

Working directory: `frontend`

Expected: `Compiled successfully`, TypeScript 완료, `/interviewer-preview` route 생성, exit 0.

- [ ] **Step 3: 브라우저에서 데스크톱 동시 비교 확인**

서버를 실행하고 `http://localhost:3000/interviewer-preview`를 연다. 다음을 확인한다.

```text
- OpenAI Realtime 립싱크 튜닝 안에 비교 카드가 정확히 2개다.
- 현재 카드가 왼쪽, 수정 전 RMS 전용 카드가 오른쪽이다.
- Realtime 음성 테스트 시작 버튼과 테스트 문장 입력은 각각 1개다.
- 한 번 재생할 때 두 카드의 data-state가 동시에 talking이 된다.
- 현재 방식은 viseme 계열을 사용하고 RMS 전용은 rest/closed/open만 사용한다.
- 재생 종료 후 두 카드가 idle/rest로 돌아온다.
- 별도 RMS 오디오 입력/로컬 음원 재생 영역이 없다.
```

- [ ] **Step 4: 좁은 화면 반응형 배치 확인**

브라우저 viewport를 760px 미만으로 바꾸고 현재 카드가 위, RMS 전용 카드가 아래인지 확인한다. 콘솔 오류가 없어야 한다.

- [ ] **Step 5: Role D 로컬 하네스 실행**

Run:

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

Working directory: 저장소 루트.

Expected: `[ok] local harness passed`, exit 0.

- [ ] **Step 6: 최종 Git 상태와 서버 응답 확인**

Run:

```powershell
git status --short
Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/interviewer-preview' -TimeoutSec 15
Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3001/api/v1/health' -TimeoutSec 15
```

Expected: Git 작업 폴더가 깨끗하고 두 HTTP 요청이 200을 반환한다. 프런트와 API 서버는 사용자 확인을 위해 계속 실행한다.

# Cubism RMS Lip Sync Design

## Goal

Connect the existing local RMS audio QA source to the Cubism V3 proof model so
`ParamMouthOpenY` receives a continuous value from 0 to 1 during playback. Keep
the current PNG avatar as the production renderer until natural mouth ArtMeshes
are available and approved.

## Scope

- Add a continuous mouth-open signal to the existing lip-sync analysis path.
- Reuse one Web Audio analyser for both the PNG mouth shape and Cubism value.
- Show the PNG and Cubism outputs together in the interviewer preview audio QA.
- Return the Cubism value to 0 when playback stops, reduced motion is enabled,
  audio analysis is unavailable, or the component is released.
- Record the observed Cubism minimum and maximum values in QA data attributes.

The following work is explicitly excluded:

- Replacing the production `InterviewAvatar` renderer with Cubism.
- Creating upper lip, lower lip, teeth, tongue, or mouth-interior ArtMeshes.
- Claiming that the opacity crossfade is natural mouth deformation.

## Considered Approaches

### 1. Shared lip-sync state from one analyser (selected)

The lip-sync hook returns both the existing discrete `mouthShape` and a
continuous `mouthOpen` value. The QA component consumes that result once and
passes each output to its renderer. This avoids creating multiple
`MediaElementAudioSourceNode` instances for one media element and keeps both
renderers synchronized.

### 2. A separate Cubism audio hook

This keeps Cubism code isolated but duplicates the Web Audio graph. Browsers do
not reliably allow the same media element to be wrapped by multiple media source
nodes, so this approach adds failure modes and is rejected.

### 3. Natural ArtMesh deformation first

This would improve final visual quality, but the current source does not contain
clean lip and mouth-interior meshes. It remains the next art-production stage,
not part of this audio integration.

## Data Flow

1. The QA audio element starts playback from a user gesture.
2. `useLipSyncDriverState` creates one analyser and samples RMS at no more than
   30 FPS.
3. RMS below the silence threshold resolves to mouth-open 0. Values above the
   threshold are normalized and clamped to the 0 to 1 range.
4. Attack and release smoothing reduce visible jitter while allowing the mouth
   to close promptly after speech.
5. The existing Korean timeline remains the fallback when audio analysis cannot
   be created. Its discrete mouth shape maps to the current Cubism proof values.
6. `LocalInterviewerAvatar` receives `mouthShape`; the Cubism proof receives the
   numeric `mouthOpen` value directly.

## Component Boundaries

- `LipSyncDriver.ts`: owns audio analysis, pure RMS normalization and smoothing,
  and the combined `{ mouthShape, mouthOpen }` state.
- `InterviewAvatar.tsx`: continues to use only `mouthShape`, preserving the
  production PNG behavior.
- `CubismProofInterviewerAvatar.tsx`: accepts a numeric mouth-open value and does
  not decide how audio becomes that value.
- `InterviewerRiggingPreview.tsx`: owns the local QA audio and renders both proof
  outputs from one shared lip-sync state.

## Error And Accessibility Behavior

- A failed or suspended audio analyser falls back to the existing text timeline.
- A Cubism runtime failure keeps the static interviewer base visible and exposes
  the existing fallback status and error attribute.
- Reduced motion forces the Cubism mouth-open value to 0.
- Playback controls and live status text retain their existing accessible names.

## Verification

- Unit tests cover RMS normalization, clamping, attack/release smoothing, silence
  reset, and timeline fallback.
- Component tests verify that the Cubism renderer receives a numeric value and
  that the production PNG avatar contract remains unchanged.
- The candidate-avatar test suite, TypeScript check, production build, and Role D
  local harness are run.
- Browser QA confirms playback raises `data-cubism-mouth-open` above 0, captures
  a non-zero observed maximum, returns to 0 after playback, and produces no
  console errors.

## Acceptance Criteria

- One audio analyser drives both preview renderers.
- Cubism mouth-open changes continuously within 0 to 1 during local QA playback.
- The value is 0 while idle or under reduced motion.
- No production interview renderer is switched to the proof model.
- The UI continues to label the model as an opacity-crossfade proof rather than
  natural deformation.

# Cubism Single ArtMesh Deformation Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export and load a V4 Cubism proof whose continuously opaque mouth ArtMesh changes geometry with `ParamMouthOpenY` while the production PNG interviewer remains unchanged.

**Architecture:** Preserve V3 and derive a separate V4 Cubism source. The V4 runtime keeps the existing RMS-to-`ParamMouthOpenY` data flow, switches only the QA model URL and fallback base image, and expands runtime diagnostics so opacity invariance and geometry change can be observed independently.

**Tech Stack:** Live2D Cubism Editor 5.3, Cubism SDK for Web R5, Next.js 16, React 19, TypeScript 5.9, Node.js 20, WebGL.

## Global Constraints

- Preserve `assets/interviewer-rigging/existing-look-cubism-v3/` and `frontend/public/assets/interviewer-cubism/v3-proof/` unchanged.
- Keep the production `InterviewAvatar` on the PNG renderer.
- Use only the existing `ParamMouthOpenY` range 0 through 1.
- Keep the V4 visible mouth ArtMesh at opacity 1 for every mouth-open keyform.
- Do not generate or edit raster artwork in this implementation.
- Describe V4 as a single-ArtMesh deformation proof, not an anatomical or production-ready mouth rig.
- Do not create a git commit unless the user explicitly requests it.
- Report PM or cross-owner review for `docs/superpowers` changes.

---

### Task 1: Create The V4 Cubism Source Package

**Files:**
- Create: `assets/interviewer-rigging/existing-look-cubism-v4/interviewer-import-v4.cmo3`
- Create: `assets/interviewer-rigging/existing-look-cubism-v4/manifest.json`
- Preserve: `assets/interviewer-rigging/existing-look-cubism-v3/interviewer-import-v3.cmo3`

**Interfaces:**
- Consumes: the V3 Cubism source, `mouth-open-reference`, and `ParamMouthOpenY`.
- Produces: a V4 `.cmo3` source with one visible mouth ArtMesh under a dedicated warp deformer.

- [ ] **Step 1: Save a V4 copy before changing the model**

In Cubism Editor, use Save As to create
`assets/interviewer-rigging/existing-look-cubism-v4/interviewer-import-v4.cmo3`.
Verify that the editor title shows `interviewer-import-v4.cmo3` before making
any rigging change.

- [ ] **Step 2: Establish a single visible mouth ArtMesh**

Select `mouth-open-reference`, set its opacity to 100%, and hide
`mouth-rest`, `mouth-closed-reference`, `mouth-wide-reference`,
`mouth-round-reference`, and `mouth-teeth-reference`. Keep the hidden meshes in
the model as alignment references.

- [ ] **Step 3: Add the mouth deformation unit**

Create a warp deformer named `mouth-open-deform` around
`mouth-open-reference`. Bind the deformer to `ParamMouthOpenY` keyforms at
`0`, `0.5`, and `1`:

```text
0.0: vertically compress the open mouth to a conservative resting height
0.5: retain a visually even intermediate height
1.0: retain the source open-mouth geometry
```

Do not animate ArtMesh opacity. Keep the left and right corners aligned while
moving the top and bottom bounds symmetrically around the mouth center.

- [ ] **Step 4: Verify the Cubism source in the editor**

Scrub `ParamMouthOpenY` from 0 to 1 and confirm:

```text
only mouth-open-reference is visible
opacity remains 100% at 0, 0.5, and 1
the same texture deforms continuously
the 0 and 1 mouth heights are visibly different
no second mouth flashes through
```

- [ ] **Step 5: Write V4 package metadata**

Create `manifest.json` with this structure and the final ArtMesh/deformer IDs
read from Cubism Editor:

```json
{
  "id": "existing-look-cubism-v4",
  "status": "single-artmesh-deformation-proof",
  "derivedFrom": "../existing-look-cubism-v3/interviewer-import-v3.cmo3",
  "mouthOpenParameter": {
    "id": "ParamMouthOpenY",
    "range": { "min": 0, "max": 1, "default": 0 },
    "controlType": "warp-deformation",
    "visibleArtMesh": "mouth-open-reference",
    "deformer": "mouth-open-deform",
    "keyforms": [0, 0.5, 1],
    "opacityAtKeyforms": [1, 1, 1]
  },
  "knownLimitations": [
    "The mouth is one photographic ArtMesh, not separated upper lip, lower lip, teeth, tongue, and mouth interior geometry.",
    "This package proves continuous geometry deformation and is not a production-ready natural mouth rig."
  ]
}
```

Checkpoint: inspect `git status --short` and do not stage or commit.

---

### Task 2: Export And Audit V4 Runtime Assets

**Files:**
- Create: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.model3.json`
- Create: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.moc3`
- Create: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.cdi3.json`
- Create: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof-base.png`
- Create: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.2048/texture_00.png`
- Modify: `scripts/audit-interviewer-avatar-assets.spec.mjs`

**Interfaces:**
- Consumes: the verified V4 Cubism source.
- Produces: a deployable model3 manifest, MOC3, display info, base image, and texture in one public directory.

- [ ] **Step 1: Point the asset audit test at the missing V4 export**

Replace the V3 proof path and filename-specific assertions with V4 assertions:

```js
const cubismProof = await auditCubismProofModel(
  resolve(
    projectRoot,
    "frontend/public/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.model3.json",
  ),
);

assert.equal(cubismProof.version, 3);
assert.ok(cubismProof.moc.bytes > 0);
assert.equal(cubismProof.base.path, "interviewer-v4-deformation-proof-base.png");
assert.ok(cubismProof.base.bytes > 0);
assert.equal(cubismProof.base.width, 1024);
assert.equal(cubismProof.base.height, 1536);
assert.equal(cubismProof.textures.length, 1);
assert.equal(cubismProof.textures[0].path, "interviewer-v4-deformation-proof.2048/texture_00.png");
assert.equal(cubismProof.textures[0].width, 2048);
assert.equal(cubismProof.textures[0].height, 2048);
assert.equal(cubismProof.displayInfo.hasMouthOpenParameter, true);
```

- [ ] **Step 2: Run the audit test and verify it fails**

Run:

```powershell
node ..\scripts\audit-interviewer-avatar-assets.spec.mjs
```

Working directory: `frontend`

Expected: FAIL with `ENOENT` for the V4 `.model3.json`.

- [ ] **Step 3: Export the V4 model from Cubism Editor**

Export for Cubism SDK for Web R5 into
`frontend/public/assets/interviewer-cubism/v4-deformation-proof/` with model
name `interviewer-v4-deformation-proof`, 2048 texture size, MOC3, model3 JSON,
and display information enabled. Copy the existing V3 base image to the V4
directory using the V4 base filename because the underlying static interviewer
composition is intentionally unchanged.

- [ ] **Step 4: Run the asset audit test and verify it passes**

Run:

```powershell
node ..\scripts\audit-interviewer-avatar-assets.spec.mjs
```

Expected: PASS with exit code 0.

- [ ] **Step 5: Verify export references are self-contained**

Run:

```powershell
Get-Content -LiteralPath 'public\assets\interviewer-cubism\v4-deformation-proof\interviewer-v4-deformation-proof.model3.json' -Encoding UTF8
```

Expected: `Moc`, `Textures`, and `DisplayInfo` use relative paths inside the
V4 export directory.

Checkpoint: inspect the exported file list and do not stage or commit.

---

### Task 3: Switch The QA Renderer To V4 And Expose Deformation Diagnostics

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.ts`
- Modify: `frontend/src/features/candidate-application-interview/CubismProofRuntime.ts`
- Modify: `frontend/src/features/candidate-application-interview/CubismProofInterviewerAvatar.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`

**Interfaces:**
- Consumes: `mouthOpen: number`, `reducedMotion: boolean`, and the V4 model3 URL.
- Produces: V4 WebGL rendering plus diagnostics containing opacity and geometry at mouth-open 0 and 1.

- [ ] **Step 1: Write failing URL and UI-copy assertions**

Update `CubismSdkRuntime.spec.ts`:

```ts
assert.equal(
  CUBISM_PROOF_MODEL_URL,
  "/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.model3.json",
);

assert.deepEqual(
  resolveCubismProofModelReferences(CUBISM_PROOF_MODEL_URL, {
    Version: 3,
    FileReferences: {
      Moc: "interviewer-v4-deformation-proof.moc3",
      Textures: ["interviewer-v4-deformation-proof.2048/texture_00.png"],
    },
  }),
  {
    mocUrl: "/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.moc3",
    textureUrls: [
      "/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof.2048/texture_00.png",
    ],
  },
);
```

Update `InterviewerRiggingPreview.spec.tsx`:

```ts
assert.match(markup, /Cubism V4 deformation proof/);
assert.match(markup, /단일 ArtMesh 변형/);
assert.match(markup, /완성형 자연 변형 아님/);
assert.match(
  cubismProofMarkup,
  /src="\/assets\/interviewer-cubism\/v4-deformation-proof\/interviewer-v4-deformation-proof-base\.png"/,
);
assert.match(cubismProofMarkup, /aria-label="Cubism V4 면접관 변형 proof 모델"/);
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/CubismSdkRuntime.spec.ts
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Working directory: `frontend`

Expected: FAIL because the runtime and markup still reference V3.

- [ ] **Step 3: Switch model and base asset URLs**

Set `CUBISM_PROOF_MODEL_URL` to the V4 model3 path. In
`CubismProofInterviewerAvatar.tsx`, set the base image and canvas label to the
V4 strings asserted above. Preserve the component name because it remains a QA
proof renderer and no production caller changes.

- [ ] **Step 4: Record geometry at both diagnostic endpoints**

Change `CubismProofDiagnostic` drawable fields to:

```ts
{
  id: string;
  opacityAt0: number;
  opacityAt1: number;
  widthAt0: number;
  widthAt1: number;
  heightAt0: number;
  heightAt1: number;
}
```

Populate each rounded endpoint from `stateAt0` and `stateAt1`. Do not infer
deformation from opacity; the geometry fields are the proof evidence.

- [ ] **Step 5: Update the QA record copy**

Render exactly:

```tsx
<strong>Cubism V4 deformation proof</strong>
<code>ParamMouthOpenY · 0 → 1</code>
<span>단일 ArtMesh 변형 · 완성형 자연 변형 아님</span>
```

Keep both manual mouth-shape mapping and RMS playback connected to the same
`CubismProofInterviewerAvatar` component.

- [ ] **Step 6: Run focused tests and verify they pass**

Run the two commands from Step 2.

Expected: PASS with exit code 0 for both.

Checkpoint: inspect the diff and do not stage or commit.

---

### Task 4: Verify Geometry, Audio, Layout, And Repository Health

**Files:**
- Verify: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/`
- Verify: `frontend/src/features/candidate-application-interview/`
- Verify: `scripts/audit-interviewer-avatar-assets.spec.mjs`

**Interfaces:**
- Consumes: the completed V4 source, export, and QA renderer.
- Produces: recorded evidence that V4 deforms geometry without opacity crossfade.

- [ ] **Step 1: Run candidate-avatar tests**

Run:

```powershell
npm.cmd run test:candidate-avatar
```

Working directory: `frontend`

Expected: PASS.

- [ ] **Step 2: Run typecheck and production build**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Working directory: `frontend`

Expected: both PASS and `/interviewer-preview` appears in the build route list.

- [ ] **Step 3: Inspect runtime deformation evidence in the browser**

Open `http://localhost:3000/interviewer-preview` and verify:

```text
data-cubism-model-status = ready
diagnostic parameterIndex >= 0
the visible mouth drawable has opacityAt0 = 1 and opacityAt1 = 1
the visible mouth drawable has heightAt0 != heightAt1
manual 0, 0.5, and 1 values visibly change the same mouth texture
```

- [ ] **Step 4: Verify continuous RMS playback and reduced motion**

Play the local QA audio twice. Confirm decimal `data-cubism-mouth-open` values
rise above 0 and return to 0 after each playback. With reduced motion enabled,
confirm the value remains 0.

- [ ] **Step 5: Verify responsive layout**

Check 1280px desktop and 390px mobile widths. Confirm no overlapping controls,
no clipped proof labels, and no horizontal overflow.

- [ ] **Step 6: Run diff checks and Role D harness**

Run:

```powershell
git diff --check
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

Expected: `git diff --check` passes. Report ownership failures caused by
pre-existing cross-owner files separately. If Prisma generation reports an
EPERM lock from the running backend, retain the server and report the lock
rather than terminating unrelated processes.

- [ ] **Step 7: Report scope and review requirements**

Summarize the V4 proof, verification evidence, and remaining limitation that
upper lip, lower lip, teeth, tongue, and mouth interior are not separate
ArtMeshes. Explicitly request PM/cross-owner review for the two
`docs/superpowers` documents. Do not commit unless the user asks.

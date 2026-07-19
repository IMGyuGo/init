# Cubism V6 일관된 입 원본 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 면접관 얼굴에 정렬된 차분한 열린 입 한 장을 만든 뒤 동일 픽셀 원본에서 상순, 하순, 입안, 윗니, 혀를 분리하고, V6 Cubism QA proof로 export해 `/interviewer-preview`에서 검증한다.

**Architecture:** V6는 V5와 독립된 source package와 Web R5 export를 사용한다. 이미지 편집은 완성 입 한 장에만 수행하고, anatomy layer는 deterministic mask 분리와 픽셀 재합성 감사로 만든다. Cubism은 하위 lip/interior deformer만 `ParamMouthOpenY`에 연결하고, preview runtime만 V6 URL로 전환한다.

**Tech Stack:** Python 3 + Pillow + NumPy, Node.js 20 + sharp + ag-psd, Live2D Cubism Editor 5.3.03 FREE, Cubism Core/Web Framework R5, React 19 + Next.js 16 + TypeScript 5.9.

## Global Constraints

- 작업 브랜치는 현재 `ai-interviewer`를 사용하며 별도 worktree를 만들지 않는다.
- `assets/interviewer-rigging/existing-look-cubism-v5/`와 `frontend/public/assets/interviewer-cubism/v5-layered-mouth-proof/`는 V6 작업 시작 시 SHA-256을 기록하고 변경하지 않는다.
- 얼굴, 코, 턱, 눈, 헤어, 의상은 변경하지 않고 입 영역 `x=400..624`, `y=530..674`만 편집한다.
- 완성 입 중심 X는 `512 ± 2px`, 폭은 닫힌 입 폭의 `95..105%`, 입꼬리 Y 차이는 3px 이하다.
- 치아 노출은 열린 입 높이의 20~25%이고 아랫니는 노출하지 않는다.
- anatomy layer는 `mouth-open-coherent.png` 한 장의 픽셀과 semantic mask만 사용하며 별도 생성하지 않는다.
- V6는 `/interviewer-preview` 전용이다. production `CandidatePages`, `InterviewAvatar`, `LocalInterviewerAvatar`의 renderer 선택을 변경하지 않는다.
- 구현 중 `git add`, `git commit`, `git push`는 사용자가 명시적으로 요청하기 전 실행하지 않는다.
- 각 코드 변경은 TDD의 RED -> GREEN 순서를 지킨다. 생성 이미지와 Cubism Editor 산출물은 TDD 예외지만 자동 감사와 수동 QA를 통과해야 다음 단계로 이동한다.

---

### Task 1: V6 패키지 계약과 V5 보존 감사

**Files:**
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/manifest.json`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/sources/.gitkeep`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/masks/.gitkeep`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/normalized/.gitkeep`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/references/.gitkeep`
- Create: `scripts/audit-coherent-mouth-source.mjs`
- Create: `scripts/audit-coherent-mouth-source.spec.mjs`

**Interfaces:**
- Consumes: V5 source/export paths and approved SHA-256 values.
- Produces: `auditCoherentMouthSource({ manifestPath }): Promise<CoherentMouthAudit>` and the V6 manifest schema used by every later task.

- [ ] **Step 1: Write the failing manifest and preservation tests**

Add tests that require:

```js
const manifest = JSON.parse(await readFile(V6_MANIFEST, "utf8"));
assert.deepEqual(manifest.canvas, { width: 1024, height: 1536 });
assert.deepEqual(manifest.mouthAnchor, { x: 512, y: 585 });
assert.deepEqual(manifest.editRegion, { left: 400, top: 530, right: 625, bottom: 675 });
assert.deepEqual(manifest.layers.map((layer) => layer.name), [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
]);
assert.equal(manifest.sourceCompositePath, "sources/mouth-open-coherent.png");
assert.deepEqual(Object.keys(manifest.v5Preservation.sha256).sort(), [
  "cmo3",
  "moc3",
  "model3",
  "texture",
]);
```

The audit must reject a fixture when a current V5 SHA differs from the manifest lock.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node scripts\audit-coherent-mouth-source.spec.mjs
```

Expected: FAIL because the V6 manifest and audit module do not exist.

- [ ] **Step 3: Add the minimal V6 manifest**

Record:

```json
{
  "id": "existing-look-cubism-v6",
  "status": "coherent-mouth-source-preparation",
  "derivedFrom": "../existing-look-cubism-v5/interviewer-import-v5.cmo3",
  "canvas": { "width": 1024, "height": 1536 },
  "mouthAnchor": { "x": 512, "y": 585 },
  "editRegion": { "left": 400, "top": 530, "right": 625, "bottom": 675 },
  "sourceCompositePath": "sources/mouth-open-coherent.png",
  "layers": [
    { "name": "mouth-skin-underlay", "pngPath": "normalized/mouth-skin-underlay.png", "rgbaPath": "normalized/mouth-skin-underlay.rgba", "maskPath": null, "visible": true, "anchor": { "x": 512, "y": 585 }, "sourceType": "identity-preserve-underlay", "role": "underlay" },
    { "name": "mouth-interior", "pngPath": "normalized/mouth-interior.png", "rgbaPath": "normalized/mouth-interior.rgba", "maskPath": "masks/mouth-interior-mask.png", "visible": true, "anchor": { "x": 512, "y": 585 }, "sourceType": "single-composite-segmentation", "role": "clipping-owner" },
    { "name": "mouth-upper-teeth", "pngPath": "normalized/mouth-upper-teeth.png", "rgbaPath": "normalized/mouth-upper-teeth.rgba", "maskPath": "masks/mouth-upper-teeth-mask.png", "visible": true, "anchor": { "x": 512, "y": 585 }, "sourceType": "single-composite-segmentation", "role": "clipped-content" },
    { "name": "mouth-tongue", "pngPath": "normalized/mouth-tongue.png", "rgbaPath": "normalized/mouth-tongue.rgba", "maskPath": "masks/mouth-tongue-mask.png", "visible": true, "anchor": { "x": 512, "y": 585 }, "sourceType": "single-composite-segmentation", "role": "clipped-content" },
    { "name": "mouth-upper-lip", "pngPath": "normalized/mouth-upper-lip.png", "rgbaPath": "normalized/mouth-upper-lip.rgba", "maskPath": "masks/mouth-upper-lip-mask.png", "visible": true, "anchor": { "x": 512, "y": 585 }, "sourceType": "single-composite-segmentation", "role": "opaque-deforming-lip" },
    { "name": "mouth-lower-lip", "pngPath": "normalized/mouth-lower-lip.png", "rgbaPath": "normalized/mouth-lower-lip.rgba", "maskPath": "masks/mouth-lower-lip-mask.png", "visible": true, "anchor": { "x": 512, "y": 585 }, "sourceType": "single-composite-segmentation", "role": "opaque-deforming-lip" }
  ]
}
```

Add the four V5 hashes measured at implementation start.

- [ ] **Step 4: Implement the minimal contract audit**

`auditCoherentMouthSource` must validate the static manifest fields, resolve every path inside the package, and verify current V5 hashes with `createHash("sha256")`.

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```powershell
node scripts\audit-coherent-mouth-source.spec.mjs
```

Expected: the contract and V5 preservation unit tests PASS; production asset tests remain skipped until Task 3 assets exist.

- [ ] **Step 6: Checkpoint without committing**

Run `git status --short` and confirm only new V6 contract/audit files were added by this task.

---

### Task 2: 차분한 완성 입 원본 생성과 시각 승인

**Files:**
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/sources/mouth-open-coherent-generated.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/sources/mouth-open-coherent.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/references/mouth-open-coherent-full.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/references/mouth-open-coherent-crop-4x.png`

**Interfaces:**
- Consumes: `assets/interviewer-rigging/existing-look/normalized/master.png` as the edit target.
- Produces: one approved full-canvas `mouth-open-coherent.png`; Task 3 may not create anatomy pixels from any other source.

- [ ] **Step 1: Inspect the edit target**

Use `view_image` on:

```text
assets/interviewer-rigging/existing-look/normalized/master.png
assets/interviewer-rigging/existing-look/normalized/mouth-rest.png
```

Record the existing mouth center, width, lip hue, highlight direction, and face centerline.

- [ ] **Step 2: Generate one identity-preserving mouth edit**

Use built-in `image_gen` in edit mode with the master as the only edit target:

```text
Use case: identity-preserve
Asset type: Live2D Cubism source composite
Primary request: Change only the mouth into a calm conversational open mouth for a professional interviewer. Show a small amount of upper teeth, no lower teeth, a subdued tongue low inside the mouth, and natural human upper/lower lip anatomy.
Composition/framing: preserve the original 1024x1536 full-body portrait and exact face position.
Constraints: keep identity, eyes, nose, philtrum, jaw, skin, hair, clothing, lighting, and background unchanged; mouth centered on the nose/chin centerline; mouth width within 5 percent of the existing closed mouth; both corners attached and symmetric; upper teeth touching the inner upper-lip boundary; no gap between lips, teeth, and oral cavity; no smile exaggeration.
Avoid: detached teeth, floating lips, oversized mouth, lipstick-like pasted outline, lower teeth, face reshaping, skin patch, seams, text, watermark.
```

- [ ] **Step 3: Localize the edit to the bounded region**

Use a deterministic script operation in Task 3 to copy only `x=400..624`, `y=530..674` from the generated candidate onto the untouched master. Do not accept a source where the desired mouth cannot fit inside this region.

- [ ] **Step 4: Create full and 4x crop references**

The full reference shows the entire 1024x1536 portrait. The crop reference extracts the mouth region and enlarges it 4x with nearest-neighbor scaling for seam inspection.

- [ ] **Step 5: Perform visual gate**

Accept only when all are true:

```text
center X follows nose and chin
human upper and lower lip curves
left/right corners connected
upper teeth sit directly under upper lip
oral cavity fills every visible inner gap
upper teeth occupy 20-25% of open-mouth height
no lower teeth
no face or skin change outside the mouth
```

If any item fails, issue one targeted image edit and repeat this gate. Do not begin mask extraction before approval.

- [ ] **Step 6: Checkpoint without committing**

Record the accepted built-in image prompt and final project paths in `.PM/ai-interviewer/`.

---

### Task 3: 동일 원본 semantic mask 분리와 deterministic 패키징

**Files:**
- Create: `scripts/prepare-coherent-mouth-v6-assets.py`
- Create: `scripts/prepare-coherent-mouth-v6-assets.spec.py`
- Modify: `scripts/audit-coherent-mouth-source.mjs`
- Modify: `scripts/audit-coherent-mouth-source.spec.mjs`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/masks/*.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/normalized/*.{png,rgba}`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/references/mouth-open-recomposed.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/references/mouth-open-{0,05,1}.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/interviewer-mouth-v6.psd`

**Interfaces:**
- Consumes: the approved `sources/mouth-open-coherent.png`.
- Produces: `prepare(root: Path)`, five binary/feathered anatomy masks, six full-canvas RGBA layers, four QA references, and an ordered six-layer PSD.

- [ ] **Step 1: Write failing mask and recomposition tests**

Tests must create small synthetic mouth fixtures and assert:

```python
self.assertLessEqual(abs(metrics.center_x - 512), 2)
self.assertGreaterEqual(metrics.width_ratio, 0.95)
self.assertLessEqual(metrics.width_ratio, 1.05)
self.assertLessEqual(metrics.corner_y_delta, 3)
self.assertLessEqual(metrics.upper_lip_teeth_gap, 1)
self.assertEqual(metrics.uncovered_opening_pixels, 0)
self.assertEqual(metrics.tongue_outside_interior_pixels, 0)
self.assertEqual(metrics.overlapping_semantic_pixels, 0)
self.assertEqual(metrics.recomposition_max_channel_delta, 1)
```

Also assert `build_psd` writes `interviewer-mouth-v6.psd`, not the V5 filename.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
python scripts\prepare-coherent-mouth-v6-assets.spec.py
node scripts\audit-coherent-mouth-source.spec.mjs
```

Expected: FAIL because the V6 packager and geometry audit do not exist.

- [ ] **Step 3: Implement bounded source localization and underlay**

`prepare-coherent-mouth-v6-assets.py` must:

```python
master = read_rgba(existing_look_master)
generated = read_rgba(root / "sources/mouth-open-coherent-generated.png")
coherent = master.copy()
coherent[530:675, 400:625] = generated[530:675, 400:625]
```

Build the underlay from master skin pixels with a feathered ellipse covering the original mouth, using local neighboring skin interpolation. No anatomy pixel may come from the underlay.

- [ ] **Step 4: Implement semantic segmentation from the one composite**

Within the mouth region, derive masks from the approved composite using color/luminance seeds plus connected-component cleanup:

```python
teeth_seed = (luminance >= 155) & (saturation <= 70)
interior_seed = luminance <= 85
tongue_seed = (red >= green + 15) & (red >= blue + 15) & lower_half
lip_seed = changed_pixels & ~(teeth_seed | interior_seed | tongue_seed)
upper_lip_seed = lip_seed & (y <= opening_centerline)
lower_lip_seed = lip_seed & (y > opening_centerline)
```

Constrain every mask to the largest component touching the mouth center, close 1px holes, assign ambiguous edge pixels to the nearest semantic region, and ensure masks are mutually exclusive. Manual correction is allowed only by editing masks derived from this same composite.

- [ ] **Step 5: Create anatomy layers and exact recomposition**

For each anatomy mask:

```python
layer = np.zeros_like(coherent)
layer[mask] = coherent[mask]
```

Composite in order `interior -> tongue -> teeth -> upper lip -> lower lip`. The result inside the mouth region must match the approved coherent source with maximum per-channel delta 1.

- [ ] **Step 6: Create 0/0.5/1 raster references**

Use translation and slight curvature-preserving vertical resampling only:

```text
0: upper +15px, lower -15px, interior group -10px
0.5: upper +5px, lower -5px, interior group -3px
1: approved source positions
```

Here `+` for the upper lip means down and `-` for the lower lip means up. Keep X coordinates and both mouth corners fixed. Do not scale width.

- [ ] **Step 7: Build the PSD**

Call `buildInterviewerRiggingPsd` with the V6 manifest and `interviewer-mouth-v6.psd`.

- [ ] **Step 8: Extend the Node audit**

`auditCoherentMouthSource` must report:

```ts
type CoherentMouthAudit = {
  centerX: number;
  width: number;
  widthRatio: number;
  cornerYDelta: number;
  upperLipTeethGap: number;
  uncoveredOpeningPixels: number;
  tongueOutsideInteriorPixels: number;
  overlappingSemanticPixels: number;
  recompositionMaxChannelDelta: number;
  v5Preserved: boolean;
};
```

Use `sharp` for decoded RGBA and `ag-psd` to verify PSD layer order and pixel payload.

- [ ] **Step 9: Run tests and verify GREEN**

Run:

```powershell
python scripts\prepare-coherent-mouth-v6-assets.spec.py
python scripts\prepare-coherent-mouth-v6-assets.py
node scripts\audit-coherent-mouth-source.spec.mjs
node scripts\audit-coherent-mouth-source.mjs
```

Expected: all geometry, contact, recomposition, PSD, and V5 preservation checks PASS.

- [ ] **Step 10: Visual QA checkpoint**

Inspect `mouth-open-recomposed.png` and `mouth-open-0/05/1.png` at full portrait and 4x crop. Stop and correct masks if lips, teeth, or cavity separate.

---

### Task 4: Cubism V6 import, hierarchy, keyforms, and Web R5 export

**Files:**
- Create: `assets/interviewer-rigging/existing-look-cubism-v6/interviewer-import-v6.cmo3`
- Modify: `assets/interviewer-rigging/existing-look-cubism-v6/manifest.json`
- Create: `frontend/public/assets/interviewer-cubism/v6-coherent-mouth-proof/*`

**Interfaces:**
- Consumes: approved V6 PSD and `ParamMouthOpenY` keyform contract.
- Produces: independent ArtMesh/deformer IDs, clipping relationships, and self-contained Web R5 export.

- [ ] **Step 1: Save a separate V6 Cubism source**

Open the approved V5 `.cmo3`, immediately Save As:

```text
assets/interviewer-rigging/existing-look-cubism-v6/interviewer-import-v6.cmo3
```

Verify the title bar shows the V6 filename before importing the V6 PSD.

- [ ] **Step 2: Import the V6 PSD and assign names**

Create ArtMeshes:

```text
MouthSkinUnderlay
MouthInterior
MouthUpperTeeth
MouthTongue
MouthUpperLip
MouthLowerLip
```

Remove or hide the imported V5 mouth ArtMeshes from the V6 mouth hierarchy without changing the saved V5 file.

- [ ] **Step 3: Build the deformer hierarchy**

Create:

```text
mouth-align-root
  mouth-root
    MouthSkinUnderlay
    mouth-upper-lip-deform -> MouthUpperLip
    mouth-lower-lip-deform -> MouthLowerLip
    mouth-interior-deform -> MouthInterior, MouthUpperTeeth, MouthTongue
```

Bind clipping so `MouthUpperTeeth` and `MouthTongue` use `MouthInterior`.

- [ ] **Step 4: Add 0/0.5/1 parameter keys**

Bind only:

```text
mouth-upper-lip-deform
mouth-lower-lip-deform
mouth-interior-deform
```

Do not bind `mouth-align-root` or `mouth-root`. Match the approved raster references and keep both corners fixed.

- [ ] **Step 5: Scrub and visually verify**

At `0`, `0.5`, and `1`, verify:

```text
mouth center remains under nose
lip corners do not drift
upper teeth remain attached to upper lip
interior fills the opening
tongue remains clipped and subordinate
no parent-scale vertical stretching
```

- [ ] **Step 6: Save manifest IDs**

Record actual ArtMesh and deformer IDs, clipping owner, parameter bindings, and exact keyform motion in `manifest.json`.

- [ ] **Step 7: Export Web R5**

Export to:

```text
frontend/public/assets/interviewer-cubism/v6-coherent-mouth-proof/
```

Model name:

```text
interviewer-v6-coherent-mouth-proof
```

Include MOC3, model3 JSON, CDI3, base PNG, and one 2048 texture.

- [ ] **Step 8: Checkpoint without committing**

Confirm all V6 files are non-empty and rerun the V5 preservation hash audit.

---

### Task 5: Cubism Core V6 geometry and binding audit

**Files:**
- Modify: `scripts/audit-cubism-mouth-rig.mjs`
- Modify: `scripts/audit-cubism-mouth-rig.spec.mjs`

**Interfaces:**
- Consumes: V5 or V6 manifest/model3 paths.
- Produces: endpoint diagnostics including `centerX`, `centerY`, width/height ratios, clipping, and manifest parameter-binding verification.

- [ ] **Step 1: Write failing center-X and ratio assertions**

Add a V6 invocation and assert:

```js
assert.ok(Math.abs(drawable.centerX[0] - drawable.centerX[1]) <= 0.001953);
assert.ok(drawable.width[1] / drawable.width[0] >= 0.95);
assert.ok(drawable.width[1] / drawable.width[0] <= 1.05);
assert.ok(drawable.height[1] / drawable.height[0] >= 0.95);
assert.ok(drawable.height[1] / drawable.height[0] <= 1.08);
assert.deepEqual(result.drawables.MouthUpperLip.opacity, [1, 1]);
assert.deepEqual(result.drawables.MouthLowerLip.opacity, [1, 1]);
assert.ok(result.drawables.MouthUpperTeeth.maskIds.includes(result.drawables.MouthInterior.id));
assert.ok(result.drawables.MouthTongue.maskIds.includes(result.drawables.MouthInterior.id));
assert.deepEqual(result.parameterBindings.deformers, [
  "mouth-upper-lip-deform",
  "mouth-lower-lip-deform",
  "mouth-interior-deform",
]);
```

Keep the existing V5 assertions unchanged.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node scripts\audit-cubism-mouth-rig.spec.mjs
```

Expected: FAIL because `centerX`, ratio diagnostics, and V6 binding diagnostics are absent.

- [ ] **Step 3: Implement the minimal generic audit**

Extend `boundsFor`:

```js
return {
  width: roundMetric(maxX - minX),
  height: roundMetric(maxY - minY),
  centerX: roundMetric((minX + maxX) / 2),
  centerY: roundMetric((minY + maxY) / 2),
};
```

Read parameter-binding names and expected keyforms from the manifest. Do not parse binary CMO3; use manifest as the editor-recorded binding contract and MOC3 for endpoint geometry.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node scripts\audit-cubism-mouth-rig.spec.mjs
node scripts\audit-cubism-mouth-rig.mjs --manifest assets/interviewer-rigging/existing-look-cubism-v6/manifest.json --model frontend/public/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.model3.json
```

Expected: V5 and V6 audits PASS and V6 JSON reports bounded center/size changes.

---

### Task 6: Preview runtime을 V6로 전환

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.ts`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
- Modify: `frontend/src/features/candidate-application-interview/CubismProofInterviewerAvatar.tsx`
- Modify: `frontend/src/features/candidate-application-interview/CubismProofRuntime.ts`
- Modify: `frontend/package.json`
- Modify: `scripts/audit-interviewer-avatar-assets.spec.mjs`

**Interfaces:**
- Consumes: V6 `.model3.json`, `.moc3`, CDI3, base image, and texture.
- Produces: V6-only preview copy and runtime diagnostics; production avatar remains unchanged.

- [ ] **Step 1: Write failing V6 URL and label tests**

Assert:

```ts
assert.equal(
  CUBISM_PROOF_MODEL_URL,
  "/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.model3.json",
);
assert.match(markup, /Cubism V6 coherent mouth proof/);
assert.match(markup, /하나의 완성 입에서 분리/);
assert.match(cubismMarkup, /interviewer-v6-coherent-mouth-proof-base\.png/);
assert.match(cubismMarkup, /Cubism V6 coherent mouth proof 모델/);
```

Asset audit must require non-empty V6 MOC3/base/texture and preserve V5 files.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx.cmd --no-install tsx src\features\candidate-application-interview\CubismSdkRuntime.spec.ts
npx.cmd --no-install tsx src\features\candidate-application-interview\InterviewerRiggingPreview.spec.tsx
node ..\scripts\audit-interviewer-avatar-assets.spec.mjs
```

Working directory: `frontend`.

Expected: FAIL because preview still references V5.

- [ ] **Step 3: Switch only preview URLs and copy**

Update V6 model/base URLs and labels. Do not change production avatar imports, selection logic, or candidate interview routes.

- [ ] **Step 4: Expose center-X diagnostics**

Add `centerXAt0` and `centerXAt1` to `CubismProofDiagnostic` so browser QA can display drift evidence.

- [ ] **Step 5: Include V6 audits in aggregate test**

Update `test:candidate-avatar` to run:

```text
node ../scripts/audit-coherent-mouth-source.spec.mjs
node ../scripts/audit-cubism-mouth-rig.spec.mjs
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the three focused commands from Step 2, then:

```powershell
npm.cmd run test:candidate-avatar
npm.cmd run typecheck
```

Expected: all PASS.

---

### Task 7: Browser QA, build, harness, and PM synchronization

**Files:**
- Modify: `.PM/ai-interviewer/README.md`
- Modify: `.PM/ai-interviewer/05-Cubism-V6-일관된-입-원본-설계.md`
- Modify: `.PM/ai-interviewer/AI-면접관-통합-기술현황-실행계획.md`

**Interfaces:**
- Consumes: completed V6 package/export/runtime.
- Produces: visual evidence and final verification record.

- [ ] **Step 1: Run complete non-browser verification**

Run:

```powershell
python scripts\prepare-coherent-mouth-v6-assets.spec.py
node scripts\audit-coherent-mouth-source.spec.mjs
node scripts\audit-coherent-mouth-source.mjs
node scripts\audit-cubism-mouth-rig.spec.mjs
npm.cmd run test:candidate-avatar
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Run frontend npm commands from `frontend`.

- [ ] **Step 2: Start or reuse the frontend dev server**

Use `http://localhost:3000/interviewer-preview`. Stop and restart only this workspace's Next process if `.next` ownership requires it.

- [ ] **Step 3: Perform desktop visual QA**

At 1280px:

```text
runtime/model ready
mouth-open 0, 0.5, 1 centered under nose
human lip outline
corners connected
teeth attached to upper lip
oral cavity has no transparent gap
tongue stays inside cavity
no full-mouth vertical stretching
no horizontal overflow
```

- [ ] **Step 4: Perform RMS and reduced-motion QA**

Play deterministic local audio twice. Both runs must rise above 0 and finish `idle/rest/0`. Reduced-motion must remain `rest/0`.

- [ ] **Step 5: Perform mobile QA**

At 390px, confirm the same mouth relationships remain legible and `documentWidth === innerWidth`.

- [ ] **Step 6: Run Role D harness**

Run:

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

If ownership fails only because unrelated `.superpowers/` or A-owned `infra/aws/*` changes are already present, record that result and rerun with `-SkipOwnership`. Do not modify the ownership map for unrelated files.

- [ ] **Step 7: Update PM documents**

Record:

```text
accepted coherent source and prompt
source/mask/layer/PSD paths
center, width, corner, teeth-gap, coverage, recomposition metrics
actual Cubism ArtMesh/deformer IDs
Core endpoint diagnostics
desktop/mobile/RMS/reduced-motion results
remaining limitation: ParamMouthForm and production renderer are not implemented
```

- [ ] **Step 8: Final checkpoint without committing**

Show `git status --short`, list V6-owned changes separately from pre-existing V5/infra changes, and wait for an explicit commit request.

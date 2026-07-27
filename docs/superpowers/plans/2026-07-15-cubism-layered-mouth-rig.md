# Cubism V5 계층형 입 리깅 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 면접관의 입술 인상을 보존하면서 상순, 하순, 입안, 윗니, 혀를 독립 ArtMesh로 분리한 V5 Cubism QA 모델을 만들고 기존 RMS `ParamMouthOpenY` 입력으로 자연스럽게 열고 닫는다.

**Architecture:** V3/V4를 보존하고 별도 V5 소스 패키지와 런타임 export를 만든다. 래스터 레이어는 기존 입술 참조를 identity 기준으로 사용해 생성하고, PSD/Cubism Editor/런타임의 세 단계에서 동일한 레이어 계약과 ArtMesh ID를 검증한다. 운영 면접 화면은 계속 PNG 렌더러를 사용하며 V5는 `/interviewer-preview`에서만 로드한다.

**Tech Stack:** Live2D Cubism Editor 5.3, Cubism SDK for Web R5, React 19, Next.js 16, TypeScript 5.9, Node.js 20, `ag-psd`, Pillow, built-in image generation, WebGL.

## Global Constraints

- 작업 브랜치는 `ai-interviewer`만 사용한다.
- `assets/interviewer-rigging/existing-look-cubism-v3/`, `existing-look-cubism-v4/`, `frontend/public/assets/interviewer-cubism/v3-proof/`, `v4-deformation-proof/`를 변경하지 않는다.
- 모든 V5 래스터 레이어는 1024x1536 RGBA PNG이며 입 기준점 `(512, 585)`를 유지한다.
- 입술 ArtMesh는 `ParamMouthOpenY` 0부터 1까지 불투명도 1을 유지한다.
- `ParamMouthForm`과 phoneme/viseme 예측은 이번 범위에 포함하지 않는다.
- 운영 `InterviewAvatar`와 `LocalInterviewerAvatar`는 PNG 렌더러를 유지한다.
- 이미지 편집은 built-in image generation을 우선 사용하고, 투명 결과는 평면 chroma 배경 생성 후 설치된 `remove_chroma_key.py`로 변환한다.
- 현재 작업 트리의 `InterviewerRiggingPreview.tsx` 복구 변경을 다른 커밋에 섞지 않는다.
- 구현 중 커밋과 push는 사용자가 명시적으로 요청한 경우에만 실행한다. 아래 커밋 단계는 승인 후 사용할 체크포인트다.
- `.PM/ai-interviewer`와 `docs/superpowers` 변경은 PM 또는 cross-owner review가 필요하다.

---

### Task 1: V5 소스 패키지 계약과 래스터 감사 추가

**Files:**
- Create: `scripts/audit-layered-mouth-assets.mjs`
- Create: `scripts/audit-layered-mouth-assets.spec.mjs`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/manifest.json`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/layers/`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/references/`

**Interfaces:**
- Consumes: V5 `manifest.json`, six 1024x1536 RGBA PNG files, optional `.rgba` files.
- Produces: `auditLayeredMouthAssets(manifestPath)` returning `{ canvas, layerNames, layers }` and rejecting missing, mis-sized, non-alpha, or duplicate layers.

- [ ] **Step 1: Write the failing source-audit test**

Create `scripts/audit-layered-mouth-assets.spec.mjs`:

```js
import { strict as assert } from "node:assert";
import { resolve } from "node:path";

let auditLayeredMouthAssets;
try {
  ({ auditLayeredMouthAssets } = await import("./audit-layered-mouth-assets.mjs"));
} catch (error) {
  assert.fail(`layered mouth audit module must exist: ${error instanceof Error ? error.message : String(error)}`);
}

const audit = await auditLayeredMouthAssets(resolve(
  "assets/interviewer-rigging/existing-look-cubism-v5/manifest.json",
));

assert.deepEqual(audit.canvas, { width: 1024, height: 1536 });
assert.deepEqual(audit.layerNames, [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
]);
assert.ok(audit.layers.every((layer) => layer.width === 1024 && layer.height === 1536));
assert.ok(audit.layers.every((layer) => layer.colorType === 6));
assert.ok(audit.layers.every((layer) => layer.nonTransparent));
assert.equal(new Set(audit.layers.map((layer) => layer.sha256)).size, audit.layers.length);
```

- [ ] **Step 2: Run the test and verify the first failure**

Run from the repository root:

```powershell
node scripts\audit-layered-mouth-assets.spec.mjs
```

Expected: FAIL because `audit-layered-mouth-assets.mjs` does not exist.

- [ ] **Step 3: Implement PNG and manifest validation**

Create `auditLayeredMouthAssets` using `node:fs/promises`, `node:crypto`, and PNG IHDR bytes. The implementation must:

```js
const EXPECTED_LAYER_NAMES = [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
];

// PNG IHDR offsets: width 16, height 20, color type 25.
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
const colorType = bytes[25];
```

Require each manifest layer to contain `name`, `pngPath`, `rgbaPath`, `visible`, `anchor`, `sourceType`, and `role`. Require each `.rgba` file to contain exactly `1024 * 1536 * 4` bytes. Determine `nonTransparent` from the alpha byte of the `.rgba` buffer rather than compressed PNG bytes.

- [ ] **Step 4: Add the V5 manifest skeleton**

Create the manifest with this stable contract before adding images:

```json
{
  "id": "existing-look-cubism-v5",
  "status": "layered-mouth-source-preparation",
  "derivedFrom": "../existing-look-cubism-v4/interviewer-import-v4.cmo3",
  "canvas": { "width": 1024, "height": 1536 },
  "mouthAnchor": { "x": 512, "y": 585 },
  "mouthOpenParameter": {
    "id": "ParamMouthOpenY",
    "range": { "min": 0, "max": 1, "default": 0 },
    "keyforms": [0, 0.5, 1],
    "controlType": "layered-warp-deformation"
  },
  "layers": []
}
```

- [ ] **Step 5: Run the test and verify the asset failure**

Run the command from Step 2.

Expected: FAIL with a message that the manifest layer names do not match the six expected names.

- [ ] **Step 6: Checkpoint**

Run:

```powershell
git status --short
git diff --check
```

Do not stage the pre-asset skeleton unless the user requests a checkpoint commit.

---

### Task 2: 정렬된 V5 입 레이어 생성과 PSD 조립

**Files:**
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/layers/*-chroma.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/layers/*.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/normalized/*.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/normalized/*.rgba`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/references/mouth-open-0.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/references/mouth-open-05.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/references/mouth-open-1.png`
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/interviewer-mouth-v5.psd`
- Modify: `assets/interviewer-rigging/existing-look-cubism-v5/manifest.json`

**Interfaces:**
- Consumes: `existing-look/normalized/mouth-rest.png`, `mouth-open.png`, V3 composite preview, and six layer roles.
- Produces: six approved full-canvas alpha layers, three composite QA references, one layered PSD, and a complete manifest.

- [ ] **Step 1: Inspect reference images before editing**

Use `view_image` with original detail for:

```text
assets/interviewer-rigging/existing-look/normalized/mouth-rest.png
assets/interviewer-rigging/existing-look/normalized/mouth-open.png
assets/interviewer-rigging/existing-look-cubism-v3/composite-preview.png
```

Record the role of each image in the image-generation request: rest/open are identity and alignment references; the composite is the face-context reference.

- [ ] **Step 2: Generate one chroma source per layer**

Use one built-in image-generation edit call per layer. Reuse this invariant block in every call:

```text
Use case: identity-preserve
Asset type: Live2D Cubism mouth ArtMesh layer
Input images: rest mouth = identity/alignment reference; open mouth = anatomy and texture reference; composite = face-context reference
Canvas: exactly 1024x1536 portrait; keep the mouth centered at the same pixel position near (512,585)
Style: preserve the existing semi-realistic interviewer lip color, highlight direction, skin tone, and proportions
Backdrop: perfectly flat solid #00ff00 chroma key, no gradient, shadow, texture, or reflection
Constraints: output only the requested anatomical layer; all other facial features and mouth components absent; no text or watermark; do not use #00ff00 in the subject
Avoid: changed identity, wider smile, exaggerated teeth, glossy plastic lips, green fringe, rectangular crop edge
```

Append exactly one request for each output:

```text
mouth-skin-underlay: clean local skin patch behind the lips, no lips and no mouth opening
mouth-interior: dark oral cavity only, conservative oval matching the open reference
mouth-upper-teeth: upper tooth row only, natural off-white, no gums or lips
mouth-tongue: subdued tongue surface only, lower cavity placement, no lips or teeth
mouth-upper-lip: upper lip surface and edge only, preserve source width and cupid's bow
mouth-lower-lip: lower lip surface and edge only, preserve source width and highlight
```

Save each selected built-in result from `$CODEX_HOME/generated_images/` into the V5 `layers/` directory with the `-chroma.png` suffix. Do not overwrite a selected result during iteration; use `-v2` and promote only the approved variant.

- [ ] **Step 3: Convert chroma sources to alpha PNG**

Run the installed helper once per layer:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" --input <layer-chroma.png> --out <layer.png> --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

If a visible green fringe remains, retry that layer with `--edge-contract 1`. Do not switch to CLI/native transparency without separate user approval.

- [ ] **Step 4: Normalize and emit raw RGBA**

Run:

```powershell
python scripts\normalize-interviewer-rigging-assets.py --source-dir assets\interviewer-rigging\existing-look-cubism-v5\layers --output-dir assets\interviewer-rigging\existing-look-cubism-v5\normalized
```

Keep the approved output files in `normalized/` and point every manifest `pngPath` and `rgbaPath` at that directory. Do not reference `-chroma.png` files from the manifest.

- [ ] **Step 5: Complete the manifest layer entries**

Use this order so PSD z-order matches Cubism import order:

```json
[
  { "name": "mouth-skin-underlay", "role": "underlay", "sourceType": "identity-preserve-edit" },
  { "name": "mouth-interior", "role": "clipping-owner", "sourceType": "hybrid-reconstruction" },
  { "name": "mouth-upper-teeth", "role": "clipped-content", "sourceType": "hybrid-reconstruction" },
  { "name": "mouth-tongue", "role": "clipped-content", "sourceType": "hybrid-reconstruction" },
  { "name": "mouth-upper-lip", "role": "opaque-deforming-lip", "sourceType": "identity-preserve-edit" },
  { "name": "mouth-lower-lip", "role": "opaque-deforming-lip", "sourceType": "identity-preserve-edit" }
]
```

Each entry also includes `pngPath: "normalized/<name>.png"`, `rgbaPath: "normalized/<name>.rgba"`, `visible: true`, and `anchor: { "x": 512, "y": 585 }`.

- [ ] **Step 6: Run source audit and build the PSD**

Run:

```powershell
node scripts\audit-layered-mouth-assets.spec.mjs
node -e "import('./scripts/build-interviewer-rigging-psd.mjs').then(({buildInterviewerRiggingPsd}) => buildInterviewerRiggingPsd({manifestPath:'assets/interviewer-rigging/existing-look-cubism-v5/manifest.json',outputPath:'assets/interviewer-rigging/existing-look-cubism-v5/interviewer-mouth-v5.psd'}))"
node scripts\build-interviewer-rigging-psd.spec.mjs
```

Expected: all commands PASS and the PSD reports six layers on a 1024x1536 canvas.

- [ ] **Step 7: Perform raster visual QA**

View every alpha PNG against both a dark and light checker background. Reject and regenerate any layer with changed mouth width, opaque rectangles, skin halos, green fringe, or anatomy outside its assigned role.

Create each QA reference with one built-in image-generation compositing call. Pass the V3 composite as the face-context reference and all six approved alpha PNGs as supporting inserts. Use this prompt and replace only `<VALUE>` and `<STATE>`:

```text
Use case: compositing
Asset type: Cubism layered-mouth QA reference
Primary request: composite the supplied six mouth layers onto the supplied interviewer face at the unchanged mouth anchor for ParamMouthOpenY=<VALUE>
State: <STATE>
Constraints: preserve the face, hair, eyes, body, canvas, lighting, mouth width, and identity exactly; use only supplied layer artwork; no new anatomy; no text; no watermark
Output: 1024x1536 PNG showing the complete interviewer
```

Use `(0, closed/rest)`, `(0.5, intermediate)`, and `(1, open)` and save the selected results as `references/mouth-open-0.png`, `references/mouth-open-05.png`, and `references/mouth-open-1.png`. These files are visual QA references only and are not runtime layers.

---

### Task 3: Cubism V5 모델 리깅과 runtime export

**Files:**
- Create: `assets/interviewer-rigging/existing-look-cubism-v5/interviewer-import-v5.cmo3`
- Modify: `assets/interviewer-rigging/existing-look-cubism-v5/manifest.json`
- Create: `frontend/public/assets/interviewer-cubism/v5-layered-mouth-proof/*`

**Interfaces:**
- Consumes: V4 `.cmo3`, V5 layered PSD, `ParamMouthOpenY` 0/0.5/1.
- Produces: V5 source model with named ArtMeshes/deformers/clipping and a self-contained Web R5 export.

- [ ] **Step 1: Save a V5 Cubism copy**

Open `interviewer-import-v4.cmo3` in Cubism Editor and use Save As:

```text
assets/interviewer-rigging/existing-look-cubism-v5/interviewer-import-v5.cmo3
```

Verify the title bar shows the V5 filename before importing or reimporting the V5 PSD.

- [ ] **Step 2: Import the layered PSD and establish names**

Import `interviewer-mouth-v5.psd`. Keep the V4 `mouth-open-reference` hidden as alignment-only. Rename imported ArtMeshes exactly:

```text
MouthSkinUnderlay
MouthInterior
MouthUpperTeeth
MouthTongue
MouthUpperLip
MouthLowerLip
```

Record Cubism-generated drawable IDs in `manifest.json` rather than inventing IDs in code.

- [ ] **Step 3: Create the deformer hierarchy and clipping**

Create:

```text
mouth-root
  mouth-interior-deform
  mouth-upper-lip-deform
  mouth-lower-lip-deform
```

Place the interior, teeth, and tongue under `mouth-interior-deform`; upper and lower lips under their respective deformers. Configure `MouthInterior` as the clipping mask used by `MouthUpperTeeth` and `MouthTongue`. Keep `MouthSkinUnderlay` behind all mouth ArtMeshes.

- [ ] **Step 4: Add `ParamMouthOpenY` keyforms**

Add values `0`, `0.5`, and `1` to all three deformers. Keep both lip ArtMesh opacities at 100% for all keyforms. Pin mouth corners and move the upper/lower center bounds symmetrically. At 0, lip geometry fully covers interior content; at 1, the upper teeth and restrained tongue are visible only inside the interior clipping region.

- [ ] **Step 5: Scrub and approve the source model**

Verify at 0, 0.5, and 1:

```text
no second complete-mouth reference is visible
upper and lower lip opacity = 100%
upper/lower lip geometry differs between 0 and 1
teeth and tongue do not leave the mouth interior
no vertex inversion or corner detachment
no skin underlay seam
```

- [ ] **Step 6: Update manifest IDs and export Web R5 assets**

Record ArtMesh and deformer IDs, clipping owner, clipped drawable IDs, and opacity invariants in the manifest. Export as `interviewer-v5-layered-mouth-proof` with MOC3, model3 JSON, display info, one 2048 texture, and the unchanged 1024x1536 base image into the V5 public directory.

- [ ] **Step 7: Verify self-contained references**

Run:

```powershell
Get-Content -LiteralPath frontend\public\assets\interviewer-cubism\v5-layered-mouth-proof\interviewer-v5-layered-mouth-proof.model3.json -Encoding UTF8
```

Expected: `Moc`, `Textures`, and `DisplayInfo` resolve inside the V5 export directory.

---

### Task 4: Cubism Core 기반 계층형 입 감사 자동화

**Files:**
- Create: `scripts/audit-cubism-mouth-rig.mjs`
- Create: `scripts/audit-cubism-mouth-rig.spec.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: local Cubism Core JS, V5 MOC3, V5 manifest ArtMesh IDs.
- Produces: endpoint diagnostic with parameter range, opacity, width, height, and mask IDs for each expected mouth drawable.

- [ ] **Step 1: Write the failing MOC3 audit test**

Assert:

```js
assert.equal(result.parameter.id, "ParamMouthOpenY");
assert.equal(result.parameter.index >= 0, true);
assert.deepEqual(result.parameter.range, [0, 1]);
assert.deepEqual(result.drawables.MouthUpperLip.opacity, [1, 1]);
assert.deepEqual(result.drawables.MouthLowerLip.opacity, [1, 1]);
assert.notEqual(result.drawables.MouthUpperLip.height[0], result.drawables.MouthUpperLip.height[1]);
assert.notEqual(result.drawables.MouthLowerLip.height[0], result.drawables.MouthLowerLip.height[1]);
assert.ok(result.drawables.MouthUpperTeeth.maskIds.includes(result.drawables.MouthInterior.id));
assert.ok(result.drawables.MouthTongue.maskIds.includes(result.drawables.MouthInterior.id));
```

- [ ] **Step 2: Run and verify failure**

```powershell
node scripts\audit-cubism-mouth-rig.spec.mjs
```

Expected: FAIL because the audit module is missing.

- [ ] **Step 3: Implement Core loading and endpoint capture**

Use `node:vm` to evaluate the checked-in Core and expose its internal Emscripten module readiness callback. Do not `await` the Emscripten thenable because it resolves with itself. Invoke `.then(callback)` and return a normal Promise that resolves with the diagnostic.

Capture model state after setting parameter values 0 and 1. Convert drawable mask indices to drawable IDs and calculate geometry bounds from `vertexPositions`.

- [ ] **Step 4: Run and verify pass**

Run the command from Step 2.

Expected: PASS and JSON evidence for both lips, interior, teeth, and tongue.

- [ ] **Step 5: Add the audit to the avatar test command**

Append `node ../scripts/audit-cubism-mouth-rig.spec.mjs` to `frontend/package.json` `test:candidate-avatar`. Run:

```powershell
npm.cmd run test:candidate-avatar
```

Expected: PASS.

---

### Task 5: QA renderer를 V5로 전환하고 계층 진단 노출

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
- Modify: `frontend/src/features/candidate-application-interview/CubismSdkRuntime.ts`
- Modify: `frontend/src/features/candidate-application-interview/CubismProofRuntime.ts`
- Modify: `frontend/src/features/candidate-application-interview/CubismProofInterviewerAvatar.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.tsx`
- Modify: `scripts/audit-interviewer-avatar-assets.spec.mjs`

**Interfaces:**
- Consumes: `mouthOpen: number`, `reducedMotion: boolean`, V5 model URL.
- Produces: V5 QA rendering and serializable drawable diagnostics including `maskIds`.

- [ ] **Step 1: Write failing V5 URL and copy assertions**

Update tests to expect:

```ts
assert.equal(
  CUBISM_PROOF_MODEL_URL,
  "/assets/interviewer-cubism/v5-layered-mouth-proof/interviewer-v5-layered-mouth-proof.model3.json",
);
assert.match(markup, /Cubism V5 layered mouth proof/);
assert.match(markup, /상순 · 하순 · 입안 · 윗니 · 혀/);
assert.match(markup, /운영 적용 전 QA 모델/);
```

The fallback base path and canvas label must also reference V5.

- [ ] **Step 2: Run focused tests and verify failure**

From `frontend`:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/CubismSdkRuntime.spec.ts
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Expected: FAIL because production code still references V4.

- [ ] **Step 3: Extend diagnostic types**

Change each diagnostic drawable to:

```ts
{
  id: string;
  maskIds: string[];
  opacityAt0: number;
  opacityAt1: number;
  widthAt0: number;
  widthAt1: number;
  heightAt0: number;
  heightAt1: number;
}
```

Build `maskIds` from `model.getDrawableMasks()[index]` and `model.getDrawableMaskCounts()[index]`, resolving each mask index through `model.getDrawableId(maskIndex).getString()`.

- [ ] **Step 4: Switch only QA assets and labels to V5**

Update the model URL, fallback base image, canvas label, and preview proof record. Preserve the component name and all production PNG callers. Keep reduced motion forcing `mouthOpen` to 0.

- [ ] **Step 5: Update V5 asset assertions**

Point `audit-interviewer-avatar-assets.spec.mjs` at the V5 model and assert non-empty MOC3/base/texture, 1024x1536 base, 2048 texture, display info with `ParamMouthOpenY`, and V5 filenames. Do not delete the V4 export.

- [ ] **Step 6: Run focused and aggregate tests**

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/CubismSdkRuntime.spec.ts
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
npm.cmd run test:candidate-avatar
npm.cmd run typecheck
```

Expected: all PASS.

---

### Task 6: 시각 QA, 빌드, 하네스, PM 문서 동기화

**Files:**
- Modify: `.PM/ai-interviewer/README.md`
- Modify: `.PM/ai-interviewer/AI-면접관-통합-기술현황-실행계획.md`
- Verify: `assets/interviewer-rigging/existing-look-cubism-v5/`
- Verify: `frontend/public/assets/interviewer-cubism/v5-layered-mouth-proof/`

**Interfaces:**
- Consumes: completed V5 source/export/runtime.
- Produces: review evidence, updated PM status, and repository verification results.

- [ ] **Step 1: Run production build**

Stop only this workspace's frontend dev server if it owns `.next`, then run:

```powershell
npm.cmd run build
```

Working directory: `frontend`.

Expected: PASS and `/interviewer-preview` appears in the route list.

- [ ] **Step 2: Run non-browser Cubism evidence audit**

```powershell
node scripts\audit-layered-mouth-assets.spec.mjs
node scripts\audit-cubism-mouth-rig.spec.mjs
```

Record exact endpoint opacity, geometry, and clipping values in the completion report.

- [ ] **Step 3: Run manual preview QA**

Open `http://localhost:3000/interviewer-preview` and verify:

```text
model status = ready
0 / 0.5 / 1 show continuous geometry without full-mouth frame replacement
upper/lower lips stay visible and aligned
teeth and tongue remain clipped inside the mouth
local RMS audio played twice rises above 0 and returns to 0
reduced motion holds mouth-open at 0
1280px and 390px layouts have no overlap or horizontal overflow
```

If browser automation is blocked by localhost policy, retain the Core audit as automated evidence and ask the user only for the visual/audio interaction observations.

- [ ] **Step 4: Update PM status**

Add V4 completed evidence and V5 result/status to the integrated PM document. Preserve the distinction between QA proof and production renderer.

- [ ] **Step 5: Run repository checks**

From the repository root:

```powershell
git diff --check
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

Expected: PASS. If `prisma generate` reports a Windows DLL lock, identify and stop only this workspace's backend development process, rerun the harness, and restart the same server afterward.

- [ ] **Step 6: Review and checkpoint**

Report:

```text
V5 source and runtime asset paths
actual Cubism ArtMesh/deformer IDs
opacity/geometry/clipping audit values
raster, focused test, aggregate test, build, and Role D harness results
remaining limitation: ParamMouthForm/viseme is not yet driven
PM/cross-owner review required for .PM and docs/superpowers
```

Do not commit or push until the user explicitly requests it.

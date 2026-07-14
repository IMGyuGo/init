# Cubism Single ArtMesh Deformation Proof Design

## Objective

Replace the V3 mouth opacity crossfade in a separate V4 proof with visible
`ParamMouthOpenY`-driven deformation of one continuously opaque ArtMesh. The
proof must remain connected to the existing continuous RMS mouth-open value
without replacing the production PNG interviewer.

## Scope

### Included

- Preserve the current V3 `.cmo3` source and exported V3 runtime assets.
- Create a separate V4 Cubism source derived from V3.
- Use the existing aligned `mouth-open-reference` texture as the V4 deformation
  ArtMesh.
- Keep that ArtMesh at 100% opacity across `ParamMouthOpenY` values 0 through 1.
- Add keyforms at 0, 0.5, and 1 that compress and expand the same ArtMesh
  vertically around the mouth center.
- Keep `mouth-rest` and the other mouth references hidden as alignment guides.
- Export V4 runtime assets to a separate public directory.
- Show the V4 proof in the interviewer preview and drive it with the existing
  continuous RMS value.
- Label the result as a single-ArtMesh deformation proof, not a production
  natural-mouth rig.

### Excluded

- Replacing the production PNG interviewer.
- Generating or editing raster mouth artwork.
- Claiming anatomical upper-lip, lower-lip, teeth, tongue, or mouth-interior
  separation.
- Adding phoneme or viseme parameters beyond `ParamMouthOpenY`.
- Modifying backend APIs, database state, or deployment contracts.

## Chosen Approach

The V4 proof duplicates the V3 model instead of editing it in place. The
existing `mouth-open-reference` ArtMesh becomes the only visible mouth ArtMesh
for this proof. Its opacity remains 100%, and its geometry changes through
three `ParamMouthOpenY` keyforms:

| Value | Shape intent | Constraint |
| --- | --- | --- |
| `0` | vertically compressed resting mouth | no opacity change |
| `0.5` | partially open transition | no opacity change |
| `1` | source open-mouth proportions | no opacity change |

The deformation should be symmetric around the mouth center and conservative
enough that teeth and lip texture do not visibly fold over themselves. V4 is a
geometry pipeline proof. Clean anatomical ArtMeshes remain a later art task.

## Assets And Ownership

- Source package: `assets/interviewer-rigging/existing-look-cubism-v4/`
- Cubism source: `interviewer-import-v4.cmo3`
- Package metadata: `manifest.json`
- Runtime export: `frontend/public/assets/interviewer-cubism/v4-deformation-proof/`
- Existing V3 source and runtime export remain unchanged.

The manifest records the ArtMesh ID, opacity invariants, keyform values,
reference source, and known limitations. Changes under `docs/superpowers` need
PM or cross-owner review under the repository ownership rules.

## Runtime Integration

The existing Cubism proof renderer continues to receive a finite mouth-open
number in the inclusive range 0 to 1. The V4 model uses the same
`ParamMouthOpenY` parameter, so the RMS analysis and smoothing logic do not
need a second audio graph or a new value conversion.

The interviewer preview should load the V4 export while retaining an explicit
QA label that distinguishes it from production. Reduced-motion behavior keeps
forcing the rendered mouth-open value to 0.

If the V4 export cannot load, the preview must keep its current bounded error
state. The production interviewer remains unaffected because it still uses the
PNG renderer.

## Verification

### Cubism Editor

- At parameter values 0, 0.5, and 1, the same visible mouth ArtMesh remains at
  100% opacity.
- Vertex or deformer geometry changes are visible between all three keyforms.
- `mouth-rest` and alternate mouth references remain hidden.
- Scrubbing the parameter does not reveal a second mouth image.

### Runtime

- The V4 `.model3.json`, `.moc3`, texture, and physics-independent settings load
  without console errors.
- Manual values 0, 0.5, and 1 visibly change the mouth geometry.
- Audio playback produces continuous decimal mouth-open values, reaches above
  0, and returns to 0 after playback ends.
- Reduced motion renders the V4 mouth at 0.

### Repository

- Candidate-avatar tests, typecheck, production build, and asset audit pass.
- Desktop and mobile browser checks show no overlap or horizontal overflow.
- The Windows Role D local harness is run and any unrelated ownership or file
  lock failures are reported separately.

## Acceptance Criteria

- V3 proof files are preserved.
- V4 uses one continuously opaque mouth ArtMesh for values 0 through 1.
- `ParamMouthOpenY` changes geometry instead of crossfading mouth textures.
- Existing RMS lip sync drives the V4 parameter without changing the production
  PNG avatar.
- UI and metadata do not describe V4 as anatomically natural or production
  ready.

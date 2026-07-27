# Cubism Layered Mouth Rig V5 Design

## Objective

Create a separate V5 Cubism proof that replaces the V4 single-mouth-ArtMesh
deformation with a layered mouth rig. The rig must separate the upper lip,
lower lip, mouth interior, upper teeth, and tongue while preserving the current
interviewer identity and the existing continuous `ParamMouthOpenY` RMS input.

V5 remains a QA proof. The production interview screen continues using the PNG
avatar until the layered rig passes visual and runtime review.

## Current Asset Findings

- V4 proves that `ArtMesh3` stays fully opaque while its height changes with
  `ParamMouthOpenY`.
- The existing `mouth-rest`, `mouth-open`, `mouth-wide`, and `mouth-round`
  files are complete mouth frames rather than independently usable anatomy.
- The existing source does not contain clean upper-lip, lower-lip, tooth,
  tongue, or mouth-interior layers.
- Reusing only the complete mouth frames would preserve alignment but would
  reintroduce frame replacement or produce missing pixels during large
  deformation.

## Chosen Approach

Use a hybrid reconstruction:

1. Preserve the lip color, highlight, texture, width, and corner alignment from
   the validated interviewer mouth references.
2. Separate the visible upper and lower lip surfaces into independent
   transparent layers.
3. Reconstruct only the previously occluded mouth interior, upper teeth, and
   tongue surfaces in the same semi-realistic style.
4. Place every output on the existing 1024 by 1536 canvas so import alignment
   does not depend on manual offsets.

This approach preserves facial identity better than a complete redraw and
supports a wider opening range than segmentation without reconstruction.

## Scope

### Included

- Preserve V3 and V4 source packages and runtime exports unchanged.
- Create `assets/interviewer-rigging/existing-look-cubism-v5/`.
- Produce aligned transparent raster layers for the layered mouth.
- Assemble a layered PSD suitable for Cubism Editor import.
- Create a separate V5 `.cmo3` source derived from V4.
- Rig natural opening at `ParamMouthOpenY` values `0`, `0.5`, and `1`.
- Export a separate V5 runtime model and load it only in the interviewer QA
  preview.
- Keep the existing RMS mouth-open data flow and reduced-motion behavior.
- Add asset and runtime diagnostics for layer presence, opacity, and geometry.

### Excluded

- Replacing the production PNG interviewer.
- Changing backend APIs, database state, or deployment contracts.
- Adding phoneme recognition or viseme prediction.
- Driving `ParamMouthForm` from audio in this iteration.
- Re-rigging eyes, brows, head motion, hair physics, or body motion.

## Raster Layer Contract

All layers use a 1024 by 1536 transparent canvas and retain the current mouth
anchor near `(512, 585)`.

| Layer | Purpose | Visibility rule |
| --- | --- | --- |
| `mouth-skin-underlay` | Clean skin behind moving lip edges | Always visible behind the mouth rig |
| `mouth-interior` | Dark oral cavity surface | Visible only inside the mouth clipping region |
| `mouth-upper-teeth` | Upper tooth row without lip pixels | Clipped by the mouth interior and upper lip |
| `mouth-tongue` | Conservative lower-mouth tongue surface | Clipped by the mouth interior and lower lip |
| `mouth-upper-lip` | Upper lip texture and edge | Always opaque; geometry changes |
| `mouth-lower-lip` | Lower lip texture and edge | Always opaque; geometry changes |

The raster package also includes a composite reference for `0`, `0.5`, and `1`
mouth-open states. These references are QA images and are not runtime layers.

## Visual Constraints

- Resting width and mouth corners must match the validated source reference.
- Lip hue and highlight direction must remain consistent with the face.
- The closed state must not reveal the mouth interior, teeth, or tongue.
- The open state must reveal the upper teeth conservatively and avoid a fixed
  pasted-smile appearance.
- The tongue must remain subordinate to the lips and teeth and must not fill
  the oral cavity.
- No green chroma outline, hard rectangular edge, skin-colored halo, or black
  seam may be visible at the mouth boundary.

## Cubism Rig Structure

Create the following hierarchy in the V5 model:

```text
mouth-root
  mouth-interior-deform
    mouth-interior
    mouth-upper-teeth
    mouth-tongue
  mouth-upper-lip-deform
    mouth-upper-lip
  mouth-lower-lip-deform
    mouth-lower-lip
```

The interior ArtMesh provides the clipping boundary for the interior, teeth,
and tongue group. Lip ArtMeshes remain outside that clipped group and cover its
top and bottom edges.

### `ParamMouthOpenY`

| Value | Upper lip | Lower lip | Interior and contents |
| --- | --- | --- | --- |
| `0` | Resting edge, no vertical stretch | Resting edge, no vertical stretch | Fully covered by lip geometry |
| `0.5` | Small upward rotation and lift | Moderate downward movement | Partial tooth and cavity reveal |
| `1` | Conservative upper lift | Full approved downward movement | Full approved cavity, tooth, and tongue reveal |

The lips must not use opacity crossfades. The interior, teeth, and tongue remain
fully opaque source layers whose visibility is controlled by clipping and lip
occlusion. Keyform interpolation must not invert vertices or pull either mouth
corner away from the face anchor.

`ParamMouthForm` remains at its neutral value for V5. Round and wide reference
frames are retained for a later form/viseme iteration.

## Package And Export Layout

```text
assets/interviewer-rigging/existing-look-cubism-v5/
  interviewer-mouth-v5.psd
  interviewer-import-v5.cmo3
  manifest.json
  layers/
  references/

frontend/public/assets/interviewer-cubism/v5-layered-mouth-proof/
  interviewer-v5-layered-mouth-proof.model3.json
  interviewer-v5-layered-mouth-proof.moc3
  interviewer-v5-layered-mouth-proof.cdi3.json
  interviewer-v5-layered-mouth-proof-base.png
  interviewer-v5-layered-mouth-proof.2048/texture_00.png
```

The V5 manifest records each ArtMesh and deformer ID, the clipping owner, the
three keyforms, and the source reference used for each raster layer.

## Runtime Integration

The existing Cubism proof renderer continues receiving a finite mouth-open
value in the inclusive range 0 through 1. Only the QA model and base asset URLs
change to V5.

Diagnostics must report:

- the `ParamMouthOpenY` parameter index and range;
- all expected mouth drawable IDs;
- upper- and lower-lip opacity at values 0 and 1;
- upper- and lower-lip geometry at values 0 and 1;
- the interior clipping relationship;
- the rendered mouth-open value used by RMS playback.

Reduced motion continues forcing the rendered mouth-open value to 0. A V5 load
failure keeps the existing bounded fallback image and error state. Production
avatar callers remain unchanged.

## Verification

### Raster QA

- Validate exact canvas dimensions and alpha channels for every layer.
- Composite the six layers at rest and compare alignment with the source face.
- Inspect enlarged mouth crops for seams, halos, texture mismatch, and clipped
  highlights.
- Reject layers that change the interviewer's recognizable mouth proportions.

### Cubism Editor QA

- Verify every expected layer is an independent ArtMesh.
- Scrub `ParamMouthOpenY` through `0`, `0.5`, and `1`.
- Confirm upper and lower lips remain opaque throughout the range.
- Confirm the interior, teeth, and tongue never render outside the mouth.
- Confirm no ArtMesh flashes, folds over itself, or exposes the skin underlay.

### Runtime QA

- Verify the V5 MOC3 with Cubism Core at mouth-open endpoints.
- Confirm RMS playback produces continuous decimal values and returns to 0.
- Confirm reduced motion holds the model at 0.
- Check the preview at 1280px desktop and 390px mobile widths.
- Run candidate-avatar tests, typecheck, production build, asset audit, diff
  checks, and the Windows Role D local harness.

## Acceptance Criteria

- V3 and V4 remain byte-for-byte unchanged.
- V5 contains independent upper lip, lower lip, interior, upper teeth, and
  tongue ArtMeshes.
- The lip ArtMeshes remain fully opaque while their geometry changes between
  mouth-open 0 and 1.
- Closed, intermediate, and open states remain aligned with the source face.
- The mouth interior never escapes its clipping region.
- Existing RMS lip sync drives V5 without a second audio analyser.
- The production interview avatar remains on the PNG renderer.

## Ownership And Review

The implementation is Role D candidate-interview work. Raster and Cubism
source changes require visual review, and changes under `docs/superpowers`
require PM or cross-owner review under the repository collaboration rules.

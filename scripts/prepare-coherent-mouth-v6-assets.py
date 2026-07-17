#!/usr/bin/env python3
"""Build the V6 mouth package from one coherent, identity-preserving source."""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import time
from collections.abc import Callable
from io import BytesIO
from pathlib import Path
from typing import NamedTuple, TypeVar

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


CANVAS = (1024, 1536)
ANCHOR = (512, 585)
EDIT_REGION = (400, 530, 625, 675)
REFERENCE_CLOSED_MOUTH_WIDTH = 101
SOURCE_X_SHIFT = -11
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
LAYER_NAMES = (
    "mouth-skin-underlay",
    "mouth-interior",
    "mouth-upper-teeth",
    "mouth-tongue",
    "mouth-upper-lip",
    "mouth-lower-lip",
)
SEMANTIC_LAYER_NAMES = LAYER_NAMES[1:]
COMPOSITE_ORDER = (
    "mouth-interior",
    "mouth-tongue",
    "mouth-upper-teeth",
    "mouth-upper-lip",
    "mouth-lower-lip",
)

# Final-canvas coordinates after shifting the generated mouth 11px left.
OUTER_MOUTH_POLYGON = (
    (458, 584),
    (461, 574),
    (476, 565),
    (495, 561),
    (512, 563),
    (529, 561),
    (549, 569),
    (565, 582),
    (561, 600),
    (548, 614),
    (530, 622),
    (511, 624),
    (490, 622),
    (473, 613),
    (462, 600),
)
OPENING_POLYGON = (
    (464, 584),
    (475, 580),
    (490, 580),
    (505, 583),
    (521, 580),
    (541, 581),
    (557, 584),
    (551, 592),
    (543, 598),
    (529, 604),
    (512, 611),
    (494, 606),
    (477, 600),
    (467, 592),
)
T = TypeVar("T")


class MouthMetrics(NamedTuple):
    center_x: float
    width: int
    width_ratio: float
    corner_y_delta: int
    upper_lip_teeth_gap: int
    uncovered_opening_pixels: int
    tongue_outside_opening_pixels: int
    overlapping_semantic_pixels: int
    upper_teeth_height_ratio: float
    lower_teeth_like_pixels: int
    recomposition_max_channel_delta: int


def read_rgba(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path} must be {CANVAS[0]}x{CANVAS[1]}")
    return np.asarray(image).copy()


def retry_windows_write(operation: Callable[[], T], attempts: int = 5) -> T:
    for attempt in range(attempts):
        try:
            return operation()
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.05 * (attempt + 1))
    raise RuntimeError("unreachable write retry state")


def write_png(path: Path, rgba: np.ndarray) -> None:
    buffer = BytesIO()
    mode = "L" if rgba.ndim == 2 else "RGBA"
    Image.fromarray(rgba, mode=mode).save(
        buffer,
        format="PNG",
        optimize=False,
        compress_level=9,
    )
    retry_windows_write(lambda: path.write_bytes(buffer.getvalue()))


def visible_mask(mask: np.ndarray) -> np.ndarray:
    return mask if mask.dtype == bool else mask >= 128


def bounds(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(visible_mask(mask))
    if len(xs) == 0:
        raise ValueError("mask has no visible pixels")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def polygon_mask(points: tuple[tuple[int, int], ...], scale: int = 1) -> np.ndarray:
    image = Image.new("L", CANVAS if scale == 1 else (CANVAS[0] * scale, CANVAS[1] * scale), 0)
    draw = ImageDraw.Draw(image)
    scaled = points if scale == 1 else tuple((x * scale, y * scale) for x, y in points)
    draw.polygon(scaled, fill=255)
    if scale > 1:
        image = image.resize(CANVAS, Image.Resampling.LANCZOS)
    return np.asarray(image).copy()


def alpha_composite(base: np.ndarray, layer: np.ndarray) -> np.ndarray:
    source_alpha = layer[:, :, 3:4].astype(np.float32) / 255
    base_alpha = base[:, :, 3:4].astype(np.float32) / 255
    output_alpha = source_alpha + base_alpha * (1 - source_alpha)
    numerator = (
        layer[:, :, :3].astype(np.float32) * source_alpha
        + base[:, :, :3].astype(np.float32) * base_alpha * (1 - source_alpha)
    )
    output = np.zeros_like(base)
    output[:, :, :3] = np.where(
        output_alpha > 0,
        np.rint(numerator / np.maximum(output_alpha, 1e-8)),
        0,
    ).astype(np.uint8)
    output[:, :, 3] = np.rint(output_alpha[:, :, 0] * 255).astype(np.uint8)
    return output


def build_skin_underlay(master: np.ndarray) -> np.ndarray:
    top_color = master[552:562, :, :3].astype(np.float32).mean(axis=0)
    bottom_color = master[625:635, :, :3].astype(np.float32).mean(axis=0)
    skin = np.zeros_like(master)
    skin[:, :, 3] = 255
    for y in range(EDIT_REGION[1], EDIT_REGION[3]):
        ratio = np.clip((y - 562) / (625 - 562), 0, 1)
        skin[y, :, :3] = np.rint(top_color * (1 - ratio) + bottom_color * ratio).astype(np.uint8)

    skin_image = Image.fromarray(skin, mode="RGBA").filter(ImageFilter.GaussianBlur(radius=3))
    skin = np.asarray(skin_image).copy()
    alpha = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(alpha).polygon(
        (
            (454, 579),
            (465, 564),
            (491, 557),
            (548, 557),
            (579, 565),
            (590, 582),
            (584, 606),
            (565, 621),
            (480, 621),
            (459, 607),
        ),
        fill=255,
    )
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=3))
    skin[:, :, 3] = np.asarray(alpha)
    skin[skin[:, :, 3] == 0, :3] = 0
    return skin


def shifted_generated_pixels(generated: np.ndarray) -> np.ndarray:
    shifted = np.zeros_like(generated)
    source_left = EDIT_REGION[0] - SOURCE_X_SHIFT
    source_right = EDIT_REGION[2] - SOURCE_X_SHIFT
    shifted[
        EDIT_REGION[1] : EDIT_REGION[3],
        EDIT_REGION[0] : EDIT_REGION[2],
    ] = generated[
        EDIT_REGION[1] : EDIT_REGION[3],
        source_left:source_right,
    ]
    return shifted


def suppress_lower_teeth_highlight(shifted: np.ndarray) -> np.ndarray:
    corrected = shifted.copy()
    opening = polygon_mask(OPENING_POLYGON).astype(bool)
    rgb = corrected[:, :, :3].astype(np.int16)
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    y_grid, _ = np.indices(luminance.shape)
    lower_bright = opening & (y_grid >= 594) & (luminance >= 145) & (saturation <= 70)
    tongue_samples = (
        opening
        & (y_grid >= 591)
        & ~lower_bright
        & (rgb[:, :, 0] >= rgb[:, :, 1] + 20)
        & (rgb[:, :, 0] >= rgb[:, :, 2] + 10)
    )
    sample_pixels = corrected[tongue_samples, :3]
    if len(sample_pixels) == 0:
        raise ValueError("cannot infer a tongue color for lower-teeth suppression")
    fallback = np.median(sample_pixels, axis=0).astype(np.uint8)

    for y, x in zip(*np.where(lower_bright), strict=True):
        local = tongue_samples[max(0, y - 5) : y + 6, max(0, x - 5) : x + 6]
        local_pixels = corrected[
            max(0, y - 5) : y + 6,
            max(0, x - 5) : x + 6,
            :3,
        ][local]
        corrected[y, x, :3] = (
            np.median(local_pixels, axis=0).astype(np.uint8)
            if len(local_pixels)
            else fallback
        )
    return corrected


def largest_component(mask: np.ndarray) -> np.ndarray:
    left, top, right, bottom = EDIT_REGION
    local = mask[top:bottom, left:right].copy()
    visited = np.zeros_like(local, dtype=bool)
    best: list[tuple[int, int]] = []
    height, width = local.shape
    for y in range(height):
        for x in range(width):
            if not local[y, x] or visited[y, x]:
                continue
            component: list[tuple[int, int]] = []
            stack = [(y, x)]
            visited[y, x] = True
            while stack:
                current_y, current_x = stack.pop()
                component.append((current_y, current_x))
                for next_y, next_x in (
                    (current_y - 1, current_x),
                    (current_y + 1, current_x),
                    (current_y, current_x - 1),
                    (current_y, current_x + 1),
                ):
                    if (
                        0 <= next_y < height
                        and 0 <= next_x < width
                        and local[next_y, next_x]
                        and not visited[next_y, next_x]
                    ):
                        visited[next_y, next_x] = True
                        stack.append((next_y, next_x))
            if len(component) > len(best):
                best = component

    output = np.zeros_like(mask, dtype=bool)
    for y, x in best:
        output[top + y, left + x] = True
    return output


def fill_holes(mask: np.ndarray) -> np.ndarray:
    left, top, right, bottom = EDIT_REGION
    local = mask[top:bottom, left:right]
    background = ~local
    exterior = np.zeros_like(background, dtype=bool)
    stack: list[tuple[int, int]] = []
    height, width = background.shape
    for x in range(width):
        if background[0, x]:
            stack.append((0, x))
        if background[height - 1, x]:
            stack.append((height - 1, x))
    for y in range(height):
        if background[y, 0]:
            stack.append((y, 0))
        if background[y, width - 1]:
            stack.append((y, width - 1))

    while stack:
        y, x = stack.pop()
        if exterior[y, x] or not background[y, x]:
            continue
        exterior[y, x] = True
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= next_y < height and 0 <= next_x < width:
                stack.append((next_y, next_x))

    output = mask.copy()
    output[top:bottom, left:right] |= background & ~exterior
    return output


def segment_mouth(shifted: np.ndarray) -> tuple[dict[str, np.ndarray], np.ndarray]:
    rgb = shifted[:, :, :3].astype(np.int16)
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    y_grid, _ = np.indices(luminance.shape)

    generous = polygon_mask(OUTER_MOUTH_POLYGON).astype(bool)
    outer_seed = generous & (luminance < 175) & (saturation > 55)
    dilated = Image.fromarray(outer_seed.astype(np.uint8) * 255, mode="L").filter(
        ImageFilter.MaxFilter(3),
    )
    outer = fill_holes(largest_component(np.asarray(dilated) > 0))
    outer_alpha = np.asarray(
        Image.fromarray(outer.astype(np.uint8) * 255, mode="L").filter(
            ImageFilter.GaussianBlur(radius=0.7),
        ),
    ).copy()
    outer = outer_alpha > 0
    opening = polygon_mask(OPENING_POLYGON).astype(bool)
    opening &= outer

    teeth = opening & (luminance >= 145) & (saturation <= 75) & (y_grid <= 592)
    teeth = largest_component(teeth)
    tongue = (
        opening
        & ~teeth
        & (y_grid >= 591)
        & (rgb[:, :, 0] >= rgb[:, :, 1] + 20)
        & (rgb[:, :, 0] >= rgb[:, :, 2] + 10)
        & (luminance >= 65)
    )
    tongue = largest_component(tongue)
    interior = opening & ~teeth & ~tongue

    lips = outer & ~opening
    y_coords, x_coords = np.indices(lips.shape)
    split_y = 591 + np.rint(np.abs(x_coords - ANCHOR[0]) * 0.04).astype(np.int16)
    upper_lip = lips & (y_coords <= split_y)
    lower_lip = lips & ~upper_lip

    masks: dict[str, np.ndarray] = {
        "mouth-interior": interior.astype(np.uint8) * 255,
        "mouth-upper-teeth": teeth.astype(np.uint8) * 255,
        "mouth-tongue": tongue.astype(np.uint8) * 255,
        "mouth-upper-lip": np.where(upper_lip, outer_alpha, 0).astype(np.uint8),
        "mouth-lower-lip": np.where(lower_lip, outer_alpha, 0).astype(np.uint8),
    }
    return masks, opening


def layer_from_source(source: np.ndarray, mask: np.ndarray) -> np.ndarray:
    layer = np.zeros_like(source)
    visible = mask > 0
    layer[visible, :3] = source[visible, :3]
    layer[:, :, 3] = mask
    return layer


def measure_masks(
    masks: dict[str, np.ndarray],
    opening: np.ndarray,
    coherent: np.ndarray,
    recomposed: np.ndarray,
    reference_width: int = REFERENCE_CLOSED_MOUTH_WIDTH,
) -> MouthMetrics:
    semantic = {name: visible_mask(mask) for name, mask in masks.items()}
    anatomy = np.logical_or.reduce(tuple(semantic.values()))
    left, top, right, bottom = bounds(anatomy)
    center_x = (left + right) / 2
    width = right - left

    left_rows = np.where(anatomy[:, left])[0]
    right_rows = np.where(anatomy[:, right - 1])[0]
    left_corner_y = int(np.rint(left_rows.mean()))
    right_corner_y = int(np.rint(right_rows.mean()))

    upper_lip = semantic["mouth-upper-lip"]
    teeth = semantic["mouth-upper-teeth"]
    gaps: list[int] = []
    for x in range(left, right):
        upper_rows = np.where(upper_lip[:, x])[0]
        teeth_rows = np.where(teeth[:, x])[0]
        if len(upper_rows) and len(teeth_rows):
            gaps.append(max(0, int(teeth_rows.min() - upper_rows.max() - 1)))
    upper_lip_teeth_gap = min(gaps) if gaps else CANVAS[1]

    stack = np.stack(tuple(semantic.values()), axis=0)
    overlapping = int(np.count_nonzero(stack.sum(axis=0) > 1))
    opening_visible = visible_mask(opening)
    opening_covered = (
        semantic["mouth-interior"]
        | semantic["mouth-upper-teeth"]
        | semantic["mouth-tongue"]
    )
    uncovered = int(np.count_nonzero(opening_visible & ~opening_covered))
    tongue_outside = int(
        np.count_nonzero(semantic["mouth-tongue"] & ~opening_visible),
    )

    _, opening_top, _, opening_bottom = bounds(opening_visible)
    _, teeth_top, _, teeth_bottom = bounds(teeth)
    teeth_ratio = (teeth_bottom - teeth_top) / (opening_bottom - opening_top)
    coherent_rgb = coherent[:, :, :3].astype(np.int16)
    coherent_luminance = (
        0.2126 * coherent_rgb[:, :, 0]
        + 0.7152 * coherent_rgb[:, :, 1]
        + 0.0722 * coherent_rgb[:, :, 2]
    )
    coherent_saturation = coherent_rgb.max(axis=2) - coherent_rgb.min(axis=2)
    y_grid, _ = np.indices(opening_visible.shape)
    lower_teeth_like = int(
        np.count_nonzero(
            opening_visible
            & (y_grid >= 594)
            & (coherent_luminance >= 145)
            & (coherent_saturation <= 70),
        ),
    )
    recomposition_delta = int(
        np.abs(coherent.astype(np.int16) - recomposed.astype(np.int16)).max(),
    )
    return MouthMetrics(
        center_x=center_x,
        width=width,
        width_ratio=width / reference_width,
        corner_y_delta=abs(left_corner_y - right_corner_y),
        upper_lip_teeth_gap=upper_lip_teeth_gap,
        uncovered_opening_pixels=uncovered,
        tongue_outside_opening_pixels=tongue_outside,
        overlapping_semantic_pixels=overlapping,
        upper_teeth_height_ratio=teeth_ratio,
        lower_teeth_like_pixels=lower_teeth_like,
        recomposition_max_channel_delta=recomposition_delta,
    )


def assert_metrics(metrics: MouthMetrics) -> None:
    if abs(metrics.center_x - ANCHOR[0]) > 2:
        raise ValueError(f"mouth center X {metrics.center_x} is outside {ANCHOR[0]} +/- 2")
    if not 0.95 <= metrics.width_ratio <= 1.05:
        raise ValueError(f"mouth width ratio {metrics.width_ratio:.4f} is outside 0.95..1.05")
    if metrics.corner_y_delta > 3:
        raise ValueError(f"mouth corner Y delta {metrics.corner_y_delta} exceeds 3px")
    if metrics.upper_lip_teeth_gap > 1:
        raise ValueError(f"upper-lip/teeth gap {metrics.upper_lip_teeth_gap} exceeds 1px")
    if metrics.uncovered_opening_pixels:
        raise ValueError("opening contains uncovered pixels")
    if metrics.tongue_outside_opening_pixels:
        raise ValueError("tongue leaves the mouth opening")
    if metrics.overlapping_semantic_pixels:
        raise ValueError("semantic masks overlap")
    if not 0.20 <= metrics.upper_teeth_height_ratio <= 0.25:
        raise ValueError(
            f"upper-teeth height ratio {metrics.upper_teeth_height_ratio:.4f} is outside 0.20..0.25",
        )
    if metrics.lower_teeth_like_pixels:
        raise ValueError("lower-teeth-like neutral pixels remain in the mouth opening")
    if metrics.recomposition_max_channel_delta > 1:
        raise ValueError("coherent source does not recompose exactly")


def warp_layer(layer: np.ndarray, center_offset: int) -> np.ndarray:
    if center_offset == 0:
        return layer.copy()
    output = np.zeros_like(layer)
    alpha = layer[:, :, 3]
    try:
        left, _, right, _ = bounds(alpha)
    except ValueError:
        return output
    width = max(1, right - left - 1)
    for x in range(left, right):
        phase = (x - left) / width
        corner_weight = np.sin(np.pi * phase) ** 2
        offset = int(np.rint(center_offset * corner_weight))
        if offset >= 0:
            output[offset:, x] = layer[: CANVAS[1] - offset, x]
        else:
            output[:offset, x] = layer[-offset:, x]
    return output


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    normalized = min(1.0, max(0.0, (value - edge0) / (edge1 - edge0)))
    return normalized * normalized * (3 - 2 * normalized)


def mouth_layer_visibility(value: float) -> dict[str, float]:
    mouth_open = min(1.0, max(0.0, value))
    overlay = smoothstep(0.08, 0.28, mouth_open)
    return {
        "model-mouth-open": 0.38 + mouth_open * 0.62,
        "mouth-skin-underlay": overlay,
        "mouth-interior": overlay * smoothstep(0.12, 0.4, mouth_open),
        "mouth-upper-teeth": overlay * smoothstep(0.3, 0.58, mouth_open),
        "mouth-tongue": overlay * smoothstep(0.3, 0.75, mouth_open),
        "mouth-upper-lip": overlay,
        "mouth-lower-lip": overlay,
    }


def layer_with_opacity(layer: np.ndarray, opacity: float) -> np.ndarray:
    visible = layer.copy()
    visible[:, :, 3] = np.rint(visible[:, :, 3].astype(np.float32) * opacity).astype(np.uint8)
    visible[visible[:, :, 3] == 0, :3] = 0
    return visible


def create_state_reference(
    master: np.ndarray,
    layers: dict[str, np.ndarray],
    state: float,
) -> np.ndarray:
    visibility = mouth_layer_visibility(state)
    model_mouth_open = visibility["model-mouth-open"]
    offsets = {
        "mouth-upper-lip": round(15 * (1 - model_mouth_open)),
        "mouth-lower-lip": round(-15 * (1 - model_mouth_open)),
        "mouth-interior": 0,
        "mouth-upper-teeth": round(10 * (1 - model_mouth_open)),
        "mouth-tongue": round(-8 * (1 - model_mouth_open)),
    }
    reference = alpha_composite(
        master,
        layer_with_opacity(layers["mouth-skin-underlay"], visibility["mouth-skin-underlay"]),
    )
    for name in COMPOSITE_ORDER:
        warped = warp_layer(layers[name], offsets[name])
        reference = alpha_composite(reference, layer_with_opacity(warped, visibility[name]))
    return reference


def crop_4x(image: np.ndarray) -> np.ndarray:
    left, top, right, bottom = EDIT_REGION
    crop = Image.fromarray(image[top:bottom, left:right], mode="RGBA")
    return np.asarray(
        crop.resize((crop.width * 4, crop.height * 4), Image.Resampling.NEAREST),
    ).copy()


def build_psd(root: Path) -> None:
    repository = base64.b64encode(str(REPOSITORY_ROOT).encode("utf-8")).decode("ascii")
    asset_root = base64.b64encode(str(root).encode("utf-8")).decode("ascii")
    program = """
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const repositoryRoot = Buffer.from(process.argv[1], 'base64').toString('utf8');
      const assetRoot = Buffer.from(process.argv[2], 'base64').toString('utf8');
      const { buildInterviewerRiggingPsd } = await import(pathToFileURL(join(repositoryRoot, 'scripts', 'build-interviewer-rigging-psd.mjs')).href);
      await buildInterviewerRiggingPsd({
        manifestPath: join(assetRoot, 'manifest.json'),
        outputPath: join(assetRoot, 'interviewer-mouth-v6.psd'),
      });
    """
    subprocess.run(["node", "-e", program, repository, asset_root], check=True)


def update_manifest_metrics(root: Path, metrics: MouthMetrics) -> None:
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["status"] = "coherent-mouth-assets-ready"
    manifest["coherentMouthMetrics"] = {
        "centerX": metrics.center_x,
        "width": metrics.width,
        "referenceClosedMouthWidth": REFERENCE_CLOSED_MOUTH_WIDTH,
        "widthRatio": round(metrics.width_ratio, 6),
        "cornerYDelta": metrics.corner_y_delta,
        "upperLipTeethGap": metrics.upper_lip_teeth_gap,
        "uncoveredOpeningPixels": metrics.uncovered_opening_pixels,
        "tongueOutsideInteriorPixels": metrics.tongue_outside_opening_pixels,
        "overlappingSemanticPixels": metrics.overlapping_semantic_pixels,
        "upperTeethHeightRatio": round(metrics.upper_teeth_height_ratio, 6),
        "lowerTeethLikePixels": metrics.lower_teeth_like_pixels,
        "recompositionMaxChannelDelta": metrics.recomposition_max_channel_delta,
        "sourceXShift": SOURCE_X_SHIFT,
    }
    retry_windows_write(
        lambda: manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        ),
    )


def prepare(root: Path) -> MouthMetrics:
    root = root.resolve()
    masks_directory = root / "masks"
    normalized_directory = root / "normalized"
    references_directory = root / "references"
    sources_directory = root / "sources"
    for directory in (masks_directory, normalized_directory, references_directory, sources_directory):
        directory.mkdir(parents=True, exist_ok=True)

    master = read_rgba(root.parent / "existing-look" / "normalized" / "master.png")
    generated = read_rgba(sources_directory / "mouth-open-coherent-generated.png")
    shifted = suppress_lower_teeth_highlight(shifted_generated_pixels(generated))
    underlay = build_skin_underlay(master)
    masks, opening = segment_mouth(shifted)

    layers = {"mouth-skin-underlay": underlay}
    for name in SEMANTIC_LAYER_NAMES:
        layers[name] = layer_from_source(shifted, masks[name])

    coherent = alpha_composite(master, underlay)
    for name in COMPOSITE_ORDER:
        coherent = alpha_composite(coherent, layers[name])
    recomposed = alpha_composite(master, layers["mouth-skin-underlay"])
    for name in COMPOSITE_ORDER:
        recomposed = alpha_composite(recomposed, layers[name])

    metrics = measure_masks(
        masks,
        opening,
        coherent,
        recomposed,
        reference_width=REFERENCE_CLOSED_MOUTH_WIDTH,
    )
    assert_metrics(metrics)

    write_png(sources_directory / "mouth-open-coherent.png", coherent)
    write_png(references_directory / "mouth-open-coherent-full.png", coherent)
    write_png(references_directory / "mouth-open-coherent-crop-4x.png", crop_4x(coherent))
    write_png(references_directory / "mouth-open-recomposed.png", recomposed)
    write_png(references_directory / "mouth-open-recomposed-crop-4x.png", crop_4x(recomposed))

    for name in LAYER_NAMES:
        write_png(normalized_directory / f"{name}.png", layers[name])
        retry_windows_write(
            lambda name=name: (normalized_directory / f"{name}.rgba").write_bytes(
                layers[name].tobytes(),
            ),
        )
        if name != "mouth-skin-underlay":
            write_png(masks_directory / f"{name}-mask.png", masks[name])
    write_png(masks_directory / "mouth-opening-mask.png", opening.astype(np.uint8) * 255)

    for state, filename in (
        (0.0, "mouth-open-0.png"),
        (0.5, "mouth-open-05.png"),
        (1.0, "mouth-open-1.png"),
    ):
        reference = create_state_reference(master, layers, state)
        write_png(references_directory / filename, reference)
        write_png(
            references_directory / filename.replace(".png", "-crop-4x.png"),
            crop_4x(reference),
        )

    update_manifest_metrics(root, metrics)
    build_psd(root)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("assets/interviewer-rigging/existing-look-cubism-v6"),
        help="V6 asset root relative to the repository root",
    )
    arguments = parser.parse_args()
    metrics = prepare(arguments.root)
    print(json.dumps(metrics._asdict(), indent=2))


if __name__ == "__main__":
    main()

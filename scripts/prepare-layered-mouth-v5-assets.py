#!/usr/bin/env python3
"""Deterministically correct and package the V5 layered-mouth raster assets."""

from __future__ import annotations

import argparse
import base64
import subprocess
import time
from collections.abc import Callable
from io import BytesIO
from pathlib import Path
from typing import TypeVar

import numpy as np
from PIL import Image


CANVAS = (1024, 1536)
ANCHOR = (512, 585)
MOUTH_REGION = (400, 530, 625, 675)
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
LAYER_NAMES = (
    "mouth-skin-underlay",
    "mouth-interior",
    "mouth-upper-teeth",
    "mouth-tongue",
    "mouth-upper-lip",
    "mouth-lower-lip",
)
T = TypeVar("T")
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
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", optimize=False, compress_level=9)
    encoded = buffer.getvalue()
    retry_windows_write(lambda: path.write_bytes(encoded))


def alpha_bounds(rgba: np.ndarray) -> tuple[int, int, int, int]:
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise ValueError("layer has no visible pixels")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def paste_crop(canvas: np.ndarray, crop: np.ndarray, left: int, top: int) -> np.ndarray:
    height, width = crop.shape[:2]
    right = left + width
    bottom = top + height
    if left < 0 or top < 0 or right > CANVAS[0] or bottom > CANVAS[1]:
        raise ValueError("transformed layer leaves the fixed canvas")
    canvas[top:bottom, left:right] = crop
    return canvas


def resize_crop(crop: np.ndarray, width: int, height: int) -> np.ndarray:
    resized = np.asarray(
        Image.fromarray(crop, mode="RGBA").resize((width, height), Image.Resampling.LANCZOS),
    ).copy()
    resized[resized[:, :, 3] == 0, :3] = 0
    return resized


def chroma_from_alpha(rgba: np.ndarray) -> np.ndarray:
    chroma = rgba.copy()
    transparent = chroma[:, :, 3] == 0
    chroma[transparent, :3] = (0, 255, 0)
    chroma[:, :, 3] = 255
    return chroma


def state_transform(rgba: np.ndarray, name: str, state: float) -> np.ndarray:
    left, top, right, bottom = alpha_bounds(rgba)
    crop = rgba[top:bottom, left:right]
    if name == "mouth-skin-underlay":
        return rgba

    if name == "mouth-upper-lip":
        target_height = round(14 + (crop.shape[0] - 14) * state)
        target_bottom = round(585 + ((top + crop.shape[0]) - 585) * state)
        target_top = target_bottom - target_height
    elif name == "mouth-lower-lip":
        target_height = round(16 + (crop.shape[0] - 16) * state)
        target_top = round(583 + (top - 583) * state)
    else:
        closed_height = 5 if name == "mouth-interior" else 1
        target_height = max(1, round(closed_height + (crop.shape[0] - closed_height) * state))
        open_center = top + crop.shape[0] / 2
        target_center = ANCHOR[1] + (open_center - ANCHOR[1]) * state
        target_top = round(target_center - target_height / 2)
    transformed = resize_crop(crop, crop.shape[1], target_height)
    output = np.zeros_like(rgba)
    return paste_crop(output, transformed, left, target_top)


def alpha_composite(base: np.ndarray, layer: np.ndarray) -> np.ndarray:
    source_alpha = layer[:, :, 3:4].astype(np.float32) / 255
    base_alpha = base[:, :, 3:4].astype(np.float32) / 255
    output_alpha = source_alpha + base_alpha * (1 - source_alpha)
    result = base.copy()
    numerator = layer[:, :, :3] * source_alpha + base[:, :, :3] * base_alpha * (1 - source_alpha)
    result[:, :, :3] = np.where(
        output_alpha > 0,
        np.rint(numerator / np.maximum(output_alpha, 1e-8)),
        0,
    ).astype(np.uint8)
    result[:, :, 3] = np.rint(output_alpha[:, :, 0] * 255).astype(np.uint8)
    return result


def assert_inside_mouth_region(rgba: np.ndarray, name: str) -> None:
    left, top, right, bottom = alpha_bounds(rgba)
    region_left, region_top, region_right, region_bottom = MOUTH_REGION
    if left < region_left or top < region_top or right > region_right or bottom > region_bottom:
        raise ValueError(f"{name} exceeds the bounded mouth region")


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
        outputPath: join(assetRoot, 'interviewer-mouth-v5.psd'),
      });
    """
    subprocess.run(
        ["node", "-e", program, repository, asset_root],
        check=True,
    )


def prepare(root: Path) -> None:
    root = root.resolve()
    layers_directory = root / "layers"
    normalized_directory = root / "normalized"
    references_directory = root / "references"
    sources_directory = root / "sources"
    normalized_directory.mkdir(parents=True, exist_ok=True)
    references_directory.mkdir(parents=True, exist_ok=True)

    master = read_rgba(root.parent / "existing-look" / "normalized" / "master.png")
    corrected: dict[str, np.ndarray] = {}
    for name in LAYER_NAMES:
        source = read_rgba(sources_directory / f"{name}.png")
        assert_inside_mouth_region(source, name)
        corrected[name] = source
        write_png(layers_directory / f"{name}.png", source)
        write_png(layers_directory / f"{name}-chroma.png", chroma_from_alpha(source))
        write_png(normalized_directory / f"{name}.png", source)
        rgba_path = normalized_directory / f"{name}.rgba"
        rgba_bytes = source.tobytes()
        retry_windows_write(lambda: rgba_path.write_bytes(rgba_bytes))

    for state, filename in ((0.0, "mouth-open-0.png"), (0.5, "mouth-open-05.png"), (1.0, "mouth-open-1.png")):
        reference = master.copy()
        for name in LAYER_NAMES:
            reference = alpha_composite(reference, state_transform(corrected[name], name, state))
        write_png(references_directory / filename, reference)

    build_psd(root)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("assets/interviewer-rigging/existing-look-cubism-v5"),
        help="V5 asset root relative to the repository root",
    )
    arguments = parser.parse_args()
    prepare(arguments.root)


if __name__ == "__main__":
    main()

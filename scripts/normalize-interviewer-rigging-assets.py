"""Normalize generated avatar layers to one untrimmed RGBA canvas."""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image, ImageOps


MASTER_SIZE = (1024, 1536)


def normalize_image(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        fitted = ImageOps.contain(rgba, MASTER_SIZE, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", MASTER_SIZE, (0, 0, 0, 0))
        offset = ((MASTER_SIZE[0] - fitted.width) // 2, (MASTER_SIZE[1] - fitted.height) // 2)
        canvas.alpha_composite(fitted, offset)
        canvas.save(destination)
        destination.with_suffix(".rgba").write_bytes(canvas.tobytes())


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    arguments = parser.parse_args()

    arguments.output_dir.mkdir(parents=True, exist_ok=True)
    sources = sorted(
        path for path in arguments.source_dir.glob("*.png") if not path.stem.endswith("-chroma")
    )
    if not sources:
        raise SystemExit("No non-chroma PNG source layers were found.")

    for source in sources:
        normalize_image(source, arguments.output_dir / source.name)


if __name__ == "__main__":
    main()

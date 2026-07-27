"""Move an untrimmed RGBA rigging layer so its opaque bounds share one anchor."""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image


def register_layer(source: Path, destination: Path, anchor_x: int, anchor_y: int) -> None:
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        bounds = rgba.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError("Rigging layer must contain at least one non-transparent pixel.")

        left, top, right, bottom = bounds
        center_x = (left + right - 1) / 2
        center_y = (top + bottom - 1) / 2
        offset_x = round(anchor_x - center_x)
        offset_y = round(anchor_y - center_y)

        canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
        canvas.alpha_composite(rgba, (offset_x, offset_y))
        canvas.save(destination)


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--anchor-x", type=int, required=True)
    parser.add_argument("--anchor-y", type=int, required=True)
    arguments = parser.parse_args()

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    register_layer(arguments.input, arguments.output, arguments.anchor_x, arguments.anchor_y)


if __name__ == "__main__":
    main()

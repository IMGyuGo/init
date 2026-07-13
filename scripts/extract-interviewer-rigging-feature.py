"""Extract one feature from a master portrait onto the original transparent canvas."""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def extract_feature(
    source: Path,
    destination: Path,
    left: int,
    top: int,
    right: int,
    bottom: int,
    feather: int,
) -> None:
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        if not (0 <= left < right <= rgba.width and 0 <= top < bottom <= rgba.height):
            raise ValueError("Feature bounds must stay within the source canvas.")

        mask = Image.new("L", rgba.size, 0)
        ImageDraw.Draw(mask).rectangle((left, top, right - 1, bottom - 1), fill=255)
        if feather:
            mask = mask.filter(ImageFilter.GaussianBlur(radius=feather))

        alpha = ImageChops.multiply(rgba.getchannel("A"), mask)
        feature = rgba.copy()
        feature.putalpha(alpha)
        feature.save(destination)


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--left", type=int, required=True)
    parser.add_argument("--top", type=int, required=True)
    parser.add_argument("--right", type=int, required=True)
    parser.add_argument("--bottom", type=int, required=True)
    parser.add_argument("--feather", type=int, default=0)
    arguments = parser.parse_args()

    if arguments.feather < 0:
        raise ValueError("Feature feather must be zero or greater.")

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    extract_feature(
        arguments.input,
        arguments.output,
        arguments.left,
        arguments.top,
        arguments.right,
        arguments.bottom,
        arguments.feather,
    )


if __name__ == "__main__":
    main()

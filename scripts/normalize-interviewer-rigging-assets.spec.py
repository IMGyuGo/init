from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "normalize-interviewer-rigging-assets.py"


with TemporaryDirectory(prefix="interviewer-rigging-normalize-") as temporary_directory:
    workspace = Path(temporary_directory)
    source_directory = workspace / "layers"
    source_directory.mkdir()
    Image.new("RGBA", (2, 3), (120, 90, 60, 255)).save(source_directory / "face.png")

    output_directory = workspace / "normalized"
    subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--source-dir",
            str(source_directory),
            "--output-dir",
            str(output_directory),
        ],
        check=True,
    )

    normalized = Image.open(output_directory / "face.png")
    assert normalized.size == (1024, 1536)
    assert normalized.mode == "RGBA"
    assert any(pixel[3] > 0 for pixel in normalized.getdata())
    assert (output_directory / "face.rgba").stat().st_size == 1024 * 1536 * 4

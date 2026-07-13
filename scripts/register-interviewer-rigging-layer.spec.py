from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "register-interviewer-rigging-layer.py"


with TemporaryDirectory(prefix="interviewer-rigging-register-") as temporary_directory:
    workspace = Path(temporary_directory)
    source = workspace / "source.png"
    destination = workspace / "registered.png"

    image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    image.paste((220, 90, 90, 255), (30, 40, 50, 60))
    image.save(source)

    subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--input",
            str(source),
            "--output",
            str(destination),
            "--anchor-x",
            "60",
            "--anchor-y",
            "70",
        ],
        check=True,
    )

    registered = Image.open(destination).convert("RGBA")
    opaque = [
        (x, y)
        for y in range(registered.height)
        for x in range(registered.width)
        if registered.getpixel((x, y))[3] > 0
    ]
    assert min(x for x, _ in opaque) == 50
    assert max(x for x, _ in opaque) == 69
    assert min(y for _, y in opaque) == 60
    assert max(y for _, y in opaque) == 79

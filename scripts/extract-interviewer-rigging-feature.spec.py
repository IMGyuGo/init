from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "extract-interviewer-rigging-feature.py"


with TemporaryDirectory(prefix="interviewer-rigging-feature-") as temporary_directory:
    workspace = Path(temporary_directory)
    source = workspace / "master.png"
    destination = workspace / "feature.png"

    image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    image.paste((210, 90, 90, 255), (20, 30, 70, 80))
    image.save(source)

    subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--input",
            str(source),
            "--output",
            str(destination),
            "--left",
            "20",
            "--top",
            "30",
            "--right",
            "70",
            "--bottom",
            "80",
            "--feather",
            "0",
        ],
        check=True,
    )

    extracted = Image.open(destination).convert("RGBA")
    assert extracted.size == (100, 100)
    assert extracted.getpixel((20, 30)) == (210, 90, 90, 255)
    assert extracted.getpixel((69, 79)) == (210, 90, 90, 255)
    assert extracted.getpixel((19, 30))[3] == 0
    assert extracted.getpixel((70, 80))[3] == 0

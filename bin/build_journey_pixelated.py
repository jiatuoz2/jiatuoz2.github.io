#!/usr/bin/env python3
"""Build the pixelated stand-ins for the people pictured on the "My Journey" boards.

Each <name>.jpg gets a <name>.pixel.jpg next to it: the same size, cut into square cells, each
cell filled with the mean colour under it (a BOX downscale, then a NEAREST upscale, so the
blocks are baked in). The board shows the stand-in. For a portrait, the close-examine view also
shows it until "Reveal photo"; for the team photo, the examine view shows the redacted photo
itself. The strength is mild on purpose: head outline, hair, shoulders and clothing colours
still read, but the face does not.

    people/*.jpg                        portraits, about 400 px square: 24 cells across
    fort-lauderdale-frc-744-team.jpg    the team photo, 1600 px wide (faces already marked
                                        out): 80 cells across

Usage:
    python bin/build_journey_pixelated.py                 # rebuild all of the above
    python bin/build_journey_pixelated.py FILE [--cells N] # one file

Output is progressive JPEG, quality 85, with no EXIF or other metadata.
"""

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets" / "img" / "journey"
PORTRAIT_CELLS = 24
TEAM_CELLS = 80
TEAM_PHOTO = ROOT / "fort-lauderdale-frc-744-team.jpg"


def pixelate(src: Path, cells: int) -> Path:
    image = Image.open(src).convert("RGB")
    width, height = image.size
    cell = max(1, round(width / cells))
    cols, rows = math.ceil(width / cell), math.ceil(height / cell)
    # Pad with the edge pixels to whole cells, so every block is square and the same size.
    pixels = np.asarray(image)
    pixels = np.pad(pixels, ((0, rows * cell - height), (0, cols * cell - width), (0, 0)), mode="edge")
    padded = Image.fromarray(pixels)
    small = padded.resize((cols, rows), Image.Resampling.BOX)
    blocks = small.resize((cols * cell, rows * cell), Image.Resampling.NEAREST).crop((0, 0, width, height))
    out = src.with_name(f"{src.stem}.pixel.jpg")
    blocks.save(out, "JPEG", quality=85, progressive=True, optimize=True)
    print(f"{out.relative_to(ROOT.parent.parent.parent)}  {width}x{height}  {cols} cells of {cell} px")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("file", nargs="?", type=Path)
    parser.add_argument("--cells", type=int, default=None, help="cells across the full width")
    args = parser.parse_args()
    if args.file:
        pixelate(args.file, args.cells or PORTRAIT_CELLS)
        return
    for portrait in sorted((ROOT / "people").glob("*.jpg")):
        if not portrait.name.endswith(".pixel.jpg"):
            pixelate(portrait, PORTRAIT_CELLS)
    pixelate(TEAM_PHOTO, TEAM_CELLS)


if __name__ == "__main__":
    main()

# Renders the two diploma pages for the My Journey boards (assets/img/journey/docs/uiuc.jpg, columbia.jpg and
# their -large.jpg versions for the examine view)
# and blurs everything except the institution's name, Jiatuo's name, the degree and the honours, at the owner's
# request (identity-theft caution): signatures, seals and dates are wiped harder than the rest of the text.
# The source PDFs are the owner's own and are not in the repository.
# Usage: python bin/build_journey_diplomas.py <UIUC eDiploma PDF> <Columbia diploma PDF> assets/img/journey/docs
import sys

import numpy
import pymupdf
from PIL import Image, ImageDraw, ImageFilter

def render(path, pno, width, keep_text, keep_frac, strong_below, out):
    doc = pymupdf.open(path)
    page = doc[pno]
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    W, H = im.size
    m = page.rotation_matrix * pymupdf.Matrix(zoom, zoom)
    keep = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(keep)
    found = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            hit = [k for k in keep_text if k.lower() in t.lower()]
            if hit:
                r = pymupdf.Rect(l["bbox"]) * m
                padx, pady = 0.012 * W, 0.004 * W
                d.rectangle([r.x0 - padx, r.y0 - pady, r.x1 + padx, r.y1 + pady], fill=255)
                found.extend(hit)
    for x0, y0, x1, y1 in keep_frac:
        d.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], fill=255)
    missing = [k for k in keep_text if k not in found]
    if missing:
        sys.exit(f"missing keep lines: {missing}")
    # Hard-edged keep mask (a 1 px feather only), so no neighbouring line leaks through a soft edge.
    keep = keep.filter(ImageFilter.GaussianBlur(1))
    # Destructive, not just blurred: the hidden parts are rebuilt from a tiny copy of the page (the text from
    # 1/40 of the width, the signatures, seals and dates from 1/90), so the detail is gone from the file and no
    # deblurring or AI can bring it back. A light blur hides the blocks and a little noise breaks up the bands.
    def destroy(scale):
        small = im.resize((max(1, round(W / scale)), max(1, round(H / scale))), Image.BOX)
        big = small.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.0025 * W))
        rng = numpy.random.default_rng(scale)
        arr = numpy.asarray(big, dtype=numpy.float32) + rng.normal(0, 1.6, (H, W, 1)).astype(numpy.float32)
        return Image.fromarray(numpy.clip(arr, 0, 255).astype(numpy.uint8))
    soft = destroy(40)
    hard = destroy(90)
    strong = Image.new("L", im.size, 0)
    ImageDraw.Draw(strong).rectangle([0, strong_below * H, W, H], fill=255)
    strong = strong.filter(ImageFilter.GaussianBlur(0.004 * W))
    blurred = Image.composite(hard, soft, strong)
    outim = Image.composite(im, blurred, keep)
    outim.save(out, "JPEG", quality=88, progressive=True, optimize=True)
    print(out, outim.size, found)

UIUC_PDF, COLUMBIA_PDF, R = sys.argv[1:4]
UIUC = ["Jiatuo Zou", "Bachelor of Science in Computer Science", "with Highest Honors", "Urbana - Champaign"]
COLUMBIA = ["JIATUO ZOU", "MASTER OF SCIENCE"]
# Each diploma in two sizes: the board's scan and the examine view's large one (-large.jpg). Both are blurred.
for width, suffix in ((1800, ""), (3300, "-large")):
    render(UIUC_PDF, 1, width, UIUC, [(0.13, 0.264, 0.87, 0.335)], 0.765, R + "/uiuc" + suffix + ".jpg")
for width, suffix in ((1400, ""), (3600, "-large")):
    render(COLUMBIA_PDF, 0, width, COLUMBIA, [(0.2, 0.045, 0.8, 0.215)], 0.735, R + "/columbia" + suffix + ".jpg")

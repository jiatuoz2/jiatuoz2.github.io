#!/usr/bin/env python3
"""Build the generated paper, fold, wear and tape textures of the "My Journey" boards.

Everything here is made from seeded noise with NumPy and Pillow (no outside artwork), so the
output is the same on every run. The files go to assets/img/journey/textures/ and are used by
_sass/_journey-board.scss (the boards) and _sass/_journey-examine.scss (the close-examine
view, which swaps in the large fold maps only when it opens). See the CREDITS.md there.

    paper-fibre.jpg        1024 px seamless tile, greyscale, multiplied into every paper:
                           pulp mottling, fine fibres (a little aligned with the machine
                           direction), the odd fleck.
    manila-fibre.jpg       the same for the manila folders: coarser board fibre, more flecks.
    crease-<kind>.jpg      fold and handling maps, 1600 px (examine view) and -sm 512 px
                           (board): trifold, half, cross, corner, wave, crumple. Mid grey is
                           flat paper; lit from the top left, so a crease is a thin bright
                           crest on one side and a soft shadow on the other. Used with
                           mix-blend-mode: hard-light (darker than mid grey multiplies,
                           lighter screens).
    crease-plate.jpg       the board's title sheet: buckled between its two strips of tape,
                           flat under them, one soft fold, its free corners lifting.
    paper-edge-a/b.jpg     edge wear and handling grime (near white, multiplied): a frayed,
                           slightly darker edge, a few nicks, thumb marks, a faint vignette.
    tape-crepe.png         crepe and fibre of masking tape (grey + alpha, tiles along the
                           tape), laid over the tape's own color.
    tape-tear-l/r.png      alpha masks for the torn ends of a strip of tape.
    ink-mottle.png         alpha mask of uneven stamp ink.
    print-luster.jpg       the fine pebble of a luster photo print (grey, overlay).
    leatherette.jpg        the pebbled grain of a padded diploma cover (grey, overlay).

Usage:
    python bin/build_journey_textures.py

Needs NumPy and Pillow.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "journey" / "textures"
# Light from the top left and a little in front (x right, y down, z toward the viewer).
LIGHT = np.array([-0.42, -0.62, 0.66])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# ---------- noise ----------


def band_noise(rng, h, w, lo, hi, power=1.0):
    """Seamless band-limited noise (unit std): frequencies lo..hi cycles per tile, ~f^-power."""
    white = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    filt = f ** (-power) * np.exp(-((f / hi) ** 2)) * (1 - np.exp(-((f / lo) ** 2)))
    filt[0, 0] = 0.0
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt))
    return out / (out.std() + 1e-9)


def aniso_noise(rng, h, w, fx_lo, fx_hi, fy_hi):
    """Seamless noise varying fast along x and slowly along y (crepe wrinkles)."""
    white = rng.standard_normal((h, w))
    fy = np.abs(np.fft.fftfreq(h)[:, None] * h)
    fx = np.abs(np.fft.fftfreq(w)[None, :] * w)
    filt = np.exp(-((fx / fx_hi) ** 2)) * (1 - np.exp(-((fx / fx_lo) ** 2))) * np.exp(-((fy / fy_hi) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt))
    return out / (out.std() + 1e-9)


def blur(arr, sigma):
    """Gaussian blur (wraps around the edges, which suits the tiles)."""
    h, w = arr.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    transfer = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(arr) * transfer))


def smooth1d(rng, n, scale, amp):
    """A smooth random curve of n samples (features about `scale` samples long, std amp)."""
    pad = int(scale * 3) + 2
    white = rng.standard_normal(n + 2 * pad)
    sigma = max(scale / 2.5, 0.8)
    xs = np.arange(-int(sigma * 4), int(sigma * 4) + 1)
    kernel = np.exp(-0.5 * (xs / sigma) ** 2)
    curve = np.convolve(white, kernel / kernel.sum(), mode="same")[pad : pad + n]
    return curve / (curve.std() + 1e-12) * amp


def fibres(rng, size, count, length, darkness, bias=0.35, width=1, wrap=True):
    """Thin curved fibres drawn at 2x and filtered down: a float map 0..1 (1 = fibre)."""
    s2 = size * 2
    img = Image.new("F", (s2, s2), 0.0)
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.uniform(0, s2), rng.uniform(0, s2)
        # Paper fibres lie a little along the machine direction (here: horizontal).
        angle = rng.normal(0, 1) * (np.pi * 0.5) * (1 - bias) + (0 if rng.random() < 0.7 else rng.uniform(0, np.pi))
        steps = rng.integers(3, 7)
        seg = rng.uniform(*length) * 2 / steps
        value = float(rng.uniform(*darkness))
        pts = [(x, y)]
        for _ in range(steps):
            angle += rng.normal(0, 0.35)
            x += np.cos(angle) * seg
            y += np.sin(angle) * seg
            pts.append((x, y))
        offsets = [(0, 0)]
        if wrap:
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            ox = [0] + ([-s2] if max(xs) > s2 else []) + ([s2] if min(xs) < 0 else [])
            oy = [0] + ([-s2] if max(ys) > s2 else []) + ([s2] if min(ys) < 0 else [])
            offsets = [(a, b) for a in ox for b in oy]
        for a, b in offsets:
            draw.line([(p[0] + a, p[1] + b) for p in pts], fill=value, width=width)
    arr = blur(np.asarray(img, dtype=np.float64), 0.7)
    return np.asarray(Image.fromarray(arr.astype(np.float32), "F").resize((size, size), Image.LANCZOS), dtype=np.float64)


def specks(rng, size, count, radius, wrap=True):
    """Small soft dots (flecks, dust): float map 0..1."""
    img = Image.new("F", (size, size), 0.0)
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.uniform(0, size), rng.uniform(0, size)
        r = rng.uniform(*radius)
        v = float(rng.uniform(0.4, 1.0))
        for a in (-size, 0, size) if wrap else (0,):
            for b in (-size, 0, size) if wrap else (0,):
                draw.ellipse([x + a - r, y + b - r * rng.uniform(0.6, 1.0), x + a + r, y + b + r], fill=v)
    return blur(np.asarray(img, dtype=np.float64), 0.6)


def save_grey(arr, name, quality=90, dither=0.6, rng=None):
    rng = rng or np.random.default_rng(1)
    a = arr * 255.0 + rng.uniform(-dither, dither, arr.shape)
    img = Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "L")
    path = OUT / name
    img.save(path, quality=quality, optimize=True, progressive=True)
    return path


def save_png(img, name):
    path = OUT / name
    img.save(path, optimize=True)
    return path


# ---------- paper ----------


def paper_fibre(seed=11, size=1024):
    rng = np.random.default_rng(seed)
    mottle = band_noise(rng, size, size, 4, 28, 1.0)  # pulp clouds (formation)
    flock = band_noise(rng, size, size, 30, 140, 0.8)  # finer flocculation
    fine = band_noise(rng, size, size, 200, 480, 0.0)  # surface tooth
    dark = fibres(rng, size, 5200, (6, 26), (0.35, 1.0))
    light = fibres(rng, size, 2600, (5, 18), (0.4, 1.0))
    flecks = specks(rng, size, 26, (0.5, 1.4))
    # Strong enough to read as real paper at 2x and at 250% close up (pulp clouds, fibres).
    v = 0.95 - 0.013 * mottle - 0.009 * flock + 0.008 * fine - 0.075 * dark + 0.035 * light - 0.18 * flecks
    return np.clip(v, 0, 1)


def manila_fibre(seed=12, size=1024):
    rng = np.random.default_rng(seed)
    mottle = band_noise(rng, size, size, 3, 22, 1.2)
    flock = band_noise(rng, size, size, 25, 120, 0.8)
    fine = band_noise(rng, size, size, 160, 420, 0.0)
    dark = fibres(rng, size, 7000, (8, 40), (0.3, 1.0), bias=0.2, width=2)
    light = fibres(rng, size, 3000, (6, 26), (0.3, 1.0), bias=0.2)
    flecks = specks(rng, size, 180, (0.5, 1.8))
    v = 0.935 - 0.009 * mottle - 0.01 * flock + 0.008 * fine - 0.07 * dark + 0.03 * light - 0.2 * flecks
    return np.clip(v, 0, 1)


# ---------- folds ----------


class Sheet:
    """A sheet's surface as a slope field (gx, gy) in pixels of a w x h map."""

    def __init__(self, w, h, seed):
        self.w, self.h = w, h
        self.rng = np.random.default_rng(seed)
        self.y, self.x = np.mgrid[0:h, 0:w].astype(np.float64)
        self.gx = np.zeros((h, w))
        self.gy = np.zeros((h, w))
        self.ridge = np.zeros((h, w))  # crushed fibre right on a fold: a hairline of light

    def waves(self, slope, lo=1.5, hi=6.0):
        """Gentle handling waves: smooth low hills, `slope` their typical steepness."""
        n = max(self.w, self.h)
        hgt = band_noise(self.rng, n, n, lo, hi, 1.6)[: self.h, : self.w]
        gy, gx = np.gradient(hgt)
        k = slope / (np.sqrt((gx * gx + gy * gy).mean()) + 1e-12)
        self.gx += gx * k
        self.gy += gy * k

    def bend(self, u0, v0, u1, v1, slope, width, mountain=True, up=0.26, wobble=1.0, wrinkles=4, start=None, end=None):
        """A fold along the line (u0,v0)-(u1,v1) (map fractions). The paper rises toward a
        mountain fold from both sides (falls toward a valley); the slope is `slope` at the
        line and dies away over `width` px, faster on the lit side (`up` of the width) so the
        crest is thin and the shadow soft. Slightly irregular along its length."""
        w, h = self.w, self.h
        p0 = np.array([u0 * w, v0 * h])
        p1 = np.array([u1 * w, v1 * h])
        d = p1 - p0
        length = np.linalg.norm(d)
        t_hat = d / length
        n_hat = np.array([-t_hat[1], t_hat[0]])
        # Make the normal point down/right-ish (away from the light), so "before" is the lit side.
        if n_hat @ LIGHT[:2] > 0:
            n_hat = -n_hat
        rx = self.x - p0[0]
        ry = self.y - p0[1]
        t = rx * t_hat[0] + ry * t_hat[1]
        s = rx * n_hat[0] + ry * n_hat[1]
        samples = int(length) + 2
        shift = smooth1d(self.rng, samples, 90, 1.6 * wobble) + smooth1d(self.rng, samples, 14, 0.45 * wobble)
        depth = 0.78 + 0.22 * np.clip(smooth1d(self.rng, samples, 160, 1.0), -2, 2) / 2
        ti = np.clip(t, 0, samples - 1).astype(int)
        s = s - shift[ti]
        k = depth[ti]
        # Fade out past the ends of the fold (a fold usually runs off the paper anyway).
        lo_t = 0 if start is None else start * length
        hi_t = length if end is None else end * length
        fade = np.clip((t - lo_t) / 18 + 1, 0, 1) * np.clip((hi_t - t) / 18 + 1, 0, 1)
        w_lit = width * up
        w_dark = width
        sign = 1 if mountain else -1
        prof = np.where(s < 0, np.exp(s / w_lit), -np.exp(-s / w_dark))  # d(height)/ds
        g = sign * slope * k * fade * prof
        self.gx += g * n_hat[0]
        self.gy += g * n_hat[1]
        self.ridge += (0.5 if mountain else -0.35) * k * fade * np.exp(-((s / 0.9) ** 2))
        # Little wrinkles where the fold runs off the edges and here and there along it.
        for _ in range(wrinkles):
            at = self.rng.choice([self.rng.uniform(0.0, 0.08), self.rng.uniform(0.92, 1.0), self.rng.uniform(0.1, 0.9)])
            c = p0 + d * at + n_hat * self.rng.normal(0, 3)
            ang = np.arctan2(t_hat[1], t_hat[0]) + self.rng.choice([-1, 1]) * self.rng.uniform(0.35, 1.1)
            ln = self.rng.uniform(0.02, 0.06) * max(w, h)
            e = c + np.array([np.cos(ang), np.sin(ang)]) * ln
            self.bend(
                c[0] / w,
                c[1] / h,
                e[0] / w,
                e[1] / h,
                slope * self.rng.uniform(0.18, 0.35),
                width * 0.35,
                mountain=self.rng.random() < 0.5,
                wobble=0.5,
                wrinkles=0,
                start=0,
                end=1,
            )

    def crossing(self, u, v, count=7, slope=0.05, width=6):
        """Micro-wrinkles where two folds cross: short creases radiating from the point."""
        c = np.array([u * self.w, v * self.h])
        for _ in range(count):
            ang = self.rng.uniform(0, 2 * np.pi)
            ln = self.rng.uniform(0.015, 0.045) * max(self.w, self.h)
            e = c + np.array([np.cos(ang), np.sin(ang)]) * ln
            self.bend(c[0] / self.w, c[1] / self.h, e[0] / self.w, e[1] / self.h, slope * self.rng.uniform(0.5, 1.1), width, mountain=self.rng.random() < 0.5, wobble=0.4, wrinkles=0, start=0, end=1)

    def crumple(self, slope):
        """Crumpled and flattened again: a network of sharp little creases (the zero lines of
        two octaves of noise, folded) between soft facets."""
        n = max(self.w, self.h)
        hgt = np.zeros((self.h, self.w))
        for lo, hi, weight in [(4, 10, 0.55), (10, 24, 0.5), (24, 52, 0.3)]:
            noise = band_noise(self.rng, n, n, lo, hi, 1.0)[: self.h, : self.w]
            hgt -= weight * np.abs(noise) ** 0.8 / hi
        gy, gx = np.gradient(hgt)
        k = slope / (np.sqrt((gx * gx + gy * gy).mean()) + 1e-12)
        self.gx += gx * k
        self.gy += gy * k

    def lift(self, corner_u, corner_v, reach, slope):
        """A corner lifting off the board: the paper bends up toward it."""
        cx, cy = corner_u * self.w, corner_v * self.h
        r = np.sqrt((self.x - cx) ** 2 + (self.y - cy) ** 2) / (reach * max(self.w, self.h))
        m = np.clip(1 - r, 0, 1) ** 2
        # Height rises toward the corner; slope points away from it.
        ux = (cx - self.x) / (np.sqrt((self.x - cx) ** 2 + (self.y - cy) ** 2) + 1e-6)
        uy = (cy - self.y) / (np.sqrt((self.x - cx) ** 2 + (self.y - cy) ** 2) + 1e-6)
        self.gx += slope * m * ux
        self.gy += slope * m * uy

    def flatten(self, mask):
        """Pressed flat (under tape): mask 1 = flat."""
        self.gx *= 1 - mask
        self.gy *= 1 - mask
        self.ridge *= 1 - mask

    def shade(self, gain=1.0):
        """Grey shading map: 0.5 = flat paper facing the viewer."""
        nx, ny = -self.gx, -self.gy
        norm = np.sqrt(nx * nx + ny * ny + 1)
        lit = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / norm
        rel = lit / LIGHT[2] - 1
        v = 0.5 + 0.5 * gain * rel + 0.05 * self.ridge
        return np.clip(v, 0.12, 0.88)


def crease_map(kind, size, seed):
    sh = Sheet(size, size, seed)
    px = size / 1600  # widths are tuned at 1600 px
    sh.waves(0.018, 1.0, 3.5)
    if kind == "trifold":
        sh.bend(0, 0.335, 1, 0.329, 0.22, 40 * px, mountain=True)
        sh.bend(0, 0.668, 1, 0.674, 0.19, 36 * px, mountain=False)
    elif kind == "half":
        sh.bend(0, 0.497, 1, 0.505, 0.24, 44 * px, mountain=True)
    elif kind == "cross":
        sh.bend(0, 0.498, 1, 0.503, 0.22, 40 * px, mountain=True)
        sh.bend(0.502, 0, 0.497, 1, 0.2, 34 * px, mountain=False)
        sh.crossing(0.5, 0.5, count=8, slope=0.09, width=9 * px)
    elif kind == "corner":
        # The lower right corner was bent over once (a dog-ear) and flattened again.
        sh.bend(0.78, 1, 1, 0.79, 0.24, 30 * px, mountain=False, wrinkles=2)
        sh.lift(1, 1, 0.24, 0.06)
        sh.waves(0.012, 2, 7)
    elif kind == "wave":
        sh.waves(0.05, 1.0, 3.5)
        sh.bend(0.0, 0.62, 1, 0.58, 0.05, 140 * px, mountain=True, wrinkles=0)
    elif kind == "crumple":
        sh.crumple(0.03)
        sh.waves(0.015, 1.2, 4)
    return sh.shade(1.3)


def plate_map(w=1400, h=540, seed=31):
    """The title sheet: taped across the middle of its top and bottom edges."""
    sh = Sheet(w, h, seed)
    u = sh.x / w
    v = sh.y / h
    # Buckles between the tapes: soft vertical bows, strongest halfway down the sheet.
    phase = sh.rng.uniform(0, 2 * np.pi)
    lam = 0.42
    env = 0.45 + 0.55 * np.sin(np.pi * np.clip(v, 0, 1))
    wob = smooth1d(sh.rng, h, 420, 0.012)[sh.y.astype(int)]
    hgt = 13.0 * np.sin(2 * np.pi * (u + wob) / lam + phase) * env * (0.6 + 0.4 * np.cos(np.pi * (u - 0.5)))
    gy, gx = np.gradient(hgt)
    sh.gx += gx
    sh.gy += gy
    sh.waves(0.008, 1.5, 6)
    # One soft fold, from when the sheet came out of a folder.
    sh.bend(0.468, 0, 0.474, 1, 0.2, 36, mountain=False, wrinkles=3)
    # The free corners curl up off the board, the lower ones more.
    sh.lift(0, 1, 0.2, 0.16)
    sh.lift(1, 1, 0.24, 0.2)
    sh.lift(0, 0, 0.12, 0.05)
    sh.lift(1, 0, 0.12, 0.05)
    # Pressed flat under the two strips of tape (top and bottom centre).
    tape = np.clip(1 - np.abs(u - 0.5) / 0.27, 0, 1) ** 0.3
    under = np.clip((0.11 - v) / 0.05, 0, 1) + np.clip((v - 0.89) / 0.05, 0, 1)
    sh.flatten(np.clip(tape * under, 0, 1) * 0.92)
    return sh.shade(2.4)


# ---------- wear ----------


def edge_wear(seed, size=1024):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    e = np.minimum.reduce([x, y, size - 1 - x, size - 1 - y])
    fray = band_noise(rng, size, size, 60, 300, 0.3)
    jag = band_noise(rng, size, size, 8, 40, 1.0)
    w = 5.0 + 2.2 * jag
    band = np.exp(-np.maximum(e, 0) / np.maximum(w, 1.5))
    fibre_edge = np.clip(fray * 0.5 + 0.2, 0, 1) * np.exp(-e / 2.5)
    v = 1 - 0.07 * band - 0.06 * fibre_edge
    # Worn corners.
    for cx, cy in [(0, 0), (size, 0), (0, size), (size, size)]:
        r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        v -= 0.035 * np.exp(-r / (size * rng.uniform(0.03, 0.06)))
    # A few nicks and tiny tears in the edge.
    for _ in range(rng.integers(5, 9)):
        side = rng.integers(4)
        t = rng.uniform(0.08, 0.92) * size
        cx, cy = [(t, 0), (size, t), (t, size), (0, t)][side]
        rr = rng.uniform(3, 9)
        r = np.sqrt((x - cx) ** 2 * rng.uniform(0.4, 1) + (y - cy) ** 2 * rng.uniform(0.4, 1))
        v -= 0.09 * np.exp(-((r / rr) ** 2)) * (0.6 + 0.4 * np.clip(fray, -1, 1))
    # Handling: grime where it was held (thumbs at a lower corner and a side), very faint.
    grime = band_noise(rng, size, size, 2, 9, 1.4)
    held = np.zeros_like(v)
    for _ in range(3):
        cx, cy = rng.choice([0.08, 0.92]) * size, rng.uniform(0.55, 0.95) * size
        held += np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2 * (size * rng.uniform(0.06, 0.1)) ** 2)))
    v -= 0.018 * np.clip(grime * 0.5 + 0.5, 0, 1) * held
    v -= 0.008 * np.clip(grime, 0, 3)
    # Barely there vignette (the sheet's own, not the lamp's).
    rr = np.sqrt(((x / size) - 0.5) ** 2 + ((y / size) - 0.5) ** 2)
    v -= 0.018 * np.clip((rr - 0.35) / 0.35, 0, 1) ** 2
    return np.clip(v, 0, 1)


# ---------- tape ----------


def tape_crepe(seed=41, w=512, h=96):
    rng = np.random.default_rng(seed)
    # Crepe: fine wrinkles running across the strip, wavering, uneven in depth.
    crepe = aniso_noise(rng, h, w, 18, 110, 3.0)
    crepe2 = aniso_noise(rng, h, w, 60, 200, 6.0)
    gx = np.gradient(crepe * 1.0 + crepe2 * 0.4, axis=1)
    shading = gx / (np.abs(gx).std() * 3 + 1e-9)
    fib = fibres(rng, max(w, h), 900, (6, 22), (0.3, 1.0), bias=0.7)[:h, :w]
    lfib = fibres(rng, max(w, h), 500, (4, 14), (0.3, 1.0), bias=0.7)[:h, :w]
    blot = band_noise(rng, h, w, 2, 10, 1.0)
    val = np.clip(shading * 0.55 - fib * 0.5 + lfib * 0.4 + blot * 0.08, -1, 1)
    # Grey + alpha: light where positive, dark where negative, strength in the alpha.
    lum = np.where(val >= 0, 255, 0).astype(np.uint8)
    alpha = np.clip(np.abs(val) * 60, 0, 48)
    alpha = (np.round(alpha / 4) * 4).astype(np.uint8)  # fewer levels: a much smaller file
    return Image.merge("LA", [Image.fromarray(lum, "L"), Image.fromarray(alpha, "L")])


def tape_tear(seed, w=160, h=96, flip=False):
    """Alpha mask of a strip's torn end: a jagged zig-zag edge with a few fibre wisps."""
    rng = np.random.default_rng(seed)
    s = 4
    W, H = w * s, h * s
    img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(img)
    # The tear runs a little aslant, in small uneven teeth, ragged and fuzzy on top of that.
    teeth = int(rng.integers(6, 10))
    ys = np.sort(np.concatenate([[0, H], rng.uniform(0, H, teeth * 2 - 1)]))
    slant = rng.uniform(-0.1, 0.1) * H
    xs = []
    for i, y0 in enumerate(ys):
        depth = rng.uniform(0.02, 0.09) if i % 2 else rng.uniform(0.1, 0.2)
        xs.append(0.16 * H + slant * (y0 / H - 0.5) + (depth - 0.11) * H * 0.9)
    yy = np.arange(H + 1)
    edge = np.interp(yy, ys, xs) + smooth1d(rng, H + 1, 5 * s, 1.0 * s) + rng.normal(0, 0.5 * s, H + 1)
    edge = np.clip(edge, 2 * s, 0.34 * H)
    poly = [(W, 0)] + [(float(edge[i]), float(i)) for i in range(0, H + 1, 2)] + [(W, H)]
    draw.polygon(poly, fill=255)
    # Fibres sticking out of the tear.
    for _ in range(rng.integers(10, 18)):
        i = rng.integers(0, H)
        x0 = edge[i] + 1
        ln = rng.uniform(2, 7) * s
        ang = np.pi + rng.normal(0, 0.5)
        pts = [(x0, i)]
        x, y = x0, float(i)
        for _ in range(3):
            ang += rng.normal(0, 0.4)
            x += np.cos(ang) * ln / 3
            y += np.sin(ang) * ln / 3
            pts.append((x, y))
        draw.line(pts, fill=int(rng.uniform(90, 200)), width=max(1, int(s * rng.uniform(0.5, 1.1))))
    img = img.filter(ImageFilter.GaussianBlur(s * 0.35)).resize((w, h), Image.LANCZOS)
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    white = Image.new("L", (w, h), 255)
    return Image.merge("LA", [white, img])


def ink_mottle(seed=51, size=256):
    """Uneven stamp ink: mostly solid, thinner in blotches, a few voids."""
    rng = np.random.default_rng(seed)
    a = band_noise(rng, size, size, 4, 30, 1.0)
    b = band_noise(rng, size, size, 40, 120, 0.5)
    v = 0.88 + 0.1 * a + 0.06 * b
    v = np.where(a + 0.6 * b < -1.7, v * 0.35, v)
    alpha = (np.round(np.clip(v, 0, 1) * 15) * 17).astype(np.uint8)  # 16 levels: a small file
    return Image.merge("LA", [Image.new("L", (size, size), 0), Image.fromarray(alpha, "L")])


def print_luster(seed=61, size=512):
    rng = np.random.default_rng(seed)
    pebble = band_noise(rng, size, size, 70, 220, 0.4)
    gy, gx = np.gradient(pebble)
    lit = -(gx * LIGHT[0] + gy * LIGHT[1])
    lit = lit / (lit.std() + 1e-9)
    return np.clip(0.5 + 0.035 * lit + 0.01 * band_noise(rng, size, size, 2, 8, 1.0), 0, 1)


def leatherette(seed=71, size=512):
    """Pebbled leatherette: rounded grains (cellular noise), lit from the top left."""
    rng = np.random.default_rng(seed)
    n = 2600
    pts = rng.uniform(0, size, (n, 2))
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    best = np.full((size, size), np.inf)
    second = np.full((size, size), np.inf)
    # Grid-accelerated nearest-two search on a torus.
    cell = 16
    grid = {}
    for i, (px, py) in enumerate(pts):
        grid.setdefault((int(px // cell), int(py // cell)), []).append(i)
    g = size // cell
    for gyi in range(g):
        for gxi in range(g):
            ys0, xs0 = gyi * cell, gxi * cell
            sub_y = y[ys0 : ys0 + cell, xs0 : xs0 + cell]
            sub_x = x[ys0 : ys0 + cell, xs0 : xs0 + cell]
            b1 = np.full(sub_x.shape, np.inf)
            b2 = np.full(sub_x.shape, np.inf)
            for dy in (-2, -1, 0, 1, 2):
                for dx in (-2, -1, 0, 1, 2):
                    kx, ky = (gxi + dx) % g, (gyi + dy) % g
                    for i in grid.get((kx, ky), []):
                        px, py = pts[i]
                        ddx = np.abs(sub_x - px)
                        ddx = np.minimum(ddx, size - ddx)
                        ddy = np.abs(sub_y - py)
                        ddy = np.minimum(ddy, size - ddy)
                        dd = ddx * ddx + ddy * ddy
                        closer = dd < b1
                        b2 = np.where(closer, b1, np.minimum(b2, dd))
                        b1 = np.where(closer, dd, b1)
            best[ys0 : ys0 + cell, xs0 : xs0 + cell] = b1
            second[ys0 : ys0 + cell, xs0 : xs0 + cell] = b2
    f1, f2 = np.sqrt(best), np.sqrt(second)
    hgt = np.clip((f2 - f1) / 6.0, 0, 1) ** 0.5  # high in the grains, low in the channels
    hgt = blur(hgt, 1.4)
    gy, gx = np.gradient(hgt * 3.0)
    lit = (gx * LIGHT[0] + gy * LIGHT[1]) * -1
    v = 0.5 + 0.16 * lit + 0.05 * (hgt - hgt.mean()) + 0.02 * band_noise(rng, size, size, 2, 10, 1.0)
    return np.clip(v, 0, 1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    made.append(save_grey(paper_fibre(), "paper-fibre.jpg", quality=86))
    made.append(save_grey(manila_fibre(), "manila-fibre.jpg", quality=84))
    for i, kind in enumerate(["trifold", "half", "cross", "corner", "wave", "crumple"]):
        big = crease_map(kind, 1600, 100 + i)
        made.append(save_grey(big, f"crease-{kind}.jpg", quality=88))
        small = np.asarray(Image.fromarray((big * 255).astype(np.float32), "F").resize((512, 512), Image.LANCZOS)) / 255
        made.append(save_grey(small, f"crease-{kind}-sm.jpg", quality=88))
    made.append(save_grey(plate_map(), "crease-plate.jpg", quality=88))
    made.append(save_grey(edge_wear(21), "paper-edge-a.jpg", quality=85))
    made.append(save_grey(edge_wear(22), "paper-edge-b.jpg", quality=85))
    made.append(save_png(tape_crepe(), "tape-crepe.png"))
    made.append(save_png(tape_tear(81), "tape-tear-l.png"))
    made.append(save_png(tape_tear(82, flip=True), "tape-tear-r.png"))
    made.append(save_png(ink_mottle(), "ink-mottle.png"))
    made.append(save_grey(print_luster(), "print-luster.jpg", quality=86))
    made.append(save_grey(leatherette(), "leatherette.jpg", quality=86))
    total = 0
    for path in made:
        size = path.stat().st_size
        total += size
        print(f"{path.relative_to(ROOT)}  {size / 1024:.0f} KB")
    print(f"total {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()

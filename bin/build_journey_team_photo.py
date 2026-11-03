# Draws the black eye bars over everyone but Jiatuo (far right) in the FRC Team 744 photo. The source is the
# owner's own photo, which is never in the repository. Usage: python bin/build_journey_team_photo.py SRC OUT PREVIEW
import sys, math
from PIL import Image, ImageDraw
src, out, preview = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert("RGB")
W, H = im.size
# face ellipses (centre x, centre y, rx, ry) in source pixels, from the content agent; tilt in degrees
faces = [
    (202, 345, 105, 92, -4, -0.24),
    (515, 428, 78, 82, 0, -0.26),
    (745, 412, 72, 80, 0, -0.40),
    (948, 348, 66, 74, 0, -0.50),
    (1052, 345, 54, 52, 0, -0.28),
    (1188, 352, 74, 76, 0, -0.33),
]
eye_dy = float(sys.argv[4]) if len(sys.argv) > 4 else -0.22
layer = Image.new("L", im.size, 0)
d = ImageDraw.Draw(layer)
for cx, cy, rx, ry, tilt, dy in faces:
    ey = cy + dy * ry
    hw, hh = rx * 1.3, ry * 0.32
    pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    a = math.radians(tilt)
    poly = [(cx + x * math.cos(a) - y * math.sin(a), ey + x * math.sin(a) + y * math.cos(a)) for x, y in pts]
    d.polygon(poly, fill=255)
black = Image.new("RGB", im.size, (8, 8, 8))
im = Image.composite(black, im, layer)
im = im.resize((1600, round(1600 * H / W)), Image.LANCZOS)
im.save(out, "JPEG", quality=86, progressive=True, optimize=True)
im.resize((800, round(800 * H / W))).save(preview)
print(im.size)

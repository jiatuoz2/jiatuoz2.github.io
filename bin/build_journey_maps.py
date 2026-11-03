#!/usr/bin/env python3
"""Build the street-map backgrounds of the "My Journey" detective boards.

For every stop in _data/journey.yml this fetches the streets, water, parks and railways
within a few kilometres of the stop's lat/lon from OpenStreetMap (Overpass API, one query
per stop), projects them to a square local frame, simplifies them, and writes
assets/img/journey/maps/<stop-id>.svg: pale line art on a transparent background that the
board (_sass/_journey-board.scss) lays over its slate.

Map data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
Each board credits it; see assets/img/journey/maps/CREDITS.md.

Usage:
    python bin/build_journey_maps.py                 # every stop
    python bin/build_journey_maps.py new-york        # some stops
    python bin/build_journey_maps.py --cache DIR     # keep / reuse the raw Overpass replies

Needs PyYAML and requests (requirements.txt has both).
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "_data" / "journey.yml"
OUT = ROOT / "assets" / "img" / "journey" / "maps"
OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "jiatuoz2.github.io journey-map builder (https://github.com/jiatuoz2/jiatuoz2.github.io)"

SIZE = 1000  # the SVG's viewBox is SIZE x SIZE
HALF_KM = 2.6  # the map covers 2 * HALF_KM kilometres square around the stop
MAX_BYTES = 120_000

MAJOR = {"motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link"}
MIDDLE = {"tertiary", "secondary_link", "tertiary_link"}
MINOR = {"residential", "unclassified", "living_street"}

# Line styles, drawn in this order (bottom to top). Pale blue-grey on the dark slate.
LAYERS = [
    ("park", 'fill="none" stroke="#b9d0c0" stroke-opacity=".16" stroke-width="1.2" stroke-dasharray="4 3"'),
    ("water", 'fill="none" stroke="#9ec4e4" stroke-opacity=".34" stroke-width="1.8"'),
    ("river", 'fill="none" stroke="#9ec4e4" stroke-opacity=".3" stroke-width="2.4"'),
    ("rail", 'fill="none" stroke="#c8d4df" stroke-opacity=".22" stroke-width="1.2" stroke-dasharray="7 3"'),
    ("minor", 'fill="none" stroke="#c4d4e2" stroke-opacity=".15" stroke-width="1"'),
    ("middle", 'fill="none" stroke="#c4d4e2" stroke-opacity=".24" stroke-width="1.5"'),
    ("major", 'fill="none" stroke="#d4e0ea" stroke-opacity=".34" stroke-width="2.6"'),
]


def query(south, west, north, east):
    box = f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}"
    roads = "|".join(sorted(MAJOR | MIDDLE | MINOR))
    return f"""[out:json][timeout:120];
(
  way["highway"~"^({roads})$"]({box});
  way["natural"="coastline"]({box});
  way["natural"="water"]({box});
  relation["natural"="water"]({box});
  way["waterway"~"^(river|canal|riverbank)$"]({box});
  way["leisure"="park"]({box});
  way["railway"="rail"]["service"!~"."]({box});
);
out geom({box}) qt;"""


def fetch(stop, half_km, cache):
    lat, lon = float(stop["lat"]), float(stop["lon"])
    dlat = half_km / 110.574
    dlon = half_km / (111.320 * math.cos(math.radians(lat)))
    cached = cache / f"{stop['id']}.json" if cache else None
    if cached and cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    body = query(lat - dlat, lon - dlon, lat + dlat, lon + dlon)
    for attempt in range(3):
        reply = requests.post(OVERPASS, data={"data": body}, headers={"User-Agent": USER_AGENT}, timeout=180)
        if reply.status_code == 200:
            break
        print(f"  overpass {reply.status_code}, retrying", file=sys.stderr)
        time.sleep(20 * (attempt + 1))
    reply.raise_for_status()
    data = reply.json()
    if cached:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(data), encoding="utf-8")
    return data


def layer_of(tags):
    highway = tags.get("highway")
    if highway in MAJOR:
        return "major"
    if highway in MIDDLE:
        return "middle"
    if highway in MINOR:
        return "minor"
    if tags.get("railway") == "rail":
        return "rail"
    if tags.get("waterway") in ("river", "canal"):
        return "river"
    if tags.get("natural") in ("coastline", "water") or tags.get("waterway") == "riverbank":
        return "water"
    if tags.get("leisure") == "park":
        return "park"
    return None


def simplify(points, tolerance):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        worst, index = 0.0, None
        for i in range(first + 1, last):
            px, py = points[i]
            distance = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if distance > worst:
                worst, index = distance, i
        if index is not None and worst > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [p for p, k in zip(points, keep) if k]


def lines_of(data, stop, half_km):
    lat0, lon0 = float(stop["lat"]), float(stop["lon"])
    kx = 111.320 * math.cos(math.radians(lat0)) * SIZE / (2 * half_km)
    ky = 110.574 * SIZE / (2 * half_km)
    project = lambda lat, lon: ((lon - lon0) * kx + SIZE / 2, (lat0 - lat) * ky + SIZE / 2)
    lines = {name: [] for name, _ in LAYERS}
    for element in data.get("elements", []):
        layer = layer_of(element.get("tags", {}))
        if not layer:
            continue
        ways = [element.get("geometry")] if element["type"] == "way" else [m.get("geometry") for m in element.get("members", [])]
        for geometry in ways:
            # out geom(bbox) leaves None for nodes outside the box: split the way there.
            run = []
            for node in (geometry or []) + [None]:
                if node:
                    run.append(project(node["lat"], node["lon"]))
                elif len(run) > 1:
                    lines[layer].append(run)
                    run = []
                else:
                    run = []
    return lines


def path_data(lines, tolerance, shortest):
    parts = []
    for line in lines:
        line = simplify(line, tolerance)
        length = sum(math.dist(a, b) for a, b in zip(line, line[1:]))
        if length < shortest:
            continue
        points = [(round(x), round(y)) for x, y in line]
        steps = [f"M{points[0][0]} {points[0][1]}"]
        rel = []
        for (ax, ay), (bx, by) in zip(points, points[1:]):
            if (ax, ay) != (bx, by):
                rel.append(f"{bx - ax} {by - ay}".replace(" -", "-"))
        if not rel:
            continue
        parts.append(steps[0] + "l" + " ".join(rel).replace(" -", "-"))
    return "".join(parts)


def dms(value, positive, negative):
    total = round(abs(value) * 60)
    return f"{total // 60}°{total % 60:02d}′{positive if value >= 0 else negative}"


def build(stop, data, half_km):
    lines = lines_of(data, stop, half_km)
    # Coarser lines and fewer short streets until the file is small enough.
    for tolerance, shortest in [(0.8, 6), (1.2, 10), (1.6, 16), (2.2, 24), (3, 34), (4, 50)]:
        paths = []
        for name, style in LAYERS:
            limit = shortest if name == "minor" else shortest / 3
            d = path_data(lines[name], tolerance, limit)
            if d:
                paths.append(f'<path class="{name}" {style} stroke-linecap="round" stroke-linejoin="round" d="{d}"/>')
        svg = render(stop, half_km, paths)
        if len(svg.encode("utf-8")) <= MAX_BYTES:
            break
    return svg


def render(stop, half_km, paths):
    # A 1 km scale bar and the coordinates, low on the left, inside what a 4:3 or 3:4
    # board shows of the square.
    km = SIZE / (2 * half_km)
    x, y = 150, 838
    label = f'{dms(float(stop["lat"]), "N", "S")}  {dms(float(stop["lon"]), "E", "W")}'
    scale = (
        f'<g fill="none" stroke="#dfe7ee" stroke-opacity=".5" stroke-width="2">'
        f'<path d="M{x} {y - 6}v6h{km:.0f}v-6M{x + km / 2:.0f} {y}v-4"/></g>'
        f'<g fill="#dfe7ee" fill-opacity=".55" font-family="Courier New,Courier,monospace" font-size="15" letter-spacing="1">'
        f'<text x="{x + km + 10:.0f}" y="{y + 1}">1 km</text><text x="{x}" y="{y + 24}">{label}</text></g>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" width="{SIZE}" height="{SIZE}">'
        f"<!-- {stop['name']}: map data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright -->"
        + "".join(paths)
        + scale
        + "</svg>\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("stops", nargs="*", help="stop ids (default: all)")
    parser.add_argument("--cache", type=Path, help="directory to keep the raw Overpass replies in")
    parser.add_argument("--half-km", type=float, default=HALF_KM)
    args = parser.parse_args()
    stops = yaml.safe_load(DATA.read_text(encoding="utf-8"))["stops"]
    chosen = [stop for stop in stops if not args.stops or stop["id"] in args.stops]
    OUT.mkdir(parents=True, exist_ok=True)
    for index, stop in enumerate(chosen):
        if index and not (args.cache and (args.cache / f"{stop['id']}.json").exists()):
            time.sleep(8)  # be polite to the public Overpass server
        print(f"{stop['id']}: fetching", file=sys.stderr)
        data = fetch(stop, args.half_km, args.cache)
        svg = build(stop, data, args.half_km)
        target = OUT / f"{stop['id']}.svg"
        target.write_text(svg, encoding="utf-8")
        print(f"{stop['id']}: {len(data.get('elements', []))} features -> {target.relative_to(ROOT)} ({len(svg.encode('utf-8')) // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()

# Board street maps

The faint street maps drawn on the "My Journey" detective boards (one per stop, `<stop-id>.svg`) are built from
[OpenStreetMap](https://www.openstreetmap.org/) data, © OpenStreetMap contributors, available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See
[openstreetmap.org/copyright](https://www.openstreetmap.org/copyright). Each board shows the credit
"map data © OpenStreetMap contributors" with that link (`_includes/journey.html`), and each SVG carries it in a comment.

How they are made: `python bin/build_journey_maps.py` sends one query per stop to the Overpass API
(`https://overpass-api.de/api/interpreter`) for roads (motorway to residential), coastlines, water, rivers and canals,
parks and railways within 2.6 km of the stop's `lat`/`lon` in `_data/journey.yml`, projects them to a local
equirectangular frame (1000 × 1000, about 5.2 km square), simplifies the lines (Douglas–Peucker), rounds them to whole
units, and writes pale line art on a transparent background, with a 1 km scale bar and the stop's coordinates. Built
November 2026.

| File                  | Area                                     |
| --------------------- | ---------------------------------------- |
| `hangzhou-early.svg`  | Daguan, Gongshu District, Hangzhou       |
| `fort-lauderdale.svg` | Fort Lauderdale, Florida                 |
| `champaign.svg`       | Champaign–Urbana, Illinois               |
| `hangzhou.svg`        | Xiasha, Hangzhou (Hangzhou Dianzi Univ.) |
| `new-york.svg`        | Morningside Heights, Manhattan           |
| `evanston.svg`        | Evanston, Illinois                       |

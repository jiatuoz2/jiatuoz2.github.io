/* "My Journey" map: a MapLibre GL globe of the real Earth as it is lit right now, which, as you
   zoom in, grows to fill the frame and flattens into a detailed map (the Google Earth model).

   window.JourneyMap.mount(figure, stops, { onSelect, onFail, loadNear, time }) returns
   { select(id, { animate, overview }), reset({ animate }), isAnimating(), map, destroy(),
     now(), setTime(time), getTime(), getSun(), getMode(), load(), setShown(shown), resize(),
     setWindowed(windowed) }
   and also sets figure.journeyMap. onSelect(id) fires only when a pin is chosen on the map;
   select() is the controller's way in (timeline tabs, #journey-<id> links) and never calls back.
   onFail() fires once if the map cannot start after mount() returned it (the figure is hidden
   again). loadNear is the element whose approach to the viewport starts loading (default:
   the figure); load() starts it at once.

   Daylight: the sun's position is worked out from the clock (the low-precision formulas of
   the Astronomical Almanac, good to about 0.01 degree). A custom WebGL layer lays night over
   the map with a graded twilight band and NASA's night lights, and the globe's atmosphere is
   lit from the same direction. The reference point is the current stop: the first and reset
   views face it, and a readout gives its local time and whether the sun is up there. The
   lighting always follows the real clock: the sun moves on every few seconds (15 degrees of
   longitude an hour), while the camera stays wherever the visitor left it; nothing turns on
   its own. Test hook: ?journey-time=<ISO time> (or data-journey-time on the figure, or the
   time option, or setTime()) holds the clock at that moment; now() returns to the real time.

   Pane: the figure fills the Map pane of the section's split view ([data-journey-pane="map"],
   run by journey.js), beside the board and always on screen with it, at one fixed size. The
   page keeps scrolling over the map (cooperative gestures: Ctrl/Cmd + scroll or a pinch zooms
   it, two fingers move it on a phone), and Ctrl/Cmd + scroll anywhere over the pane never
   zooms the page, even before the library arrives. "Expand map" (journey.js) moves the figure
   into a modal window and back, calling setWindowed(true | false) and resize(): in the window
   a plain scroll or a one-finger drag works the map directly. Whenever the frame changes size
   resize() fits the canvas, and while the camera still shows the whole globe the globe is
   refitted to the frame, so it never stretches or overflows.
   setShown(false) makes select() jump instead of fly (no sound, no animation nobody sees).

   Loading: the figure (_includes/journey-map.html) is unhidden only when WebGL is available.
   The library (assets/vendor/maplibre-gl, v5) and every tile load when loadNear nears the
   viewport or load() is called; select() calls made before then are queued. If the library
   cannot start, the figure is hidden again, onFail() runs, and the timeline carries on alone.

   Sources (all named, always, in the map's compact attribution control (ATTRIBUTION), folded
   behind its (i) button until it is pressed, in the pane and the map window):
   - NASA Blue Marble (day) imagery from NASA GIBS, public domain. Zoom levels 0-2 are bundled
     in assets/data/journey-map/ so the globe still paints when the tile hosts are unreachable;
     GIBS serves zoom 3-8.
   - NASA Black Marble 2016 night lights, public domain: a 2048 x 1024 world image is bundled
     (assets/data/journey-map/night-lights.jpg); closer in, a sharper image of the view is
     fetched from the GIBS WMS. Without it the bundled image is stretched.
   - OpenStreetMap vector tiles from OpenFreeMap (no key; ODbL data, OpenMapTiles schema) for
     coastlines, water, land cover, roads, borders and labels, styled below.
   - Terrain hillshade from the AWS Terrain Tiles open dataset (Mapzen/Tilezen, USGS, NOAA).
   Sounds (window.JourneySound, optional) play only in answer to the visitor. */
(() => {
  const OPENFREEMAP = "https://tiles.openfreemap.org";
  const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
  const TERRAIN = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";
  // The map's sources, listed in full by the attribution control's (i) button.
  const ATTRIBUTION = [
    'Imagery: <a href="https://www.earthdata.nasa.gov/gibs" rel="noopener">NASA GIBS</a> (Blue Marble, Black Marble)',
    'Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>',
    'Tiles: <a href="https://openfreemap.org" rel="noopener">OpenFreeMap</a>, <a href="https://www.openmaptiles.org/" rel="noopener">© OpenMapTiles</a>',
    'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" rel="noopener">Mapzen, USGS, NOAA</a>',
  ];
  const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

  // Zooms: where the cartographic map takes over from imagery, and how close a pin flies.
  const DETAIL_ZOOM = 10;
  const OFFLINE_ZOOM = 3.4;
  const MAX_ZOOM = 16;
  const BASE_FADE = [7.7, 8.6];
  // Pins closer than this (CSS px) share one cluster pin.
  const CLUSTER_PX = 26;
  // The live sun moves on every 10 s of the wall clock: about 0.04 degree, too small a step
  // to see, and on the minute marks so the readout's minute turns on time.
  const LIVE_STEP_MS = 10000;
  const HOUR = 3600 * 1000;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
  const sound = (name) => {
    try {
      if (window.JourneySound) window.JourneySound.play(name);
    } catch (error) {
      /* sound is optional */
    }
  };

  /* Colors. The cartographic layers that fade in from BASE_FADE have two palettes: light
     where the sun is up at the centre of the view, dark where it has set. */
  const PALETTES = {
    light: {
      land: "#f3f0e8",
      residential: "#ebe6dc",
      wood: "#cfe0bf",
      grass: "#dceacd",
      wetland: "#d6e6d6",
      sand: "#f1e7c9",
      ice: "#f6f9fb",
      park: "#cfe5bd",
      water: "#9ecbe9",
      waterLine: "#8bbde2",
      waterLabel: "#2f6690",
      building: "#e2ddd3",
      buildingLine: "#d4cec2",
      roadCase: "#ddd6c8",
      road: "#ffffff",
      major: "#ffffff",
      majorCase: "#cfc6b4",
      motorway: "#fbdc9b",
      motorwayCase: "#d9ad5f",
      rail: "#b9b2a6",
      border: "#8b7fa3",
      state: "#a59fb8",
      label: "#1f2933",
      labelHalo: "#ffffff",
      minorLabel: "#4a5562",
      hillShadow: "#4b3f2f",
      hillHighlight: "#ffffff",
      hillAccent: "#6b5d48",
      route: "#e8452c",
      routeCase: "#3a0d06",
      routeGlow: "#ff8a4c",
      flow: "#fff6e8",
    },
    // Night: streets glow sodium-amber, as they do from the air.
    dark: {
      land: "#18212c",
      residential: "#1d2733",
      wood: "#17271f",
      grass: "#1a2a22",
      wetland: "#172a28",
      sand: "#28261f",
      ice: "#26303b",
      park: "#182b20",
      water: "#0b1726",
      waterLine: "#13304b",
      waterLabel: "#7ea6c9",
      building: "#222c38",
      buildingLine: "#2b3746",
      roadCase: "#0f151d",
      road: "#4d4334",
      major: "#80653d",
      majorCase: "#14110c",
      motorway: "#b98744",
      motorwayCase: "#22180b",
      rail: "#3b4552",
      border: "#9d93b8",
      state: "#6f6a86",
      label: "#e3e9f0",
      labelHalo: "#0b1118",
      minorLabel: "#aab6c3",
      hillShadow: "#000000",
      hillHighlight: "#5d6b7a",
      hillAccent: "#0d1218",
      route: "#ffc46b",
      routeCase: "#000000",
      routeGlow: "#ff9a3c",
      flow: "#fff3d6",
    },
  };

  /* ---------- geometry ---------- */
  const RAD = Math.PI / 180;
  const toVec = ([lon, lat]) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  const toLonLat = ([x, y, z]) => [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(toVec(a), toVec(b)))));

  // Points along the great circle from a to b, about one per degree, with longitudes
  // unwrapped so a leg over the antimeridian stays one continuous line.
  const greatCircle = (a, b) => {
    const va = toVec(a);
    const vb = toVec(b);
    const omega = Math.acos(Math.max(-1, Math.min(1, dot(va, vb))));
    const steps = Math.max(2, Math.ceil(omega / RAD));
    const points = [];
    let previous = null;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      let point;
      if (omega < 1e-9) point = [...a];
      else {
        const ka = Math.sin((1 - t) * omega) / Math.sin(omega);
        const kb = Math.sin(t * omega) / Math.sin(omega);
        point = toLonLat([ka * va[0] + kb * vb[0], ka * va[1] + kb * vb[1], ka * va[2] + kb * vb[2]]);
      }
      if (previous) {
        while (point[0] - previous[0] > 180) point[0] -= 360;
        while (point[0] - previous[0] < -180) point[0] += 360;
      }
      points.push(point);
      previous = point;
    }
    return points;
  };

  const wrap180 = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

  /* ---------- the sun ----------
     The subsolar point (where the sun is overhead) at a time in ms, from the Astronomical
     Almanac's low-precision solar coordinates and the Greenwich mean sidereal time. */
  const subsolarPoint = (time) => {
    const n = time / 86400000 + 2440587.5 - 2451545.0; // days since J2000.0
    const meanLongitude = 280.46 + 0.9856474 * n;
    const anomaly = (357.528 + 0.9856003 * n) * RAD;
    const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
    const obliquity = (23.439 - 0.0000004 * n) * RAD;
    const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)) / RAD;
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)) / RAD;
    const sidereal = 280.46061837 + 360.98564736629 * n;
    return { lon: wrap180(rightAscension - sidereal), lat: declination };
  };
  // The sun's altitude in degrees at a place.
  const sunAltitude = (lngLat, sun) => Math.asin(Math.max(-1, Math.min(1, dot(toVec(lngLat), toVec([sun.lon, sun.lat]))))) / RAD;

  /* ---------- library loading (once per page) ---------- */
  let libraryPromise = null;
  const loadLibrary = (scriptUrl, styleUrl) => {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (libraryPromise) return libraryPromise;
    const css = new Promise((resolve) => {
      if (!styleUrl) return resolve();
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = styleUrl;
      link.addEventListener("load", resolve, { once: true });
      // A missing stylesheet only costs the attribution styling; the map still works.
      link.addEventListener("error", resolve, { once: true });
      document.head.appendChild(link);
    });
    const script = new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = scriptUrl;
      element.async = true;
      element.addEventListener("load", () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre did not start"))), {
        once: true,
      });
      element.addEventListener("error", () => reject(new Error("MapLibre could not load")), { once: true });
      document.head.appendChild(element);
    });
    libraryPromise = Promise.all([script, css]).then(([library]) => library);
    libraryPromise.catch(() => {
      libraryPromise = null;
    });
    return libraryPromise;
  };

  const webglAvailable = () => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch (error) {
      return false;
    }
  };

  /* ---------- style ---------- */
  const fade = (to = 1) => ["interpolate", ["linear"], ["zoom"], BASE_FADE[0], 0, BASE_FADE[1], to];
  // Over imagery, labels and borders are light on a dark halo; on the drawn map they follow the palette.
  // A step, not a blend: half-way colors are illegible on the half-faded map.
  const overImagery = (imageryValue, mapValue) => ["step", ["zoom"], imageryValue, (BASE_FADE[0] + BASE_FADE[1]) / 2, mapValue];
  // Only names written in Latin script, for an English page (name_en falls back to the local name).
  const LATIN = ["any", ["has", "name:en"], ["has", "name:latin"]];
  const NAME = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
  const roadWidth = (base) => ["interpolate", ["exponential", 1.5], ["zoom"], 7, base * 0.35, 10, base, 13, base * 2.6, 16, base * 7];

  // [name, OpenMapTiles classes, first zoom, width at zoom 10]
  const ROADS = [
    ["minor", ["minor", "service", "tertiary"], 10.5, 1.1],
    ["major", ["primary", "secondary", "trunk"], 7.5, 1.6],
    ["motorway", ["motorway"], 6.5, 2],
  ];

  // Paint and layout for every layer the theme touches; static settings live in buildLayers.
  const themedLayers = (p) => ({
    "base-land": { paint: { "background-color": p.land } },
    "base-landcover": {
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          ["wood", "forest"],
          p.wood,
          ["grass", "scrub"],
          p.grass,
          "wetland",
          p.wetland,
          "sand",
          p.sand,
          ["ice", "glacier"],
          p.ice,
          p.grass,
        ],
      },
    },
    "base-residential": { paint: { "fill-color": p.residential } },
    "base-park": { paint: { "fill-color": p.park } },
    "base-hillshade": {
      paint: {
        "hillshade-shadow-color": p.hillShadow,
        "hillshade-highlight-color": p.hillHighlight,
        "hillshade-accent-color": p.hillAccent,
      },
    },
    "base-water": { paint: { "fill-color": p.water } },
    "base-waterway": { paint: { "line-color": p.waterLine } },
    "base-building": { paint: { "fill-color": p.building, "fill-outline-color": p.buildingLine } },
    "road-minor-case": { paint: { "line-color": p.roadCase } },
    "road-major-case": { paint: { "line-color": p.majorCase } },
    "road-motorway-case": { paint: { "line-color": p.motorwayCase } },
    "road-minor": { paint: { "line-color": p.road } },
    "road-major": { paint: { "line-color": p.major } },
    "road-motorway": { paint: { "line-color": p.motorway } },
    "road-rail": { paint: { "line-color": p.rail } },
    // Over the imagery borders and labels are faint, so day and night lead; the route glows gold.
    "border-state": { paint: { "line-color": overImagery("rgba(255,255,255,0.16)", p.state) } },
    "border-country": { paint: { "line-color": overImagery("rgba(255,255,255,0.3)", p.border) } },
    "route-glow": { paint: { "line-color": overImagery("#ff9d3a", p.routeGlow) } },
    "route-case": { paint: { "line-color": overImagery("#1a0b00", p.routeCase) } },
    route: { paint: { "line-color": overImagery(["case", ["==", ["get", "age"], 0], "#fff1d2", "#ffc66e"], p.route) } },
    "route-flow": { paint: { "line-color": overImagery("#ffffff", p.flow) } },
    "label-water": {
      paint: { "text-color": overImagery("rgba(175,210,245,0.5)", p.waterLabel), "text-halo-color": overImagery("rgba(0,10,30,0.35)", p.labelHalo) },
    },
    "label-road": { paint: { "text-color": p.minorLabel, "text-halo-color": p.labelHalo } },
    "label-minor": {
      paint: { "text-color": overImagery("rgba(255,255,255,0.8)", p.minorLabel), "text-halo-color": overImagery("rgba(0,0,0,0.6)", p.labelHalo) },
    },
    "label-city": {
      paint: { "text-color": overImagery("rgba(255,255,255,0.85)", p.label), "text-halo-color": overImagery("rgba(0,0,0,0.65)", p.labelHalo) },
    },
    "label-state": {
      paint: { "text-color": overImagery("rgba(255,255,255,0.45)", p.minorLabel), "text-halo-color": overImagery("rgba(0,0,0,0.4)", p.labelHalo) },
    },
    "label-country": {
      paint: { "text-color": overImagery("rgba(255,255,255,0.6)", p.label), "text-halo-color": overImagery("rgba(0,0,0,0.45)", p.labelHalo) },
    },
  });

  // Blue Marble, given more depth: deeper oceans, richer land.
  const BRIGHTEN = { "raster-contrast": 0.16, "raster-saturation": 0.24 };

  const buildLayers = () => [
    // Imagery: the bundled zoom 0-2 tiles underneath, NASA GIBS on top from zoom 3. Night is
    // laid over it by the daylight layer.
    { id: "imagery-day", type: "raster", source: "blue-marble", paint: { "raster-fade-duration": 0, ...BRIGHTEN } },
    { id: "imagery-day-remote", type: "raster", source: "blue-marble-remote", paint: { "raster-fade-duration": 150, ...BRIGHTEN } },
    // The drawn map fades in over the imagery once its detail runs out. It stays hidden
    // until a vector tile arrives, so blocked tiles leave the imagery showing instead.
    { id: "base-land", type: "background", minzoom: BASE_FADE[0], paint: { "background-opacity": fade() } },
    {
      id: "base-landcover",
      type: "fill",
      source: "omt",
      "source-layer": "landcover",
      minzoom: BASE_FADE[0],
      // Farmland stays plain land, as on most road maps; it would tint whole states.
      filter: ["match", ["get", "class"], ["wood", "forest", "grass", "scrub", "wetland", "sand", "ice", "glacier"], true, false],
      paint: { "fill-opacity": fade(0.85), "fill-antialias": false },
    },
    {
      id: "base-residential",
      type: "fill",
      source: "omt",
      "source-layer": "landuse",
      minzoom: 8,
      filter: ["match", ["get", "class"], ["residential", "suburb", "neighbourhood", "commercial", "industrial", "retail"], true, false],
      paint: { "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 9, 0.9] },
    },
    {
      id: "base-park",
      type: "fill",
      source: "omt",
      "source-layer": "park",
      minzoom: BASE_FADE[0],
      paint: { "fill-opacity": fade(0.9) },
    },
    {
      id: "base-hillshade",
      type: "hillshade",
      source: "terrain",
      minzoom: BASE_FADE[0],
      paint: { "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], BASE_FADE[0], 0, BASE_FADE[1], 0.32, 12, 0.22] },
    },
    { id: "base-water", type: "fill", source: "omt", "source-layer": "water", minzoom: BASE_FADE[0], paint: { "fill-opacity": fade() } },
    {
      id: "base-waterway",
      type: "line",
      source: "omt",
      "source-layer": "waterway",
      minzoom: 8,
      filter: ["match", ["get", "class"], ["river", "canal"], true, false],
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 3],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 9, 1],
      },
    },
    {
      id: "base-building",
      type: "fill",
      source: "omt",
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.9] },
    },
    // Roads: every casing first, then the fills, from minor to motorway.
    ...[true, false].flatMap((casing) =>
      ROADS.map(([name, classes, minzoom, width]) => ({
        id: casing ? `road-${name}-case` : `road-${name}`,
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom,
        filter: ["all", ["match", ["get", "class"], classes, true, false], ["!=", ["get", "brunnel"], "tunnel"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": roadWidth(casing ? width + 0.9 : width),
          "line-opacity": ["interpolate", ["linear"], ["zoom"], minzoom, 0, minzoom + 1, 1],
        },
      }))
    ),
    {
      id: "road-rail",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["all", ["==", ["get", "class"], "rail"], ["!=", ["get", "brunnel"], "tunnel"]],
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 2], "line-dasharray": [3, 2] },
    },
    // Borders: states from zoom 3, countries always; no maritime lines.
    {
      id: "border-state",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      minzoom: 3,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      layout: { "line-join": "round" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 10, 1.2], "line-dasharray": [3, 2] },
    },
    {
      id: "border-country",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      layout: { "line-join": "round" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.2, 12, 2] },
    },
    // The route: a soft glow and a dark casing for contrast on imagery, the legs dimming with
    // age, and a slow flow of dashes along the newest leg (off under reduced motion).
    {
      id: "route-glow",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 9, 6, 13, 12, 18],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 1, 7, 6, 10, 12, 13],
        "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.6, 1, 0.38, 4, 0.16],
      },
    },
    {
      id: "route-case",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 4.2, 6, 6, 12, 8],
        "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.32, 4, 0.12],
        "line-blur": 1.2,
      },
    },
    {
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          ["case", ["==", ["get", "age"], 0], 2.4, 1.8],
          12,
          ["case", ["==", ["get", "age"], 0], 4.2, 3.2],
        ],
        "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 1, 1, 0.8, 4, 0.42],
      },
    },
    {
      id: "route-flow",
      type: "line",
      source: "route",
      filter: ["==", ["get", "age"], 0],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 12, 2],
        "line-opacity": 0.85,
        "line-dasharray": [0, 4, 3],
      },
    },
    // Labels.
    {
      id: "label-road",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      minzoom: 12.5,
      filter: LATIN,
      layout: {
        "symbol-placement": "line",
        "text-field": NAME,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
        "text-max-angle": 30,
      },
      paint: { "text-halo-width": 1.2 },
    },
    {
      id: "label-water",
      type: "symbol",
      source: "omt",
      "source-layer": "water_name",
      layout: {
        "text-field": NAME,
        "text-font": ["Noto Sans Italic"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 8, 12, 14, 13],
        "text-letter-spacing": 0.08,
        "text-max-width": 7,
        "symbol-placement": "point",
      },
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "text-halo-width": 1.1 },
    },
    {
      id: "label-minor",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 9,
      filter: [
        "all",
        LATIN,
        ["match", ["get", "class"], ["town", "suburb"], true, ["village", "neighbourhood", "quarter"], [">=", ["zoom"], 12], false],
      ],
      layout: {
        "text-field": NAME,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10.5, 14, 13],
        "text-max-width": 8,
      },
      paint: { "text-halo-width": 1.3 },
    },
    {
      id: "label-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 3,
      filter: ["all", ["==", ["get", "class"], "city"], ["<=", ["coalesce", ["get", "rank"], 99], ["step", ["zoom"], 3, 5, 6, 7, 10, 9, 99]]],
      layout: {
        "text-field": NAME,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10.5, 8, 13, 12, 16],
        "text-max-width": 8,
      },
      paint: { "text-halo-width": 1.4 },
    },
    {
      id: "label-state",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 4,
      maxzoom: 9,
      filter: ["==", ["get", "class"], "state"],
      layout: {
        "text-field": NAME,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9.5, 8, 12],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 8,
      },
      paint: { "text-halo-width": 1 },
    },
    {
      id: "label-country",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      maxzoom: 8,
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": NAME,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 8.5, 4, 11.5, 7, 14],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.22,
        "text-max-width": 7,
      },
      paint: { "text-halo-width": 1.2 },
    },
  ];

  // Layers that need the vector tiles and would otherwise paint a plain land color.
  const BASE_IDS = ["base-land"];

  const applyThemed = (layers, palette) => {
    const themed = themedLayers(palette);
    return layers.map((layer) => {
      const extra = themed[layer.id];
      if (!extra) return layer;
      return { ...layer, paint: { ...layer.paint, ...extra.paint }, layout: { ...layer.layout, ...extra.layout } };
    });
  };

  // The glow around the globe: blue by day, a deep navy by night.
  const skyColors = (dark) => ({
    "sky-color": dark ? "#05080f" : "#0b1730",
    "horizon-color": dark ? "#24486f" : "#7fb2e6",
    "fog-color": dark ? "#0b1520" : "#cfe3f5",
  });

  // MapLibre lights the globe's atmosphere from the style's light. With the "map" anchor its
  // position is fixed to the Earth: [radius, azimuth, polar angle] of the direction away from
  // the sun, in the globe's frame (x toward 90°E, y north, z toward 0°, 0°).
  const sunLight = (sun) => {
    const lat = sun.lat * RAD;
    const lon = sun.lon * RAD;
    const [x, y, z] = [-Math.sin(lon) * Math.cos(lat), -Math.sin(lat), -Math.cos(lon) * Math.cos(lat)];
    const polar = Math.acos(Math.max(-1, Math.min(1, z))) / RAD;
    const azimuth = Math.atan2(y, x) / RAD - 90;
    return { anchor: "map", position: [1, azimuth, polar], "position-transition": { duration: 0, delay: 0 } };
  };

  const buildStyle = (tilesBase, routeData, sun, nightPalette) => {
    const dark = isDark();
    const palette = nightPalette ? PALETTES.dark : PALETTES.light;
    const layers = applyThemed(buildLayers(), palette).map((layer) =>
      BASE_IDS.includes(layer.id) ? { ...layer, layout: { ...layer.layout, visibility: "none" } } : layer
    );
    return {
      version: 8,
      projection: { type: "globe" },
      light: sunLight(sun),
      glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
      sky: {
        ...skyColors(dark),
        "sky-horizon-blend": 0.5,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 1,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 1, 6.5, 0],
      },
      sources: {
        "blue-marble": { type: "raster", tiles: [`${tilesBase}/blue-marble/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 2 },
        "blue-marble-remote": {
          type: "raster",
          tiles: [`${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`],
          tileSize: 256,
          minzoom: 3,
          maxzoom: 8,
        },
        omt: {
          type: "vector",
          url: `${OPENFREEMAP}/planet`,
          attribution: "",
        },
        terrain: {
          type: "raster-dem",
          encoding: "terrarium",
          tiles: [TERRAIN],
          tileSize: 256,
          minzoom: 5,
          maxzoom: 12,
          attribution: "",
        },
        route: { type: "geojson", data: routeData },
      },
      layers,
    };
  };

  /* ---------- daylight: night laid over the map by a custom WebGL layer ----------
     One mesh in Mercator coordinates covers the world (plus a cap at each pole on the globe).
     MapLibre's projection prelude places it on the globe or the flat map, so the shading is
     right at every zoom and through the change between them. Each pixel works out the sun's
     altitude: the day side dims a little toward the terminator, a graded twilight band
     follows, and beyond it the map gives way to NASA's Black Marble night lights. Blending is
     premultiplied, so the layer only darkens and adds light; by day the map shows through. */
  const GRID = 254; // cells a side: 255² vertices fit 16-bit indices
  const POLE = 32768;

  const DAYLIGHT_VERTEX = `in vec2 a_pos;
uniform float u_offset;
out vec2 v_merc;
void main() {
  if (a_pos.y < -32767.5) v_merc = vec2(0.5, -0.6);
  else if (a_pos.y > 32766.5) v_merc = vec2(0.5, 1.6);
  else v_merc = a_pos;
  vec2 p = vec2(a_pos.x + u_offset, a_pos.y);
  gl_Position = projectTile(p, p);
}`;

  const DAYLIGHT_FRAGMENT = `precision highp float;
in vec2 v_merc;
uniform vec3 u_sun;
uniform vec3 u_camera;
uniform sampler2D u_lights;
uniform sampler2D u_detail;
uniform sampler2D u_ocean;
uniform vec4 u_detail_box;
uniform float u_detail_on;
uniform float u_lights_on;
uniform float u_ocean_on;
uniform float u_strength;
uniform float u_gain;
uniform float u_dusk;
uniform float u_globe;
out vec4 fragColor;
const float PI = 3.141592653589793;
void main() {
  float lon = v_merc.x * 2.0 * PI - PI;
  float lat = 2.0 * atan(exp(PI - v_merc.y * 2.0 * PI)) - 0.5 * PI;
  vec3 normal = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  // The sine of the sun's altitude here.
  float s = dot(normal, u_sun);
  // Night falls between 2 degrees above the horizon and 10 below; lights come up after sunset.
  float night = 1.0 - smoothstep(-0.174, 0.035, s);
  float lit = 1.0 - smoothstep(-0.21, -0.02, s);
  vec2 world = vec2(v_merc.x, 0.5 - lat / PI);
  vec3 lights = texture(u_lights, world).rgb;
  // A coarser mip of the same image: the glow that spills around each city.
  vec3 bloom = texture(u_lights, world, 3.5).rgb;
  if (u_detail_on > 0.5) {
    vec2 deg = vec2(lon, lat) / PI * 180.0;
    vec2 uv = vec2((deg.x - u_detail_box.x) / (u_detail_box.z - u_detail_box.x), (u_detail_box.w - deg.y) / (u_detail_box.w - u_detail_box.y));
    vec2 edge = min(uv, 1.0 - uv);
    float inside = smoothstep(0.0, 0.04, min(edge.x, edge.y));
    if (inside > 0.0) lights = mix(lights, texture(u_detail, clamp(uv, 0.0, 1.0)).rgb, inside);
  }
  lights *= u_lights_on;
  bloom *= u_lights_on;
  // Sodium-gold cities with a soft amber bloom; the faint land of the night image turns a
  // cool moonlit blue, over ground of deep blue-black (a little lighter without the image).
  float glow = smoothstep(0.1, 0.42, dot(lights, vec3(0.3, 0.59, 0.11)));
  vec3 tint = mix(vec3(0.42, 0.55, 0.95) * 0.5, vec3(1.0, 0.84, 0.58) * 1.35, glow);
  vec3 halo = max(bloom - 0.06, 0.0) * vec3(1.0, 0.52, 0.18) * 1.5;
  vec3 city = (pow(lights, vec3(1.1)) * tint + halo) * lit * u_gain;
  vec3 ground = mix(vec3(0.03, 0.05, 0.12), vec3(0.004, 0.01, 0.03), u_lights_on);
  float a = night * u_strength * mix(0.82, 1.0, u_lights_on);
  vec3 color = (ground + city) * a;
  float alpha = a;
  // The day side dims as the sun gets low. Across the terminator: a band of sunset orange on
  // the sunward side, then the violet-blue of twilight.
  float dusk = (1.0 - night) * (1.0 - smoothstep(0.0, 0.5, s)) * u_dusk;
  alpha += dusk * (1.0 - alpha);
  float sunset = exp(-pow((s - 0.01) / 0.03, 2.0)) * u_strength;
  float blueHour = exp(-pow((s + 0.07) / 0.06, 2.0)) * u_strength;
  color += vec3(0.82, 0.26, 0.04) * sunset * 0.3 + vec3(0.09, 0.07, 0.26) * blueHour * 0.5;
  alpha += sunset * 0.18 * (1.0 - alpha);
  // On the whole globe: air thickening toward the limb (blue by day, amber at the sun's edge)
  // and the sun's glint off the oceans.
  if (u_globe > 0.0) {
    vec3 view = normalize(u_camera - normal);
    float facing = clamp(dot(normal, view), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.6) * u_globe;
    float day = smoothstep(-0.12, 0.3, s);
    vec3 air = mix(vec3(1.0, 0.48, 0.2), vec3(0.42, 0.68, 1.0), smoothstep(0.02, 0.4, s));
    color += air * rim * day * 0.75;
    alpha += rim * day * 0.35 * (1.0 - alpha);
    float ocean = texture(u_ocean, clamp(v_merc, 0.0, 1.0)).r * u_ocean_on;
    float nh = max(dot(normal, normalize(u_sun + view)), 0.0);
    // Kept to the face of the globe: near the limb a glint reads as a stray lamp.
    float glint = (pow(nh, 260.0) * 0.32 + pow(nh, 40.0) * 0.045) * ocean * smoothstep(0.0, 0.25, s) * smoothstep(0.25, 0.7, facing) * u_globe;
    color += vec3(1.0, 0.9, 0.74) * glint;
  }
  fragColor = vec4(color, min(alpha, 1.0));
}`;

  const createDaylightLayer = ({ lightsUrl, oceanUrl, getState }) => {
    let mapRef = null;
    let gl = null;
    let buffers = null;
    let lightsTexture = null;
    let detailTexture = null;
    let oceanTexture = null;
    let pendingLights = null;
    let pendingDetail = null;
    let pendingOcean = null;
    let lightsOn = 0;
    let detailBox = null;
    let anisotropy = null;
    const programs = new Map();

    // MapLibre runs WebGL 2 where it can; the same shaders are rewritten for WebGL 1.
    const translate = (source, isVertex, webgl2) => {
      if (webgl2) return `#version 300 es\n${source}`;
      let out = source.replace(/\btexture\(/g, "texture2D(");
      if (isVertex) out = out.replace(/^in /gm, "attribute ").replace(/^out /gm, "varying ");
      else
        out = out
          .replace(/^in /gm, "varying ")
          .replace(/^out vec4 fragColor;$/m, "")
          .replace(/fragColor/g, "gl_FragColor");
      return out;
    };

    const compile = (shaderData) => {
      const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
      const vertexSource = translate(`${shaderData.vertexShaderPrelude}\n${shaderData.define}\n${DAYLIGHT_VERTEX}`, true, webgl2);
      const fragmentSource = translate(DAYLIGHT_FRAGMENT, false, webgl2);
      const shader = (type, source) => {
        const object = gl.createShader(type);
        gl.shaderSource(object, source);
        gl.compileShader(object);
        if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(object) || "Shader failed");
        return object;
      };
      const program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Program failed");
      const names = [
        "u_projection_matrix",
        "u_projection_fallback_matrix",
        "u_projection_tile_mercator_coords",
        "u_projection_clipping_plane",
        "u_projection_transition",
        "u_offset",
        "u_sun",
        "u_camera",
        "u_lights",
        "u_detail",
        "u_ocean",
        "u_detail_box",
        "u_detail_on",
        "u_lights_on",
        "u_ocean_on",
        "u_strength",
        "u_gain",
        "u_dusk",
        "u_globe",
      ];
      return {
        program,
        position: gl.getAttribLocation(program, "a_pos"),
        u: Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])),
      };
    };

    const buildMesh = () => {
      const n = GRID + 1;
      const positions = new Float32Array((n * n + 2) * 2);
      let k = 0;
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          positions[k++] = i / GRID;
          positions[k++] = j / GRID;
        }
      }
      positions.set([0.5, -POLE, 0.5, POLE], k);
      const north = n * n;
      const south = north + 1;
      const indices = new Uint16Array(GRID * GRID * 6 + GRID * 6);
      let m = 0;
      for (let j = 0; j < GRID; j += 1) {
        for (let i = 0; i < GRID; i += 1) {
          const a = j * n + i;
          indices.set([a, a + 1, a + n, a + 1, a + n + 1, a + n], m);
          m += 6;
        }
      }
      const gridCount = m;
      for (let i = 0; i < GRID; i += 1) {
        indices.set([north, i + 1, i, south, GRID * n + i, GRID * n + i + 1], m);
        m += 6;
      }
      const vertex = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const index = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      return { vertex, index, gridCount, total: m };
    };

    const isPowerOfTwo = (value) => value > 0 && (value & (value - 1)) === 0;

    // Uploads happen inside render(), where MapLibre expects other code to touch GL state.
    const upload = (texture, image) => {
      const mipmaps = isPowerOfTwo(image.naturalWidth) && isPowerOfTwo(image.naturalHeight);
      const target = texture || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
      if (anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return target;
    };

    return {
      id: "daylight",
      type: "custom",
      renderingMode: "2d",
      onAdd(map, context) {
        mapRef = map;
        gl = context;
        anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
        buffers = buildMesh();
        const fetchImage = (url, done) => {
          if (!url) return;
          const image = new Image();
          image.decoding = "async";
          image.addEventListener(
            "load",
            () => {
              done(image);
              mapRef?.triggerRepaint();
            },
            { once: true }
          );
          image.src = url;
        };
        fetchImage(lightsUrl, (image) => (pendingLights = image));
        fetchImage(oceanUrl, (image) => (pendingOcean = image));
      },
      // A sharper night image for part of the world; box is [west, south, east, north].
      setDetail(image, box) {
        pendingDetail = { image, box };
        mapRef?.triggerRepaint();
      },
      render(context, args) {
        if (!buffers) return;
        const state = getState();
        if (pendingLights) {
          lightsTexture = upload(lightsTexture, pendingLights);
          lightsOn = 1;
          pendingLights = null;
        }
        if (pendingOcean) {
          oceanTexture = upload(oceanTexture, pendingOcean);
          pendingOcean = null;
        }
        if (pendingDetail) {
          detailTexture = upload(detailTexture, pendingDetail.image);
          detailBox = pendingDetail.box;
          pendingDetail = null;
        }
        const variant = args.shaderData.variantName;
        let program = programs.get(variant);
        if (program === undefined) {
          try {
            program = compile(args.shaderData);
          } catch (error) {
            console.warn("Journey map daylight layer unavailable", error);
            program = null;
          }
          programs.set(variant, program);
        }
        if (!program) return;
        const data = args.defaultProjectionData;
        const { u } = program;
        gl.useProgram(program.program);
        gl.uniformMatrix4fv(u.u_projection_matrix, false, Float32Array.from(data.mainMatrix));
        if (u.u_projection_fallback_matrix) gl.uniformMatrix4fv(u.u_projection_fallback_matrix, false, Float32Array.from(data.fallbackMatrix));
        if (u.u_projection_tile_mercator_coords) gl.uniform4f(u.u_projection_tile_mercator_coords, ...data.tileMercatorCoords);
        if (u.u_projection_clipping_plane) gl.uniform4f(u.u_projection_clipping_plane, ...data.clippingPlane);
        if (u.u_projection_transition) gl.uniform1f(u.u_projection_transition, data.projectionTransition);
        gl.uniform3f(u.u_sun, ...state.sun);
        gl.uniform3f(u.u_camera, ...state.camera);
        gl.uniform1f(u.u_strength, state.strength);
        gl.uniform1f(u.u_gain, state.gain);
        gl.uniform1f(u.u_dusk, state.dusk);
        gl.uniform1f(u.u_globe, state.globe);
        gl.uniform1f(u.u_lights_on, lightsOn);
        gl.uniform1f(u.u_ocean_on, oceanTexture ? 1 : 0);
        gl.uniform1f(u.u_detail_on, detailBox && detailTexture ? 1 : 0);
        if (detailBox) gl.uniform4f(u.u_detail_box, ...detailBox);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lightsTexture);
        gl.uniform1i(u.u_lights, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, detailTexture || lightsTexture);
        gl.uniform1i(u.u_detail, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, oceanTexture || lightsTexture);
        gl.uniform1i(u.u_ocean, 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertex);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
        gl.enableVertexAttribArray(program.position);
        gl.vertexAttribPointer(program.position, 2, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.CULL_FACE);
        // The flat map repeats the world east and west; the globe draws it once, with its poles.
        const globe = variant === "globe";
        for (const offset of globe ? [0] : [-1, 0, 1]) {
          gl.uniform1f(u.u_offset, offset);
          gl.drawElements(gl.TRIANGLES, globe ? buffers.total : buffers.gridCount, gl.UNSIGNED_SHORT, 0);
        }
        gl.disableVertexAttribArray(program.position);
        gl.activeTexture(gl.TEXTURE0);
      },
      onRemove() {
        if (!gl) return;
        for (const program of programs.values()) if (program) gl.deleteProgram(program.program);
        programs.clear();
        if (buffers) {
          gl.deleteBuffer(buffers.vertex);
          gl.deleteBuffer(buffers.index);
        }
        if (lightsTexture) gl.deleteTexture(lightsTexture);
        if (detailTexture) gl.deleteTexture(detailTexture);
        if (oceanTexture) gl.deleteTexture(oceanTexture);
        buffers = null;
        mapRef = null;
      },
    };
  };

  /* ---------- the map instance ---------- */
  // A time from the test hook: an ISO string, a Date or ms; anything else is ignored.
  const parseTime = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
    return Number.isFinite(time) ? time : null;
  };

  const mount = (figure, stops, { onSelect, onFail, loadNear, time: timeOption } = {}) => {
    if (!figure) return null;
    if (figure.journeyMap) return figure.journeyMap;
    const places = (Array.isArray(stops) ? stops : []).filter(
      (stop) => stop && stop.id && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon))
    );
    const canvasHost = figure.querySelector("[data-map-canvas]");
    const pinHost = figure.querySelector("[data-map-pins]");
    if (!places.length || !canvasHost || !pinHost || !webglAvailable()) {
      figure.hidden = true;
      return null;
    }
    const scriptUrl = figure.dataset.mapScript;
    const styleUrl = figure.dataset.mapStyle;
    const tilesBase = (figure.dataset.mapTiles || "").replace(/\/$/, "");
    const statusEl = figure.querySelector("[data-journey-status]");
    const loadingEl = figure.querySelector("[data-map-loading]");
    const hintEl = figure.querySelector("[data-map-hint]");
    const coords = new Map(places.map((stop) => [stop.id, [Number(stop.lon), Number(stop.lat)]]));
    const currentId = places.find((stop) => stop.current)?.id || null;

    // Route legs, newest first by age 0.
    const legs = [];
    for (let i = 1; i < places.length; i += 1) {
      const from = coords.get(places[i - 1].id);
      const to = coords.get(places[i].id);
      if (angleBetween(from, to) < 1e-6) continue;
      legs.push({
        type: "Feature",
        properties: { age: places.length - 1 - i, from: places[i - 1].id, to: places[i].id },
        geometry: { type: "LineString", coordinates: greatCircle(from, to) },
      });
    }
    const routeData = { type: "FeatureCollection", features: legs };

    // The reference point: the current stop (else the latest). The overview faces it.
    const reference = places.find((stop) => stop.current) || places[places.length - 1];
    const overviewCenter = coords.get(reference.id);
    const referenceName = reference.short || reference.name;

    /* Time. "live" follows the real clock; "fixed" holds one moment (the test hook or
       setTime()). */
    let hookTime = null;
    try {
      hookTime = parseTime(new URLSearchParams(window.location.search).get("journey-time"));
    } catch (error) {
      hookTime = null;
    }
    if (hookTime === null) hookTime = parseTime(figure.dataset.journeyTime);
    if (hookTime === null) hookTime = parseTime(timeOption);
    let fixedTime = hookTime;
    let mode = fixedTime === null ? "live" : "fixed";
    const clock = () => (fixedTime === null ? Date.now() : fixedTime);
    let shownTime = clock();
    let sun = subsolarPoint(shownTime);
    let nightPalette = sunAltitude(overviewCenter, sun) < -4;

    figure.hidden = false;
    figure.classList.add("is-loading");

    let map = null;
    let destroyed = false;
    let ready = false;
    let failed = false;
    let selected = null;
    let pending = null;
    let pinsFrame = 0;
    let flowFrame = 0;
    let inView = false;
    // The split view's Map pane (the wheel guard covers all of it, and the map window, which
    // sits inside it in the page). The map counts as seen while it is on screen, unless the
    // controller says otherwise (setShown).
    const paneEl = figure.closest("[data-journey-pane]");
    let shown = true;
    // Whether the figure is in the map window (setWindowed): there the map takes a plain
    // scroll and a one-finger drag itself.
    let windowed = false;
    // Whether the camera still shows the whole globe (the first view, or after reset): then
    // a change of the pane's size refits the globe to it.
    let atOverview = true;
    const onScreen = () => shown && inView;
    let baseShown = false;
    let vectorFailed = false;
    const cleanups = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    const announce = (text) => {
      if (!statusEl) return;
      statusEl.textContent = "";
      // A fresh text node is announced even when the words repeat.
      requestAnimationFrame(() => {
        statusEl.textContent = text;
      });
    };

    // "Hangzhou (Before 2017) and Hangzhou (May – Aug 2024)": periods tell same-named places apart.
    const listNames = (ids) => {
      const names = ids.map((id) => {
        const stop = pins.get(id).stop;
        const name = stop.short || stop.name;
        return stop.period ? `${name} (${stop.period})` : name;
      });
      return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] || "";
    };
    const labelFor = (stop) => `${stop.short || stop.name}, ${stop.period || stop.year || ""}`.replace(/,\s*$/, "");

    /* Pins: one button per place, placed over the canvas each frame. Places that land within
       CLUSTER_PX of each other share the most relevant member's button, which then zooms in. */
    const pins = new Map();
    for (const stop of places) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "journey-pin";
      if (stop.id === currentId) button.classList.add("journey-pin--current");
      button.dataset.stop = stop.id;
      button.hidden = true;
      const dotEl = document.createElement("span");
      dotEl.className = "journey-pin-dot";
      dotEl.setAttribute("aria-hidden", "true");
      const count = document.createElement("span");
      count.className = "journey-pin-count";
      count.setAttribute("aria-hidden", "true");
      button.append(dotEl, count);
      pinHost.appendChild(button);
      pins.set(stop.id, { stop, button, count, group: [stop.id] });
    }
    const label = document.createElement("div");
    label.className = "journey-map-label";
    label.setAttribute("aria-hidden", "true");
    label.hidden = true;
    const labelName = document.createElement("strong");
    const labelPeriod = document.createElement("span");
    label.append(labelName, labelPeriod);
    pinHost.appendChild(label);

    const occluded = (lngLat) => {
      try {
        return Boolean(map.transform.isLocationOccluded?.(new window.maplibregl.LngLat(lngLat[0], lngLat[1])));
      } catch (error) {
        return false;
      }
    };

    const layoutPins = () => {
      pinsFrame = 0;
      if (!map || !ready) return;
      const width = canvasHost.clientWidth;
      const height = canvasHost.clientHeight;
      const points = [];
      for (const stop of places) {
        const lngLat = coords.get(stop.id);
        const p = map.project(lngLat);
        const visible = !occluded(lngLat) && p.x > -8 && p.y > -8 && p.x < width + 8 && p.y < height + 8;
        points.push({ id: stop.id, x: p.x, y: p.y, visible });
      }
      // Greedy grouping in time order: each place joins the first group within reach.
      const groups = [];
      for (const point of points) {
        if (!point.visible) continue;
        const near = groups.find((group) => Math.hypot(group.x - point.x, group.y - point.y) < CLUSTER_PX);
        if (near) {
          near.members.push(point);
          near.x = near.members.reduce((s, m) => s + m.x, 0) / near.members.length;
          near.y = near.members.reduce((s, m) => s + m.y, 0) / near.members.length;
        } else groups.push({ x: point.x, y: point.y, members: [point] });
      }
      const shown = new Set();
      let labelAt = null;
      for (const group of groups) {
        const ids = group.members.map((m) => m.id);
        // The selected place leads its group, then the current place, then the latest.
        const leadId = ids.includes(selected) ? selected : ids.includes(currentId) ? currentId : ids[ids.length - 1];
        const pin = pins.get(leadId);
        shown.add(leadId);
        pin.group = ids;
        const clustered = ids.length > 1;
        const stop = pin.stop;
        pin.button.hidden = false;
        pin.button.style.transform = `translate(${group.x.toFixed(1)}px, ${group.y.toFixed(1)}px)`;
        pin.button.classList.toggle("journey-pin--cluster", clustered);
        pin.button.classList.toggle("journey-pin--has-current", ids.includes(currentId));
        pin.button.classList.toggle("journey-pin--selected", ids.includes(selected));
        pin.count.textContent = clustered ? String(ids.length) : "";
        const ariaLabel = clustered
          ? `${listNames(ids)}: ${ids.length} places here, zoom in`
          : `${labelFor(stop)}${stop.id === currentId ? ", now" : ""}`;
        if (pin.button.getAttribute("aria-label") !== ariaLabel) pin.button.setAttribute("aria-label", ariaLabel);
        if (ids.includes(selected)) pin.button.setAttribute("aria-current", "true");
        else pin.button.removeAttribute("aria-current");
        if (ids.includes(selected)) labelAt = { x: group.x, y: group.y };
      }
      for (const [id, pin] of pins) {
        if (shown.has(id)) continue;
        // A focused pin that merges into a cluster hands focus to the cluster's pin.
        const hadFocus = document.activeElement === pin.button;
        pin.button.hidden = true;
        pin.button.classList.remove("journey-pin--cluster", "journey-pin--selected", "journey-pin--has-current");
        pin.count.textContent = "";
        pin.group = [id];
        if (hadFocus) {
          const owner = [...pins.values()].find((other) => !other.button.hidden && other.group.includes(id));
          owner?.button.focus({ preventScroll: true });
        }
      }
      // The selected place's name sits beside its pin, on the first side where it neither
      // covers another pin nor runs out of the frame.
      const selectedStop = selected && pins.get(selected)?.stop;
      if (labelAt && selectedStop) {
        const name = selectedStop.short || selectedStop.name;
        if (labelName.textContent !== name) labelName.textContent = name;
        if (labelPeriod.textContent !== (selectedStop.period || "")) labelPeriod.textContent = selectedStop.period || "";
        label.hidden = false;
        const w = label.offsetWidth;
        const h = label.offsetHeight;
        const gap = 16;
        const { x, y } = labelAt;
        const boxes = {
          right: [x + gap, y - h / 2],
          left: [x - gap - w, y - h / 2],
          above: [x - w / 2, y - gap - h],
          below: [x - w / 2, y + gap],
        };
        const others = groups.filter((group) => group.x !== x || group.y !== y);
        const cost = ([left, top]) => {
          let penalty = 0;
          const overflow = Math.max(0, -left) + Math.max(0, left + w - width) + Math.max(0, -top) + Math.max(0, top + h - height);
          penalty += overflow * 4;
          for (const other of others) {
            const dx = Math.max(left - other.x, 0, other.x - (left + w));
            const dy = Math.max(top - other.y, 0, other.y - (top + h));
            if (Math.hypot(dx, dy) < 14) penalty += 1000;
          }
          return penalty;
        };
        let side = "right";
        let best = Infinity;
        for (const candidate of Object.keys(boxes)) {
          const penalty = cost(boxes[candidate]);
          if (penalty < best - 0.5) [best, side] = [penalty, candidate];
        }
        if (label.dataset.side !== side) label.dataset.side = side;
        label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      } else label.hidden = true;
    };
    const schedulePins = () => {
      if (!pinsFrame) pinsFrame = requestAnimationFrame(layoutPins);
    };

    /* Views */
    const overviewZoom = () => {
      const size = Math.min(canvasHost.clientWidth, canvasHost.clientHeight) || 300;
      // The globe's radius is worldSize / 2π / cos(latitude) at zoom z (worldSize = 512·2^z).
      // The camera's perspective shows a disc smaller than that, so these fill roughly 88%
      // of a square frame and 86% of the height of a wide one, the glow just inside.
      const fill = canvasHost.clientWidth > canvasHost.clientHeight * 1.2 ? 1.15 : 1.04;
      const radius = (size * fill) / 2;
      return Math.log2((radius * 2 * Math.PI * Math.cos(overviewCenter[1] * RAD)) / 512);
    };
    const overviewView = () => ({ center: overviewCenter, zoom: overviewZoom(), bearing: 0, pitch: 0 });

    const move = (view, animate) => {
      if (!map) return;
      if (!animate || reducedMotion.matches) map.jumpTo(view);
      else {
        sound("whoosh");
        map.flyTo({ ...view, speed: 1.15, curve: 1.45, essential: false });
      }
    };

    const highlight = (id) => {
      selected = id;
      schedulePins();
    };

    const flyToStop = (id, animate) => {
      const lngLat = coords.get(id);
      if (!lngLat) return;
      // Without the street map (tile hosts unreachable) only the bundled imagery is left,
      // which still reads as a region but not as a city.
      const detail = vectorFailed && !baseShown ? OFFLINE_ZOOM : DETAIL_ZOOM;
      const zoom = map.getZoom() > detail + 2 ? map.getZoom() : detail;
      atOverview = false;
      move({ center: lngLat, zoom, bearing: 0, pitch: 0 }, animate);
    };

    const applySelect = (id, { animate = true, overview = false } = {}) => {
      if (!coords.has(id)) return;
      highlight(id);
      if (overview) return;
      // Out of sight the view jumps: nobody would see (or should hear) the flight.
      flyToStop(id, animate && shown);
    };

    const reset = ({ animate = true } = {}) => {
      if (!ready) return;
      move(overviewView(), animate);
      atOverview = true;
    };

    /* ---------- daylight and the clock ---------- */
    const sunVector = () => toVec([sun.lon, sun.lat]);
    const clamp01 = (value) => Math.max(0, Math.min(1, value));
    // The globe as the camera sees it: its radius in CSS px (MapLibre's globe radius at this
    // zoom and latitude), the camera's distance above the centre of the view, and the
    // radius of the disc on screen (the limb, seen in perspective).
    const globeView = () => {
      const transform = map.transform;
      const center = map.getCenter();
      const radius = transform.worldSize / (2 * Math.PI) / Math.cos(center.lat * RAD);
      const focal = transform.cameraToCenterDistance;
      const limb = (focal * radius) / Math.sqrt((focal + radius) ** 2 - radius ** 2);
      return { center: [center.lng, center.lat], radius, focal, limb };
    };
    // How far night replaces the map: fully on the globe; on the street map, part way, so
    // the night-time map shows through with the lights glowing over it.
    const daylightState = () => {
      const zoom = map ? map.getZoom() : 0;
      const t = clamp01((zoom - BASE_FADE[0]) / (DETAIL_ZOOM - BASE_FADE[0]));
      // Lights are brightened most on the whole globe, where each city is a pixel or two;
      // at street level they are only a glow, so the lit street map reads as night.
      const lift = clamp01((6 - zoom) / 4);
      // Over the night palette (streets lit amber) night needs only a light touch.
      const ease = nightPalette ? 0.72 : 0.25;
      // Limb haze and sun glint belong to the whole globe; they fade out by zoom 5.
      const globe = clamp01((5.5 - zoom) / 2);
      let camera = [0, 0, 1];
      if (map && globe > 0) {
        const view = globeView();
        camera = toVec(view.center).map((value) => value * (1 + view.focal / view.radius));
      }
      return {
        sun: sunVector(),
        camera,
        globe,
        strength: 1 - ease * t,
        gain: (1 + 0.9 * lift) * (1 - 0.8 * t),
        dusk: 0.4 * (1 - 0.6 * t),
      };
    };
    const daylight = createDaylightLayer({
      lightsUrl: tilesBase ? `${tilesBase}/night-lights.jpg` : null,
      oceanUrl: tilesBase ? `${tilesBase}/ocean-mask.png` : null,
      getState: daylightState,
    });

    /* The space around the globe: a glow just beyond the limb, brightest toward the sun, and
       a starfield that drifts a little as the globe turns. Both are CSS layers under the
       transparent canvas; the script only places them. */
    const frameEl = figure.querySelector(".journey-map-frame");
    const haloEl = figure.querySelector("[data-map-halo]");
    let haloFrame = 0;
    const placeSpace = () => {
      haloFrame = 0;
      if (!map || !ready || !frameEl) return;
      const view = globeView();
      const [lon, lat] = view.center;
      frameEl.style.setProperty("--stars-x", `${(-lon * 1.6).toFixed(1)}px`);
      frameEl.style.setProperty("--stars-y", `${(lat * 1.6).toFixed(1)}px`);
      if (!haloEl) return;
      const zoom = map.getZoom();
      const strength = clamp01((6 - zoom) / 2.5);
      haloEl.hidden = strength <= 0;
      if (!strength) return;
      const centerPoint = map.project(map.getCenter());
      // The sun's direction on screen (up is north: the map never rotates) and how far it
      // stands in front of the globe (1) or behind it (-1).
      const c = toVec(view.center);
      const east = [-Math.sin(lon * RAD), Math.cos(lon * RAD), 0];
      const north = [-Math.sin(lat * RAD) * Math.cos(lon * RAD), -Math.sin(lat * RAD) * Math.sin(lon * RAD), Math.cos(lat * RAD)];
      const s = sunVector();
      const angle = Math.atan2(dot(s, east), dot(s, north)) / RAD;
      haloEl.style.setProperty("--halo-x", `${centerPoint.x.toFixed(1)}px`);
      haloEl.style.setProperty("--halo-y", `${centerPoint.y.toFixed(1)}px`);
      haloEl.style.setProperty("--halo-r", `${view.limb.toFixed(1)}px`);
      haloEl.style.setProperty("--halo-sun", `${angle.toFixed(1)}deg`);
      haloEl.style.setProperty("--halo-front", dot(s, c).toFixed(3));
      haloEl.style.opacity = strength.toFixed(3);
    };
    const scheduleSpace = () => {
      if (!haloFrame) haloFrame = requestAnimationFrame(placeSpace);
    };

    /* Ctrl or ⌘ + scroll over the Map pane (a trackpad pinch arrives the same way) zooms the
       map and never the page: from the moment the figure shows, while the library is still on
       its way, and after; over the pane's bar too. A plain scroll scrolls the page. In the map
       window any scroll over the map zooms it. Once the map runs MapLibre does the zooming over
       its canvas; before, the zoom asked for is kept and applied when it starts. Safari on a
       Mac pinches with gesture events instead, which MapLibre does not read, so they zoom the
       map here. */
    let pendingZoom = 0;
    const queueZoom = (delta) => {
      atOverview = false;
      if (ready && map) map.setZoom(map.getZoom() + delta);
      else pendingZoom = Math.max(-3, Math.min(3, pendingZoom + delta));
    };
    // Over the canvas MapLibre zooms; over a pin, the readout or a bar, zoom it here.
    const wheelZoom = (event) => {
      event.preventDefault();
      if (ready && map?.getCanvasContainer().contains(event.target)) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
      queueZoom((-event.deltaY * unit) / 300);
    };
    if (frameEl) {
      // The frame, wherever it is (the pane or the window).
      listen(
        frameEl,
        "wheel",
        (event) => {
          if (windowed || event.ctrlKey || event.metaKey) wheelZoom(event);
        },
        { passive: false }
      );
      // The rest of the pane (its bar), and of the window inside it.
      if (paneEl) {
        listen(
          paneEl,
          "wheel",
          (event) => {
            if (frameEl.contains(event.target) || (!event.ctrlKey && !event.metaKey)) return;
            wheelZoom(event);
          },
          { passive: false }
        );
      }
      if (!navigator.maxTouchPoints) {
        let lastScale = 1;
        const onGesture = (event) => {
          event.preventDefault();
          if (event.type === "gesturestart") lastScale = 1;
          else if (event.type === "gesturechange" && event.scale > 0) {
            queueZoom(Math.log2(event.scale / lastScale));
            lastScale = event.scale;
          }
        };
        for (const type of ["gesturestart", "gesturechange", "gestureend"]) listen(paneEl || frameEl, type, onGesture, { passive: false });
      }
    }

    // The street map's palette follows the sun at the centre of the view.
    const applyPalette = () => {
      if (!map || !ready) return;
      const themed = themedLayers(nightPalette ? PALETTES.dark : PALETTES.light);
      for (const [id, { paint = {}, layout = {} }] of Object.entries(themed)) {
        if (!map.getLayer(id)) continue;
        for (const [key, value] of Object.entries(paint)) map.setPaintProperty(id, key, value);
        for (const [key, value] of Object.entries(layout)) map.setLayoutProperty(id, key, value);
      }
    };
    const checkPalette = () => {
      if (!map || !ready) return;
      const center = map.getCenter();
      const night = sunAltitude([center.lng, center.lat], sun) < -4;
      if (night === nightPalette) return;
      nightPalette = night;
      applyPalette();
    };

    // The readout: the reference point's local time and whether the sun is up there.
    const clockEl = figure.querySelector("[data-map-clock]");
    const clockPlace = figure.querySelector("[data-clock-place]");
    const clockTime = figure.querySelector("[data-clock-time]");
    const clockPhase = figure.querySelector("[data-clock-phase]");
    const clockMode = figure.querySelector("[data-clock-mode]");
    if (clockPlace) clockPlace.textContent = referenceName;
    const formatters = new Map();
    const formatTime = (time, withDay) => {
      const key = withDay ? "day" : "time";
      if (!formatters.has(key)) {
        const options = { hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(withDay ? { weekday: "short" } : {}) };
        try {
          formatters.set(key, new Intl.DateTimeFormat("en-US", { ...options, timeZone: reference.tz || undefined }));
        } catch (error) {
          formatters.set(key, null);
        }
      }
      const formatter = formatters.get(key);
      if (formatter && reference.tz) return formatter.format(time);
      // Without a time zone, local mean solar time from the longitude.
      const solar = new Date(time + (overviewCenter[0] / 15) * HOUR);
      const hours = solar.getUTCHours();
      const minutes = String(solar.getUTCMinutes()).padStart(2, "0");
      return `${((hours + 11) % 12) + 1}:${minutes} ${hours < 12 ? "AM" : "PM"} solar time`;
    };
    const phaseAt = (time) => {
      const altitude = sunAltitude(overviewCenter, subsolarPoint(time));
      if (altitude > -0.833) return "day";
      if (altitude > -6) return sunAltitude(overviewCenter, subsolarPoint(time + 10 * 60 * 1000)) > altitude ? "dawn" : "dusk";
      return "night";
    };
    const PHASE_NAMES = { day: "Daylight", dawn: "Dawn", dusk: "Dusk", night: "Night" };
    const MODE_NAMES = { live: "Live", fixed: "Fixed time" };
    const updateClock = () => {
      if (!clockEl) return;
      const phase = phaseAt(shownTime);
      // A held moment names its day too; the live clock is plainly today.
      const text = formatTime(shownTime, mode !== "live");
      if (clockTime.textContent !== text) clockTime.textContent = text;
      if (clockPhase.textContent !== PHASE_NAMES[phase]) clockPhase.textContent = PHASE_NAMES[phase];
      if (clockMode.textContent !== MODE_NAMES[mode]) clockMode.textContent = MODE_NAMES[mode];
      clockEl.dataset.phase = phase;
      clockEl.dataset.mode = mode;
      figure.dataset.timeMode = mode;
    };

    // A change while the map is idle (the sun moved, the pane changed size) is drawn over a
    // few frames, not one: some WebKit builds do not show a single repaint of an otherwise
    // idle canvas.
    let nudgeFrame = 0;
    const nudge = (frames = 4) => {
      if (nudgeFrame) cancelAnimationFrame(nudgeFrame);
      let left = frames;
      const step = () => {
        nudgeFrame = 0;
        if (!map || destroyed) return;
        map.triggerRepaint();
        if (--left > 0) nudgeFrame = requestAnimationFrame(step);
      };
      step();
    };

    // New sun: shading, atmosphere, palette and readout.
    const updateSun = () => {
      sun = subsolarPoint(shownTime);
      if (map && ready) {
        try {
          map.setLight(sunLight(sun));
        } catch (error) {
          /* the atmosphere keeps its last light */
        }
        if (map.getZoom() >= BASE_FADE[0] - 0.5) checkPalette();
        nudge();
        scheduleSpace();
      }
      updateClock();
    };

    /* The live clock: the sun moves on with real time, in steps too small to see. Scrolled
       away or in a hidden tab the steps wait, and the view catches up on its return. The
       camera is never moved: the Earth turns only as fast as the real one. */
    let liveTimer = 0;
    const catchUp = () => {
      if (mode !== "live" || destroyed) return;
      shownTime = clock();
      updateSun();
      // Night may have reached the view: fetch its sharper lights.
      if (map && ready) scheduleDetail();
    };
    const scheduleLive = () => {
      clearTimeout(liveTimer);
      liveTimer = 0;
      if (mode !== "live" || destroyed) return;
      liveTimer = setTimeout(
        () => {
          liveTimer = 0;
          if (onScreen() && !document.hidden) catchUp();
          scheduleLive();
        },
        LIVE_STEP_MS - (Date.now() % LIVE_STEP_MS) + 20
      );
    };
    const setTimeMode = (next, time) => {
      mode = next;
      fixedTime = next === "fixed" ? time : null;
      shownTime = clock();
      updateSun();
      if (map && ready) scheduleDetail();
      scheduleLive();
    };

    // Sharper night lights for the part of the world in view, from the GIBS WMS.
    let detailKey = "";
    let detailTimer = 0;
    const viewBox = () => {
      const width = canvasHost.clientWidth;
      const height = canvasHost.clientHeight;
      const center = map.getCenter();
      let [west, east, south, north] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i <= 4; i += 1) {
        for (let j = 0; j <= 4; j += 1) {
          const point = map.unproject([(width * i) / 4, (height * j) / 4]);
          if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) continue;
          const lon = center.lng + wrap180(point.lng - center.lng);
          west = Math.min(west, lon);
          east = Math.max(east, lon);
          south = Math.min(south, point.lat);
          north = Math.max(north, point.lat);
        }
      }
      return Number.isFinite(west) && Number.isFinite(south) ? { west, east, south, north } : null;
    };
    const refreshDetail = () => {
      detailTimer = 0;
      if (!map || !ready || map.getZoom() < 2.8) return;
      const box = viewBox();
      if (!box) return;
      // Pad the view, snap to a grid an eighth of its size so small moves reuse the image.
      const span = Math.max(box.east - box.west, box.north - box.south, 0.2);
      const snap = 2 ** Math.round(Math.log2(span / 8));
      const west = Math.max(-180, Math.floor((box.west - span * 0.35) / snap) * snap);
      const east = Math.min(180, Math.ceil((box.east + span * 0.35) / snap) * snap);
      const south = Math.max(-85, Math.floor((box.south - span * 0.35) / snap) * snap);
      const north = Math.min(85, Math.ceil((box.north + span * 0.35) / snap) * snap);
      if (east - west < 0.05 || north - south < 0.05) return;
      // Only where some of it is in the dark.
      let dark = false;
      for (let i = 0; i <= 4 && !dark; i += 1) {
        for (let j = 0; j <= 4 && !dark; j += 1) {
          if (sunAltitude([west + ((east - west) * i) / 4, south + ((north - south) * j) / 4], sun) < 6) dark = true;
        }
      }
      if (!dark) return;
      const key = [west, south, east, north].map((value) => value.toFixed(4)).join(",");
      if (key === detailKey) return;
      detailKey = key;
      // No finer than the data's 500 m (finer comes back blocky), in power-of-two sizes.
      const size = (degrees) => Math.min(2048, Math.max(32, 2 ** Math.floor(Math.log2(degrees / 0.0045))));
      const params = new URLSearchParams({
        SERVICE: "WMS",
        REQUEST: "GetMap",
        VERSION: "1.3.0",
        LAYERS: "VIIRS_Black_Marble",
        STYLES: "",
        FORMAT: "image/jpeg",
        CRS: "EPSG:4326",
        BBOX: [south, west, north, east].join(","),
        WIDTH: String(size(east - west)),
        HEIGHT: String(size(north - south)),
        TIME: "2016-01-01",
      });
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.addEventListener(
        "load",
        () => {
          if (destroyed || detailKey !== key) return;
          daylight.setDetail(image, [west, south, east, north]);
        },
        { once: true }
      );
      // Unreachable: the bundled world image carries on.
      image.addEventListener(
        "error",
        () => {
          if (detailKey === key) detailKey = "";
        },
        { once: true }
      );
      image.src = `${GIBS_WMS}?${params}`;
    };
    const scheduleDetail = () => {
      clearTimeout(detailTimer);
      detailTimer = setTimeout(refreshDetail, 350);
    };

    // A pin (or cluster) chosen on the map.
    const choose = (id) => {
      const pin = pins.get(id);
      if (!pin || !ready) return;
      sound("pin");
      const group = pin.group.length > 1 ? pin.group : null;
      if (group) {
        // Zoom in until the cluster's places sit comfortably apart, centred on them.
        const points = group.map((member) => map.project(coords.get(member)));
        let spread = 0;
        for (const a of points) for (const b of points) spread = Math.max(spread, Math.hypot(a.x - b.x, a.y - b.y));
        const target = Math.min(MAX_ZOOM - 1, map.getZoom() + Math.max(1.5, Math.log2((CLUSTER_PX * 3.2) / Math.max(spread, 0.05))));
        const sumVec = group.map((member) => toVec(coords.get(member))).reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
        move({ center: toLonLat(sumVec), zoom: target, bearing: 0, pitch: 0 }, true);
        announce(`Zoomed in on ${listNames(group)}`);
        return;
      }
      highlight(id);
      flyToStop(id, true);
      announce(`Showing ${labelFor(pin.stop)}`);
      if (typeof onSelect === "function") {
        try {
          onSelect(id);
        } catch (error) {
          console.warn("Journey map selection handler failed", error);
        }
      }
    };
    pinHost.addEventListener("click", (event) => {
      const button = event.target.closest("button.journey-pin");
      if (button) choose(button.dataset.stop);
    });

    // Zoom and reset buttons.
    const controls = figure.querySelector(".journey-map-controls");
    controls?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-map-zoom]");
      if (!button || !map || !ready) return;
      const kind = button.dataset.mapZoom;
      const duration = reducedMotion.matches ? 0 : 400;
      if (kind === "in" || kind === "out") {
        atOverview = false;
        sound("zoom");
        if (kind === "in") map.zoomIn({ duration });
        else map.zoomOut({ duration });
      } else {
        sound("click");
        reset();
        announce(`Showing the globe from ${referenceName}`);
      }
    });

    /* Size and hint. The page keeps scrolling over the map, so the hint says how to zoom it. */
    const setHint = () => {
      if (!hintEl) return;
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      const touch = matchMedia("(hover: none) and (pointer: coarse)").matches;
      if (windowed) {
        hintEl.textContent = touch
          ? "Drag to move the map, pinch to zoom; tap a pin to fly there."
          : "Drag to turn the globe, scroll to zoom; pick a pin to fly there.";
        return;
      }
      hintEl.textContent = touch
        ? "Two fingers move or zoom the map; tap a pin to fly there."
        : `Drag to turn the globe, ${mac ? "⌘" : "Ctrl"} + scroll to zoom; pick a pin to fly there.`;
    };
    // After the frame has changed size (the window resized, or the figure moved between the
    // pane and the map window): fit the canvas to it, let the globe zoom out as far as the new
    // size needs, and, while the camera still shows the whole globe, refit the globe to it.
    const resize = () => {
      if (!map || !ready) return;
      map.resize();
      const floor = Math.max(-2, overviewZoom() - 0.6);
      if (Math.abs(map.getMinZoom() - floor) > 0.01) map.setMinZoom(Math.min(floor, map.getZoom()));
      if (atOverview && !map.isMoving()) map.jumpTo({ zoom: overviewZoom() });
      nudge();
      schedulePins();
      scheduleSpace();
    };

    /* Theme: only the sky around the globe follows the page; the Earth follows the sun. */
    const applyTheme = () => {
      if (!map || !ready) return;
      const sky = map.getSky?.();
      if (sky && map.setSky) {
        map.setSky({ ...sky, ...skyColors(isDark()) });
      }
    };

    /* The flowing dashes on the newest leg. */
    const DASHES = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
      [0, 0.5, 3, 3.5],
      [0, 1, 3, 3],
      [0, 1.5, 3, 2.5],
      [0, 2, 3, 2],
      [0, 2.5, 3, 1.5],
      [0, 3, 3, 1],
      [0, 3.5, 3, 0.5],
    ];
    let dashStep = -1;
    const flow = (time) => {
      flowFrame = 0;
      if (!map || !ready || destroyed) return;
      const step = Math.floor(time / 110) % DASHES.length;
      if (step !== dashStep) {
        dashStep = step;
        map.setPaintProperty("route-flow", "line-dasharray", DASHES[step]);
      }
      flowFrame = requestAnimationFrame(flow);
    };
    // The dashes flow only while the map is on screen (in its pane or its window) and no
    // close-examine window covers the page, so the map can go idle and stop drawing frames.
    const inFront = () => !document.documentElement.classList.contains("has-journey-examine");
    const updateFlow = () => {
      const run = ready && onScreen() && inFront() && !reducedMotion.matches && !document.hidden;
      if (map?.getLayer("route-flow")) map.setLayoutProperty("route-flow", "visibility", reducedMotion.matches ? "none" : "visible");
      if (run && !flowFrame) flowFrame = requestAnimationFrame(flow);
      if (!run && flowFrame) {
        cancelAnimationFrame(flowFrame);
        flowFrame = 0;
      }
    };

    const fail = (error) => {
      if (failed || destroyed) return;
      failed = true;
      if (error) console.warn("Journey map unavailable", error);
      figure.hidden = true;
      try {
        map?.remove();
      } catch (removeError) {
        /* already gone */
      }
      map = null;
      if (typeof onFail === "function") {
        try {
          onFail(error);
        } catch (handlerError) {
          console.warn("Journey map failure handler failed", handlerError);
        }
      }
    };

    /* Start the map once the library has arrived. */
    const start = (maplibregl) => {
      if (destroyed || failed) return;
      try {
        map = new maplibregl.Map({
          container: canvasHost,
          style: buildStyle(tilesBase, routeData, sun, nightPalette),
          ...overviewView(),
          minZoom: Math.max(-2, overviewZoom() - 0.6),
          maxZoom: MAX_ZOOM,
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          // In the page a plain scroll or a one-finger drag scrolls the page (not in the
          // map window: setWindowed).
          cooperativeGestures: !windowed,
          // Every source is named here at all times (not only while its layer is drawn), in
          // the pane and in the map window alike: this (i) control is the only sources credit.
          attributionControl: { compact: true, customAttribution: ATTRIBUTION },
          fadeDuration: 150,
          locale: {
            "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll to zoom the map",
            "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll to zoom the map",
            "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to move the map",
          },
        });
      } catch (error) {
        fail(error);
        return;
      }
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      // The sources start folded behind the (i) button (a <details>), so the list never
      // covers the hint or the controls; pressing (i) opens it.
      const foldAttribution = () => {
        const attribution = canvasHost.querySelector(".maplibregl-ctrl-attrib");
        if (!attribution) return;
        attribution.classList.remove("maplibregl-compact-show");
        attribution.removeAttribute("open");
      };
      foldAttribution();
      map.once("styledata", foldAttribution);
      const canvas = map.getCanvas();
      canvas.setAttribute("aria-label", "Interactive map of my route; drag or use the arrow keys to move it");
      canvas.setAttribute("aria-describedby", "journey-map-keys");
      canvas.addEventListener("keydown", (event) => {
        if (event.key !== "0" || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        sound("click");
        reset();
        announce(`Showing the globe from ${referenceName}`);
      });

      // Errors from unreachable tile or font hosts are expected offline; the bundled
      // imagery, route and pins carry on. Only a failure before the style loads is fatal.
      map.on("error", (event) => {
        if (event?.sourceId === "omt") vectorFailed = true;
        if (!ready && !event?.sourceId && /webgl|context/i.test(String(event?.error?.message || ""))) fail(event.error);
      });
      map.on("webglcontextlost", () => figure.classList.add("is-lost"));
      map.on("webglcontextrestored", () => figure.classList.remove("is-lost"));
      map.on("sourcedata", (event) => {
        if (baseShown || event.sourceId !== "omt" || event.dataType !== "source" || !event.tile) return;
        baseShown = true;
        for (const id of BASE_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      });
      // A drag, scroll or key press takes the camera off the whole-globe view.
      map.on("movestart", (event) => {
        if (event?.originalEvent) atOverview = false;
      });
      map.on("move", () => {
        schedulePins();
        scheduleSpace();
        // Flying from a night city to a day one, the street map turns light on the way down.
        if (ready && map.getZoom() >= BASE_FADE[0] - 0.5) checkPalette();
      });
      map.on("resize", () => {
        schedulePins();
        scheduleSpace();
      });
      map.on("moveend", () => {
        if (!ready) return;
        checkPalette();
        scheduleDetail();
      });
      map.on("load", () => {
        if (destroyed) return;
        try {
          map.addLayer(daylight, map.getLayer("border-state") ? "border-state" : undefined);
        } catch (error) {
          console.warn("Journey map daylight layer unavailable", error);
        }
        ready = true;
        figure.classList.remove("is-loading");
        loadingEl?.remove();
        foldAttribution();
        applyTheme();
        if (pending) {
          const { id, options } = pending;
          pending = null;
          applySelect(id, { ...options, animate: false });
        }
        if (pendingZoom) {
          map.jumpTo({ zoom: map.getZoom() + pendingZoom });
          pendingZoom = 0;
        }
        schedulePins();
        updateFlow();
        if (clockEl) clockEl.hidden = false;
        // The library took a moment to arrive: start from the time it is now.
        shownTime = clock();
        updateSun();
        scheduleLive();
      });
    };

    // Load when the figure is within about a screen of the viewport.
    let loadStarted = false;
    const beginLoad = () => {
      if (loadStarted || destroyed) return;
      loadStarted = true;
      if (!scriptUrl) {
        fail(new Error("No map library path"));
        return;
      }
      loadLibrary(scriptUrl, styleUrl).then(start, fail);
    };
    if (typeof IntersectionObserver === "function") {
      const nearObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          nearObserver.disconnect();
          beginLoad();
        },
        { rootMargin: "900px 0px" }
      );
      nearObserver.observe(loadNear || figure);
      cleanups.push(() => nearObserver.disconnect());
      // The frame: the flowing route runs only while it is on screen.
      const viewObserver = new IntersectionObserver((entries) => {
        const wasOnScreen = onScreen();
        inView = entries.some((entry) => entry.isIntersecting);
        updateFlow();
        if (onScreen() && !wasOnScreen && ready) catchUp();
      });
      viewObserver.observe(frameEl || figure);
      cleanups.push(() => viewObserver.disconnect());
    } else {
      inView = true;
      beginLoad();
    }

    listen(document, "site-theme-change", applyTheme);
    listen(document, "visibilitychange", updateFlow);
    // Back on the page, the live clock catches up at once.
    listen(document, "visibilitychange", () => {
      if (!document.hidden && ready) catchUp();
    });
    const onMotion = () => updateFlow();
    reducedMotion.addEventListener?.("change", onMotion);
    if (typeof MutationObserver === "function") {
      const frontObserver = new MutationObserver(() => updateFlow());
      frontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      cleanups.push(() => frontObserver.disconnect());
    }
    cleanups.push(() => reducedMotion.removeEventListener?.("change", onMotion));
    // The page keeps scrolling over the map, so the hint says how to zoom it instead.
    setHint();

    const api = {
      select(id, options = {}) {
        if (!coords.has(id)) return;
        if (!ready) {
          selected = id;
          pending = { id, options };
          return;
        }
        applySelect(id, options);
      },
      reset,
      isAnimating: () => Boolean(map && map.isMoving()),
      // The controller: start loading now, say whether the map can be seen, and fit the
      // canvas to its pane as that changes size.
      load: () => beginLoad(),
      setShown(value) {
        const was = onScreen();
        shown = Boolean(value);
        updateFlow();
        if (onScreen() && !was && ready) catchUp();
      },
      resize,
      // The figure has moved into the map window (true) or back into its pane (false).
      setWindowed(value) {
        windowed = Boolean(value);
        figure.classList.toggle("is-windowed", windowed);
        try {
          if (map?.cooperativeGestures) {
            if (windowed) map.cooperativeGestures.disable();
            else map.cooperativeGestures.enable();
          }
        } catch (error) {
          /* the map keeps its gestures as they were */
        }
        setHint();
        updateFlow();
      },
      // The clock (for tests): setTime() holds any moment, now() returns to the real time;
      // neither moves the camera. getSun() is the subsolar point, getMode() "live" or "fixed".
      now: () => setTimeMode("live"),
      setTime(value) {
        const time = parseTime(value);
        if (time !== null) setTimeMode("fixed", time);
      },
      getTime: () => shownTime,
      getSun: () => ({ ...sun }),
      getMode: () => mode,
      get map() {
        return map;
      },
      destroy() {
        destroyed = true;
        if (pinsFrame) cancelAnimationFrame(pinsFrame);
        if (flowFrame) cancelAnimationFrame(flowFrame);
        if (haloFrame) cancelAnimationFrame(haloFrame);
        clearTimeout(liveTimer);
        clearTimeout(detailTimer);
        for (const cleanup of cleanups.splice(0)) cleanup();
        try {
          map?.remove();
        } catch (error) {
          /* already gone */
        }
        map = null;
        pinHost.replaceChildren();
        delete figure.journeyMap;
      },
    };
    figure.journeyMap = api;
    return api;
  };

  window.JourneyMap = { mount };
})();

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

// "My Journey" (MapLibre globe, timeline tabs, cork boards, sound) and the PhD callout on
// the homepage. The map's tile hosts are stubbed in every test, so the suite runs offline
// and the globe only paints the imagery bundled in assets/data/journey-map/.
const STOPS = ["hangzhou-early", "fort-lauderdale", "champaign", "hangzhou", "new-york", "evanston"];
const YEARS = ["–2017", "2017", "2021", "2024", "2024", "2026"];
const NAMES = {
  "hangzhou-early": "Hangzhou",
  "fort-lauderdale": "Fort Lauderdale",
  champaign: "Champaign",
  hangzhou: "Hangzhou",
  "new-york": "New York",
  evanston: "Evanston",
};
// [lon, lat] of the stops the map tests fly to, from _data/journey.yml.
const PLACES = { "new-york": [-73.96, 40.81], evanston: [-87.68, 42.06] };

// The journey section shares one machine with the rest of the suite (and a software GPU);
// give each test room under load.
test.describe.configure({ timeout: 120000 });

/* ---------- offline tile hosts ---------- */

// 256 x 256 PNGs: a clear raster tile, and a terrarium elevation tile at sea level.
const CLEAR_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAABFUlEQVR42u3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMBPAAB2ClDBAAAAABJRU5ErkJggg==",
  "base64"
);
const FLAT_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAB+0lEQVR42u3TQQ0AAAjEMED5SeeNBloJS9Yp+GskwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABoBrAcQ8AoDeAlclAAAAAElFTkSuQmCC",
  "base64"
);
const TILE_HOSTS = /^https:\/\/(tiles\.openfreemap\.org|gibs\.earthdata\.nasa\.gov|elevation-tiles-prod\.s3\.amazonaws\.com)\//;

// OpenFreeMap answers with a TileJSON and empty vector tiles and glyph ranges; NASA GIBS
// (imagery, night lights) with clear tiles; the terrain host with sea-level tiles.
async function stubTileHosts(page) {
  await page.route(TILE_HOSTS, (route) => {
    const url = route.request().url();
    if (/openfreemap\.org\/planet/.test(url)) {
      const tilejson = {
        tilejson: "3.0.0",
        tiles: ["https://tiles.openfreemap.org/stub/{z}/{x}/{y}.pbf"],
        minzoom: 0,
        maxzoom: 14,
        vector_layers: [],
      };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(tilejson) });
    }
    if (/openfreemap\.org\//.test(url)) return route.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) });
    if (/amazonaws\.com\//.test(url)) return route.fulfill({ contentType: "image/png", body: FLAT_TILE });
    return route.fulfill({ contentType: "image/png", body: CLEAR_TILE });
  });
}

test.beforeEach(async ({ page }) => {
  await stubTileHosts(page);
});

/* ---------- helpers ---------- */

// Collects uncaught errors and console errors for the whole test.
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
// The browser's own message for a request that was refused (used where hosts are blocked).
const withoutRefusedLoads = (errors) => errors.filter((error) => !/Failed to load resource/.test(error));
// WebKit logs a blob: load it cancels when the page navigates away while the map library is
// still starting its worker (a reload in the middle of loading), not an error of the page.
const withoutNavigationNoise = (errors) => errors.filter((error) => !/\/[0-9a-f-]{36} due to access control checks/.test(error));

const tab = (page, id) => page.locator(`.journey-stops a[data-stop="${id}"]`);
const board = (page, id) => page.locator(`section.journey-board[data-stop="${id}"]`);
const mapFigure = (page) => page.locator("figure[data-journey-map]");
const statusLine = (page) => page.locator("[data-journey-status]");

async function expectSelected(page, id) {
  for (const other of STOPS) {
    await expect(tab(page, other)).toHaveAttribute("aria-selected", String(other === id));
    if (other === id) await expect(board(page, other)).toBeVisible();
    else await expect(board(page, other)).toBeHidden();
  }
  await expect(page.locator('section.journey-board[role="tabpanel"]:visible')).toHaveCount(1);
}

const hasWebGL = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  });

// Opens the homepage (or url) and scrolls to the map, which only loads near the viewport.
async function openJourney(page, url = "/") {
  await page.goto(url);
  await expect(tab(page, "evanston")).toHaveAttribute("role", "tab");
  await page.locator(".journey-stops").scrollIntoViewIfNeeded();
}

// Waits until the map is mounted, its library has started, and its first style has loaded.
// The Map pane keeps one size, so the canvas is never resized here. (Playwright's WebKit
// build on Windows stops painting the globe after its canvas is resized, so pixel checks
// stay in the pane.)
async function mapReady(page) {
  const figure = mapFigure(page);
  await expect(figure).toBeVisible({ timeout: 30000 });
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).not.toHaveClass(/\bis-loading\b/, { timeout: 60000 });
  await expect(figure.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect.poll(() => figure.evaluate((element) => Boolean(element.journeyMap && element.journeyMap.map))).toBe(true);
  await mapIdle(page);
}
const mapIdle = (page) => expect.poll(() => mapFigure(page).evaluate((element) => !element.journeyMap.isAnimating()), { timeout: 30000 }).toBe(true);
const mapView = (page) =>
  mapFigure(page).evaluate((element) => {
    const map = element.journeyMap.map;
    return { center: map.getCenter().toArray(), zoom: map.getZoom() };
  });
const near = ([lon, lat], [lon2, lat2], within) => Math.abs(((lon - lon2 + 540) % 360) - 180) <= within && Math.abs(lat - lat2) <= within;

// Every thread drawn on a board, sampled at 19 points: wherever a document (or a closed
// pile) lies under the thread, the thread must be the higher of the two. Threads never
// take the pointer, so they are made hit-testable only for the duration of the probe.
const stringsOverDocs = (page, id) =>
  board(page, id).evaluate((section) => {
    const cork = section.querySelector(".board-cork");
    const probe = document.createElement("style");
    probe.textContent = ".board-strings path.board-string-yarn { pointer-events: stroke !important; }";
    document.head.append(probe);
    const result = { threads: 0, over: 0, wrong: [] };
    try {
      for (const path of cork.querySelectorAll(":scope > svg.board-strings path.board-string-yarn")) {
        result.threads++;
        const matrix = path.getScreenCTM();
        const length = path.getTotalLength();
        for (let i = 1; i < 20; i++) {
          const point = path.getPointAtLength((length * i) / 20);
          const at = new DOMPoint(point.x, point.y).matrixTransform(matrix);
          if (at.x < 0 || at.y < 0 || at.x >= innerWidth || at.y >= innerHeight) continue;
          const stack = document.elementsFromPoint(at.x, at.y);
          const doc = stack.findIndex((node) => node.closest?.(".board-doc, .board-stack"));
          if (doc < 0) continue;
          result.over++;
          const string = stack.indexOf(path);
          if (string < 0 || string > doc) {
            const top = stack[0];
            result.wrong.push(`${Math.round(at.x)},${Math.round(at.y)} under ${top.id || top.getAttribute("class")}`);
          }
        }
      }
    } finally {
      probe.remove();
    }
    return result;
  });

// Clicks a point of the element where nothing else is on top of it (a paper's title link
// lies over its "examine" button, and an object can lie over a paper's lower edge).
async function clickOwn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const point = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (const fy of [0.75, 0.55, 0.9, 0.35, 0.15]) {
      for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const x = rect.left + rect.width * fx;
        const y = rect.top + rect.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top && (top === element || element.contains(top))) return { x, y };
      }
    }
    return null;
  });
  expect(point, "an uncovered spot on the element").not.toBeNull();
  await page.mouse.click(point.x, point.y);
}

// The px of blur in an element's computed filter (0 when there is none).
const blurPx = (locator) =>
  locator.evaluate((element) => {
    const match = /blur\(([\d.]+)px\)/.exec(getComputedStyle(element).filter);
    return match ? Number(match[1]) : 0;
  });

// Brings a board's cork fully into view (the probe above samples on-screen points only).
// Waits out the board's finite animations (the papers' pin-in entrance when a board is
// shown), so positions are measured where the papers come to rest.
const showCork = (page, id) =>
  board(page, id)
    .locator(".board-cork")
    .evaluate(async (cork) => {
      cork.scrollIntoView({ block: "center" });
      for (let round = 0; round < 3; round++) {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const running = cork.getAnimations({ subtree: true }).filter((animation) => {
          const timing = animation.effect?.getComputedTiming?.();
          return animation.playState === "running" && timing && Number.isFinite(timing.endTime);
        });
        if (!running.length) return;
        await Promise.race([
          Promise.all(running.map((animation) => animation.finished.catch(() => null))),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }
    });

// Mean brightness (0-255) of the middle of the map, read from a screenshot in the page.
async function mapBrightness(page) {
  const shot = await page.locator("[data-map-canvas]").screenshot({ animations: "disabled" });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const [x, y, w, h] = [canvas.width * 0.3, canvas.height * 0.3, canvas.width * 0.4, canvas.height * 0.4].map(Math.round);
    const data = context.getImageData(x, y, w, h).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return sum / (data.length / 4);
  }, shot.toString("base64"));
}

// Every recording in assets/audio/journey/ is decoded once sound wakes up.
const SOUND_FILES = fs.readdirSync(path.join(__dirname, "../../assets/audio/journey")).filter((file) => file.endsWith(".wav")).length;
const journeySound = (page) => page.evaluate(() => (window.JourneySound ? window.JourneySound.status() : null));

/* ---------- PhD callout ---------- */

test("the PhD callout leads the page with email and CV links", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  const callout = page.locator("#phd-applications");
  await expect(callout).toBeVisible();
  expect(await page.locator(".page__content").evaluate((content) => content.firstElementChild?.id)).toBe("phd-applications");
  expect(
    await callout.evaluate((element) =>
      Boolean(element.compareDocumentPosition(document.getElementById("about-me")) & Node.DOCUMENT_POSITION_FOLLOWING)
    )
  ).toBe(true);
  await expect(callout).toHaveAttribute("aria-labelledby", "phd-applications-title");
  await expect(callout).toContainText("Fall 2027");
  await expect(callout.getByRole("link", { name: "Email me" })).toHaveAttribute("href", /^mailto:[^@\s]+@[^@\s]+$/);
  await expect(callout.getByRole("link", { name: "View CV" })).toHaveAttribute("href", /\/assets\/pdf\/cv\.pdf$/);
  const box = await callout.boundingBox();
  const heading = await page.locator("#about-me").boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(heading.y + 1);
  expect(errors).toEqual([]);
});

/* ---------- timeline ---------- */

test("the timeline lists the six places in order and opens on where I am now", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  const list = page.locator(".journey-stops");
  await expect(list).toHaveAttribute("role", "tablist");
  await expect(list.getByRole("tab")).toHaveCount(STOPS.length);
  expect(await list.locator("a.journey-stop").evaluateAll((links) => links.map((link) => link.dataset.stop))).toEqual(STOPS);
  expect(await list.locator(".journey-stop-year").allTextContents()).toEqual(YEARS);
  for (const [index, id] of STOPS.entries()) {
    await expect(tab(page, id)).toContainText(NAMES[id]);
    await expect(tab(page, id)).toHaveAttribute("aria-controls", `journey-${id}`);
    await expect(board(page, id)).toHaveAttribute("id", `journey-${id}`);
    await expect(board(page, id)).toHaveAttribute("role", "tabpanel");
    await expect(board(page, id).locator(".journey-board-case")).toHaveText(`Case file No. 0${index + 1}`);
  }
  await expect(list.locator(".journey-stop--current")).toHaveCount(1);
  await expect(tab(page, "evanston")).toHaveClass(/journey-stop--current/);
  await expectSelected(page, "evanston");
  await expect(tab(page, "evanston")).toHaveAttribute("tabindex", "0");
  await expect(tab(page, "hangzhou-early")).toHaveAttribute("tabindex", "-1");
  await expect(board(page, "evanston").locator(".journey-board-now")).toHaveText("Now");
  expect(errors).toEqual([]);
});

test("arrow keys, Home and End move between tabs; Enter and Space switch boards", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "evanston").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "hangzhou-early")).toBeFocused();
  await expect(tab(page, "hangzhou-early")).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Enter");
  await expectSelected(page, "hangzhou-early");
  await page.keyboard.press("ArrowDown");
  await expect(tab(page, "fort-lauderdale")).toBeFocused();
  await page.keyboard.press("Space");
  await expectSelected(page, "fort-lauderdale");
  await page.keyboard.press("End");
  await expect(tab(page, "evanston")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tab(page, "hangzhou-early")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "evanston")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(tab(page, "new-york")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectSelected(page, "new-york");
  // Leaving the list hands the tab stop back to the selected tab.
  await page.keyboard.press("Tab");
  await expect(tab(page, "new-york")).toHaveAttribute("tabindex", "0");
  await expect(tab(page, "evanston")).toHaveAttribute("tabindex", "-1");
  expect(new URL(page.url()).pathname).toBe("/");
  expect(errors).toEqual([]);
});

test("a #journey link on load opens that board", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/#journey-fort-lauderdale");
  await expectSelected(page, "fort-lauderdale");
  await expect(board(page, "fort-lauderdale")).toBeInViewport();
  await expect(board(page, "fort-lauderdale").locator(".journey-board-title")).toHaveText("Fort Lauderdale, Florida");
  // A later in-page link switches too.
  await page.evaluate(() => {
    location.hash = "#journey-champaign";
  });
  await expectSelected(page, "champaign");
  await expect(board(page, "champaign")).toBeInViewport();
  if (await hasWebGL(page)) {
    await mapReady(page);
    await expect(mapFigure(page).locator(".journey-pin--selected")).toHaveAttribute("data-stop", "champaign");
  }
  expect(errors).toEqual([]);
});

/* ---------- map ---------- */

test("the map loads only near the section, then shows the globe with named pins", async ({ page }) => {
  const errors = watchErrors(page);
  let library = 0;
  page.on("request", (request) => {
    if (request.url().includes("/assets/vendor/maplibre-gl/maplibre-gl.js")) library++;
  });
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so the map stays hidden (covered below)");
  await page.waitForTimeout(1500);
  expect(library, "the map library must not load at the top of the page").toBe(0);
  await mapReady(page);
  expect(library).toBe(1);
  const figure = mapFigure(page);
  await expect(figure.locator("[data-map-loading]")).toHaveCount(0);
  // The first view is the whole globe, facing where I am now, with the current place selected.
  const view = await mapView(page);
  expect(view.zoom).toBeLessThan(2.5);
  expect(near(view.center, PLACES.evanston, 1.5), `centre ${view.center}`).toBe(true);
  const pins = figure.locator("button.journey-pin:visible");
  expect(await pins.count()).toBeGreaterThan(0);
  const shown = new Set();
  for (const pin of await pins.all()) {
    await expect(pin).toHaveAttribute("type", "button");
    const name = await pin.getAttribute("aria-label");
    expect(name).toBeTruthy();
    const cluster = await pin.evaluate((element) => element.classList.contains("journey-pin--cluster"));
    if (cluster) expect(name).toMatch(/: \d places here, zoom in$/);
    for (const id of STOPS) if (name.includes(NAMES[id])) shown.add(id);
  }
  // The current place is named and marked as now.
  expect(shown.has("evanston")).toBe(true);
  await expect(figure.locator(".journey-pin--selected")).toHaveAttribute("data-stop", "evanston");
  await expect(figure.locator(".journey-pin--selected")).toHaveAttribute("aria-label", /Evanston, IL.*(, now|zoom in)/);
  // The controls are labelled buttons in a group; the attribution names the sources.
  const controls = figure.getByRole("group", { name: "Map view" });
  for (const name of ["Zoom in", "Zoom out", "Show the whole globe"]) await expect(controls.getByRole("button", { name })).toBeVisible();
  const credits = await figure.locator(".maplibregl-ctrl-attrib-inner").textContent();
  // Every source is listed at all times (customAttribution), terrain included.
  for (const source of ["NASA GIBS", "OpenFreeMap", "OpenStreetMap", "Mapzen"]) expect(credits).toContain(source);
  await expect(figure.locator("canvas.maplibregl-canvas")).toHaveAttribute("aria-label", /map/i);
  expect(errors).toEqual([]);
});

test("a pin on the map selects its board and tab; clusters zoom in; reset returns to the globe", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no map to click");
  await mapReady(page);
  const figure = mapFigure(page);
  const before = await mapView(page);
  // Find a single pin for another place; clusters zoom in when pressed until places split.
  let target = null;
  for (let round = 0; round < 5 && !target; round++) {
    for (const pin of await figure.locator("button.journey-pin:visible").all()) {
      const [id, cluster] = await pin.evaluate((element) => [element.dataset.stop, element.classList.contains("journey-pin--cluster")]);
      if (!cluster && id !== "evanston") {
        target = id;
        break;
      }
    }
    if (target) break;
    const cluster = figure.locator("button.journey-pin--cluster:visible").first();
    if (!(await cluster.count())) break;
    const zoom = (await mapView(page)).zoom;
    await cluster.click();
    await expect(statusLine(page)).toHaveText(/^Zoomed in on /);
    await mapIdle(page);
    expect((await mapView(page)).zoom).toBeGreaterThan(zoom);
    // Zooming in on a cluster chooses no place.
    await expectSelected(page, "evanston");
  }
  if (!target) {
    // Turn the map to a place from script: that must not change the tab by itself.
    target = "new-york";
    await figure.evaluate((element) => element.journeyMap.select("new-york", { animate: false }));
    await mapIdle(page);
    await expectSelected(page, "evanston");
  }
  const pin = figure.locator(`button.journey-pin[data-stop="${target}"]`);
  await expect(pin).toBeVisible();
  await pin.click();
  await expectSelected(page, target);
  // Choosing a place on the map shows that place on the board beside it.
  await expect(statusLine(page)).toHaveText(new RegExp(`^Showing ${NAMES[target]}`));
  await expect(pin).toHaveClass(/journey-pin--selected/);
  await expect(pin).toHaveAttribute("aria-current", "true");
  // A pin chooses the tab without stealing focus.
  await expect(tab(page, target)).not.toBeFocused();
  await mapIdle(page);
  expect((await mapView(page)).zoom).toBeGreaterThan(before.zoom + 3);
  // Close in, the terrain shading is drawn and credited too.
  await expect(figure.locator(".maplibregl-ctrl-attrib-inner")).toContainText("Mapzen, USGS, NOAA");
  // A tab flies the map to its place.
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  await mapIdle(page);
  expect(near((await mapView(page)).center, PLACES["new-york"], 0.5)).toBe(true);
  // Zoom buttons, then reset back to the whole globe facing Evanston.
  const zoom = (await mapView(page)).zoom;
  await figure.getByRole("button", { name: "Zoom out" }).click();
  await mapIdle(page);
  expect((await mapView(page)).zoom).toBeLessThan(zoom - 0.5);
  await figure.getByRole("button", { name: "Show the whole globe" }).click();
  await mapIdle(page);
  const reset = await mapView(page);
  expect(reset.zoom).toBeLessThan(2.5);
  expect(near(reset.center, PLACES.evanston, 1.5), `centre ${reset.center}`).toBe(true);
  await expect(statusLine(page)).toHaveText(/Evanston/);
  expect(errors).toEqual([]);
});

test("the globe is lit by the sun at the real time and never turns by itself", async ({ page }) => {
  const errors = watchErrors(page);
  // 17:00 UTC on the June solstice is noon in Evanston (CDT).
  await openJourney(page, "/?journey-time=2026-06-21T17:00:00Z");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no globe to light");
  await mapReady(page);
  const figure = mapFigure(page);
  const api = (method, ...args) => figure.evaluate((element, [name, values]) => element.journeyMap[name](...values), [method, args]);
  const clock = figure.locator("[data-map-clock]");
  // The test hook holds the clock; the sun stands over the Tropic of Cancer at about 75°W.
  expect(await api("getMode")).toBe("fixed");
  await expect(figure).toHaveAttribute("data-time-mode", "fixed");
  let sun = await api("getSun");
  expect(sun.lat).toBeCloseTo(23.44, 1);
  expect(Math.abs(sun.lon + 74.6)).toBeLessThan(0.6);
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute("data-phase", "day");
  await expect(clock).toContainText("Evanston");
  await expect(clock).toContainText(/12:00\s?PM CDT/);
  await expect(clock).toContainText("Daylight");
  await expect(clock).toContainText("Fixed time");
  const view = await mapView(page);
  expect(near(view.center, PLACES.evanston, 1.5)).toBe(true);
  const noon = await mapBrightness(page);
  expect(noon, "the lit globe paints its imagery").toBeGreaterThan(25);

  // Midnight in Evanston: the same view goes dark, and the camera does not move.
  await api("setTime", "2026-06-21T05:00:00Z");
  await expect(clock).toHaveAttribute("data-phase", "night");
  await expect(clock).toContainText(/12:00\s?AM CDT/);
  await expect(clock).toContainText("Night");
  sun = await api("getSun");
  expect(Math.abs(sun.lon - 105.4)).toBeLessThan(0.6);
  await expect.poll(() => mapBrightness(page), { timeout: 15000 }).toBeLessThan(noon * 0.6);
  expect((await mapView(page)).center).toEqual(view.center);

  // One hour later the sun is 15° further west.
  await api("setTime", "2026-06-21T06:00:00Z");
  const later = await api("getSun");
  expect(later.lon - sun.lon).toBeCloseTo(-15, 1);

  // There is no time-lapse: no play, pause or "now" button, and the live clock follows
  // real time (a step every 10 s) while the view stays where it is.
  await expect(figure.getByRole("button", { name: /play|pause|now|time-?lapse/i })).toHaveCount(0);
  await expect(page.locator("[data-map-play], [data-map-now]")).toHaveCount(0);
  await api("now");
  expect(await api("getMode")).toBe("live");
  await expect(clock).toHaveAttribute("data-mode", "live");
  await expect(clock).toContainText("Live");
  // Time and sun are read together, so a live step cannot fall between them.
  const reading = () => figure.evaluate((element) => ({ time: element.journeyMap.getTime(), sun: element.journeyMap.getSun() }));
  const first = await reading();
  expect(Math.abs(first.time - (await page.evaluate(() => Date.now())))).toBeLessThan(15000);
  await expect.poll(async () => (await reading()).time, { timeout: 25000, intervals: [1000] }).toBeGreaterThan(first.time + 5000);
  const second = await reading();
  const moved = ((second.sun.lon - first.sun.lon + 540) % 360) - 180;
  expect(moved).toBeCloseTo((-15 * (second.time - first.time)) / 3600000, 3);
  expect((await mapView(page)).center).toEqual(view.center);
  expect(errors).toEqual([]);
});

test("the route flies in arcs that rise off the globe, higher for longer legs, the newest leg's dashes flowing", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page, "/?journey-time=2026-06-21T17:00:00Z");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no route to draw");
  await mapReady(page);
  const figure = mapFigure(page);
  const route = await figure.evaluate((element) => element.journeyMap.getRoute());
  // The arcs have their own layer; the lines on the ground are only its fallback, hidden, so
  // nothing is drawn twice.
  expect(route.drawn).toBe("arcs");
  const ground = ["route-glow", "route-case", "route", "route-flow"];
  const shown = await figure.evaluate((element, ids) => ids.map((id) => element.journeyMap.map.getLayoutProperty(id, "visibility")), ground);
  expect(shown).toEqual(ground.map(() => "none"));
  // One arc a leg, in order, the newest (age 0) into Evanston.
  expect(route.legs.map((leg) => `${leg.from} ${leg.to} ${leg.age}`)).toEqual(
    STOPS.slice(1).map((id, i) => `${STOPS[i]} ${id} ${STOPS.length - 2 - i}`)
  );
  // Higher for longer flights, never more than a fifth of the Earth's radius; a short hop
  // still gets a hump.
  const byLength = [...route.legs].sort((a, b) => a.km - b.km);
  for (let i = 1; i < byLength.length; i++) expect(byLength[i].peakKm).toBeGreaterThan(byLength[i - 1].peakKm);
  for (const leg of route.legs) {
    expect(leg.peakKm).toBeGreaterThan(100);
    expect(leg.peakKm).toBeLessThan(0.2 * 6371);
  }
  // On the whole globe each long leg's midpoint is in sight, lifted well off the ground under
  // it: farther out from the globe's centre (the centre of the view, lower than the middle
  // of the canvas where the globe moves down to clear the clock). Each arc also leans to one
  // side, so it is never seen edge-on from here: its midpoint moves sideways too.
  const canvas = figure.locator("[data-map-canvas]");
  const box = await canvas.boundingBox();
  const centre = await figure.evaluate((element) => element.journeyMap.map.project(element.journeyMap.map.getCenter()));
  const fromCentre = ({ x, y }) => Math.hypot(x - centre.x, y - centre.y);
  const sideways = ({ x, y }, ground) => {
    const [rx, ry] = [ground.x - centre.x, ground.y - centre.y];
    return Math.abs((x - ground.x) * ry - (y - ground.y) * rx) / Math.hypot(rx, ry);
  };
  const long = route.legs.filter((leg) => leg.km > 5000);
  expect(long).toHaveLength(3);
  for (const leg of long) {
    expect(leg.peak.visible, `${leg.from} to ${leg.to}`).toBe(true);
    expect(fromCentre(leg.peak) - fromCentre(leg.ground), `${leg.from} to ${leg.to}`).toBeGreaterThan(8);
    expect(sideways(leg.peak, leg.ground), `${leg.from} to ${leg.to}`).toBeGreaterThan(5);
  }
  // The whole-globe view leaves room for the arcs, at full height: every midpoint in the
  // frame and below the clock.
  const clock = await figure.locator("[data-map-clock]").boundingBox();
  for (const leg of route.legs) {
    expect(leg.lift, `${leg.from} to ${leg.to}`).toBe(1);
    expect(box.y + leg.peak.y, `${leg.from} to ${leg.to}`).toBeGreaterThan(clock.y + clock.height);
    expect(leg.peak.y, `${leg.from} to ${leg.to}`).toBeLessThan(box.height);
  }
  // And drawn there: hiding the arcs changes the picture at each long leg's peak (least at the
  // oldest, the dimmest), and much less on the ground under the latest one (no other leg
  // passes there).
  const overlays = ".journey-map-frame > :not([data-map-canvas]) { visibility: hidden !important; }";
  const withArcs = await canvas.screenshot({ animations: "disabled", style: overlays });
  await figure.evaluate(
    (element) =>
      new Promise((resolve) => {
        const map = element.journeyMap.map;
        map.setLayoutProperty("route-arcs", "visibility", "none");
        map.once("render", () => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        map.triggerRepaint();
      })
  );
  const withoutArcs = await canvas.screenshot({ animations: "disabled", style: overlays });
  const latest = long.find((leg) => leg.to === "new-york");
  const changes = await page.evaluate(
    async ([before, after, points, width]) => {
      const pixels = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        return canvas.getContext("2d");
      };
      const [a, b] = [await pixels(before), await pixels(after)];
      const scale = a.canvas.width / width;
      // The largest change of color within 2 CSS px of each point.
      return points.map(({ x, y }) => {
        const r = Math.ceil(2 * scale);
        const area = [Math.round(x * scale) - r, Math.round(y * scale) - r, 2 * r + 1, 2 * r + 1];
        const [p, q] = [a.getImageData(...area).data, b.getImageData(...area).data];
        let most = 0;
        for (let i = 0; i < p.length; i += 4)
          most = Math.max(most, Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]));
        return most;
      });
    },
    [withArcs.toString("base64"), withoutArcs.toString("base64"), [...long.map((leg) => leg.peak), latest.ground], box.width]
  );
  for (const [i, leg] of long.entries()) expect(changes[i], `${leg.from} to ${leg.to} (changes ${changes})`).toBeGreaterThan(100);
  expect(changes[long.length], `changes ${changes}`).toBeLessThan(70);
  await figure.evaluate((element) => element.journeyMap.map.setLayoutProperty("route-arcs", "visibility", "visible"));
  // The newest leg's dashes flow while the map is on screen.
  expect(route.dashesShown).toBe(true);
  await expect.poll(() => figure.evaluate((element) => element.journeyMap.getRoute().flowing)).toBe(true);
  await expect.poll(() => figure.evaluate((element) => element.journeyMap.getRoute().dashOffset)).not.toBe(route.dashOffset);
  // Closer in, each arc comes down (and leans less) to stay in view over the ground it flies
  // over: the oldest leg over the Arctic, the newest between New York and Evanston. The
  // dashes redraw the map only while the newest leg is in sight.
  const over = (leg, zoom) =>
    figure.evaluate(
      async (element, [center, zoom]) => {
        element.journeyMap.map.jumpTo({ center, zoom, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return element.journeyMap.getRoute();
      },
      [leg.middle, zoom]
    );
  const renders = () =>
    figure.evaluate(
      (element) =>
        new Promise((resolve) => {
          const map = element.journeyMap.map;
          let count = 0;
          const tick = () => (count += 1);
          map.on("render", tick);
          setTimeout(() => {
            map.off("render", tick);
            resolve(count);
          }, 1000);
        })
    );
  const inFrame = ({ x, y, visible }) => visible && x > 0 && y > 0 && x < box.width && y < box.height;
  for (const [index, zoom] of [
    [0, 4.5],
    [route.legs.length - 1, 9],
  ]) {
    const leg = (await over(route.legs[index], zoom)).legs[index];
    expect(leg.lift, `${leg.from} to ${leg.to} at zoom ${zoom}`).toBeLessThan(1);
    expect(inFrame(leg.peak), `${leg.from} to ${leg.to} at zoom ${zoom}: ${JSON.stringify(leg.peak)}`).toBe(true);
    // Over the imagery the arcs fly over the labels; on the street map they pass under them.
    const order = await figure.evaluate((element) => element.journeyMap.map.getLayersOrder());
    if (zoom < 8) expect(order.at(-1)).toBe("route-arcs");
    else expect(order.indexOf("route-arcs")).toBe(order.indexOf("label-road") - 1);
    const newest = index === route.legs.length - 1;
    await expect.poll(() => figure.evaluate((element) => element.journeyMap.getRoute().dashesInView)).toBe(newest);
    if (newest) await expect.poll(renders, { timeout: 15000 }).toBeGreaterThan(4);
    else await expect.poll(renders, { timeout: 15000 }).toBeLessThan(3);
  }
  // Reduced motion turned on with the page open stops the dashes, and the map with them.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => figure.evaluate((element) => element.journeyMap.getRoute())).toMatchObject({ dashesShown: false, flowing: false });
  await expect.poll(renders, { timeout: 15000 }).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("Ctrl + scroll over the map never zooms the page, even while the map is loading", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  // Hold the map library back so the figure shows its loading state for as long as needed.
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/assets/vendor/maplibre-gl/maplibre-gl.js", async (route) => {
    await gate;
    await route.continue();
  });
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so the map stays hidden");
  const figure = mapFigure(page);
  await expect(figure).toBeVisible();
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveClass(/\bis-loading\b/);
  const frame = figure.locator(".journey-map-frame");
  const pageScale = () => page.evaluate(() => [devicePixelRatio, window.visualViewport ? visualViewport.scale : 1]);
  const scale = await pageScale();
  // A ctrl (or ⌘) wheel, as a trackpad pinch also arrives, is taken by the map; a plain one is not.
  const wheel = (init) =>
    frame.evaluate(
      (element, options) => element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -240, ...options })),
      init
    );
  expect(await wheel({ ctrlKey: true }), "ctrl + wheel is cancelled").toBe(false);
  expect(await wheel({ metaKey: true }), "⌘ + wheel is cancelled").toBe(false);
  expect(await wheel({}), "a plain wheel is left to the page").toBe(true);
  if (testInfo.project.name === "desktop") {
    const box = await frame.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -240);
    await page.keyboard.up("Control");
    // Plain scrolling over the map still scrolls the page.
    const top = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -200);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(top);
  }
  expect(await pageScale(), "the page is not zoomed").toEqual(scale);
  await expect(figure).toHaveClass(/\bis-loading\b/);
  // The zoom asked for while loading is applied once the map starts.
  release();
  await mapReady(page);
  const zoomed = (await mapView(page)).zoom;
  await figure.evaluate((element) => element.journeyMap.reset({ animate: false }));
  expect(zoomed).toBeGreaterThan((await mapView(page)).zoom + 0.5);
  expect(await pageScale()).toEqual(scale);
  expect(errors).toEqual([]);
});

// The sizes of the two panes' bodies and the board's own width and transform, rounded to
// half a pixel (x and size only: the page may scroll vertically between readings).
const paneSizes = (page) =>
  page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [rect.x, rect.width, rect.height].map((value) => Math.round(value * 2) / 2);
    };
    const boards = document.querySelector("[data-journey-boards]");
    return {
      map: box('[data-journey-pane="map"] .journey-pane-body'),
      board: box('[data-journey-pane="board"] .journey-pane-body'),
      width: boards.style.width,
      transform: boards.style.transform,
    };
  });

// Finds a single (not clustered) pin for a place other than skip inside scope, pressing
// clusters to zoom in until places split; null if none turns up.
async function singlePin(page, scope, skip) {
  for (let round = 0; round < 5; round++) {
    for (const pin of await scope.locator("button.journey-pin:visible").all()) {
      const [id, cluster] = await pin.evaluate((element) => [element.dataset.stop, element.classList.contains("journey-pin--cluster")]);
      if (!cluster && id !== skip) return id;
    }
    const cluster = scope.locator("button.journey-pin--cluster:visible").first();
    if (!(await cluster.count())) return null;
    await cluster.click();
    await mapIdle(page);
  }
  return null;
}

test("the map and the board keep one size each, whatever is clicked, focused or chosen", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so the board is shown alone");
  const root = page.locator("[data-journey]");
  const mapPane = page.getByRole("region", { name: "Map", exact: true });
  const boardPane = page.getByRole("region", { name: "Board", exact: true });
  await expect(mapPane).toBeVisible();
  await expect(boardPane).toBeVisible();
  await mapReady(page);
  await expect(page.getByText(/places I have lived/i)).toHaveCount(0);
  // There is no "room" to hand over any more: no dominant pane, no cover, no Expand board.
  expect(await root.evaluate((element) => element.hasAttribute("data-dominant"))).toBe(false);
  await expect(page.getByRole("button", { name: /expand board/i })).toHaveCount(0);
  await expect(page.locator("[data-journey-shield], .journey-pane-shield, [data-journey-expand]")).toHaveCount(0);
  await expect(page.getByText(/click to focus/i)).toHaveCount(0);
  await expect(mapPane.getByRole("button", { name: "Expand map" })).toBeVisible();

  const layout = await root.getAttribute("data-layout");
  expect(["split", "stack"]).toContain(layout);
  const first = await paneSizes(page);
  const [mapX, mapW, mapH] = first.map;
  const [boardX, boardW, boardH] = first.board;
  if (layout === "split") {
    // Side by side, never over each other, one height, the board about two thirds.
    expect(mapX + mapW).toBeLessThanOrEqual(boardX + 1);
    expect(Math.abs(mapH - boardH)).toBeLessThan(2);
    const share = boardW / (mapW + boardW);
    expect(share).toBeGreaterThan(0.62);
    expect(share).toBeLessThan(0.7);
    // The board is laid out at its pane's width, not scaled.
    expect(Math.abs(parseFloat(first.width) - boardW)).toBeLessThan(1.5);
    expect(first.transform).toBe("");
  } else {
    // A phone: the map on top, the board under it at its full width.
    const map = await mapPane.locator(".journey-pane-body").boundingBox();
    const boardBox = await boardPane.locator(".journey-pane-body").boundingBox();
    expect(map.y + map.height).toBeLessThanOrEqual(boardBox.y + 1);
  }
  // The canvas fills its pane without stretching.
  const canvas = mapFigure(page).locator("canvas.maplibregl-canvas");
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const frame = element.closest(".journey-map-frame").getBoundingClientRect();
        const own = element.getBoundingClientRect();
        return Math.abs(own.width - frame.width) < 3 && Math.abs(own.height - frame.height) < 3;
      })
    )
    .toBe(true);

  const unchanged = async (what) => {
    // Longer than the old width change took, so a change would have shown.
    await page.waitForTimeout(600);
    expect(await paneSizes(page), `the panes keep their sizes after ${what}`).toEqual(first);
  };
  // A click on the map (not on a pin), and focus inside it.
  const frame = mapPane.locator(".journey-map-frame");
  const frameBox = await frame.boundingBox();
  await page.mouse.click(frameBox.x + 12, frameBox.y + frameBox.height * 0.55);
  await unchanged("a click on the map");
  await mapPane.locator('[data-map-zoom="in"]').focus();
  await unchanged("focus in the map");
  // A click on the board's own bar, a click on the board's edge, and focus on a paper.
  await boardPane.locator(".journey-pane-label").click();
  await board(page, "evanston").locator(".board-surface").dispatchEvent("click");
  await unchanged("a click on the board");
  await board(page, "evanston").locator(".board-doc-open").first().focus();
  await unchanged("focus on the board");
  // A pin on the map.
  const target = await singlePin(page, mapFigure(page), "evanston");
  if (target) {
    await mapFigure(page).locator(`button.journey-pin[data-stop="${target}"]`).click();
    await expectSelected(page, target);
    await unchanged("a pin");
  }
  // A timeline tab.
  await tab(page, "champaign").click();
  await expectSelected(page, "champaign");
  await unchanged("a tab");
  expect(await root.evaluate((element) => element.hasAttribute("data-dominant"))).toBe(false);
  expect(errors).toEqual([]);
});

test("on a phone the map sits above the board at one fixed height", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 390, height: 844 });
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so the board is shown alone");
  const root = page.locator("[data-journey]");
  await expect(root).toHaveAttribute("data-layout", "stack");
  expect(await root.evaluate((element) => element.hasAttribute("data-dominant"))).toBe(false);
  const mapBody = page.locator('[data-journey-pane="map"] .journey-pane-body');
  const boardBody = page.locator('[data-journey-pane="board"] .journey-pane-body');
  const viewport = page.viewportSize();
  const map = await mapBody.boundingBox();
  const boardBox = await boardBody.boundingBox();
  expect(map.y + map.height).toBeLessThanOrEqual(boardBox.y + 1);
  // About 42% of the window high, between 260 and 420 px.
  const want = Math.min(420, Math.max(260, viewport.height * 0.42));
  expect(Math.abs(map.height - want)).toBeLessThan(Math.max(6, want * 0.06));
  // The board takes the section's full width, unscaled.
  const split = await page.locator("[data-journey-split]").boundingBox();
  expect(Math.abs(boardBox.width - split.width)).toBeLessThan(2);
  expect(await page.locator("[data-journey-boards]").evaluate((element) => element.style.transform)).toBe("");
  // A tap on the map or a tab changes neither size.
  const first = await paneSizes(page);
  await page.mouse.click(map.x + 12, map.y + map.height * 0.55);
  await tab(page, "champaign").click();
  await expectSelected(page, "champaign");
  await page.waitForTimeout(600);
  const after = await paneSizes(page);
  expect(after.map.slice(1)).toEqual(first.map.slice(1));
  expect(after.board.slice(0, 2)).toEqual(first.board.slice(0, 2));
  expect(withoutNavigationNoise(errors)).toEqual([]);
});

test("Expand map opens the live map in a window that Escape, Close map and a click outside close", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no map to expand");
  await mapReady(page);
  const figure = mapFigure(page);
  const mapPane = page.getByRole("region", { name: "Map", exact: true });
  const open = mapPane.getByRole("button", { name: "Expand map" });
  await expect(open).toHaveAttribute("aria-haspopup", "dialog");
  const dialog = page.getByRole("dialog", { name: "Map" });
  await expect(dialog).toBeHidden();
  const inPane = () => figure.evaluate((element) => Boolean(element.closest(".journey-pane-body")));
  const inWindow = () => figure.evaluate((element) => Boolean(element.closest("[data-journey-map-window]")));
  const canvases = () => page.locator("canvas.maplibregl-canvas").count();
  expect(await inPane()).toBe(true);
  const panes = await paneSizes(page);
  const viewBefore = await mapView(page);

  await open.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // The same map moves in: one canvas on the page, inside the window.
  expect(await inWindow()).toBe(true);
  await expect(dialog.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  expect(await canvases()).toBe(1);
  await expect(dialog.getByRole("button", { name: "Close map" })).toBeFocused();
  // A window, not the whole screen: about min(1240, 92vw) x min(800, 86vh) (96vw x 88vh on a
  // phone), inside the viewport, with rounded corners.
  await page.waitForTimeout(400);
  // Measured once the opening scale-in has run (it can lag behind a busy main thread).
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const viewport = page.viewportSize();
  const phone = viewport.width < 700;
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  const wantW = phone ? viewport.width * 0.96 : Math.min(1240, viewport.width * 0.92);
  const wantH = phone ? viewport.height * 0.88 : Math.min(800, viewport.height * 0.86);
  expect(Math.abs(box.width - wantW)).toBeLessThan(Math.max(4, wantW * 0.03));
  expect(Math.abs(box.height - wantH)).toBeLessThan(Math.max(4, wantH * 0.03));
  expect(await dialog.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThan(6);
  // The canvas fills the window's body without stretching, and the controls work there.
  const canvas = dialog.locator("canvas.maplibregl-canvas");
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const frame = element.closest(".journey-map-frame").getBoundingClientRect();
        const own = element.getBoundingClientRect();
        return frame.width > 300 && Math.abs(own.width - frame.width) < 3 && Math.abs(own.height - frame.height) < 3;
      })
    )
    .toBe(true);
  await expect(dialog.locator("[data-map-clock]")).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Map view" })).toBeVisible();
  // The camera stays on the same place.
  await mapIdle(page);
  expect(near((await mapView(page)).center, viewBefore.center, 1)).toBe(true);
  const zoom = (await mapView(page)).zoom;
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await mapIdle(page);
  expect((await mapView(page)).zoom).toBeGreaterThan(zoom + 0.5);
  await dialog.getByRole("button", { name: "Show the whole globe" }).click();
  await mapIdle(page);
  // The page behind neither scrolls nor zooms: a ctrl (pinch) wheel over the bar or the
  // dimmed page is cancelled.
  const scrollY = await page.evaluate(() => window.scrollY);
  const wheel = (selector, init) =>
    page.evaluate(
      ([target, options]) =>
        document.querySelector(target).dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -240, ...options })),
      [selector, init]
    );
  expect(await wheel("[data-journey-map-window]", { ctrlKey: true }), "ctrl + wheel over the window is cancelled").toBe(false);
  expect(await wheel(".journey-map-window-bar", {}), "a wheel over the window's bar is cancelled").toBe(false);
  expect(await wheel("[data-journey-map-window] .journey-map-frame", {}), "a plain wheel over the map is the map's").toBe(false);
  if (testInfo.project.name === "desktop") {
    await page.mouse.move(3, Math.round(viewport.height / 2));
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(await page.evaluate(() => (window.visualViewport ? visualViewport.scale : 1))).toBe(1);
  // Focus stays inside the window.
  if (testInfo.project.name === "desktop") {
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-journey-map-window]")))).toBe(true);
    }
  }
  // A pin chosen in the window selects its place behind it; the window stays open.
  const target = await singlePin(page, dialog, "evanston");
  if (target) {
    await dialog.locator(`button.journey-pin[data-stop="${target}"]`).click();
    await expectSelected(page, target);
    await expect(dialog).toBeVisible();
    await expect(statusLine(page)).toHaveText(new RegExp(`^Showing ${NAMES[target]}`));
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  }

  // Escape closes it: the map goes back to its pane and focus back to the button.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(inPane).toBe(true);
  expect(await canvases()).toBe(1);
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  expect(await paneSizes(page), "the panes keep their sizes after the window").toEqual(panes);
  await expect
    .poll(() =>
      figure.locator("canvas.maplibregl-canvas").evaluate((element) => {
        const frame = element.closest(".journey-map-frame").getBoundingClientRect();
        const own = element.getBoundingClientRect();
        return Math.abs(own.width - frame.width) < 3 && Math.abs(own.height - frame.height) < 3;
      })
    )
    .toBe(true);
  // Close map closes it too.
  await open.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close map" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(inPane).toBe(true);
  await expect(open).toBeFocused();
  // And so does a click on the dimmed page outside the window.
  await open.click();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(350);
  await page.mouse.click(3, Math.round(viewport.height / 2));
  await expect(dialog).toBeHidden();
  await expect.poll(inPane).toBe(true);
  await expect(open).toBeFocused();
  await expect(page.locator("html")).not.toHaveClass(/has-journey-map-window/);
  expect(errors).toEqual([]);
});

test("reduced motion opens and closes the map window at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no map to expand");
  await mapReady(page);
  const dialog = page.getByRole("dialog", { name: "Map" });
  await page.getByRole("button", { name: "Expand map" }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.keyboard.press("Escape");
  // Closed in the same moment: the map is back in its pane at once.
  expect(await mapFigure(page).evaluate((element) => Boolean(element.closest(".journey-pane-body")))).toBe(true);
  await expect(dialog).toBeHidden();
});

test("the sources caption is gone and the map's (i) control names every source", async ({ page }) => {
  await openJourney(page);
  await expect(page.locator(".journey-credits, [data-journey-credits]")).toHaveCount(0);
  test.skip(!(await hasWebGL(page)), "without the map there is no attribution control");
  const figure = mapFigure(page);
  await expect(figure.locator(".maplibregl-ctrl-attrib-inner")).toBeAttached({ timeout: 20000 });
  const credits = await figure.locator(".maplibregl-ctrl-attrib-inner").textContent();
  for (const source of ["NASA GIBS", "Blue Marble", "Black Marble", "OpenStreetMap contributors", "OpenFreeMap", "Mapzen, USGS, NOAA"]) {
    expect(credits).toContain(source);
  }
  await expect(figure.locator('.maplibregl-ctrl-attrib-inner a[href="https://www.openstreetmap.org/copyright"]')).toHaveCount(1);
  // Each board keeps its own tiny street-map credit.
  await expect(page.locator(".board-map-credit").first()).toContainText("OpenStreetMap contributors");
});

test("without WebGL the map stays hidden and the timeline still switches boards", async ({ page }) => {
  const errors = watchErrors(page);
  let library = 0;
  page.on("request", (request) => {
    if (request.url().includes("maplibre-gl")) library++;
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(type)) return null;
      return original.call(this, type, ...rest);
    };
  });
  await openJourney(page);
  await page.locator("[data-journey]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await expect(mapFigure(page)).toBeHidden();
  expect(library).toBe(0);
  await expect(page.locator(".journey-stops")).toBeVisible();
  await tab(page, "champaign").click();
  await expectSelected(page, "champaign");
  expect(errors).toEqual([]);
});

test("if the map library cannot load, the map hides and the timeline carries on", async ({ page }) => {
  const errors = watchErrors(page);
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.route("**/assets/vendor/maplibre-gl/maplibre-gl.js", (route) => route.abort());
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so the library is never requested");
  await page.locator("[data-journey]").scrollIntoViewIfNeeded();
  await expect(mapFigure(page)).toBeHidden({ timeout: 30000 });
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  expect(warnings.some((warning) => /Journey map unavailable/.test(warning))).toBe(true);
  expect(withoutRefusedLoads(errors)).toEqual([]);
});

test("with the tile hosts unreachable the bundled imagery still shows the globe and pins", async ({ page }) => {
  const errors = watchErrors(page);
  await page.unroute(TILE_HOSTS);
  await page.route(TILE_HOSTS, (route) => route.abort());
  await openJourney(page);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no map");
  await mapReady(page);
  expect(await mapBrightness(page)).toBeGreaterThan(15);
  expect(await mapFigure(page).locator("button.journey-pin:visible").count()).toBeGreaterThan(0);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await mapIdle(page);
  expect(withoutRefusedLoads(errors)).toEqual([]);
});

/* ---------- boards ---------- */

test("every board keeps one fixed size, holds its papers inside, and shows its photos", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  let size = null;
  for (const id of [...STOPS, "evanston"]) {
    await tab(page, id).click();
    await expectSelected(page, id);
    const cork = board(page, id).locator(".board-cork");
    await expect(cork).toBeVisible();
    await showCork(page, id);
    // Photos load (lazy images become eager once their board is shown) and are described.
    const images = board(page, id).locator("img");
    expect(await images.count(), `${id} has photos`).toBeGreaterThan(0);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute("alt", /\S{3}/);
      await image.evaluate((element) => {
        element.loading = "eager";
      });
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth), { timeout: 20000 }).toBeGreaterThan(0);
    }
    // Each sourced picture credits its author with a link to its source page (Wikimedia
    // Commons for the openly licensed ones; see assets/img/journey/CREDITS.md).
    const credits = board(page, id).locator(".board-doc-credit a");
    expect(await credits.count()).toBeGreaterThan(0);
    for (const credit of await credits.all()) await expect(credit).toHaveAttribute("href", /^https:\/\/[^\s/]+\.[a-z]{2,}\//);
    expect(await credits.evaluateAll((links) => links.some((link) => /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(link.href)))).toBe(true);
    // The board is the same size for every place; papers never stick out of the cork.
    const box = await cork.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const outside = [...element.querySelectorAll(":scope > .board-docs > li")]
        .filter((item) => {
          const r = item.getBoundingClientRect();
          return r.left < rect.left - 2 || r.top < rect.top - 2 || r.right > rect.right + 2 || r.bottom > rect.bottom + 2;
        })
        .map((item) => item.id);
      return { width: rect.width, height: rect.height, outside, items: element.querySelectorAll(":scope > .board-docs > li").length };
    });
    expect(box.outside, `${id} papers outside the cork`).toEqual([]);
    expect(box.items).toBeLessThanOrEqual(9);
    if (!size) size = box;
    expect(Math.abs(box.width - size.width), id).toBeLessThan(1);
    expect(Math.abs(box.height - size.height), id).toBeLessThan(1);
  }
  expect(errors).toEqual([]);
});

test("threads lie over the papers at rest, on hover and after a paper is opened", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const touch = Boolean(testInfo.project.use.hasTouch);
  await openJourney(page);
  let over = 0;
  for (const id of STOPS) {
    await tab(page, id).click();
    await expectSelected(page, id);
    await showCork(page, id);
    const rest = await stringsOverDocs(page, id);
    expect(rest.threads, `${id} threads`).toBeGreaterThan(0);
    expect(rest.wrong, `${id} at rest`).toEqual([]);
    over += rest.over;
    // Open the first paper's detail view, close it, and check again.
    const opener = board(page, id).locator(".board-doc-open:visible").first();
    await clickOwn(page, opener);
    await expect(page.locator("dialog.journey-examine")).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.journey-examine")).not.toHaveAttribute("open", "", { timeout: 20000 });
    await showCork(page, id);
    expect((await stringsOverDocs(page, id)).wrong, `${id} after opening a paper`).toEqual([]);
    if (!touch) {
      for (const item of (await board(page, id).locator(".board-docs > li:visible").all()).slice(0, 4)) {
        await item.hover();
        expect((await stringsOverDocs(page, id)).wrong, `${id} hovering ${await item.getAttribute("id")}`).toEqual([]);
      }
    }
  }
  // The check is meaningful: threads do cross many papers.
  expect(over).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test("a paper opens in the examine window that Escape, Back and a click outside dismiss, returning focus", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  const opener = page.locator("#board-columbia .board-doc-open");
  await expect(opener).toHaveAttribute("aria-haspopup", "dialog");
  await expect(opener).toHaveAccessibleName(/Columbia University/);
  await clickOwn(page, opener);
  const dialog = page.locator("dialog.journey-examine");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog.locator("#journey-examine-title")).toContainText("Columbia University");
  await expect(dialog.locator(".examine-object")).toHaveAttribute("aria-label", /\S/);
  await expect(dialog.locator(":focus")).toHaveCount(1);
  // A window, not the whole screen: centred, with the page still showing around it.
  const viewport = page.viewportSize();
  // (The page keeps its scrollbar's room while the window is open: centre on what is left.)
  const inner = await page.evaluate(() => document.documentElement.clientWidth);
  const frame = await dialog.boundingBox();
  const phone = viewport.width < 700;
  expect(frame.width).toBeLessThanOrEqual(Math.min(phone ? viewport.width * 0.94 : 1080, viewport.width * (phone ? 0.94 : 0.86)) + 2);
  expect(frame.width).toBeLessThan(viewport.width);
  expect(frame.height).toBeLessThan(viewport.height);
  // Centred: a page with a scrollbar keeps its gutter while the window is open (and the
  // window centres beside it); a page without one reserves none.
  const middle = frame.x + frame.width / 2;
  expect(Math.min(Math.abs(middle - inner / 2), Math.abs(middle - viewport.width / 2))).toBeLessThan(2);
  expect(await dialog.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThan(6);
  // The diploma sits in the middle of its own area (give or take its turn in perspective),
  // inside it (a phone too), and stays clipped there when zoomed.
  const offCentre = () =>
    dialog.evaluate((element) => {
      const view = element.querySelector(".examine-view").getBoundingClientRect();
      const thing = element.querySelector(".examine-object").getBoundingClientRect();
      return Math.max(
        Math.abs(thing.x + thing.width / 2 - (view.x + view.width / 2)),
        Math.abs(thing.y + thing.height / 2 - (view.y + view.height / 2)),
        thing.width - view.width,
        thing.height - view.height
      );
    });
  await expect.poll(offCentre, { timeout: 5000 }).toBeLessThan(16);
  expect(await dialog.locator(".examine-view").evaluate((element) => getComputedStyle(element).overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  // From the keyboard, and closed with the Back button.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Back to the board" }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  // A click on the dimmed page outside the window closes it too.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.mouse.click(3, Math.round(viewport.height / 2));
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test("the New York papers sit in one pile that fans out without threads and gathers back", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  const ny = board(page, "new-york");
  const cork = ny.locator(".board-cork");
  const size = await cork.boundingBox();
  const pile = page.locator("#board-stack-ny-papers");
  const button = pile.locator(".board-stack-open");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toHaveAccessibleName(/^Papers: a pile of 5 /);
  await expect(pile.locator(".board-stack-tally")).toHaveText(/5 papers/i);
  expect(await pile.locator(".board-stack-docs").evaluate((list) => list.inert)).toBe(true);
  await showCork(page, "new-york");
  await expect.poll(async () => (await stringsOverDocs(page, "new-york")).threads).toBeGreaterThan(0);

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const fan = ny.locator(".board-fan");
  await expect(fan).toBeVisible();
  // (An object lying on a paper travels with it and is not a card of its own.)
  const cards = fan.locator(".board-fan-cards .board-doc:not(.is-attached)");
  await expect(cards).toHaveCount(5);
  for (const card of await cards.all()) await expect(card).toBeVisible();
  await expect(cards.first().locator(":scope > .board-doc-open")).toBeFocused();
  await expect(cork).toHaveClass(/\bis-fanned\b/);
  // Spread out: every card is in its own place, and all stay on the board.
  await expect
    .poll(async () => {
      const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
      const centres = boxes.map((box) => box.x + box.width / 2).sort((a, b) => a - b);
      return (
        centres.every((x, i) => i === 0 || x - centres[i - 1] > 8) &&
        boxes.every((box) => box.x >= size.x - 2 && box.x + box.width <= size.x + size.width + 2)
      );
    })
    .toBe(true);
  // No thread anywhere while the pile is spread out.
  expect(
    await cork.evaluate((element) => {
      const strings = [...element.querySelectorAll("svg.board-strings, .board-tags")];
      return strings.filter((layer) => getComputedStyle(layer).visibility !== "hidden" && layer.getClientRects().length).length;
    })
  ).toBe(0);
  await expect(fan.locator("svg.board-strings, .board-tag")).toHaveCount(0);
  // Tab stays among the spread papers and the "put back" button.
  for (let i = 0; i < 7; i++) await page.keyboard.press("Tab");
  expect(await fan.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(fan.getByRole("button", { name: "Put the papers back" })).toBeVisible();

  // A card opens in the detail view; Escape there closes only the detail view.
  await cards.nth(2).locator(":scope > .board-doc-open").focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog.journey-examine");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(cards.nth(2).locator(":scope > .board-doc-open")).toBeFocused();

  // Escape gathers the pile; focus returns to it and the threads come back.
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(fan).toBeHidden();
  await expect(button).toBeFocused();
  await expect(cork).not.toHaveClass(/\bis-fanned\b/);
  await expect(ny.locator(".board-cork > svg.board-strings")).toHaveCSS("visibility", "visible");
  await showCork(page, "new-york");
  expect((await stringsOverDocs(page, "new-york")).wrong).toEqual([]);
  const after = await cork.boundingBox();
  expect(Math.abs(after.width - size.width)).toBeLessThan(1);
  expect(Math.abs(after.height - size.height)).toBeLessThan(1);

  // The button gathers it too.
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await fan.getByRole("button", { name: "Put the papers back" }).click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(fan).toBeHidden();
  expect(errors).toEqual([]);
});

test("reduced motion keeps the boards, pile and map still", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openJourney(page);
  await expect(board(page, "evanston").locator(".board-cork")).not.toHaveClass(/is-armed/);
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  const button = page.locator("#board-stack-ny-papers .board-stack-open");
  // The pile spreads and gathers at once, with no animation.
  const running = await button.evaluate((element) => {
    element.click();
    const fan = element.closest(".board-cork").querySelector(".board-fan");
    return { open: !fan.hidden, animations: fan.getAnimations({ subtree: true }).length };
  });
  expect(running).toEqual({ open: true, animations: 0 });
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(board(page, "new-york").locator(".board-fan")).toBeHidden();
  if (await hasWebGL(page)) {
    await mapReady(page);
    await tab(page, "champaign").click();
    expect(await mapFigure(page).evaluate((element) => element.journeyMap.isAnimating())).toBe(false);
    // The route still flies in arcs, but no dashes show or flow along its newest leg.
    const route = () => mapFigure(page).evaluate((element) => element.journeyMap.getRoute());
    const still = await route();
    expect(still).toMatchObject({ drawn: "arcs", dashesShown: false, flowing: false });
    await page.waitForTimeout(500);
    expect((await route()).dashOffset).toBe(still.dashOffset);
  }
  expect(errors).toEqual([]);
});

test("the board and map fit without sideways scrolling from 320 to 1920 px", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const widths = testInfo.project.name === "desktop" ? [320, 390, 768, 1366, 1920] : [320, 390];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await openJourney(page);
    await tab(page, "new-york").click();
    await expectSelected(page, "new-york");
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await fits(), `${width} px`).toBe(true);
    const cork = await board(page, "new-york").locator(".board-cork").boundingBox();
    expect(cork.x).toBeGreaterThanOrEqual(0);
    expect(cork.x + cork.width).toBeLessThanOrEqual(width + 0.5);
    await page.locator("#board-stack-ny-cgui-people .board-stack-open").click();
    await expect(board(page, "new-york").locator(".board-fan")).toBeVisible();
    expect(await fits(), `${width} px with a pile spread out`).toBe(true);
    await page.keyboard.press("Escape");
    if (await mapFigure(page).isVisible()) {
      const map = await mapFigure(page).boundingBox();
      expect(map.x + map.width).toBeLessThanOrEqual(width + 0.5);
      // The map window fits the screen at every width too.
      await page.getByRole("button", { name: "Expand map" }).click();
      const dialog = page.getByRole("dialog", { name: "Map" });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(350);
      const box = await dialog.boundingBox();
      expect(box.x, `${width} px window`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${width} px window`).toBeLessThanOrEqual(width + 0.5);
      expect(await fits(), `${width} px with the map window open`).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
  expect(withoutNavigationNoise(errors)).toEqual([]);
});

test("night mode keeps the board, pile and map text readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openJourney(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const failures = [];
  const check = (label) =>
    page.locator("[data-journey]").evaluate((root, where) => {
      const channels = (value) => value.match(/[\d.]+/g).map(Number);
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const background = (element) => {
        for (let node = element; node; node = node.parentElement) {
          const color = channels(getComputedStyle(node).backgroundColor);
          if (color.length === 3 || color[3] > 0.99) return color.slice(0, 3);
        }
        return channels(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
      };
      const failed = [];
      const walker = document.createTreeWalker(root.parentElement, NodeFilter.SHOW_TEXT);
      for (let text; (text = walker.nextNode()); ) {
        const element = text.parentElement;
        if (!text.textContent.trim() || element.closest("svg, script, style, .visually-hidden, .maplibregl-ctrl-attrib")) continue;
        if (!element.closest("[data-journey]")) continue;
        if (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden") continue;
        const style = getComputedStyle(element);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const value = ratio(channels(style.color).slice(0, 3), background(element));
        if (value < (large ? 3 : 4.5))
          failed.push(`${where}: ${element.className || element.tagName} ${value.toFixed(2)} "${text.textContent.trim().slice(0, 30)}"`);
      }
      return failed;
    }, label);
  for (const id of STOPS) {
    await tab(page, id).click();
    await expectSelected(page, id);
    failures.push(...(await check(id)));
  }
  await tab(page, "new-york").click();
  await page.locator("#board-stack-ny-papers .board-stack-open").click();
  await expect(board(page, "new-york").locator(".board-fan")).toBeVisible();
  failures.push(...(await check("new-york pile")));
  await page.keyboard.press("Escape");
  if (await hasWebGL(page)) {
    await mapReady(page);
    failures.push(...(await check("map")));
  }
  expect(failures).toEqual([]);
});

/* ---------- board title, objects, scans and portraits ---------- */

// The numbers in a computed colour: [r, g, b] or [r, g, b, a].
const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);

test("every board carries its title on a sheet held by two strips of blue tape", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  for (const [index, id] of STOPS.entries()) {
    await tab(page, id).click();
    await expectSelected(page, id);
    await showCork(page, id);
    const cork = board(page, id).locator(".board-cork");
    const plate = cork.locator(":scope > .board-case > .board-plate");
    await expect(plate).toBeVisible();
    await expect(plate.locator(".journey-board-case")).toHaveText(`Case file No. 0${index + 1}`);
    await expect(plate.locator("h3.journey-board-title")).toContainText(NAMES[id]);
    await expect(plate.locator(".journey-board-period")).toHaveText(/\d{4}/);
    const look = await plate.evaluate((element) => {
      const corkBox = element.closest(".board-cork").getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const tape = (which) => getComputedStyle(element, which).backgroundColor;
      const title = element.querySelector(".journey-board-title");
      const labels = [...element.closest(".board-cork").querySelectorAll(".board-label")]
        .filter((label) => label.getClientRects().length)
        .map((label) => getComputedStyle(label).backgroundColor);
      // Papers (not the objects lying on them) that the sheet would cover.
      const covered = [...element.closest(".board-cork").querySelectorAll(":scope > .board-docs > li")]
        .filter((item) => {
          const r = item.getBoundingClientRect();
          const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
          const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
          return w > 6 && h > 6;
        })
        .map((item) => item.id);
      return {
        inside: box.left >= corkBox.left - 1 && box.right <= corkBox.right + 1 && box.top >= corkBox.top - 1,
        top: (box.top - corkBox.top) / corkBox.height,
        centre: Math.abs(box.left + box.width / 2 - (corkBox.left + corkBox.width / 2)) / corkBox.width,
        paper: getComputedStyle(element).backgroundColor,
        before: tape("::before"),
        after: tape("::after"),
        beforeContent: getComputedStyle(element, "::before").content,
        afterContent: getComputedStyle(element, "::after").content,
        titleSize: parseFloat(getComputedStyle(title).fontSize),
        labels,
        covered,
      };
    });
    expect(look.inside, `${id}: the sheet is on the board`).toBe(true);
    expect(look.top, `${id}: the sheet is at the top`).toBeLessThan(0.15);
    expect(look.centre, `${id}: the sheet is centred`).toBeLessThan(0.08);
    expect(look.covered, `${id}: the sheet covers no paper`).toEqual([]);
    // Off-white paper, two see-through blue strips of tape, and yellow tape on the clusters.
    const [pr, pg, pb] = rgb(look.paper);
    expect(Math.min(pr, pg, pb), `${id} paper ${look.paper}`).toBeGreaterThan(220);
    for (const [where, colour, content] of [
      ["top", look.before, look.beforeContent],
      ["bottom", look.after, look.afterContent],
    ]) {
      expect(content, `${id} ${where} tape is drawn`).not.toBe("none");
      const [r, , b, a = 1] = rgb(colour);
      expect(b - r, `${id} ${where} tape ${colour} is blue`).toBeGreaterThan(60);
      expect(a, `${id} ${where} tape is a little see-through`).toBeLessThan(1);
    }
    for (const label of look.labels) {
      const [r, , b] = rgb(label);
      expect(r - b, `${id} cluster tape ${label} is yellow, not blue`).toBeGreaterThan(30);
    }
    expect(look.titleSize).toBeGreaterThanOrEqual(14);
  }
  expect(errors).toEqual([]);
});

test("objects lie on their papers as clean cutouts, and the real documents show their scans", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  let objects = 0;
  const scans = { diploma: 0, "paper-page": 0, cover: 0 };
  for (const id of STOPS) {
    await tab(page, id).click();
    await expectSelected(page, id);
    await showCork(page, id);
    for (const image of await board(page, id).locator(".board-doc[data-kind='artifact'] img, .board-scan img").all()) {
      await image.evaluate((element) => {
        element.loading = "eager";
      });
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth), { timeout: 20000 }).toBeGreaterThan(0);
    }
    const found = await board(page, id).evaluate((section) => {
      const out = { artifacts: [], scans: [] };
      for (const node of section.querySelectorAll(".board-doc[data-kind='artifact']")) {
        const image = node.querySelector("img");
        const holder = node.closest(".board-doc-attached");
        const host = holder?.parentElement;
        const hostDoc = host?.matches(".board-stack") ? host.querySelector(`[data-doc="${node.dataset.attach}"]`) : host;
        const hostBox = host?.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        // The picture's corners are see-through (a cutout, not a photo on a background).
        let corners = null;
        if (image && image.naturalWidth) {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          const w = canvas.width - 1;
          const h = canvas.height - 1;
          corners = [
            [0, 0],
            [w, 0],
            [0, h],
            [w, h],
          ].map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]);
        }
        const visible = node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[inert]");
        out.artifacts.push({
          id: node.dataset.doc,
          medium: node.dataset.medium,
          attach: node.dataset.attach,
          hostId: hostDoc?.dataset.doc || null,
          src: image?.getAttribute("src") || "",
          alt: image?.getAttribute("alt") || "",
          corners,
          visible,
          // Overlapping its paper, over the paper's lower part.
          overlaps:
            visible && hostBox ? box.right > hostBox.left && box.left < hostBox.right && box.bottom > hostBox.top && box.top < hostBox.bottom : null,
          low: visible && hostBox ? box.top + box.height / 2 > hostBox.top + hostBox.height * 0.45 : null,
          holders: node.querySelectorAll(".board-pin, .board-tape, .board-tag, .board-label").length,
          hasOpener: Boolean(node.querySelector(":scope > .board-doc-open")),
        });
      }
      for (const node of section.querySelectorAll(".board-doc--scan")) {
        const image = node.querySelector(":scope > .board-scan img");
        out.scans.push({
          id: node.dataset.doc,
          kind: node.dataset.scan,
          label: node.querySelector(".board-scan-label")?.textContent.trim() || "",
          src: image?.getAttribute("src") || "",
          alt: image?.getAttribute("alt") || "",
        });
      }
      return out;
    });
    for (const object of found.artifacts) {
      objects++;
      expect(object.medium, `${object.id} is a cutout`).toBe("cutout");
      expect(object.hostId, `${object.id} lies on its paper`).toBe(object.attach);
      expect(object.src, object.id).toMatch(/\/assets\/img\/journey\/artifacts\/[\w-]+\.png$/);
      expect(object.alt, object.id).toMatch(/\S{3}/);
      expect(object.corners, `${object.id} has a transparent background`).toEqual([0, 0, 0, 0]);
      expect(object.holders, `${object.id}: no tape, pin or tag holds it`).toBe(0);
      expect(object.hasOpener, `${object.id} opens in the examine view`).toBe(true);
      if (object.visible) {
        expect(object.overlaps, `${object.id} overlaps its paper`).toBe(true);
        expect(object.low, `${object.id} sits on the paper's lower part`).toBe(true);
      }
    }
    for (const scan of found.scans) {
      expect(Object.keys(scans), scan.id).toContain(scan.kind);
      scans[scan.kind]++;
      if (scan.kind === "cover") {
        expect(scan.label, `${scan.id} cover label`).toMatch(/\S/);
        expect(scan.src).toBe("");
      } else {
        expect(scan.src, scan.id).toMatch(/\/assets\/img\/journey\/docs\/[\w-]+\.(jpg|png)$/);
        expect(scan.alt, scan.id).toMatch(/\S{3}/);
      }
    }
  }
  expect(objects, "objects across the boards").toBeGreaterThanOrEqual(4);
  expect(scans.diploma, "the Columbia and Illinois diplomas").toBeGreaterThanOrEqual(2);
  expect(scans["paper-page"], "first pages of papers").toBeGreaterThanOrEqual(3);
  expect(scans.cover, "the Westminster diploma cover").toBe(1);
  await expect(page.locator("#board-westminster")).toHaveAttribute("data-scan", "cover");
  await expect(page.locator("#board-westminster-cords")).toHaveAttribute("data-attach", "westminster");
  expect(errors).toEqual([]);
});

// The New York XR hardware: the Quest 3 on Delegate the Details, and OLIVE's Varjo XR-3 and
// B-Alert strip both on OLIVE (with Cascade's eye tracker, all on the papers pile). Each
// lies over the lower part of its paper (the pile, while it is closed), in sight, and no
// object covers another, piled or spread.
test("the New York XR artifacts lie attached to their papers, clear of each other, piled and spread", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  await showCork(page, "new-york");
  const ny = board(page, "new-york");
  const owners = { "nyc-quest-3": "delegate", "olive-varjo-xr3": "olive", "olive-balert-strip": "olive", "cascade-eye-tracker": "cascade" };
  for (const [id, owner] of Object.entries(owners)) {
    const object = page.locator(`#board-${id}`);
    await expect(object).toHaveAttribute("data-attach", owner);
    await expect(object).toHaveAttribute("data-medium", "cutout");
    const image = object.locator(".board-artifact-object img");
    await expect(image).toHaveAttribute("src", new RegExp(`/artifacts/${id === "cascade-eye-tracker" ? "eye-tracker" : id}\\.png$`));
    await image.evaluate((element) => {
      element.loading = "eager";
    });
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth), { timeout: 20000 }).toBeGreaterThan(0);
  }
  await expect(page.locator("#board-olive-varjo-xr3")).toContainText("(c) Varjo");
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const problems = async (state) => {
    const found = await ny.evaluate((section, owners) => {
      return Object.entries(owners).map(([id, owner]) => {
        const node = section.querySelector(`#board-${id}`);
        const host = node.closest(".board-doc-attached").parentElement;
        const piled = host.matches(".board-stack");
        const box = node.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          id,
          on: piled ? "pile" : host.dataset.doc,
          owner,
          piled,
          box: box.toJSON(),
          paper: host.getBoundingClientRect().toJSON(),
          seen: Boolean(top && node.contains(top)),
        };
      });
    }, owners);
    const out = [];
    for (const object of found) {
      if (object.on !== (state === "piled" ? "pile" : object.owner)) out.push(`${object.id} lies on ${object.on}`);
      if (!overlap(object.box, object.paper)) out.push(`${object.id} is off its paper`);
      if (object.box.y + object.box.height / 2 < object.paper.y + object.paper.height * 0.45) out.push(`${object.id} is over its paper's upper part`);
      if (!object.seen) out.push(`${object.id} is out of sight`);
    }
    // (Bounding boxes of tilted objects: a sliver of overlap at their corners is allowed.)
    for (let i = 0; i < found.length; i++) {
      for (let j = i + 1; j < found.length; j++) {
        const [a, b] = [found[i], found[j]];
        const share = overlap(a.box, b.box) / Math.min(a.box.width * a.box.height, b.box.width * b.box.height);
        if (share > 0.08) out.push(`${a.id} covers ${b.id} (${Math.round(share * 100)}%)`);
      }
    }
    return out;
  };
  await expect.poll(() => problems("piled")).toEqual([]);
  const button = page.locator("#board-stack-ny-papers .board-stack-open");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.mouse.move(1, 1);
  await expect.poll(() => problems("spread"), { timeout: 15000 }).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => problems("piled"), { timeout: 15000 }).toEqual([]);
  expect(errors).toEqual([]);
});

test("the examine window walks the board's filmstrip by click, keys and buttons", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await showCork(page, "fort-lauderdale");
  const dialog = page.locator("dialog.journey-examine");
  const title = dialog.locator("#journey-examine-title");
  const count = dialog.locator(".examine-count");
  const thumbs = dialog.locator(".examine-film .examine-thumb");

  // An object opens too, from the paper it lies on.
  const cords = page.locator("#board-westminster-cords > .board-doc-open");
  await expect(cords).toHaveAccessibleName(/Salutatorian cords/);
  await clickOwn(page, cords);
  await expect(dialog).toBeVisible();
  await expect(title).toHaveText(/Salutatorian cords/);
  await expect(dialog.locator(".examine-object")).toHaveAttribute("data-kind", "artifact");
  await expect(dialog.locator(".examine-object img").first()).toBeVisible();
  const total = await thumbs.count();
  expect(total).toBeGreaterThan(3);
  const at = async () => {
    const text = (await count.textContent()).trim();
    const match = /^(\d+) \/ (\d+)$/.exec(text);
    if (!match) return `counter "${text}"`;
    return Number(match[2]) === total ? Number(match[1]) : `counter "${text}" of ${total}`;
  };
  const start = await at();
  expect(typeof start).toBe("number");
  await expect(thumbs.nth(start - 1)).toHaveAttribute("aria-current", "true");
  await expect(dialog.locator('.examine-film [aria-current="true"]')).toHaveCount(1);

  // Keys: Home, Right, Left, End.
  await page.keyboard.press("Home");
  await expect.poll(at).toBe(1);
  const first = (await title.textContent()).trim();
  await page.keyboard.press("ArrowRight");
  await expect.poll(at).toBe(2);
  await expect(title).not.toHaveText(first);
  await expect(dialog.locator(".examine-live")).toHaveText(new RegExp(`^Item 2 of ${total}: `));
  await page.keyboard.press("ArrowLeft");
  await expect.poll(at).toBe(1);
  await expect(title).toHaveText(first);
  await page.keyboard.press("End");
  await expect.poll(at).toBe(total);

  // Buttons.
  await dialog.locator(".examine-prev").click();
  await expect.poll(at).toBe(total - 1);
  await dialog.locator(".examine-next").click();
  await expect.poll(at).toBe(total);

  // A thumbnail.
  await thumbs.nth(1).click();
  await expect.poll(at).toBe(2);
  await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(thumbs.nth(1)).toHaveAttribute("aria-label", new RegExp(`^Item 2 of ${total}: `));

  // Zoom buttons scale the object; reset puts it back.
  const object = dialog.locator(".examine-object");
  // (The transform's scale also fits the object to the window, so compare before and after.)
  const scale = () => object.evaluate((element) => Number((/scale\(([\d.]+)\)/.exec(element.style.transform) || [0, 0])[1]));
  // Wait for the switch to the thumbnail's document to settle first.
  let fitted = 0;
  await expect
    .poll(async () => {
      const before = await scale();
      await page.waitForTimeout(250);
      const after = await scale();
      fitted = after;
      return before > 0 && before === after;
    })
    .toBe(true);
  expect(fitted).toBeGreaterThan(0);
  await dialog.locator(".examine-zoom-in").click();
  await expect(dialog.locator(".examine-zoom-level")).not.toHaveText("100%");
  await expect.poll(scale).toBeGreaterThan(fitted * 1.1);
  await dialog.locator(".examine-reset").click();
  await expect(dialog.locator(".examine-zoom-level")).toHaveText("100%");
  await expect.poll(scale).toBeCloseTo(fitted, 2);

  // Escape returns focus to the board.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await board(page, "fort-lauderdale").evaluate((section) => section.contains(document.activeElement))).toBe(true);
  expect(errors).toEqual([]);
});

test("a person's photo is pixelated on the board and in the window until revealed", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  await showCork(page, "new-york");
  const blurred = (locator) => locator.evaluate((element) => /blur\(/.test(getComputedStyle(element).filter));
  const shown = (locator) => locator.evaluate((element) => Number(getComputedStyle(element).opacity));

  // Every portrait on the board is its pixelated stand-in under a strong blur (no head shape
  // reads at board size), clipped inside its print.
  const portraits = page.locator(".journey-board .board-portrait img");
  expect(await portraits.count()).toBeGreaterThan(0);
  for (const image of await portraits.all()) {
    await expect(image).toHaveAttribute("src", /\.pixel\.jpg$/);
    await expect(image).toHaveAttribute("data-original", /\/people\/[a-z-]+\.jpg$/);
    await expect(image).toHaveAttribute("alt", /^Pixelated until revealed\. /);
    expect(await blurPx(image)).toBeGreaterThanOrEqual(6);
    expect(await image.evaluate((element) => getComputedStyle(element.closest(".board-portrait-frame")).overflow)).toBe("hidden");
  }

  // A pile of people spreads out; each portrait there is a pixelated, paper-clipped print.
  const pile = page.locator("#board-stack-ny-liinc-people");
  await expect(pile).toHaveCount(1);
  await pile.locator(".board-stack-open").click();
  const fan = board(page, "new-york").locator(".board-fan");
  await expect(fan).toBeVisible();
  const sajda = fan.locator('.board-doc[data-doc="sajda"]');
  await expect(sajda).toBeVisible();
  await expect(sajda).toContainText("LIINC");
  const photo = sajda.locator(".board-portrait img");
  await expect(photo).toHaveAttribute("alt", /Paul Sajda/);
  await expect(photo).toHaveAttribute("src", /\/people\/sajda\.pixel\.jpg$/);
  // Spread out, still the board's strong blur.
  expect(await blurPx(photo)).toBeGreaterThanOrEqual(6);
  await expect(fan.locator('.board-doc[data-doc="li"]')).toContainText("Ziheng (Leo) Li");

  // Opened from the spread pile: still pixelated, with a "Reveal photo" switch.
  await sajda.locator(":scope > .board-doc-open").focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog.journey-examine");
  const object = dialog.locator(".examine-object");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#journey-examine-title")).toHaveText(/Paul Sajda/);
  const reveal = dialog.locator(".examine-reveal");
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAccessibleName("Reveal photo");
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  const large = object.locator(".board-portrait img.board-portrait-pixel");
  const original = object.locator(".board-portrait img.board-portrait-original");
  await expect(large).toBeVisible();
  await expect(large).toHaveAttribute("src", /\/people\/sajda\.pixel\.jpg$/);
  await expect(original).toHaveAttribute("src", /\/people\/sajda\.jpg$/);
  expect(await blurred(large)).toBe(false);
  expect(await shown(original), "the photo waits, hidden").toBe(0);
  await expect(object).toHaveAttribute("aria-label", /^Pixelated until revealed\. .*Paul Sajda/);
  await expect(dialog.locator(".examine-credit")).toContainText(/Photo: Jeffrey Schifman \/ Columbia Engineering, via LIINC/);
  await expect(dialog.locator(".examine-credit")).not.toContainText("Portrait:");
  // Reveal swaps to the photo itself.
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await expect(reveal).toHaveAccessibleName("Hide photo");
  await expect(object).toHaveClass(/\bis-revealed\b/);
  await expect.poll(() => shown(original), { timeout: 8000 }).toBe(1);
  await expect(object).toHaveAttribute("aria-label", /^Head-and-shoulders photo of Paul Sajda/);
  // Hide swaps back.
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await expect(reveal).toHaveAccessibleName("Reveal photo");
  await expect.poll(() => shown(original), { timeout: 8000 }).toBe(0);
  await expect(object).toHaveAttribute("aria-label", /^Pixelated until revealed\./);
  // Revealed, then along the filmstrip and back: pixelated again, never shown by itself.
  await reveal.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.locator("#journey-examine-title")).toHaveText(/Paul Sajda/);
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  expect(await shown(object.locator(".board-portrait-original"))).toBe(0);
  // The filmstrip shows no portrait.
  await expect(dialog.locator(".examine-film img[src*='/people/']")).toHaveCount(0);
  // Escape closes the window only, back to the spread pile.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(fan).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fan).toBeHidden();

  // A document without a portrait has no switch.
  await clickOwn(page, page.locator("#board-columbia > .board-doc-open"));
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".examine-reveal")).toBeHidden();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("the team photo is blurred on the board and pixelated in the window until revealed, eye bars and all", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await showCork(page, "fort-lauderdale");
  const team = page.locator("#board-frc-744-team");
  const onBoard = team.locator(":scope > .board-doc-photo img");
  await expect(onBoard).toHaveAttribute("src", /fort-lauderdale-frc-744-team\.pixel\.jpg$/);
  await expect(onBoard).toHaveAttribute("data-original", /fort-lauderdale-frc-744-team\.jpg$/);
  await expect(onBoard).toHaveAttribute("alt", /^Pixelated until revealed\. .*black bar over their eyes/);
  expect(await blurPx(onBoard)).toBeGreaterThanOrEqual(6);
  expect(await onBoard.evaluate((element) => getComputedStyle(element.closest(".board-doc-photo")).overflow)).toBe("hidden");
  await clickOwn(page, team.locator(":scope > .board-doc-open"));
  const dialog = page.locator("dialog.journey-examine");
  const object = dialog.locator(".examine-object");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#journey-examine-title")).toHaveText(/FRC Team 744/);
  // Pixelated (mildly, unblurred) until "Reveal photo"; then the eye-barred photo itself.
  const pixel = object.locator(".board-doc-photo img.board-portrait-pixel");
  const original = object.locator(".board-doc-photo img.board-portrait-original");
  await expect(pixel).toHaveAttribute("src", /fort-lauderdale-frc-744-team\.pixel\.jpg$/);
  expect(await blurPx(pixel)).toBe(0);
  await expect(original).toHaveAttribute("src", /fort-lauderdale-frc-744-team\.jpg$/);
  const shown = () => original.evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(await shown()).toBe(0);
  await expect(object).toHaveAttribute("aria-label", /^Pixelated until revealed\. /);
  const reveal = dialog.locator(".examine-reveal");
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAccessibleName("Reveal photo");
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await expect(reveal).toHaveAccessibleName("Hide photo");
  // (WebKit here can take over 2 s to report the end of the 0.22 s fade.)
  await expect.poll(shown, { timeout: 8000 }).toBe(1);
  await expect(object).toHaveAttribute("aria-label", /^Members of FRC Team 744 .*black bar over their eyes/);
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await expect.poll(shown, { timeout: 8000 }).toBe(0);
  await expect(object).toHaveAttribute("aria-label", /^Pixelated until revealed\. /);
  // The filmstrip carries only the stand-in, under the board's blur.
  const thumb = dialog.locator(".examine-film img[src$='fort-lauderdale-frc-744-team.pixel.jpg']");
  await expect(thumb).toHaveCount(1);
  expect(await blurPx(thumb)).toBeGreaterThanOrEqual(4);
  await expect(dialog.locator(".examine-film img[src$='fort-lauderdale-frc-744-team.jpg']")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

/* ---------- objects and their 3D models ---------- */

// A small glTF binary for the 3D viewer: a 0.5 x 0.3 x 0.4 box in one grey-blue material,
// served by page.route (Jekyll serves nothing from test/). Built here, so no binary fixture.
function boxGlb() {
  const half = [0.25, 0.15, 0.2];
  const positions = [];
  const normals = [];
  const indices = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1]) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const base = positions.length / 3;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const point = [0, 0, 0];
        point[axis] = sign * half[axis];
        point[u] = a * half[u];
        point[v] = b * half[v];
        positions.push(...point);
        const normal = [0, 0, 0];
        normal[axis] = sign;
        normals.push(...normal);
      }
      // Counter-clockwise seen from outside (u x v points along +axis).
      indices.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map((index) => base + index));
    }
  }
  const bin = Buffer.concat([
    Buffer.from(new Float32Array(positions).buffer),
    Buffer.from(new Float32Array(normals).buffer),
    Buffer.from(new Uint16Array(indices).buffer),
  ]);
  const json = {
    asset: { version: "2.0", generator: "test/visual/journey.spec.js" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.55, 0.6, 0.68, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 288, target: 34962 },
      { buffer: 0, byteOffset: 288, byteLength: 288, target: 34962 },
      { buffer: 0, byteOffset: 576, byteLength: 72, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: half.map((value) => -value), max: half },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(body.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, body]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]);
}

const TEST_MODEL = "/assets/models/journey/test-box.glb";
// three.js, the viewer module, or any model.
const MODEL_REQUEST = /\/assets\/(vendor\/three\/|js\/journey-model\.js|models\/)|\.glb(\?|$)/;
// Gives one object on a board the test box as its model (what a model field in
// _data/journey.yml renders), and takes any model away from the others on that board, so the
// walk along the filmstrip meets no other model.
// (delay: ms the model takes to arrive, so the loading state can be seen.)
async function giveTestModel(page, stop, id, { status = 200, delay = 0 } = {}) {
  await page.route(`**${TEST_MODEL}`, async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return status === 200 ? route.fulfill({ contentType: "model/gltf-binary", body: boxGlb() }) : route.fulfill({ status, body: "" });
  });
  await board(page, stop).evaluate(
    (section, { id, url }) => {
      for (const doc of section.querySelectorAll(".board-doc")) {
        for (const key of ["model", "modelSize", "modelYaw", "modelPitch"]) delete doc.dataset[key];
        if (doc.dataset.doc === id) {
          doc.dataset.model = url;
          doc.dataset.modelSize = "0.3";
        }
      }
    },
    { id, url: TEST_MODEL }
  );
}
// Takes away an object's model, for the tests of objects without one.
const takeModel = (page, id) =>
  page.locator(`#board-${id}`).evaluate((doc) => {
    for (const key of ["model", "modelSize", "modelYaw", "modelPitch"]) delete doc.dataset[key];
  });
// The model's pose, as the viewer writes it on its host (degrees, and the zoom).
const modelPose = (page) =>
  page.locator("dialog.journey-examine .examine-model").evaluate((host) => ({
    yaw: Number(host.dataset.yaw),
    pitch: Number(host.dataset.pitch),
    zoom: Number(host.dataset.zoom),
  }));

test("objects without a model only zoom and move in the examine window; papers turn", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await showCork(page, "fort-lauderdale");
  await takeModel(page, "westminster-cords");
  const dialog = page.locator("dialog.journey-examine");
  const object = dialog.locator(".examine-object");
  const stage = dialog.locator(".examine-view");
  const pose = () =>
    object.evaluate((element) => {
      const transform = element.style.transform;
      const read = (name) => Number(new RegExp(name + "\\((-?[\\d.]+)").exec(transform)?.[1] || 0);
      const pan = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transform.replace(/^translate\(-50%, -50%\) /, ""));
      return { x: read("rotateX"), y: read("rotateY"), z: read("rotateZ"), panX: Number(pan?.[1] || 0), panY: Number(pan?.[2] || 0) };
    });
  const drag = async (dx, dy) => {
    const box = await stage.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  };
  // The cords: an object, flat to the view and still under a drag.
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  await expect(object).toHaveClass(/\bis-rigid\b/);
  await expect(dialog.locator(".examine-kicker")).not.toContainText("3D");
  await expect(dialog.locator(".examine-model canvas")).toHaveCount(0);
  expect(await pose()).toMatchObject({ x: 0, y: 0, z: 0 });
  await drag(140, 80);
  expect(await pose()).toMatchObject({ x: 0, y: 0, z: 0, panX: 0, panY: 0 });
  // No moving light or edge on an object.
  expect(await object.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
  // Zoomed in, a drag moves it (and still never turns it).
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await drag(-60, -40);
  const moved = await pose();
  expect(moved).toMatchObject({ x: 0, y: 0, z: 0 });
  expect(Math.abs(moved.panX) + Math.abs(moved.panY)).toBeGreaterThan(10);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // A paper turns under a drag.
  await clickOwn(page, page.locator("#board-frc-744 > .board-doc-open"));
  await expect(dialog).toBeVisible();
  await expect(object).not.toHaveClass(/\bis-rigid\b/);
  const before = await pose();
  await drag(140, 80);
  const after = await pose();
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(5);
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(5);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("the hint under an object without a model says it zooms and moves, not turns", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "the hint is hidden on a phone");
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await takeModel(page, "westminster-cords");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  const dialog = page.locator("dialog.journey-examine");
  await expect(dialog.locator(".examine-hint")).toHaveText("Scroll to zoom");
  await page.keyboard.press("Escape");
});

// The examine window's 3D button, its words, and the note under the model.
const modelToggle = (page) => page.locator("dialog.journey-examine .examine-model-toggle");
const modelNote = (page) => page.locator("dialog.journey-examine .examine-model-note");
const NOTE = "This 3D model was reconstructed from a photo and may not be accurate.";
// The button and the view while the photo shows, with the model on offer.
async function expectPhotoView(page) {
  const dialog = page.locator("dialog.journey-examine");
  const stage = dialog.locator(".examine-view");
  await expect(modelToggle(page)).toBeVisible();
  await expect(modelToggle(page)).toHaveText("See 3D model");
  await expect(modelToggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(modelToggle(page)).not.toHaveAttribute("aria-disabled", /./);
  await expect(modelNote(page)).toBeHidden();
  await expect(stage).not.toHaveAttribute("aria-describedby", /./);
  await expect(stage).not.toHaveAttribute("data-model", /./);
  await expect(dialog.locator(".examine-model canvas")).toHaveCount(0);
  await expect(dialog.locator(".examine-kicker")).toHaveText(/· Object$/);
  await expect(dialog.locator(".examine-object img")).toBeVisible();
  await expect.poll(() => dialog.locator(".examine-object").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
}

test("an object with a 3D model opens on its photo, and loads nothing 3D until See 3D model is pressed", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const loads = [];
  page.on("request", (request) => {
    if (MODEL_REQUEST.test(request.url())) loads.push(request.url());
  });
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await showCork(page, "fort-lauderdale");
  await page.waitForTimeout(1000);
  // Neither three.js, the viewer, nor any model comes with the page ...
  expect(loads).toEqual([]);
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no 3D view");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords", { delay: 1500 });
  const dialog = page.locator("dialog.journey-examine");
  const stage = dialog.locator(".examine-view");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  // ... nor with the window: it opens as an object without one, its photo still and flat,
  // with the 3D button beside the zoom.
  await expectPhotoView(page);
  await expect(dialog.locator(".examine-object")).toHaveClass(/\bis-rigid\b/);
  await expect(dialog.locator(".examine-object")).not.toHaveAttribute("aria-label", /3D model/);
  if (!testInfo.project.name.includes("mobile")) {
    await expect(dialog.locator(".examine-hint")).toHaveText("Scroll to zoom");
  }
  // The button sits with the zoom buttons, over the view's foot, and shows a cube.
  const [toggleBox, zoomBox, stageBox] = await Promise.all([
    modelToggle(page).boundingBox(),
    dialog.locator(".examine-zoom-in").boundingBox(),
    stage.boundingBox(),
  ]);
  expect(Math.abs(toggleBox.y + toggleBox.height / 2 - (zoomBox.y + zoomBox.height / 2))).toBeLessThan(4);
  expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
  await expect(modelToggle(page).locator(".examine-model-icon-cube")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(loads).toEqual([]);

  // Pressed: it says it is loading (and is busy) while the photo stays, then the model's
  // canvas takes the photo's place.
  await modelToggle(page).click();
  await expect(modelToggle(page)).toHaveText("Loading 3D model…");
  await expect(modelToggle(page)).toHaveAttribute("aria-busy", "true");
  await expect(modelToggle(page)).toHaveAttribute("aria-disabled", "true");
  await expect(stage).toHaveAttribute("data-model", "loading");
  await expect(dialog.locator(".examine-object img")).toBeVisible();
  await expect(modelNote(page)).toBeHidden();
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  expect(loads.some((url) => /\/vendor\/three\/build\/three\.module\.min\.js$/.test(url))).toBe(true);
  expect(loads.some((url) => /\/assets\/js\/journey-model\.js$/.test(url))).toBe(true);
  expect(loads.some((url) => url.endsWith(TEST_MODEL))).toBe(true);
  await expect(dialog.locator(".examine-model canvas")).toBeVisible();
  await expect(modelToggle(page)).toHaveText("Show photo");
  await expect(modelToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(modelToggle(page)).not.toHaveAttribute("aria-busy", /./);
  await expect(modelToggle(page)).not.toHaveAttribute("aria-disabled", /./);
  await expect(modelToggle(page).locator(".examine-model-icon-photo")).toBeVisible();
  // The press kept its focus on the button through the load (where a click focuses a
  // button: not in Safari).
  if (!testInfo.project.name.includes("mobile")) await expect(modelToggle(page)).toBeFocused();
  await expect(dialog.locator(".examine-kicker")).toContainText("Object, 3D model from a photo");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(dialog.locator(".examine-hint")).toHaveText("Drag to turn it · scroll to zoom · double-click to reset");
  }
  // The note shows (on a phone too) and is the view's description.
  await expect(modelNote(page)).toBeVisible();
  await expect(modelNote(page)).toHaveText(NOTE);
  await expect(stage).toHaveAttribute("aria-label", /3D model made from a photo/);
  const described = await stage.evaluate((element) => document.getElementById(element.getAttribute("aria-describedby"))?.textContent);
  expect(described).toBe(NOTE);
  // It lies over the view's foot, above the buttons, clear of the model (its silhouette, as
  // drawn), and reads clearly: light text on its dark ground.
  const noteBox = await modelNote(page).boundingBox();
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(toggleBox.y + 1);
  expect(noteBox.y).toBeGreaterThan(stageBox.y + stageBox.height * 0.5);
  const lowest = await page.evaluate(() => {
    const { model } = window.__journeyModel.masks(2);
    let row = -1;
    for (let r = 0; r < model.rows; r++) if (model.bits.slice(r * model.cols, (r + 1) * model.cols).includes("1")) row = r;
    return (row + 1) * model.step;
  });
  expect(lowest, "the model's lowest pixel, above the note").toBeLessThanOrEqual(noteBox.y - stageBox.y);
  const contrast = await modelNote(page).evaluate((element) => {
    const channels = (value) => value.match(/[\d.]+/g).map(Number);
    const luminance = ([r, g, b]) =>
      [r, g, b]
        .map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const style = getComputedStyle(element);
    const text = luminance(channels(style.color));
    // Its ground, at its most transparent, over the lightest the window behind it can be.
    const [r, g, b, a] = channels(style.backgroundColor);
    const ground = luminance([r * a + 255 * 0.12 * (1 - a), g * a + 255 * 0.12 * (1 - a), b * a + 255 * 0.12 * (1 - a)]);
    return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05);
  });
  expect(contrast).toBeGreaterThan(4.5);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("the 3D model turns, zooms and resets; Show photo and every move or close put it away", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const loads = [];
  page.on("request", (request) => {
    if (MODEL_REQUEST.test(request.url())) loads.push(request.url());
  });
  // Reduced motion: no coasting, no eased turns and instant swaps, so every pose is exact.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await showCork(page, "fort-lauderdale");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no 3D view");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords");
  // The map is up first, so the canvases counted are all there are.
  await mapReady(page);
  const canvases = await page.locator("canvas").count();
  const dialog = page.locator("dialog.journey-examine");
  const stage = dialog.locator(".examine-view");
  const host = dialog.locator(".examine-model");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  await expectPhotoView(page);
  await modelToggle(page).click();
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  await expect(host.locator("canvas")).toHaveCount(1);
  await expect(host.locator("canvas")).toBeVisible();
  // The model has taken the photo's place, and says what it is.
  await expect.poll(() => dialog.locator(".examine-object").evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
  await expect(dialog.locator(".examine-object")).toHaveAttribute("aria-label", /3D model made from a photo/);
  await expect(stage).toHaveAttribute("tabindex", "0");
  // Something is drawn: the box, lit, stands out from the dark window around it.
  const { PNG } = require("pngjs");
  const shot = PNG.sync.read(await stage.screenshot());
  const brightness = (fx, fy, size) => {
    let sum = 0;
    let count = 0;
    for (let y = Math.round(shot.height * fy - size); y < shot.height * fy + size; y++) {
      for (let x = Math.round(shot.width * fx - size); x < shot.width * fx + size; x++) {
        const i = (y * shot.width + x) * 4;
        sum += (shot.data[i] + shot.data[i + 1] + shot.data[i + 2]) / 3;
        count++;
      }
    }
    return sum / count;
  };
  const box = await stage.boundingBox();
  const fy = await page.evaluate(() => {
    const { model } = window.__journeyModel.masks(2);
    let first = -1;
    let last = -1;
    for (let r = 0; r < model.rows; r++) {
      if (!model.bits.slice(r * model.cols, (r + 1) * model.cols).includes("1")) continue;
      if (first < 0) first = r;
      last = r;
    }
    return (first + last + 1) / 2 / model.rows;
  });
  expect(brightness(0.5, fy, 6)).toBeGreaterThan(brightness(0.06, 0.08, 6) + 15);

  const rest = await modelPose(page);
  expect(rest.zoom).toBe(1);
  // A drag turns it round and tips it up; the photo itself never turns.
  const x = box.x + box.width / 2;
  const y = box.y + box.height * fy;
  const drag = async (dx, dy) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 10 });
    await page.mouse.up();
  };
  // (The viewer writes its pose when it next draws, which can lag a gesture, so each read
  // after one waits for it.)
  await drag(200, 60);
  await expect.poll(async () => (await modelPose(page)).yaw - rest.yaw, { timeout: 10000 }).toBeGreaterThan(60);
  await expect.poll(async () => (await modelPose(page)).pitch - rest.pitch, { timeout: 10000 }).toBeGreaterThan(8);
  const turned = await modelPose(page);
  expect(await dialog.locator(".examine-object").evaluate((element) => /rotate[XY]\((?!0deg)/.test(element.style.transform))).toBe(false);
  // It turns all the way round, but only so far up (short of straight down on it) and never
  // below the table.
  await drag(0, 250);
  await expect.poll(async () => (await modelPose(page)).pitch, { timeout: 10000 }).toBe(75);
  await drag(0, -200);
  await drag(0, -200);
  await expect.poll(async () => (await modelPose(page)).pitch, { timeout: 10000 }).toBe(0);
  await drag(-250, 0);
  await drag(-250, 0);
  await expect.poll(async () => turned.yaw - (await modelPose(page)).yaw, { timeout: 10000 }).toBeGreaterThan(180);
  // The zoom buttons zoom it (its camera), and the wheel too.
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => (await modelPose(page)).zoom).toBe(1.25);
  if (!testInfo.project.name.includes("mobile")) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -240);
    await expect.poll(async () => (await modelPose(page)).zoom).toBeGreaterThan(1.3);
  }
  // With the view focused, the arrow keys turn it and do not browse.
  const title = await dialog.locator("#journey-examine-title").textContent();
  await stage.focus();
  const yaw = (await modelPose(page)).yaw;
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await modelPose(page)).yaw).toBeCloseTo(yaw + 15, 0);
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator("#journey-examine-title")).toHaveText(title);
  // A double-click puts it back at rest, by the shortest way round.
  await stage.dblclick();
  await expect
    .poll(async () => {
      const pose = await modelPose(page);
      return { yaw: Math.round(((((pose.yaw - rest.yaw) % 360) + 540) % 360) - 180), pitch: pose.pitch, zoom: pose.zoom };
    })
    .toEqual({ yaw: 0, pitch: rest.pitch, zoom: 1 });
  await expect(dialog.locator(".examine-zoom-level")).toHaveText("100%");

  // Show photo: the photo is back and the model disposed (its canvas gone), turned or not.
  await drag(120, 0);
  await modelToggle(page).click();
  await expectPhotoView(page);
  await expect(stage).not.toHaveAttribute("tabindex", /./);
  await expect(dialog.locator(".examine-object")).not.toHaveAttribute("aria-label", /3D model/);
  await expect(dialog.locator("canvas")).toHaveCount(0);
  expect(await page.locator("canvas").count()).toBe(canvases);
  // Pressed again, it comes back (from the browser's cache).
  await modelToggle(page).click();
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  await expect(host.locator("canvas")).toHaveCount(1);
  expect(await modelPose(page)).toMatchObject({ yaw: rest.yaw, pitch: rest.pitch, zoom: 1 });

  // Walking the filmstrip puts the model away; coming back, the photo shows again and
  // nothing loads until the button is pressed.
  const away = (await dialog.locator(".examine-next").isDisabled()) ? "Previous document" : "Next document";
  const back = away === "Next document" ? "Previous document" : "Next document";
  await dialog.getByRole("button", { name: away, exact: true }).click();
  await expect(host.locator("canvas")).toHaveCount(0);
  await expect(stage).not.toHaveAttribute("data-model", /./);
  await expect(stage).not.toHaveAttribute("tabindex", /./);
  await expect(modelToggle(page)).toBeHidden();
  await expect(modelNote(page)).toBeHidden();
  const loaded = loads.filter((url) => url.endsWith(TEST_MODEL)).length;
  await dialog.getByRole("button", { name: back, exact: true }).click();
  await expectPhotoView(page);
  await page.waitForTimeout(1000);
  expect(loads.filter((url) => url.endsWith(TEST_MODEL)).length).toBe(loaded);
  await expect(dialog.locator(".examine-model canvas")).toHaveCount(0);
  // Closing with the model showing lets go of it: no canvas left behind, the map's WebGL
  // still alive, and the next opening is the photo's.
  await modelToggle(page).click();
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(dialog.locator("canvas")).toHaveCount(0);
  expect(await page.locator("canvas").count()).toBe(canvases);
  await mapReady(page);
  expect(
    await mapFigure(page)
      .locator("canvas.maplibregl-canvas")
      .evaluate((canvas) => {
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        return Boolean(gl) && !gl.isContextLost();
      })
  ).toBe(true);
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  await expectPhotoView(page);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("the 3D button works from the keyboard: Enter shows the model, Space the photo again", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no 3D view");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords");
  const dialog = page.locator("dialog.journey-examine");
  const stage = dialog.locator(".examine-view");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  await expectPhotoView(page);
  // Tab reaches it, inside the window (on a desktop; a phone has no Tab key).
  await expect(dialog.locator(".examine-back")).toBeFocused();
  if (!testInfo.project.name.includes("mobile")) {
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await modelToggle(page).evaluate((element) => document.activeElement === element);
    }
    expect(reached, "Tab reaches the 3D button").toBe(true);
  } else await modelToggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  await expect(modelToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(modelToggle(page)).toBeFocused();
  await expect(modelNote(page)).toBeVisible();
  await page.keyboard.press("Space");
  await expectPhotoView(page);
  await expect(modelToggle(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("the 3D model appears at rest, never turns by itself, and coasts when flung, then stops", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "the mouse fling is a desktop gesture");
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no 3D view");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords");
  const dialog = page.locator("dialog.journey-examine");
  const stage = dialog.locator(".examine-view");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await modelToggle(page).click();
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  // Its first frame is already the resting pose (the test box's default), with no turn-in,
  // and it stays there (no spin of its own). In software rendering a frame can take over
  // half a second, so it is called still only after a long quiet spell.
  const rest = await modelPose(page);
  expect(rest).toMatchObject({ yaw: -20, pitch: 16, zoom: 1 });
  await page.waitForTimeout(2000);
  expect(await modelPose(page)).toEqual(rest);
  const settled = async () => {
    const before = await modelPose(page);
    await page.waitForTimeout(1500);
    const after = await modelPose(page);
    return before.yaw === after.yaw && before.pitch === after.pitch;
  };
  // A quick flick: it goes on turning after the pointer is let go, then stops.
  const box = await stage.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // (Sent in the page, 12 ms apart and let go at once, so the flick keeps its own pace: the
  // mouse's events each wait for a frame, which software rendering can take a fifth of a
  // second to draw, and a pointer let go that long after it last moved has stopped.)
  await stage.evaluate(
    async (element, { x, y }) => {
      const send = (type, at) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 7,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: at,
            clientY: y,
          })
        );
      send("pointerdown", x);
      for (let step = 1; step <= 4; step++) {
        await new Promise((resolve) => setTimeout(resolve, 12));
        send("pointermove", x + 40 * step);
      }
      send("pointerup", x + 160);
    },
    { x, y }
  );
  // 160 px turns it 72 degrees; it coasts on past that, but by no more than about a third
  // of a turn.
  await expect.poll(async () => (await modelPose(page)).yaw - rest.yaw, { timeout: 10000 }).toBeGreaterThan(75);
  await expect.poll(settled, { timeout: 20000 }).toBe(true);
  expect((await modelPose(page)).yaw - rest.yaw).toBeLessThan(72 + 130);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

// A cutout of the test box as a product photo shows it in a given pose: its outline seen from
// far off (orthographic), with the viewer's conventions (yaw turns it on its turntable, pitch
// looks down on it), filled in grey and set in uneven clear margins, as a real cutout is.
// Drawn in the page, as a PNG data URL.
const boxPoster = (page, { yaw, pitch }) =>
  page.evaluate(
    ({ yaw, pitch }) => {
      const half = [0.25, 0.15, 0.2];
      const turn = (yaw * Math.PI) / 180;
      const tilt = (pitch * Math.PI) / 180;
      const points = [];
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const [px, py, pz] = [sx * half[0], sy * half[1], sz * half[2]];
            const x = px * Math.cos(turn) + pz * Math.sin(turn);
            const z = -px * Math.sin(turn) + pz * Math.cos(turn);
            points.push([x, -(py * Math.cos(tilt) - z * Math.sin(tilt))]);
          }
        }
      }
      // Its outline: the convex hull of the corners (monotone chain).
      points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const chain = (list) => {
        const out = [];
        for (const point of list) {
          while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
          out.push(point);
        }
        return out.slice(0, -1);
      };
      const hull = [...chain(points), ...chain([...points].reverse())];
      const left = Math.min(...hull.map((point) => point[0]));
      const top = Math.min(...hull.map((point) => point[1]));
      const k = 560 / (Math.max(...hull.map((point) => point[0])) - left);
      const margin = { left: 24, right: 96, top: 12, bottom: 64 };
      const canvas = document.createElement("canvas");
      canvas.width = 560 + margin.left + margin.right;
      canvas.height = Math.round((Math.max(...hull.map((point) => point[1])) - top) * k + margin.top + margin.bottom);
      const paint = canvas.getContext("2d");
      const shade = paint.createLinearGradient(0, 0, canvas.width, canvas.height);
      shade.addColorStop(0, "#9aa3ad");
      shade.addColorStop(1, "#5d6670");
      paint.fillStyle = shade;
      paint.beginPath();
      hull.forEach(([x, y], index) => {
        const at = [(x - left) * k + margin.left, (y - top) * k + margin.top];
        if (index) paint.lineTo(...at);
        else paint.moveTo(...at);
      });
      paint.closePath();
      paint.fill();
      return canvas.toDataURL("image/png");
    },
    { yaw, pitch }
  );

test("the 3D model's first frame is its photo: the same pose, size and place, so the swap shows no jump", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no 3D view");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords");
  // The cords' cutout becomes a photo of the test box, turned 35 degrees and seen from 30
  // degrees up, and its yml pose says so.
  const pose = { yaw: 35, pitch: 30 };
  const poster = await boxPoster(page, pose);
  await page.locator("#board-westminster-cords").evaluate(
    (doc, { poster, pose }) => {
      doc.dataset.modelYaw = String(pose.yaw);
      doc.dataset.modelPitch = String(pose.pitch);
      const image = doc.querySelector(".board-artifact-object img");
      image.removeAttribute("srcset");
      image.src = poster;
      return image.decode();
    },
    { poster, pose }
  );
  const dialog = page.locator("dialog.journey-examine");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  await expectPhotoView(page);
  // Zoomed in on the photo first: the press brings it back to rest before the model shows.
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  const photoBefore = await dialog.locator(".examine-object img").boundingBox();
  await modelToggle(page).click();
  // At the swap (the first check once the model is ready, as the cross-fade starts), the
  // model is in the yml pose and its silhouette lies on the photo's.
  const swap = await (
    await page.waitForFunction(
      () => {
        const stage = document.querySelector("dialog.journey-examine .examine-view");
        if (!stage || stage.dataset.model !== "ready" || !window.__journeyModel.ready) return null;
        return { pose: window.__journeyModel.pose(), match: window.__journeyModel.compare(2) };
      },
      null,
      { timeout: 30000, polling: "raf" }
    )
  ).jsonValue();
  expect(swap.pose).toMatchObject({ ...pose, zoom: 1 });
  expect(swap.match.poster, "the photo's silhouette is there").toBeGreaterThan(2000);
  expect(swap.match.iou, `the first frame on the photo: ${JSON.stringify(swap.match)}`).toBeGreaterThanOrEqual(0.85);
  expect((await dialog.locator(".examine-object img").boundingBox()).width).toBeLessThan(photoBefore.width);
  // It stays so (nothing turns in afterwards).
  await page.waitForTimeout(1500);
  expect(await modelPose(page)).toMatchObject({ ...pose, zoom: 1 });
  expect((await page.evaluate(() => window.__journeyModel.compare(2))).iou).toBeGreaterThanOrEqual(0.85);
  // The match is the pose's, not the fit's alone: another resting pose, refitted to the same
  // photo, lies on it worse.
  const wrong = await page.evaluate(() => {
    window.__journeyModel.setPose(85, 70);
    return window.__journeyModel.compare(2);
  });
  expect(wrong.iou).toBeLessThan(swap.match.iou - 0.03);
  // Back to the photo: it lies where it lay before the press (the photo and the model share
  // one place, and Show photo moves nothing).
  const photoAtRest = await dialog.locator(".examine-object img").boundingBox();
  await modelToggle(page).click();
  await expectPhotoView(page);
  const photoAfter = await dialog.locator(".examine-object img").boundingBox();
  for (const key of ["x", "y", "width", "height"]) expect(Math.abs(photoAfter[key] - photoAtRest[key])).toBeLessThan(1.5);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("without WebGL an object with a model keeps its photo, says the 3D model is unavailable, and never loads three.js", async ({
  page,
}, testInfo) => {
  const errors = watchErrors(page);
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  const loads = [];
  page.on("request", (request) => {
    if (MODEL_REQUEST.test(request.url())) loads.push(request.url());
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(type)) return null;
      return original.call(this, type, ...rest);
    };
  });
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords");
  const dialog = page.locator("dialog.journey-examine");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".examine-object")).toHaveClass(/\bis-rigid\b/);
  await expect(dialog.locator(".examine-object img")).toBeVisible();
  await expect(dialog.locator(".examine-kicker")).not.toContainText("3D");
  await expect(modelToggle(page)).toHaveText("3D model unavailable");
  await expect(modelToggle(page)).toHaveAttribute("aria-disabled", "true");
  await expect(modelToggle(page)).toHaveAttribute("aria-pressed", "false");
  // Pressing it does nothing (it is aria-disabled, so the click is forced).
  await modelToggle(page).click({ force: true });
  await expect(dialog.locator(".examine-model canvas")).toHaveCount(0);
  await expect(dialog.locator(".examine-view")).not.toHaveAttribute("data-model", /./);
  await expect(modelNote(page)).toBeHidden();
  if (!testInfo.project.name.includes("mobile")) {
    await expect(dialog.locator(".examine-hint")).toHaveText("Scroll to zoom");
  }
  await page.waitForTimeout(500);
  expect(loads).toEqual([]);
  expect(warnings.some((warning) => /Journey 3D model unavailable/.test(warning))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("a model that fails to load, or loses its WebGL context, leaves the photo as it was", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so no model is ever requested");
  await giveTestModel(page, "fort-lauderdale", "westminster-cords", { status: 404 });
  const dialog = page.locator("dialog.journey-examine");
  const stage = dialog.locator(".examine-view");
  const object = dialog.locator(".examine-object");
  const unavailable = async () => {
    await expect(stage).toHaveAttribute("data-model", "failed", { timeout: 30000 });
    await expect(dialog.locator(".examine-model canvas")).toHaveCount(0);
    await expect(object).toHaveClass(/\bis-rigid\b/);
    await expect.poll(() => object.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect(dialog.locator(".examine-kicker")).not.toContainText("3D");
    await expect(object).not.toHaveAttribute("aria-label", /3D model/);
    await expect(modelToggle(page)).toHaveText("3D model unavailable");
    await expect(modelToggle(page)).toHaveAttribute("aria-disabled", "true");
    await expect(modelToggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(modelToggle(page)).not.toHaveAttribute("aria-busy", /./);
    await expect(modelNote(page)).toBeHidden();
    await expect(stage).not.toHaveAttribute("aria-describedby", /./);
    if (!testInfo.project.name.includes("mobile")) {
      await expect(dialog.locator(".examine-hint")).toHaveText("Scroll to zoom");
    }
  };
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expectPhotoView(page);
  await modelToggle(page).click();
  await unavailable();
  expect(warnings.some((warning) => /Journey 3D model unavailable/.test(warning))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // A model that loads, then loses its context: the photo comes back.
  await page.unroute(`**${TEST_MODEL}`);
  await giveTestModel(page, "fort-lauderdale", "westminster-cords");
  await page.locator("#board-westminster-cords > .board-doc-open").evaluate((element) => element.click());
  await expectPhotoView(page);
  await modelToggle(page).click();
  await expect(stage).toHaveAttribute("data-model", "ready", { timeout: 30000 });
  await dialog.locator(".examine-model canvas").evaluate((canvas) => canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
  await unavailable();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(withoutRefusedLoads(errors)).toEqual([]);
});

// The three models, and what each one's note says while it shows: the two generated from
// their photos keep the default note and kicker; the Pixel Watch, Google's own product model
// adapted to Jiatuo's watch, names its source (yml model_note and model_kicker).
const WATCH_NOTE = "3D model source: Google's Pixel Watch 3 product model.";
const MODELS = [
  { id: "frc-744-2019-robot", stop: "fort-lauderdale", note: NOTE, kicker: "Object, 3D model from a photo" },
  { id: "idts-linktop", stop: "hangzhou", note: NOTE, kicker: "Object, 3D model from a photo" },
  { id: "sensorclaw-pixel-watch", stop: "evanston", note: WATCH_NOTE, kicker: "Object, 3D model" },
];

test("each of the three 3D models shows its own note, and the watch's first frame is its photo", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  expect((await page.locator(".board-doc[data-model]").evaluateAll((docs) => docs.map((doc) => doc.id))).sort()).toEqual(
    MODELS.map((model) => `board-${model.id}`).sort()
  );
  for (const model of MODELS) {
    const doc = page.locator(`#board-${model.id}`);
    if (model.note === NOTE) await expect(doc).not.toHaveAttribute("data-model-note", /./);
    else await expect(doc).toHaveAttribute("data-model-note", model.note);
  }
  test.skip(!(await hasWebGL(page)), "this browser build has no WebGL, so there is no 3D view");
  const dialog = page.locator("dialog.journey-examine");
  for (const model of MODELS) {
    await tab(page, model.stop).click();
    await expectSelected(page, model.stop);
    await page.locator(`#board-${model.id} > .board-doc-open`).evaluate((element) => element.click());
    await expect(dialog).toBeVisible();
    await expectPhotoView(page);
    // The filmstrip shows the whole cutout, even one as tall and narrow as the watch.
    const thumb = await dialog.locator(".examine-thumb[aria-current] img").evaluate((image) => {
      const frame = image.parentElement.getBoundingClientRect();
      const box = image.getBoundingClientRect();
      return { frame: frame.height, image: box.height };
    });
    expect(thumb.image, `${model.id}: its thumbnail fits its frame`).toBeLessThanOrEqual(thumb.frame + 1);
    await modelToggle(page).click();
    await expect(dialog.locator(".examine-view")).toHaveAttribute("data-model", "ready", { timeout: 40000 });
    await expect(modelNote(page)).toBeVisible();
    await expect(modelNote(page)).toHaveText(model.note);
    await expect(dialog.locator(".examine-kicker")).toHaveText(new RegExp(`· ${model.kicker}$`));
    if (model.id === "sensorclaw-pixel-watch") {
      await expect(dialog.locator(".examine-view")).not.toHaveAttribute("aria-label", /made from a photo/);
      const match = await page.evaluate(() => window.__journeyModel.compare(2));
      expect(match.iou, `the watch's first frame on its photo: ${JSON.stringify(match)}`).toBeGreaterThanOrEqual(0.8);
    }
    await modelToggle(page).click();
    await expectPhotoView(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test("every object's 3D model is a credited glTF binary on the site, with its real size", async ({ page, request }) => {
  await openJourney(page);
  const models = await page
    .locator(".board-doc[data-model]")
    .evaluateAll((docs) =>
      docs.map((doc) => ({ ...doc.dataset, image: doc.querySelector(".board-artifact-object img")?.getAttribute("src") || "" }))
    );
  const credits = fs.readFileSync(path.join(__dirname, "../../assets/img/journey/CREDITS.md"), "utf8");
  for (const model of models) {
    expect(model.kind, model.doc).toBe("artifact");
    expect(model.medium, `${model.doc} keeps its cutout on the board`).toBe("cutout");
    expect(model.image, `${model.doc} has a cutout poster`).toMatch(/\/assets\/img\/journey\/artifacts\/[\w-]+\.png$/);
    expect(model.model, model.doc).toMatch(/\/assets\/models\/journey\/[\w-]+\.glb$/);
    expect(Number(model.modelSize), `${model.doc}: model_size_m, in metres`).toBeGreaterThan(0.005);
    expect(Number(model.modelSize), `${model.doc}: model_size_m, in metres`).toBeLessThan(3);
    if (model.modelYaw !== undefined) expect(Number.isFinite(Number(model.modelYaw)), `${model.doc}: model_yaw`).toBe(true);
    if (model.modelPitch !== undefined) {
      expect(Number(model.modelPitch), `${model.doc}: model_pitch`).toBeGreaterThanOrEqual(Number(model.modelPitchMin ?? 0));
      expect(Number(model.modelPitch), `${model.doc}: model_pitch`).toBeLessThanOrEqual(75);
    }
    if (model.modelPitchMin !== undefined) {
      expect(Number(model.modelPitchMin), `${model.doc}: model_pitch_min`).toBeGreaterThanOrEqual(-35);
      expect(Number(model.modelPitchMin), `${model.doc}: model_pitch_min`).toBeLessThanOrEqual(70);
    }
    // The lens, a vertical field of view in degrees (journey-model.js clamps it to 10..50).
    if (model.modelFov !== undefined) {
      expect(Number(model.modelFov), `${model.doc}: model_fov`).toBeGreaterThanOrEqual(10);
      expect(Number(model.modelFov), `${model.doc}: model_fov`).toBeLessThanOrEqual(50);
    }
    const file = model.model.split("/").pop();
    expect(credits, `${file} has a row in CREDITS.md`).toContain(file);
    const response = await request.get(model.model);
    expect(response.ok(), model.model).toBe(true);
    const body = await response.body();
    expect(body.readUInt32LE(0), `${model.model} is a glTF binary`).toBe(0x46546c67);
    expect(body.length, `${model.model} stays light enough for a phone`).toBeLessThan(12 * 1024 * 1024);
  }
});

test("dragging a paper never drags off its picture file", async ({ page }) => {
  const errors = watchErrors(page);
  await openJourney(page);
  await tab(page, "fort-lauderdale").click();
  await expectSelected(page, "fort-lauderdale");
  await showCork(page, "fort-lauderdale");
  // Every picture is marked not draggable, on the board and in the window.
  const draggable = () =>
    page.evaluate(() => [...document.querySelectorAll(".journey-board img, dialog.journey-examine img")].filter((image) => image.draggable).length);
  expect(await draggable()).toBe(0);
  await page.evaluate(() => {
    window.journeyDrags = [];
    window.addEventListener("dragstart", (event) => {
      if (!event.defaultPrevented) window.journeyDrags.push(event.target.nodeName);
    });
  });
  const dragAcross = async (locator) => {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 70, box.y + box.height * 0.4 + 30, { steps: 10 });
    await page.mouse.up();
  };
  const dialog = page.locator("dialog.journey-examine");
  // (A press and release on a paper may open it: put the window away again.)
  const back = async () => {
    if (await dialog.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  };
  // A print on the board (the team photo) and an object (a robot).
  await dragAcross(page.locator("#board-frc-744-team > .board-doc-photo img"));
  await back();
  await showCork(page, "fort-lauderdale");
  await dragAcross(page.locator("#board-frc-744-2019-robot .board-artifact-object img"));
  await back();
  await showCork(page, "fort-lauderdale");
  // A paper in the window.
  await clickOwn(page, page.locator("#board-frc-744 > .board-doc-open"));
  await expect(dialog).toBeVisible();
  expect(await draggable()).toBe(0);
  await dragAcross(dialog.locator(".examine-object"));
  expect(await page.evaluate(() => window.journeyDrags)).toEqual([]);
  // The text column stays selectable.
  expect(await dialog.locator(".examine-text").evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("the diplomas are only ever the four redacted images", async ({ page, request }) => {
  const errors = watchErrors(page);
  // The redacted files made by bin/build_journey_diplomas.py (never any other rendering).
  // If that script is deliberately run again, update these hashes with it.
  const REDACTED = {
    "uiuc.jpg": "df148984a4cde22eeaf3c4692eb8410d9d655f9cdd97a395f951ee4a3d20029e",
    "uiuc-large.jpg": "1dca002b0450ff0b837c7f1ff03cccd8559e57ab82c091caa96e9ab4208e0982",
    "columbia.jpg": "e8a7ffcb8f07c525ee82b52318ebb679c9247041b75a2c2d9f11c21a5b4eef59",
    "columbia-large.jpg": "896ec9a1fa59d5f3bf960bbf481ded98dbcf9094739d8508496c2addf171a2a2",
  };
  const crypto = require("node:crypto");
  for (const [name, hash] of Object.entries(REDACTED)) {
    const response = await request.get(`/assets/img/journey/docs/${name}`);
    expect(response.ok(), name).toBe(true);
    expect(
      crypto
        .createHash("sha256")
        .update(await response.body())
        .digest("hex"),
      `${name} is the redacted file`
    ).toBe(hash);
  }
  const docsDir = path.join(__dirname, "../../assets/img/journey/docs");
  expect(
    fs
      .readdirSync(docsDir)
      .filter((file) => /^(uiuc|columbia)/.test(file))
      .sort()
  ).toEqual(Object.keys(REDACTED).sort());

  await openJourney(page);
  // No other diploma path is referenced anywhere on the page.
  const referenced = await page.evaluate(() =>
    [...new Set(document.documentElement.outerHTML.match(/docs\/(?:uiuc|columbia)[^"'\s)]*/g) || [])].sort()
  );
  expect(referenced).toEqual(["docs/columbia-large.jpg", "docs/columbia.jpg", "docs/uiuc-large.jpg", "docs/uiuc.jpg"]);
  // The board shows the normal file; the window swaps in the -large one.
  for (const [stop, id] of [
    ["new-york", "columbia"],
    ["champaign", "uiuc"],
  ]) {
    await tab(page, stop).click();
    await expectSelected(page, stop);
    await expect(page.locator(`#board-${id} .board-scan img`)).toHaveAttribute("src", new RegExp(`/docs/${id}\\.jpg$`));
    await clickOwn(page, page.locator(`#board-${id} > .board-doc-open`));
    const dialog = page.locator("dialog.journey-examine");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".examine-object .board-scan img")).toHaveAttribute("src", new RegExp(`/docs/${id}-large\\.jpg$`), {
      timeout: 15000,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test("the masthead's Journey link glides to the section like the other links", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(tab(page, "evanston")).toHaveAttribute("role", "tab");
  const link = (name) => page.locator(".masthead .visible-links a", { hasText: new RegExp(`^${name}$`) });
  test.skip(!(await link("Journey").isVisible()), "the masthead folds its links into a menu at this width");
  // Follows a click on a masthead link: scroll positions frame by frame until it settles,
  // and where the section's heading lands under the masthead.
  const follow = async (name, heading) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.scrollY === 0);
    await page.evaluate(() => {
      window.journeyScroll = [];
      const tick = () => {
        window.journeyScroll.push(window.scrollY);
        if (window.journeyScroll.length < 240) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await link(name).click();
    await expect.poll(() => page.evaluate(() => window.journeyScroll.length), { timeout: 10000 }).toBeGreaterThanOrEqual(120);
    await expect
      .poll(() =>
        page.evaluate(() => [window.scrollY, (window.journeyScroll || []).slice(-10)]).then(([y, last]) => last.every((value) => value === y))
      )
      .toBe(true);
    return page.evaluate((selector) => {
      const values = window.journeyScroll;
      const top = document.querySelector(selector).getBoundingClientRect().top;
      return {
        steps: new Set(values).size,
        top: Math.round(top),
        end: window.scrollY,
        at: window.scrollY + top,
        max: document.documentElement.scrollHeight - innerHeight,
      };
    }, heading);
  };
  const news = await follow("News", "#news");
  const journey = await follow("Journey", "#journey");
  expect(journey.end).toBeGreaterThan(500);
  expect(news.steps, "the News link glides").toBeGreaterThan(4);
  expect(journey.steps, "the Journey link glides, not jumps").toBeGreaterThan(4);
  // The heading lands where News lands under the masthead, unless the page ends first (the
  // section is the last one: then it stops at the bottom, as any link would).
  const wanted = Math.min(journey.at - news.top, journey.max);
  expect(Math.abs(journey.end - wanted), "the Journey heading lands where the others do").toBeLessThanOrEqual(2);
});

test("the owner's new pictures are on their boards", async ({ page }) => {
  await openJourney(page);
  // Both FRC 744 robots lie on the Fort Lauderdale board as cutouts, each on its paper.
  for (const [id, owner] of [
    ["frc-744-2019-robot", "frc-744"],
    ["frc-744-2020-robot", "frc-744-team"],
  ]) {
    const robot = board(page, "fort-lauderdale").locator(`#board-${id}`);
    await expect(robot).toHaveCount(1);
    await expect(robot).toHaveAttribute("data-attach", owner);
    await expect(robot.locator(".board-artifact-object img")).toHaveAttribute("src", new RegExp(`/artifacts/${id}\\.png$`));
  }
  await expect(board(page, "fort-lauderdale").locator(".board-doc-photo img[src*='sharkattack']")).toHaveCount(0);
  // The canal photo is on the first Hangzhou board.
  await expect(board(page, "hangzhou-early").locator("#board-hangzhou-early-canal-view .board-doc-photo img")).toHaveAttribute(
    "src",
    /hangzhou-early-canal-view\.jpg$/
  );
  // The UIUC diploma is the high-resolution scan, on diploma stock.
  const scan = board(page, "champaign").locator("#board-uiuc .board-scan--diploma img");
  await expect(scan).toHaveCount(1);
  const width = await scan.evaluate(
    (element) =>
      new Promise((resolve) => {
        const probe = new Image();
        probe.onload = () => resolve(probe.naturalWidth);
        probe.onerror = () => resolve(0);
        probe.src = element.currentSrc || element.src;
      })
  );
  expect(width).toBeGreaterThanOrEqual(1500);
  // The intro sentence under the heading is gone; the timeline follows the heading.
  await expect(page.locator(".journey-intro")).toHaveCount(0);
  expect(await page.locator("#journey").evaluate((heading) => Boolean(heading.nextElementSibling?.matches(".journey")))).toBe(true);
});

test("reduced motion opens the examine window and reveals a photo at once", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openJourney(page);
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  const opener = page.locator("#board-columbia > .board-doc-open");
  const running = await opener.evaluate((element) => {
    element.click();
    const dialog = document.querySelector("dialog.journey-examine");
    return { open: dialog.open, animations: dialog.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length };
  });
  expect(running).toEqual({ open: true, animations: 0 });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.journey-examine")).toBeHidden();
  await page.locator("#board-stack-ny-liinc-people .board-stack-open").click();
  await page.locator('.board-fan .board-doc[data-doc="sajda"] > .board-doc-open').focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog.journey-examine");
  await expect(dialog).toBeVisible();
  const image = dialog.locator(".examine-object .board-portrait-original");
  expect(
    await image.evaluate((element) =>
      getComputedStyle(element)
        .transitionDuration.split(",")
        .every((value) => parseFloat(value) === 0)
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- sound ---------- */

test("sound effects are always on, wait for a gesture, and have no switch", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const audio = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/audio/")) audio.push(request.url());
  });
  await openJourney(page);
  const status = await journeySound(page);
  expect(status, "window.JourneySound exists").not.toBeNull();
  expect(await page.evaluate(() => Object.keys(window.JourneySound).sort())).toEqual(["play", "status"]);
  // Sound is always on: there is no switch, and nothing is saved for one.
  await expect(page.getByRole("button", { name: /sound/i })).toHaveCount(0);
  await expect(page.locator(".journey-sound, .journey-sound-toggle")).toHaveCount(0);
  test.skip(!status.supported, "this browser build has no Web Audio, so play() is a silent no-op");
  // Nothing plays, and nothing is fetched, on load, scroll or hover, or when a script asks
  // for a sound with no gesture behind it. (Chromium counts page.evaluate itself as a user
  // gesture for 5 s, so the scripted call waits that out.)
  if (!testInfo.project.use.hasTouch) {
    await tab(page, "champaign").hover();
    await board(page, "evanston").locator(".board-doc").first().hover();
  }
  await page.mouse.wheel(0, 200);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        setTimeout(() => {
          ["tab", "pin", "fan", "whoosh", "toggle", "no-such-sound"].forEach((name) => window.JourneySound.play(name));
          resolve();
        }, 5500)
      )
  );
  expect(await journeySound(page)).toMatchObject({ context: null, loaded: 0, played: 0 });
  expect(audio).toEqual([]);

  // A tab click wakes the audio and loads every sound; then a press plays one. (The very
  // first effect is dropped by design if its file decodes over 250 ms late, as it can on a
  // busy machine, so the test presses again once the files are in.)
  await tab(page, "champaign").click();
  await expect.poll(async () => (await journeySound(page)).loaded, { timeout: 20000 }).toBe(SOUND_FILES);
  expect((await journeySound(page)).context).toBe("running");
  let played = (await journeySound(page)).played;
  await tab(page, "fort-lauderdale").click();
  await expect.poll(async () => (await journeySound(page)).played, { timeout: 5000 }).toBeGreaterThan(played);
  expect(audio.length).toBeGreaterThan(0);
  expect(audio.every((url) => /\/assets\/audio\/journey\/[\w-]+\.wav$/.test(url))).toBe(true);

  // A pile and a paper sound too.
  await tab(page, "new-york").click();
  await expectSelected(page, "new-york");
  played = (await journeySound(page)).played;
  await page.locator("#board-stack-ny-papers .board-stack-open").click();
  await expect.poll(async () => (await journeySound(page)).played, { timeout: 5000 }).toBeGreaterThan(played);
  await page.keyboard.press("Escape");
  await expect(page.locator("#board-stack-ny-papers .board-stack-open")).toHaveAttribute("aria-expanded", "false");

  // The day/night switch clicks once; a scripted theme change stays silent.
  await page.waitForTimeout(400);
  const before = (await journeySound(page)).played;
  await page.getByRole("switch", { name: "Night mode" }).click();
  await expect.poll(async () => (await journeySound(page)).played, { timeout: 5000 }).toBe(before + 1);
  await page.waitForTimeout(700);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("site-theme-change")));
  await page.waitForTimeout(400);
  expect((await journeySound(page)).played).toBe(before + 1);
  expect(await page.evaluate(() => localStorage.getItem("journey-sound"))).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- without JavaScript ---------- */

test("without JavaScript every board is readable and the place list links to it", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#phd-applications")).toBeVisible();
  await expect(mapFigure(page)).toBeHidden();
  await expect(page.locator(".journey-stops [role=tab]")).toHaveCount(0);
  await expect(page.locator(".journey-stops a.journey-stop")).toHaveCount(STOPS.length);
  for (const id of STOPS) {
    await expect(page.locator(`.journey-stops a[href="#journey-${id}"]`)).toBeVisible();
    await expect(board(page, id)).toBeVisible();
    await expect(board(page, id).locator(".board-doc").first()).toBeVisible();
  }
  // A pile is a labelled list whose papers are all readable.
  const papers = page.locator("#board-stack-ny-papers");
  await expect(papers.locator(".board-stack-title")).toContainText("Papers");
  await expect(papers.locator(".board-stack-docs > .board-doc")).toHaveCount(5);
  for (const doc of await papers.locator(".board-stack-docs > .board-doc").all()) await expect(doc.locator(".board-doc-title").first()).toBeVisible();
  await page.locator('.journey-stops a[href="#journey-new-york"]').click();
  await expect(page).toHaveURL(/#journey-new-york$/);
  await expect(page.locator("#journey-new-york-title")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

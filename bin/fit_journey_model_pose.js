#!/usr/bin/env node
/* Finds the resting pose (model_yaw, model_pitch in _data/journey.yml) of a "My Journey"
   artifact's 3D model: the pose in which the model, as the examine window draws it, shows the
   same outline as its cutout. That is the pose the window cross-fades into from the cutout,
   so with it the model's first frame is the photo.

   It drives the real viewer, not a copy of it: it opens the site in Chromium (Playwright,
   the tests' own devDependency), opens the artifact's examine window as a visitor would,
   presses "See 3D model" and waits for the model. Then, through window.__journeyModel
   (assets/js/journey-examine.js), it sets each candidate pose as the resting pose (the viewer refits the model to the
   cutout's outline exactly as it does for a yml pose) and reads back both silhouettes on the
   same grid: the model's from its canvas (alpha, without the table and shadows) and the
   cutout's as it lies in the window. The score is their intersection over union (IoU).

   The search: a coarse grid (yaw all the way round, every --yaw-step degrees; pitch 0 to 75,
   every --pitch-step), then a pattern search from the best few distinct starts, halving its
   steps down to --fine degrees. A silhouette alone cannot tell a symmetric object's sides
   apart (a square puck looks the same every 90 degrees), so poses within 0.01 of the best IoU
   are told apart by how well the shading inside the shared outline agrees (the correlation
   of the two pictures' brightness there; the photo's lighting differs, its pattern of dark and
   light parts much less). Every candidate it settles on is printed, and the best last, as a
   JSON line (with the lens it ran with, fov, null for the default). It changes no file: put
   the pose in the yml by hand, then look at the window.

   Usage, from the repo root, with the site served (the Docker preview, or jekyll serve):
     node bin/fit_journey_model_pose.js <doc id> [options]
   Options:
     --url URL           the site (default http://127.0.0.1:8080)
     --model FILE        serve this .glb as the model instead of the site's (a --try
                         candidate from the generator, before it is adopted)
     --size-m M          its real longest side, in metres, for a doc that has no model yet
     --fov DEG           the viewer's lens for this run instead of the yml model_fov (default
                         20). A photo taken close up, with strong perspective (a converging
                         frame), fits better with a wider lens: run it with a few (20, 30, 40)
                         and put the best in the yml as model_fov with the pose
     --poster FILE       use this PNG as the cutout instead of the site's
     --yaw-step DEG      coarse grid steps (default 15 and 10)
     --pitch-step DEG
     --fine DEG          the finest refinement step (default 0.5)
     --step PX           the silhouettes' grid, in CSS pixels (default 2)
     --viewport WxH      the window size (default 1366x900)
     --headed            a visible browser, on the real GPU (much faster than headless,
                         which draws in software, SwiftShader)
     --dump FILE         write the two silhouettes in the pose it ends on as a PNG (white
                         both, red the model only, blue the cutout only)
     --smoke             only open the window and score the yml pose and one other (a
                         check that the tool works)
   It exits with 1 if the model does not load. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
// The doc id: the one argument that is neither an option nor an option's value.
const VALUED = ["url", "model", "size-m", "fov", "poster", "yaw-step", "pitch-step", "fine", "step", "viewport", "dump"];
const id = args.find((arg, index) => !arg.startsWith("--") && !(index > 0 && VALUED.includes(args[index - 1].replace(/^--/, ""))));
if (!id) {
  console.error("Usage: node bin/fit_journey_model_pose.js <doc id> [--url URL] [--model FILE] [--poster FILE] [--headed] [--smoke] ...");
  process.exit(2);
}
const site = option("url", "http://127.0.0.1:8080").replace(/\/$/, "");
const modelFile = option("model", null);
const posterFile = option("poster", null);
const dumpFile = option("dump", null);
const sizeM = option("size-m", null);
const fov = option("fov", null);
const yawStep = Number(option("yaw-step", 15));
const pitchStep = Number(option("pitch-step", 10));
const fine = Number(option("fine", 0.5));
const step = Number(option("step", 2));
const [viewW, viewH] = option("viewport", "1366x900").split("x").map(Number);
const PITCH = [0, 75];
// Poses this close in IoU are told apart by their shading.
const TIE = 0.01;

const wrap = (yaw) => {
  const turned = ((((yaw + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
};
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

async function main() {
  const browser = await chromium.launch({
    headless: !flag("headed"),
    // Headless Chrome draws WebGL in software only with these (as the tests do).
    args: flag("headed") ? [] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: viewW, height: viewH }, deviceScaleFactor: 1 });
    page.on("console", (message) => {
      const text = message.text();
      // (The map's tiles are refused on purpose.)
      if ((message.type() === "error" && !/Failed to load resource/.test(text)) || /Journey 3D model/.test(text)) console.error(`  [page] ${text}`);
    });
    // The map's tile hosts are of no use here.
    await page.route(/^https:\/\/(tiles\.openfreemap\.org|gibs\.earthdata\.nasa\.gov|elevation-tiles-prod\.s3\.amazonaws\.com)\//, (route) =>
      route.abort()
    );
    const modelUrl = `/assets/models/journey/${id}.glb`;
    if (modelFile) {
      const body = fs.readFileSync(path.resolve(modelFile));
      await page.route(`**${modelUrl}`, (route) => route.fulfill({ contentType: "model/gltf-binary", body }));
    }
    await page.goto(`${site}/`);
    const doc = page.locator(`#board-${id}`);
    if (!(await doc.count())) throw new Error(`No document #board-${id} on ${site}/`);
    const stop = await doc.evaluate((element) => element.closest("section.journey-board")?.dataset.stop || "");
    await page.locator(".journey-stops").scrollIntoViewIfNeeded();
    if (stop) await page.locator(`.journey-stops a[data-stop="${stop}"]`).click();
    // A candidate model or cutout stands in for the site's (what a yml model field and the
    // generator's adopted files would give).
    const poster = posterFile ? `data:image/png;base64,${fs.readFileSync(path.resolve(posterFile)).toString("base64")}` : null;
    const configured = await doc.evaluate(
      (element, { modelUrl, given, sizeM, fov, poster }) => {
        if (given || !element.dataset.model) element.dataset.model = modelUrl;
        if (sizeM) element.dataset.modelSize = sizeM;
        if (fov) element.dataset.modelFov = fov;
        if (poster) {
          const image = element.querySelector(".board-artifact-object img");
          if (image) {
            image.removeAttribute("srcset");
            image.src = poster;
          }
        }
        const number = (value) => (value === undefined || value === "" ? null : Number(value));
        return { yaw: number(element.dataset.modelYaw), pitch: number(element.dataset.modelPitch), fov: number(element.dataset.modelFov) };
      },
      { modelUrl, given: Boolean(modelFile), sizeM, fov, poster }
    );
    if (poster) await doc.locator(".board-artifact-object img").evaluate((image) => image.decode().catch(() => {}));
    await doc.locator(":scope > .board-doc-open").evaluate((element) => element.click());
    const stage = page.locator("dialog.journey-examine .examine-view");
    await stage.waitFor({ state: "visible", timeout: 20000 });
    // The window opens on the photo; the model loads only on "See 3D model".
    await page.locator("dialog.journey-examine .examine-model-toggle").click();
    const started = Date.now();
    let state = "";
    while (Date.now() - started < 60000) {
      state = (await stage.getAttribute("data-model")) || "";
      if (state === "ready" || state === "failed") break;
      await page.waitForTimeout(200);
    }
    if (state !== "ready") throw new Error(`The model did not load (data-model="${state}")`);
    const ready = await page.evaluate(() => window.__journeyModel.pose());
    console.log(
      `${id}: model ready at yaw ${ready.yaw}, pitch ${ready.pitch} (yml: ${configured.yaw ?? "default"}, ${configured.pitch ?? "default"}; lens ${configured.fov ?? "default"})`
    );

    const seen = new Map();
    let scored = 0;
    const score = async (yaw, pitch) => {
      const key = `${round(wrap(yaw), 2)}/${round(pitch, 2)}`;
      if (seen.has(key)) return seen.get(key);
      const result = await page.evaluate(
        ({ yaw, pitch, step }) => {
          const hook = window.__journeyModel;
          const rest = hook.setPose(yaw, pitch);
          const compare = hook.compare(step);
          return compare && { yaw: rest.yaw, pitch: rest.pitch, iou: compare.iou, model: compare.model, poster: compare.poster };
        },
        { yaw: wrap(yaw), pitch, step }
      );
      if (!result) throw new Error("The viewer gave no silhouettes (is the window still open?)");
      scored++;
      seen.set(key, result);
      return result;
    };
    // How well the shading inside the shared outline agrees: the correlation of the two
    // pictures' brightness there (-1 to 1).
    const shading = async (yaw, pitch) => {
      await page.evaluate(({ yaw, pitch }) => window.__journeyModel.setPose(yaw, pitch), { yaw, pitch });
      return page.evaluate((step) => window.__journeyModel.compare(step, { shading: true }).shading, step);
    };

    // The two silhouettes in a pose, as a PNG.
    const dump = async (yaw, pitch) => {
      if (!dumpFile) return;
      const png = await page.evaluate(
        ({ yaw, pitch, step }) => {
          window.__journeyModel.setPose(yaw, pitch);
          const { model, poster } = window.__journeyModel.masks(step);
          const canvas = document.createElement("canvas");
          canvas.width = model.cols;
          canvas.height = model.rows;
          const paint = canvas.getContext("2d");
          const image = paint.createImageData(model.cols, model.rows);
          for (let i = 0; i < model.bits.length; i++) {
            const a = model.bits[i] === "1";
            const b = poster.bits[i] === "1";
            const colour = a && b ? [255, 255, 255] : a ? [220, 40, 40] : b ? [40, 90, 230] : [0, 0, 0];
            image.data.set([...colour, 255], i * 4);
          }
          paint.putImageData(image, 0, 0);
          return canvas.toDataURL("image/png").split(",")[1];
        },
        { yaw, pitch, step }
      );
      fs.writeFileSync(path.resolve(dumpFile), Buffer.from(png, "base64"));
      console.log(`  silhouettes at yaw ${round(yaw)}, pitch ${round(pitch)} written to ${path.resolve(dumpFile)}`);
    };

    const now = await score(ready.yaw, ready.pitch);
    console.log(`  as configured: IoU ${now.iou.toFixed(4)}`);
    if (flag("smoke")) {
      const other = await score(ready.yaw + 90, Math.min(PITCH[1], ready.pitch + 20));
      console.log(`  smoke: yaw ${round(other.yaw)}, pitch ${round(other.pitch)}: IoU ${other.iou.toFixed(4)}`);
      await dump(ready.yaw, ready.pitch);
      console.log(
        JSON.stringify({
          id,
          smoke: true,
          configured: { yaw: ready.yaw, pitch: ready.pitch, iou: round(now.iou, 4) },
          other: { yaw: round(other.yaw), pitch: round(other.pitch), iou: round(other.iou, 4) },
        })
      );
      return;
    }

    // The coarse grid.
    const grid = [];
    for (let pitch = PITCH[0]; pitch <= PITCH[1] + 1e-6; pitch += pitchStep) {
      for (let yaw = -180 + yawStep; yaw <= 180 + 1e-6; yaw += yawStep) grid.push(await score(yaw, Math.min(pitch, PITCH[1])));
    }
    if (PITCH[1] % pitchStep) for (let yaw = -180 + yawStep; yaw <= 180 + 1e-6; yaw += yawStep) grid.push(await score(yaw, PITCH[1]));
    grid.sort((a, b) => b.iou - a.iou);
    // The best few distinct starts (at least two steps apart in yaw or pitch).
    const starts = [];
    for (const candidate of grid) {
      const apart = starts.every(
        (start) => Math.abs(wrap(candidate.yaw - start.yaw)) >= yawStep * 2 || Math.abs(candidate.pitch - start.pitch) >= pitchStep * 2
      );
      if (apart) starts.push(candidate);
      if (starts.length === 4) break;
    }
    console.log(
      `  coarse grid: ${grid.length} poses; starts ${starts.map((start) => `${round(start.yaw)}/${round(start.pitch)} (${start.iou.toFixed(3)})`).join(", ")}`
    );

    // A pattern search from each start, halving its steps.
    const settled = [];
    for (const start of starts) {
      let best = start;
      let dy = yawStep / 2;
      let dp = pitchStep / 2;
      while (dy >= fine || dp >= fine) {
        let moved = false;
        for (const [sy, sp] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const pitch = Math.min(PITCH[1], Math.max(PITCH[0], best.pitch + sp * dp));
          const next = await score(best.yaw + sy * dy, pitch);
          if (next.iou > best.iou + 1e-5) {
            best = next;
            moved = true;
          }
        }
        if (!moved) {
          dy /= 2;
          dp /= 2;
        }
      }
      settled.push(best);
      console.log(`  from ${round(start.yaw)}/${round(start.pitch)}: yaw ${round(best.yaw)}, pitch ${round(best.pitch)}, IoU ${best.iou.toFixed(4)}`);
    }
    settled.sort((a, b) => b.iou - a.iou);
    const close = settled.filter((candidate) => candidate.iou >= settled[0].iou - TIE);
    let best = settled[0];
    if (close.length > 1) {
      let agree = -Infinity;
      for (const candidate of close) {
        candidate.shading = await shading(candidate.yaw, candidate.pitch);
        console.log(
          `  tie: yaw ${round(candidate.yaw)}, pitch ${round(candidate.pitch)}: IoU ${candidate.iou.toFixed(4)}, shading ${candidate.shading.toFixed(3)}`
        );
        if (candidate.shading > agree) {
          agree = candidate.shading;
          best = candidate;
        }
      }
    }
    await dump(best.yaw, best.pitch);
    console.log(`  ${scored} poses scored. Best: model_yaw ${round(best.yaw)}, model_pitch ${round(best.pitch)} (IoU ${best.iou.toFixed(4)})`);
    console.log(
      JSON.stringify({
        id,
        yaw: round(best.yaw),
        pitch: round(best.pitch),
        iou: round(best.iou, 4),
        fov: configured.fov,
        configured: { yaw: ready.yaw, pitch: ready.pitch, iou: round(now.iou, 4) },
        candidates: settled.map((candidate) => ({ yaw: round(candidate.yaw), pitch: round(candidate.pitch), iou: round(candidate.iou, 4) })),
      })
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

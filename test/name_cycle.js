const assert = require("node:assert/strict");
const NameCycle = require("../assets/js/name-cycle.js");

assert.deepEqual(NameCycle.parseHook(""), { mode: "cycle" });
assert.deepEqual(NameCycle.parseHook("?name-cycle=static"), { mode: "static" });
assert.deepEqual(NameCycle.parseHook("?name-cycle=native"), { mode: "pin", name: "native" });
assert.deepEqual(NameCycle.parseHook("?name-cycle=en@0.25"), { mode: "frozen", name: "en", progress: 0.25 });
assert.deepEqual(NameCycle.parseHook("?name-cycle=nonsense"), { mode: "cycle" }, "An unknown value must leave the normal cycle running");

// A 40x8 strip with ink in its left half only, on rows 2 to 5.
const width = 40;
const height = 8;
const data = new Uint8ClampedArray(width * height * 4);
for (let y = 2; y < 6; y++) for (let x = 0; x < width / 2; x++) data[(y * width + x) * 4 + 3] = 255;
const sampled = NameCycle.sampleColumns(data, width, height, 1, 4);
assert.equal(sampled.length, 5, "Streams start only in columns where the name has ink");
assert(
  sampled.every((column) => column.x < width / 2 && column.top === 2 && column.bottom === 6),
  "Each column records where its ink starts and ends"
);

// The heading is 44px tall; these coordinates start at the top of the redrawn strip.
const { ABOVE, BELOW, ROW, COLUMN } = NameCycle;
const floor = ABOVE + 44 + BELOW;
const columns = (left, count) =>
  Array.from({ length: count }, (_, i) => ({ x: left + COLUMN / 2 + i * COLUMN, top: ABOVE + 11, bottom: ABOVE + 33 }));
const from = { box: { left: 22, width: 164 }, columns: columns(22, 30) };
const to = { box: { left: 71, width: 66 }, columns: columns(71, 12) };
const at = (p, seed = 1) => NameCycle.timeline(from, to, p, seed, floor);
const start = at(0);
assert(start.wipe < from.box.left - 20 && start.reveal === null && start.particles.length === 0, "The change starts from the untouched name");
const end = at(1);
assert(end.wipe === null && end.reveal > to.box.left + to.box.width + 20 && end.particles.length === 0, "The change ends on the clean new name");
const middle = at(0.45);
assert(middle.wipe !== null && middle.reveal !== null && middle.particles.length > 40, "Mid-change, both names are partly code");
assert.deepEqual(middle, at(0.45), "A frame depends only on its inputs");
assert(middle.particles.some((particle) => particle.head) && middle.particles.some((particle) => !particle.head), "A stream has a head and a trail");
let previous = -Infinity;
let most = 0;
for (let p = 0; p <= 1.0001; p += 0.02) {
  const frame = at(p, 3);
  most = Math.max(most, frame.particles.length);
  if (frame.wipe !== null) {
    assert(frame.wipe >= previous, "The wipe only moves forward");
    previous = frame.wipe;
  }
  for (const particle of frame.particles) {
    assert(particle.alpha > 0 && particle.alpha <= 1, "Glyph opacity stays in range");
    assert(NameCycle.GLYPHS.includes(particle.char), "Particles are code glyphs");
    assert(Math.abs(particle.y / ROW - Math.round(particle.y / ROW)) < 1e-9, "Glyphs stand on the rows of the grid");
    assert(particle.y >= ROW * 0.6 && particle.y <= floor - ROW * 0.6, `Glyphs stay inside the redrawn strip (y ${particle.y} at ${p.toFixed(2)})`);
    assert(particle.x > 0 && particle.x < 208, "Glyphs stay inside the name's box");
  }
}
assert(most < 400, "A frame stays cheap to draw");
// Old ink runs down: no outgoing glyph is above the top of the ink it came from.
const falling = NameCycle.timeline(from, { box: to.box, columns: [] }, 0.4, 2, floor);
assert(falling.particles.length > 0 && falling.particles.every((particle) => particle.y >= ABOVE + 11));
assert(
  falling.particles.some((particle) => particle.y > ABOVE + 33),
  "The code runs on a little below the name"
);
// New ink is rained in from above and never runs past the foot of the name.
const arriving = NameCycle.timeline({ box: from.box, columns: [] }, to, 0.6, 2, floor);
assert(arriving.particles.length > 0 && arriving.particles.every((particle) => particle.y <= ABOVE + 33));
assert(
  arriving.particles.some((particle) => particle.y < ABOVE + 11),
  "The code arrives from above the name"
);
assert(NameCycle.HOLD >= 5000 && NameCycle.HOLD <= 6000 && NameCycle.DURATION >= 1200 && NameCycle.DURATION <= 2000);
console.log("Name cycle timeline passed.");

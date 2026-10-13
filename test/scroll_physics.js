const assert = require("node:assert/strict");
const Spool = require("../assets/js/scroll-physics.js");
for (const height of [540, 665, 800]) {
  const spool = new Spool(height);
  spool.toggle();
  for (let i = 0; i < 30; i++) spool.step(1 / 120);
  assert(spool.progress > 0 && spool.progress < 0.2, "The spindle must accelerate into winding rather than jump");
  const before = spool.progress;
  const velocity = spool.velocity;
  spool.toggle();
  assert.equal(spool.velocity, velocity, "Reversing the target must preserve angular momentum");
  spool.step(1 / 120);
  assert(spool.progress > before, "The spindle must coast briefly while its reverse torque brakes it");
  let settled = false;
  for (let i = 0; i < 600 && !settled; i++) settled = spool.step(i % 2 ? 1 / 30 : 1 / 120);
  assert(settled && spool.progress < 0.001, "Unwinding must settle at the open stop");
  spool.snap();
  spool.toggle();
  settled = false;
  for (let i = 0; i < 600 && !settled; i++) {
    settled = spool.step(i % 2 ? 1 / 30 : 1 / 120);
    assert(Number.isFinite(spool.feedAcceleration), "Changing feed speed must remain finite");
    assert(spool.progress >= 0 && spool.progress <= 1, "The sheet must stay within its winding limits");
    assert(Math.abs(spool.velocity) <= 36.001, "The winding speed must stay bounded");
    assert(Math.abs(spool.radius ** 2 - (36 + ((12 + spool.wound) * 0.42) / Math.PI)) < 0.001, "Radius must grow from the actual stored material");
  }
  assert(settled && spool.progress > 0.999, "Winding must settle at the closed stop");
  spool.snap();
  assert.equal(spool.progress, 1);
  assert.equal(spool.velocity, 0);
  spool.configure(height + 100);
  assert.equal(spool.progress, 1, "Resizing a closed scroll must preserve its state");
}
console.log("Scroll spindle: acceleration, momentum, material radius, soft stops and resize checks passed.");

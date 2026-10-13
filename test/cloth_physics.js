const assert = require("node:assert/strict");
const Cloth = require("../assets/js/cloth-physics.js");
const cloth = new Cloth(191, 634);
const pointer = { active: true, x: 120, y: 430, vx: 0, vy: 0 };
const depth = () => {
  let maximum = 0;
  for (let i = 2; i < cloth.positions.length; i += 3) maximum = Math.max(maximum, Math.abs(cloth.positions[i] - cloth.rest[i]));
  return maximum;
};
for (let i = 0; i < 90; i++) cloth.step(1 / 60, i / 60, 0, pointer);
assert(depth() > 20, "Contact must make a substantial physical indentation");
assert.deepEqual(cloth.positions.slice(0, cloth.columns * 3), cloth.rest.slice(0, cloth.columns * 3), "The sewn top edge must stay pinned");
for (let edge = 0; edge < cloth.lengths.length; edge++) {
  const a = cloth.edges[edge * 2] * 3;
  const b = cloth.edges[edge * 2 + 1] * 3;
  const length = Math.hypot(...[0, 1, 2].map((axis) => cloth.positions[a + axis] - cloth.positions[b + axis]));
  assert(length / cloth.lengths[edge] < 1.08, "Pressure must bend the fabric without stretching it like rubber");
}
pointer.active = false;
for (let i = 0; i < 300; i++) cloth.step(1 / 60, (i + 90) / 60, 0, pointer);
assert(depth() < 0.5, "Released fabric must rebound and settle");
pointer.active = true;
pointer.vx = 500;
pointer.vy = -500;
for (let i = 0; i < 90; i++) cloth.step(i % 2 ? 1 / 30 : 1 / 120, i / 60, 0.32, pointer);
assert(cloth.positions.every(Number.isFinite), "Rapid pointer movement and varying frame rates must remain stable");
assert(cloth.normals.every(Number.isFinite), "Lighting normals must remain finite");
assert(depth() <= 28.001, "Displacement must remain bounded under rapid input");
cloth.reset();
assert.deepEqual(cloth.positions, cloth.rest, "Reduced motion must restore a stable, draped pose");
// Reproduce rapid sweeps that previously flipped thousands of mesh triangles.
for (const width of [191, 260, 320]) {
  const swept = new Cloth(width, 660);
  for (let frame = 0; frame < 360; frame++) {
    pointer.x = width * (0.5 + 0.46 * Math.sin(frame * 0.47));
    pointer.y = 660 * (0.5 + 0.45 * Math.cos(frame * 0.31));
    pointer.vx = 500 * Math.cos(frame * 0.47);
    pointer.vy = -500 * Math.sin(frame * 0.31);
    swept.step(frame % 3 === 0 ? 1 / 30 : 1 / 60, frame / 60, 0.32, pointer);
    if (frame % 6) continue;
    const p = swept.positions;
    const projected = new Float32Array(swept.count * 2);
    for (let i = 0; i < swept.count; i++) {
      const scale = 1200 / (1200 - p[i * 3 + 2]);
      projected[i * 2] = width / 2 + (p[i * 3] - width / 2) * scale;
      projected[i * 2 + 1] = p[i * 3 + 1] * scale;
    }
    for (let i = 0; i < swept.indices.length; i += 3) {
      const a = swept.indices[i] * 2;
      const b = swept.indices[i + 1] * 2;
      const c = swept.indices[i + 2] * 2;
      const area =
        (projected[b] - projected[a]) * (projected[c + 1] - projected[a + 1]) - (projected[b + 1] - projected[a + 1]) * (projected[c] - projected[a]);
      assert(area > 0, "Mouse sweeps must not invert the presentation surface or let it tangle");
    }
  }
  pointer.active = false;
  for (let i = 0; i < 300; i++) swept.step(1 / 60, i / 60, 0, pointer);
  assert(
    swept.normals.every((value, i) => i % 3 !== 2 || value > 0),
    "Released cloth must face forward, without trapped folds"
  );
  pointer.active = true;
}
console.log("Cloth physics: contact, attachment, rebound, stability and rapid-sweep anti-tangling checks passed.");

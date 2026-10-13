/* Small position-based cloth solver, in CSS-pixel units. No rendering dependency. */
((root) => {
  class BannerCloth {
    constructor(width, height, columns = 29) {
      this.width = width;
      this.height = height;
      this.columns = columns;
      this.rows = Math.max(33, Math.min(101, Math.round(height / (width / (columns - 1))) + 1));
      this.count = this.columns * this.rows;
      this.rest = new Float32Array(this.count * 3);
      this.positions = new Float32Array(this.rest.length);
      this.previous = new Float32Array(this.rest.length);
      this.normals = new Float32Array(this.rest.length);
      this.uv = new Float32Array(this.count * 2);
      const edges = [];
      const lengths = [];
      const stiffness = [];
      for (let row = 0; row < this.rows; row++) {
        const v = row / (this.rows - 1);
        for (let column = 0; column < this.columns; column++) {
          const u = column / (this.columns - 1);
          const index = row * this.columns + column;
          const p = index * 3;
          // Slightly gathered fabric hangs from a straight, sewn-in dowel.
          const gather = Math.sin((Math.min(v * 5, 1) * Math.PI) / 2);
          this.rest[p] = width * (0.5 + (u - 0.5) * (1 - 0.045 * gather));
          this.rest[p + 1] = v * (height - 9) + v ** 8 * (4 + 3 * Math.sin(u * 5 + 0.8));
          this.rest[p + 2] = gather * (Math.sin(u * 15 + v * 1.8) * 4.5 + Math.sin(u * 29 - v * 2) * 1.4);
          this.uv[index * 2] = u;
          this.uv[index * 2 + 1] = v;
        }
      }
      const connect = (a, b, strength) => {
        edges.push(a, b);
        const p = a * 3;
        const q = b * 3;
        lengths.push(Math.hypot(this.rest[q] - this.rest[p], this.rest[q + 1] - this.rest[p + 1], this.rest[q + 2] - this.rest[p + 2]));
        stiffness.push(strength);
      };
      const indices = [];
      for (let row = 0; row < this.rows; row++) {
        for (let column = 0; column < this.columns; column++) {
          const i = row * this.columns + column;
          if (column < this.columns - 1) connect(i, i + 1, 1);
          if (row < this.rows - 1) connect(i, i + this.columns, 1);
          if (column < this.columns - 1 && row < this.rows - 1) {
            connect(i, i + this.columns + 1, 0.55);
            connect(i + 1, i + this.columns, 0.55);
            indices.push(i, i + 1, i + this.columns, i + 1, i + this.columns + 1, i + this.columns);
          }
          if (column < this.columns - 2) connect(i, i + 2, 0.12);
          if (row < this.rows - 2) connect(i, i + this.columns * 2, 0.12);
        }
      }
      this.edges = new Uint16Array(edges);
      this.lengths = new Float32Array(lengths);
      this.stiffness = new Float32Array(stiffness);
      this.indices = new Uint16Array(indices);
      this.horizontalStep = width / (this.columns - 1);
      this.verticalStep = (height - 9) / (this.rows - 1);
      this.reset();
    }

    reset() {
      this.positions.set(this.rest);
      this.previous.set(this.rest);
      this.lastStep = 1 / 120;
      this.updateNormals();
    }

    step(dt, time, wind, pointer, spool = null) {
      // Substeps and distance constraints resist stretching and preserve inertia.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = Math.min(dt / steps, 1 / 120);
      const damping = Math.exp(-5.5 * h);
      let energy = 0;
      for (let step = 0; step < steps; step++) {
        const p = this.positions;
        for (let i = this.columns; i < this.count; i++) {
          const offset = i * 3;
          const v = this.uv[i * 2 + 1];
          const u = this.uv[i * 2];
          const pressure = pointer.active
            ? Math.exp(-(((this.rest[offset] - pointer.x) / 44) ** 2 + ((this.rest[offset + 1] - pointer.y) / 48) ** 2) * 1.5)
            : 0;
          const push = pressure * (1 - Math.exp(-v * 22));
          const forces = [
            wind * Math.sin(time * 1.4 - v * 3) * v * 26 + push * pointer.vx * 0.22,
            12 + push * pointer.vy * 0.15,
            wind * Math.sin(time * 1.7 - v * 4 + u * 2) * v * 100 - push * 1400,
          ];
          if (spool) {
            const edge = spool.cut ?? spool.hem;
            const tension = Math.exp(-(((this.rest[offset + 1] - edge) / 105) ** 2)) * (1 - Math.exp(-v * 20));
            forces[1] -= spool.velocity * 0.05 * tension;
            forces[2] += (Math.max(-1200, Math.min(1200, spool.acceleration)) * 0.025 + Math.sin(u * Math.PI * 2) * spool.velocity * 0.012) * tension;
          }
          for (let axis = 0; axis < 3; axis++) {
            const k = offset + axis;
            const position = p[k];
            const velocity = (position - this.previous[k]) * (h / this.lastStep) * damping;
            const spring = (this.rest[k] - position) * (axis === 2 ? 22 : 36);
            p[k] = position + velocity + (forces[axis] + spring) * h * h;
            this.previous[k] = position;
          }
        }
        // Structural, shear and bending springs. The entire top seam is fixed.
        for (let iteration = 0; iteration < 5; iteration++) {
          for (let edge = 0; edge < this.lengths.length; edge++) {
            const a = this.edges[edge * 2];
            const b = this.edges[edge * 2 + 1];
            const i = a * 3;
            const j = b * 3;
            const dx = p[j] - p[i];
            const dy = p[j + 1] - p[i + 1];
            const dz = p[j + 2] - p[i + 2];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            const movableA = a >= this.columns;
            const movableB = b >= this.columns;
            const weight = Number(movableA) + Number(movableB);
            if (!weight) continue;
            const correction = (((distance - this.lengths[edge]) / distance) * this.stiffness[edge]) / weight;
            if (movableA) {
              p[i] += dx * correction;
              p[i + 1] += dy * correction;
              p[i + 2] += dz * correction;
            }
            if (movableB) {
              p[j] -= dx * correction;
              p[j + 1] -= dy * correction;
              p[j + 2] -= dz * correction;
            }
          }
          if (pointer.active) {
            // A rounded fingertip presses into the cloth, including printed links.
            for (let i = this.columns; i < this.count; i++) {
              const k = i * 3;
              const r2 = ((p[k] - pointer.x) / 40) ** 2 + ((p[k + 1] - pointer.y) / 44) ** 2;
              if (r2 < 1) {
                const surface = this.rest[k + 2] - 23 * (1 - r2) ** 1.5 * (1 - Math.exp(-this.uv[i * 2 + 1] * 22));
                p[k + 2] = Math.min(p[k + 2], surface);
              }
            }
          }
          this.preventFolds();
        }
        this.lastStep = h;
        for (let i = this.columns * 3; i < p.length; i++) {
          energy += Math.abs(p[i] - this.previous[i]) + Math.abs(p[i] - this.rest[i]) * 0.002;
        }
      }
      this.updateNormals();
      return energy / steps;
    }

    preventFolds() {
      // This is a suspended presentation surface: allow depth and soft creases,
      // but keep its material coordinates ordered so it cannot fold onto itself.
      const p = this.positions;
      for (let i = this.columns; i < this.count; i++) {
        const k = i * 3;
        const limits = [this.horizontalStep * 0.12, this.verticalStep * 0.12, 28];
        for (let axis = 0; axis < 3; axis++) {
          const index = k + axis;
          const delta = p[index] - this.rest[index];
          const clipped = Math.max(-limits[axis], Math.min(axis === 2 ? 10 : limits[axis], delta));
          if (delta !== clipped) {
            const correction = clipped - delta;
            p[index] += correction;
            // Remove the rejected impulse rather than re-injecting it next step.
            this.previous[index] += correction;
          }
        }
      }
      const separate = (a, b, maximum) => {
        const i = a * 3 + 2;
        const j = b * 3 + 2;
        const difference = p[j] - this.rest[j] - (p[i] - this.rest[i]);
        const excess = Math.abs(difference) - maximum;
        if (excess <= 0) return;
        const movableA = a >= this.columns;
        const correction = (Math.sign(difference) * excess) / (movableA ? 2 : 1);
        if (movableA) {
          p[i] += correction;
          this.previous[i] += correction;
        }
        p[j] -= correction;
        this.previous[j] -= correction;
      };
      for (let row = 0; row < this.rows; row++) {
        for (let column = 0; column < this.columns; column++) {
          const i = row * this.columns + column;
          if (column < this.columns - 1) separate(i, i + 1, this.horizontalStep * 0.5);
          if (row < this.rows - 1) separate(i, i + this.columns, this.verticalStep * 0.5);
        }
      }
    }

    updateNormals() {
      const p = this.positions;
      for (let row = 0; row < this.rows; row++) {
        for (let column = 0; column < this.columns; column++) {
          const i = row * this.columns + column;
          const left = (row * this.columns + Math.max(0, column - 1)) * 3;
          const right = (row * this.columns + Math.min(this.columns - 1, column + 1)) * 3;
          const top = (Math.max(0, row - 1) * this.columns + column) * 3;
          const bottom = (Math.min(this.rows - 1, row + 1) * this.columns + column) * 3;
          const ax = p[right] - p[left];
          const ay = p[right + 1] - p[left + 1];
          const az = p[right + 2] - p[left + 2];
          const bx = p[bottom] - p[top];
          const by = p[bottom + 1] - p[top + 1];
          const bz = p[bottom + 2] - p[top + 2];
          const nx = ay * bz - az * by;
          const ny = az * bx - ax * bz;
          const nz = ax * by - ay * bx;
          const length = Math.hypot(nx, ny, nz) || 1;
          this.normals[i * 3] = nx / length;
          this.normals[i * 3 + 1] = ny / length;
          this.normals[i * 3 + 2] = nz / length;
        }
      }
    }

    point(x, y) {
      const u = Math.max(0, Math.min(this.columns - 1, (x / this.width) * (this.columns - 1)));
      const v = Math.max(0, Math.min(this.rows - 1, (y / this.height) * (this.rows - 1)));
      const left = Math.floor(u);
      const top = Math.floor(v);
      const mix = (a, b, t) => a + (b - a) * t;
      const p = this.positions;
      const values = [0, 1, 2].map((axis) => {
        const at = (column, row) => p[(row * this.columns + column) * 3 + axis];
        return mix(
          mix(at(left, top), at(Math.min(left + 1, this.columns - 1), top), u - left),
          mix(at(left, Math.min(top + 1, this.rows - 1)), at(Math.min(left + 1, this.columns - 1), Math.min(top + 1, this.rows - 1)), u - left),
          v - top
        );
      });
      return values;
    }

    project(x, y) {
      const values = this.point(x, y);
      const scale = 1200 / (1200 - values[2]);
      return [this.width / 2 + (values[0] - this.width / 2) * scale, values[1] * scale];
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = BannerCloth;
  else root.BannerCloth = BannerCloth;
})(typeof window !== "undefined" ? window : globalThis);

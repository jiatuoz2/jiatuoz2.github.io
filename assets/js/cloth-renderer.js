/* Lit, high-resolution cloth mesh. A canvas renderer covers unavailable/lost WebGL. */
(() => {
  const vertex = `
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;
    uniform vec2 size;
    uniform vec2 scroll;
    uniform float hem;
    uniform float cylinder;
    varying vec2 texCoord;
    varying vec3 clothNormal;
    void main() {
      vec3 p = position;
      vec3 n = normal;
      float materialY = uv.y * size.y;
      if (cylinder > .5) {
        p = position;
      } else if (materialY <= scroll.x) {
        float angle = (materialY - scroll.x) / scroll.y;
        p.y = scroll.y * sin(angle);
        p.z = scroll.y * (cos(angle) - 1.0);
        n = vec3(0.0, sin(angle), cos(angle));
      } else {
        float blend = smoothstep(0.0, 12.0, materialY - scroll.x);
        p.y = materialY - scroll.x + (position.y - materialY) * blend;
        p.z *= blend;
      }
      float scale = 1200.0 / (1200.0 - p.z);
      vec2 projected = vec2(size.x * .5 + (p.x - size.x * .5) * scale, p.y * scale);
      vec2 screen = (projected + 16.0) / (size + 32.0);
      gl_Position = vec4(screen.x * 2.0 - 1.0, 1.0 - screen.y * 2.0, -p.z / 100.0, 1.0);
      texCoord = uv;
      clothNormal = n;
    }
  `;
  const fragment = `
    precision highp float;
    uniform sampler2D printTexture;
    uniform vec2 size;
    uniform vec2 scroll;
    uniform float hem;
    uniform float cylinder;
    varying vec2 texCoord;
    varying vec3 clothNormal;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      if (cylinder < .5 && (texCoord.y * size.y < scroll.x || texCoord.y * size.y > hem)) discard;
      vec4 dye = texture2D(printTexture, texCoord);
      // The pennant hem exposes earlier wound layers beneath its outer turn.
      if (dye.a < .01) discard;
      vec3 n = normalize(clothNormal);
      // Diffuse cotton under broad lighting, without a glossy specular highlight.
      float key = max(dot(n, normalize(vec3(-.65, -.45, 1.1))), 0.0);
      float fill = max(dot(n, normalize(vec3(.8, .2, 1.0))), 0.0);
      float lighting = .37 + .63 * key + .12 * fill;
      vec2 fiber = texCoord * size * 2.5;
      float grain = hash(floor(fiber)) - .5;
      float weave = sin(fiber.x * 3.14159) * sin(fiber.y * 3.14159);
      gl_FragColor = vec4(dye.rgb * lighting * (1.0 + grain * .018 + weave * .004), dye.a);
    }
  `;
  class ClothRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.progress = 0;
      this.gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
      this.software = false;
      if (this.gl) {
        try {
          this.setupGL();
        } catch {
          this.useCanvas();
        }
      } else this.useCanvas();
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.useCanvas();
        if (this.mesh) {
          this.resize(this.mesh, this.ratio);
          this.render(this.mesh);
        }
      });
    }
    useCanvas() {
      if (this.software) return;
      const replacement = this.canvas.cloneNode();
      this.canvas.replaceWith(replacement);
      this.canvas = replacement;
      this.gl = null;
      this.software = true;
      this.visibleContext = replacement.getContext("2d");
      this.backBuffer = document.createElement("canvas");
      this.context = this.backBuffer.getContext("2d");
      this.shade = document.createElement("canvas");
      this.shadeContext = this.shade.getContext("2d");
    }
    setupGL() {
      const gl = this.gl;
      const shader = (type, source) => {
        const value = gl.createShader(type);
        gl.shaderSource(value, source);
        gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("Cloth shader unavailable");
        return value;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error("Cloth program unavailable");
      gl.useProgram(this.program);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthFunc(gl.LEQUAL);
      this.buffers = Object.fromEntries(
        ["position", "normal", "uv"].map((name) => {
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          const location = gl.getAttribLocation(this.program, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, name === "uv" ? 2 : 3, gl.FLOAT, false, 0, 0);
          return [name, buffer];
        })
      );
      this.indices = gl.createBuffer();
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(this.program, "printTexture"), 0);
      this.size = gl.getUniformLocation(this.program, "size");
      this.scroll = gl.getUniformLocation(this.program, "scroll");
      this.hemUniform = gl.getUniformLocation(this.program, "hem");
      this.cylinderUniform = gl.getUniformLocation(this.program, "cylinder");
      this.cylinderBuffers = Object.fromEntries(["position", "normal", "uv"].map((name) => [name, gl.createBuffer()]));
      this.cylinderIndices = gl.createBuffer();
    }
    resize(mesh, ratio) {
      this.mesh = mesh;
      this.ratio = ratio;
      this.canvas.width = Math.ceil((mesh.width + 32) * ratio);
      this.canvas.height = Math.ceil((mesh.height + 32) * ratio);
      this.setRoll(this.progress);
      if (this.software) {
        this.backBuffer.width = this.canvas.width;
        this.backBuffer.height = this.canvas.height;
        this.shade.width = Math.ceil((mesh.width + 32) * 0.75);
        this.shade.height = Math.ceil((mesh.height + 32) * 0.75);
        this.shadePixels = this.shadeContext.createImageData(this.shade.width, this.shade.height);
        return;
      }
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.size, mesh.width, mesh.height);
      for (const [name, data] of [
        ["position", mesh.positions],
        ["normal", mesh.normals],
        ["uv", mesh.uv],
      ]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[name]);
        gl.bufferData(gl.ARRAY_BUFFER, data, name === "uv" ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    }
    setTexture(print) {
      this.print = print;
      if (this.software) return;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, print);
    }
    setRoll(progress, motion = {}) {
      this.progress = progress;
      this.sway = motion.sway || 0;
      if (!this.mesh) return;
      this.wound = progress * (this.mesh.height - 12);
      this.cut = 12 + this.wound;
      this.hem = this.mesh.height;
      this.radius = Math.sqrt(36 + (this.cut * 0.42) / Math.PI);
      this.axisY = 0;
      this.buildCylinder();
      if (!this.software) {
        this.gl.uniform2f(this.scroll, this.cut, this.radius);
        this.gl.uniform1f(this.hemUniform, this.hem);
      }
    }
    buildCylinder() {
      const positions = [],
        normals = [],
        uv = [],
        indices = [];
      for (let layer = 2; layer >= 0; layer--) {
        for (let half = 0; half < 2; half++) {
          const first = positions.length / 3;
          for (let row = 0; row <= 24; row++) {
            const angle = ((half - 1) * Math.PI) / 2 + ((row / 24) * Math.PI) / 2;
            const material = this.cut + (half ? angle - Math.PI * 2 : angle) * this.radius - layer * Math.PI * 2 * this.radius;
            const printedY = Math.max(1, Math.min(this.mesh.height - 1, material));
            for (let column = 0; column < 2; column++) {
              // The spindle stays at the top. Only stored material rotates around
              // its axis; winding/braking produces a small damped torsional sway.
              positions.push(
                column * this.mesh.width,
                this.radius * Math.sin(angle) + this.sway * (column - 0.5),
                this.radius * (Math.cos(angle) - 1) - layer * 0.2
              );
              normals.push(0, Math.sin(angle), Math.cos(angle));
              uv.push(column, (printedY + row * 0.0001) / this.mesh.height);
            }
            if (row < 24) {
              const i = first + row * 2;
              indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
            }
          }
        }
      }
      this.rollMesh = {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uv: new Float32Array(uv),
        indices: new Uint16Array(indices),
        count: positions.length / 3,
      };
    }
    warp(point, materialY) {
      if (materialY <= this.cut) {
        const angle = (materialY - this.cut) / this.radius;
        return [point[0], this.radius * Math.sin(angle), this.radius * (Math.cos(angle) - 1)];
      }
      const t = Math.min(1, (materialY - this.cut) / 12);
      const blend = t * t * (3 - 2 * t);
      return [point[0], materialY - this.cut + (point[1] - materialY) * blend, point[2] * blend];
    }
    project(mesh, x, y) {
      const p = this.warp(mesh.point(x, y), y);
      const scale = 1200 / (1200 - p[2]);
      return [mesh.width / 2 + (p[0] - mesh.width / 2) * scale, p[1] * scale];
    }
    render(mesh) {
      if (!this.print) return;
      if (this.software) {
        this.drawCanvas(mesh);
        return;
      }
      const gl = this.gl;
      gl.uniform1f(this.cylinderUniform, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.positions);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.normals);
      for (const name of ["position", "normal", "uv"]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[name]);
        gl.vertexAttribPointer(gl.getAttribLocation(this.program, name), name === "uv" ? 2 : 3, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.cylinderUniform, 1);
      for (const [name, data] of [
        ["position", this.rollMesh.positions],
        ["normal", this.rollMesh.normals],
        ["uv", this.rollMesh.uv],
      ]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cylinderBuffers[name]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(gl.getAttribLocation(this.program, name), name === "uv" ? 2 : 3, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cylinderIndices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.rollMesh.indices, gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, this.rollMesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
    drawCanvas(surface) {
      // Affine triangles preserve the same physics and native links without a GPU.
      const merge = (a, b, Type) => {
        const result = new Type(a.length + b.length);
        result.set(a);
        result.set(b, a.length);
        return result;
      };
      const mesh = {
        width: surface.width,
        height: surface.height,
        count: surface.count + this.rollMesh.count,
        positions: merge(surface.positions, this.rollMesh.positions, Float32Array),
        normals: merge(surface.normals, this.rollMesh.normals, Float32Array),
        uv: merge(surface.uv, this.rollMesh.uv, Float32Array),
        indices: merge(
          surface.indices,
          this.rollMesh.indices.map((id) => id + surface.count),
          Uint16Array
        ),
      };
      const ctx = this.context;
      const p = mesh.positions;
      const projected = new Float32Array(mesh.count * 2);
      const normals = new Float32Array(mesh.normals);
      for (let i = 0; i < mesh.count; i++) {
        const materialY = mesh.uv[i * 2 + 1] * mesh.height;
        const cylinder = i >= surface.count;
        const raw = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
        const point = cylinder ? raw : this.warp(raw, materialY);
        const scale = 1200 / (1200 - point[2]);
        projected[i * 2] = 16 + mesh.width / 2 + (point[0] - mesh.width / 2) * scale;
        projected[i * 2 + 1] = 16 + point[1] * scale;
        if (!cylinder && materialY <= this.cut) {
          const angle = (materialY - this.cut) / this.radius;
          normals[i * 3] = 0;
          normals[i * 3 + 1] = Math.sin(angle);
          normals[i * 3 + 2] = Math.cos(angle);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.shadePixels.data.fill(0);
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const ids = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
        if (
          ids[0] < surface.count &&
          (ids.every((id) => mesh.uv[id * 2 + 1] * mesh.height < this.cut) || ids.some((id) => mesh.uv[id * 2 + 1] * mesh.height > this.hem))
        )
          continue;
        if (ids.every((id) => normals[id * 3 + 2] < 0)) continue;
        const target = ids.map((id) => [projected[id * 2], projected[id * 2 + 1]]);
        const source = ids.map((id) => [mesh.uv[id * 2] * this.print.width, mesh.uv[id * 2 + 1] * this.print.height]);
        const sx1 = source[1][0] - source[0][0];
        const sy1 = source[1][1] - source[0][1];
        const sx2 = source[2][0] - source[0][0];
        const sy2 = source[2][1] - source[0][1];
        const det = sx1 * sy2 - sx2 * sy1;
        if (Math.abs(det) < 0.001) continue;
        const dx1 = target[1][0] - target[0][0];
        const dy1 = target[1][1] - target[0][1];
        const dx2 = target[2][0] - target[0][0];
        const dy2 = target[2][1] - target[0][1];
        const a = (dx1 * sy2 - dx2 * sy1) / det;
        const b = (dy1 * sy2 - dy2 * sy1) / det;
        const c = (dx2 * sx1 - dx1 * sx2) / det;
        const d = (dy2 * sx1 - dy1 * sx2) / det;
        ctx.save();
        ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        const center = [target.reduce((sum, value) => sum + value[0], 0) / 3, target.reduce((sum, value) => sum + value[1], 0) / 3];
        ctx.beginPath();
        target.forEach(([x, y], index) => {
          const length = Math.hypot(x - center[0], y - center[1]) || 1;
          const px = x + ((x - center[0]) / length) * 0.35;
          const py = y + ((y - center[1]) / length) * 0.35;
          if (!index) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.clip();
        ctx.transform(a, b, c, d, target[0][0] - a * source[0][0] - c * source[0][1], target[0][1] - b * source[0][0] - d * source[0][1]);
        ctx.drawImage(this.print, 0, 0);
        ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        ctx.restore();
        // Interpolate normals per pixel, so the fallback has smooth fabric light
        // instead of visible triangles. Composite only after the entire frame.
        const t = target.map(([x, y]) => [x * 0.75, y * 0.75]);
        const area = (t[1][1] - t[2][1]) * (t[0][0] - t[2][0]) + (t[2][0] - t[1][0]) * (t[0][1] - t[2][1]);
        if (Math.abs(area) < 0.001) continue;
        const minX = Math.max(0, Math.floor(Math.min(...t.map((p) => p[0]))));
        const maxX = Math.min(this.shade.width - 1, Math.ceil(Math.max(...t.map((p) => p[0]))));
        const minY = Math.max(0, Math.floor(Math.min(...t.map((p) => p[1]))));
        const maxY = Math.min(this.shade.height - 1, Math.ceil(Math.max(...t.map((p) => p[1]))));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const w0 = ((t[1][1] - t[2][1]) * (x + 0.5 - t[2][0]) + (t[2][0] - t[1][0]) * (y + 0.5 - t[2][1])) / area;
            const w1 = ((t[2][1] - t[0][1]) * (x + 0.5 - t[2][0]) + (t[0][0] - t[2][0]) * (y + 0.5 - t[2][1])) / area;
            const w2 = 1 - w0 - w1;
            if (Math.min(w0, w1, w2) < -0.02) continue;
            const n = [0, 1, 2].map((axis) => normals[ids[0] * 3 + axis] * w0 + normals[ids[1] * 3 + axis] * w1 + normals[ids[2] * 3 + axis] * w2);
            const length = Math.hypot(...n) || 1;
            const key = Math.max(0, (-0.65 * n[0] - 0.45 * n[1] + 1.1 * n[2]) / (1.355 * length));
            const fill = Math.max(0, (0.8 * n[0] + 0.2 * n[1] + n[2]) / (1.296 * length));
            this.shadePixels.data[(y * this.shade.width + x) * 4 + 3] = Math.max(0, 1 - (0.37 + 0.63 * key + 0.12 * fill)) * 255;
          }
        }
      }
      this.shadeContext.putImageData(this.shadePixels, 0, 0);
      ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
      ctx.globalCompositeOperation = "source-atop";
      ctx.drawImage(this.shade, 0, 0, mesh.width + 32, mesh.height + 32);
      ctx.globalCompositeOperation = "source-over";
      this.visibleContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.visibleContext.drawImage(this.backBuffer, 0, 0);
    }
  }
  window.BannerClothRenderer = ClothRenderer;
})();

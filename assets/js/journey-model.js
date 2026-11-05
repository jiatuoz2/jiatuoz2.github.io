/* The 3D viewer of the "My Journey" examine window: an object's model, made from a photo of
   it (see docs/TEMPLATE.md), turned freely under the same lamp as the papers.

   An ES module, imported by assets/js/journey-examine.js with import() only when the visitor
   presses "See 3D model" in the examine window of an object with a model (data-model on its
   board document; the window opens on its photo), so neither it nor three.js
   (assets/vendor/three, imported from here) loads with the page or with the window.

   mount({ host, url, sizeM, yaw, pitch, pitchMin, fov, fitBox, signal, onLost }) resolves to a
   viewer once the model is loaded and its first frame drawn (and shown) in a canvas appended
   to host:
     { canvas, turn(dYaw, dPitch), fling(vYaw, vPitch), nudge(dYaw, dPitch), stop(),
       setZoom(zoom), reset({ smooth }), pose(), setRest(yaw, pitch), mask(step), dispose() }
   Angles are degrees (velocities degrees per millisecond). yaw turns the object on its
   turntable, without limit (positive turns its front toward the viewer's right); pitch raises
   the camera over it (positive looks down on it), clamped to pitchMin..PITCH_MAX (pitchMin
   defaults to PITCH_MIN, level with the table). yaw and pitch are the resting pose (default
   REST_YAW, REST_PITCH): the photo's view, so the model's first frame is the cutout's
   picture; sizeM is the object's real longest side in metres (default 0.3); fov is the lens,
   the vertical field of view in degrees (default FOV, within FOV_MIN..FOV_MAX: a photo taken
   close up, with more perspective, is matched with a wider one). fitBox() gives,
   in CSS pixels, the box the cutout's opaque pixels fill at rest: { width, height, x, y },
   x and y the box's centre from host's centre (default 80% of host, centred). It rejects
   (after freeing everything it made) when the model cannot load, WebGL cannot start, or
   signal aborts; journey-examine.js then keeps the cutout. onLost() runs if the WebGL
   context is lost later.

   The model (glTF binary, +Y up, front +Z) is scaled to its real size, centred, and stood on
   the ground. The camera has a long lens (FOV, as a product photo is taken, so the model's
   near-orthographic look matches the photo's; an artifact's model_fov gives its photo's own),
   and stands as far off, with the lens shifted just so, that the object's silhouette in its
   resting pose (projected from its vertices) fills fitBox() exactly: the same size and place as the cutout, so the cross-fade from the
   cutout to the model shows no jump. It keeps that distance in every pose. The scene is physically
   based, with sRGB output and no tone mapping: soft studio reflections from three.js's
   RoomEnvironment (prefiltered with PMREM) and one warm key light from the upper left, like
   the lamp over the papers, together about as bright as the photo's own light, so at rest the
   model shows the photo's colours (a white puck's silver ring, a robot's orange ball and blue
   bumpers) as the cutout does, and turned, its faces darken and brighten with the lamp. The lamp lights a soft pool of table under the object, a little
   lighter than the window's dark backdrop, and casts its soft shadow on it (ShadowMaterial on
   an invisible ground), so the object stands on something. Under it lies a contact shadow, baked once
   from below in the object's own frame (how near each part of it comes to the ground, then
   blurred) and turned with it: dark and tight where it touches, fading within a few
   centimetres of real height, so a board lies flat on the table and a robot stands on its
   wheels. The canvas is transparent over the examine window's own backdrop.

   It draws only when something changes (a turn, a zoom, a fling coasting down, a resize), at
   most at a device pixel ratio of 2. It never moves by itself: it appears at rest, in the
   photo's pose, and turns only when handled. Reduced motion: no coasting, turns and resets
   are instant. dispose() frees geometry, textures, render targets and the renderer, releases
   the WebGL context, and removes the canvas. The host carries the pose as data-yaw,
   data-pitch and data-zoom (rounded) for the tests. For the tests and
   bin/fit_journey_model_pose.js, setRest(yaw, pitch) makes a new resting pose (refitted and
   drawn at once, as if the yml named it) and mask(step) returns the object's silhouette as
   drawn now: { cols, rows, step, bits, shade }, one byte per step x step CSS pixels of host,
   bits 1 where the object is (alpha at least one half; the table, its pool of light and the
   shadows left out), shade its brightness there. */
import {
  Box3,
  CanvasTexture,
  CustomBlending,
  DirectionalLight,
  DoubleSide,
  Group,
  MaxEquation,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  NoToneMapping,
  OneFactor,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
  WebGLRenderTarget,
} from "../vendor/three/build/three.module.min.js";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.min.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.min.js";

// The default resting pose (an artifact's yml sets its photo's): turned a little toward the
// lamp (so its front catches the light and a side shows), seen a little from above, as an
// object on a table is. The camera never goes below the table (an object's underside is only
// guessed by the generator; an artifact may allow a little lower or keep higher with
// model_pitch_min, within PITCH_FLOOR..PITCH_MAX) and stops short of straight down.
export const REST_YAW = -20;
export const REST_PITCH = 16;
export const PITCH_MIN = 0;
export const PITCH_MAX = 75;
const PITCH_FLOOR = -35;
// A fling: its fastest turn (degrees per ms) and how fast it slows (time constant, ms).
const FLING_MAX = 0.5;
const FLING_DECAY = 220;
const DEFAULT_SIZE = 0.3;
// The vertical field of view: a long lens, as product photos are taken from a few metres
// off, so the model's perspective matches the photo's. A photo taken closer (the 2019 robot's)
// names its own, model_fov, within FOV_MIN..FOV_MAX.
const FOV = 20;
const FOV_MIN = 10;
const FOV_MAX = 50;
// The silhouette is projected from at most this many of the model's vertices.
const OUTLINE_POINTS = 60000;
// Alpha (0-255) from which a pixel of the canvas counts as the object, in mask().
const MASK_ALPHA = 128;
const MAX_PIXEL_RATIO = 2;
// The lamp: up and to the left of the viewer and a little in front, warm white.
const KEY_DIRECTION = new Vector3(-0.55, 0.78, 0.42).normalize();
// glTF extensions this viewer can decode. Meshopt (gltfpack -cc) is decoded by its small
// vendored decoder, fetched only for a model that uses it; Draco and Basis textures are not
// supported (a model that needs them fails and the cutout stays).
const MESHOPT = "EXT_meshopt_compression";
const UNSUPPORTED = ["KHR_draco_mesh_compression", "KHR_texture_basisu"];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const DEG = Math.PI / 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const aborted = (signal) => {
  if (signal && signal.aborted) throw signal.reason || new Error("The 3D model was put away");
};

// The JSON of a glTF binary (or of a .gltf file), to see which extensions it needs before
// parsing it.
const readJson = (buffer) => {
  const bytes = new DataView(buffer);
  const text = new TextDecoder();
  if (buffer.byteLength >= 20 && bytes.getUint32(0, true) === 0x46546c67) {
    const length = bytes.getUint32(12, true);
    return JSON.parse(text.decode(new Uint8Array(buffer, 20, length)));
  }
  return JSON.parse(text.decode(buffer));
};

// The contact shadow, baked from below: every surface of the object is drawn into a render
// target seen straight down, its darkness falling off with height (MaxEquation keeps the
// part nearest the ground), then blurred twice and laid on the ground under it.
const HEIGHT_SHADER = {
  uniforms: { uReach: { value: 0.05 }, uDarkness: { value: 1 } },
  vertexShader: `
    varying float vHeight;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vHeight = world.y;
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: `
    uniform float uReach;
    uniform float uDarkness;
    varying float vHeight;
    void main() {
      float near = clamp(1.0 - vHeight / uReach, 0.0, 1.0);
      gl_FragColor = vec4(0.0, 0.0, 0.0, near * near * uDarkness);
    }`,
};
const BLUR_SHADER = {
  uniforms: { tMap: { value: null }, uStep: { value: new Vector2() } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tMap;
    uniform vec2 uStep;
    varying vec2 vUv;
    void main() {
      float sum = texture2D(tMap, vUv).a * 0.2270270270;
      sum += texture2D(tMap, vUv + uStep * 1.3846153846).a * 0.3162162162;
      sum += texture2D(tMap, vUv - uStep * 1.3846153846).a * 0.3162162162;
      sum += texture2D(tMap, vUv + uStep * 3.2307692308).a * 0.0702702703;
      sum += texture2D(tMap, vUv - uStep * 3.2307692308).a * 0.0702702703;
      gl_FragColor = vec4(0.0, 0.0, 0.0, sum);
    }`,
};

export async function mount({
  host,
  url,
  sizeM = DEFAULT_SIZE,
  yaw = REST_YAW,
  pitch = REST_PITCH,
  pitchMin = PITCH_MIN,
  fov = FOV,
  fitBox = null,
  signal = null,
  onLost = null,
} = {}) {
  const size = Number.isFinite(sizeM) && sizeM > 0 ? sizeM : DEFAULT_SIZE;
  const lens = clamp(Number.isFinite(fov) ? fov : FOV, FOV_MIN, FOV_MAX);
  const lowest = clamp(Number.isFinite(pitchMin) ? pitchMin : PITCH_MIN, PITCH_FLOOR, PITCH_MAX - 5);
  const clampPitch = (value) => clamp(value, lowest, PITCH_MAX);
  const rest = {
    yaw: Number.isFinite(yaw) ? yaw : REST_YAW,
    pitch: clampPitch(Number.isFinite(pitch) ? pitch : REST_PITCH),
  };
  // Everything made so far, freed in reverse if anything fails (or on dispose()); the
  // renderer and its WebGL context go last, after what was drawn with them.
  const undo = [];
  let canvas = null;
  let renderer = null;
  const free = () => {
    while (undo.length) {
      try {
        undo.pop()();
      } catch (error) {
        // Freeing is best effort; the context is released below regardless.
      }
    }
    if (renderer) {
      // A context already lost (the browser took it) has nothing left to release.
      const gone = renderer.getContext().isContextLost();
      renderer.dispose();
      if (!gone) renderer.forceContextLoss();
      renderer = null;
    }
    if (canvas) canvas.remove();
    canvas = null;
  };
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    aborted(signal);
    const json = readJson(buffer);
    const needs = [...(json.extensionsRequired || []), ...(json.extensionsUsed || [])];
    const missing = UNSUPPORTED.filter((name) => needs.includes(name));
    if (missing.length) throw new Error(`${url} needs ${missing.join(", ")}, which this viewer does not decode`);
    const loader = new GLTFLoader();
    if (needs.includes(MESHOPT)) {
      const { MeshoptDecoder } = await import("../vendor/three/examples/jsm/libs/meshopt_decoder.module.min.js");
      aborted(signal);
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    const gltf = await loader.parseAsync(buffer, new URL(".", new URL(url, location.href)).href);
    const model = gltf.scene;
    undo.push(() => disposeTree(model));
    aborted(signal);

    // The renderer: WebGL 2, transparent, physically based output.
    canvas = document.createElement("canvas");
    canvas.className = "examine-model-canvas";
    canvas.setAttribute("aria-hidden", "true");
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    // No tone mapping: the texture is a photo, its light and tone already in it, and the
    // lights below are set so a face turned to the camera shows it unchanged. (Neutral tone
    // mapping squeezed the top fifth of the range, where a white object's detail lives: the
    // Linktop's silver ring and print faded into its white top.)
    renderer.toneMapping = NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = VSMShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    undo.push(() => environment.dispose());
    scene.environment = environment;
    scene.environmentIntensity = 0.48;

    // Real size, centred over the turntable's axis, standing on the ground (y = 0).
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    const raw = box.getSize(new Vector3());
    const longest = Math.max(raw.x, raw.y, raw.z);
    if (!(longest > 0)) throw new Error(`${url} has no geometry`);
    const scale = size / longest;
    const centre = box.getCenter(new Vector3());
    model.scale.multiplyScalar(scale);
    model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
    const extent = raw.clone().multiplyScalar(scale);
    const radius = extent.length() / 2;
    const target = new Vector3(0, extent.y / 2, 0);
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = false;
      for (const material of [].concat(node.material || [])) {
        for (const value of Object.values(material)) if (value && value.isTexture) value.anisotropy = anisotropy;
      }
    });
    const turntable = new Group();
    turntable.add(model);
    scene.add(turntable);
    // Its vertices (or an even sample of at most OUTLINE_POINTS), from the turntable's axis
    // at the camera's target, for fitting its silhouette into the view.
    turntable.updateMatrixWorld(true);
    const outline = [];
    {
      let count = 0;
      model.traverse((node) => {
        if (node.isMesh && node.geometry.attributes.position) count += node.geometry.attributes.position.count;
      });
      const stride = Math.max(1, Math.ceil(count / OUTLINE_POINTS));
      model.traverse((node) => {
        const positions = node.isMesh && node.geometry.attributes.position;
        if (!positions) return;
        for (let i = 0; i < positions.count; i += stride) {
          outline.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).sub(target));
        }
      });
    }

    // The lamp and its soft shadow on the ground.
    const key = new DirectionalLight(0xfff1e2, 0.9);
    key.position
      .copy(KEY_DIRECTION)
      .multiplyScalar(radius * 6)
      .add(target);
    key.target.position.copy(target);
    key.castShadow = true;
    const reach = radius * 2.6;
    Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: radius * 0.5, far: radius * 12 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 10;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = radius * 0.004;
    scene.add(key, key.target);
    const ground = new Mesh(new PlaneGeometry(reach * 2, reach * 2).rotateX(-Math.PI / 2), new ShadowMaterial({ opacity: 0.45, depthWrite: false }));
    ground.receiveShadow = true;
    ground.renderOrder = -2;
    scene.add(ground);
    // The pool of lamplight on the table: warm, faint, fading out softly round the object
    // (it stays still as the object turns, like the lamp).
    const glow = document.createElement("canvas");
    glow.width = glow.height = 128;
    {
      const paint = glow.getContext("2d");
      const fade = paint.createRadialGradient(64, 64, 0, 64, 64, 64);
      fade.addColorStop(0, "rgba(255, 238, 218, 0.16)");
      fade.addColorStop(0.45, "rgba(255, 238, 218, 0.1)");
      fade.addColorStop(1, "rgba(255, 238, 218, 0)");
      paint.fillStyle = fade;
      paint.fillRect(0, 0, 128, 128);
    }
    const glowMap = new CanvasTexture(glow);
    glowMap.colorSpace = SRGBColorSpace;
    undo.push(() => glowMap.dispose());
    const poolSize = Math.max(extent.x, extent.z) * 1.5 + radius * 1.2;
    const pool = new Mesh(
      new PlaneGeometry(poolSize, poolSize).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: glowMap, transparent: true, depthWrite: false, toneMapped: false })
    );
    pool.renderOrder = -3;
    undo.push(() => {
      pool.geometry.dispose();
      pool.material.dispose();
    });
    scene.add(pool);

    // The contact shadow (see HEIGHT_SHADER), in metres: it fades out within contactReach of
    // real height, whatever the object's size, so it is the whole underside of a flat board
    // and only the feet of a robot.
    const contactReach = clamp(extent.y * 0.3, 0.004, 0.06);
    const blur = contactReach * 0.45 + 0.002;
    const pad = blur * 4 + radius * 0.02;
    const shadowW = extent.x + pad * 2;
    const shadowD = extent.z + pad * 2;
    const texels = 512;
    const rtW = Math.max(32, Math.round(texels * Math.min(1, shadowW / shadowD)));
    const rtH = Math.max(32, Math.round(texels * Math.min(1, shadowD / shadowW)));
    const contact = new WebGLRenderTarget(rtW, rtH);
    const spare = new WebGLRenderTarget(rtW, rtH);
    undo.push(() => contact.dispose());
    {
      const heightMaterial = new ShaderMaterial({
        ...HEIGHT_SHADER,
        uniforms: { uReach: { value: contactReach }, uDarkness: { value: 0.92 } },
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: MaxEquation,
        blendEquationAlpha: MaxEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
      });
      // Seen from above, looking straight down: right is +x and up is -z, as on the plane
      // laid on the ground below.
      const below = new OrthographicCamera(-shadowW / 2, shadowW / 2, shadowD / 2, -shadowD / 2, 0, extent.y + 1);
      below.position.set(0, extent.y + 0.5, 0);
      below.up.set(0, 0, -1);
      below.lookAt(0, 0, 0);
      const bake = new Scene();
      bake.overrideMaterial = heightMaterial;
      bake.add(turntable);
      renderer.setRenderTarget(contact);
      renderer.clear();
      renderer.render(bake, below);
      const blurMaterial = new ShaderMaterial({ ...BLUR_SHADER, uniforms: { tMap: { value: null }, uStep: { value: new Vector2() } } });
      blurMaterial.blending = NoBlending;
      blurMaterial.depthTest = false;
      blurMaterial.depthWrite = false;
      const quad = new Mesh(new PlaneGeometry(2, 2), blurMaterial);
      quad.frustumCulled = false;
      const flat = new Scene();
      flat.add(quad);
      const screen = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const steps = [blur / shadowW, blur / shadowD];
      for (let pass = 0; pass < 2; pass++) {
        blurMaterial.uniforms.tMap.value = contact.texture;
        blurMaterial.uniforms.uStep.value.set(steps[0] / (pass + 1), 0);
        renderer.setRenderTarget(spare);
        renderer.render(flat, screen);
        blurMaterial.uniforms.tMap.value = spare.texture;
        blurMaterial.uniforms.uStep.value.set(0, steps[1] / (pass + 1));
        renderer.setRenderTarget(contact);
        renderer.render(flat, screen);
      }
      renderer.setRenderTarget(null);
      bake.remove(turntable);
      scene.add(turntable);
      heightMaterial.dispose();
      blurMaterial.dispose();
      quad.geometry.dispose();
      spare.dispose();
    }
    const contactPlane = new Mesh(
      new PlaneGeometry(shadowW, shadowD).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: contact.texture, transparent: true, depthWrite: false, toneMapped: false })
    );
    contactPlane.position.y = radius * 0.0015;
    contactPlane.renderOrder = -1;
    turntable.add(contactPlane);

    // The camera orbits up and down; the turntable turns the object under the fixed lamp.
    const camera = new PerspectiveCamera(lens, 1, radius * 0.05, radius * 40);
    const pose = { yaw: rest.yaw, pitch: rest.pitch, zoom: 1 };
    let zoomTarget = 1;
    let distance = radius * 4;
    let motion = null;
    let spin = null;
    let frame = 0;
    let last = 0;
    let disposed = false;

    // The silhouette's box in normalized device coordinates, in the resting pose seen from
    // distance d.
    const silhouette = (d) => {
      const turn = rest.yaw * DEG;
      const tilt = rest.pitch * DEG;
      const [cosY, sinY, cosT, sinT] = [Math.cos(turn), Math.sin(turn), Math.cos(tilt), Math.sin(tilt)];
      const tan = Math.tan((lens * DEG) / 2);
      const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (const p of outline) {
        // Turned on the turntable, then seen by the camera above and in front of it.
        const x = p.x * cosY + p.z * sinY;
        const z = -p.x * sinY + p.z * cosY;
        const up = p.y * cosT - z * sinT;
        const depth = Math.max(radius * 0.05, d - p.y * sinT - z * cosT);
        const nx = x / (depth * tan * camera.aspect);
        const ny = up / (depth * tan);
        box.minX = Math.min(box.minX, nx);
        box.maxX = Math.max(box.maxX, nx);
        box.minY = Math.min(box.minY, ny);
        box.maxY = Math.max(box.maxY, ny);
      }
      return box;
    };
    const fit = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // At rest its silhouette fills the box the cutout's opaque pixels fill: as large (the
      // box's area, so a pose a little off the photo's still matches it in size), never
      // larger than the view ...
      const given = typeof fitBox === "function" ? fitBox() : null;
      const box = {
        width: given && given.width > 0 ? Math.min(width, given.width) : width * 0.8,
        height: given && given.height > 0 ? Math.min(height, given.height) : height * 0.8,
        x: given && Number.isFinite(given.x) ? given.x : 0,
        y: given && Number.isFinite(given.y) ? given.y : 0,
      };
      const spans = (seen) => [((seen.maxX - seen.minX) / 2) * width, ((seen.maxY - seen.minY) / 2) * height];
      let d = radius * 8;
      for (let pass = 0; pass < 8 && outline.length; pass++) {
        const [across, down] = spans(silhouette(d));
        d *= Math.max(Math.sqrt((across / box.width) * (down / box.height)), 1e-3);
      }
      for (let pass = 0; pass < 4 && outline.length; pass++) {
        const [across, down] = spans(silhouette(d));
        d *= Math.max(1, across / (width * 0.98), down / (height * 0.98));
      }
      // ... with the camera always outside the object.
      distance = Math.max(d, radius * 1.6);
      // Its silhouette centred where the cutout's is: a shift of the lens, so it still turns
      // and zooms about its own middle.
      if (outline.length) {
        const seen = silhouette(distance);
        camera.setViewOffset(
          width,
          height,
          ((seen.minX + seen.maxX) / 4) * width - box.x,
          (-(seen.minY + seen.maxY) / 4) * height - box.y,
          width,
          height
        );
      } else camera.clearViewOffset();
      camera.near = Math.max(radius * 0.02, distance - radius * 3);
      camera.far = distance + radius * 6;
    };
    const draw = () => {
      turntable.rotation.y = pose.yaw * DEG;
      const tilt = pose.pitch * DEG;
      camera.position.set(0, Math.sin(tilt) * distance, Math.cos(tilt) * distance).add(target);
      camera.lookAt(target);
      camera.zoom = pose.zoom;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      host.dataset.yaw = String(Math.round(pose.yaw * 10) / 10);
      host.dataset.pitch = String(Math.round(pose.pitch * 10) / 10);
      host.dataset.zoom = String(Math.round(pose.zoom * 100) / 100);
    };
    const tick = (now) => {
      frame = 0;
      if (disposed) return;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      let moving = false;
      if (motion) {
        const t = clamp((now - motion.t0) / motion.ms, 0, 1);
        const k = easeOut(t);
        pose.yaw = motion.from.yaw + (motion.to.yaw - motion.from.yaw) * k;
        pose.pitch = motion.from.pitch + (motion.to.pitch - motion.from.pitch) * k;
        if (t < 1) moving = true;
        else motion = null;
      } else if (spin) {
        // A fling coasts down (time constant FLING_DECAY).
        pose.yaw += spin.yaw * dt;
        pose.pitch = clampPitch(pose.pitch + spin.pitch * dt);
        if (pose.pitch === lowest || pose.pitch === PITCH_MAX) spin.pitch = 0;
        const decay = Math.exp(-dt / FLING_DECAY);
        spin.yaw *= decay;
        spin.pitch *= decay;
        if (Math.abs(spin.yaw) + Math.abs(spin.pitch) > 0.004) moving = true;
        else spin = null;
      }
      if (Math.abs(zoomTarget - pose.zoom) > 0.001) {
        pose.zoom += (zoomTarget - pose.zoom) * (1 - Math.exp(-dt / 70));
        moving = true;
      } else pose.zoom = zoomTarget;
      draw();
      if (moving) invalidate();
      else last = 0;
    };
    const invalidate = () => {
      if (!frame && !disposed) frame = requestAnimationFrame(tick);
    };
    const moveTo = (to, ms) => {
      spin = null;
      if (reducedMotion.matches || ms <= 0) {
        motion = null;
        Object.assign(pose, to);
      } else motion = { from: { yaw: pose.yaw, pitch: pose.pitch }, to, t0: performance.now(), ms };
      invalidate();
    };

    fit();
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => {
        fit();
        invalidate();
      });
      observer.observe(host);
    }
    const lost = () => {
      if (!disposed && typeof onLost === "function") onLost();
    };
    canvas.addEventListener("webglcontextlost", lost);
    undo.push(() => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (observer) observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
    });

    // Shaders compile before the first frame is drawn (in parallel where the browser can).
    if (typeof renderer.compileAsync === "function") await renderer.compileAsync(scene, camera);
    aborted(signal);
    host.append(canvas);
    fit();
    draw();
    // It resolves only once that frame is on screen (two animation frames later), so the
    // cross-fade from the cutout starts from a drawn canvas, never an empty one.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    aborted(signal);
    if (disposed || renderer.getContext().isContextLost()) throw new Error("WebGL context lost");

    return {
      canvas,
      // A drag: turned directly, cancelling any eased turn or coasting.
      turn(dYaw, dPitch) {
        motion = null;
        spin = null;
        pose.yaw += dYaw;
        pose.pitch = clampPitch(pose.pitch + dPitch);
        invalidate();
      },
      // Let go mid-drag: it coasts on and slows down (not with reduced motion).
      fling(vYaw, vPitch) {
        if (reducedMotion.matches || Math.abs(vYaw) + Math.abs(vPitch) < 0.02) return;
        motion = null;
        // At most about a third of a turn more from the fastest flick: a handled object
        // turning on, not a spun turntable.
        spin = { yaw: clamp(vYaw, -FLING_MAX, FLING_MAX), pitch: clamp(vPitch, -FLING_MAX / 2, FLING_MAX / 2) };
        last = 0;
        invalidate();
      },
      // The arrow keys: a short eased turn.
      nudge(dYaw, dPitch) {
        const from = motion ? motion.to : pose;
        moveTo({ yaw: from.yaw + dYaw, pitch: clampPitch(from.pitch + dPitch) }, 260);
      },
      stop() {
        motion = null;
        spin = null;
      },
      setZoom(zoom) {
        zoomTarget = zoom;
        if (reducedMotion.matches) pose.zoom = zoom;
        invalidate();
      },
      // Back to the resting pose by the shortest way round.
      reset({ smooth = true } = {}) {
        const turns = Math.round((pose.yaw - rest.yaw) / 360);
        zoomTarget = 1;
        if (!smooth || reducedMotion.matches) pose.zoom = 1;
        moveTo({ yaw: rest.yaw + turns * 360, pitch: rest.pitch }, smooth ? 520 : 0);
      },
      pose: () => ({ ...pose }),
      // A new resting pose, at once: refitted and drawn as if the yml named it (for the tests
      // and bin/fit_journey_model_pose.js).
      setRest(yaw, pitch) {
        if (Number.isFinite(yaw)) rest.yaw = yaw;
        if (Number.isFinite(pitch)) rest.pitch = clampPitch(pitch);
        motion = null;
        spin = null;
        zoomTarget = 1;
        Object.assign(pose, rest, { zoom: 1 });
        fit();
        draw();
        return { ...rest };
      },
      // The object's silhouette as drawn now (see the header), read back in the same task as
      // it is drawn, before the browser lets the drawing buffer go.
      mask(step = 2) {
        const width = host.clientWidth || 1;
        const height = host.clientHeight || 1;
        const cols = Math.max(1, Math.floor(width / step));
        const rows = Math.max(1, Math.floor(height / step));
        const aside = [ground, pool, contactPlane];
        for (const part of aside) part.visible = false;
        draw();
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        for (const part of aside) part.visible = true;
        draw();
        const bits = new Uint8Array(cols * rows);
        const shade = new Uint8Array(cols * rows);
        for (let row = 0; row < rows; row++) {
          // The drawing buffer's rows run from the bottom up.
          const y = h - 1 - Math.min(h - 1, Math.floor(((row + 0.5) * step * h) / height));
          for (let col = 0; col < cols; col++) {
            const x = Math.min(w - 1, Math.floor(((col + 0.5) * step * w) / width));
            const at = (y * w + x) * 4;
            const alpha = pixels[at + 3];
            if (alpha < MASK_ALPHA) continue;
            bits[row * cols + col] = 1;
            // Its brightness (the buffer's colour is premultiplied by its alpha).
            shade[row * cols + col] = Math.min(
              255,
              Math.round(((0.2126 * pixels[at] + 0.7152 * pixels[at + 1] + 0.0722 * pixels[at + 2]) * 255) / alpha)
            );
          }
        }
        return { cols, rows, step, bits, shade };
      },
      dispose: free,
    };
  } catch (error) {
    free();
    throw error;
  }
}

// Frees a loaded subtree: its geometry, materials and their textures (and a texture's
// decoded image, where the browser lets it go at once).
function disposeTree(root) {
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    for (const material of [].concat(node.material || [])) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) {
          const image = value.source && value.source.data;
          if (image && typeof image.close === "function") image.close();
          value.dispose();
        }
      }
      material.dispose();
    }
  });
}

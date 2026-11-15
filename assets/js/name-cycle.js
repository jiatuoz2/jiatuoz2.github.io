/* The banner name alternates between its two scripts, changing in a short fall of code.
   Both names stay in the HTML; this only decides how the cloth print draws them.
   The timeline is plain arithmetic (no DOM), so Node can test it. */
((root) => {
  const DURATION = 1700;
  const HOLD = 5600;
  // The code is set on a grid, as on a terminal: columns this far apart, rows this far apart.
  const COLUMN = 5.5;
  const ROW = 7.5;
  const GLYPH_SIZE = 7.5;
  // The strip of cloth redrawn each frame reaches this far above and below the heading.
  const ABOVE = 14;
  const BELOW = 16;
  const GAPS = 0.2;
  const STAGGER = 200;
  const OUT_END = 0.5;
  const IN_START = 0.34;
  const IN_END = 0.9;
  // Half-width katakana and digits, a few Latin letters and signs, three brush strokes.
  const GLYPHS = [..."ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ZJC=+*:<>丿乛亅"];
  const clamp = (x) => Math.max(0, Math.min(1, x));

  // A repeatable number in [0, 1) from two integers, so a frame depends only on its inputs.
  function hash(a, b) {
    let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  // ?name-cycle=en | native  shows that name and never changes it;
  // ?name-cycle=static       shows both, as reduced motion does;
  // ?name-cycle=native@0.5   holds the change to that name at that progress (0 to 1).
  function parseHook(search) {
    const value = new URLSearchParams(search || "").get("name-cycle");
    if (value === "static") return { mode: "static" };
    if (value === "en" || value === "native") return { mode: "pin", name: value };
    const frozen = /^(en|native)@(0|1|0?\.\d+)$/.exec(value || "");
    if (frozen) return { mode: "frozen", name: frozen[1], progress: clamp(Number(frozen[2])) };
    return { mode: "cycle" };
  }

  // Where a drawn name has ink, one entry per grid column: its x and the top and bottom of
  // the ink there, in CSS pixels. A stream of code runs down each of these.
  function sampleColumns(data, width, height, scale, pitch = COLUMN) {
    const columns = [];
    const step = pitch * scale;
    for (let left = 0; left < width; left += step) {
      const first = Math.floor(left);
      const last = Math.min(width, Math.floor(left + step));
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < height && last > first; y++) {
        let sum = 0;
        for (let x = first; x < last; x++) sum += data[(y * width + x) * 4 + 3];
        if (sum / (last - first) > 46) {
          if (top < 0) top = y;
          bottom = y + 1;
        }
      }
      if (top >= 0) columns.push({ x: (left + step / 2) / scale, top: top / scale, bottom: bottom / scale });
    }
    return columns;
  }

  // One frame of the change, in CSS pixels. The old name is wiped from left to right at
  // `wipe`; as the edge passes a column, a stream of code starts at the top of its ink and
  // runs down through it and a little below. The new name is uncovered up to `reveal`; ahead
  // of that edge a stream runs down each of its columns and stops at the foot of the ink.
  // As in digital rain the glyphs stand still on the grid: the stream's head lights each
  // slot in turn and the slot then fades. `floor` is how far down the redrawn strip reaches.
  function timeline(from, to, progress, seed = 0, floor = Infinity) {
    const p = clamp(progress);
    const particles = [];
    // Both edges start clear of the name and end clear of it (the painter's soft edges reach
    // 34px ahead of the wipe and 34px behind the reveal), so nothing jumps at either end.
    const outSpan = from.box.width + 48;
    const outLeft = from.box.left - 36;
    const inSpan = to.box.width + 48;
    const inLeft = to.box.left - 12;
    const wipe = p < OUT_END ? outLeft + outSpan * (p / OUT_END) : null;
    const reveal = p > IN_START ? inLeft + inSpan * clamp((p - IN_START) / (IN_END - IN_START)) : null;
    // Whatever is still lit fades out over the last moments, so the change ends clean.
    const closing = clamp(((1 - p) * DURATION) / 150);
    // `age` is how long ago the stream's head reached this slot, in milliseconds.
    const light = (id, x, row, age, fade, gain) => {
      if (age < 0 || age >= fade) return;
      const head = age < 80;
      const alpha = (head ? 1 : 0.8 * (1 - (age - 80) / (fade - 80)) ** 1.5) * gain * closing;
      if (alpha < 0.03) return;
      const tick = Math.floor(age / 130 + hash(id, row));
      particles.push({ x, y: row * ROW, char: GLYPHS[Math.floor(hash(id * 31 + row, tick) * GLYPHS.length)], alpha, head });
    };
    from.columns.forEach((column, index) => {
      const id = seed * 7919 + index;
      // One column in five stays dark, and the rest start up to a fifth of a second apart,
      // so the code reads as separate falling streams and not as lines of text.
      if (hash(id, 1) < GAPS) return;
      const start = (OUT_END * (column.x - outLeft)) / outSpan;
      const age = (p - start) * DURATION - STAGGER * hash(id, 2);
      if (age < 0) return;
      const speed = (55 + 45 * hash(id, 3)) / 1000;
      const fall = 14 + 10 * hash(id, 4);
      const fade = 240 + 200 * hash(id, 5);
      const end = Math.min(column.bottom + fall, floor - ROW * 0.6);
      for (let row = Math.ceil(column.top / ROW); row * ROW <= end; row++) {
        const y = row * ROW;
        // Below the name the stream thins out, so it never lands hard on the next line.
        const gain = y <= column.bottom ? 1 : clamp(1 - (y - column.bottom) / (fall + ROW)) ** 1.3;
        light(id, column.x, row, age - (y - column.top) / speed, fade, gain);
      }
    });
    to.columns.forEach((column, index) => {
      const id = seed * 7919 + 100003 + index;
      if (hash(id, 1) < GAPS) return;
      const landing = IN_START + ((IN_END - IN_START) * (column.x - 6 - inLeft)) / inSpan;
      const age = (p - landing) * DURATION + STAGGER * hash(id, 2);
      const speed = (70 + 50 * hash(id, 3)) / 1000;
      const lead = 12 + 8 * hash(id, 4);
      const fade = 240 + 180 * hash(id, 5);
      const begin = Math.max(column.top - lead, ROW * 0.6);
      // The head is halfway down the ink as the uncovering edge arrives.
      const middle = (column.top + column.bottom) / 2;
      for (let row = Math.ceil(begin / ROW); row * ROW <= column.bottom; row++) {
        const y = row * ROW;
        const gain = y >= column.top ? 1 : clamp((y - begin + ROW) / (lead + ROW));
        light(id, column.x, row, age + (middle - y) / speed, fade, gain);
      }
    });
    return { wipe, reveal, particles };
  }

  // Draws the name into the banner's print texture. `options` come from profile-banner.js:
  // heading, banner, print (canvas) and context, canRun(), reprint(), upload(), present(),
  // software().
  function attach(options) {
    const { heading, banner, print, context } = options;
    const spans = { en: heading.querySelector(".author__name-en"), native: heading.querySelector(".author__name-native") };
    if (!spans.en || !spans.native) return null;
    const hook = parseHook(location.search);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    // The one-name print sets each name on a single line. If the page has had to wrap one
    // (a narrow banner, enlarged text), the cloth prints the heading as the page lays it out.
    let fits = true;
    const oneLine = (span) => {
      const style = getComputedStyle(span);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35;
      return span.getBoundingClientRect().height < line * 1.5;
    };
    const wanted = () => (hook.mode === "static" || reducedMotion.matches || !fits ? "static" : "cycle");
    const canvas = () => document.createElement("canvas");
    const base = canvas();
    const band = canvas();
    const scratch = canvas();
    const baseContext = base.getContext("2d");
    const bandContext = band.getContext("2d");
    const scratchContext = scratch.getContext("2d");
    let mode = null;
    let shown = hook.name && hook.mode === "pin" ? hook.name : "en";
    let transition = null;
    if (hook.mode === "frozen") {
      transition = { from: hook.name === "en" ? "native" : "en", to: hook.name, progress: hook.progress, frozen: true, seed: 1 };
      shown = transition.from;
    }
    let layers = null;
    let layerKey = "";
    let origin = null;
    let colors = null;
    let timer = null;
    let frame = null;
    let lastFrame = 0;
    let count = 0;

    const label = () => {
      heading.dataset.nameCycle = mode === "static" ? "static" : transition ? `${transition.from}-${transition.to}` : shown;
    };

    function drawName(name, target, ratio, centerX, centerY) {
      const style = getComputedStyle(spans[name]);
      const english = getComputedStyle(spans.en);
      const text = spans[name].textContent.trim();
      target.setTransform(ratio, 0, 0, ratio, 0, 0);
      target.textBaseline = "middle";
      target.textAlign = "left";
      target.fillStyle = english.color;
      if ("letterSpacing" in target) target.letterSpacing = "0px";
      if (name === "en") {
        target.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const width = target.measureText(text).width;
        target.fillText(text, centerX - width / 2, centerY + 0.5);
        return { left: centerX - width / 2, width };
      }
      // Alone on the cloth, the second name is set at the first one's size and weight,
      // letter by letter so the spacing does not depend on canvas letter-spacing support.
      const size = parseFloat(english.fontSize);
      if ("lang" in target) target.lang = spans[name].lang || "";
      target.font = `${style.fontStyle} ${english.fontWeight} ${size}px ${style.fontFamily}`;
      const characters = [...text];
      const widths = characters.map((character) => target.measureText(character).width);
      const gap = size * 0.16;
      const width = widths.reduce((sum, value) => sum + value, 0) + gap * (characters.length - 1);
      let x = centerX - width / 2;
      characters.forEach((character, index) => {
        target.fillText(character, x, centerY + 0.5);
        x += widths[index] + gap;
      });
      return { left: centerX - width / 2, width };
    }

    function buildLayer(name, ratio, centerX, centerY) {
      const sharp = canvas();
      const blur = canvas();
      sharp.width = blur.width = band.width;
      sharp.height = blur.height = band.height;
      const sharpContext = sharp.getContext("2d", { willReadFrequently: true });
      const box = drawName(name, sharpContext, ratio, centerX, centerY);
      const blurContext = blur.getContext("2d");
      const radius = 1.8 * ratio;
      if (typeof blurContext.filter === "string") {
        blurContext.filter = `blur(${radius}px)`;
        blurContext.drawImage(sharp, 0, 0);
      } else {
        // No canvas filters (older Safari): eight offset copies soften it instead.
        blurContext.globalAlpha = 0.17;
        for (let i = 0; i < 8; i++) blurContext.drawImage(sharp, Math.cos((i * Math.PI) / 4) * radius, Math.sin((i * Math.PI) / 4) * radius);
      }
      const columns = sampleColumns(sharpContext.getImageData(0, 0, sharp.width, sharp.height).data, sharp.width, sharp.height, ratio);
      return { sharp, blur, box, columns };
    }

    // Copies `layer` through a horizontal alpha ramp given as [x, alpha] stops.
    function masked(layer, stops, ratio) {
      const margin = 200;
      const span = band.width / ratio + margin * 2;
      scratchContext.globalCompositeOperation = "copy";
      scratchContext.drawImage(layer, 0, 0);
      scratchContext.globalCompositeOperation = "destination-in";
      const ramp = scratchContext.createLinearGradient(-margin * ratio, 0, (span - margin) * ratio, 0);
      for (const [x, alpha] of stops) ramp.addColorStop(clamp((x + margin) / span), `rgba(0, 0, 0, ${alpha})`);
      scratchContext.fillStyle = ramp;
      scratchContext.fillRect(0, 0, scratch.width, scratch.height);
      bandContext.drawImage(scratch, 0, 0);
    }

    function paint() {
      if (!origin || !layers) return;
      const { ratio } = origin;
      bandContext.setTransform(1, 0, 0, 1, 0, 0);
      bandContext.globalAlpha = 1;
      bandContext.drawImage(base, 0, 0);
      if (!transition) bandContext.drawImage(layers[shown].sharp, 0, 0);
      else {
        const from = layers[transition.from];
        const to = layers[transition.to];
        const step = timeline(from, to, transition.progress, transition.seed, band.height / ratio);
        if (step.wipe !== null) {
          const x = step.wipe;
          masked(
            from.sharp,
            [
              [x + 10, 0],
              [x + 30, 1],
            ],
            ratio
          );
          masked(
            from.blur,
            [
              [x - 10, 0],
              [x + 2, 1],
              [x + 14, 1],
              [x + 34, 0],
            ],
            ratio
          );
        }
        if (step.reveal !== null) {
          const x = step.reveal;
          masked(
            to.sharp,
            [
              [x - 30, 1],
              [x - 10, 0],
            ],
            ratio
          );
          masked(
            to.blur,
            [
              [x - 34, 0],
              [x - 14, 1],
              [x - 2, 1],
              [x + 10, 0],
            ],
            ratio
          );
        }
        bandContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        bandContext.font = `700 ${GLYPH_SIZE}px Consolas, "SFMono-Regular", Menlo, "Liberation Mono", monospace`;
        bandContext.textAlign = "center";
        bandContext.textBaseline = "middle";
        for (const particle of step.particles) {
          bandContext.globalAlpha = particle.alpha;
          // The head of a stream is the name's own ink; what it leaves behind is the code colour.
          bandContext.fillStyle = particle.head ? colors.ink : colors.code;
          bandContext.fillText(particle.char, particle.x, particle.y);
        }
        bandContext.globalAlpha = 1;
        bandContext.setTransform(1, 0, 0, 1, 0, 0);
      }
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(band, origin.x, origin.y);
      context.restore();
    }
    const show = () => {
      if (mode !== "cycle" || !origin) return;
      paint();
      options.upload(band, origin.x, origin.y);
      options.present();
    };

    function settle() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (!transition || transition.frozen) return;
      shown = transition.to;
      transition = null;
      label();
      show();
    }
    function schedule() {
      if (timer !== null || hook.mode !== "cycle") return;
      timer = setTimeout(() => {
        timer = null;
        if (mode !== "cycle" || transition || !options.canRun()) return;
        transition = { from: shown, to: shown === "en" ? "native" : "en", progress: 0, start: null, seed: ++count };
        lastFrame = 0;
        label();
        frame = requestAnimationFrame(step);
      }, HOLD);
    }
    function step(time) {
      frame = null;
      if (!transition) return;
      if (mode !== "cycle" || !options.canRun()) {
        settle();
        return;
      }
      // The canvas fallback redraws every triangle of the cloth, so it gets half the frames.
      if (options.software() && lastFrame && time - lastFrame < 30) {
        frame = requestAnimationFrame(step);
        return;
      }
      lastFrame = time;
      if (transition.start === null) transition.start = time;
      transition.progress = (time - transition.start) / DURATION;
      if (transition.progress >= 1) {
        settle();
        schedule();
        return;
      }
      show();
      frame = requestAnimationFrame(step);
    }

    return {
      // Called at the start of every print: decides whether this print shows one name or both.
      begin() {
        fits = oneLine(spans.en) && oneLine(spans.native);
        mode = wanted();
        label();
      },
      // In the one-name mode the print leaves the heading's own text to this module.
      owns: (node) => mode === "cycle" && heading.contains(node),
      // Called once the rest of the print is drawn: keeps a clean copy of the cloth behind
      // the name, then draws the name as it stands now (any print can come mid-change).
      printed(bounds, ratio) {
        if (mode !== "cycle") {
          origin = null;
          return;
        }
        const box = heading.getBoundingClientRect();
        const left = Math.max(0, Math.floor((box.x - bounds.x) * ratio));
        const top = Math.max(0, Math.floor((box.y - bounds.y - ABOVE) * ratio));
        const right = Math.min(print.width, Math.ceil((box.right - bounds.x) * ratio));
        const bottom = Math.min(print.height, Math.ceil((box.bottom - bounds.y + BELOW) * ratio));
        if (right <= left || bottom <= top) {
          origin = null;
          return;
        }
        origin = { x: left, y: top, ratio };
        for (const layer of [base, band, scratch]) {
          if (layer.width !== right - left) layer.width = right - left;
          if (layer.height !== bottom - top) layer.height = bottom - top;
        }
        baseContext.globalCompositeOperation = "copy";
        baseContext.drawImage(print, left, top, band.width, band.height, 0, 0, band.width, band.height);
        const english = getComputedStyle(spans.en);
        const native = getComputedStyle(spans.native);
        colors = { ink: english.color, code: getComputedStyle(banner).getPropertyValue("--banner-name-code").trim() || english.color };
        const centerX = box.x - bounds.x + box.width / 2 - left / ratio;
        const centerY = box.y - bounds.y + box.height / 2 - top / ratio;
        const key = [
          band.width,
          band.height,
          ratio,
          centerX,
          centerY,
          colors.ink,
          english.fontWeight,
          english.fontSize,
          english.fontFamily,
          native.fontFamily,
        ].join("|");
        if (key !== layerKey) {
          layerKey = key;
          layers = { en: buildLayer("en", ratio, centerX, centerY), native: buildLayer("native", ratio, centerX, centerY) };
        }
        paint();
      },
      // Called whenever the banner's own motion state may have changed.
      sync() {
        if (mode === null) return;
        if (wanted() !== mode) options.reprint();
        if (mode !== "cycle" || !options.canRun()) {
          if (timer !== null) clearTimeout(timer);
          timer = null;
          settle();
        } else if (!transition) schedule();
      },
    };
  }

  const api = { DURATION, HOLD, COLUMN, ROW, ABOVE, BELOW, GLYPHS, hash, parseHook, sampleColumns, timeline, attach };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BannerNameCycle = api;
})(typeof window !== "undefined" ? window : globalThis);

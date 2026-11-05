/* Close-examine view for the "My Journey" boards (window.JourneyExamine, opened by
   journey-board.js; styled in _sass/_journey-examine.scss).

   Any document on a board opens here, in a window in the middle of the screen (about
   1080 x 700 at most; nearly the whole screen on a phone) over the page, which stays partly
   visible behind it, dimmed and a little blurred. Inside, the window is dark and cinematic (in
   both site themes), with a grain and the board's street map faint in the background: its
   text on the left (kicker, title, details, body, link, credits), the thing
   itself large on the right, turned a little toward the light. It can be turned by dragging
   (up to about 25 degrees each way, in CSS 3D; the lamp's highlight, the shade, the folds,
   the shadow and the sheet's edge follow the turn through custom properties on the object,
   held still with reduced motion), zoomed from 1x to 2.5x (wheel, pinch, or the
   buttons; dragging then moves it) and reset (double-click or the button). A filmstrip along
   the bottom holds every document on that board; previous and next, the arrow keys,
   Home/End and a swipe move along it, and a live region says where you are. Escape, a click
   outside the window or "Back to the board" closes it and hands focus back to the board (journey-board.js decides
   where: the document shown, its pile, or the spread pile it was opened from).

   What is shown large: an object (artifact cutout) as itself under its own shadow; a real
   document (scan_kind) as its sheet, diploma stock, stapled printout or padded cover (the
   board's own styles, _journey-board.scss); any other paper as a copy of the paper. The
   copies are hidden from screen readers (the text column reads the same); a picture keeps
   its description. A person's portrait shows its pixelated stand-in, as on the board, until
   the visitor presses "Reveal photo" (aria-pressed): the photo itself (data-original,
   preloaded) fades in over it, and "Hide photo" fades it out again; the next document starts
   pixelated again. The team photo (a photo with an image_pixel) works the same way: its
   pixelated stand-in here and in the filmstrip, its eye-barred original only on "Reveal
   photo". A real document with a large rendering (data-large) shows the board's image at
   once and swaps in the large one only after it has decoded, so the sheet is never blank.

   An object (kind artifact: a cutout or a photographed object) never turns in CSS: it lies
   flat under a soft shadow, with no tilt and no moving light; it still zooms (buttons, wheel,
   pinch) and a drag moves it when zoomed in. An object with a 3D model (data-model, made
   from a photo of it; _data/journey.yml) opens exactly like one without: its photo cutout,
   kicker "Object", and nothing of three.js or the model is requested. Beside the zoom
   buttons it has one more, "See 3D model" (a cube; aria-pressed false). Pressing it brings
   the photo back to rest and loads the viewer and the model, only then
   (assets/js/journey-model.js, imported on demand, never with the page; the button reads
   "Loading 3D model…", aria-disabled and aria-busy, meanwhile), and the model's canvas then
   fades in over the photo. Its first frame is the photo's picture: the photo's pose (its yml
   model_yaw and model_pitch), its silhouette fitted to the box of the cutout's opaque pixels
   (the same size and place), and the fade starts once that frame is on screen and the
   cutout has come to rest; nothing turns in. The model turns only when handled: a drag
   turns it (all the way round, and up and down within limits), coasting on when let go, the
   wheel, a pinch, the buttons and +/- zoom it, a double-click, Reset or 0 put it back, and
   with the view focused the arrow keys turn it. Meanwhile its kicker reads "Object, 3D model
   from a photo", a note over the foot of the view says "This 3D model was reconstructed from
   a photo and may not be accurate." (also the view's accessible description; a model not
   made from a photo says what it is instead, with its yml model_note and model_kicker, as
   data-model-note and data-model-kicker: the Pixel Watch's is Google's product model), and the
   button reads "Show photo" (aria-pressed true): pressing that turns the model back to rest,
   fades it out over the photo, and disposes it (its WebGL context released). An object with
   a model keeps room for the note and the buttons under it in either view (it sits a little
   higher, never under them), so the two views lie on each other. One model is open at a
   time, and only until the photo is asked for again, the window moves to another document
   or closes: every document opens on its photo. Without WebGL 2, or if the model fails, has
   not appeared within MODEL_TIMEOUT or loses its context, the photo stays (or comes back),
   still and flat, and the button reads "3D model unavailable", aria-disabled (a console
   warning only). window.__journeyModel (below) compares the open model's silhouette with
   its cutout's, for the tests and bin/fit_journey_model_pose.js. Nothing in the view starts
   the browser's own image drag (draggable=false, dragstart cancelled).

   It is a modal <dialog> (role dialog, aria-modal, labelled by the title) placed inside the
   journey section so the board's paper styles apply; Tab stays inside it. Without motion
   preferences everything is instant. Sounds: "paper-open" when it opens and on each switch,
   "paper-close" when it closes (window.JourneySound, optional; only ever after a press). */
(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const touchOnly = matchMedia("(hover: none)");
  // The narrow layout (_journey-examine.scss), where the zoom buttons sit over the view's foot.
  const narrow = matchMedia("(max-width: 759.98px)");
  const KIND_NAMES = {
    place: "Place",
    education: "School",
    lab: "Lab",
    project: "Project",
    paper: "Paper",
    person: "Person",
    course: "Course",
    work: "Work",
    award: "Award",
    note: "Note",
    photo: "Photograph",
    artifact: "Object",
  };
  const SCAN_NAMES = { diploma: "Diploma", "paper-page": "First page", cover: "Diploma cover" };
  // The object's resting pose: tipped back a touch and turned to the right.
  const BASE = { x: 5, y: -13, z: 1.2 };
  const TURN_LIMIT = 25;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.5;
  const EASE = "cubic-bezier(0.2, 0.75, 0.25, 1)";
  const MODEL_KIND = "Object, 3D model from a photo";
  // The 3D button's words, by state, and the note under the model.
  const MODEL_BUTTON = {
    photo: "See 3D model",
    loading: "Loading 3D model…",
    model: "Show photo",
    unavailable: "3D model unavailable",
  };
  const MODEL_NOTE = "This 3D model was reconstructed from a photo and may not be accurate.";
  // The 3D viewer, an ES module beside this script, is imported only when "See 3D model" is
  // pressed; a model that has not appeared within MODEL_TIMEOUT is given up.
  const MODEL_MODULE = (() => {
    try {
      return new URL("journey-model.js", document.currentScript.src).href;
    } catch (error) {
      return new URL("/assets/js/journey-model.js", location.href).href;
    }
  })();
  const MODEL_TIMEOUT = 15000;
  // A model turns this many degrees per pixel dragged, and per arrow key.
  const ORBIT = { yaw: 0.45, pitch: 0.3 };
  const NUDGE = { yaw: 15, pitch: 10 };

  const sound = (name) => {
    try {
      if (window.JourneySound) window.JourneySound.play(name);
    } catch (error) {
      // Sound is a nicety: never let it break the view.
    }
  };
  const element = (name, className, parent = null, text = null) => {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text !== null) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const round = (value) => Math.round(value * 100) / 100;
  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
  // A document's own parts, not those of the objects attached to it.
  const own = (doc, selector) => [...doc.querySelectorAll(selector)].filter((node) => node.closest(".board-doc") === doc);
  const ownOne = (doc, selector) => own(doc, selector)[0] || null;
  const animate = (node, frames, options) => (!reducedMotion.matches && typeof node.animate === "function" ? node.animate(frames, options) : null);
  // WebGL 2 (three.js needs it), probed once, its context released at once.
  let webgl = null;
  const canWebGL = () => {
    if (webgl === null) {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        webgl = Boolean(gl);
        if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch (error) {
        webgl = false;
      }
    }
    return webgl;
  };
  // Where a cutout's opaque pixels (alpha at least one half) lie in its picture, as fractions
  // of it (a cutout keeps a few clear pixels round it, unevenly): read once per picture, the
  // whole picture until it has loaded.
  const opaque = new Map();
  const ALPHA_EDGE = 128;
  const opaqueBounds = (image) => {
    const src = image.currentSrc || image.src;
    const whole = { left: 0, top: 0, right: 1, bottom: 1 };
    if (opaque.has(src)) return opaque.get(src);
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return whole;
    try {
      const k = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * k));
      const h = Math.max(1, Math.round(image.naturalHeight * k));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const paint = canvas.getContext("2d", { willReadFrequently: true });
      paint.drawImage(image, 0, 0, w, h);
      const alpha = paint.getImageData(0, 0, w, h).data;
      let [left, top, right, bottom] = [w, h, -1, -1];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (alpha[(y * w + x) * 4 + 3] < ALPHA_EDGE) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      const bounds = right < 0 ? whole : { left: left / w, top: top / h, right: (right + 1) / w, bottom: (bottom + 1) / h };
      opaque.set(src, bounds);
      return bounds;
    } catch (error) {
      // A picture the page may not read: its whole box, then.
      return whole;
    }
  };

  const linkText = (href) => {
    if (/^#paper-/.test(href)) return "Read about the paper in Publications";
    if (/^https?:\/\//.test(href)) {
      try {
        return `Visit ${new URL(href).hostname.replace(/^www\./, "")}`;
      } catch (error) {
        return "Visit the site";
      }
    }
    return "Open the page";
  };

  // What a board document says, read from its markup (_includes/journey-doc.html).
  const read = (doc) => {
    const titleNode = ownOne(doc, ".board-doc-title");
    const link = titleNode?.querySelector("a[href]");
    const kind = doc.dataset.kind || "note";
    const scan = doc.dataset.scan || "";
    const medium = doc.dataset.medium || "";
    const picture = ownOne(doc, ".board-scan img, .board-artifact-object img, .board-doc-photo img");
    // A 3D model (journey-doc.html: data-model, data-model-size, data-model-yaw,
    // data-model-pitch, data-model-pitch-min, data-model-fov, and data-model-note and
    // data-model-kicker for a model not made from a photo), only ever on an object shown by its
    // cutout.
    const model = kind === "artifact" && medium !== "photo" && picture ? doc.dataset.model || "" : "";
    const number = (value) => (value === undefined || value === "" ? null : Number(value));
    return {
      kind,
      scan,
      medium,
      // How large an object shows, against the window's usual fill (yml scale; a hand-held
      // device is drawn smaller than a robot). Papers always fill it.
      scale: kind === "artifact" ? clamp(number(doc.dataset.scale) || 1, 0.3, 1) : 1,
      // (An object with a model is first shown by its photo, as "Object"; modelKicker while
      // its model shows.)
      kindName: SCAN_NAMES[scan] || (kind === "artifact" && medium === "photo" ? "Object, photographed" : KIND_NAMES[kind]) || kind,
      model,
      modelSize: number(doc.dataset.modelSize),
      modelYaw: number(doc.dataset.modelYaw),
      modelPitch: number(doc.dataset.modelPitch),
      modelPitchMin: number(doc.dataset.modelPitchMin),
      modelFov: number(doc.dataset.modelFov),
      // What the note under the model and the kicker say while it shows (yml model_note and
      // model_kicker; by default, that it was reconstructed from a photo).
      modelNote: clean(doc.dataset.modelNote) || MODEL_NOTE,
      modelKicker: clean(doc.dataset.modelKicker) || MODEL_KIND,
      title: clean(titleNode?.textContent),
      href: link?.getAttribute("href") || "",
      rel: link?.getAttribute("rel") || "",
      meta: clean(ownOne(doc, ".board-doc-meta")?.textContent),
      dates: clean(ownOne(doc, ".board-doc-dates")?.textContent),
      body: clean(ownOne(doc, ".board-doc-body")?.textContent),
      stamp: clean(ownOne(doc, ".board-stamp")?.textContent),
      credits: own(doc, ".board-doc-credit"),
      picture,
    };
  };

  // The thing shown large: a copy of it, without the board's buttons, ids or positions.
  const strip = (root) => {
    for (const node of [root, ...root.querySelectorAll("*")]) {
      node.removeAttribute("id");
      node.removeAttribute("style");
      if (node.matches("a[href]")) node.setAttribute("tabindex", "-1");
      if (node.matches("img")) {
        node.loading = "eager";
        node.removeAttribute("loading");
        node.draggable = false;
      }
    }
    return root;
  };
  const objectFor = (doc, info) => {
    if (info.kind === "artifact" && info.medium !== "photo" && info.picture) {
      const holder = element("div", "examine-thing examine-cutout");
      const image = strip(info.picture.cloneNode(true));
      holder.append(image);
      return { node: holder, label: info.picture.alt };
    }
    const sheet = info.scan && ownOne(doc, ".board-scan");
    if (sheet) {
      const copy = strip(sheet.cloneNode(true));
      copy.removeAttribute("aria-hidden");
      copy.classList.add("examine-thing", "examine-scan");
      // The large rendering replaces the board's image only once it is decoded.
      const page = copy.querySelector("img[data-large]");
      if (page) {
        const large = new Image();
        large.decoding = "async";
        large.src = page.dataset.large;
        const swap = () => {
          if (page.isConnected || view.object.contains(copy)) page.src = large.src;
        };
        const waitLoad = () => {
          if (large.complete && large.naturalWidth) swap();
          else large.addEventListener("load", swap, { once: true });
        };
        if (typeof large.decode === "function") large.decode().then(swap, waitLoad);
        else waitLoad();
      }
      return { node: copy, label: copy.querySelector("img")?.alt || (info.scan === "cover" ? `${info.kindName}: ${info.title}` : "") };
    }
    // A copy of the paper; its .board-wear comes along (its folds, swapped for the large
    // maps here).
    const paper = element("div", `${doc.className} examine-thing examine-paper`);
    paper.classList.remove("is-active", "is-linked", "is-taped", "is-tight", "is-attached", "is-open");
    paper.dataset.kind = info.kind;
    for (const child of doc.children) {
      if (child.matches(".board-doc-open, .board-doc-attached, .board-doc-credit, .board-stack-open")) continue;
      paper.append(strip(child.cloneNode(true)));
    }
    // A pixelated portrait or the team photo: the photo itself waits, loaded and transparent,
    // over the stand-in until "Reveal photo" (.is-revealed on the object; _journey-examine.scss).
    const pixel = paper.querySelector("img[data-original]");
    if (pixel) {
      const original = element("img", "board-portrait-original", pixel.parentElement);
      original.src = pixel.dataset.original;
      original.alt = "";
      original.decoding = "async";
      original.draggable = false;
      pixel.classList.add("board-portrait-pixel");
    }
    return { node: paper, label: info.picture?.alt || paper.querySelector(".board-portrait img")?.alt || "" };
  };

  let view = null;
  let state = null;
  let closing = null;

  const build = () => {
    const dialog = element("dialog", "journey-examine");
    // Never the browser's own drag of an image (its file's ghost) from anything in the view.
    dialog.addEventListener("dragstart", (event) => event.preventDefault());
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "journey-examine-title");
    const frame = element("div", "examine-frame", dialog);
    // The window's ground: grain and the board's street map, faint (--examine-map).
    element("div", "examine-ground", frame).setAttribute("aria-hidden", "true");

    const back = element("button", "examine-back", frame);
    back.type = "button";
    element("span", "examine-back-arrow", back, "←").setAttribute("aria-hidden", "true");
    element("span", null, back, " Back to the board");

    const text = element("div", "examine-text", frame);
    const kicker = element("p", "examine-kicker", text);
    const title = element("h2", "examine-title", text);
    title.id = "journey-examine-title";
    title.tabIndex = -1;
    const stamp = element("p", "examine-stamp", text);
    const meta = element("p", "examine-meta", text);
    const dates = element("p", "examine-dates", text);
    const body = element("div", "examine-body", text);
    const reveal = element("button", "examine-reveal", text);
    reveal.type = "button";
    reveal.setAttribute("aria-pressed", "false");
    reveal.hidden = true;
    element("span", "examine-reveal-icon", reveal).setAttribute("aria-hidden", "true");
    element("span", "examine-reveal-text", reveal, "Reveal photo");
    const links = element("p", "examine-links", text);
    const credit = element("div", "examine-credit", text);

    const stage = element("div", "examine-view", frame);
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", "The document, close up");
    const light = element("div", "examine-light", stage);
    light.setAttribute("aria-hidden", "true");
    const object = element("div", "examine-object", stage);
    // An object's 3D model: its canvas, over the cutout (journey-model.js).
    const modelHost = element("div", "examine-model", stage);
    modelHost.setAttribute("aria-hidden", "true");
    // The buttons over the view's foot: an object's "See 3D model" (only where it has one)
    // on a pill of its own, then the zoom.
    const tools = element("div", "examine-tools", stage);
    const modelTools = element("div", "examine-tools-pill examine-tools-model", tools);
    modelTools.hidden = true;
    const modelToggle = element("button", "examine-tool examine-model-toggle", modelTools);
    modelToggle.type = "button";
    modelToggle.setAttribute("aria-pressed", "false");
    // A cube (to see the model) and a framed picture (to go back to the photo).
    element("span", "examine-model-icon", modelToggle).innerHTML =
      '<svg class="examine-model-icon-cube" viewBox="0 0 16 16" focusable="false"><path d="M8 1.6 13.9 5v6L8 14.4 2.1 11V5Z M2.1 5 8 8.4 13.9 5 M8 8.4v6"/></svg>' +
      '<svg class="examine-model-icon-photo" viewBox="0 0 16 16" focusable="false"><path d="M2 3.2h12v9.6H2Z M2 11l3.6-3.6 2.8 2.8 1.8-1.8L14 12.2"/><circle cx="10.6" cy="6" r="1.1"/></svg>';
    modelToggle.firstElementChild.setAttribute("aria-hidden", "true");
    const modelToggleText = element("span", "examine-model-toggle-text", modelToggle, MODEL_BUTTON.photo);
    const zoomTools = element("div", "examine-tools-pill examine-tools-zoom", tools);
    const zoomOut = element("button", "examine-tool examine-zoom-out", zoomTools, "−");
    zoomOut.type = "button";
    zoomOut.setAttribute("aria-label", "Zoom out");
    const level = element("span", "examine-zoom-level", zoomTools, "100%");
    level.setAttribute("aria-hidden", "true");
    const zoomIn = element("button", "examine-tool examine-zoom-in", zoomTools, "+");
    zoomIn.type = "button";
    zoomIn.setAttribute("aria-label", "Zoom in");
    const reset = element("button", "examine-tool examine-reset", zoomTools, "Reset");
    reset.type = "button";
    reset.setAttribute("aria-label", "Reset the view");
    const hint = element("p", "examine-hint", stage);
    hint.setAttribute("aria-hidden", "true");
    // Shown with the 3D model only, and then the view's description.
    const modelNote = element("p", "examine-model-note", stage, MODEL_NOTE);
    modelNote.id = "journey-examine-model-note";

    const nav = element("nav", "examine-strip", frame);
    nav.setAttribute("aria-label", "Documents on this board");
    const prev = element("button", "examine-step examine-prev", nav);
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous document");
    element("span", null, prev, "‹").setAttribute("aria-hidden", "true");
    const film = element("ol", "examine-film", nav);
    const next = element("button", "examine-step examine-next", nav);
    next.type = "button";
    next.setAttribute("aria-label", "Next document");
    element("span", null, next, "›").setAttribute("aria-hidden", "true");
    const count = element("p", "examine-count", nav);
    count.setAttribute("aria-hidden", "true");
    const keys = element("p", "examine-keys", nav);
    keys.setAttribute("aria-hidden", "true");
    keys.innerHTML = "<kbd>←</kbd> <kbd>→</kbd> browse <span>·</span> <kbd>Esc</kbd> back";
    const live = element("p", "examine-live visually-hidden", frame);
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");

    view = {
      dialog,
      frame,
      back,
      text,
      kicker,
      title,
      stamp,
      meta,
      dates,
      body,
      reveal,
      links,
      credit,
      stage,
      object,
      modelHost,
      modelTools,
      modelToggle,
      modelToggleText,
      modelNote,
      // The object's model, when it has one (read()), and its state: "photo", "loading",
      // "model" or "unavailable".
      modelInfo: null,
      modelState: "",
      modelLabel: "",
      modelJob: null,
      modelRest: null,
      leaving: null,
      viewer: null,
      tools,
      zoomIn,
      zoomOut,
      level,
      reset,
      hint,
      prev,
      next,
      film,
      count,
      live,
      buttons: [],
    };

    // The pose: turn (degrees from rest), zoom, pan (px) and the fit of the thing to the stage.
    // lift (px) raises an object with a model above the room kept for its note and buttons.
    const pose = { x: 0, y: 0, zoom: 1, panX: 0, panY: 0, fit: 1, lift: 0 };
    view.pose = pose;
    const apply = () => {
      // An object has no model to turn: it lies flat, square to the view.
      const rigid = Boolean(view.rigid);
      const rx = rigid ? 0 : clamp(BASE.x + pose.x, -TURN_LIMIT, TURN_LIMIT);
      const ry = rigid ? 0 : clamp(BASE.y + pose.y, -TURN_LIMIT, TURN_LIMIT);
      const rz = rigid ? 0 : BASE.z;
      // Centred on the stage (the object is positioned at its middle), then panned, turned, scaled.
      object.style.transform = `translate(-50%, -50%) translate(${round(pose.panX)}px, ${round(pose.panY + pose.lift)}px) rotateX(${round(rx)}deg) rotateY(${round(ry)}deg) rotateZ(${rz}deg) scale(${round(pose.fit * pose.zoom)})`;
      // The lamp on the sheet as it turns (_journey-examine.scss): a highlight sliding toward
      // the lamp, a shade on the side turned away, the folds standing out as it tilts, its
      // shadow shifting, and its edge showing on the near side. With reduced motion the light
      // holds still at the resting pose (the sheet still turns).
      const still = reducedMotion.matches;
      const lightX = still ? BASE.x : rx;
      const lightY = still ? BASE.y : ry;
      // How squarely it faces the lamp (above, a little to the left): -1 away, 1 toward.
      const facing = clamp(lightX / 22 - lightY / 30, -1, 1);
      const rake = clamp((Math.abs(lightX) + Math.abs(lightY)) / 28, 0, 1);
      const set = (name, value) => object.style.setProperty(name, value);
      // The highlight rests toward the lamp (upper left) and slides with the turn; the shade
      // gathers on the side turned away, its gradient following the direction of the turn.
      set("--lx", `${round(clamp(40 + lightY * 2.6, -20, 120))}%`);
      set("--ly", `${round(clamp(22 - lightX * 2.6, -30, 110))}%`);
      set("--spec", round(0.06 + 0.24 * Math.max(0, facing) + 0.06 * rake));
      set("--shade", round(0.05 + 0.32 * Math.max(0, -facing) + 0.08 * rake));
      set("--shade-dir", `${round((Math.atan2(lightY, -lightX) * 180) / Math.PI + 90)}deg`);
      set("--rake", round(rake));
      // A print's specular streak runs across about twice as fast as the turn.
      set("--sheen", `${round(clamp(50 - lightY * 3.4, -40, 140))}%`);
      // Thickness, in the sheet's own pixels: a padded cover, card stock, paper.
      const scan = object.dataset.scan;
      const thick = scan === "cover" ? 5 : scan === "diploma" ? 2 : object.dataset.kind === "lab" ? 1.6 : 1.1;
      const radians = Math.PI / 180;
      set("--edge-x", `${round(-Math.sin(ry * radians) * thick)}px`);
      set("--edge-y", `${round(Math.sin(rx * radians) * thick)}px`);
      set("--shadow-x", `${round(clamp(ry * 1.2, -30, 30))}px`);
      set("--shadow-y", `${round(clamp(22 - rx * 0.9, 4, 44))}px`);
      set("--shadow-blur", `${round(24 + rake * 16)}px`);
      level.textContent = `${Math.round(pose.zoom * 100)}%`;
      zoomOut.disabled = pose.zoom <= ZOOM_MIN + 0.001;
      zoomIn.disabled = pose.zoom >= ZOOM_MAX - 0.001;
      stage.classList.toggle("is-zoomed", pose.zoom > 1.001);
      if (view.viewer) {
        // The model zooms itself (its camera), staying sharp; a drag always turns it.
        view.viewer.setZoom(pose.zoom);
        hint.textContent = touchOnly.matches ? "Drag to turn it · pinch to zoom" : "Drag to turn it · scroll to zoom · double-click to reset";
      } else if (rigid) {
        hint.textContent = touchOnly.matches
          ? "Pinch to zoom · drag to move when zoomed · swipe to browse"
          : "Scroll to zoom · drag to move · double-click to reset";
      } else {
        hint.textContent =
          pose.zoom > 1.001
            ? "Drag to move it · double-click to reset"
            : touchOnly.matches
              ? "Drag to turn it · pinch to zoom · swipe to browse"
              : "Drag to turn it · scroll to zoom · double-click to reset";
      }
    };
    view.apply = apply;
    const clampPan = () => {
      const thing = object.firstElementChild;
      const w = (thing?.offsetWidth || 0) * pose.fit * pose.zoom;
      const h = (thing?.offsetHeight || 0) * pose.fit * pose.zoom;
      const limitX = Math.max(0, (w - stage.clientWidth * 0.5) / 2);
      const limitY = Math.max(0, (h - stage.clientHeight * 0.5) / 2);
      pose.panX = clamp(pose.panX, -limitX, limitX);
      pose.panY = clamp(pose.panY, -limitY, limitY);
    };
    const setZoom = (value) => {
      const before = pose.zoom;
      pose.zoom = clamp(value, ZOOM_MIN, ZOOM_MAX);
      if (pose.zoom <= ZOOM_MIN + 0.001) {
        pose.panX = 0;
        pose.panY = 0;
      } else {
        pose.panX *= pose.zoom / before;
        pose.panY *= pose.zoom / before;
        clampPan();
      }
      apply();
    };
    const resetPose = ({ smooth = true } = {}) => {
      Object.assign(pose, { x: 0, y: 0, zoom: 1, panX: 0, panY: 0 });
      if (view.viewer) view.viewer.reset({ smooth });
      if (smooth && !reducedMotion.matches) {
        object.classList.add("is-settling");
        setTimeout(() => object.classList.remove("is-settling"), 380);
      }
      apply();
    };
    view.resetPose = resetPose;
    // The thing is scaled to fill most of the stage, small ones a little enlarged. In the
    // narrow layout it keeps clear of the zoom buttons below it (as much above, so it stays
    // centred), though never smaller than 60% of the stage's height.
    // An object with a model keeps the foot of the view, from its note (laid out, if unseen,
    // while the photo shows) down, clear in both views: it fits in the room above, centred
    // there (lift), so the photo and the model lie in the same place.
    const restLayout = () => {
      const thing = object.firstElementChild;
      const w = thing ? thing.offsetWidth : 0;
      const h = thing ? thing.offsetHeight : 0;
      const height = stage.clientHeight;
      if (!w || !h || !stage.clientWidth || !height) return { scale: 0, lift: 0 };
      const across = (stage.clientWidth * 0.8) / w;
      const share = view.scale || 1;
      if (view.modelInfo && modelNote.offsetParent) {
        const band = clamp(height - modelNote.offsetTop + 6, 0, height * 0.5);
        const tall = Math.max(height * 0.45, Math.min(height * 0.8, (height - band) * 0.92));
        return { scale: Math.min(1.7, across, tall / h) * share, lift: -band / 2 };
      }
      const room = narrow.matches && tools.offsetParent ? height - tools.offsetTop + 6 : 0;
      const tall = Math.max(height * 0.6, Math.min(height * 0.8, height - room * 2));
      return { scale: Math.min(1.7, across, tall / h) * share, lift: 0 };
    };
    // Where a cutout's picture lies at rest, in CSS pixels from the stage's centre: the img's
    // content box (it is object-fit: contain), wherever the transform has it now.
    view.posterRect = () => {
      const image = object.querySelector(".examine-cutout img");
      const { scale, lift } = restLayout();
      if (!image || !scale || !image.naturalWidth || !image.naturalHeight || !object.offsetWidth) return null;
      const outer = object.getBoundingClientRect();
      const box = image.getBoundingClientRect();
      if (!outer.width || !outer.height) return null;
      // The img's box in the object's own (untransformed) pixels ...
      const across = object.offsetWidth / outer.width;
      const down = object.offsetHeight / outer.height;
      const w = box.width * across;
      const h = box.height * down;
      const k = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const cw = image.naturalWidth * k;
      const ch = image.naturalHeight * k;
      const left = (box.left - outer.left) * across + (w - cw) / 2;
      const top = (box.top - outer.top) * down + (h - ch) / 2;
      // ... then as the resting transform lays it on the stage.
      return {
        image,
        left: (left - object.offsetWidth / 2) * scale,
        top: (top - object.offsetHeight / 2) * scale + lift,
        width: cw * scale,
        height: ch * scale,
      };
    };
    // The box the cutout's opaque pixels fill at rest (journey-model.js fits the model's
    // silhouette into it): its size, and its centre from the stage's centre.
    view.restBox = () => {
      const rect = view.posterRect();
      if (!rect) return null;
      const opaque = opaqueBounds(rect.image);
      return {
        width: (opaque.right - opaque.left) * rect.width,
        height: (opaque.bottom - opaque.top) * rect.height,
        x: rect.left + ((opaque.left + opaque.right) / 2) * rect.width,
        y: rect.top + ((opaque.top + opaque.bottom) / 2) * rect.height,
      };
    };
    const fit = () => {
      const { scale, lift } = restLayout();
      if (!scale) return;
      pose.fit = scale;
      pose.lift = lift;
      clampPan();
      apply();
    };
    view.fit = fit;
    if (typeof ResizeObserver === "function") new ResizeObserver(() => state && fit()).observe(stage);
    else window.addEventListener("resize", () => state && fit());

    zoomIn.addEventListener("click", () => setZoom(pose.zoom * 1.25));
    zoomOut.addEventListener("click", () => setZoom(pose.zoom / 1.25));
    reset.addEventListener("click", () => resetPose());
    modelToggle.addEventListener("click", () => {
      if (state) toggleModel();
    });
    back.addEventListener("click", () => close());
    // The portrait's photo is shown only on request, and pixelated again just as easily; the
    // object's description says which is showing.
    const revealText = reveal.querySelector(".examine-reveal-text");
    const setRevealed = (on) => {
      reveal.setAttribute("aria-pressed", String(on));
      revealText.textContent = on ? "Hide photo" : "Reveal photo";
      object.classList.toggle("is-revealed", on);
      const pixel = object.querySelector(".board-portrait-pixel");
      if (pixel && object.getAttribute("role") === "img") {
        object.setAttribute("aria-label", on ? pixel.dataset.originalAlt || pixel.alt : pixel.alt);
      }
    };
    view.setRevealed = setRevealed;
    reveal.addEventListener("click", () => {
      const on = reveal.getAttribute("aria-pressed") !== "true";
      setRevealed(on);
      sound("click");
    });
    // A click (or tap) outside the window, on the dimmed page, closes it. Only one that both
    // starts and ends out there: a drag that strays off the window does not.
    let downOutside = false;
    const outside = (event) => {
      if (event.target !== dialog) return false;
      const box = dialog.getBoundingClientRect();
      return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    dialog.addEventListener("pointerdown", (event) => {
      downOutside = outside(event);
    });
    dialog.addEventListener("click", (event) => {
      const started = downOutside;
      downOutside = false;
      if (state && started && outside(event)) close();
    });
    prev.addEventListener("click", () => go(state ? state.index - 1 : 0));
    next.addEventListener("click", () => go(state ? state.index + 1 : 0));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    // A link in the text column leaves the view first, then goes (same tab).
    text.addEventListener("click", (event) => {
      if (event.target.closest("a[href]")) close({ restore: false, instant: true });
    });

    // Turning, moving and pinching the thing; a quick sideways flick on a touch screen
    // moves along the filmstrip instead.
    const pointers = new Map();
    let gesture = null;
    const startGesture = (event) => {
      const t0 = performance.now();
      gesture = {
        mode: view.viewer ? "orbit" : pose.zoom > 1.001 ? "pan" : view.rigid ? "still" : "turn",
        id: event.pointerId,
        type: event.pointerType,
        x0: event.clientX,
        y0: event.clientY,
        t0,
        start: { ...pose },
        // A model's drag: the last point and the pointer's recent speed (px per ms).
        last: { x: event.clientX, y: event.clientY, t: t0 },
        speed: { x: 0, y: 0 },
      };
    };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    };
    stage.addEventListener("pointerdown", (event) => {
      if (!state || event.target.closest(".examine-tools")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        stage.setPointerCapture(event.pointerId);
      } catch (error) {
        // Capture is a nicety.
      }
      if (view.viewer) view.viewer.stop();
      if (pointers.size === 1) startGesture(event);
      else if (pointers.size === 2) gesture = { mode: "pinch", d0: spread(), z0: pose.zoom };
      object.classList.add("is-handled");
    });
    stage.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.mode === "pinch") {
        if (pointers.size >= 2) setZoom((gesture.z0 * spread()) / gesture.d0);
        return;
      }
      if (event.pointerId !== gesture.id) return;
      if (gesture.mode === "orbit") {
        if (!view.viewer) return;
        const now = performance.now();
        const mx = event.clientX - gesture.last.x;
        const my = event.clientY - gesture.last.y;
        const dt = Math.max(1, now - gesture.last.t);
        gesture.speed.x = gesture.speed.x * 0.4 + (mx / dt) * 0.6;
        gesture.speed.y = gesture.speed.y * 0.4 + (my / dt) * 0.6;
        gesture.last = { x: event.clientX, y: event.clientY, t: now };
        view.viewer.turn(mx * ORBIT.yaw, my * ORBIT.pitch);
        return;
      }
      const dx = event.clientX - gesture.x0;
      const dy = event.clientY - gesture.y0;
      if (gesture.mode === "turn") {
        pose.y = clamp(gesture.start.y + dx * 0.2, -TURN_LIMIT - BASE.y, TURN_LIMIT - BASE.y);
        pose.x = clamp(gesture.start.x - dy * 0.2, -TURN_LIMIT - BASE.x, TURN_LIMIT - BASE.x);
      } else if (gesture.mode === "pan") {
        pose.panX = gesture.start.panX + dx;
        pose.panY = gesture.start.panY + dy;
        clampPan();
      }
      apply();
    });
    const endPointer = (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      // A model let go while still moving coasts on (journey-model.js slows it down).
      if (gesture && gesture.mode === "orbit" && gesture.id === event.pointerId && event.type === "pointerup" && view.viewer) {
        if (performance.now() - gesture.last.t < 90) view.viewer.fling(gesture.speed.x * ORBIT.yaw, gesture.speed.y * ORBIT.pitch);
      }
      if (gesture && (gesture.mode === "turn" || gesture.mode === "still") && gesture.id === event.pointerId && gesture.type !== "mouse") {
        const dx = event.clientX - gesture.x0;
        const dy = event.clientY - gesture.y0;
        if (event.type === "pointerup" && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && performance.now() - gesture.t0 < 450) {
          gesture = null;
          pointers.clear();
          object.classList.remove("is-handled");
          go(state.index + (dx < 0 ? 1 : -1));
          return;
        }
      }
      if (pointers.size === 1) {
        const [[id, point]] = [...pointers.entries()];
        startGesture({ pointerId: id, pointerType: "touch", clientX: point.x, clientY: point.y });
      } else if (!pointers.size) {
        gesture = null;
        object.classList.remove("is-handled");
      }
    };
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);
    stage.addEventListener("dblclick", (event) => {
      if (event.target.closest(".examine-tools")) return;
      resetPose();
    });
    // The wheel (and a trackpad pinch, which arrives as a ctrl+wheel) zooms; the page
    // behind never scrolls or zooms.
    stage.addEventListener(
      "wheel",
      (event) => {
        if (!state) return;
        event.preventDefault();
        const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
        setZoom(pose.zoom * Math.exp(-step * (event.ctrlKey ? 0.01 : 0.0015)));
      },
      { passive: false }
    );
    dialog.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.metaKey) event.preventDefault();
      },
      { passive: false }
    );
    // A swipe across the text (touch) moves along the filmstrip too.
    let swipe = null;
    text.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      swipe = { x: event.clientX, y: event.clientY, t: performance.now() };
    });
    text.addEventListener("pointerup", (event) => {
      if (!swipe || !state) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      const quick = performance.now() - swipe.t < 500;
      swipe = null;
      if (quick && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(state.index + (dx < 0 ? 1 : -1));
    });
    text.addEventListener("pointercancel", () => {
      swipe = null;
    });

    dialog.addEventListener("keydown", (event) => {
      if (!state) return;
      // With the view focused, the arrow keys turn a model instead of browsing.
      if (view.viewer && document.activeElement === stage && !(event.altKey || event.ctrlKey || event.metaKey)) {
        const turn = { ArrowLeft: [-NUDGE.yaw, 0], ArrowRight: [NUDGE.yaw, 0], ArrowUp: [0, -NUDGE.pitch], ArrowDown: [0, NUDGE.pitch] }[event.key];
        if (turn) {
          event.preventDefault();
          view.viewer.nudge(...turn);
          return;
        }
      }
      const inFilm = film.contains(document.activeElement);
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "Home":
        case "End": {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          const last = state.docs.length - 1;
          const target = { ArrowLeft: state.index - 1, ArrowRight: state.index + 1, Home: 0, End: last }[event.key];
          go(target, { focusFilm: inFilm });
          return;
        }
        case "+":
        case "=":
          event.preventDefault();
          setZoom(pose.zoom * 1.25);
          return;
        case "-":
        case "_":
          event.preventDefault();
          setZoom(pose.zoom / 1.25);
          return;
        case "0":
          event.preventDefault();
          resetPose();
          return;
        case "Tab": {
          // Focus stays in the view until it is closed.
          const stops = [...dialog.querySelectorAll("a[href], button:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")].filter(
            (node) => node.getClientRects().length > 0 && !node.closest("[hidden]")
          );
          if (!stops.length) return;
          const index = stops.indexOf(document.activeElement);
          if (event.shiftKey && index <= 0) {
            event.preventDefault();
            stops[stops.length - 1].focus();
          } else if (!event.shiftKey && (index === stops.length - 1 || index === -1)) {
            event.preventDefault();
            stops[0].focus();
          }
          return;
        }
        default:
      }
    });
    return view;
  };

  // The filmstrip: one button per document, a picture where it has one, else its title
  // typed on a scrap of its paper.
  const buildFilm = () => {
    const { film } = view;
    film.replaceChildren();
    view.buttons = state.docs.map((doc, index) => {
      const info = read(doc);
      const item = element("li", "examine-film-item", film);
      const button = element("button", `examine-thumb examine-thumb--${info.scan ? `scan-${info.scan}` : info.kind}`, item);
      button.type = "button";
      button.dataset.medium = info.medium;
      button.setAttribute("aria-label", `Item ${index + 1} of ${state.docs.length}: ${info.title || info.kindName}`);
      if (info.picture && info.scan !== "cover") {
        const image = element("img", info.picture.matches(".board-private") ? "examine-thumb-private" : null, button);
        image.src = info.picture.currentSrc || info.picture.src;
        image.alt = "";
        image.decoding = "async";
        image.draggable = false;
      } else {
        element("span", "examine-thumb-text", button, info.scan === "cover" ? "Diploma" : info.title || info.kindName).setAttribute(
          "aria-hidden",
          "true"
        );
      }
      button.addEventListener("click", () => go(index));
      return button;
    });
  };

  const centreThumb = (button) => {
    const { film } = view;
    if (!button || film.scrollWidth <= film.clientWidth + 1) return;
    const left = button.offsetLeft - (film.clientWidth - button.offsetWidth) / 2;
    if (typeof film.scrollTo === "function") film.scrollTo({ left, behavior: reducedMotion.matches ? "auto" : "smooth" });
    else film.scrollLeft = left;
  };

  const fill = (node, value) => {
    node.textContent = value;
    node.hidden = !value;
  };
  // How the view and the object name the model for a screen reader: made from a photo, unless
  // its note says otherwise (then the note, the view's description, says where it came from).
  const modelPhrase = (info) => (info && info.modelNote !== MODEL_NOTE ? "a 3D model" : "a 3D model made from a photo");
  const kickerText = (info, context, kindName = info.kindName) =>
    [context.caseNo && `Case file No. ${context.caseNo}`, context.short || context.place, kindName].filter(Boolean).join(" · ");

  // The 3D button, the kicker, the note and the view's description for the state of the
  // object's model: "photo" (the photo shows; the button offers the model), "loading",
  // "model" (the model shows; the button offers the photo back) or "unavailable".
  const setModelState = (name) => {
    const { stage, modelToggle } = view;
    view.modelState = name;
    const showing = name === "model";
    modelToggle.setAttribute("aria-pressed", String(showing));
    view.modelToggleText.textContent = MODEL_BUTTON[name] || MODEL_BUTTON.photo;
    // aria-disabled rather than disabled, so a press that starts the load keeps its focus.
    if (name === "loading" || name === "unavailable") modelToggle.setAttribute("aria-disabled", "true");
    else modelToggle.removeAttribute("aria-disabled");
    if (name === "loading") modelToggle.setAttribute("aria-busy", "true");
    else modelToggle.removeAttribute("aria-busy");
    stage.classList.toggle("is-model-shown", showing);
    if (showing) {
      // The view takes focus, for the arrow keys, and says what it holds.
      stage.tabIndex = 0;
      stage.setAttribute("aria-label", `The object, ${modelPhrase(view.modelInfo)}: drag or use the arrow keys to turn it`);
      stage.setAttribute("aria-describedby", view.modelNote.id);
    } else {
      if (document.activeElement === stage) modelToggle.focus({ preventScroll: true });
      stage.removeAttribute("tabindex");
      stage.setAttribute("aria-label", "The document, close up");
      stage.removeAttribute("aria-describedby");
    }
    if (state && view.modelInfo)
      fill(view.kicker, kickerText(view.modelInfo, state.context, showing ? view.modelInfo.modelKicker : view.modelInfo.kindName));
    if (view.modelLabel)
      view.object.setAttribute("aria-label", showing ? `${view.modelLabel} (shown as ${modelPhrase(view.modelInfo)})` : view.modelLabel);
  };

  // Puts away the model of the document shown, loading, loaded or fading out: its load is
  // abandoned, or its viewer disposed (WebGL context released, canvas removed); the view is
  // the photo's again, at once.
  const unloadModel = () => {
    const job = view.modelJob;
    view.modelJob = null;
    view.viewer = null;
    view.modelRest = null;
    if (view.leaving) {
      clearTimeout(view.leaving.timer);
      view.leaving = null;
    }
    if (job) {
      clearTimeout(job.timer);
      job.controller.abort(new Error("The 3D model was put away"));
      if (job.viewer) job.viewer.dispose();
    }
    const { stage } = view;
    stage.classList.remove("has-model", "is-model-leaving");
    delete stage.dataset.model;
    view.modelHost.replaceChildren();
  };

  // The model cannot be shown: the photo stays (or comes back), and the button says so.
  const modelUnavailable = (info, error) => {
    console.warn(`Journey 3D model unavailable (${info.model}); showing the photo instead.`, error);
    unloadModel();
    if (!state || view.modelInfo !== info) return;
    view.stage.dataset.model = "failed";
    setModelState("unavailable");
    view.apply();
  };

  // "See 3D model": the photo comes back to rest, three.js and the model load (the photo
  // stays meanwhile), then the model's canvas fades in over it (.has-model,
  // _journey-examine.scss). The model's first frame is the photo's picture: drawn in the
  // photo's pose (model_yaw, model_pitch) with its silhouette fitted to the cutout's opaque
  // box (view.restBox), and the fade starts only once that frame is on screen and the photo
  // has come to rest (the window's opening, a step along the filmstrip, a reset); nothing
  // turns. If anything fails, or the model has not appeared within MODEL_TIMEOUT, or its
  // WebGL context is lost later, the photo stays (modelUnavailable).
  const loadModel = (info) => {
    if (!canWebGL()) {
      modelUnavailable(info, new Error("No WebGL 2"));
      return;
    }
    const job = { controller: new AbortController(), timer: 0, viewer: null };
    const { signal } = job.controller;
    view.modelJob = job;
    view.stage.dataset.model = "loading";
    setModelState("loading");
    // The photo goes back to rest (unzoomed, centred) first, as the model will appear.
    const settled = view.pose.zoom > 1.001 || view.pose.panX || view.pose.panY ? performance.now() + 400 : 0;
    view.resetPose();
    const gaveUp = new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason || new Error("The 3D model was put away")), { once: true });
    });
    job.timer = setTimeout(() => job.controller.abort(new Error(`No 3D model after ${MODEL_TIMEOUT / 1000} s`)), MODEL_TIMEOUT);
    const failed = (error) => {
      if (view.modelJob !== job) return;
      modelUnavailable(info, error);
    };
    // The photo's picture is decoded first, so its opaque box is known when the model is
    // fitted to it.
    const poster = view.object.querySelector(".examine-cutout img");
    const decoded = poster && typeof poster.decode === "function" ? poster.decode().catch(() => {}) : Promise.resolve();
    Promise.race([
      Promise.all([import(MODEL_MODULE), decoded]).then(([module]) =>
        module.mount({
          host: view.modelHost,
          url: info.model,
          sizeM: info.modelSize,
          yaw: info.modelYaw,
          pitch: info.modelPitch,
          pitchMin: info.modelPitchMin,
          fov: info.modelFov,
          fitBox: view.restBox,
          signal,
          onLost: () => failed(new Error("WebGL context lost")),
        })
      ),
      gaveUp,
    ]).then(async (viewer) => {
      if (view.modelJob !== job || !state) {
        viewer.dispose();
        if (view.modelJob === job) unloadModel();
        return;
      }
      clearTimeout(job.timer);
      job.viewer = viewer;
      // The window's opening, a step along the filmstrip or the reset may still be moving
      // the photo into place; the model waits for it there.
      const entrance = view.entrance;
      if (entrance && entrance.playState === "running") await entrance.finished.catch(() => {});
      const wait = settled - performance.now();
      if (wait > 0 && !reducedMotion.matches) await new Promise((resolve) => setTimeout(resolve, wait));
      if (view.modelJob !== job || !state) return;
      view.viewer = viewer;
      view.modelRest = viewer.pose();
      view.pose.panX = 0;
      view.pose.panY = 0;
      view.stage.classList.add("has-model");
      view.stage.dataset.model = "ready";
      setModelState("model");
      view.apply();
    }, failed);
  };

  // "Show photo": the model turns back to rest (if it was turned or zoomed), fades out over
  // the photo, which is there again at once beneath it, and is disposed. Pressed again while
  // it fades, the model simply stays.
  const showPhoto = () => {
    const { viewer, stage } = view;
    if (!viewer) {
      unloadModel();
      setModelState("photo");
      return;
    }
    const rest = view.modelRest || viewer.pose();
    const now = viewer.pose();
    const off = Math.abs(((((now.yaw - rest.yaw) % 360) + 540) % 360) - 180);
    const turned = off > 0.5 || Math.abs(now.pitch - rest.pitch) > 0.5 || Math.abs(now.zoom - 1) > 0.01;
    view.resetPose();
    setModelState("photo");
    if (reducedMotion.matches) {
      unloadModel();
      view.apply();
      return;
    }
    const leaving = { timer: 0 };
    view.leaving = leaving;
    const fade = () => {
      if (view.leaving !== leaving) return;
      stage.classList.remove("has-model");
      stage.classList.add("is-model-leaving");
      leaving.timer = setTimeout(() => {
        if (view.leaving !== leaving) return;
        unloadModel();
        view.apply();
      }, 520);
    };
    // (The viewer's reset takes about half a second.)
    if (turned) leaving.timer = setTimeout(fade, 560);
    else fade();
  };

  const toggleModel = () => {
    const info = view.modelInfo;
    if (!info) return;
    if (view.leaving && view.viewer) {
      // Asked for again while it fades out: it stays, at rest.
      sound("click");
      clearTimeout(view.leaving.timer);
      view.leaving = null;
      view.stage.classList.remove("is-model-leaving");
      view.stage.classList.add("has-model");
      setModelState("model");
      view.apply();
    } else if (view.modelState === "photo") {
      sound("click");
      loadModel(info);
    } else if (view.modelState === "model") {
      sound("click");
      showPhoto();
    }
  };

  const render = (direction = 0) => {
    // Focus on a control about to hide or be replaced (the reveal button, the 3D button, a
    // link, a model's view) moves to this item's thumbnail in the filmstrip, so the keys keep
    // working.
    const lost =
      [view.reveal, view.links, view.modelTools].some((control) => control.contains(document.activeElement)) || document.activeElement === view.stage;
    unloadModel();
    const doc = state.docs[state.index];
    const info = read(doc);
    const { context } = state;
    fill(view.kicker, kickerText(info, context));
    view.title.textContent = info.title || info.kindName;
    fill(view.stamp, info.stamp);
    fill(view.meta, info.meta);
    fill(view.dates, info.dates);
    view.body.replaceChildren();
    const paragraphs = [];
    if (info.kind === "place" && context.summary && context.summary !== info.body) paragraphs.push(context.summary);
    if (info.body) paragraphs.push(info.body);
    for (const paragraph of paragraphs) element("p", null, view.body, paragraph);
    view.body.hidden = !paragraphs.length;
    view.links.replaceChildren();
    if (info.href) {
      const link = element("a", "examine-link", view.links, linkText(info.href));
      link.href = info.href;
      if (info.rel) link.rel = info.rel;
    }
    view.links.hidden = !info.href;
    view.credit.replaceChildren(
      ...info.credits.map((credit) => {
        const copy = credit.cloneNode(true);
        copy.className = "examine-credit-line";
        copy.removeAttribute("id");
        copy.querySelectorAll("[tabindex]").forEach((node) => node.removeAttribute("tabindex"));
        return copy;
      })
    );
    view.credit.hidden = !info.credits.length;

    // The thing itself.
    const { node, label } = objectFor(doc, info);
    view.object.replaceChildren(node);
    view.rigid = info.kind === "artifact";
    view.scale = info.scale;
    view.object.classList.toggle("is-rigid", view.rigid);
    view.stage.classList.toggle("is-rigid", view.rigid);
    view.object.dataset.kind = info.kind;
    view.object.dataset.medium = info.medium;
    if (info.scan) view.object.dataset.scan = info.scan;
    else delete view.object.dataset.scan;
    if (label) {
      view.object.setAttribute("role", "img");
      view.object.setAttribute("aria-label", label);
      view.object.removeAttribute("aria-hidden");
      node.setAttribute("aria-hidden", "true");
    } else {
      view.object.removeAttribute("role");
      view.object.removeAttribute("aria-label");
      view.object.setAttribute("aria-hidden", "true");
    }
    // A portrait starts pixelated on every document; the button shows only where there is
    // a photo to reveal.
    view.reveal.hidden = !node.querySelector(".board-portrait-original");
    view.setRevealed(false);
    // An object with a model opens on its photo, the 3D button beside the zoom (and the
    // room for the note kept, so the photo lies where the model will); without WebGL 2 the
    // button says at once that the model cannot be shown.
    view.modelInfo = info.model ? info : null;
    view.modelLabel = info.model ? label : "";
    if (info.model) view.modelNote.textContent = info.modelNote;
    view.modelTools.hidden = !info.model;
    view.stage.classList.toggle("can-model", Boolean(info.model));
    setModelState("photo");
    if (info.model && !canWebGL()) {
      console.warn(`Journey 3D model unavailable (${info.model}): no WebGL 2; showing the photo instead.`);
      setModelState("unavailable");
    }
    view.resetPose({ smooth: false });
    view.fit();
    for (const image of node.querySelectorAll("img")) {
      if (!image.complete) image.addEventListener("load", () => state && view.fit(), { once: true });
    }

    // Where we are.
    const total = state.docs.length;
    view.buttons.forEach((button, index) => {
      if (index === state.index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    const pad = (value) => String(value).padStart(2, "0");
    view.count.textContent = `${pad(state.index + 1)} / ${pad(total)}`;
    view.prev.disabled = state.index <= 0;
    view.next.disabled = state.index >= total - 1;
    view.strip = view.strip || view.frame.querySelector(".examine-strip");
    view.strip.hidden = total < 2;
    view.live.textContent = `Item ${state.index + 1} of ${total}: ${info.title || info.kindName}`;
    centreThumb(view.buttons[state.index]);
    const active = document.activeElement;
    if (lost && (!view.dialog.contains(active) || !active.getClientRects().length)) {
      const thumb = view.buttons[state.index];
      (thumb && !view.strip.hidden ? thumb : view.back).focus({ preventScroll: true });
    }

    if (direction) {
      view.entrance = animate(
        view.object,
        [
          { opacity: 0, translate: `${direction * 56}px 0px` },
          { opacity: 1, translate: "0px 0px" },
        ],
        { duration: 340, easing: EASE }
      );
      animate(
        view.text,
        [
          { opacity: 0, translate: `${direction * 14}px 0px` },
          { opacity: 1, translate: "0px 0px" },
        ],
        { duration: 260, easing: EASE }
      );
    }
  };

  const go = (index, { focusFilm = false } = {}) => {
    if (!state) return;
    const target = clamp(index, 0, state.docs.length - 1);
    if (target === state.index) return;
    // Focus on a button about to be disabled moves to the one still useful.
    const active = document.activeElement;
    const direction = target > state.index ? 1 : -1;
    state.index = target;
    sound("paper-open");
    render(direction);
    if (focusFilm) view.buttons[state.index]?.focus();
    else if (active && active.disabled) (direction > 0 ? view.prev : view.next).focus();
  };

  const finishClose = () => {
    if (!closing) return;
    const { last, restore } = closing;
    closing = null;
    view.dialog.getAnimations?.().forEach((animation) => animation.cancel());
    if (view.dialog.open) view.dialog.close();
    view.dialog.classList.remove("is-closing");
    document.documentElement.classList.remove("has-journey-examine", "has-journey-examine-gutter");
    unloadModel();
    view.modelInfo = null;
    view.modelLabel = "";
    setModelState("photo");
    view.object.replaceChildren();
    view.film.replaceChildren();
    view.buttons = [];
    if (restore && last.onClose) {
      try {
        last.onClose(last.docs[last.index]);
      } catch (error) {
        // The board may have gone; focus simply stays on the page.
      }
    }
  };

  const close = ({ restore = true, instant = false } = {}) => {
    if (!state) return;
    const last = state;
    state = null;
    closing = { last, restore };
    sound("paper-close");
    const fade =
      !instant &&
      animate(
        view.dialog,
        [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 0.975 },
        ],
        { duration: 200, easing: "ease-in", fill: "forwards" }
      );
    if (!fade) {
      finishClose();
      return;
    }
    view.dialog.classList.add("is-closing");
    fade.finished.then(finishClose, finishClose);
  };

  const open = ({ docs, index = 0, root = document.body, context = {}, onClose = null } = {}) => {
    if (!Array.isArray(docs) || !docs.length) return;
    if (closing) finishClose();
    if (!view) build();
    if (view.dialog.parentNode !== root) root.append(view.dialog);
    const wasOpen = Boolean(state);
    state = { docs, index: clamp(index, 0, docs.length - 1), context, onClose };
    if (context.map) view.dialog.style.setProperty("--examine-map", context.map);
    else view.dialog.style.removeProperty("--examine-map");
    buildFilm();
    // The page keeps its scrollbar's room while locked, only when it has a scrollbar.
    const page = document.documentElement;
    if (!wasOpen) page.classList.toggle("has-journey-examine-gutter", window.innerWidth > page.clientWidth);
    page.classList.add("has-journey-examine");
    if (!view.dialog.open) {
      if (typeof view.dialog.showModal === "function") view.dialog.showModal();
      else view.dialog.setAttribute("open", "");
    }
    render(0);
    sound("paper-open");
    if (!wasOpen) {
      animate(
        view.dialog,
        [
          { opacity: 0, scale: 0.965 },
          { opacity: 1, scale: 1 },
        ],
        { duration: 280, easing: EASE }
      );
      view.entrance = animate(
        view.object,
        [
          { opacity: 0, scale: 0.9, translate: "0px 24px" },
          { opacity: 1, scale: 1, translate: "0px 0px" },
        ],
        { duration: 420, easing: EASE }
      );
    }
    view.back.focus({ preventScroll: true });
  };

  // The cutout's silhouette as it lies at rest, on the same grid as the model's mask()
  // (journey-model.js): one byte per step x step CSS pixels of the view, 1 where its alpha is
  // at least one half.
  const posterMask = (step = 2) => {
    const rect = view && view.posterRect();
    if (!rect) return null;
    const { stage } = view;
    const cols = Math.max(1, Math.floor(stage.clientWidth / step));
    const rows = Math.max(1, Math.floor(stage.clientHeight / step));
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const paint = canvas.getContext("2d", { willReadFrequently: true });
    paint.drawImage(
      rect.image,
      (stage.clientWidth / 2 + rect.left) / step,
      (stage.clientHeight / 2 + rect.top) / step,
      rect.width / step,
      rect.height / step
    );
    const rgba = paint.getImageData(0, 0, cols, rows).data;
    const bits = new Uint8Array(cols * rows);
    const shade = new Uint8Array(cols * rows);
    for (let i = 0; i < bits.length; i++) {
      if (rgba[i * 4 + 3] < ALPHA_EDGE) continue;
      bits[i] = 1;
      shade[i] = Math.round(0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]);
    }
    return { cols, rows, step, bits, shade };
  };
  // How well two pictures' shading agrees where both silhouettes are: the correlation of
  // their brightness there (-1 to 1; 0 with nothing to compare).
  const correlation = (a, b) => {
    let n = 0;
    let sa = 0;
    let sb = 0;
    let saa = 0;
    let sbb = 0;
    let sab = 0;
    for (let i = 0; i < a.bits.length; i++) {
      if (!(a.bits[i] && b.bits[i])) continue;
      const x = a.shade[i];
      const y = b.shade[i];
      n++;
      sa += x;
      sb += y;
      saa += x * x;
      sbb += y * y;
      sab += x * y;
    }
    if (n < 2) return 0;
    const spread = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
    return spread ? (sab - (sa * sb) / n) / spread : 0;
  };
  const pack = (mask) => mask && { cols: mask.cols, rows: mask.rows, step: mask.step, bits: Array.from(mask.bits).join("") };
  // For the tests and bin/fit_journey_model_pose.js: the open model (once "See 3D model"
  // has been pressed) against its cutout, in the real viewer. setPose(yaw, pitch) makes a new resting pose (refitted to the cutout as a
  // yml model_yaw/model_pitch would be, and drawn at once); compare(step, { shading }) gives
  // the intersection over union of the two silhouettes as they lie now (and, asked, how well
  // their shading agrees inside both); masks(step) gives both, as strings of 0 and 1, row by
  // row.
  window.__journeyModel = {
    get ready() {
      return Boolean(view && view.viewer);
    },
    pose: () => (view && view.viewer ? view.viewer.pose() : null),
    setPose(yaw, pitch) {
      if (!view || !view.viewer) return null;
      const rest = view.viewer.setRest(yaw, pitch);
      view.modelRest = { ...rest, zoom: 1 };
      view.resetPose({ smooth: false });
      return rest;
    },
    compare(step = 2, { shading = false } = {}) {
      if (!view || !view.viewer) return null;
      const model = view.viewer.mask(step);
      const poster = posterMask(step);
      if (!poster || poster.cols !== model.cols || poster.rows !== model.rows) return null;
      let both = 0;
      let either = 0;
      let inModel = 0;
      let inPoster = 0;
      for (let i = 0; i < model.bits.length; i++) {
        const a = model.bits[i];
        const b = poster.bits[i];
        inModel += a;
        inPoster += b;
        both += a & b;
        either += a | b;
      }
      const result = { iou: either ? both / either : 0, model: inModel, poster: inPoster, both, either, pose: view.viewer.pose() };
      if (shading) result.shading = correlation(model, poster);
      return result;
    },
    masks(step = 2) {
      if (!view || !view.viewer) return null;
      return { model: pack(view.viewer.mask(step)), poster: pack(posterMask(step)) };
    },
  };

  window.JourneyExamine = {
    open,
    close: () => close(),
    get isOpen() {
      return Boolean(state);
    },
  };
})();

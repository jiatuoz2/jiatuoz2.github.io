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

   Only paper turns. An object (kind artifact: a cutout or a photographed object) has no
   model to turn: it lies flat under a soft shadow, with no tilt and no moving light; it
   still zooms (buttons, wheel, pinch) and a drag moves it when zoomed in. Nothing in the
   view starts the browser's own image drag (draggable=false, dragstart cancelled).

   It is a modal <dialog> (role dialog, aria-modal, labelled by the title) placed inside the
   journey section so the board's paper styles apply; Tab stays inside it. Without motion
   preferences everything is instant. Sounds: "paper-open" when it opens and on each switch,
   "paper-close" when it closes (window.JourneySound, optional; only ever after a press). */
(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const touchOnly = matchMedia("(hover: none)");
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
    return {
      kind,
      scan,
      medium,
      kindName: SCAN_NAMES[scan] || (kind === "artifact" && medium === "photo" ? "Object, photographed" : KIND_NAMES[kind]) || kind,
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
    const tools = element("div", "examine-tools", stage);
    const zoomOut = element("button", "examine-tool examine-zoom-out", tools, "−");
    zoomOut.type = "button";
    zoomOut.setAttribute("aria-label", "Zoom out");
    const level = element("span", "examine-zoom-level", tools, "100%");
    level.setAttribute("aria-hidden", "true");
    const zoomIn = element("button", "examine-tool examine-zoom-in", tools, "+");
    zoomIn.type = "button";
    zoomIn.setAttribute("aria-label", "Zoom in");
    const reset = element("button", "examine-tool examine-reset", tools, "Reset");
    reset.type = "button";
    reset.setAttribute("aria-label", "Reset the view");
    const hint = element("p", "examine-hint", stage);
    hint.setAttribute("aria-hidden", "true");

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
    const pose = { x: 0, y: 0, zoom: 1, panX: 0, panY: 0, fit: 1 };
    view.pose = pose;
    const apply = () => {
      // An object has no model to turn: it lies flat, square to the view.
      const rigid = Boolean(view.rigid);
      const rx = rigid ? 0 : clamp(BASE.x + pose.x, -TURN_LIMIT, TURN_LIMIT);
      const ry = rigid ? 0 : clamp(BASE.y + pose.y, -TURN_LIMIT, TURN_LIMIT);
      const rz = rigid ? 0 : BASE.z;
      // Centred on the stage (the object is positioned at its middle), then panned, turned, scaled.
      object.style.transform = `translate(-50%, -50%) translate(${round(pose.panX)}px, ${round(pose.panY)}px) rotateX(${round(rx)}deg) rotateY(${round(ry)}deg) rotateZ(${rz}deg) scale(${round(pose.fit * pose.zoom)})`;
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
      if (rigid) {
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
      if (smooth && !reducedMotion.matches) {
        object.classList.add("is-settling");
        setTimeout(() => object.classList.remove("is-settling"), 380);
      }
      apply();
    };
    view.resetPose = resetPose;
    // The thing is scaled to fill most of the stage, small ones a little enlarged.
    const fit = () => {
      const thing = object.firstElementChild;
      if (!thing) return;
      const w = thing.offsetWidth;
      const h = thing.offsetHeight;
      if (!w || !h || !stage.clientWidth || !stage.clientHeight) return;
      pose.fit = Math.min(1.7, (stage.clientWidth * 0.8) / w, (stage.clientHeight * 0.8) / h);
      clampPan();
      apply();
    };
    view.fit = fit;
    if (typeof ResizeObserver === "function") new ResizeObserver(() => state && fit()).observe(stage);
    else window.addEventListener("resize", () => state && fit());

    zoomIn.addEventListener("click", () => setZoom(pose.zoom * 1.25));
    zoomOut.addEventListener("click", () => setZoom(pose.zoom / 1.25));
    reset.addEventListener("click", () => resetPose());
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
      gesture = {
        mode: pose.zoom > 1.001 ? "pan" : view.rigid ? "still" : "turn",
        id: event.pointerId,
        type: event.pointerType,
        x0: event.clientX,
        y0: event.clientY,
        t0: performance.now(),
        start: { ...pose },
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
  const render = (direction = 0) => {
    // Focus on a control about to hide or be replaced (the reveal button, a link) moves to
    // this item's thumbnail in the filmstrip, so the keys keep working.
    const lost = [view.reveal, view.links].some((control) => control.contains(document.activeElement));
    const doc = state.docs[state.index];
    const info = read(doc);
    const { context } = state;
    fill(view.kicker, [context.caseNo && `Case file № ${context.caseNo}`, context.short || context.place, info.kindName].filter(Boolean).join(" · "));
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
      animate(
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
      animate(
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

  window.JourneyExamine = {
    open,
    close: () => close(),
    get isOpen() {
      return Boolean(state);
    },
  };
})();

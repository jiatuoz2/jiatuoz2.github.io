/* "My Journey" controller: turns the timeline strip into tabs for the boards, runs the
   split view under it (the Map pane on the left, the Board pane on the right, both always
   on screen), and keeps the map (journey-map.js) and the boards (journey-board.js) in step.

   The split view: the panes keep fixed shares of the row, the map about 34% and the board
   about 66% (the CSS flex-grow values), and one shared height: the board's own, at its
   pane's width. A click, a tap, focus or a pin never changes either size. The board is laid
   out at its pane's width before it is mounted; while the window is being resized it is
   only scaled to its pane (a CSS transform) and laid out again once the width settles. A
   narrow section (under 620 px: a phone) stacks the panes, the map on top at a fixed height
   and the board under it at full width (root data-layout="split" | "stack").

   The map window: "Expand map" opens the same live map in a modal window (a <dialog>,
   aria-modal, labelled "Map"): the map's figure moves into it and back, so there is one
   WebGL context. "Close map", Escape or a click on the dimmed page closes it; focus is kept
   inside while it is open and returns to "Expand map".

   Without JavaScript the timeline stays in-page links, every board is shown in order and the
   Map pane stays hidden; without WebGL (or if the map library fails) the same happens with
   the tabs working.
   A tab chosen by the visitor clicks softly (window.JourneySound, optional); a tab chosen
   on load, from the address or on the map does not. The map window opens with a zoom and
   closes with a click. */
(() => {
  const root = document.querySelector("[data-journey]");
  if (!root) return;
  const list = root.querySelector(".journey-stops");
  // The strip around the tabs: the place to scroll back to when the board changes.
  const timeline = root.querySelector(".journey-timeline");
  const tabs = [...root.querySelectorAll("a.journey-stop[data-stop]")];
  const boards = new Map([...root.querySelectorAll("section.journey-board[data-stop]")].map((board) => [board.dataset.stop, board]));
  if (!list || !tabs.length || !boards.size) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const sound = (name) => {
    try {
      if (window.JourneySound) window.JourneySound.play(name);
    } catch (error) {
      // Sound is a nicety: never let it break the tabs.
    }
  };

  let stops = [];
  try {
    stops = JSON.parse(root.querySelector("script[data-journey-stops]")?.textContent || "[]");
  } catch (error) {
    stops = [];
  }
  if (!Array.isArray(stops)) stops = [];
  const ids = tabs.map((tab) => tab.dataset.stop).filter((id) => boards.has(id));
  const fromHash = (hash) => {
    const match = /^#journey-(.+)$/.exec(hash || "");
    const id = match ? decodeURIComponent(match[1]) : null;
    return ids.includes(id) ? id : null;
  };
  const currentId = stops.find((stop) => stop && stop.current)?.id;

  // Tabs: the list is the tablist, each link a tab, each board its panel.
  list.setAttribute("role", "tablist");
  for (const item of list.children) item.setAttribute("role", "presentation");
  for (const tab of tabs) {
    const board = boards.get(tab.dataset.stop);
    if (!board) continue;
    if (!tab.id) tab.id = `journey-tab-${tab.dataset.stop}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", board.id);
    board.setAttribute("role", "tabpanel");
    // Panels without their own links still need a keyboard stop.
    if (!board.querySelector("a[href], button, [tabindex]")) board.tabIndex = 0;
  }
  const tabFor = (id) => tabs.find((tab) => tab.dataset.stop === id);

  // Initial selection: a #journey-<id> link, else where I am now, else the latest place.
  // Only that board stays shown, so the others are laid out when first opened, not now.
  const hashId = fromHash(location.hash);
  const initial = hashId || (ids.includes(currentId) ? currentId : ids[ids.length - 1]);
  for (const [id, board] of boards) board.hidden = id !== initial;

  const stopById = new Map(stops.filter((stop) => stop && stop.id).map((stop) => [stop.id, stop]));
  const instances = new Map();

  let selected = null;
  let globe = null;
  // Whether the map window is open (the page behind it is not scrolled then).
  let windowOpen = false;
  let stopWaiting = null;
  const split = root.querySelector("[data-journey-split]");
  const panes = {
    map: root.querySelector('[data-journey-pane="map"]'),
    board: root.querySelector('[data-journey-pane="board"]'),
  };
  const bodies = {
    map: panes.map?.querySelector(".journey-pane-body") || null,
    board: panes.board?.querySelector(".journey-pane-body") || null,
  };
  const boardsHost = root.querySelector("[data-journey-boards]");
  const figure = root.querySelector("figure[data-journey-map]") || root.querySelector("figure[data-journey-globe]");
  const status = root.querySelector("[data-journey-status]");

  // Keeps the chosen tab inside the strip when the strip scrolls sideways (narrow screens).
  const keepInStrip = (tab) => {
    if (!tab || list.scrollWidth <= list.clientWidth + 1) return;
    const strip = list.getBoundingClientRect();
    const item = (tab.closest("li") || tab).getBoundingClientRect();
    const pad = 12;
    let delta = 0;
    if (item.left < strip.left + pad) delta = item.left - strip.left - pad;
    else if (item.right > strip.right - pad) delta = item.right - strip.right + pad;
    if (!delta) return;
    if (typeof list.scrollBy === "function") list.scrollBy({ left: delta, behavior: reducedMotion.matches ? "auto" : "smooth" });
    else list.scrollLeft += delta;
  };
  // overview keeps the globe on the whole route (first load); otherwise it flies to the place.
  const select = (id, { focus = false, animate = true, reveal = false, fromGlobe = false, overview = false } = {}) => {
    if (!boards.has(id)) return;
    const changed = id !== selected;
    if (changed && stopWaiting) stopWaiting();
    selected = id;
    for (const tab of tabs) {
      const on = tab.dataset.stop === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const [boardId, board] of boards) board.hidden = boardId !== id;
    if (focus) tabFor(id)?.focus();
    keepInStrip(tabFor(id));
    // A pin chosen on the globe changes the board out of sight of a screen reader.
    if (fromGlobe && changed && status) {
      const stop = stopById.get(id);
      status.textContent = `Showing ${stop?.name || tabFor(id)?.textContent.trim() || id}${stop?.period ? `, ${stop.period}` : ""}`;
    }
    if (changed) {
      const instance = instances.get(id);
      if (animate) instance?.show();
      else instance?.layout();
    }
    // Choosing the selected place again still flies there from the overview.
    if (!fromGlobe && globe && (changed || !overview)) {
      try {
        globe.select(id, { animate, overview });
      } catch (error) {
        console.warn("Journey globe could not select", error);
      }
    }
    // Bring the timeline and the panes under it back into view if the strip starts above
    // the window or under the sticky masthead (e.g. after a long board was swapped for a
    // short one on a phone). scroll-margin-top is the masthead's clearance.
    // Not while the map window is open over the page: it stays where the visitor left it.
    const anchor = timeline || boards.get(id);
    const clearance = parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0;
    if (!windowOpen && (reveal || (changed && animate && anchor.getBoundingClientRect().top < clearance - 1))) {
      anchor.scrollIntoView({ block: "start", behavior: reducedMotion.matches || !animate ? "auto" : "smooth" });
    }
  };

  /* ---------- the split view ---------- */
  // Narrower than this (the section, not the window), the panes stack: a phone.
  const SPLIT_MIN = 620;
  // How long the section's width must stay still before the board is laid out again at its
  // pane's new width; until then it is only scaled to fit.
  const RELAYOUT_DELAY = 280;
  let splitOn = false;
  let layoutMode = "";
  // The width the board is laid out at (its pane's width) and the height both panes share.
  let designWidth = 0;
  let paneHeight = 0;
  let resizeObserver = null;
  let fitFrame = 0;
  let globeFrame = 0;
  let relayoutTimer = 0;
  const bars = [...root.querySelectorAll(".journey-pane-bar")];

  const callGlobe = (method, ...args) => {
    try {
      if (globe && typeof globe[method] === "function") globe[method](...args);
    } catch (error) {
      console.warn("Journey globe could not " + method, error);
    }
  };
  // Fit the map's canvas to its box, at most once a frame.
  const resizeGlobe = () => {
    if (globeFrame) return;
    globeFrame = requestAnimationFrame(() => {
      globeFrame = 0;
      callGlobe("resize");
    });
  };
  const clearRelayout = () => {
    clearTimeout(relayoutTimer);
    relayoutTimer = 0;
  };

  // Works out the layout for the section's width: split or stacked; split, the board's width
  // (its pane's, which never changes on a click) and the height both panes share. While the
  // width is changing (the window being resized) the board keeps its layout and is scaled
  // to its pane (one transform); once the width settles it is laid out again at the new one.
  const fit = ({ relayout = false } = {}) => {
    fitFrame = 0;
    if (!splitOn || !split || !boardsHost || !bodies.board) return;
    const width = split.clientWidth;
    if (!width) return;
    const mode = width >= SPLIT_MIN ? "split" : "stack";
    if (mode !== layoutMode) {
      layoutMode = mode;
      root.dataset.layout = mode;
      relayout = true;
    }
    if (mode === "split") {
      const room = Math.floor(bodies.board.getBoundingClientRect().width);
      if (!room) return;
      if (relayout || !designWidth) {
        clearRelayout();
        if (room !== designWidth) {
          designWidth = room;
          boardsHost.style.width = `${room}px`;
        }
      } else if (room !== designWidth) {
        clearRelayout();
        relayoutTimer = setTimeout(() => {
          relayoutTimer = 0;
          fit({ relayout: true });
        }, RELAYOUT_DELAY);
      }
      const scale = room / designWidth;
      const height = boardsHost.offsetHeight * scale;
      if (height && Math.abs(height - paneHeight) > 0.5) {
        paneHeight = height;
        split.style.setProperty("--journey-pane-h", `${height.toFixed(2)}px`);
      }
      boardsHost.style.transform = Math.abs(scale - 1) < 0.001 ? "" : `scale(${scale.toFixed(4)})`;
    } else {
      clearRelayout();
      designWidth = 0;
      paneHeight = 0;
      boardsHost.style.width = "";
      boardsHost.style.transform = "";
      split.style.removeProperty("--journey-pane-h");
    }
    resizeGlobe();
  };
  const scheduleFit = () => {
    if (!fitFrame) fitFrame = requestAnimationFrame(() => fit());
  };

  /* ---------- the map window ----------
     "Expand map" opens the same live map in a modal window (a <dialog> inside the Map pane,
     styled in _journey-map.scss): its figure moves into the window's body and back, so there
     is only ever one WebGL context; the camera stays where it was (a whole-globe view is
     refitted to the bigger frame). "Close map", Escape or a click on the dimmed page closes
     it and focus returns to "Expand map". A pin chosen in it selects its place behind it, as
     in the pane, and the window stays open. */
  const mapWindow = root.querySelector("[data-journey-map-window]");
  const windowBody = mapWindow?.querySelector("[data-journey-map-window-body]") || null;
  const openButton = root.querySelector("[data-journey-map-open]");
  const closeButton = mapWindow?.querySelector("[data-journey-map-close]") || null;
  const away = root.querySelector("[data-journey-map-away]");
  let windowClosing = false;
  let figureHome = null;
  let refitFrame = 0;
  const WINDOW_EASE = "cubic-bezier(0.2, 0.75, 0.25, 1)";
  const animateWindow = (frames, options) =>
    !reducedMotion.matches && mapWindow && typeof mapWindow.animate === "function" ? mapWindow.animate(frames, options) : null;

  // Fits the moved canvas to its new box over a few frames, each resize asking for a repaint.
  // (Playwright's WebKit build for the iPhone can still show a blank canvas after a change of
  // size while MapLibre keeps drawing: a fault of that test browser, not of the page.)
  const refitGlobe = (frames = 6) => {
    if (refitFrame) cancelAnimationFrame(refitFrame);
    let left = frames;
    const step = () => {
      refitFrame = 0;
      callGlobe("resize");
      if (--left > 0) refitFrame = requestAnimationFrame(step);
    };
    refitFrame = requestAnimationFrame(step);
  };

  // The page stays put behind the window; it keeps its scrollbar's room only if it had one.
  const lockPage = (on) => {
    const page = document.documentElement;
    if (on) {
      page.classList.toggle("has-journey-map-window-gutter", window.innerWidth > page.clientWidth);
      page.classList.add("has-journey-map-window");
    } else page.classList.remove("has-journey-map-window", "has-journey-map-window-gutter");
  };

  const restoreFigure = () => {
    if (!figureHome || !figure) return;
    const { parent, next } = figureHome;
    figureHome = null;
    if (next && next.parentNode === parent) parent.insertBefore(figure, next);
    else parent.append(figure);
    if (away) away.hidden = true;
    callGlobe("setWindowed", false);
    refitGlobe();
  };

  const finishMapClose = ({ restoreFocus = true } = {}) => {
    if (!windowClosing) return;
    windowClosing = false;
    mapWindow.getAnimations?.().forEach((animation) => animation.cancel());
    mapWindow.classList.remove("is-closing");
    if (mapWindow.open && typeof mapWindow.close === "function") mapWindow.close();
    else mapWindow.removeAttribute("open");
    lockPage(false);
    restoreFigure();
    if (restoreFocus && openButton && !openButton.closest("[hidden]")) openButton.focus({ preventScroll: true });
  };

  const closeMapWindow = ({ instant = false, restoreFocus = true } = {}) => {
    if (!windowOpen || !mapWindow) return;
    windowOpen = false;
    windowClosing = true;
    openButton?.setAttribute("aria-expanded", "false");
    if (!instant) sound("click");
    const fade =
      !instant &&
      animateWindow(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.97)" },
        ],
        { duration: 200, easing: "ease-in", fill: "forwards" }
      );
    if (!fade) {
      finishMapClose({ restoreFocus });
      return;
    }
    mapWindow.classList.add("is-closing");
    const done = () => finishMapClose({ restoreFocus });
    fade.finished.then(done, done);
  };

  const openMapWindow = () => {
    if (!splitOn || !figure || !mapWindow || !windowBody || windowOpen) return;
    if (windowClosing) finishMapClose({ restoreFocus: false });
    windowOpen = true;
    figureHome = { parent: figure.parentNode, next: figure.nextSibling };
    lockPage(true);
    if (!mapWindow.open) {
      try {
        if (typeof mapWindow.showModal === "function") mapWindow.showModal();
        else mapWindow.setAttribute("open", "");
      } catch (error) {
        mapWindow.setAttribute("open", "");
      }
    }
    windowBody.append(figure);
    if (away) away.hidden = false;
    callGlobe("setWindowed", true);
    // Opened before the map came near enough to load: load it now.
    callGlobe("load");
    refitGlobe();
    openButton?.setAttribute("aria-expanded", "true");
    sound("zoom");
    animateWindow(
      [
        { opacity: 0, transform: "scale(0.96)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 250, easing: WINDOW_EASE }
    );
    closeButton?.focus({ preventScroll: true });
  };

  if (mapWindow && windowBody && openButton) {
    openButton.setAttribute("aria-expanded", "false");
    openButton.addEventListener("click", (event) => {
      event.preventDefault();
      openMapWindow();
    });
    closeButton?.addEventListener("click", () => closeMapWindow());
    // Escape: the dialog's own cancel is turned into the animated close.
    mapWindow.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeMapWindow();
    });
    // Closed some other way (a browser that will not let cancel be refused twice): tidy up.
    mapWindow.addEventListener("close", () => {
      if (mapWindow.open) return;
      if (windowOpen) {
        windowOpen = false;
        windowClosing = true;
        openButton.setAttribute("aria-expanded", "false");
      }
      finishMapClose();
    });
    // A click on the dimmed page around the window (the dialog's ::backdrop) closes it; a
    // drag on the map that ends out there does not.
    let downOutside = false;
    const outside = (event) => {
      if (event.target !== mapWindow) return false;
      const box = mapWindow.getBoundingClientRect();
      return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    mapWindow.addEventListener("pointerdown", (event) => {
      downOutside = outside(event);
    });
    mapWindow.addEventListener("click", (event) => {
      const wasOutside = downOutside;
      downOutside = false;
      if (wasOutside && outside(event)) closeMapWindow();
    });
    mapWindow.addEventListener("keydown", (event) => {
      if (!windowOpen) return;
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        event.stopPropagation();
        closeMapWindow();
        return;
      }
      if (event.key !== "Tab") return;
      // Focus stays in the window until it is closed.
      // (MapLibre's attribution toggle is a <summary>.)
      const stops = [...mapWindow.querySelectorAll("a[href], button:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")].filter(
        (node) => node.getClientRects().length > 0 && !node.closest("[hidden]") && getComputedStyle(node).visibility !== "hidden"
      );
      if (!stops.length) return;
      const active = document.activeElement;
      let index = stops.indexOf(active);
      if (index === -1 && active && mapWindow.contains(active)) {
        // Something the list does not know (a control the map added): its place in the
        // document decides where Tab goes next, so the order never jumps back to the start.
        const after = stops.findIndex((node) => active.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!event.shiftKey) {
          if (after === -1) {
            event.preventDefault();
            stops[0].focus();
          }
          return;
        }
        if (after === 0) {
          event.preventDefault();
          stops[stops.length - 1].focus();
        }
        return;
      }
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        stops[stops.length - 1].focus();
      } else if (!event.shiftKey && (index === stops.length - 1 || index === -1)) {
        event.preventDefault();
        stops[0].focus();
      }
    });
    // The page behind never scrolls or zooms: outside the map itself (its bar, the dimmed
    // page) a wheel, a touch drag or a pinch does nothing; over the map the map takes it.
    const guard = (event) => {
      if ((!windowOpen && !windowClosing) || (figure && figure.contains(event.target))) return;
      event.preventDefault();
    };
    for (const type of ["wheel", "touchmove", "gesturestart", "gesturechange"]) mapWindow.addEventListener(type, guard, { passive: false });
  }

  const enableSplit = () => {
    if (splitOn || !split || !boardsHost || !panes.map || !panes.board || !bodies.map || !bodies.board) return;
    splitOn = true;
    panes.map.hidden = false;
    for (const bar of bars) bar.hidden = false;
    fit({ relayout: true });
    if (typeof ResizeObserver === "function") {
      // The section's width (layout), the board's height (the shared height) and the map's
      // box, in its pane or its window (the canvas).
      resizeObserver = new ResizeObserver((entries) => {
        let refit = false;
        for (const entry of entries) {
          if (entry.target === split || entry.target === boardsHost) refit = true;
          // The canvas is sized in pixels by MapLibre, so it is resized in this same frame
          // and never shows stretched.
          else if (entry.target === bodies.map || entry.target === windowBody) callGlobe("resize");
        }
        // Sizes change in the next frame, not inside the observer's own delivery.
        if (refit) scheduleFit();
      });
      for (const target of [split, boardsHost, bodies.map, windowBody]) if (target) resizeObserver.observe(target);
    } else window.addEventListener("resize", scheduleFit);
  };
  // No globe after all (no WebGL, or the library failed): the board alone, at full width.
  const disableSplit = () => {
    if (!splitOn) {
      if (panes.map) panes.map.hidden = true;
      return;
    }
    if (windowOpen || windowClosing) {
      closeMapWindow({ instant: true, restoreFocus: false });
      finishMapClose({ restoreFocus: false });
    }
    splitOn = false;
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener("resize", scheduleFit);
    if (fitFrame) cancelAnimationFrame(fitFrame);
    fitFrame = 0;
    clearRelayout();
    panes.map.hidden = true;
    for (const bar of bars) bar.hidden = true;
    delete root.dataset.layout;
    layoutMode = "";
    designWidth = 0;
    paneHeight = 0;
    boardsHost.style.width = "";
    boardsHost.style.transform = "";
    split.style.removeProperty("--journey-pane-h");
    // A focused element left in the hidden pane would strand the keyboard.
    if (panes.map.contains(document.activeElement)) tabFor(selected)?.focus({ preventScroll: true });
  };

  // Map: optional (journey-map.js; the older journey-globe.js as a fallback). A pin chosen on
  // the map selects its board without moving focus; neither pane changes size.
  const pickedOnGlobe = (id) => select(id, { fromGlobe: true });
  const globeApi = [window.JourneyMap, window.JourneyGlobe].find((api) => api && typeof api.mount === "function");
  if (figure && globeApi && stops.length) {
    try {
      globe =
        globeApi.mount(figure, stops, {
          onSelect: pickedOnGlobe,
          onFail: disableSplit,
          // Load the library and tiles as the section approaches.
          loadNear: root,
        }) || null;
    } catch (error) {
      globe = null;
      console.warn("Journey globe unavailable", error);
    }
  }
  // The split comes on only with a globe to show; the board is given its width before it is
  // mounted, so it is laid out once.
  if (globe) enableSplit();
  else disableSplit();

  // Boards: mount each one; a failure leaves the plain board in place.
  const boardApi = window.JourneyBoard;
  if (boardApi && typeof boardApi.mount === "function") {
    for (const [id, board] of boards) {
      try {
        const instance = boardApi.mount(board, stopById.get(id));
        if (instance) instances.set(id, instance);
      } catch (error) {
        console.warn("Journey board unavailable", error);
      }
    }
  }
  // The mounted board is shorter than the plain list was: measure the shared height again.
  if (splitOn) fit();

  if (splitOn) {
    // The board pane never scrolls under its clipped edge (a focused paper near its far side
    // would otherwise pull it along).
    bodies.board.addEventListener("scroll", () => {
      bodies.board.scrollTop = 0;
      bodies.board.scrollLeft = 0;
    });
    // Night and day change the board's paper, not its size; fonts arriving may change it.
    document.fonts?.ready.then(scheduleFit);
  }

  // Click, Enter and Space activate; arrows, Home and End move focus (roving tabindex).
  // Captured on the list so the theme's jQuery smooth scroll, bound to every link, never
  // sees a tab click: it would animate toward where the board was before it was shown.
  list.addEventListener(
    "click",
    (event) => {
      const tab = event.target.closest("a.journey-stop[data-stop]");
      if (!tab || !boards.has(tab.dataset.stop)) return;
      event.preventDefault();
      event.stopPropagation();
      sound("tab");
      select(tab.dataset.stop, { focus: true });
    },
    true
  );
  list.addEventListener("keydown", (event) => {
    const tab = event.target.closest("a.journey-stop[data-stop]");
    if (!tab || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = tabs.indexOf(tab);
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = tabs[(index + 1) % tabs.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    else if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      sound("tab");
      select(tab.dataset.stop, { focus: true });
      return;
    }
    if (!next) return;
    event.preventDefault();
    for (const other of tabs) other.tabIndex = other === next ? 0 : -1;
    next.focus();
  });
  // A place about to be chosen (its tab hovered or focused) starts loading its board's
  // pictures, so its photos and scans are there when the board appears, not blank.
  const warmed = new WeakSet();
  const warm = (event) => {
    const board = boards.get(event.target.closest?.("a.journey-stop[data-stop]")?.dataset.stop);
    if (!board || warmed.has(board)) return;
    warmed.add(board);
    for (const image of board.querySelectorAll('img[loading="lazy"]')) image.loading = "eager";
  };
  list.addEventListener("pointerover", warm);
  list.addEventListener("focusin", warm);
  // Leaving the list returns the tab stop to the selected tab.
  list.addEventListener("focusout", (event) => {
    if (list.contains(event.relatedTarget)) return;
    for (const tab of tabs) tab.tabIndex = tab.dataset.stop === selected ? 0 : -1;
  });

  window.addEventListener("hashchange", () => {
    const id = fromHash(location.hash);
    if (id) select(id, { reveal: true });
  });

  // Links to a board (#journey-<id>, the board's "Next stop?" note) use native fragment
  // navigation, which opens that board (hashchange, above) and moves the keyboard's starting
  // point. The masthead's Journey item (#journey) keeps the theme's smooth scroll, like every
  // other item in the masthead, landing the heading at the same place under it.
  const jq = window.jQuery;
  if (typeof jq === "function") {
    jq(() => jq('a[href*="#journey-"], a[href$="#phd-applications"]').off("click.smoothscroll"));
  }

  // Nothing in the section starts the browser's own drag of a picture (its file's ghost):
  // the papers, prints, scans and objects are handled, never dragged off as files.
  root.addEventListener("dragstart", (event) => event.preventDefault());

  // The globe opens on the whole route with the initial place marked.
  select(initial, { animate: false, reveal: Boolean(hashId), overview: true });

  // The first board pins itself in when it scrolls into view.
  const first = instances.get(initial);
  if (first && !hashId && !reducedMotion.matches && typeof IntersectionObserver === "function") {
    const surface = boards.get(initial).querySelector(".board-surface");
    if (surface && surface.getBoundingClientRect().top > innerHeight) {
      first.arm?.();
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          stopWaiting();
          first.show();
        },
        { rootMargin: "0px 0px -18% 0px" }
      );
      observer.observe(surface);
      // Leaving the first board before it was seen just drops the pending entrance.
      stopWaiting = () => {
        stopWaiting = null;
        observer.disconnect();
        first.disarm?.();
      };
    }
  }
})();

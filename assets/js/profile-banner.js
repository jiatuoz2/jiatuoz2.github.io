(() => {
  const banner = document.querySelector("[data-profile-banner]");
  if (!banner || !window.BannerCloth || !window.BannerClothRenderer || !window.ScrollSpool) return;
  const cloth = banner.querySelector("[data-banner-cloth]");
  const canvas = banner.querySelector("[data-cloth-canvas]");
  const content = banner.querySelector(".banner-fabric");
  const viewport = banner.querySelector("[data-scroll-viewport]");
  const grip = banner.querySelector("[data-scroll-grip]");
  const avatar = content.querySelector(".author__avatar img");
  const links = [...content.querySelectorAll("a")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mouseInput = matchMedia("(hover: hover) and (pointer: fine)");
  const renderer = new window.BannerClothRenderer(canvas);
  const print = document.createElement("canvas");
  const context = print.getContext("2d");
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, time: 0 };
  let simulation;
  let linkLayout = [];
  let frame = null;
  let timer = null;
  let resizeFrame = null;
  let lastTime = 0;
  let gustStart = null;
  let visible = true;
  let keyboardFocus = false;
  let keyboardInput = false;
  let hoveredLink = null;
  let ready = false;
  let settleAge = 0;
  let rollProgress = 0;
  let rollTarget = 0;
  let rollFrame = null;
  let spool;
  let rollTime = 0;
  const canAnimate = () =>
    ready && visible && !document.hidden && !keyboardFocus && !reducedMotion.matches && rollProgress === 0 && rollFrame === null;
  const state = (value) => {
    banner.dataset.bannerState = rollFrame !== null ? "rolling" : rollProgress === 1 ? "rolled" : value;
  };
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

  function buildPrint() {
    // Capture the site's actual typography/layout into a high-resolution texture.
    // Native anchors remain in the DOM for keyboard, screen readers and clicks.
    const bounds = cloth.getBoundingClientRect();
    const ratio = Math.min(3, Math.max(2, devicePixelRatio));
    print.width = Math.ceil(bounds.width * ratio);
    print.height = Math.ceil(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // The pointed hem is transparent material, so the silhouette follows the
    // simulated cloth instead of being clipped by a stationary screen mask.
    context.save();
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(bounds.width, 0);
    context.lineTo(bounds.width, bounds.height * 0.91);
    context.lineTo(bounds.width * 0.5, bounds.height);
    context.lineTo(0, bounds.height * 0.91);
    context.closePath();
    context.clip();
    const fabric = context.createLinearGradient(0, 0, bounds.width, 0);
    fabric.addColorStop(0, "#e8e5dd");
    fabric.addColorStop(0.22, "#f5f2e9");
    fabric.addColorStop(0.6, "#ede9e0");
    fabric.addColorStop(0.85, "#f3efe5");
    fabric.addColorStop(1, "#e7e3da");
    context.fillStyle = fabric;
    context.fillRect(0, 0, bounds.width, bounds.height);
    // Muted gold edging and a sewn top sleeve, lit with the same fabric mesh.
    context.fillStyle = "#c2a46a18";
    context.fillRect(0, 0, bounds.width, 17);
    for (const [x, top, shoulder, point, alpha] of [[0.04, 0.02, 0.9, 0.98, 0.5]]) {
      context.strokeStyle = `rgba(189, 158, 100, ${alpha})`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(bounds.width * x, bounds.height * top);
      context.lineTo(bounds.width * (1 - x), bounds.height * top);
      context.lineTo(bounds.width * (1 - x), bounds.height * shoulder);
      context.lineTo(bounds.width * 0.5, bounds.height * point);
      context.lineTo(bounds.width * x, bounds.height * shoulder);
      context.closePath();
      context.stroke();
    }
    context.strokeStyle = "#ceb98a50";
    context.lineWidth = 0.5;
    context.setLineDash([1.5, 2]);
    context.beginPath();
    context.moveTo(7, 16);
    context.lineTo(bounds.width - 7, 16);
    context.stroke();
    context.setLineDash([]);
    const photo = avatar.getBoundingClientRect();
    context.save();
    context.beginPath();
    context.roundRect(photo.x - bounds.x, photo.y - bounds.y, photo.width, photo.height, 3);
    context.clip();
    context.globalAlpha = 0.96;
    const photoScale = Math.max(photo.width / avatar.naturalWidth, photo.height / avatar.naturalHeight);
    const cropWidth = photo.width / photoScale;
    const cropHeight = photo.height / photoScale;
    context.drawImage(
      avatar,
      (avatar.naturalWidth - cropWidth) / 2,
      (avatar.naturalHeight - cropHeight) / 2,
      cropWidth,
      cropHeight,
      photo.x - bounds.x,
      photo.y - bounds.y,
      photo.width,
      photo.height
    );
    context.restore();
    context.strokeStyle = "#bfa46380";
    context.lineWidth = 1;
    context.stroke();
    const rule = content.querySelector(".banner-links").getBoundingClientRect();
    context.fillStyle = "#c2a46a50";
    context.fillRect(rule.x - bounds.x, rule.y - bounds.y, rule.width, 0.5);
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node;
    context.textBaseline = "middle";
    context.textAlign = "left";
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const style = getComputedStyle(node.parentElement);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if ("letterSpacing" in context) context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
      context.fillStyle = style.color;
      context.globalAlpha = node.parentElement.classList.contains("banner-monogram") ? 0.7 : 1;
      let line = null;
      const drawLine = () => {
        if (line) context.fillText(line.text, line.x - bounds.x, line.y - bounds.y + line.height / 2 + 0.5);
      };
      for (let i = 0; i < node.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (!line || Math.abs(line.y - rect.y) > 2) {
          drawLine();
          line = { x: rect.x, y: rect.y, height: rect.height, text: "" };
        }
        line.text += style.textTransform === "uppercase" ? node.textContent[i].toUpperCase() : node.textContent[i];
      }
      drawLine();
    }
    context.globalAlpha = 1;
    if ("letterSpacing" in context) context.letterSpacing = "0px";
    for (const icon of content.querySelectorAll("i")) {
      const style = getComputedStyle(icon, "::before");
      const value = style.content.replace(/^["']|["']$/g, "");
      if (!value || value === "none") continue;
      const boundsIcon = icon.getBoundingClientRect();
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.fillStyle = getComputedStyle(icon).color;
      context.textAlign = "center";
      context.fillText(value, boundsIcon.x - bounds.x + boundsIcon.width / 2, boundsIcon.y - bounds.y + boundsIcon.height / 2 + 1);
    }
    context.textAlign = "left";
    if (hoveredLink) {
      const box = linkLayout.find((entry) => entry.link === hoveredLink);
      if (box) {
        context.strokeStyle = "#224b8d80";
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(box.x + 23, box.y + box.height - 4);
        context.lineTo(box.x + box.width - 10, box.y + box.height - 4);
        context.stroke();
      }
    }
    context.restore();
    renderer.setTexture(print);
  }

  function render() {
    if (!simulation) return;
    renderer.render(simulation);
    banner.dataset.clothRenderer = renderer.software ? "canvas" : "webgl";
    // Move the native click targets with the printed cloth, without replacing links.
    for (const box of linkLayout) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const projected = renderer.project(simulation, x, y);
      box.link.style.transform = `translate(${(projected[0] - x).toFixed(2)}px, ${(projected[1] - y).toFixed(2)}px)`;
    }
    let depth = 0;
    for (let i = 2; i < simulation.positions.length; i += 3) depth = Math.max(depth, Math.abs(simulation.positions[i] - simulation.rest[i]));
    banner.dataset.clothDepth = depth.toFixed(2);
  }

  function paintRoll() {
    renderer.setRoll(rollProgress, { sway: spool?.sway || 0 });
    viewport.style.height = `${Math.ceil(renderer.hem - renderer.cut + renderer.radius + 24)}px`;
    banner.dataset.scrollProgress = rollProgress.toFixed(3);
    render();
  }
  function finishRoll() {
    if (rollFrame !== null) cancelAnimationFrame(rollFrame);
    rollFrame = null;
    spool.snap();
    banner.dataset.scrollVelocity = "0.00";
    rollProgress = rollTarget;
    paintRoll();
    banner.dataset.bannerScroll = rollProgress === 1 ? "rolled" : "expanded";
    content.inert = rollProgress === 1;
    if (rollProgress === 1) content.setAttribute("aria-hidden", "true");
    else content.removeAttribute("aria-hidden");
    if (canAnimate()) {
      settleAge = 0;
      state("settling");
      wake();
    } else state("paused");
    // Let the template's sticky sidebar use the new, smaller scroll height.
    window.dispatchEvent(new Event("resize"));
  }
  function animateRoll(time) {
    rollFrame = null;
    const dt = rollTime ? Math.min((time - rollTime) / 1000, 1 / 30) : 1 / 60;
    rollTime = time;
    const settled = spool.step(dt);
    rollProgress = spool.progress;
    // The hanging material stays live: spool acceleration sends a small tension
    // ripple through it instead of snapping the cloth to a flat rest pose.
    simulation.step(dt, time / 1000, 0, pointer, {
      cut: 12 + spool.wound,
      acceleration: spool.feedAcceleration,
      velocity: spool.feedVelocity,
    });
    paintRoll();
    banner.dataset.scrollVelocity = spool.feedVelocity.toFixed(2);
    if (settled) finishRoll();
    else {
      rollFrame = requestAnimationFrame(animateRoll);
      state("rolling");
    }
  }
  function startRoll() {
    if (!ready) return;
    stop();
    if (rollFrame !== null) cancelAnimationFrame(rollFrame);
    gustStart = null;
    pointer.active = false;
    hoveredLink = null;
    keyboardFocus = false;
    banner.classList.add("cloth-rendered");
    links.forEach((link) => link.style.removeProperty("transform"));
    buildPrint();
    spool.toggle();
    rollTarget = spool.target;
    rollTime = 0;
    content.inert = true;
    content.setAttribute("aria-hidden", "true");
    grip.setAttribute("aria-expanded", String(rollTarget === 0));
    grip.setAttribute("aria-label", rollTarget === 1 ? "Unroll profile scroll" : "Roll up profile scroll");
    grip.title = rollTarget === 1 ? "Click the scroll to unroll" : "Click the fabric to roll up";
    banner.dataset.bannerScroll = rollTarget === 1 ? "rolling-up" : "unrolling";
    if (reducedMotion.matches || document.hidden) finishRoll();
    else {
      rollFrame = requestAnimationFrame(animateRoll);
      state("rolling");
    }
  }
  banner.addEventListener("click", (event) => {
    if (event.target.closest("a") || getSelection()?.isCollapsed === false) return;
    if (event.target.closest("[data-scroll-grip]") || viewport.contains(event.target)) startRoll();
  });
  grip.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    startRoll();
  });

  function resize() {
    stop();
    links.forEach((link) => link.style.removeProperty("transform"));
    const width = cloth.offsetWidth;
    const height = cloth.offsetHeight;
    if (!width || !height) return;
    simulation = new window.BannerCloth(width, height, renderer.software ? 17 : 29);
    if (spool) spool.configure(height);
    else spool = new window.ScrollSpool(height);
    const ratio = Math.min(3, Math.max(2, devicePixelRatio));
    renderer.resize(simulation, ratio);
    const bounds = cloth.getBoundingClientRect();
    linkLayout = links.map((link) => {
      const box = link.getBoundingClientRect();
      return { link, x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height };
    });
    buildPrint();
    ready = true;
    grip.hidden = false;
    grip.title = "Click the fabric to roll up";
    banner.dataset.bannerScroll = rollProgress === 1 ? "rolled" : "expanded";
    banner.classList.toggle("cloth-rendered", !keyboardFocus);
    rest();
    paintRoll();
    nextGust(2500);
  }
  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    frame = timer = null;
    lastTime = 0;
  }
  function rest() {
    stop();
    gustStart = null;
    pointer.active = false;
    pointer.vx = pointer.vy = 0;
    simulation?.reset();
    render();
    state(canAnimate() ? "idle" : "paused");
  }
  function nextGust(delay = 11000 + Math.random() * 7000) {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!canAnimate() || pointer.active) return;
    timer = setTimeout(() => {
      timer = null;
      if (!canAnimate() || pointer.active) return;
      gustStart = performance.now();
      settleAge = 0;
      state("wind");
      wake();
    }, delay);
  }
  function wake() {
    if (canAnimate() && frame === null) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  function tick(time) {
    frame = null;
    if (!canAnimate()) {
      rest();
      return;
    }
    if (renderer.software && lastTime && time - lastTime < 30) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 1 / 30) : 1 / 60;
    lastTime = time;
    const gustAge = gustStart === null ? 10 : (time - gustStart) / 1000;
    const wind = gustAge < 3.8 ? Math.sin((gustAge / 3.8) * Math.PI) ** 2 * 0.32 : 0;
    const energy = simulation.step(dt, time / 1000, wind, pointer);
    pointer.vx *= Math.exp(-8 * dt);
    pointer.vy *= Math.exp(-8 * dt);
    render();
    settleAge = pointer.active || wind > 0 ? 0 : settleAge + dt;
    if (pointer.active || wind > 0 || (settleAge < 6 && energy > 0.5)) frame = requestAnimationFrame(tick);
    else {
      rest();
      nextGust();
    }
  }
  function move(event) {
    if (event.pointerType !== "mouse" || !mouseInput.matches || !ready) return;
    if (event.target.closest("[data-scroll-grip]") || rollProgress > 0 || rollFrame !== null) return;
    if (keyboardFocus) {
      keyboardFocus = keyboardInput = false;
      banner.classList.add("cloth-rendered");
    }
    if (!canAnimate()) return;
    const bounds = cloth.getBoundingClientRect();
    const x = clamp(event.clientX - bounds.x, 0, bounds.width);
    const y = clamp(event.clientY - bounds.y + renderer.cut, 0, bounds.height);
    const dt = Math.max((event.timeStamp - pointer.time) / 1000, 1 / 60);
    pointer.vx = pointer.active ? clamp((x - pointer.x) / dt, -500, 500) : 0;
    pointer.vy = pointer.active ? clamp((y - pointer.y) / dt, -500, 500) : 0;
    pointer.x = x;
    pointer.y = y;
    pointer.time = event.timeStamp;
    pointer.active = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const link = event.target.closest("a");
    if (hoveredLink !== link) {
      hoveredLink = link;
      // Reset only the click-target transforms while measuring the print texture.
      const transforms = links.map((anchor) => anchor.style.transform);
      links.forEach((anchor) => anchor.style.removeProperty("transform"));
      buildPrint();
      links.forEach((anchor, i) => {
        anchor.style.transform = transforms[i];
      });
    }
    settleAge = 0;
    state("hover");
    wake();
  }
  banner.addEventListener("pointerenter", move);
  banner.addEventListener("pointermove", move);
  banner.addEventListener("pointerleave", () => {
    pointer.active = false;
    if (hoveredLink) {
      hoveredLink = null;
      const transforms = links.map((link) => link.style.transform);
      links.forEach((link) => link.style.removeProperty("transform"));
      buildPrint();
      links.forEach((link, i) => {
        link.style.transform = transforms[i];
      });
    }
    if (canAnimate()) {
      settleAge = 0;
      state("settling");
      wake();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") keyboardInput = true;
  });
  banner.addEventListener("pointerdown", () => {
    keyboardInput = false;
  });
  banner.addEventListener("focusin", (event) => {
    if (event.target.closest("[data-scroll-grip]") || rollProgress > 0 || rollFrame !== null) return;
    if (!keyboardInput && pointer.active) return;
    keyboardFocus = true;
    rest();
    banner.classList.remove("cloth-rendered");
    links.forEach((link) => link.style.removeProperty("transform"));
  });
  banner.addEventListener("focusout", () =>
    queueMicrotask(() => {
      if (!banner.contains(document.activeElement)) {
        keyboardFocus = false;
        banner.classList.add("cloth-rendered");
        state(canAnimate() ? "idle" : "paused");
        nextGust();
      }
    })
  );
  reducedMotion.addEventListener("change", () => {
    if (rollFrame !== null) finishRoll();
    rest();
    if (canAnimate()) nextGust();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && rollFrame !== null) finishRoll();
    rest();
    if (canAnimate()) nextGust();
  });
  if ("IntersectionObserver" in window)
    new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!visible && ready) rest();
        else if (ready) {
          state(canAnimate() ? "idle" : "paused");
          nextGust(2500);
        }
      },
      { threshold: 0.05 }
    ).observe(banner);
  Promise.all([document.fonts.ready, avatar.decode()])
    .then(() => {
      resize();
      if ("ResizeObserver" in window) {
        let previousSize = `${cloth.offsetWidth}:${cloth.offsetHeight}`;
        new ResizeObserver(() => {
          const size = `${cloth.offsetWidth}:${cloth.offsetHeight}`;
          if (size === previousSize) return;
          previousSize = size;
          if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            resize();
          });
        }).observe(cloth);
      }
    })
    .catch((error) => {
      console.warn("Profile cloth uses the static fallback:", error);
      ready = false;
      stop();
      banner.classList.remove("cloth-rendered");
      state("static");
    });
})();

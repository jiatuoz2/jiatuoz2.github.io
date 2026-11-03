/* Sound effects for "My Journey" and the day/night switch: short, quiet recordings (CC0,
   Kenney.nl; assets/audio/journey/CREDITS.md) played through the Web Audio API.

   window.JourneySound = { play(name), status() }
   Names: tab, pin, zoom, whoosh, paper-open, paper-close, fan, gather, click, toggle.
   Callers guard with `window.JourneySound && window.JourneySound.play(name)`; play() never
   throws and is a no-op when Web Audio is missing or the visitor has not yet pressed,
   clicked or typed (no AudioContext exists before a user gesture, so nothing can play on
   load). The files are fetched and decoded on the first gesture inside the section (or on
   the theme switch), so the page itself downloads no audio. Sound is always on; there is
   no switch. */
(() => {
  const MASTER_GAIN = 0.3;
  // gain: relative loudness (files are peak-normalized); spread: random pitch range;
  // gap: shortest time (ms) between two plays of the same sound.
  const SOUNDS = {
    tab: { files: ["tab-1", "tab-2"], gain: 0.5, spread: 0.06, gap: 60 },
    pin: { files: ["pin-1", "pin-2"], gain: 0.6, spread: 0.08, gap: 70 },
    zoom: { files: ["zoom"], gain: 0.32, spread: 0.06, gap: 70 },
    whoosh: { files: ["whoosh"], gain: 0.42, spread: 0.08, gap: 260 },
    "paper-open": { files: ["paper-open"], gain: 0.55, spread: 0.06, gap: 120 },
    "paper-close": { files: ["paper-close-1", "paper-close-2"], gain: 0.5, spread: 0.06, gap: 120 },
    fan: { files: ["fan"], gain: 0.5, spread: 0.05, gap: 250 },
    gather: { files: ["gather"], gain: 0.45, spread: 0.05, gap: 250 },
    click: { files: ["click"], gain: 0.45, spread: 0.05, gap: 60 },
    toggle: { files: ["toggle"], gain: 0.55, spread: 0.04, gap: 150 },
  };
  const MAX_VOICES = 6;
  // A first play() can arrive before its file has decoded; it still sounds if the file
  // lands within this many ms, otherwise it is dropped (a late click sounds wrong).
  const LATE_LIMIT = 250;
  // play() may start the audio only this soon after a real gesture.
  const GESTURE_WINDOW = 1000;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const script = document.currentScript;
  const base = (() => {
    try {
      return new URL("../audio/journey/", script && script.src ? script.src : location.href).href;
    } catch (error) {
      return null;
    }
  })();

  let context = null;
  let master = null;
  let loading = null;
  const buffers = new Map();
  const lastPlayed = new Map();
  const voices = new Set();
  let lastGesture = -Infinity;
  let played = 0;

  const now = () => (window.performance && performance.now ? performance.now() : Date.now());
  const recentGesture = () => {
    if (navigator.userActivation && navigator.userActivation.isActive) return true;
    return now() - lastGesture < GESTURE_WINDOW;
  };

  // Create (or wake) the context. Only ever called from a gesture handler or right after one.
  const ensureContext = () => {
    if (!AudioContextClass) return null;
    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(context.destination);
      }
      if (context.state === "suspended" || context.state === "interrupted") {
        const resumed = context.resume();
        if (resumed && resumed.catch) resumed.catch(() => {});
      }
    } catch (error) {
      context = null;
      master = null;
    }
    return context;
  };

  const decode = (data) =>
    new Promise((resolve, reject) => {
      // Older Safari only has the callback form; newer browsers return a promise too.
      const result = context.decodeAudioData(data, resolve, reject);
      if (result && result.then) result.then(resolve, reject);
    });

  const load = () => {
    if (loading || !context || !base || !window.fetch) return loading;
    const files = new Set();
    for (const sound of Object.values(SOUNDS)) for (const file of sound.files) files.add(file);
    loading = Promise.all(
      [...files].map((file) =>
        fetch(base + file + ".wav")
          .then((response) => {
            if (!response.ok) throw new Error(response.status);
            return response.arrayBuffer();
          })
          .then(decode)
          .then((buffer) => {
            buffers.set(file, buffer);
          })
          .catch(() => {
            // A missing sound stays silent; the others still play.
          })
      )
    );
    return loading;
  };

  const start = (name, file, requested) => {
    const sound = SOUNDS[name];
    const buffer = buffers.get(file);
    if (!buffer || !context || !master || context.state !== "running") return;
    if (now() - requested > LATE_LIMIT) return;
    if (voices.size >= MAX_VOICES) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    // A hand never does the same thing twice: vary pitch and level a little.
    source.playbackRate.value = 1 + (Math.random() - 0.5) * sound.spread;
    gain.gain.value = sound.gain * (0.86 + Math.random() * 0.14);
    source.connect(gain);
    gain.connect(master);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      try {
        gain.disconnect();
      } catch (error) {}
    };
    source.start();
    played += 1;
  };

  const play = (name) => {
    try {
      const sound = SOUNDS[name];
      if (!sound || !AudioContextClass || document.hidden) return;
      const time = now();
      if (time - (lastPlayed.get(name) || -Infinity) < sound.gap) return;
      if (!context) {
        // Nothing before the visitor has acted: no context means no sound on load.
        if (!recentGesture()) return;
        ensureContext();
      } else if (context.state !== "running" && recentGesture()) {
        ensureContext();
      }
      if (!context) return;
      lastPlayed.set(name, time);
      const file = sound.files[Math.floor(Math.random() * sound.files.length)];
      if (buffers.has(file) && context.state === "running") {
        start(name, file, time);
        return;
      }
      // Not decoded or not yet resumed: try once more as soon as both are ready.
      const resumed = context.state === "running" ? Promise.resolve() : context.resume ? context.resume() : Promise.resolve();
      Promise.all([load(), resumed])
        .then(() => start(name, file, time))
        .catch(() => {});
    } catch (error) {
      // Sound is an extra; never let it break the page.
    }
  };

  window.JourneySound = {
    play,
    // For tests and debugging: what has been set up so far.
    status: () => ({
      supported: Boolean(AudioContextClass),
      context: context ? context.state : null,
      loaded: buffers.size,
      played,
    }),
  };

  // Gestures: remember when the visitor last acted (play() may only start audio right
  // after), and on the first one inside the section or on the theme switch, wake the
  // audio and fetch the sounds so the first effect is not late.
  const audible = "[data-journey], .board-detail, [data-theme-toggle]";
  const onGesture = (event) => {
    if (!event.isTrusted) return;
    // Moving focus or pressing a modifier is not an action on anything.
    if (event.type === "keydown" && ["Tab", "Escape", "Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
    lastGesture = now();
    if (!AudioContextClass) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!context && !(target && target.closest(audible))) return;
    if (ensureContext()) load();
  };
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }

  // The day/night switch: site.js fires "site-theme-change" for clicks, but also when the
  // system theme or another tab changes it; only a click on the switch itself clicks.
  let themeClickAt = -Infinity;
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.isTrusted && target && target.closest("[data-theme-toggle]")) themeClickAt = now();
    },
    true
  );
  document.addEventListener("site-theme-change", () => {
    if (now() - themeClickAt < 600) play("toggle");
  });
})();

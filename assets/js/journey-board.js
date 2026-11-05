/* Detective boards for "My Journey" (_includes/journey.html), wired by journey.js.
   Each board is a fixed-size slate board with the streets of its place drawn faintly on it
   (assets/img/journey/maps/, built by bin/build_journey_maps.py from OpenStreetMap), under
   a low, uneven work light. Its documents are grouped in clusters, each under a strip of
   masking tape naming it, and pinned at computed spots; thin red thread runs from pin to
   pin over the paper, a pile of related documents (a "stack") sits under one pin and fans
   out on demand, and any document opens in the close-examine view (journey-examine.js,
   window.JourneyExamine), which can step through every document on the board. The board's
   title is a plain sheet of paper held by two strips of blue painter's tape, one over its top
   edge and one over its bottom edge (.board-case > .board-plate, from journey.html), at the
   top centre of the board: a different thing from the clusters' yellow masking tape; the
   clusters under it start below it. Without JavaScript the board stays a plain list (stacks
   as nested lists) on the same map, under its title sheet.

   In the section's split view (journey.js) the board is laid out at its pane's width, which a
   click never changes; while the window is being resized it is only scaled (a CSS transform
   on an ancestor) and laid out again once the width settles, so it never re-flows under the
   visitor; every size here is measured in layout pixels (offsetWidth, clientWidth), which a
   transform does not change.

   The board keeps one fixed size (its aspect ratio is set per width in _journey-board.scss)
   and never grows: a bigger board gets bigger, more legible papers (--board-scale), not
   just more room between them.

   Real documents (scan_kind: diploma | paper-page | cover) are drawn by journey-doc.html as
   a sheet (.board-scan) with a typed slip under it (.board-scan-caption); here they are
   papers like any other, shaped by their sheet.

   Clusters come from the data: every lab, school and place on a board heads one (its tape
   says "CGUI Lab", "Columbia", "New York"), and every other paper or pile joins the
   smallest cluster it has a thread to (a photo may always join its place).

   Layers inside .board-cork, bottom to top (each its own positioned box, so no paper can
   ever rise above a thread): the documents (.board-docs, an isolated stacking context), the
   cluster tapes, the threads (.board-strings), the pin heads (.board-pins), the thread
   tags, the lamp light, and the fanned-out pile (.board-fan: backdrop, cards, then their
   pins). A spread-out pile carries no thread at all, and the board's own threads are put
   away until it is gathered.

   Artifacts (kind: artifact) are objects: a cutout of the thing (medium cutout, or a legacy
   bag) or a small print (medium photo). Each lies directly on its document, over the
   paper's bottom edge or a lower corner, clear of its title and of the board's edge, under
   nothing but its own contact and drop shadows: no tape, pin, tag or string holds it. One
   attached to a document (attach: <doc id>, drawn inside that document's item by
   _includes/journey-doc.html) moves with it; an artifact left loose in the data is laid on
   the document it has a thread to. It is not an item of the layout, and a thread to it runs
   to its document's pin. While a pile is closed, the artifacts on its top paper lie on the
   pile (outside its inert papers), so they can still be opened.

   Sounds go through the optional window.JourneySound (never on hover or on load). */
(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_ITEMS = 9;
  // Papers that head a cluster, and which wins when a paper is tied to several.
  const HEAD_RANK = { lab: 3, education: 2, place: 1 };
  const SMALL_WORDS = new Set(["of", "for", "and", "&", "the", "at", "in", "on"]);
  const GENERIC_WORDS = new Set(["university", "academy", "college", "school", "institute"]);
  const KIND_PLURALS = {
    paper: "papers",
    person: "people",
    project: "projects",
    photo: "photos",
    course: "courses",
    lab: "labs",
    award: "awards",
    note: "notes",
    work: "jobs",
    education: "schools",
    place: "places",
  };
  // Small map pins: dark blue and steel heads, the odd black or red one. Highlight, body, shade.
  const PIN_COLORS = {
    navy: ["#9fb4d6", "#2a4675", "#0b1630"],
    steel: ["#f4f6f8", "#8d97a2", "#2f353c"],
    blue: ["#a9c2e6", "#3d5f94", "#14223c"],
    black: ["#8a8f96", "#26292d", "#060708"],
    red: ["#f0a39a", "#a8252a", "#4a0b0d"],
  };
  const PIN_CHOICES = ["navy", "steel", "navy", "blue", "steel", "black", "navy", "red"];

  const svgElement = (name, attributes = {}, parent = null) => {
    const element = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  };
  const element = (name, className, parent = null) => {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (parent) parent.append(node);
    return node;
  };
  const round = (value) => Math.round(value * 10) / 10;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const hash = (text) => {
    let h = 2166136261;
    for (const char of text) {
      h ^= char.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const random = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const kindOf = (node) => node?.dataset.kind || "note";
  // A document's own title: on the paper, or in an object's caption or on a scan's slip.
  const OWN_TITLE = ":scope > .board-doc-title, :scope > :is(.board-artifact-caption, .board-scan-caption) > .board-doc-title";
  const titleOf = (node) => node?.querySelector(OWN_TITLE)?.textContent.replace(/\s+/g, " ").trim() || "";
  // A document's own papers, not the artifacts attached to it.
  const STACKED = ":scope > .board-stack-docs > .board-doc[data-doc]";
  const ATTACHED = ":scope > .board-doc-attached";
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
  const focusables = (container) =>
    [...container.querySelectorAll("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter(
      (node) => !node.closest("[inert]") && node.getClientRects().length
    );
  let boardCount = 0;
  // A sound effect, if the sound module is loaded and switched on.
  const sound = (name) => {
    try {
      if (window.JourneySound) window.JourneySound.play(name);
    } catch (error) {
      // Sound is a nicety: never let it break the board.
    }
  };

  // Fine thread pulled nearly taut between two pins: a hair of slack when it runs sideways.
  const threadPath = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const sag = Math.min(5, length * 0.014) * (0.3 + 0.7 * (Math.abs(dx) / length)) + 0.5;
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
    return { d: `M${round(a.x)} ${round(a.y)}Q${round(c.x)} ${round(c.y)} ${round(b.x)} ${round(b.y)}`, a, b, c };
  };
  const pointOn = ({ a, b, c }, t) => {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  };

  const cellsFor = (counts, left, top, width, height) => {
    const cells = [];
    const rowHeight = height / counts.length;
    counts.forEach((columns, row) => {
      const cellWidth = width / columns;
      for (let column = 0; column < columns; column++) {
        cells.push({ row, column, left: left + column * cellWidth, top: top + row * rowHeight, width: cellWidth, height: rowHeight });
      }
    });
    return cells;
  };
  const permutations = (list) =>
    list.length < 2
      ? [list]
      : list.flatMap((first, index) => permutations([...list.slice(0, index), ...list.slice(index + 1)]).map((rest) => [first, ...rest]));
  // Every way to cut k clusters (in order) into 1..maxRows rows.
  const compositions = (k, maxRows) => {
    const out = [];
    const walk = (left, parts) => {
      if (!left) return out.push(parts);
      if (parts.length >= maxRows) return;
      for (let take = 1; take <= left; take++) walk(left - take, [...parts, take]);
    };
    walk(k, []);
    return out;
  };

  // Ways to lay n papers out as rows of cells: [columns, rows], no row left empty, the
  // squarest few first.
  const shapesFor = (n) => {
    const shapes = [];
    for (let rows = 1; rows <= n; rows++) {
      const columns = Math.ceil(n / rows);
      if (columns * (rows - 1) >= n) continue;
      if (!shapes.some(([c, r]) => c === columns && r === rows)) shapes.push([columns, rows]);
    }
    return shapes.sort((p, q) => Math.abs(Math.log(p[0] / p[1])) - Math.abs(Math.log(q[0] / q[1]))).slice(0, 3);
  };
  const rowCounts = (n, rows) => {
    const base = Math.floor(n / rows);
    const counts = new Array(rows).fill(base);
    const order = Array.from({ length: rows }, (_, r) => r).sort((p, q) => Math.abs(p - (rows - 1) / 2) - Math.abs(q - (rows - 1) / 2));
    for (let k = 0; k < n % rows; k++) counts[order[k]]++;
    return counts;
  };

  // The board split into one region per cluster, in rows. Each cluster takes a block of
  // cells (so many columns by so many rows); a row of clusters is as tall as its tallest
  // block and shares the board's width by columns. Tries every order, row split and block
  // shape (a board has only a few clusters) and keeps the one that gives the papers the
  // most room (sizeOf: a paper's width in a cell, from its own shape; scored by area, and
  // by the narrowest paper, which counts heavily), with the place's cluster first and
  // clusters tied by threads near each other. notch is the board's title sheet at the top
  // ({ left, right, h }, in the same coordinates): a cluster in the first row that lies
  // under any part of it begins below it.
  const arrange = (clusters, width, height, labelHeight, ties, maxRows, sizeOf, notch = { left: 0, right: 0, h: 0 }) => {
    const papers = clusters.reduce((sum, cluster) => sum + cluster.items.length, 0);
    const indices = clusters.map((_, index) => index);
    const orders = clusters.length <= 5 ? permutations(indices) : [indices];
    const shapes = clusters.map((cluster) => shapesFor(cluster.items.length));
    const choices = [];
    const pickShapes = (index, chosen) => {
      if (index === clusters.length) return choices.push(chosen);
      for (const shape of clusters.length <= 5 ? shapes[index] : shapes[index].slice(0, 1)) pickShapes(index + 1, [...chosen, shape]);
    };
    pickShapes(0, []);
    const splits = compositions(clusters.length, maxRows);
    const diagonal = Math.hypot(width, height);
    let best = null;
    for (const shape of choices) {
      for (const order of orders) {
        for (const split of splits) {
          let index = 0;
          const rows = split.map((count) => {
            const members = order.slice(index, index + count);
            index += count;
            return {
              members,
              columns: members.reduce((sum, i) => sum + shape[i][0], 0),
              depth: Math.max(...members.map((i) => shape[i][1])),
            };
          });
          const depth = rows.reduce((sum, row) => sum + row.depth, 0);
          let top = 0;
          let score = 0;
          let smallest = Infinity;
          const regions = [];
          rows.forEach((row, r) => {
            const rowHeight = (height * row.depth) / depth;
            let left = 0;
            for (const i of row.members) {
              const cluster = clusters[i];
              const [columns, depthHere] = shape[i];
              const regionWidth = (width * columns) / row.columns;
              const under = r === 0 && notch.h > 0 && left < notch.right && left + regionWidth > notch.left;
              const inset = under ? Math.min(notch.h, rowHeight * 0.55) : 0;
              const room = Math.max(rowHeight - labelHeight - inset, rowHeight * 0.35);
              const counts = rowCounts(cluster.items.length, depthHere);
              let k = 0;
              counts.forEach((inRow) => {
                for (let c = 0; c < inRow; c++, k++) {
                  const item = cluster.items[k];
                  const w = sizeOf(item, regionWidth / inRow, room / depthHere, cluster.items.length > 1);
                  score -= Math.log((w * w) / item.aspect);
                  smallest = Math.min(smallest, w);
                }
              });
              if (regionWidth < cluster.labelWidth + 16) score += 2;
              regions.push({ cluster, row: r, left, top, width: regionWidth, height: rowHeight, counts, inset });
              left += regionWidth;
            }
            top += rowHeight;
          });
          score = score / papers - 2.5 * Math.log(smallest);
          if (regions[0].cluster !== clusters[0]) score += 0.12;
          const at = new Map(regions.map((region) => [region.cluster, region]));
          for (const [a, b] of ties) {
            const p = at.get(a);
            const q = at.get(b);
            score += (Math.hypot(p.left + p.width / 2 - q.left - q.width / 2, p.top + p.height / 2 - q.top - q.height / 2) / diagonal) * 0.08;
          }
          if (!best || score < best.score - 1e-9) best = { score, regions };
        }
      }
    }
    return best.regions;
  };

  // A cluster's tape: a place by its city, a school or lab by its usual short name.
  const words = (text) =>
    text
      .replace(/[“”"()]/g, "")
      .split(/[\s\-–]+/)
      .filter((word) => word && !SMALL_WORDS.has(word.toLowerCase()));
  const initials = (list) => list.map((word) => word[0].toUpperCase()).join("");
  // A pile's name in running text: lower case, but acronyms (CGUI, LIINC) kept.
  const lower = (title) => title.replace(/[A-Za-z][\w-]*/g, (word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase()));
  const shortName = (kind, title) => {
    const plain = title.replace(/\s+/g, " ").trim();
    if (kind === "place") return plain.split(",")[0];
    const list = words(plain);
    if (kind === "education") {
      if (list.length >= 3) return initials(list);
      const kept = list.filter((word) => !GENERIC_WORDS.has(word.toLowerCase()));
      return (kept.length ? kept : list).join(" ");
    }
    if (kind === "lab" && plain.length > 16) {
      // "Computer Graphics & User Interfaces Lab" → "CGUI Lab"; "Laboratory for
      // Intelligent Imaging & Neural Computing" → "LIINC".
      let rest = list;
      let suffix = "";
      if (/^lab$/i.test(rest[0])) [rest, suffix] = [rest.slice(1), " Lab"];
      if (/^lab$/i.test(rest[rest.length - 1])) [rest, suffix] = [rest.slice(0, -1), " Lab"];
      return initials(rest) + suffix;
    }
    return plain;
  };
  // Clusters: each lab, school and place heads one; every other paper or pile joins the
  // smallest cluster it is threaded to (lab before school before place when tied); a photo
  // may always join its place, and a paper tied to nothing joins the smallest cluster.
  const formClusters = (items, neighbours, fallback) => {
    const clusters = [];
    const of = new Map();
    for (const item of items) {
      if (item.isStack || !HEAD_RANK[item.kind]) continue;
      const cluster = { head: item, rank: HEAD_RANK[item.kind], items: [item], label: shortName(item.kind, titleOf(item.el)) };
      clusters.push(cluster);
      of.set(item, cluster);
    }
    if (!clusters.length) {
      const cluster = { head: items[0], rank: 0, items: items.slice(), label: fallback };
      for (const item of items) of.set(item, cluster);
      return { clusters: [cluster], of };
    }
    const home = clusters.find((cluster) => cluster.head.kind === "place");
    const pick = (candidates) => [...new Set(candidates)].sort((p, q) => p.items.length - q.items.length || q.rank - p.rank)[0];
    let pending = items.filter((item) => !of.has(item));
    while (pending.length) {
      let progress = false;
      for (const item of pending) {
        const tied = [...neighbours.get(item)];
        const candidates = tied.map((other) => of.get(other)).filter(Boolean);
        if (!tied.length) candidates.push(...clusters);
        else if (item.kind === "photo" && home) candidates.push(home);
        if (!candidates.length) continue;
        const cluster = pick(candidates);
        cluster.items.push(item);
        of.set(item, cluster);
        progress = true;
      }
      pending = pending.filter((item) => !of.has(item));
      if (!progress) {
        const item = pending.shift();
        const cluster = pick(clusters);
        cluster.items.push(item);
        of.set(item, cluster);
      }
    }
    // The head first, then the rest in reading order; the place's cluster leads.
    for (const cluster of clusters) {
      cluster.items = [cluster.head, ...cluster.items.filter((item) => item !== cluster.head).sort((p, q) => p.index - q.index)];
    }
    clusters.sort((p, q) => p.head.index - q.head.index);
    return { clusters, of };
  };

  // Safety net: more top-level items than a board holds become piles by kind.
  const autoStack = (list) => {
    const tops = () => [...list.children].filter((node) => node.matches(".board-doc, .board-stack"));
    let excess = tops().length - MAX_ITEMS;
    if (excess <= 0) return [];
    const made = [];
    const pile = (docs, title) => {
      const id = `auto-${docs[0].dataset.doc}`;
      const stack = document.createElement("li");
      stack.className = "board-stack";
      stack.dataset.stack = id;
      stack.dataset.kind = kindOf(docs[0]);
      stack.dataset.generated = "";
      const label = element("p", "board-stack-title", stack);
      label.id = `board-stack-${id}-title`;
      label.textContent = `${title} `;
      element("span", "board-stack-count", label).textContent = `(${docs.length})`;
      const inner = element("ul", "board-stack-docs", stack);
      inner.setAttribute("aria-labelledby", label.id);
      docs[0].before(stack);
      inner.append(...docs);
      made.push(stack);
      excess -= docs.length - 1;
    };
    const loose = tops().filter((node) => node.matches(".board-doc"));
    const byKind = new Map();
    for (const doc of loose.slice(1)) {
      const kind = kindOf(doc);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(doc);
    }
    for (const [kind, docs] of [...byKind].filter(([, docs]) => docs.length > 1).sort((p, q) => q[1].length - p[1].length)) {
      if (excess <= 0) break;
      const word = KIND_PLURALS[kind] || `${kind}s`;
      pile(docs, word[0].toUpperCase() + word.slice(1));
    }
    if (excess > 0) {
      const rest = tops().filter((node) => node.matches(".board-doc"));
      pile(rest.slice(-(excess + 1)), "More");
    }
    return made;
  };

  // An artifact left loose in the data (no attach) is laid on the document it has a thread
  // to, as if attached there: objects lie on their papers, never pinned or strung up on
  // their own. Returns how to undo it.
  const attachLoose = (section, list) => {
    const threads = [...section.querySelectorAll(".board-threads li[data-from][data-to]")].map((node) => [node.dataset.from, node.dataset.to]);
    const docById = (id) => [...list.querySelectorAll(".board-doc[data-doc]")].find((node) => node.dataset.doc === id) || null;
    const moved = [];
    for (const node of [...list.children]) {
      if (!node.matches(".board-doc[data-kind='artifact']")) continue;
      const id = node.dataset.doc;
      let host = null;
      for (const [from, to] of threads) {
        const other = from === id ? to : to === id ? from : null;
        const candidate = other && docById(other);
        if (candidate && candidate !== node && candidate.dataset.kind !== "artifact" && !candidate.closest(".board-doc-attached")) {
          host = candidate;
          break;
        }
      }
      if (!host) continue;
      let holder = host.querySelector(":scope > .board-doc-attached");
      const made = !holder;
      if (made) {
        holder = element("ul", "board-doc-attached", host);
        holder.dataset.generated = "";
      }
      moved.push({ node, next: node.nextSibling, holder, made });
      holder.append(node);
      node.classList.add("is-attached");
      node.dataset.attach = host.dataset.doc;
      node.dataset.attachGenerated = "";
    }
    return () => {
      for (const { node, next, holder, made } of moved.reverse()) {
        if (next && next.parentNode === list) list.insertBefore(node, next);
        else list.append(node);
        node.classList.remove("is-attached");
        delete node.dataset.attach;
        delete node.dataset.attachGenerated;
        if (made && !holder.children.length) holder.remove();
      }
    };
  };

  // The close-examine view (journey-examine.js), if it is loaded.
  const examiner = () => (window.JourneyExamine && typeof window.JourneyExamine.open === "function" ? window.JourneyExamine : null);
  const EXAMINE = ".journey-examine";

  // A stop's data (lat/lon for the map's edge ticks), from journey.js or the page's JSON.
  const stopFor = (section) => {
    try {
      const stops = JSON.parse(section.closest("[data-journey]")?.querySelector("script[data-journey-stops]")?.textContent || "[]");
      return (Array.isArray(stops) && stops.find((stop) => stop && stop.id === section.dataset.stop)) || null;
    } catch (error) {
      return null;
    }
  };

  const mount = (section, stop = null) => {
    if (section.journeyBoard) return section.journeyBoard;
    stop = stop || stopFor(section);
    const surface = section.querySelector(".board-surface");
    const list = surface?.querySelector(":scope > .board-docs");
    if (!surface || !list) return null;
    const boardId = `journey-board-${++boardCount}`;
    const cleanups = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };
    const detachLoose = attachLoose(section, list);
    const generated = autoStack(list);

    // The model: top-level items (single documents or piles) in reading order.
    const items = [...list.children]
      .filter((node) => node.matches(".board-doc, .board-stack"))
      .map((node, index) => {
        const isStack = node.matches(".board-stack");
        const docs = isStack ? [...node.querySelectorAll(STACKED)] : [node];
        const id = isStack ? `stack:${node.dataset.stack}` : node.dataset.doc;
        const next = random(hash(id));
        return {
          el: node,
          index,
          id,
          isStack,
          docs,
          kind: kindOf(node),
          // An object with no paper to lie on rests on the slate by itself: no pin.
          loose: !isStack && node.dataset.kind === "artifact" && node.dataset.medium !== "photo",
          // Each paper hangs a little differently: its tilt, where the pin went in, its pin.
          tilt: (next() < 0.5 ? -1 : 1) * (0.4 + next() * 2.6),
          pinShift: (next() - 0.5) * 0.22,
          jitter: [next() - 0.5, next()],
          color: PIN_CHOICES[Math.floor(next() * PIN_CHOICES.length)],
          box: null,
        };
      });
    if (!items.length) {
      for (const stack of generated) {
        stack.before(...stack.querySelectorAll(STACKED));
        stack.remove();
      }
      detachLoose();
      return null;
    }
    const itemOfDoc = new Map();
    // Every document an item carries: its papers and the artifacts attached to them.
    const papersOf = (item) => [item.el, ...item.el.querySelectorAll(".board-doc[data-doc]")].filter((node) => node.matches(".board-doc[data-doc]"));
    for (const item of items) for (const doc of papersOf(item)) itemOfDoc.set(doc.dataset.doc, item);
    const threads = [...section.querySelectorAll(".board-threads li[data-from][data-to]")]
      .map((node) => ({ from: node.dataset.from, to: node.dataset.to, label: node.dataset.label || "" }))
      .filter((thread) => itemOfDoc.has(thread.from) && itemOfDoc.has(thread.to));
    // Threads between items (a pile counts as one item while it is closed).
    const links = new Map();
    for (const thread of threads) {
      const a = itemOfDoc.get(thread.from);
      const b = itemOfDoc.get(thread.to);
      if (a === b) continue;
      const key = [a.id, b.id].sort().join("|");
      if (!links.has(key)) links.set(key, { key, a, b, labels: [] });
      if (thread.label && !links.get(key).labels.includes(thread.label)) links.get(key).labels.push(thread.label);
    }
    const linkList = [...links.values()];
    const edges = linkList.map((link) => [link.a.index, link.b.index]);
    // A photo (or a print of an object) with no thread to it is taped up rather than pinned.
    for (const item of items) {
      const print = item.kind === "photo" || (item.kind === "artifact" && item.el.dataset.medium === "photo");
      item.taped = !item.isStack && !item.loose && print && !linkList.some((link) => link.a === item || link.b === item);
      item.el.classList.toggle("is-taped", item.taped);
    }
    const neighbours = new Map(items.map((item) => [item, new Set()]));
    for (const link of linkList) {
      neighbours.get(link.a).add(link.b);
      neighbours.get(link.b).add(link.a);
    }
    const city = (stop?.short || stop?.name || section.querySelector(".journey-board-title")?.textContent || "").split(",")[0].trim();
    // The board's own title: a sheet of paper (place, case file number and period) taped to
    // the top centre of the board with blue painter's tape. It joins the board (under the threads and the
    // light) and goes back where it was when the board is taken down.
    const caseLabel = surface.querySelector(":scope > .board-case");
    const casePlate = caseLabel?.querySelector(".board-plate") || caseLabel;
    const caseContext = {
      place: stop?.name || section.querySelector(".journey-board-title")?.textContent.trim() || city,
      short: stop?.short || city,
      period: stop?.period || section.querySelector(".journey-board-period")?.textContent.replace(/\s+/g, " ").trim() || "",
      caseNo: caseLabel?.dataset.case || "",
      summary: stop?.summary || section.querySelector(".journey-board-summary")?.textContent.trim() || "",
      // The board's street map (a CSS url()), drawn faintly inside the examine window too.
      map: surface?.style.getPropertyValue("--board-map").trim() || "",
    };
    const { clusters, of: clusterOf } = formClusters(items, neighbours, city || "Evidence");
    // Clusters tied by a thread are kept near each other.
    const ties = [];
    for (const link of linkList) {
      const a = clusterOf.get(link.a);
      const b = clusterOf.get(link.b);
      if (a !== b && !ties.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) ties.push([a, b]);
    }

    // Layers.
    const cork = element("div", "board-cork");
    surface.append(cork);
    cork.append(list);
    // Before the papers, so the board's heading still comes first in reading order.
    if (caseLabel) cork.prepend(caseLabel);
    // One strip of masking tape per cluster, its name in marker.
    const labels = element("div", "board-labels", cork);
    labels.setAttribute("aria-hidden", "true");
    for (const cluster of clusters) {
      cluster.tape = element("span", "board-label", labels);
      cluster.tape.textContent = cluster.label;
      const next = random(hash(`tape:${cluster.label}`));
      cluster.tilt = (next() - 0.5) * 5;
      cluster.nudge = next();
    }
    const strings = svgElement("svg", { class: "board-strings", "aria-hidden": "true", focusable: "false" });
    const pins = svgElement("svg", { class: "board-pins", "aria-hidden": "true", focusable: "false" });
    const tags = element("div", "board-tags");
    tags.setAttribute("aria-hidden", "true");
    const light = element("div", "board-light");
    light.setAttribute("aria-hidden", "true");
    const fan = element("div", "board-fan");
    fan.hidden = true;
    const fanBackdrop = element("div", "board-fan-backdrop", fan);
    const fanCards = element("div", "board-fan-cards", fan);
    fanCards.setAttribute("role", "group");
    const fanPins = svgElement("svg", { class: "board-pins board-pins--fan", "aria-hidden": "true", focusable: "false" }, fan);
    const fanClose = element("button", "board-fan-close", fan);
    fanClose.type = "button";
    cork.append(strings, pins, tags, light, fan);
    surface.classList.add("is-mounted");

    // Shared SVG definitions: a soft blur for cast shadows and a gradient per pin plastic.
    const prefixes = new Map([
      [strings, "s"],
      [pins, "p"],
      [fanPins, "fp"],
    ]);
    const isPins = (svg) => svg === pins || svg === fanPins;
    const defsFor = (svg) => {
      const prefix = `${prefixes.get(svg)}-${boardId}`;
      const defs = svgElement("defs", {}, svg);
      const blur = svgElement("filter", { id: `${prefix}-blur`, x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
      svgElement("feGaussianBlur", { stdDeviation: isPins(svg) ? "1.3" : "1.1" }, blur);
      if (isPins(svg)) {
        for (const [name, [hi, body, shade]] of Object.entries(PIN_COLORS)) {
          const gradient = svgElement("radialGradient", { id: `${prefix}-${name}`, cx: "0.36", cy: "0.32", r: "0.78" }, defs);
          svgElement("stop", { offset: "0", "stop-color": hi }, gradient);
          svgElement("stop", { offset: "0.45", "stop-color": body }, gradient);
          svgElement("stop", { offset: "1", "stop-color": shade }, gradient);
        }
      }
      return blur.id;
    };
    const blurs = new Map([strings, pins, fanPins].map((svg) => [svg, defsFor(svg)]));
    const groupIn = (svg) => {
      [...svg.children].filter((node) => node.tagName.toLowerCase() !== "defs").forEach((node) => node.remove());
      return svgElement("g", {}, svg);
    };

    // A thread: its cast shadow on the board, the fine red string, and the lamp's glint on it.
    const drawThread = (layer, svg, path, key) => {
      const group = svgElement("g", { class: "board-string", "data-key": key }, layer);
      svgElement("path", { class: "board-string-shadow", d: path.d, transform: "translate(1.4 2.4)", filter: `url(#${blurs.get(svg)})` }, group);
      svgElement("path", { class: "board-string-yarn", d: path.d }, group);
      svgElement("path", { class: "board-string-sheen", d: path.d }, group);
      return group;
    };
    // A push pin seen from the front: cast shadow, glossy domed head, specular glint.
    const drawPin = (layer, svg, point, radius, color) => {
      const group = svgElement("g", { class: "board-pin", transform: `translate(${round(point.x)} ${round(point.y)})` }, layer);
      const prefix = `${prefixes.get(svg)}-${boardId}`;
      svgElement(
        "ellipse",
        {
          class: "board-pin-shadow",
          cx: round(radius * 0.7),
          cy: round(radius * 0.95),
          rx: round(radius * 1.05),
          ry: round(radius * 0.85),
          filter: `url(#${blurs.get(svg)})`,
        },
        group
      );
      // The steel needle shows only as its thin shadow, slanting away from the light.
      svgElement("path", { class: "board-pin-needle", d: `M0 0l${round(radius * 1.5)} ${round(radius * 2.1)}` }, group);
      svgElement("circle", { class: "board-pin-head", r: round(radius), fill: `url(#${prefix}-${color})` }, group);
      svgElement("circle", { class: "board-pin-rim", r: round(radius * 0.97) }, group);
      svgElement(
        "ellipse",
        {
          class: "board-pin-glint",
          cx: round(-radius * 0.34),
          cy: round(-radius * 0.38),
          rx: round(radius * 0.32),
          ry: round(radius * 0.2),
          transform: "rotate(-35)",
        },
        group
      );
    };

    // Each document gets one keyboard stop: a button that opens the close-examine view. Its
    // title link stays clickable on the board but is reached by keyboard in that view.
    const openers = new Map();
    for (const item of items) {
      for (const doc of papersOf(item)) {
        const button = element("button", "board-doc-open");
        button.type = "button";
        button.setAttribute("aria-haspopup", "dialog");
        const kind = doc.dataset.scan ? doc.dataset.scan.replace("-", " ") : kindOf(doc);
        button.setAttribute("aria-label", `${titleOf(doc)} (${kind}): examine`);
        doc.prepend(button);
        doc.querySelectorAll("a[href]").forEach((link) => link.setAttribute("tabindex", "-1"));
        openers.set(doc, button);
      }
    }
    // Piles: one button over the stacked sheets, with a typed tally taped to the pile.
    const piles = new Map();
    for (const item of items.filter((entry) => entry.isStack)) {
      const inner = item.el.querySelector(".board-stack-docs");
      inner.id = inner.id || `${boardId}-${item.el.dataset.stack}-docs`;
      const title = item.el.querySelector(".board-stack-title")?.firstChild?.textContent.trim() || "Pile";
      const button = element("button", "board-stack-open");
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", fanCards.id || (fanCards.id = `${boardId}-fan`));
      button.setAttribute("aria-label", `${title}: a pile of ${item.docs.length} (${item.docs.map(titleOf).join("; ")}). Spread them out`);
      const tally = element("span", "board-stack-tally", button);
      tally.setAttribute("aria-hidden", "true");
      tally.textContent = `${item.docs.length} ${lower(title)}`;
      item.el.append(button);
      inner.inert = true;
      // The artifacts of every paper in it lie on the closed pile, where they can still be
      // seen and opened; spread out, each goes back to its own paper.
      const holders = item.docs.map((doc) => [doc, doc.querySelector(ATTACHED)]).filter(([, holder]) => holder);
      for (const [, holder] of holders) item.el.append(holder);
      piles.set(item, { inner, button, title, holders });
    }

    // Artifacts attached to documents: each document's list of them, with how each lies.
    const attachments = [];
    for (const item of items) {
      for (const doc of item.docs) {
        const holder = doc.querySelector(ATTACHED) || piles.get(item)?.holders.find(([owner]) => owner === doc)?.[1];
        if (!holder) continue;
        const artifacts = [...holder.querySelectorAll(":scope > .board-doc[data-doc]")].map((node) => {
          const next = random(hash(`attach:${node.dataset.doc}`));
          const print = node.dataset.medium === "photo";
          // An object stands about half as wide as its paper; a small print a little less, and a
          // hand-held device less again (its yml scale, data-scale).
          const scale = clamp(Number(node.dataset.scale) || 1, 0.3, 1);
          return { node, share: (print ? 0.5 : 0.6) * scale, cutout: !print, tilt: (next() - 0.5) * (print ? 10 : 16) };
        });
        attachments.push({ item, doc, holder, artifacts });
      }
    }

    // Where a document's artifacts lie: on the paper, over its bottom edge or a lower corner
    // (part on the paper, part off it), never over its title, kept on the board, and covering
    // as little as possible of whatever else is in the zones given (each a rectangle on the
    // board and how much covering it costs). box is the paper on the board (its tilt
    // ignored); the artifacts are placed in the paper's own pixels.
    const offsetIn = (node, ancestor) => {
      let x = 0;
      let y = 0;
      for (let at = node; at && at !== ancestor; at = at.offsetParent) {
        x += at.offsetLeft;
        y += at.offsetTop;
      }
      return { x, y };
    };
    // A paper's title on the board, from the item (or card) it is drawn in.
    const titleZone = (doc, base, box) => {
      const title = doc.querySelector(OWN_TITLE);
      if (!title || title.offsetWidth < 4) return null;
      const at = offsetIn(title, base);
      return rect(box.x + at.x - 3, box.y + at.y - 3, title.offsetWidth + 6, title.offsetHeight + 6);
    };
    // Spots along the paper's bottom edge and lower corners: [where on the paper across,
    // which point of the object goes there across, the same down].
    const SPOTS = [
      [1, 0.62, 1, 0.55],
      [1, 0.62, 1, 0.38],
      [1, 0.5, 1, 0.7],
      [0.8, 0.5, 1, 0.5],
      [0.5, 0.5, 1, 0.5],
      [0.5, 0.5, 1, 0.34],
      [0.22, 0.5, 1, 0.5],
      [0, 0.38, 1, 0.55],
      [0, 0.38, 1, 0.38],
      [1, 0.45, 0.82, 0.5],
      [0, 0.55, 0.82, 0.5],
      // More room for a paper (or a closed pile) that carries several objects: hanging
      // below the bottom edge, and along the lower sides.
      [0.5, 0.5, 1, 0.16],
      [0.82, 0.5, 1, 0.22],
      [0.18, 0.5, 1, 0.22],
      [1, 0.5, 0.68, 0.5],
      [0, 0.5, 0.68, 0.5],
    ];
    // Covering another object costs about as much as covering a title, so several objects
    // on one paper (OLIVE's headset and EEG strip) or on one closed pile lie side by side.
    const OBJECT_WEIGHT = 900;
    const placeAttached = (entry, box, zones, bounds) => {
      const own = titleZone(entry.doc, entry.holder.parentElement, box);
      const local = own ? [...zones, { zone: own, weight: 1000 }] : zones.slice();
      // The top of the paper stays clear (its pin, kind and title).
      local.push({ zone: rect(box.x, box.y, box.w, box.h * 0.32), weight: 120 });
      const paper = rect(box.x, box.y, box.w, box.h);
      const placed = [];
      for (const artifact of entry.artifacts) {
        const { node } = artifact;
        let best = null;
        // Full size, or a little smaller where the board is crowded.
        // An object keeps about the same area whatever its shape: a long, thin one is wider,
        // and a tall, narrow one (a watch on its band) is no taller than its paper.
        const image = node.querySelector("img");
        const aspect = image?.naturalWidth ? clamp(image.naturalWidth / image.naturalHeight, 0.2, 16) : 1;
        const spread = artifact.cutout ? Math.sqrt(aspect) : 1;
        const tall = artifact.cutout && aspect < 1 ? box.h * aspect : Infinity;
        for (const size of [1, 0.84, 0.7]) {
          const w = clamp(box.w * artifact.share * size * spread, Math.min(56, tall * size), Math.min(box.w * 0.92, 210 * scale, tall * size));
          node.style.width = `${round(w)}px`;
          const h = Math.max(1, node.offsetHeight);
          const area = w * h;
          for (const [fx, gx, fy, gy] of SPOTS) {
            // Kept on the board: a spot that would hang off its edge is moved in.
            const x = clamp(box.w * fx - w * gx, bounds.left - box.x, bounds.right - box.x - w);
            const y = clamp(box.h * fy - h * gy, bounds.top - box.y, bounds.bottom - box.y - h);
            const here = rect(box.x + x, box.y + y, w, h);
            let cost = (area - overlap(here, bounds)) * 40 + (1 - size) * area * 1.2;
            for (const { zone, weight } of local) cost += overlap(here, zone) * weight;
            // Best when a little under half of it lies on the paper (most of a long, thin
            // one, which would be lost against the slate).
            cost += area * 1.5 * Math.abs(overlap(here, paper) / area - (aspect > 3 ? 0.62 : 0.45));
            if (!best || cost < best.cost) best = { cost, x, y, w, here };
          }
        }
        node.style.width = `${round(best.w)}px`;
        placed.push(best.here);
        local.push({ zone: best.here, weight: OBJECT_WEIGHT });
        node.style.left = `${round(best.x)}px`;
        node.style.top = `${round(best.y)}px`;
        node.style.setProperty("--attach-tilt", `${round(artifact.tilt)}deg`);
      }
      return placed;
    };
    // The attachments on the closed board: on single papers and on the top paper of a pile.
    // Other papers cost a little to cover, their titles, the tapes and pins more, and a
    // pile's tally and binder clip most.
    const placeBoardAttachments = (width, height) => {
      const bounds = rect(2, 2, width - 4, height - 4);
      const fixed = clusters.filter((cluster) => cluster.tapeBox).map((cluster) => ({ zone: cluster.tapeBox, weight: 25 }));
      for (const item of items) {
        if (item.isStack) {
          const tally = item.el.querySelector(".board-stack-tally");
          if (tally) {
            const at = offsetIn(tally, item.el);
            fixed.push({ zone: rect(item.box.x + at.x, item.box.y + at.y, tally.offsetWidth, tally.offsetHeight), weight: 400 });
          }
          fixed.push({ zone: rect(item.box.x + item.box.w * 0.88 - 26 * scale, item.box.y - 10 * scale, 26 * scale, 20 * scale), weight: 400 });
        }
        const pin = !item.taped && pinOf(item);
        if (pin) fixed.push({ zone: rect(pin.x - 7, pin.y - 7, 14, 14), weight: 25 });
      }
      const placed = [];
      for (const entry of attachments) {
        const { item } = entry;
        if (item.isStack && entry.holder.parentElement !== item.el) continue;
        const zones = [...fixed, ...placed];
        for (const other of items) {
          if (other === item) continue;
          zones.push({ zone: rect(other.box.x, other.box.y, other.box.w, other.box.h), weight: 2 });
          const title = titleZone(other.isStack ? other.docs[0] : other.el, other.el, other.box);
          if (title) zones.push({ zone: title, weight: 30 });
        }
        if (caseBox) zones.push({ zone: caseBox, weight: 400 });
        const box = { x: item.box.x, y: item.box.y, w: item.box.w, h: item.box.h };
        for (const zone of placeAttached(entry, box, zones, bounds)) placed.push({ zone, weight: OBJECT_WEIGHT });
      }
    };

    // Placement for the board's current size (cached by size).
    let placedFor = "";
    let scale = 1;
    let pinRadius = 6;
    let caseBox = null;
    const pinOf = (item) => (item.box && !item.loose ? { x: item.box.x + item.box.pinX, y: item.box.y + item.box.pinY } : null);
    // The title sheet, centred across the top of the board; returns the notch it cuts out of
    // the first row of clusters (in the inner coordinates arrange works in). Its strips of
    // blue tape reach past its top and bottom edges by about half an em.
    const placePlate = (width, height, margin) => {
      caseBox = null;
      if (!caseLabel) return { left: 0, right: 0, h: 0 };
      caseLabel.style.maxWidth = `${round(width * (width < 430 ? 0.9 : 0.72))}px`;
      const w = casePlate.offsetWidth;
      const h = casePlate.offsetHeight;
      const tape = (parseFloat(getComputedStyle(casePlate).fontSize) || 12) * 0.6;
      const x = (width - w) / 2;
      const y = Math.max(6, height * 0.022) + tape;
      caseLabel.style.left = `${round(x)}px`;
      caseLabel.style.top = `${round(y)}px`;
      caseBox = rect(x, y - tape, w, h + tape * 2);
      const gap = 10 * scale;
      return { left: x - margin.x - gap, right: x + w - margin.x + gap, h: y + h + tape - margin.top + gap * 0.6 };
    };
    const place = (width, height) => {
      const compact = width < 430;
      cork.classList.toggle("is-compact", compact);
      // Papers grow with the board (up to about 1.75 times their size on a 520px board), so a
      // wide board holds bigger, more legible papers, not just more slate between them.
      scale = clamp(width / 540, 0.58, 1.75);
      cork.style.setProperty("--board-scale", round(scale * 100) / 100);
      pinRadius = clamp(4.8 * scale, 3.8, 7.2);
      const margin = { x: width * 0.025, top: height * 0.025, bottom: height * 0.03 };
      const innerWidth = width - margin.x * 2;
      const innerHeight = height - margin.top - margin.bottom;
      const notch = placePlate(width, height, margin);
      // Each paper's own shape, measured at a typical width (photos stand tall, index
      // cards lie wide), so the arrangement knows how big each can be in a given cell.
      const probe = 150 * scale;
      for (const item of items) {
        item.el.classList.remove("is-tight");
        item.el.style.height = "";
        item.el.style.width = `${round(probe)}px`;
      }
      for (const item of items) item.aspect = probe / Math.max(1, item.el.offsetHeight + (item.isStack ? 10 * scale : 0));
      for (const cluster of clusters) cluster.labelWidth = cluster.tape.offsetWidth;
      const labelHeight = Math.max(...clusters.map((cluster) => cluster.tape.offsetHeight)) + 5 * scale;
      const widthFor = { note: 0.84, person: 0.94, course: 0.94, award: 0.92, artifact: 0.8 };
      const cap = 220 * scale;
      // A paper's width in a cell: as wide as the cell allows (a little wider in a cluster,
      // so neighbours overlap), no taller than the cell, never huge.
      const sizeOf = (item, cellWidth, cellHeight, crowd) =>
        Math.min(cellWidth * (crowd ? 1.04 : 0.84), cap, cellHeight * 0.98 * item.aspect) *
        (widthFor[item.kind] || 1) *
        (item.el.classList.contains("board-doc--has-portrait") ? 1.12 : 1);
      const regions = arrange(clusters, innerWidth, innerHeight, labelHeight, ties, compact ? 4 : 3, sizeOf, notch);
      const pinTop = clamp(9 * scale, 7, 15);
      // Papers stay roughly one size across the board: none much bigger than the median.
      const planned = [];
      for (const region of regions) {
        const cellsHigh = region.counts.length;
        let k = 0;
        region.counts.forEach((inRow) => {
          for (let c = 0; c < inRow; c++, k++) {
            const item = region.cluster.items[k];
            planned.push(
              sizeOf(
                item,
                (region.width - Math.min(region.width * 0.05, 12 * scale) * 2) / inRow,
                (region.height - region.inset - labelHeight) / cellsHigh,
                region.cluster.items.length > 1
              )
            );
          }
        });
      }
      planned.sort((p, q) => p - q);
      const most = planned[Math.floor(planned.length / 2)] * 1.15;
      for (const region of regions) {
        const { cluster } = region;
        const pad = Math.min(region.width * 0.05, 12 * scale);
        const left = margin.x + region.left + pad;
        // A cluster under the title sheet starts below it, its tape included.
        const tapeTop = margin.top + region.top + region.inset;
        const top = tapeTop + labelHeight;
        const cells = cellsFor(region.counts, left, top, region.width - pad * 2, region.height - region.inset - labelHeight - 4 * scale);
        region.box = { left: margin.x + region.left, top: margin.top + region.top, width: region.width, height: region.height };
        const centre = { x: region.box.left + region.width / 2, y: top + (region.height - region.inset - labelHeight) / 2 };
        const crowd = cluster.items.length > 1;
        cluster.items.forEach((item, index) => {
          const cell = cells[index];
          const w = Math.min(sizeOf(item, cell.width, cell.height, crowd), most);
          const slackX = cell.width - w;
          // Drawn in toward the middle of the cluster, with a little scatter.
          const pull = (centre.x - (cell.left + cell.width / 2)) * (crowd ? 0.16 : 0);
          const x = clamp(
            cell.left + slackX / 2 + pull + item.jitter[0] * Math.min(Math.abs(slackX) * 0.5 + 6, 22 * scale),
            margin.x * 0.5,
            width - w - margin.x * 0.5
          );
          item.cell = cell;
          item.region = region;
          item.box = { x, y: 0, w, pinX: w * (0.5 + item.pinShift), pinY: pinTop };
          const style = item.el.style;
          style.left = `${round(x)}px`;
          style.width = `${round(w)}px`;
          style.setProperty("--tilt", `${round(item.tilt * (compact ? 0.7 : 1))}deg`);
          style.transformOrigin = `${round(item.box.pinX)}px ${round(pinTop)}px`;
        });
        // The cluster's tape, across the top of its region.
        const tape = cluster.tape;
        tape.style.maxWidth = `${round(region.width - pad)}px`;
        const tapeLeft = left + cluster.nudge * Math.max(0, Math.min(region.width * 0.25, region.width - pad * 2 - tape.offsetWidth));
        tape.style.transform = `translate(${round(tapeLeft)}px, ${round(tapeTop + 1)}px) rotate(${round(cluster.tilt)}deg)`;
        cluster.tapeBox = rect(tapeLeft, tapeTop + 1, tape.offsetWidth, tape.offsetHeight);
      }
      // Heights are known only now. A paper taller than its cell (a big photo in a short
      // row, a square sticky note) is narrowed until it fits, keeping its pin in the same
      // place on the paper. Text that would only wrap taller drops its running text first.
      const narrowed = new Set();
      for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (const item of items) {
          const room = item.cell.height * 0.98 - (item.isStack ? 12 * scale : 0);
          const h = item.el.offsetHeight;
          if (h <= room) continue;
          changed = true;
          const top = item.isStack ? item.docs[0] : item.el;
          const shaped =
            Boolean(top.querySelector(":scope > .board-doc-photo img, :scope > .board-scan, :scope > .board-artifact-object")) ||
            getComputedStyle(top).aspectRatio !== "auto";
          const tight = item.el.classList.contains("is-tight");
          if (!tight && (!shaped || narrowed.has(item))) {
            item.el.classList.add("is-tight");
            continue;
          }
          if (!shaped) continue;
          narrowed.add(item);
          const w = Math.max(60, item.box.w * Math.max(0.6, (room / h) * 0.98));
          const ratio = w / item.box.w;
          item.box.x += (item.box.w - w) / 2;
          item.box.w = w;
          item.box.pinX *= ratio;
          item.el.style.left = `${round(item.box.x)}px`;
          item.el.style.width = `${round(w)}px`;
          item.el.style.transformOrigin = `${round(item.box.pinX)}px ${round(item.box.pinY)}px`;
        }
        if (!changed) break;
      }
      for (const item of items) {
        const h = item.el.offsetHeight;
        const slackY = Math.max(0, item.cell.height - h);
        // A pile's lower sheets and its taped tally hang below the top sheet.
        const below = (item.isStack ? 20 : 4) * scale;
        const y = clamp(item.cell.top + slackY * (0.15 + 0.55 * item.jitter[1]), margin.top * 0.5, height - h - below - margin.bottom * 0.4);
        item.box.y = y;
        item.box.h = h;
        item.el.style.top = `${round(y)}px`;
        if (item.isStack) item.el.style.height = `${round(h)}px`;
      }
      placeBoardAttachments(width, height);
      // Tab order follows the board's reading order: cluster by cluster, then row by row.
      const visual = items
        .slice()
        .sort((p, q) => p.region.row - q.region.row || p.region.left - q.region.left || p.cell.row - q.cell.row || p.box.x - q.box.x);
      visual.forEach((item, index) => item.el.style.setProperty("--drop", index));
      if (visual.some((item, index) => list.children[index] !== item.el)) {
        // Moving a paper drops the focus inside it: put it back.
        const focus = list.contains(document.activeElement) ? document.activeElement : null;
        list.append(...visual.map((item) => item.el));
        if (focus && document.activeElement !== focus) focus.focus({ preventScroll: true });
      }
    };

    // Threads and pins for the closed board.
    const threadGroups = new Map();
    const tagFor = new Map();
    const drawBoard = (width) => {
      const stringLayer = groupIn(strings);
      const pinLayer = groupIn(pins);
      threadGroups.clear();
      tags.replaceChildren();
      tagFor.clear();
      for (const link of linkList) {
        const a = pinOf(link.a);
        const b = pinOf(link.b);
        if (!a || !b) continue;
        const path = threadPath(a, b);
        threadGroups.set(link.key, drawThread(stringLayer, strings, path, link.key));
        if (link.labels.length) {
          const tag = element("span", "board-tag", tags);
          tag.textContent = link.labels.join(" · ");
          tagFor.set(link.key, { tag, path, ends: [link.a, link.b] });
        }
      }
      for (const item of items) {
        const point = !item.taped && pinOf(item);
        if (point) drawPin(pinLayer, pins, point, pinRadius, item.color);
      }
      applyTrace();
    };
    // Tags hang on their thread where they cover the least of the others; only the
    // shown ones are placed, starting away from the traced paper (its threads all
    // leave from one pin, so their middles crowd together near it).
    const placeTags = (entries, width, from = null, avoid = []) => {
      const taken = avoid.slice();
      for (const { tag, path, ends } of entries.values()) {
        if (!tag.classList.contains("is-shown")) continue;
        const w = tag.offsetWidth;
        const h = tag.offsetHeight;
        const flip = from && ends?.[1] === from;
        let best = null;
        for (const along of [0.62, 0.72, 0.52, 0.8, 0.44, 0.36]) {
          const t = flip ? 1 - along : along;
          const point = pointOn(path, t);
          const x = clamp(point.x, w / 2 + 3, width - w / 2 - 3);
          const box = { left: x - w / 2, right: x + w / 2, top: point.y - h / 2, bottom: point.y + h / 2 };
          const cover = taken.reduce(
            (sum, other) =>
              sum +
              Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left)) *
                Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top)),
            0
          );
          // Keep clear of the pins at either end.
          const nearPin = [path.a, path.b].some((pin) => Math.abs(pin.x - x) < w / 2 + 6 && Math.abs(pin.y - point.y) < h / 2 + 6);
          const cost = cover + (nearPin ? w * h : 0);
          if (!best || cost < best.cost) best = { x, y: point.y, box, cost };
          if (!cost) break;
        }
        taken.push(best.box);
        // Turned a little with the thread's slope, never upside down.
        const angle = (Math.atan2(path.b.y - path.a.y, path.b.x - path.a.x) * 180) / Math.PI;
        const tilt = clamp((Math.abs(angle) > 90 ? angle - Math.sign(angle) * 180 : angle) * 0.25, -9, 9);
        tag.style.transform = `translate(${round(best.x)}px, ${round(best.y)}px) translate(-50%, -50%) rotate(${round(tilt)}deg)`;
      }
    };

    // Tracing: the hovered or focused item's threads come forward, with their tags.
    let hovered = null;
    let focused = null;
    let active = null;
    const applyTrace = () => {
      cork.classList.toggle("is-tracing", Boolean(active));
      for (const item of items) {
        item.el.classList.toggle("is-active", item === active);
        item.el.classList.toggle("is-linked", Boolean(active) && neighbours.get(item).has(active));
      }
      for (const link of linkList) {
        const on = Boolean(active) && (link.a === active || link.b === active);
        threadGroups.get(link.key)?.classList.toggle("is-active", on);
        tagFor.get(link.key)?.tag.classList.toggle("is-shown", on);
      }
      // The traced paper's own caption stays readable.
      if (active)
        placeTags(
          tagFor,
          cork.clientWidth,
          active,
          active.box
            ? [
                {
                  left: active.box.x,
                  right: active.box.x + active.box.w,
                  top: active.box.y + active.box.pinY + 8,
                  bottom: active.box.y + active.box.h,
                },
              ]
            : []
        );
    };
    const trace = () => {
      const next = fanState ? null : hovered || focused;
      if (next === active) return;
      active = next;
      applyTrace();
    };
    for (const item of items) {
      listen(item.el, "pointerenter", (event) => {
        if (event.pointerType !== "mouse") return;
        hovered = item;
        trace();
      });
      listen(item.el, "pointerleave", (event) => {
        if (event.pointerType !== "mouse") return;
        if (hovered === item) hovered = null;
        trace();
      });
      listen(item.el, "focusin", () => {
        focused = item;
        trace();
      });
      listen(item.el, "focusout", (event) => {
        if (item.el.contains(event.relatedTarget)) return;
        if (focused === item) focused = null;
        trace();
      });
    }

    // Clicks: a link goes where it says; anywhere else on a paper opens it; a pile fans.
    listen(cork, "click", (event) => {
      if (event.target.closest("a[href]")) return;
      const pileButton = event.target.closest(".board-stack-open");
      if (pileButton) {
        const item = items.find((entry) => piles.get(entry)?.button === pileButton);
        if (item) (fanState?.item === item ? closeFan : openFan)(item);
        return;
      }
      const doc = event.target.closest(".board-doc[data-doc]");
      if (!doc || doc.closest("[inert]")) return;
      examine(doc);
    });

    // The close-examine view: every document on the board in reading order (each paper of a
    // pile, each object after the paper it lies on), opened at this one. Closing it hands
    // focus back to the document then shown, or to the pile it is in; opened from a spread
    // pile, the pile is still spread and focus goes back into it.
    const attachedTo = (doc) => attachments.filter((entry) => entry.doc === doc).flatMap((entry) => entry.artifacts.map(({ node }) => node));
    const boardDocs = () => {
      const out = [];
      for (const node of list.children) {
        const item = items.find((entry) => entry.el === node);
        if (!item) continue;
        for (const doc of item.docs) out.push(doc, ...attachedTo(doc));
      }
      return out;
    };
    const shown = (node) => Boolean(node) && node.isConnected && !node.closest("[inert]") && !section.hidden && node.getClientRects().length > 0;
    const examine = (doc) => {
      const view = examiner();
      if (!view) {
        // No examine view: a document with a link goes there; the rest stay on the board.
        [...doc.querySelectorAll(".board-doc-title a[href]")].find((link) => link.closest(".board-doc") === doc)?.click();
        return;
      }
      const docs = boardDocs();
      const fromFan = Boolean(fanState);
      hovered = null;
      trace();
      view.open({
        docs,
        index: Math.max(0, docs.indexOf(doc)),
        root: section.closest("[data-journey]") || document.body,
        context: { ...caseContext },
        onClose: (current) => {
          let target = openers.get(current);
          if (fromFan && !(fanState && shown(target))) target = openers.get(doc);
          if (!shown(target)) {
            const item = itemOfDoc.get(current?.dataset.doc);
            target = item && piles.get(item)?.button;
          }
          if (!shown(target)) target = openers.get(doc);
          if (shown(target)) target.focus();
        },
      });
    };

    // Fan-out: the pile's papers spread in an arc over the dimmed board.
    let fanState = null;
    let fanAnimations = [];
    const layoutFan = (width, height) => {
      if (!fanState) return;
      const { item, inner } = fanState;
      const cards = item.docs;
      const count = cards.length;
      const cap = clamp(210 * scale, 120, 300);
      const top = height * 0.06 + 34 * Math.min(scale, 1);
      const room = height - top - height * 0.05;
      // Papers overlap a little, as a fan; file cards (people) lie side by side, their
      // names and lines clear of their neighbours.
      const lap = cards.every((card) => card.dataset.kind === "person") ? -0.04 : 0.1;
      let plan = null;
      for (let rows = 1; rows <= Math.min(3, count); rows++) {
        const perRow = Math.ceil(count / rows);
        const w = Math.min(cap, (width * 0.94) / (perRow - (perRow - 1) * lap));
        for (const card of cards) card.style.width = `${round(w)}px`;
        const tallest = Math.max(...cards.map((card) => card.offsetHeight));
        const fits = rows * tallest + (rows - 1) * 10 <= room;
        // Bigger papers win, but each extra row costs a little: a fan reads best in one arc.
        const value = w * (1 - 0.18 * (rows - 1));
        if (!plan || (fits && (!plan.fits || value > plan.value))) plan = { rows, perRow, w, tallest, fits, value };
      }
      const { rows, perRow, w, tallest } = plan;
      for (const card of cards) card.style.width = `${round(w)}px`;
      const spacing = Math.min(w * (1 - lap), (width * 0.94 - w) / Math.max(1, perRow - 1));
      const used = rows * tallest + (rows - 1) * 10;
      const pinTop = clamp(9 * scale, 7, 13);
      cards.forEach((card, index) => {
        const row = Math.floor(index / perRow);
        const inRow = Math.min(perRow, count - row * perRow);
        const k = index - row * perRow;
        const offset = k - (inRow - 1) / 2;
        const x = width / 2 + offset * spacing - w / 2;
        const y = top + Math.max(0, (room - used) / 2) + row * (tallest + 10) + offset * offset * 3 * scale;
        const tilt = clamp(offset * 3.2, -9, 9);
        const pinX = w / 2;
        card.style.left = `${round(x)}px`;
        card.style.top = `${round(y)}px`;
        card.style.setProperty("--tilt", `${round(tilt)}deg`);
        card.style.transformOrigin = `${round(pinX)}px ${round(pinTop)}px`;
        card.fanBox = { x, y, w, pinX, pinY: pinTop, tilt };
      });
      inner.style.height = "";
      // The artifacts on each spread paper, kept on the board and clear of the button and
      // of the other papers' titles.
      const bounds = rect(2, 2, width - 4, height - 4);
      const zones = [{ zone: rect(fanClose.offsetLeft, fanClose.offsetTop, fanClose.offsetWidth, fanClose.offsetHeight), weight: 400 }];
      for (const card of cards) {
        const title = card.fanBox && titleZone(card, card, card.fanBox);
        if (title) zones.push({ zone: title, weight: 30, card });
      }
      for (const entry of attachments.filter((each) => each.item === item)) {
        const box = entry.doc.fanBox;
        if (!box) continue;
        const mine = zones.filter((zone) => zone.card !== entry.doc);
        for (const zone of placeAttached(entry, { x: box.x, y: box.y, w: box.w, h: entry.doc.offsetHeight }, mine, bounds))
          zones.push({ zone, weight: OBJECT_WEIGHT });
      }
      drawFan();
    };
    // The spread papers carry their own pins and no thread: the pile is read, not traced.
    const drawFan = () => {
      const pinLayer = groupIn(fanPins);
      if (!fanState) return;
      fanState.item.docs.forEach((card, index) => {
        const box = card.fanBox;
        if (box) drawPin(pinLayer, fanPins, { x: box.x + box.pinX, y: box.y + box.pinY }, pinRadius, PIN_CHOICES[(index + 1) % PIN_CHOICES.length]);
      });
    };

    const cancelFanAnimations = () => {
      for (const animation of fanAnimations) animation.cancel();
      fanAnimations = [];
    };
    const openFan = (item) => {
      if (fanState) closeFan(fanState.item, { instant: true, keepFocus: true });
      const pile = piles.get(item);
      if (!pile) return;
      sound("fan");
      const from = { x: item.box.x + item.box.pinX, y: item.box.y + item.box.pinY, tilt: item.tilt, w: item.box.w };
      fanState = { item, inner: pile.inner };
      hovered = null;
      focused = null;
      trace();
      // Tab keeps to the spread papers until the pile is put back; the name says how.
      fanCards.setAttribute("aria-label", `${pile.title}, spread out. Press Escape or “Put the ${lower(pile.title)} back” to leave`);
      fanClose.textContent = `Put the ${lower(pile.title)} back`;
      for (const [doc, holder] of pile.holders) doc.append(holder);
      fanCards.append(pile.inner);
      pile.inner.inert = false;
      list.inert = true;
      item.el.classList.add("is-open");
      pile.button.setAttribute("aria-expanded", "true");
      fan.hidden = false;
      cork.classList.add("is-fanned");
      layoutFan(cork.clientWidth, cork.clientHeight);
      if (!reducedMotion.matches && typeof fan.animate === "function") {
        cancelFanAnimations();
        fanAnimations.push(fanBackdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }));
        for (const layer of [fanPins, fanClose]) {
          fanAnimations.push(layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 300, fill: "backwards" }));
        }
        fan.classList.add("is-moving");
        item.docs.forEach((card, index) => {
          const box = card.fanBox;
          const dx = from.x - (box.x + box.pinX);
          const dy = from.y - (box.y + box.pinY);
          fanAnimations.push(
            card.animate(
              [
                { translate: `${round(dx)}px ${round(dy)}px`, rotate: `${round(from.tilt)}deg`, scale: round((from.w / box.w) * 100) / 100 },
                { translate: "0px 0px", rotate: `${round(box.tilt)}deg`, scale: 1 },
              ],
              { duration: 420, delay: index * 30, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)", fill: "backwards" }
            )
          );
        });
        const spreading = fanAnimations.slice();
        Promise.all(spreading.map((animation) => animation.finished.catch(() => {}))).then(() => {
          if (fanState?.item === item && fanAnimations.every((animation) => spreading.includes(animation))) fan.classList.remove("is-moving");
        });
      }
      const first = openers.get(item.docs[0]);
      first?.focus({ preventScroll: true });
    };
    const closeFan = (item = fanState?.item, { instant = false, keepFocus = false } = {}) => {
      if (!fanState || fanState.item !== item) return;
      const pile = piles.get(item);
      const state = fanState;
      fanState = null;
      // Instant closes are the board's own housekeeping (another pile, teardown): silent.
      if (!instant) sound("gather");
      const finish = () => {
        cancelFanAnimations();
        for (const card of item.docs) {
          for (const key of ["left", "top", "width", "transformOrigin"]) card.style[key] = "";
          card.style.removeProperty("--tilt");
          delete card.fanBox;
        }
        item.el.querySelector(".board-stack-title").after(state.inner);
        state.inner.inert = true;
        for (const [, holder] of pile.holders) item.el.append(holder);
        list.inert = false;
        item.el.classList.remove("is-open");
        fan.hidden = true;
        fan.classList.remove("is-closing", "is-moving");
        cork.classList.remove("is-fanned");
        groupIn(fanPins);
        placedFor = "";
        layout();
      };
      pile.button.setAttribute("aria-expanded", "false");
      // The board comes back to life first: focus can't land inside an inert subtree.
      list.inert = false;
      if (!keepFocus) pile.button.focus({ preventScroll: true });
      if (instant || reducedMotion.matches || typeof fan.animate !== "function") {
        finish();
        return;
      }
      cancelFanAnimations();
      fan.classList.add("is-closing", "is-moving");
      const to = { x: item.box.x + item.box.pinX, y: item.box.y + item.box.pinY };
      const moves = item.docs.map((card) => {
        const box = card.fanBox;
        return card.animate(
          [
            { translate: "0px 0px", rotate: `${round(box.tilt)}deg`, scale: 1 },
            {
              translate: `${round(to.x - (box.x + box.pinX))}px ${round(to.y - (box.y + box.pinY))}px`,
              rotate: `${round(item.tilt)}deg`,
              scale: round((item.box.w / box.w) * 100) / 100,
            },
          ],
          { duration: 300, easing: "cubic-bezier(0.5, 0, 0.75, 0.2)", fill: "forwards" }
        );
      });
      fanAnimations.push(...moves, fanBackdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }));
      Promise.all(moves.map((move) => move.finished.catch(() => {}))).then(finish);
    };
    listen(fanClose, "click", () => closeFan());
    listen(fanBackdrop, "click", () => closeFan());
    listen(fan, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFan();
        return;
      }
      if (event.key !== "Tab") return;
      // Focus stays among the spread papers until the pile is put back.
      const stops = focusables(fan);
      if (!stops.length) return;
      const index = stops.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        stops[stops.length - 1].focus();
      } else if (!event.shiftKey && index === stops.length - 1) {
        event.preventDefault();
        stops[0].focus();
      }
    });
    // A press anywhere else on the page puts the pile back (but not in the examine view).
    listen(document, "pointerdown", (event) => {
      if (!fanState || fan.contains(event.target) || event.target.closest?.(EXAMINE)) return;
      if (event.target.closest?.(".board-stack-open") && fanState.item.el.contains(event.target)) return;
      closeFan(fanState.item, { keepFocus: true });
    });

    let laidOut = false;
    const layout = () => {
      if (!cork.isConnected) return;
      const width = cork.clientWidth;
      const height = cork.clientHeight;
      if (!width || !height) return;
      const key = `${width}x${height}`;
      if (key !== placedFor) {
        placedFor = key;
        place(width, height);
      }
      drawBoard(width);
      if (fanState) layoutFan(width, height);
      laidOut = true;
    };

    let frame = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        layout();
      });
    };
    // Sizes, web fonts and pictures all change the papers' heights.
    const replace = () => {
      placedFor = "";
      schedule();
    };
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(cork);
    if (!resizeObserver) listen(window, "resize", schedule);
    document.fonts?.ready.then(() => section.journeyBoard === instance && replace());
    for (const image of surface.querySelectorAll("img")) {
      if (!image.complete) listen(image, "load", replace);
    }
    listen(document, "site-theme-change", schedule);

    // Entrance: the papers are pinned up one by one, then the threads are strung.
    let animations = [];
    let showToken = 0;
    const stopAnimations = () => {
      for (const animation of animations) animation.cancel();
      animations = [];
    };
    const arm = () => {
      if (!reducedMotion.matches) cork.classList.add("is-armed");
    };
    const disarm = () => {
      cork.classList.remove("is-armed");
      schedule();
    };
    const show = () => {
      ++showToken;
      stopAnimations();
      cork.classList.remove("is-armed");
      layout();
      if (reducedMotion.matches || typeof cork.animate !== "function") return;
      const order = [...(caseLabel ? [caseLabel] : []), ...list.children];
      order.forEach((node, index) => {
        animations.push(
          node.animate(
            [
              { opacity: 0, translate: "0px -8px", scale: 1.035 },
              { opacity: 1, translate: "0px 0px", scale: 1 },
            ],
            { duration: 360, delay: index * 45, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "backwards" }
          )
        );
      });
      const strung = order.length * 45 + 260;
      animations.push(pins.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: strung - 120, fill: "backwards" }));
      animations.push(strings.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: strung, fill: "backwards" }));
    };

    const destroy = () => {
      showToken++;
      stopAnimations();
      if (fanState) closeFan(fanState.item, { instant: true, keepFocus: true });
      if (frame !== null) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      for (const cleanup of cleanups) cleanup();
      surface.classList.remove("is-mounted");
      if (caseLabel) {
        surface.append(caseLabel);
        for (const key of ["left", "top", "maxWidth"]) caseLabel.style[key] = "";
      }
      surface.append(list);
      cork.remove();
      list.inert = false;
      for (const item of items) {
        for (const key of ["left", "top", "width", "height", "transformOrigin"]) item.el.style[key] = "";
        item.el.style.removeProperty("--tilt");
        item.el.style.removeProperty("--drop");
        item.el.classList.remove("is-active", "is-linked", "is-open", "is-taped", "is-tight");
      }
      // Reading order back as written.
      items.forEach((item) => list.append(item.el));
      for (const [doc, button] of openers) {
        button.remove();
        doc.querySelectorAll("a[tabindex='-1']").forEach((link) => link.removeAttribute("tabindex"));
      }
      for (const [item, pile] of piles) {
        pile.button.remove();
        pile.inner.inert = false;
        for (const [doc, holder] of pile.holders) doc.append(holder);
      }
      for (const entry of attachments) {
        for (const { node } of entry.artifacts) {
          for (const key of ["left", "top", "width"]) node.style[key] = "";
          node.style.removeProperty("--attach-tilt");
        }
      }
      for (const stack of generated) {
        stack.before(...stack.querySelectorAll(STACKED));
        stack.remove();
      }
      detachLoose();
      delete section.journeyBoard;
    };

    const instance = {
      layout,
      show,
      arm,
      disarm,
      destroy,
      get ready() {
        return laidOut;
      },
    };
    section.journeyBoard = instance;
    layout();
    return instance;
  };

  window.JourneyBoard = { mount };
})();

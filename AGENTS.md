# Agent Guidelines

This is Jiatuo "Charlie" Zou's personal academic website, based on
[RayeRen's AcadHomepage](https://github.com/RayeRen/acad-homepage.github.io).
The owner explicitly requested a complete migration away from al-folio.

- Read .github/copilot-instructions.md and docs/TEMPLATE.md before editing.
- Runtime layout/style files are now site-owned; there are no al-folio plugins.
- Preserve the straightforward sidebar layout. Main content uses the owner's
  requested Newsreader typography; the banner and navigation remain sans-serif.
- Keep all publication metadata in \_bibliography/papers.bib. The local Ruby generator
  adapts BibTeX to the native paper-box includes on both publication routes.
- Preserve publication status, authorship, and existing links. Do not invent CV facts.
- My Journey content lives only in \_data/journey.yml (stops, docs, stacks, threads,
  artifacts with medium/attach, scans, portraits; its header comment is the schema).
  Take every fact from the CV, papers.bib, about.md, or what Jiatuo has stated
  directly; never publish the CV phone number. Pictures from others need a free licence
  (PD, CC0, CC BY, CC BY-SA, checked on the source page), credit/credit_link, and a row
  in assets/img/journey/CREDITS.md; the few used at Jiatuo's request are marked there as
  not openly licensed. An item with no suitable picture is left out, and artifacts are
  transparent PNG cutouts only. See docs/TEMPLATE.md for the split view, map, board,
  examine window, and sound contracts.
- The section is a timeline strip over a split view: the Map pane (left) and the Board
  pane (right) at fixed sizes ("Expand map" opens the map in a window); any document
  opens in a centred examine window. Board titles are a paper sheet held by two strips of blue painter's tape.
- The map is MapLibre GL JS 5.x, vendored in assets/vendor/maplibre-gl (keep its
  LICENSE.txt), with NASA GIBS imagery, OpenFreeMap tiles, and AWS terrain; keep their
  attribution. Its lighting follows the real clock; ?journey-time=<ISO> pins it in tests.
  The boards' street maps come from OpenStreetMap via bin/build_journey_maps.py.
- Night overrides for My Journey and the PhD callout sit at the bottom of their own
  partials (inside @media screen, html[data-theme="dark"]), not in \_sass/\_theme.scss.
- Do not reintroduce starter demo content or al-folio upgrade checks.
- Keep imported template provenance and license notices intact.

Commands from repo root:

    docker compose up --build
    bundle install
    bundle exec jekyll build
    bundle exec jekyll serve --host 127.0.0.1 --port 4000
    npm ci
    npm run lint:template
    npx playwright install chromium webkit
    npm run test:visual

Use NO_WEBSERVER=1 when running tests against an already-started server, e.g.
NO_WEBSERVER=1 SITE_URL=http://127.0.0.1:8080 npx playwright test --config
test/visual/playwright.config.js journey.spec.js for My Journey (it stubs the tile hosts).
GitHub Actions builds Jekyll with local plugins, then deploys \_site to gh-pages.
Pushing main/master publishes the website; local edits and branches do not.

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
  not openly licensed (the Linktop and cord product images, and Google's Pixel Watch 3
  model). An item with no suitable picture is left out, and artifacts are
  transparent PNG cutouts only. See docs/TEMPLATE.md for the split view, map, board,
  examine window, and sound contracts.
- An artifact may also have a 3D model (model, model_size_m, optional model_yaw,
  model_pitch, model_pitch_min and model_fov in \_data/journey.yml; assets/models/journey/<doc id>.glb), made from its
  photo by a local image-to-3D generator kept outside the repo (C:/Users/charl/tools/journey-3d).
  Only the examine window shows it, and only on request: the window opens on the cutout
  (kicker "Object", nothing 3D requested) with a "See 3D model" button beside the zoom;
  pressing it loads assets/js/journey-model.js and three.js and cross-fades to the model,
  with the note "This 3D model was reconstructed from a photo and may not be accurate."
  (or the artifact's model_note) over the view's foot, and "Show photo" fades back and disposes it. The board keeps the
  cutout, and without WebGL or on any failure the window does too, the button reading
  "3D model unavailable" (phone WebKit has WebGL 2 and shows the 3D view). The model's first frame must
  be the cutout's picture: model_yaw/model_pitch (and model_fov, the lens, for a photo
  taken close up) are the photo's view (find them with bin/fit_journey_model_pose.js,
  which scores silhouettes in the real viewer), the viewer
  fits the silhouette to the cutout's opaque box, and nothing turns in. A model that looks
  like a blob or a toy, or that is not the real object from every side, is not used: no
  model field. Credit
  each model in CREDITS.md (source photo, its licence, the generator). The Pixel Watch
  for SensorClaw is the exception, at Jiatuo's request: Google's own Pixel Watch 3 model
  (Explore Pixel Watch 3 in 3D; © Google, not openly licensed, its marks kept), rebuilt by
  bin/build_journey_models.py from the "import" block in bin/journey_models.json (sha256
  checked, Draco decoded, scaled to 41 mm, recoloured, band laid flat, Jiatuo's screen from
  the cutout); its yml model_note and model_kicker say it is based on Google's product
  model. Never put Jiatuo's raw photos, or the watch's device ID, in the repo or a model.
  See docs/TEMPLATE.md, "3D models of the artifacts".
- The section is a timeline strip over a split view: the Map pane (left) and the Board
  pane (right) at fixed sizes ("Expand map" opens the map in a window); any document
  opens in a centred examine window. Board titles are a paper sheet held by two strips of blue painter's tape.
- The map is MapLibre GL JS 5.x, vendored in assets/vendor/maplibre-gl (keep its
  LICENSE.txt), with NASA GIBS imagery, OpenFreeMap tiles, and AWS terrain; keep their
  attribution. Its lighting follows the real clock; ?journey-time=<ISO> pins it in tests.
  The boards' street maps come from OpenStreetMap via bin/build_journey_maps.py.
- three.js 0.187 is vendored in assets/vendor/three (keep its LICENSE; MIT) by
  bin/vendor_three.sh, as static browser files. Never run downloaded npm package code in
  Node.
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

# AcadHomepage migration

The owner requested a complete replacement of al-folio with
[RayeRen/acad-homepage.github.io](https://github.com/RayeRen/acad-homepage.github.io),
using a more conventional academic presentation.

## Template provenance

Imported upstream commit: 2cc1577eeaf2f74dede6d016a70722dbd409ea2f.
Imported on October 12, 2026: layouts, includes, Sass (including Susy/Breakpoint),
stylesheet entry point, bundled JavaScript, icon fonts, and the MIT license.
The native Jekyll option described in the upstream Gemfile is used. Jekyll 3.10
matches its Sass runtime; the final Gemfile/lockfile contain no al-folio gems.

The presentation follows the upstream profile sidebar, compact masthead, white
background, sans-serif text, blue links, and paper-box teasers. The earlier serif,
burgundy editorial redesign is preserved at commit b07d7fc on
redesign/academic-portfolio. The migration is on migration/acad-homepage.

## Preserved content

- Biography and Fall 2027 PhD application statement.
- All five bibliography entries, author order, equal-contribution notes, venues,
  under-review status, abstracts, paper/poster/DOI/video links, and teaser images.
- Profile photo, personal PDFs (including assets/pdf/cv.pdf), and research videos.
- All three news entries and their original dates.
- Existing Google Scholar citation data and scheduled updater. The updater now reads
  author.googlescholar in \_config.yml, keeping the profile URL as the source of truth.

Removed: al-folio gems/configuration, default example posts/projects/books/assets,
unused Einstein CV data, al-folio Docker helpers, template-specific starter docs,
obsolete plugin integration/upgrade/parity checks, and their workflows. The existing
deployment method to gh-pages is retained with a simpler native Jekyll build.
A replacement Docker preview now uses a Ruby image, the current Gemfile.lock,
and container-local build/cache paths. Run docker compose up --build and open
http://localhost:8080/. It does not depend on the old al-folio image.

## Edit content

- Name, contact links, affiliation, and site URL: \_config.yml.
- Masthead links: \_data/navigation.yml.
- Biography and homepage sections: \_pages/about.md.
- Research interests show sensing → sensemaking → interaction → new sensing as
  a closed loop in \_includes/research-cycle.html. The original, accessible SVG
  places people and context at the center, with a visible return arrow from
  interaction to sensing. Detailed descriptions sit alongside it on desktop and
  below it on phones. Sensing captures signals; sensemaking understands them;
  interaction responds and produces new signals. The separate feedback callout
  was removed at the owner's request. The copy describes interests and goals.
- News: \_news/\*.md (date plus Markdown content).
- Publications: \_bibliography/papers.bib. \_plugins/publications.rb reads BibTeX once
  and exposes structured data to the native paper-box includes on the homepage and
  /publications/. No generated data copy needs to be edited.
- All publications appear together in one list, without category filters.
- A search bar on both routes filters titles, authors, venues, years, project
  names, research keywords, summaries, and abstracts. Search is case-insensitive
  and matches all entered words. Clear or Escape restores the complete list.
  Search is hidden without JavaScript, while all papers remain accessible.
- summary and preview_alt supply concise descriptions and accessible image text.
- Upload PDFs to assets/pdf, demos to assets/video, and teasers to
  assets/img/publication_preview. Replace assets/pdf/cv.pdf to update the CV.
- preview also accepts an absolute site path to an image or GIF. video_preview
  opens the short preview from both the thumbnail and the Preview link; video
  supplies the separate Video link. Both use the accessible video dialog.
- research/video contains the supplied OLIVE and Delegate the Details animated
  GIFs. OLIVE uses the compact 640x360 GIF and a 1280x640 H.264/AAC web copy of
  uist26a-sub6239-i8 (2).mp4 from Documents/Research/Videos, with the entire
  five-minute video preserved. The original source files remain unchanged.
  Delegate uses the existing assets/video/delegate_teaser.mp4 for its thumbnail,
  Preview link, and Video link, as confirmed by the owner. Both papers already
  have their videos available locally; no additional upload is needed.

## Local adaptations

The owner requested section and text styling based on Ruiqi Chen's homepage.
Main content uses locally hosted Newsreader, navy headings, subtle section rules,
and larger publication titles and author lists. News and Publications have small
section icons matching the reference. The author's name is rendered as semantic
strong text at weight 800 in navy across all five publications. Navigation and
banner contacts retain their sans-serif typography; the banner name uses Newsreader.
The trailing Research Experience and Education/CV sections and their Experience/CV
masthead links were removed at the owner's request. The CV remains accessible from
the profile banner. Cascade says "Submitted to CHI 2027; under review."
The extra equal-contribution/Scholar/archive line above the list was removed;
OLIVE's own equal-contribution annotation remains with the paper.

A day/night switch sits at the right of the masthead. A visitor's choice is saved in
localStorage as site-theme; until they choose, the site follows their system setting.
An inline script in \_includes/head.html sets data-theme on the html element before the
stylesheet loads, avoiding a flash of the wrong theme. \_sass/\_theme.scss holds the
switch and the night palette, which only overrides day styles and applies to screens,
so printing stays light; the native profile prints instead of the banner canvas.
Add a night override there when adding a new color elsewhere. The one exception is
My Journey and the PhD callout, whose night overrides sit at the bottom of their own
partials (see My Journey below).
assets/js/site.js fires site-theme-change, and the banner reprints its texture from the
--banner-cloth-\* variables in \_sass/\_profile-banner.scss. Without JavaScript the site
stays in day mode and the switch is hidden. Text transitions are disabled while the
theme-switching class is set, so colors read for that print are never mid-fade.

\_sass/\_site.scss contains small layout/accessibility adaptations and paper controls.
assets/js/site.js provides video dialogs and menu ARIA
state. Native links, abstracts, profile contacts, and page navigation work without
JavaScript. Head links and avatar URLs support both domain-root and subpath builds;
the template's global new-tab base element was removed. Unconfigured analytics and
upstream Scholar branch fetches are disabled. Navigation has explicit stable anchors.
The imported default layout referenced a missing compress layout; that reference was
removed rather than adding an unrelated compression dependency.

The sidebar profile is now a suspended personal banner, requested by the site owner.
Its content is still native HTML with working contacts and academic links. A small JZ
monogram appears near the hem. Styling lives in \_sass/\_profile-banner.scss.
The banner matches the site's academic presentation: light ivory cloth, navy print,
a fine gold edge, muted brass spindle ends, and a simple rectangular portrait.
The pointed pennant hem is transparent in the print
texture itself, so its edges bend with the physics mesh. Static and keyboard
fallbacks use the same silhouette in CSS. The top coil renders earlier wound
layers beneath the pointed outer turn, avoiding transparent holes when rolled.
assets/js/cloth-physics.js simulates a three-dimensional cloth mesh
with pinned top vertices, structural/shear/bending constraints, inertia and damping.
Material-order constraints and bounded depth gradients prevent inverted triangles
and tangled folds under fast pointer sweeps. Time-step-aware inertia and damping
keep frame-rate changes from adding energy to the sheet.
Mouse pressure acts like a rounded fingertip everywhere on the fabric, including
over contact links; the cloth rebounds when released. Short, gentle gusts occur
between long quiet intervals.
assets/js/cloth-renderer.js lights the mesh from its actual surface normals using
WebGL. A Canvas 2D renderer preserves the interaction when WebGL is unavailable or
its context is lost; shading normals interpolate smoothly and completed frames are
copied from a back buffer to avoid faceting and flicker.
assets/js/profile-banner.js builds a 2x-3x-resolution print texture from the actual
HTML profile and loaded photo/fonts. The photo and type bend with the fabric rather
than floating above a moving background. Native anchors and accessible text stay in
the DOM, with click targets following the mesh. Hovering links does not pause motion.
Keyboard focus restores the visible, stationary HTML profile. Reduced motion, hidden
tabs, and offscreen banners stop simulation. Coarse pointers retain ordinary touch
navigation. Without JavaScript the profile uses a static CSS fabric surface.
The desktop sidebar is 260px wide, with a larger photo and more readable contact
type; the mobile banner grows up to 320px while retaining space for its shadow.
Short suspension loops and exposed dowel ends replace the triangular wire hanger.
The top sleeve and rolled fabric use an explicitly lit cylindrical mesh.
Clicking a non-link part of the fabric, or its top coil, winds it around the fixed
top spindle. Clicking the closed scroll unrolls it; there is no visible button or
toolbar. A transparent, keyboard-focusable hit area on the coil supports Enter and
Space and exposes the expanded state. Contact links keep their native click action.
assets/js/scroll-physics.js drives winding with angular inertia, spring torque,
gravity, friction, and soft end stops. Radius grows with the stored material, and
feeding/braking sends a small tension ripple through the still-live cloth. Reversing
mid-motion preserves angular velocity, brakes, and then changes direction.
The cylinder stays at the top throughout. A shared material coordinate clips the
sheet and maps its print continuously onto the winding surface; fully closing it
hides the entire photo and restores it on opening. Rolled contacts are inert and
hidden from accessibility navigation until the scroll opens. Reduced motion uses
an immediate state change.
Resizing preserves the current scroll state, and printing always shows the profile.
The native overflow navigation also re-measures its list after font/layout changes,
avoiding a WebKit overflow caused by restoring links before their widths settle.

## PhD callout

The "Applying to PhD programs · Fall 2027" box is the first element of
\_pages/about.md, above About Me, and replaces the old closing paragraph. It is plain
HTML (id phd-applications) with an Email me mailto link to site.author.email and a
View CV link to site.author.cv. Styling, reduced motion, and its night palette live in
\_sass/\_phd-callout.scss. Edit the wording there in about.md; remove the aside once
applications close. The Evanston board's "Next stop?" note links to #phd-applications.

## My Journey

The last homepage section (#journey, also the masthead's Journey link, which glides there
with the theme's smooth scroll like every other masthead link, and jumps under reduced
motion; only #journey-<id> links use native fragment navigation) is a compact
timeline strip, straight under the "My Journey" heading (there is no intro sentence; the
strip has a small top margin), above a split view: a live globe (the Map pane) beside one detective
board per place (the Board pane). Any document on a board opens in a close-examine
window. Edit only \_data/journey.yml for content; its header comment is the schema.
Every fact must come from assets/pdf/cv.pdf, \_bibliography/papers.bib,
\_pages/about.md, or what Jiatuo has stated directly (Hangzhou before 2017;
Westminster Academy, Fort Lauderdale, 2017-2021, salutatorian of the class of 2021;
FRC Team 744 in the 2019 and 2020 seasons). Never invent facts, and never publish the
CV's phone number.

Files:

- \_data/journey.yml: the stops, their documents, stacks, and threads.
- \_includes/journey.html: the timeline strip, the split view, the Board pane and every
  board (with its title sheet); it includes \_includes/journey-map.html (the Map pane and
  its figure). \_includes/journey-doc.html draws one document (and, nested inside it, the
  artifacts attached to it); \_includes/journey-doc-text.html is the document's text.
- assets/js/journey.js: controller (ARIA tabs, #journey-<id> links, the split view,
  map and boards in step).
- assets/js/journey-map.js: the MapLibre globe, pins, route, daylight, and clock.
- assets/js/journey-board.js: the boards, clusters, threads, piles, and artifacts.
- assets/js/journey-examine.js: the close-examine window (window.JourneyExamine).
- assets/js/journey-model.js: the examine window's 3D viewer for artifacts with a model
  (an ES module that journey-examine.js imports with import() only when "See 3D model" is
  pressed in such an object's window; it imports three.js from assets/vendor/three/).
- assets/js/journey-sound.js: sound effects (always on; no switch).
- \_sass/\_journey-map.scss (globe), \_journey-board.scss (boards, papers, title sheet,
  portraits), \_journey-examine.scss (examine window), and \_journey-layout.scss
  (timeline strip and split view), imported in that order in assets/css/main.scss.
  \_includes/scripts.html loads journey-sound, journey-map, journey-board,
  journey-examine, then journey.js, all deferred.
- assets/vendor/maplibre-gl/: MapLibre GL JS 5.24.0 (maplibre-gl.js, .css, LICENSE.txt).
- assets/vendor/three/: three.js 0.187.0 (MIT, LICENSE kept): build/three.module.min.js
  and three.core.min.js, and the addons GLTFLoader, RoomEnvironment, BufferGeometryUtils,
  SkeletonUtils and the meshopt decoder, as static browser files (never run in Node).
  bin/vendor_three.sh fetches them (jsDelivr's minified builds of the npm release, plus
  LICENSE from the npm tarball) and points their imports at each other, so no import map
  is needed; VERSION.txt records the release. Prettier ignores assets/vendor/.
- assets/models/journey/: the artifacts' 3D models (<doc id>.glb), made from photos of
  the objects, or adapted from the maker's own model (the Pixel Watch; see "3D models of the
  artifacts" below).
- assets/data/journey-map/: bundled NASA imagery (blue-marble/{0..2}/{x}/{y}.jpg and
  night-lights.jpg), so the globe paints even when the tile hosts are unreachable, plus
  ocean-mask.png (the sun glint) and starfield.png (the space backdrop). Both were
  generated for this site with Pillow, no outside artwork: the ocean mask is a 512 px
  Web Mercator water mask derived from the bundled zoom-2 Blue Marble tiles (public
  domain), and the starfield is a tileable 512 px transparent PNG of procedurally placed
  stars. The map's sources are named in its own attribution control (the (i) button).
- assets/img/journey/: place and project photos; artifacts/ (transparent PNG cutouts);
  docs/ (scans of diplomas and paper first pages); people/ (portraits); maps/ (the
  boards' street maps, with their own CREDITS.md); textures/ (with its own CREDITS.md).
  CREDITS.md lists every picture that is not Jiatuo's own.
- assets/audio/journey/: sound effects, with CREDITS.md.
- bin/build_journey_maps.py: rebuilds assets/img/journey/maps/<stop-id>.svg.
- bin/build_journey_textures.py: rebuilds the generated paper, fold, wear and tape textures in
  assets/img/journey/textures/ (NumPy + Pillow, fixed seeds, no outside artwork).
- bin/build_journey_pixelated.py: rebuilds the pixelated stand-ins (<name>.pixel.jpg) of
  the portraits in assets/img/journey/people/ and of the team photo.
- bin/vendor_three.sh: re-vendors three.js into assets/vendor/three/ (sh, curl, sed).

### Content schema (\_data/journey.yml)

- Stops are listed oldest first: hangzhou-early (the Daguan area, before 2017),
  fort-lauderdale (2017-2021), champaign (2021), hangzhou (2024), new-york (2024-2026),
  evanston (2026-now). Each has id, name, short (timeline and pin name), year (the
  timeline label; otherwise the first four characters of start), lat/lon (decimal
  degrees), start/end (YYYY-MM, or a quoted "YYYY" when only the year is known; start
  may be blank), period, summary, docs, optional stacks, and threads. The map draws the
  route in list order and dims older legs. current: true marks where Jiatuo is now; it
  is the default tab and the map's reference point. tz (an IANA time zone) on the
  current stop sets the map clock's zone; without it the clock shows local solar time.
  Links of the form #journey-<id> open that place.
- Documents (docs) appear in reading order with a unique id, a kind (place, education,
  lab, project, paper, person, course, work, award, note, photo, artifact), and a title.
  meta, dates, body, stamp, and link are optional; link accepts a URL, a site path, or
  #paper-<BibTeX key>. image is a site path with image_alt; image_fit: contain shows a
  tall picture on white whole, as an upright print, instead of cropping it.
- Pictures: every photo and artifact doc has an image. An item that would need a picture
  but has none suitable is left out entirely, never shown as a text-only card. Plain fact
  docs (education, lab, person, course, paper, work, award, note) need none.
  credit ("Author, License") and credit_link (the source page) are required for any
  picture not made by Jiatuo; the board prints them as a linked "Photo:" or "Image:"
  line. Re-encode photos to about 1200 px wide and at most ~220 KB, with metadata
  stripped. Paper teasers reuse assets/img/publication_preview with the preview_alt text
  from papers.bib.
- Artifacts (kind: artifact) are real objects tied to the work (a device it ran on, a
  sensor it read). medium: cutout is the only kind to use: a PNG in
  assets/img/journey/artifacts/ with a transparent background and a clean edge. Never
  use a drawing, a plain photo, or a different model; leave the object out instead.
  Name a model only when the CV or Jiatuo names it. attach: <doc id> lays the object on
  that document, over its bottom edge or a lower corner, under only its own contact and
  drop shadows (no tape, pin, tag, or string); it moves with the document and does not
  count as a board item. medium photo and the legacy bag are deprecated.
- An artifact's 3D model (optional; the board always keeps the cutout): model, the site
  path of a glTF binary (assets/models/journey/<doc id>.glb); model_size_m, the object's
  real longest side in metres (required with a model: it sets the scale, so the contact
  shadow and lighting read true); model_yaw, its resting turn in degrees (default -20, the
  front turned a little toward the lamp at the upper left; positive turns the front to
  the viewer's right); model_pitch, how high above the table it is seen at rest, in
  degrees (default 16, within 0 to 75); model_pitch_min, how low a visitor may tip the
  view (default 0, level with the table; -35 to 70); model_fov, the viewer's lens, its
  vertical field of view in degrees (default 20; 10 to 50), wider for a photo taken close
  up (the 2019 robot's, 45). Set model_yaw and model_pitch (and model_fov if needed) to the
  photo's view (bin/fit_journey_model_pose.js finds it): the model's first frame is then
  the cutout's picture. A model not made from the photo says what it is: model_note, the note
  under it (default "This 3D model was reconstructed from a photo and may not be accurate."),
  and model_kicker, the kicker while it shows (default "Object, 3D model from a photo"); the
  Pixel Watch's are "3D model source: Google's Pixel Watch 3 product model." and "Object, 3D model". journey-doc.html renders them, on
  artifacts only, as data-model, data-model-size, data-model-yaw, data-model-pitch,
  data-model-pitch-min, data-model-fov, data-model-note and data-model-kicker.
- Real documents: scan_kind diploma (a scan of the diploma on cream stock), paper-page
  (a paper's first page as a stapled printout), or cover (a closed, padded diploma cover
  with a plain typed label, for a diploma with no scan yet; Westminster Academy). scan
  (assets/img/journey/docs/<doc id>.jpg), scan_alt, scan_width/scan_height (the pixel
  size, for a stable layout), and scan_label (a cover's label; default the title). Scans
  are Jiatuo's own documents; use only a paper's first page or the diploma page itself
  (page 2 of the UIUC eDiploma PDF), never a page with a registrar's details.
  Diplomas are redacted at the owner's request (identity-theft caution): only the
  institution's name, Jiatuo's name, the degree and the honours stay legible. Everything
  else is rebuilt from a tiny copy of the page (the text from 1/40 of the width, the
  signatures, seals and dates from 1/90), so the detail is destroyed, not just blurred, in
  both the board scan and the examine view's -large.jpg. Regenerate all four files with
  bin/build_journey_diplomas.py, passing the paths of the owner's two PDFs (which are never
  in the repository) and the output folder; never add an unredacted diploma image.
- Portraits (person docs): portrait (assets/img/journey/people/<name>.jpg, a square
  head-and-shoulders crop of about 400 px), portrait_alt, portrait_credit (the full line,
  e.g. "Photo: <source page title>"), and portrait_credit_link. Use only an openly
  licensed photo or one from the person's own official profile (lab or university page,
  personal homepage); never social media or news photos. No suitable photo: leave it out.
- Pixelated stand-ins: portrait_pixel (people/<name>.pixel.jpg) on each person with a
  portrait, and image_pixel on a photo of people (the FRC Team 744 team photo), both made
  by bin/build_journey_pixelated.py (a BOX downscale and a NEAREST upscale to the same
  size: 24 cells across a portrait, 80 across the team photo; mild, so outlines and
  clothing still read). The board shows the stand-in; the examine view shows a portrait's
  stand-in until "Reveal photo" (the team photo too), and the revealed team photo still
  has a black bar over everyone's eyes but Jiatuo's, baked into the file (the unredacted
  photo is never in the repository). Rerun the script after changing a portrait or the team photo.
  Markup: a portrait's img (and the team photo's) shows the stand-in, class
  board-private, its alt starts "Pixelated until revealed.", and data-original /
  data-original-alt carry the photo. On the board (and in a spread pile, and in the
  filmstrip) a board-private picture is also strongly blurred (blur(8px) on a portrait,
  10px on the team photo, slightly desaturated), clipped inside its print, so no head
  shape or contour reads; the examine view shows the mild pixelation unblurred until
  "Reveal photo". The JavaScript-free page shows the blurred stand-ins too.
- Notes: medium sticky or notebook. The Evanston board's "Next stop?" note links to
  #phd-applications.
- Stacks: stacks lists piles (id, title), and each stacked doc names its pile in stack.
  A pile sits where its first doc appears, under one pin. Stack ids are unique across
  all boards (they become page ids, #board-stack-<id>). Keep each board to at most nine
  top-level items (unstacked docs plus stacks; attached docs don't count); the script
  piles any extras by kind.
- Threads: [from-id, to-id, label], both ids on the same board. A thread to a stacked
  doc ends at its pile's pin while the pile is closed. Threads are also a visually
  hidden list for screen readers.

### Layout: timeline strip and split view

assets/js/journey.js turns the timeline strip into ARIA tabs (arrows, Home and End move
focus; Enter, Space, or a click selects; one board is shown at a time) and keeps the
map and boards in step. The page opens on the current stop (Evanston), or on the place
a #journey-<id> link names. The strip scrolls sideways when narrow, keeping the chosen
place in view.

Under it, div.journey-split holds two panes side by side, the Map pane
(section#journey-pane-map, named "Map") on the left and the Board pane
(section#journey-pane-board, named "Board") on the right. Both show from the start and
never overlap. The panes keep fixed shares of the row, the map about 34% and the board
about 66% (flex-grow 34 / 66 from a basis of 0), with one gap and one shared height
(--journey-pane-h): the board's own height at its pane's width, from its fixed aspect
ratio. A click, tap, or focus in either pane, a pin, or a tab never changes either size;
there is no dominant pane, cover, or "Expand board" button. The board is laid out at its
pane's width before it is mounted. While the window is being resized it keeps that
layout and is only scaled to its pane (one transform on .journey-boards); about 280 ms
after the width settles it is laid out again at the new width. The route's flowing dashes
run while the map is on screen (in its pane or its window) and no examine window is open,
so the map goes idle otherwise. Under 620 px of section width (phones) the panes stack
(.journey[data-layout="stack"]): the map on top at a fixed height
(clamp(260px, 42svh, 420px)) and the board under it at the full width.

The map window: "Expand map" in the Map pane's bar (aria-haspopup="dialog",
aria-controls, aria-expanded) opens the map in a modal window
(dialog#journey-map-window inside the Map pane, role="dialog", aria-modal="true",
aria-label "Map"; styled in \_journey-map.scss like the examine window): centred, about
min(1240px, 92vw) by min(800px, 86vh) (96vw by 88dvh on a phone), rounded, with a faint
rim, a deep shadow, and a dark interior, over the page dimmed and a little blurred
(::backdrop). The same live MapLibre map moves in: journey.js moves its figure into the
window's body (and back on close), calls setWindowed() and resize() over a few frames,
and keeps the camera (a whole-globe view is refitted to the bigger frame); there is never
a second WebGL context. Inside the window a plain scroll zooms and a one-finger drag
moves the map (cooperative gestures are off there); the readout, zoom and reset
controls, pins, route, and labels all work, and a pin selects its place behind the
window as in the pane (board, tab, and status line), with the window staying open and the
page not scrolled. "Close map" (top right), Escape, or a click on the dimmed page closes
it; focus moves to "Close map" on opening, is kept inside, and returns to "Expand map".
The page is locked behind it (html.has-journey-map-window; a scrollbar's room is kept
only if the page had one, so nothing shifts), and a wheel, touch drag, or pinch outside
the map itself is cancelled, so the page never scrolls or zooms. It opens and closes with
a scale and fade of about 250 ms (at once under reduced motion), with the "zoom" sound on
opening and "click" on closing. While it is open the pane shows "The map is open in a
window." Playwright's WebKit (iPhone 12) can show the canvas blank after a size change
while MapLibre keeps drawing; that is a fault of the test browser.

There is no sources caption under the panes. MapLibre's compact attribution control (the
(i) button, in the pane and in the map window) lists every map source at all times
(customAttribution, ATTRIBUTION in journey-map.js): NASA GIBS imagery (Blue Marble, Black
Marble), map data © OpenStreetMap contributors, OpenFreeMap tiles (© OpenMapTiles) and
Mapzen/USGS/NOAA terrain. It starts folded behind its (i) button and opens when that is
pressed; while it is open the "Drag to turn the globe" hint steps aside, so the list never
covers the hint or the zoom controls. Each board keeps its tiny "Streets of <city>: map
data © OpenStreetMap contributors" credit for its street maps, always on one line (where
the line is short of room only the place name is cut short, with an ellipsis; the full line
is its title), so every board, and the board pane, keeps one height.

### The map

window.JourneyMap.mount(figure, stops, { onSelect, onFail, loadNear, time }), also
figure.journeyMap, returns select(id, { animate, overview }), reset({ animate }),
isAnimating(), now(), setTime(time), getTime(), getSun(), getMode(), load(),
setShown(shown), resize(), setWindowed(windowed) (the figure is in the map window, so a
plain scroll and a one-finger drag work the map), map, and destroy(). select() never calls onSelect. The
figure stays hidden unless WebGL exists. The library and every tile load only when the
section nears the viewport (earlier select() calls are queued), and the figure loses its
is-loading class once the style has loaded. If the library fails, the Map pane hides
again with one console.warn and the timeline carries on.

- It opens as one whole globe on a starfield, facing the current stop; dragging turns
  it. Zooming makes the globe fill the frame, and MapLibre's globe projection flattens
  into a map at city zoom (the Google Earth model). Cooperative gestures keep page
  scrolling: Ctrl/Cmd + scroll or two fingers move the map. Rotation and tilt are off.
- Ctrl/Cmd + scroll (and a trackpad pinch, which arrives as a ctrl wheel; Safari's
  gesture events too) over the pane never zooms the page: a non-passive wheel listener
  cancels it from the moment the figure shows, and a zoom asked for while the library
  loads is applied once the map starts.
- Imagery: NASA Blue Marble from the bundled zoom 0-2 tiles, then NASA GIBS to zoom 8.
  From about zoom 7.7 an OpenStreetMap street map (OpenFreeMap vector tiles and glyphs)
  fades in, with AWS Terrain Tiles hillshade. Labels show Latin-script names only.
- Daylight: the subsolar point is computed from the clock (Astronomical Almanac
  low-precision formulas, about 0.01°). A custom WebGL layer darkens the night side with
  a twilight band and NASA Black Marble city lights (the bundled night-lights.jpg, plus a
  sharper GIBS WMS image of the view from zoom 2.8), with limb haze and an ocean sun
  glint. The lighting always follows the real clock (15° of longitude an hour). There is
  no time-lapse and nothing turns by itself. The site theme only changes the frame.
- A readout inside the frame (data-map-clock, with data-phase day/dawn/dusk/night and
  data-mode live/fixed) shows the current stop's local time and whether the sun is up.
  The zoom buttons (Zoom in, Zoom out, Show the whole globe) sit inside the frame too.
- Test hook: ?journey-time=<ISO time>, data-journey-time on the figure, the time option,
  or setTime() holds the clock at that moment ("Fixed time"); now() returns to live
  time. getSun() is the subsolar point as { lon, lat }.
- Pins are buttons named "Place, period" (", now" for the current stop). Pins within
  26 px merge into a numbered cluster; pressing it zooms in until they split. A pin flies
  to the place, selects its tab and board without moving focus (no pane changes size),
  and announces "Showing ..." in the polite status line. The route is a great circle
  through the stops, older legs dimmer. Flights become jumps under reduced motion.
- Tile sources and attribution (MapLibre's compact (i) control): NASA GIBS (public
  domain, citation requested), OpenFreeMap / OpenMapTiles / OpenStreetMap (ODbL,
  attribution required), and Mapzen, USGS, NOAA for terrain (all listed at all times). EOX Sentinel-2 cloudless is not used (non-commercial licence). To
  update MapLibre, replace the files in assets/vendor/maplibre-gl/ from a 5.x dist (6.x
  ships only ES modules with a separate worker) and keep LICENSE.txt.

### The boards

The boards (window.JourneyBoard.mount(section), also section.journeyBoard) are fixed-size
dark slate boards under a low work light, with the stop's real streets drawn faintly on
them (assets/img/journey/maps/<stop-id>.svg, from OpenStreetMap). A board never grows with
its content; a bigger board gets bigger, more legible papers. Each board's title is on the
board itself: a plain off-white sheet held at the top centre by two strips of blue
painter's tape (.board-case > .board-plate), the place large (the h3, the board's
heading), the case file number and period smaller, and "Now" on the current stop. It is
distinct from the yellow masking tape that names each cluster (.board-label).

- Clusters come from the data: every lab, school, and place heads one, and every other
  paper or pile joins the smallest cluster it has a thread to.
- Each kind of document has its own paper (photo print, postcard, file card, manila
  folder, typed sheet, clipping, sticky note). Real documents show their scan; artifacts
  lie on their documents as cutouts under their own shadows.
- Every paper is drawn as a photographed sheet: generated paper fibre multiplied into its
  color, ink with a faint spread, a tight contact shadow plus a soft one, and an empty
  .board-wear (from \_includes/journey-doc.html; inside the sheet of a scan, none on an
  object) carrying its folds and handling. Its variant comes from a hash of the doc's id in
  Liquid, so it is the same every build: data-crease (trifold, half, cross, corner, wave,
  crumple, none, limited to what suits the kind: a letter is folded in three, a print or a
  diploma only waves, a leatherette cover never folds), data-lift (a lower corner curling
  off the board, with a longer shadow), data-shift, data-edge and data-age. ::before is the
  fold map in hard-light, ::after the edge wear and yellowing, multiplied; the examine view
  swaps in the 1600 px maps and strengthens them as the sheet tilts. Tapes are creped
  (tape-crepe.png) with torn ends (tape-tear-l/r.png masks); the title sheet has its own
  map (crease-plate.jpg) and the tapes' shadows (.board-plate-tape). The sheet is lit from
  the upper left (a highlight there, a shade at the lower right), its toner ink (#2a2826)
  mottled a little (ink-mottle.png mask), the rule under the title thin and uneven, and its
  shadow tight by the tapes and longer under the free corners. Each case (data-case on
  .board-case) has its own slant, tape positions, angles and lengths, and its fold map the
  other way round on even cases; the older cases (01, 02) are on creamier paper with a
  spot of foxing. The tapes are see-through blue (rgba alpha about 0.74).
- A person's portrait is a small print paper-clipped to the file card, with a faint gloss
  over it, showing its pixelated stand-in (portrait_pixel) under a strong blur, so no
  face, head shape or contour reads on the board.
- Layers inside .board-cork, bottom to top: .board-docs (an isolated stacking context),
  the cluster tapes, svg.board-strings, svg.board-pins, .board-tags, the light, and
  .board-fan, so a thread is always above every paper and ends under its pin head.
- Each document is one keyboard stop (.board-doc-open) that opens the examine window; a
  title link stays clickable on the board.
- A pile is one button (.board-stack-open, aria-expanded) with a typed tally; its papers
  are inert while closed. Pressing it fans the papers out over a dimmed board, with
  focus on the first card and Tab kept among the cards and "Put the ... back". While a
  pile is spread out there are no threads at all (.board-cork.is-fanned hides them).
  Escape, that button, or a press outside gathers it and returns focus to the pile.
  Escape inside the examine window closes only the window.
- Street maps: python bin/build_journey_maps.py [stop-id ...] [--cache DIR] queries the
  Overpass API once per stop for roads, water, parks, and railways within 2.6 km of the
  stop's lat/lon and writes pale line art on a transparent background. Map data ©
  OpenStreetMap contributors (ODbL); each board shows that credit, and
  assets/img/journey/maps/CREDITS.md documents the build. Rerun it when a stop's
  coordinates change. It needs PyYAML and requests.

### The examine window

window.JourneyExamine.open({ docs, index, root, context, onClose }), .close(), and
.isOpen. Any document opens in dialog.journey-examine (role dialog, aria-modal, labelled
by its title): a centred window about min(1080px, 86vw) by min(700px, 82vh), with rounded
corners and a deep shadow (94vw by 90dvh on phones), over the page, which stays partly
visible behind it, dimmed and slightly blurred. Inside it is dark and cinematic in both
themes, with a grain and the board's street map faint behind: the text on the left
(kicker, title, stamp, meta, dates, body, links, credits), the object large on the right,
tilted toward the light. Drag turns a paper (up to about 25° each way; documents, scans,
cards, prints, notes, folders and the Westminster cover), the light, folds, shadow and edge
following the turn; an object (kind artifact: a robot, the cords, every cutout and
photographed object) without a 3D model lies flat under one soft, still shadow and a drag
only moves it when zoomed in (hint: "Scroll to zoom · drag to move · double-click to
reset"). The wheel, a pinch, or the buttons zoom it (1x to 2.5x), and a double-click or
Reset puts it back. An object with a 3D model (model in journey.yml) opens exactly like
one without: its photo cutout, rigid zoom and pan, the same hint, kicker "Object", and
nothing of three.js or the model is requested (not with the page, not with the window).
At Jiatuo's request it shows the picture first and offers the model on a button: "See 3D
model" (a small cube; aria-pressed false), on a pill of its own just left of the zoom
buttons (in the narrow layout at the left of their row, the zoom's level then hidden for
room). Pressing it (click, Enter or Space) brings the photo back to rest if it was zoomed,
then loads three.js and the model (the button reads "Loading 3D model…", aria-disabled and
aria-busy, keeping its focus; the photo stays meanwhile), and the model's transparent WebGL
canvas fades in over the photo (.examine-model). The model's first frame is the photo's
picture, so nothing jumps or turns at the swap: it is
drawn in the photo's pose (model_yaw, model_pitch), through a long lens (20° vertical
field of view, near-orthographic like a product photo; model_fov gives a photo taken close
up, with more perspective, its own), with the camera's distance and
lens shift fitted so that its silhouette in that pose (projected from its vertices) fills
the box of the cutout's opaque pixels, in the same place. The fade starts only once that
frame is on screen and the photo has come to rest (the window's opening, a step along the
filmstrip, the reset); the model fades in over the still-solid photo, which goes only after.
It never turns in or spins by itself. While it shows, the kicker reads "Object, 3D model
from a photo", the hint "Drag to turn it · scroll to zoom · double-click to reset", the
button "Show photo" (a framed picture; aria-pressed true), and a small note lies over the
view's foot, just above the buttons, on phones too: "This 3D model was reconstructed from a
photo and may not be accurate." (light italic on its own dark pill, readable in both site
themes as the window is dark in both; it is also the view's accessible description,
aria-describedby). A model not made from its photo has its own note and kicker (yml
model_note and model_kicker): the Pixel Watch's names its source, Google's Pixel Watch 3
product model, and its kicker reads "Object, 3D model"; the
view and the object are then named "a 3D model" rather than "a 3D model made from a photo"
for screen readers. An object with a model keeps that foot clear in both views: it is fitted
into the room above the note and centred there, a little higher than other objects, so the
note never covers it and the photo and the model lie in the same place. A drag turns the
model freely (all the way round; up and
down from model_pitch_min, default 0°, level with the table, to 75°), and it coasts on
gently when let go (at most about a third of a turn); the wheel, a pinch, the buttons and
+/- zoom its camera (so it stays sharp); a double-click, Reset or 0 put it back to rest by
the shortest way round; with the view focused (it is a Tab stop while it holds a model)
the arrow keys turn it instead of browsing. "Show photo" turns the model back to rest (if
it was turned or zoomed), shows the photo again beneath it, fades the model out and
disposes it (its WebGL context released); pressed again meanwhile, the model stays. In the
narrow layout the object keeps clear of the zoom buttons. The lighting is physically based
(sRGB, no tone mapping; RoomEnvironment reflections through PMREM; one warm key light from
the upper left like the papers' lamp), set about as bright as the photo's own light: the
texture is the photo, so at rest the model shows its colours unchanged (Neutral tone
mapping squeezed the highlights and faded the white Linktop's silver ring and print; ACES
Filmic turned the blue bumpers violet). The object stands on a faint, warm pool of
lamplight on the table, a little lighter than the window's backdrop, with the lamp's soft
shadow (opacity 0.45) and a contact shadow baked from the model's own underside, so it
never floats. It draws only when something changes, at a device pixel ratio of at most 2.
One model is open at a time, and only until the photo is asked for again: walking the
filmstrip or closing the window disposes it too, and every document opens on its photo
again (the map keeps its own WebGL context; a context the browser already took is not
released twice). Phones get the 3D view too: iPhone WebKit has WebGL 2 (the Playwright
mobile project renders the models). Without WebGL 2 the button reads "3D model
unavailable" at once (aria-disabled); when the model fails, or has not appeared within 15
seconds, or its context is lost, the photo stays (or comes back), flat and still as above,
and the button reads the same, with a console warning only. Under reduced motion every
swap is instant.
warning only. window.\_\_journeyModel (journey-examine.js) exposes the open model to the
tests and to bin/fit_journey_model_pose.js: pose(), setPose(yaw, pitch) (a new resting
pose, refitted and drawn at once), compare(step) (the intersection over union of the
model's and the cutout's silhouettes) and masks(step). Nothing in the section starts the browser's own image
drag: every img is draggable="false", -webkit-user-drag is off, the board is not
text-selectable, and journey.js and the window cancel dragstart (the window's text column
stays selectable). A filmstrip
along the bottom holds every document on that board, with previous/next buttons, a
counter ("03 / 12"), the arrow keys, Home/End, and swipe. Escape, a click outside the
window, or "Back to the board" closes it, and focus returns to the board (the document,
its pile, or the spread pile it came from). A page with a scrollbar keeps its space while
it is open. The thing is centred in its own area and clipped there when zoomed. A
person's portrait shows its pixelated stand-in until the visitor presses "Reveal photo"
(aria-pressed; it reads "Hide photo" while revealed): the photo itself
(.board-portrait-original, loaded when the document opens) crossfades in over it in about
0.2 s, and the object's description switches from "Pixelated until revealed. ..." to the
photo's alt; "Hide photo" fades it out again. Every document starts pixelated again, and
the filmstrip never shows a portrait. A photo with an image_pixel (the team photo) works
the same way: pixelated here until "Reveal photo", then the eye-barred original; its board
print and filmstrip thumbnail keep the blurred stand-in. Everything is instant under
reduced motion.

### 3D models of the artifacts

At Jiatuo's request each artifact may have a 3D model, shown only in the examine window,
and there only when the visitor presses "See 3D model" (the board and the window open on
the light cutout; a note under the model says it was reconstructed from a photo and may
not be accurate). A model is made from the same photo as the cutout
(the highest-resolution source available) with an open image-to-3D model run locally on
Jiatuo's GPU, in its own environment outside the repo (C:/Users/charl/tools/journey-3d);
the sides the photo does not show are inferred. The Pixel Watch's is the one exception,
adapted from Google's own model (see the end of this section). The bar is the photos' own: realistic,
never a melted blob or a toy. A model that does not pass is not used, and the artifact
keeps its flat cutout (no model field) rather than ship a poor one.

A model file is a glTF binary, assets/models/journey/<doc id>.glb: +Y up, the object's
front facing +Z, centred, with its longest side 1 unit (the viewer rescales it to
model_size_m anyway). Textures in the file as JPEG, PNG or WebP; geometry plain or
meshopt-compressed (gltfpack -cc), not Draco and not KTX2/Basis (those decoders are not
vendored, so such a file fails and the cutout stays; the build decodes a Draco source). Keep each file well under 12 MB
(the spec's limit; a few MB is better on a phone).

To add a model to an artifact:

1.  Generate assets/models/journey/<doc id>.glb from the artifact's photo with the local
    generator, and look at its previews from the front, side, back and top. If it does not
    read as the real object, stop here.
2.  Add to the doc in \_data/journey.yml: model: /assets/models/journey/<doc id>.glb and
    model_size_m: <real longest side in metres>, then model_yaw and model_pitch, the
    photo's view, found by the pose fitter with the site served (the Docker preview):

        node bin/fit_journey_model_pose.js <doc id> [--headed] [--dump sil.png]

    It opens the examine window in Chromium (Playwright), presses "See 3D model", searches
    yaw and pitch (a coarse
    grid, then a finer search) through window.\_\_journeyModel in the real viewer, and
    prints the pose whose silhouette best matches the cutout's (IoU), last as a JSON line.
    --model <file.glb> scores a generator candidate before it is adopted, --poster
    <file.png> a new cutout; --headed draws on the GPU (headless draws in software and is
    slow); --smoke only checks that it runs. A symmetric object's sides look alike in
    outline, so near-ties are settled by how well the shading agrees; still look at the
    window. A photo taken close up (a frame narrowing toward the top) fits better with a
    wider lens: rerun with --fov 30, 40, 45 and put the best in the yml as model_fov with
    its pose (the 2019 robot went from IoU 0.80 at the default 20 to 0.89 at 45). If the
    best IoU stays low (about under 0.85), the model's shape is not the photo's:
    regenerate or drop it.

3.  Add a row for the .glb to the "3D models" table in assets/img/journey/CREDITS.md: the
    source photo, that photo's licence (a model from a CC BY-SA photo is CC BY-SA too), and
    the generator and its licence.
4.  Check the object in the examine window (it opens on its photo; "See 3D model" turns
    the photo into the model without a jump, it turns, rests on its shadow, "Show photo"
    and a failure or WebGL off keep or bring back the photo) and run the journey tests.

The Pixel Watch on the SensorClaw project (doc sensorclaw-pixel-watch, attached to sensorclaw on
the Evanston board) is the one model not generated. Its cutout is Jiatuo's own photo (the
screen's device ID painted out); the generator, given Jiatuo's four photos of the watch,
made a glowing dome of the screen and a plank of the band, so at Jiatuo's request the model
is Google's own Pixel Watch 3 model instead (the 45 mm one from Google's "Explore Pixel Watch
3 in 3D", https://interactivedemo.withgoogle.com/pixel-watch-3-3d/, linked from the Google
Store; © Google, no licence stated, so not openly licensed, credited in CREDITS.md and kept
with Google's marks as they are), adapted to Jiatuo's watch as the photos show it: a 41 mm
Champagne Gold Pixel Watch 3 (the gold crown and champagne-gold case; that colour came in
41 mm only) on a pale blue-grey band, lying on its back with the band open and flat.
bin/build_journey_models.py builds it from the "import" block of its entry in
bin/journey_models.json:

    $J/env/python.exe bin/build_journey_models.py sensorclaw-pixel-watch [--source D004.glb]

It fetches the file once into $J/downloads/<id>/ (or takes a copy given with --source),
checks its sha256, decodes it (Draco, with DracoPy) and writes a plain glTF binary with
no extensions: the Porcelain variant's materials baked in and the rest of the variants, the
invisible AR shadow mesh and Google's watch faces dropped; the case scaled to 41 mm across
(its thickness kept, as both sizes are the same thickness, and the crown its own size); the
case and crown champagne gold and the band pale blue-grey (sampled from the photos); the
band, which Google modelled closed as if worn, unbent strap by strap from the loop into
straight straps lying open (holed strap at 12 o'clock, pin strap at 6, as on Jiatuo's
watch), their plain stretches shortened to the photo's (the holes, slots and pin keep their
size), the occlusion Google baked into the band where the loop hid it cleared; and the
screen's picture Jiatuo's, cut from the published cutout (never the raw photos), glare
taken out, lit under the glass (an emissive texture). Its note and kicker say it is based
on Google's product model (model_note, model_kicker). Its first frame is fitted like any
other (model_yaw, model_pitch, model_fov); the photo was taken close up and from above, so
its lens is wide. It is attached, so it does not count toward the board's nine items.

### Sound, fallbacks, and night mode

Sound (window.JourneySound: play(name), status()) plays short CC0 recordings from
Kenney.nl packs through Web Audio: tab, pin, zoom, whoosh, paper-open, paper-close, fan,
gather, click, and toggle (the site's day/night switch). It is always on, with no
switch. Callers use window.JourneySound && window.JourneySound.play(name), so the
module is optional. Nothing plays on load, scroll, or hover: the AudioContext is
created, and the files fetched, only on the first real press, click, or key inside the
section or on the theme switch.

Without JavaScript the Map pane is hidden, the timeline links to each board, every board
is a plain list in order under its title sheet, each pile is a labelled nested list, and
portraits show their pixelated stand-ins beside their cards.

Night overrides for this feature (and the PhD callout) live at the bottom of their own
partials, inside @media screen and html[data-theme="dark"], as a documented exception
to the \_sass/\_theme.scss rule. The map listens for site-theme-change.

## Licensing

LICENSE is the imported MIT license (copyright Yi Ren). Vendored Sass, fonts, and
JavaScript retain their upstream copyright/license headers. Site content remains
the author's own. The footer links back to the upstream template.
Newsreader is distributed under the SIL Open Font License; its license is included
at assets/fonts/Newsreader-OFL.txt.

My Journey assets carry their own terms. MapLibre GL JS is BSD-3-Clause
(assets/vendor/maplibre-gl/LICENSE.txt); three.js is MIT (assets/vendor/three/LICENSE).
A 3D model made from someone else's photo is a derivative of it and keeps the photo's
licence (CC BY-SA stays CC BY-SA); CREDITS.md names the photo, its licence and the
generator. The bundled NASA Blue Marble and Black Marble
imagery is public domain. The boards' street maps are OpenStreetMap data (ODbL),
credited on each board and in assets/img/journey/maps/CREDITS.md.

Image rule: a picture from someone else must be public domain, CC0, CC BY, or CC BY-SA,
with the licence checked on the file's own source page (normally Wikimedia Commons), a
credit and credit_link in journey.yml, and a row in assets/img/journey/CREDITS.md.
Adapted CC BY-SA images stay CC BY-SA and say how they were changed. The only exceptions
are pictures Jiatuo asked for or supplied, each marked in its own section of CREDITS.md
as not openly licensed: the FRC Team 744 robot photo (from the team's site), the Linktop
product image (supplied by Jiatuo), the salutatorian cords (two retailer product photos,
at Jiatuo's request), and
the people's portraits (from their own official profile pages). The scans in
assets/img/journey/docs/ are Jiatuo's own diplomas and papers. Board textures
are generated for this site (bin/build_journey_textures.py and the slate) and sound effects
(Kenney.nl) are CC0, listed in assets/img/journey/textures/CREDITS.md and
assets/audio/journey/CREDITS.md. Add a credit
row whenever one of these files changes, and remove it when the file goes.

## Verification

    bundle install
    bundle exec jekyll build
    npm ci
    npm run lint:template
    npm run test:cloth
    npx playwright install chromium webkit
    npm run test:visual

The browser suite validates content migration, under-review link handling, the full
publication list, GIFs, preview/full-video links, native abstracts, video close/focus behavior, responsive navigation,
local assets, no overflow at four widths, and JavaScript-free access. Screenshots
are saved under output/playwright and excluded from deployment. The old theme's
tests were replaced, because comparison to al-folio is no longer the objective.

Verified on October 12, 2026: production/domain-root build, subpath build, all 14
desktop Chromium/mobile WebKit checks, local links/assets/anchors in both builds,
template contract, repo-wide Prettier check, and Python syntax for the citation updater.
The original personal PDF/video/profile assets were also compared against the saved
previous version and remain byte-for-byte unchanged. The citation updater's live
network fetch was not run, and no GitHub deployment was triggered.

The profile-banner checks cover high-resolution rendering, mouse pressure on both
profile content and links, clicking a link while the fabric is deformed, gusts and
settling, offscreen/reduced-motion behavior, visible keyboard links, and unavailable
or lost WebGL contexts. Pixel checks ensure the fabric and its print actually render.
Mouse-specific checks are skipped on touch devices; rendering and native contacts
are verified there. Numerical physics checks validate the pinned seam, resistance to
stretching, rebound, and stability during rapid input and varying time steps.
Stress cases sweep the mouse across three banner widths and assert that no
presentation triangles invert. Browser checks also cover rolling/unrolling on
desktop and mobile, direct clicks on fabric and the coil, absence of visible button
markup, reversal during motion, restored contact access, and rolling without WebGL.
Numerical spindle checks cover acceleration, retained momentum on reversal, material
radius, soft stops, and resize state.
test/visual/journey.spec.js checks that the PhD callout leads the page with its email
and CV links. For My Journey it stubs the three tile hosts (OpenFreeMap, NASA GIBS,
AWS terrain) with page.route, so it runs offline and deterministically, and covers:
the six-stop timeline strip in order with Evanston current, tab ARIA and keys, and
#journey-<id> links; the map loading only near the section, its first view facing
Evanston, named pin buttons, clusters zooming in, a pin selecting its tab and board, tab
fly-to, zoom and reset; the daylight at a pinned time
(?journey-time=; day at noon and dark at midnight in Evanston, the sun moving 15° an
hour, the camera never moving, the live clock advancing, no time-lapse controls); Ctrl +
scroll over the map while the library is held back (cancelled, page not zoomed, the zoom
applied on load); the split view (both panes from the start at fixed 34 / 66 shares, one
height, no dominant pane, cover, or "Expand board", the pane sizes and the board's
transform unchanged by a click on the map or the board, focus, a pin, or a tab, the canvas
never stretched, and on phones the map above the board at one height); the map window
(Expand map opening a modal dialog with the one map canvas inside, about the specified
size and inside the viewport, focus kept inside, a pin selecting behind it, the page not
scrolled or zoomed, Escape, Close map, and a click outside closing it with the canvas back
in its pane and focus on the button, and reduced motion); no sources caption under the
panes, and the map's (i) control naming every source; the map hiding without WebGL or when its library fails, and painting
the bundled imagery when the tile hosts are down; every board the same fixed size with
its papers inside, photos loaded with alt text and credits; the title sheet with two blue
tape strips on all six boards; artifacts as transparent cutouts on their documents and
the diploma, paper-page, and cover scans; threads above the papers (hit-tested along
every thread at rest, on hover, and after the examine window); the New York papers pile
(fan-out with no threads, focus, Escape, gather); the examine window (a centred window,
Escape, Back and a click outside, focus return, opening from a paper, an artifact, and
a spread pile, the filmstrip by keys, buttons, and thumbnails, zoom and reset); portraits
strongly blurred on the board (blur of at least 6px) and mildly pixelated, unblurred, in
the window, with "Reveal photo" / "Hide photo" swapping to the original and back; the team
photo the same way (eye bars in the revealed original); objects without a model never
turning under a drag (zoom and pan only) while papers do; an object given a model (a small
box built in the spec and served by page.route, so no fixture file) loading three.js, the
viewer and the model only when it opens and never with the page, its canvas replacing the
cutout and drawing something, turning under a drag within the pitch limits, zooming by
button and wheel, turning by the arrow keys without browsing, resetting on a double-click,
being disposed when the filmstrip moves on and reloaded on return, leaving no canvas after
the window closes while the map's WebGL context lives on, turning in once and coasting
when flung, then coming to rest; without WebGL, or when the model fails to load, the flat
cutout staying with the plain hint and no three.js request; every model on the boards a
credited glTF binary under assets/models/journey/ with a real size; no native image drag on the board or in the
window; the four redacted diploma files (pinned by their SHA-256 hashes; no other diploma
path on the page); the masthead's Journey link gliding to the section like the other
links; both FRC 744 robot cutouts, the canal photo on hangzhou-early, a UIUC diploma
scan at least 1500 px wide, and no .journey-intro; the map's (i) control naming every
source; reduced motion; no sideways scrolling from 320 to 1920 px
(with the map window open too);
night contrast on all six boards, a spread pile, and the map; the sound module (no
switch, silent before a gesture, the theme switch sound); and the JavaScript-free boards
and piles. Map tests skip only where the browser has no WebGL, and the sound test where
it has no Web Audio (Playwright's WebKit on Windows).

Run the feature's tests against a running preview (Docker serves port 8080):

    NO_WEBSERVER=1 SITE_URL=http://127.0.0.1:8080 npx playwright test --config test/visual/playwright.config.js journey.spec.js

The cloth adds no external runtime dependencies or network requests. Headless
Chromium uses software WebGL in the browser suite to make GPU coverage deterministic.

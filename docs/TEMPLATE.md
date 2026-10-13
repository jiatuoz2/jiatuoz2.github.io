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

## Licensing

LICENSE is the imported MIT license (copyright Yi Ren). Vendored Sass, fonts, and
JavaScript retain their upstream copyright/license headers. Site content remains
the author's own. The footer links back to the upstream template.
Newsreader is distributed under the SIL Open Font License; its license is included
at assets/fonts/Newsreader-OFL.txt.

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
The cloth adds no external runtime dependencies or network requests. Headless
Chromium uses software WebGL in the browser suite to make GPU coverage deterministic.

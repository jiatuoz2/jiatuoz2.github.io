# Academic website instructions

This repository uses RayeRen's AcadHomepage template. See AGENTS.md and docs/TEMPLATE.md.

## Content and architecture

- \_config.yml: identity, contact details, URLs, navigation/runtime configuration.
- \_data/navigation.yml: masthead links.
- \_pages/about.md: biography and homepage sections.
- \_news: existing news entries, rendered on the homepage.
- \_bibliography/papers.bib: canonical publication metadata.
- \_plugins/publications.rb: BibTeX adapter for native paper-box rendering.
- \_includes/publication.html and publications.html: publication views.
- \_data/journey.yml (content and schema), \_includes/journey.html, journey-map.html,
  journey-doc.html and journey-doc-text.html, assets/js/journey.js (tabs and the
  map/board split view), journey-map.js (MapLibre globe lit by the real sun),
  journey-board.js (fixed-size slate boards, clusters, threads, piles, artifacts),
  journey-examine.js (the close-examine window, with blurred portraits until revealed),
  journey-sound.js (always-on CC0 sound effects, nothing before a gesture), and
  \_sass/\_journey-\*.scss: My Journey. MapLibre is vendored in
  assets/vendor/maplibre-gl; bundled NASA imagery is in assets/data/journey-map; the
  boards' OpenStreetMap street maps are built by bin/build_journey_maps.py. Photos,
  artifacts, portraits, maps, textures, and sounds list their licences in the CREDITS.md
  beside them; credit every new picture there and in journey.yml, and use only PD, CC0,
  CC BY, or CC BY-SA pictures unless Jiatuo asked for a specific one.
- \_layouts/default.html, \_includes, \_sass, assets: local AcadHomepage runtime.
- assets/pdf/cv.pdf: the user's actual CV; never regenerate it from starter data.

Preserve the white-background/sidebar design and the owner's requested Newsreader
main-content typography inspired by Ruiqi Chen's site. The light fabric banner uses
navy print and fine gold edging, with a serif name and sans-serif contacts.
Navigation remains sans-serif. Put site-specific adjustments in \_sass/\_site.scss
and behavior in assets/js/site.js. Night colors go in \_sass/\_theme.scss, except for
My Journey and the PhD callout, whose night overrides sit at the bottom of their own
partials.
Internal links must support baseurl and stay in the same tab. Maintain accessible
controls, reduced-motion support, and JavaScript-free navigation/content.

## Checks and deployment

Run bundle exec jekyll build, npm run lint:template, npm run test:cloth, and
npm run test:visual for relevant changes. The browser suite covers desktop Chromium and
mobile WebKit; test/visual/journey.spec.js stubs the map's tile hosts and pins the map's
clock with ?journey-time=<ISO time>.
Formatting checks should avoid unnecessary rewrites of vendored template assets.
Deploy CI builds from main/master and keeps the existing gh-pages delivery method.
No al-folio plugin audits, Tailwind build, image conversion, or CSS purging are needed.

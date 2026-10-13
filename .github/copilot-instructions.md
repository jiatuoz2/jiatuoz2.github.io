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
- \_layouts/default.html, \_includes, \_sass, assets: local AcadHomepage runtime.
- assets/pdf/cv.pdf: the user's actual CV; never regenerate it from starter data.

Preserve the white-background/sidebar design and the owner's requested Newsreader
main-content typography inspired by Ruiqi Chen's site. The light fabric banner uses
navy print and fine gold edging, with a serif name and sans-serif contacts.
Navigation remains sans-serif. Put site-specific adjustments in \_sass/\_site.scss
and behavior in assets/js/site.js.
Internal links must support baseurl and stay in the same tab. Maintain accessible
controls, reduced-motion support, and JavaScript-free navigation/content.

## Checks and deployment

Run bundle exec jekyll build, npm run lint:template, and npm run test:visual for
relevant changes. The browser suite covers desktop Chromium and mobile WebKit.
Formatting checks should avoid unnecessary rewrites of vendored template assets.
Deploy CI builds from main/master and keeps the existing gh-pages delivery method.
No al-folio plugin audits, Tailwind build, image conversion, or CSS purging are needed.

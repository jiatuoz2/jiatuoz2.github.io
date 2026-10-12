# Personal academic site design

The main visitor routes (`/`, `/publications/`, `/cv/`) use a site-owned editorial
design: a warm paper background, burgundy accents, serif headings, clear navigation,
and research imagery from the existing papers. The Jekyll/al-folio plugin wiring and
GitHub Pages deployment remain in place. No npm asset build pipeline is required.

## What the original site was missing

- The homepage emphasized biography while paper imagery and videos lived elsewhere.
- The small, uniform theme typography provided little visual hierarchy.
- Default footer and content data still contained starter material.
- The fixed footer and narrow theme canvas limited presentation space.

The new homepage introduces the researcher, foregrounds two selected projects, then
provides background, updates, and contact information. The publications page lists
all bibliography entries with thumbnails, author emphasis, abstracts, topic filters,
and search. The CV page presents the existing PDF with a direct-link fallback.

## Reference and template findings

[Ruiqi Chen's website](https://ruiqi-chen-0216.github.io/) has a public
[source repository](https://github.com/Ruiqi-Chen-0216/Ruiqi-Chen-0216.github.io).
Its README credits [RayeRen's AcadHomepage](https://github.com/RayeRen/acad-homepage.github.io)
and describes custom navigation and transitions. AcadHomepage is an MIT-licensed,
reusable Jekyll academic homepage, influenced by Minimal Mistakes and Academic Pages.
The exact reference includes personal customizations; it is not simply the untouched
template. These sources were inspected on October 11, 2026.

This redesign borrows the emphasis on research visuals and scannable paper information;
it uses original markup and styling and does not copy the reference's content or assets.

## Editing the site

- Biography and homepage structure: `_pages/about.md`.
- All paper titles, authors, venues, status, abstracts, and links: `_bibliography/papers.bib`.
- Add `selected = {true}` to feature a paper on the homepage. Set `project`, `summary`,
  `research_label`, and `preview_alt` for its short presentation copy and image description.
- The `research` field contains space-separated filter values (`human-ai`, `xr`).
- Teasers: `assets/img/publication_preview/`; videos: `assets/video/`.
- News: `_news/`; contact/profile links: `_data/socials.yml`.
- CV: replace `assets/pdf/cv.pdf`. `_data/cv.yml` is unused starter data, not the live CV.
- Presentation styles: `assets/css/academic.css`; progressive interactions:
  `assets/js/academic.js`.

With JavaScript disabled, navigation, paper links, abstracts, and direct video links
remain usable. Enhanced mobile navigation, search, filters, and video dialogs activate
only when JavaScript is available. The layout includes reduced-motion and print styles.

## Ownership and validation

`_layouts/academic*.liquid` and the existing `publication_video_player.liquid` include
are unique site-owned files. They do not shadow installed theme/plugin files. The
style contract allows these exact names and still rejects other local runtime copies.
Run `bundle exec al-folio upgrade overrides audit` after gem updates; record any actual
theme overrides in `.al-folio-overrides.yml` if introduced in the future.

```bash
npm ci
npm run lint:style-contract
bundle exec jekyll build --baseurl /al-folio
bundle exec al-folio upgrade overrides audit
NO_WEBSERVER=1 npx playwright test --config test/visual/playwright.config.js academic.spec.js
```

The browser test assumes the site is already served at `http://127.0.0.1:4000/al-folio/`.
Install its browsers with `npx playwright install chromium webkit` before the first run.
The academic checks cover Chromium desktop and WebKit mobile, filtering and search,
video dialog focus restoration, JavaScript-free access, and overflow at four widths.
The legacy theme parity suite excludes the intentionally redesigned routes; its theme
navigation checks run on `/projects/`, which still uses the core plugin layout.

Validation completed: production build at the domain root, subpath build, all 12
academic browser checks (including after CSS purging), local links/assets/anchors,
style contract, upgrade CLI integration, and plugin override audit. Formatting passes
for changed files; the repo-wide formatting command reports pre-existing issues in
untouched starter files. The full legacy theme parity suite was not run.
On Windows with WSL, a cache on the Windows mount may have incompatible permissions.
Use `--disable-disk-cache` and a destination on the Linux filesystem for local builds
and serving in that case. Do not change the production config just for the local environment.

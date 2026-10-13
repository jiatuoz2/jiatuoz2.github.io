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

Use NO_WEBSERVER=1 when running tests against an already-started server.
GitHub Actions builds Jekyll with local plugins, then deploys \_site to gh-pages.
Pushing main/master publishes the website; local edits and branches do not.

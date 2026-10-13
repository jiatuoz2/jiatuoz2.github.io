# Jiatuo "Charlie" Zou — Academic Website

Personal academic website at https://jiatuoz2.github.io, using
[AcadHomepage](https://github.com/RayeRen/acad-homepage.github.io).

The site presents HCI research in XR, wearable computing, multimodal AI, and sensing.
It uses the template's profile sidebar and paper-box publication layout, with the
existing biography, paper PDFs/videos, Google Scholar profile, and downloadable CV.

See [template and migration notes](docs/TEMPLATE.md) for source provenance, content
editing, preserved data, and verification details.

## Run locally

With Docker Desktop running, use this from the repository folder:

    docker compose up --build

Open http://localhost:8080/ once the logs say "Server running". Docker watches
content/style changes and rebuilds automatically; refresh your browser to see them.
After editing \_config.yml, restart with docker compose restart. Stop with Ctrl+C,
then docker compose down. Ruby and Bundler are included in the image.

Alternatively, with Ruby installed locally:

    bundle install
    bundle exec jekyll serve --host 127.0.0.1 --port 4000

Open http://127.0.0.1:4000. Windows users can use Ruby or WSL. If Windows-mounted
build/cache directories have permission issues, use a destination on the Linux
filesystem (for example --destination /home/your-user/.cache/academic-site).

## Verify

    npm ci
    npm run lint:template
    bundle exec jekyll build
    npx playwright install chromium webkit
    npm run test:visual

## Deploy

The deploy workflow builds the site with native Jekyll and its local BibTeX adapter,
then publishes \_site to the existing gh-pages branch when main/master changes.
Keep the repository's existing GitHub Pages branch configuration. The previous
al-folio dependencies, demo content, and theme-specific automation were removed.

## Credits

AcadHomepage is maintained by Yi Ren (RayeRen), with influences from Minimal Mistakes
and Academic Pages. Its MIT license and bundled font/library notices are retained.

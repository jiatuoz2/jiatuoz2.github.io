const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (path) => fs.readFileSync(path, "utf8");
const config = read("_config.yml");
const gemfile = read("Gemfile");
assert(
  !/al_folio_|\bal_(?:icons|search|cookie|math|charts|citations|analytics|comments)/.test(gemfile),
  "al-folio runtime dependencies must stay removed"
);
assert(!/^theme:\s*al_folio_core/m.test(config), "AcadHomepage is the site template");
assert(/gem "jekyll", "~> 3\.10"/.test(gemfile), "Use AcadHomepage's native Jekyll/Sass runtime");
for (const path of [
  "_layouts/default.html",
  "_sass/_variables.scss",
  "_includes/author-profile.html",
  "assets/css/main.scss",
  "assets/js/main.min.js",
  "_plugins/publications.rb",
  "assets/pdf/cv.pdf",
]) {
  assert(fs.existsSync(path), `Missing template or personal content: ${path}`);
}
for (const path of ["_pages/about.md", "_pages/publications.md", "_pages/cv.md"]) {
  assert(!read(path).startsWith("\ufeff"), `Jekyll front matter must not have a BOM: ${path}`);
}
assert(!fs.existsSync(".github/workflows/upgrade-check.yml"), "Remove obsolete al-folio upgrade CI");
assert(!read("_includes/head.html").includes('<base target="_blank">'), "Internal navigation must stay in the current tab");
console.log("AcadHomepage template contract passed.");

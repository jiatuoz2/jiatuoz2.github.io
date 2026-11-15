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
  "_sass/_theme.scss",
  "_sass/vendor/breakpoint/_breakpoint.scss",
  "_sass/vendor/susy/_susy.scss",
  "_sass/vendor/susy/susy/output/_float.scss",
  "_sass/vendor/font-awesome/fontawesome.scss",
  "_sass/vendor/magnific-popup/_magnific-popup.scss",
  "_includes/author-profile.html",
  "_includes/seo.html",
  "_includes/person-schema.html",
  "assets/js/name-cycle.js",
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
// The name in Chinese is written once, in _config.yml, and must reach the page as real text.
const nativeName = /^  native_name: (\S+)$/m.exec(config)?.[1];
assert(nativeName, "author.native_name must be set in _config.yml");
for (const path of ["_includes/author-profile.html", "_includes/seo.html", "_includes/person-schema.html", "_pages/about.md"]) {
  assert(read(path).includes("native_name"), `${path} must read author.native_name`);
  assert(!read(path).includes(nativeName), `${path} must not repeat the name; it reads author.native_name`);
}
const profile = read("_includes/author-profile.html");
assert(/class="author__name-en" itemprop="name"/.test(profile), "The banner's first name is the schema.org name");
assert(/class="author__name-native"[^>]*itemprop="alternateName"/.test(profile), "The banner's second name is static, marked-up text");
assert(!read("assets/js/name-cycle.js").includes(nativeName), "The animation must not carry the name; it draws the text already in the page");
assert(
  read("_includes/scripts.html").indexOf("name-cycle.js") < read("_includes/scripts.html").indexOf("profile-banner.js"),
  "name-cycle.js loads before profile-banner.js"
);
assert(/^layout: none$/m.test(read("robots.txt")), "robots.txt must be plain text, outside the page layout");
assert(!fs.existsSync(".github/workflows/upgrade-check.yml"), "Remove obsolete al-folio upgrade CI");
assert(!read("_includes/head.html").includes('<base target="_blank">'), "Internal navigation must stay in the current tab");
console.log("AcadHomepage template contract passed.");

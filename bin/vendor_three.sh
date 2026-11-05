#!/usr/bin/env sh
# Vendors three.js into assets/vendor/three/ for the examine window's 3D viewer
# (assets/js/journey-model.js). Only static browser files: nothing here runs in Node.
#
# The npm package no longer ships minified builds, so the .min.js files are jsDelivr's
# Terser minifications of the npm release (each keeps its "Original file" header and
# three.js's licence banner). Two edits make them load as plain files from the site,
# with no import map: the addons' bare "three" import points at the vendored build, and
# every relative import names the .min.js file. jsDelivr's sourceMappingURL lines are
# dropped (they point at jsDelivr's own server). LICENSE comes from the npm tarball.
#
# Usage, from the repo root: sh bin/vendor_three.sh [version]   (default below)
set -eu
VERSION="${1:-0.187.0}"
CDN="https://cdn.jsdelivr.net/npm/three@${VERSION}"
OUT="assets/vendor/three"
FILES="
build/three.module.min.js
build/three.core.min.js
examples/jsm/loaders/GLTFLoader.min.js
examples/jsm/environments/RoomEnvironment.min.js
examples/jsm/utils/BufferGeometryUtils.min.js
examples/jsm/utils/SkeletonUtils.min.js
examples/jsm/libs/meshopt_decoder.module.min.js
"
rm -rf "$OUT"
for file in $FILES; do
  mkdir -p "$OUT/$(dirname "$file")"
  curl -sSfL -o "$OUT/$file" "$CDN/$file"
done
TMP="$(mktemp -d)"
curl -sSfL -o "$TMP/three.tgz" "https://registry.npmjs.org/three/-/three-${VERSION}.tgz"
tar -xzf "$TMP/three.tgz" -C "$TMP" package/LICENSE
cp "$TMP/package/LICENSE" "$OUT/LICENSE"
rm -rf "$TMP"
# Bare "three" -> the vendored build, relative to each addon; ./x.js -> ./x.min.js.
# (jsDelivr's minified files use double quotes: from"three", from"./x.js".)
for file in $FILES; do
  case "$file" in
    examples/jsm/*/*) three="../../../build/three.module.min.js" ;;
    *) three="./three.module.min.js" ;;
  esac
  sed -i \
    -e 's#from *"three"#from"THREE_BUILD"#g' \
    -e 's#\(from *"\.\{1,2\}/[A-Za-z0-9_./-]*\)\.js"#\1.min.js"#g' \
    -e 's#\.min\.min\.js#.min.js#g' \
    -e "s#THREE_BUILD#${three}#g" \
    -e '/^\/\/# sourceMappingURL=/d' \
    "$OUT/$file"
done
printf 'three.js %s, from %s and the npm tarball (bin/vendor_three.sh).\n' "$VERSION" "$CDN" > "$OUT/VERSION.txt"
echo "Vendored three.js $VERSION into $OUT"

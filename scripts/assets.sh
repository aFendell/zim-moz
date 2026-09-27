#!/bin/sh
# Download self-hosted map assets (glyphs + sprites) from protomaps/basemaps-assets into public/.
# Runtime must never fetch third parties, so these are committed.
# Only Latin glyph ranges are fetched; place names in Zimbabwe/Mozambique are Latin script.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="https://raw.githubusercontent.com/protomaps/basemaps-assets/main"
FONTS="Noto Sans Regular|Noto Sans Medium|Noto Sans Italic"
RANGES="0-255 256-511 512-767 768-1023 7680-7935 8192-8447 8448-8703"
SPRITE_VER="v4"

echo "$FONTS" | tr '|' '\n' | while read -r font; do
  enc="$(printf %s "$font" | sed 's/ /%20/g')"
  dir="$ROOT/public/glyphs/$font"
  mkdir -p "$dir"
  for r in $RANGES; do
    [ -f "$dir/$r.pbf" ] || curl -sfL "$BASE/fonts/$enc/$r.pbf" -o "$dir/$r.pbf"
  done
  echo "glyphs: $font ($(ls "$dir" | wc -l | tr -d ' ') ranges)"
done

mkdir -p "$ROOT/public/sprites"
for f in light.json light.png light@2x.json light@2x.png; do
  curl -sfL "$BASE/sprites/$SPRITE_VER/$f" -o "$ROOT/public/sprites/$f"
done
echo "sprites: $(ls "$ROOT/public/sprites" | tr '\n' ' ')"

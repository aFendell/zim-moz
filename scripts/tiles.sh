#!/bin/sh
# Extract an offline vector basemap for the trip bbox.
# No install needed: downloads the go-pmtiles static binary into .tools/ (gitignored) on first run.
# Output is gitignored. Upload it as a GitHub Release asset; see PRD "Deployment".
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.tools"
PMTILES_VERSION="${PMTILES_VERSION:-1.31.2}"
BIN="$TOOLS/pmtiles"

if command -v pmtiles >/dev/null 2>&1; then
  BIN="$(command -v pmtiles)"
elif [ ! -x "$BIN" ]; then
  mkdir -p "$TOOLS"
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  ASSET="go-pmtiles-${PMTILES_VERSION}_Darwin_arm64.zip" ;;
    Darwin-x86_64) ASSET="go-pmtiles-${PMTILES_VERSION}_Darwin_x86_64.zip" ;;
    Linux-x86_64)  ASSET="go-pmtiles-${PMTILES_VERSION}_Linux_x86_64.tar.gz" ;;
    *) echo "unsupported platform; install pmtiles manually" >&2; exit 1 ;;
  esac
  URL="https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${ASSET}"
  echo "downloading $URL"
  curl -fsSL "$URL" -o "$TOOLS/$ASSET"
  case "$ASSET" in
    *.zip) unzip -qo "$TOOLS/$ASSET" -d "$TOOLS" ;;
    *.tar.gz) tar -xzf "$TOOLS/$ASSET" -C "$TOOLS" ;;
  esac
  rm -f "$TOOLS/$ASSET"
  chmod +x "$BIN"
fi

OUT="${1:-$ROOT/public/zim-moz.pmtiles}"
# West, South, East, North — Zimbabwe + Mozambique south of ~15°S, with margin.
BBOX="${BBOX:-24.5,-27.5,36.5,-15.0}"
MAXZOOM="${MAXZOOM:-12}"
# Protomaps daily build; pin a date via SRC for reproducibility.
SRC="${SRC:-https://build.protomaps.com/$(date -u +%Y%m%d).pmtiles}"

"$BIN" extract "$SRC" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"
ls -lh "$OUT"

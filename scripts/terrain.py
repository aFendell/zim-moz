#!/usr/bin/env python3
"""Build an offline hillshade DEM (Terrarium PNG) PMTiles for the trip bbox.

Downloads AWS Terrain Tiles (public, free) into an MBTiles, then converts with the
go-pmtiles binary in .tools/. Output is gitignored; upload as a Release asset.
Usage: python3 scripts/terrain.py [maxzoom] [out.pmtiles]
"""
import math
import os
import sqlite3
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, S, E, N = 24.5, -27.5, 36.5, -15.0  # must match scripts/tiles.sh BBOX
MAXZOOM = int(sys.argv[1]) if len(sys.argv) > 1 else 10
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "public", "zim-moz-terrain.pmtiles")
MB = os.path.join(ROOT, ".tools", "terrain.mbtiles")
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def tile_range(z):
    n = 2**z
    x0 = int((W + 180) / 360 * n)
    x1 = int((E + 180) / 360 * n)

    def ty(lat):
        r = math.radians(lat)
        return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)

    return x0, min(x1, n - 1), ty(N), min(ty(S), n - 1)


def fetch(t):
    z, x, y = t
    for attempt in range(3):
        try:
            with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=30) as r:
                return t, r.read()
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                raise RuntimeError(f"failed {t}: {e}") from e
    return t, b""


def main():
    tiles = []
    for z in range(0, MAXZOOM + 1):
        x0, x1, y0, y1 = tile_range(z)
        tiles += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    print(f"{len(tiles)} tiles, z0-{MAXZOOM}")

    if os.path.exists(MB):
        os.remove(MB)
    os.makedirs(os.path.dirname(MB), exist_ok=True)
    db = sqlite3.connect(MB)
    db.executescript(
        """
        CREATE TABLE metadata (name TEXT, value TEXT);
        CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
        CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
        """
    )
    db.executemany(
        "INSERT INTO metadata VALUES (?, ?)",
        [
            ("name", "zim-moz terrain (Terrarium)"),
            ("format", "png"),
            ("bounds", f"{W},{S},{E},{N}"),
            ("minzoom", "0"),
            ("maxzoom", str(MAXZOOM)),
            ("attribution", "Mapzen/AWS Terrain Tiles"),
        ],
    )
    total = 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        for i, ((z, x, y), data) in enumerate(ex.map(fetch, tiles), 1):
            tms_y = (2**z - 1) - y
            db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, tms_y, data))
            total += len(data)
            if i % 200 == 0:
                print(f"  {i}/{len(tiles)} {total / 1e6:.1f} MB")
                db.commit()
    db.commit()
    db.close()
    print(f"mbtiles {total / 1e6:.1f} MB")
    subprocess.run([os.path.join(ROOT, ".tools", "pmtiles"), "convert", MB, OUT], check=True)
    print(f"wrote {OUT} {os.path.getsize(OUT) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

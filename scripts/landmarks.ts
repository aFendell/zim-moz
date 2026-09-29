// Build step: extract landmarks (towns, fuel, hospitals, police, ATMs, shops) within a
// buffer of the route from our own basemap PMTiles, so they match the offline map.
// Usage: yarn landmarks   -> writes src/data/landmarks.json
import { open } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import type { PrecomputedLeg } from '../src/data/types';
import { haversineKm } from '../src/data/geo';

const Z = 12;
const BUFFER_KM = 2.5; // features farther than this from the route are dropped
const PLACE_KINDS = new Set(['city', 'town', 'village']);
const POI_KINDS = new Set(['fuel', 'hospital', 'police', 'atm', 'bank', 'supermarket', 'border_control']);
const VILLAGE_BUFFER_KM = 1.0;

export interface Landmark {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  /** Distance along the route from the start, km. */
  km: number;
}

class FsSource implements Source {
  constructor(
    private fh: Awaited<ReturnType<typeof open>>,
    private key: string,
  ) {}
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await this.fh.read(buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
  }
}

function lngLatToTile(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

/** Route as one polyline with cumulative km at each vertex. */
function flattenRoute(legs: PrecomputedLeg[]): { pts: [number, number][]; cum: number[] } {
  const pts: [number, number][] = [];
  const cum: number[] = [];
  let total = 0;
  for (const leg of legs) {
    for (const p of leg.geometry) {
      const last = pts[pts.length - 1];
      if (last) {
        if (last[0] === p[0] && last[1] === p[1]) continue;
        total += haversineKm({ lng: last[0], lat: last[1] }, { lng: p[0], lat: p[1] });
      }
      pts.push(p);
      cum.push(total);
    }
  }
  return { pts, cum };
}

/** Nearest route vertex (good enough at ~100 m vertex spacing). */
function nearest(pts: [number, number][], cum: number[], lng: number, lat: number) {
  let best = Infinity;
  let bestKm = 0;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < pts.length; i++) {
    const dx = (pts[i]![0] - lng) * cosLat;
    const dy = pts[i]![1] - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      bestKm = cum[i]!;
    }
  }
  return { distKm: Math.sqrt(best) * 111.2, km: bestKm };
}

export async function extractLandmarks(pmtilesPath: string, legs: PrecomputedLeg[], log = (_: string) => {}) {
  const { pts, cum } = flattenRoute(legs);
  const tiles = new Set<string>();
  for (const [lng, lat] of pts) {
    const [x, y] = lngLatToTile(lng, lat, Z);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.add(`${x + dx}/${y + dy}`);
  }
  log(`${pts.length} route vertices, ${tiles.size} tiles at z${Z}`);

  const fh = await open(pmtilesPath, 'r');
  const pm = new PMTiles(new FsSource(fh, pmtilesPath));
  const out = new Map<string, Landmark>();
  const kindCounts = new Map<string, number>();
  let n = 0;
  for (const key of tiles) {
    const [x, y] = key.split('/').map(Number) as [number, number];
    const res = await pm.getZxy(Z, x, y);
    if (!res) continue;
    const vt = new VectorTile(new PbfReader(new Uint8Array(res.data)));
    for (const layerName of ['places', 'pois'] as const) {
      const layer = vt.layers[layerName];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        const props = f.properties as Record<string, unknown>;
        // Protomaps v4: places carry kind=locality + kind_detail=city|town|village.
        const kind =
          layerName === 'places' ? String(props.kind_detail ?? props.kind ?? '') : String(props.kind ?? '');
        const wanted = layerName === 'places' ? PLACE_KINDS.has(kind) : POI_KINDS.has(kind);
        if (!wanted) continue;
        const name = String(props['name:en'] ?? props.name ?? '').trim();
        if (!name && layerName === 'places') continue;
        const gj = f.toGeoJSON(x, y, Z);
        if (gj.geometry.type !== 'Point') continue;
        const [lng, lat] = gj.geometry.coordinates as [number, number];
        const { distKm, km } = nearest(pts, cum, lng, lat);
        const limit = kind === 'village' ? VILLAGE_BUFFER_KM : BUFFER_KM;
        if (distKm > limit) continue;
        const id = `${kind}:${name || 'unnamed'}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
        if (out.has(id)) continue;
        out.set(id, { id, name: name || kindLabel(kind), kind, lat: +lat.toFixed(5), lng: +lng.toFixed(5), km: Math.round(km) });
        kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
      }
    }
    if (++n % 200 === 0) log(`  ${n}/${tiles.size} tiles`);
  }
  await fh.close();
  log(`kinds: ${[...kindCounts].map(([k, c]) => `${k}=${c}`).join(' ')}`);
  return [...out.values()].sort((a, b) => a.km - b.km);
}

export function kindLabel(kind: string): string {
  return (
    { fuel: 'Fuel', hospital: 'Hospital', police: 'Police', atm: 'ATM', bank: 'Bank', supermarket: 'Shop', border_control: 'Border post' }[kind] ??
    kind
  );
}

const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const OVERPASS_AMENITIES = ['fuel', 'hospital', 'police', 'atm'];

/** POIs from OSM via Overpass: the basemap tiles (maxzoom 12) do not carry fuel stations etc. */
export async function fetchOverpassPois(
  legs: PrecomputedLeg[],
  fetchImpl: typeof fetch = fetch,
  log = (_: string) => {},
): Promise<Landmark[]> {
  const { pts, cum } = flattenRoute(legs);
  // Sample the route every ~3 km to keep the query small.
  const sample: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) acc += haversineKm({ lng: pts[i - 1]![0], lat: pts[i - 1]![1] }, { lng: pts[i]![0], lat: pts[i]![1] });
    if (i === 0 || acc >= 3) {
      sample.push(pts[i]!);
      acc = 0;
    }
  }
  const line = sample.map(([lng, lat]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join(',');
  const amen = OVERPASS_AMENITIES.join('|');
  const q = `[out:json][timeout:120];nwr["amenity"~"^(${amen})$"](around:${BUFFER_KM * 1000},${line});out center;`;
  const res = await fetchImpl(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'zim-moz-build/0.1' },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as {
    elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
  };
  const out: Landmark[] = [];
  for (const e of json.elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const kind = e.tags?.amenity;
    if (lat === undefined || lng === undefined || !kind) continue;
    const name = (e.tags?.name ?? e.tags?.brand ?? e.tags?.operator ?? '').trim() || kindLabel(kind);
    const { km } = nearest(pts, cum, lng, lat);
    out.push({ id: `${kind}:${name}:${lat.toFixed(3)}:${lng.toFixed(3)}`, name, kind, lat: +lat.toFixed(5), lng: +lng.toFixed(5), km: Math.round(km) });
  }
  log(`overpass: ${out.length} POIs (${OVERPASS_AMENITIES.join(', ')})`);
  return out;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const legs = JSON.parse(readFileSync(resolve(root, 'src/data/legs.json'), 'utf8')) as PrecomputedLeg[];
  const log = (s: string) => console.log(s);
  const places = await extractLandmarks(resolve(root, 'public/zim-moz.pmtiles'), legs, log);
  const pois = await fetchOverpassPois(legs, fetch, log);
  const seen = new Set<string>();
  const landmarks = [...places, ...pois]
    .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
    .sort((a, b) => a.km - b.km);
  writeFileSync(resolve(root, 'src/data/landmarks.json'), JSON.stringify(landmarks) + '\n');
  console.log(`wrote ${landmarks.length} landmarks to src/data/landmarks.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

// Build step: compute road legs between consecutive seed locations via OSRM.
// Usage: yarn route            -> writes src/data/legs.json
// Fails loudly if any leg cannot be routed. Honors per-location `via` waypoints
// (applied to the leg *arriving* at that location). Needs network.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Location, PrecomputedLeg } from '../src/data/types';
import { haversineKm } from '../src/data/geo';

const OSRM = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

interface OsrmRoute {
  distance: number;
  geometry: { coordinates: [number, number][] };
}
interface OsrmResponse {
  code: string;
  message?: string;
  routes?: OsrmRoute[];
}

export async function routeLeg(
  from: Location,
  to: Location,
  fetchImpl: typeof fetch = fetch,
): Promise<PrecomputedLeg> {
  const start: [number, number] = from.routeExit ?? [from.lng, from.lat];
  const pts: [number, number][] = [start, ...(to.via ?? []), [to.lng, to.lat]];
  const coords = pts.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`OSRM ${res.status} for ${from.id} -> ${to.id}`);
  const json = (await res.json()) as OsrmResponse;
  const route = json.routes?.[0];
  if (json.code !== 'Ok' || !route) {
    throw new Error(`OSRM ${json.code} ${json.message ?? ''} for ${from.id} -> ${to.id}`);
  }
  // Straight stub from the pin to the routing start when the pin's own road is unmapped.
  const stubKm = from.routeExit
    ? haversineKm({ lat: from.lat, lng: from.lng }, { lat: start[1], lng: start[0] })
    : 0;
  const geometry = from.routeExit
    ? [[from.lng, from.lat] as [number, number], ...route.geometry.coordinates]
    : route.geometry.coordinates;
  return {
    fromId: from.id,
    toId: to.id,
    distanceKm: Math.round((route.distance / 1000 + stubKm) * 10) / 10,
    geometry: simplify(geometry, 5),
  };
}

export async function routeAll(
  locations: Location[],
  fetchImpl: typeof fetch = fetch,
  log: (s: string) => void = () => {},
): Promise<PrecomputedLeg[]> {
  const legs: PrecomputedLeg[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i]!;
    const to = locations[i + 1]!;
    const leg = await routeLeg(from, to, fetchImpl);
    log(`${from.id} -> ${to.id}: ${leg.distanceKm} km (${leg.geometry.length} pts)`);
    legs.push(leg);
  }
  return legs;
}

/** Round coords to `decimals` and drop consecutive duplicates. ~1 m precision at 5 dp. */
export function simplify(coords: [number, number][], decimals: number): [number, number][] {
  const f = 10 ** decimals;
  const out: [number, number][] = [];
  for (const [lng, lat] of coords) {
    const p: [number, number] = [Math.round(lng * f) / f, Math.round(lat * f) / f];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const locations = JSON.parse(
    readFileSync(resolve(root, 'src/data/locations.json'), 'utf8'),
  ) as Location[];
  const legs = await routeAll(locations, fetch, (s) => console.log(s));
  const total = legs.reduce((s, l) => s + l.distanceKm, 0);
  writeFileSync(resolve(root, 'src/data/legs.json'), JSON.stringify(legs) + '\n');
  console.log(`total ${Math.round(total)} km, wrote src/data/legs.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

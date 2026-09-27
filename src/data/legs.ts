import { haversineKm } from './geo';
import type { Leg, MergedLocation, PrecomputedLeg } from './types';

/**
 * Build legs between consecutive locations. Uses precomputed routed geometry when
 * both endpoints are unmoved and a matching precomputed leg exists; otherwise falls
 * back to a straight-line estimate scaled by roadFactor.
 */
export function buildLegs(
  locations: MergedLocation[],
  precomputed: PrecomputedLeg[],
  roadFactor: number,
): Leg[] {
  const byPair = new Map(precomputed.map((p) => [`${p.fromId}>${p.toId}`, p]));
  const legs: Leg[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i]!;
    const to = locations[i + 1]!;
    const routed = byPair.get(`${from.id}>${to.id}`);
    if (routed && !from.moved && !to.moved) {
      legs.push({
        index: i,
        fromId: from.id,
        toId: to.id,
        distanceKm: routed.distanceKm,
        source: 'routed',
        geometry: routed.geometry,
      });
    } else {
      legs.push({
        index: i,
        fromId: from.id,
        toId: to.id,
        distanceKm: haversineKm(from, to) * roadFactor,
        source: 'estimated',
        geometry: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      });
    }
  }
  return legs;
}

export function totalKm(legs: Leg[]): number {
  return legs.reduce((sum, l) => sum + l.distanceKm, 0);
}

export function formatKm(km: number, source?: Leg['source']): string {
  const prefix = source === 'estimated' ? '≈ ' : '';
  return `${prefix}${Math.round(km)} km`;
}

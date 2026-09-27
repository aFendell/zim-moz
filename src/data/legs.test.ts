import { describe, expect, it } from 'vitest';
import { buildLegs, totalKm, formatKm } from './legs';
import type { MergedLocation, PrecomputedLeg } from './types';

const loc = (id: string, lat: number, lng: number, moved = false): MergedLocation => ({
  id,
  type: 'stop',
  name: id,
  lat,
  lng,
  description: '',
  notes: '',
  modified: moved,
  moved,
});

const pre: PrecomputedLeg[] = [
  {
    fromId: 'a',
    toId: 'b',
    distanceKm: 150,
    geometry: [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ],
  },
];

describe('buildLegs', () => {
  it('uses routed leg when present and endpoints unmoved', () => {
    const legs = buildLegs([loc('a', 0, 0), loc('b', 1, 1)], pre, 1.3);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ source: 'routed', distanceKm: 150 });
    expect(legs[0]!.geometry).toHaveLength(3);
  });

  it('falls back to estimate when no precomputed leg', () => {
    const legs = buildLegs([loc('a', 0, 0), loc('c', 0, 1)], pre, 1.3);
    expect(legs[0]!.source).toBe('estimated');
    // 1 degree of longitude at equator ≈ 111.2 km, × 1.3
    expect(legs[0]!.distanceKm).toBeCloseTo(111.2 * 1.3, 0);
    expect(legs[0]!.geometry).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('falls back to estimate when an endpoint moved', () => {
    const legs = buildLegs([loc('a', 0, 0), loc('b', 1, 1, true)], pre, 1.3);
    expect(legs[0]!.source).toBe('estimated');
  });

  it('produces n-1 legs in order', () => {
    const legs = buildLegs([loc('a', 0, 0), loc('b', 1, 1), loc('c', 2, 2)], pre, 1.3);
    expect(legs.map((l) => `${l.fromId}>${l.toId}`)).toEqual(['a>b', 'b>c']);
    expect(legs.map((l) => l.index)).toEqual([0, 1]);
  });
});

describe('totalKm / formatKm', () => {
  it('sums and formats', () => {
    const legs = buildLegs([loc('a', 0, 0), loc('b', 1, 1)], pre, 1.3);
    expect(totalKm(legs)).toBe(150);
    expect(formatKm(150.4)).toBe('150 km');
    expect(formatKm(150.4, 'estimated')).toBe('≈ 150 km');
  });
});

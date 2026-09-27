import { describe, expect, it } from 'vitest';
import { mergeLocations } from './merge';
import type { Location } from './types';

const seed: Location[] = [
  { id: 'a', type: 'stop', name: 'A', lat: 1, lng: 2, description: 'd', notes: '' },
  { id: 'b', type: 'border', name: 'B', lat: 3, lng: 4, description: 'd', notes: '' },
];

describe('mergeLocations', () => {
  it('returns seed unchanged with no overrides', () => {
    const out = mergeLocations(seed, {});
    expect(out.map((l) => l.modified)).toEqual([false, false]);
    expect(out[0]).toMatchObject(seed[0]!);
  });

  it('override wins field-by-field and flags modified', () => {
    const out = mergeLocations(seed, { a: { notes: 'hi' } });
    expect(out[0]).toMatchObject({ name: 'A', notes: 'hi', modified: true, moved: false });
    expect(out[1]!.modified).toBe(false);
  });

  it('flags moved when coords change', () => {
    const out = mergeLocations(seed, { b: { lat: 9 } });
    expect(out[1]).toMatchObject({ lat: 9, lng: 4, moved: true });
  });

  it('ignores unknown ids and empty overrides', () => {
    const out = mergeLocations(seed, { zzz: { name: 'x' }, a: {} });
    expect(out.every((l) => !l.modified)).toBe(true);
  });

  it('does not mutate seed', () => {
    mergeLocations(seed, { a: { name: 'changed' } });
    expect(seed[0]!.name).toBe('A');
  });
});

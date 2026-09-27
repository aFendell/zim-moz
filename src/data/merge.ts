import type { Location, MergedLocation, Overrides } from './types';

/**
 * Apply local overrides to seed locations. Override wins field-by-field.
 * Unknown override ids are ignored. Seed is never mutated.
 */
export function mergeLocations(seed: Location[], overrides: Overrides): MergedLocation[] {
  return seed.map((loc) => {
    const o = overrides[loc.id];
    if (!o || Object.keys(o).length === 0) return { ...loc, modified: false, moved: false };
    const merged = { ...loc, ...o };
    const moved = merged.lat !== loc.lat || merged.lng !== loc.lng;
    return { ...merged, modified: true, moved };
  });
}

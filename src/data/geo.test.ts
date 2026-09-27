import { describe, expect, it } from 'vitest';
import { haversineKm } from './geo';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: -17.83, lng: 31.05 }, { lat: -17.83, lng: 31.05 })).toBe(0);
  });

  it('Harare to Chimoio is roughly 300 km straight line', () => {
    const harare = { lat: -17.8292, lng: 31.0522 };
    const chimoio = { lat: -19.1164, lng: 33.4833 };
    const d = haversineKm(harare, chimoio);
    expect(d).toBeGreaterThan(280);
    expect(d).toBeLessThan(320);
  });
});

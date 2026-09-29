import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from './prefs';

describe('parsePrefs', () => {
  it('returns defaults for garbage', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('x')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ flavor: 'neon', routeColor: 'red', landmarkGroups: 'towns', landmarkColors: 3 })).toEqual(
      DEFAULT_PREFS,
    );
  });

  it('keeps valid values and filters unknown groups', () => {
    expect(
      parsePrefs({
        flavor: 'dark',
        terrain: true,
        landmarks: false,
        landmarkGroups: ['fuel', 'bogus', 'services'],
        routeColor: '#ABCDEF',
        routeCasing: '#000000',
        stopColor: '#123456',
        landmarkColors: { fuel: '#ff0000', bogus: '#00ff00' },
      }),
    ).toEqual({
      ...DEFAULT_PREFS,
      flavor: 'dark',
      terrain: true,
      landmarks: false,
      landmarkGroups: ['fuel', 'services'],
      routeColor: '#ABCDEF',
      routeCasing: '#000000',
      stopColor: '#123456',
      landmarkColors: { ...DEFAULT_PREFS.landmarkColors, fuel: '#ff0000' },
    });
  });
});

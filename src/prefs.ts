/** Per-device display preferences, persisted in localStorage. Pure data, no DOM. */
export type Flavor = 'light' | 'dark' | 'grayscale';
export type LandmarkGroup = 'towns' | 'fuel' | 'services';

export interface Prefs {
  flavor: Flavor;
  terrain: boolean;
  landmarks: boolean;
  landmarkGroups: LandmarkGroup[];
  routeColor: string;
  routeCasing: string;
}

export const DEFAULT_PREFS: Prefs = {
  flavor: 'light',
  terrain: false,
  landmarks: true,
  landmarkGroups: ['towns', 'fuel'],
  routeColor: '#2563eb',
  routeCasing: '#ffffff',
};

export const ROUTE_COLOR_PRESETS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#111827'];
export const CASING_PRESETS = ['#ffffff', '#facc15', '#111827', '#22d3ee'];

const KEY = 'zim-moz:prefs';
const FLAVORS: Flavor[] = ['light', 'dark', 'grayscale'];
const GROUPS: LandmarkGroup[] = ['towns', 'fuel', 'services'];
const HEX = /^#[0-9a-f]{6}$/i;

export function parsePrefs(raw: unknown): Prefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    flavor: FLAVORS.includes(p.flavor as Flavor) ? (p.flavor as Flavor) : DEFAULT_PREFS.flavor,
    terrain: p.terrain === true,
    landmarks: typeof p.landmarks === 'boolean' ? p.landmarks : DEFAULT_PREFS.landmarks,
    landmarkGroups: Array.isArray(p.landmarkGroups)
      ? GROUPS.filter((g) => (p.landmarkGroups as unknown[]).includes(g))
      : DEFAULT_PREFS.landmarkGroups,
    routeColor: typeof p.routeColor === 'string' && HEX.test(p.routeColor) ? p.routeColor : DEFAULT_PREFS.routeColor,
    routeCasing: typeof p.routeCasing === 'string' && HEX.test(p.routeCasing) ? p.routeCasing : DEFAULT_PREFS.routeCasing,
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return parsePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable; prefs live for the session only */
  }
}

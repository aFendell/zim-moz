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
  stopColor: string;
  borderColor: string;
  landmarkColors: Record<LandmarkGroup, string>;
}

export const DEFAULT_PREFS: Prefs = {
  flavor: 'light',
  terrain: false,
  landmarks: true,
  landmarkGroups: ['towns', 'fuel'],
  routeColor: '#2563eb',
  routeCasing: '#ffffff',
  stopColor: '#2563eb',
  borderColor: '#7c3aed',
  landmarkColors: { towns: '#111827', fuel: '#ea580c', services: '#0891b2' },
};

export const COLOR_PRESETS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#111827', '#ffffff', '#facc15'];

const KEY = 'zim-moz:prefs';
const FLAVORS: Flavor[] = ['light', 'dark', 'grayscale'];
export const GROUPS: LandmarkGroup[] = ['towns', 'fuel', 'services'];
const HEX = /^#[0-9a-f]{6}$/i;

const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);

export function parsePrefs(raw: unknown): Prefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lc = (p.landmarkColors && typeof p.landmarkColors === 'object' ? p.landmarkColors : {}) as Record<string, unknown>;
  return {
    flavor: FLAVORS.includes(p.flavor as Flavor) ? (p.flavor as Flavor) : DEFAULT_PREFS.flavor,
    terrain: p.terrain === true,
    landmarks: typeof p.landmarks === 'boolean' ? p.landmarks : DEFAULT_PREFS.landmarks,
    landmarkGroups: Array.isArray(p.landmarkGroups)
      ? GROUPS.filter((g) => (p.landmarkGroups as unknown[]).includes(g))
      : DEFAULT_PREFS.landmarkGroups,
    routeColor: color(p.routeColor, DEFAULT_PREFS.routeColor),
    routeCasing: color(p.routeCasing, DEFAULT_PREFS.routeCasing),
    stopColor: color(p.stopColor, DEFAULT_PREFS.stopColor),
    borderColor: color(p.borderColor, DEFAULT_PREFS.borderColor),
    landmarkColors: {
      towns: color(lc.towns, DEFAULT_PREFS.landmarkColors.towns),
      fuel: color(lc.fuel, DEFAULT_PREFS.landmarkColors.fuel),
      services: color(lc.services, DEFAULT_PREFS.landmarkColors.services),
    },
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return parsePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredClone(DEFAULT_PREFS);
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable; prefs live for the session only */
  }
}

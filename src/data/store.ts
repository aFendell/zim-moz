import { createStore, del, entries, set, clear } from 'idb-keyval';
import type { EditableField, LocationOverride, Overrides } from './types';

const EDITABLE: readonly EditableField[] = ['name', 'description', 'notes', 'lat', 'lng'];

export interface OverrideStore {
  loadAll(): Promise<Overrides>;
  save(id: string, override: LocationOverride): Promise<void>;
  reset(id: string): Promise<void>;
  replaceAll(overrides: Overrides): Promise<void>;
}

/** IndexedDB-backed override store. Each location id is one key. */
export function createOverrideStore(dbName = 'zim-moz', storeName = 'overrides'): OverrideStore {
  const store = createStore(dbName, storeName);
  return {
    async loadAll() {
      const out: Overrides = {};
      for (const [k, v] of await entries<string, LocationOverride>(store)) {
        const clean = sanitizeOverride(v);
        if (clean) out[k] = clean;
      }
      return out;
    },
    async save(id, override) {
      const clean = sanitizeOverride(override);
      if (clean) await set(id, clean, store);
      else await del(id, store);
    },
    async reset(id) {
      await del(id, store);
    },
    async replaceAll(overrides) {
      await clear(store);
      for (const [id, o] of Object.entries(overrides)) {
        const clean = sanitizeOverride(o);
        if (clean) await set(id, clean, store);
      }
    },
  };
}

/** Keep only known editable fields with valid types; null if nothing remains. */
export function sanitizeOverride(input: unknown): LocationOverride | null {
  if (!input || typeof input !== 'object') return null;
  const src = input as Record<string, unknown>;
  const out: LocationOverride = {};
  for (const f of EDITABLE) {
    const v = src[f];
    if (f === 'lat' || f === 'lng') {
      if (typeof v === 'number' && Number.isFinite(v)) out[f] = v;
    } else if (typeof v === 'string') {
      out[f] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Serialize overrides for export; parse + validate for import. */
export function exportOverrides(overrides: Overrides): string {
  return JSON.stringify({ app: 'zim-moz', version: 1, overrides }, null, 2);
}

export function parseOverridesExport(text: string): Overrides {
  const json = JSON.parse(text) as { app?: string; overrides?: unknown };
  if (json.app !== 'zim-moz' || !json.overrides || typeof json.overrides !== 'object') {
    throw new Error('Not a zim-moz export');
  }
  const out: Overrides = {};
  for (const [id, o] of Object.entries(json.overrides as Record<string, unknown>)) {
    const clean = sanitizeOverride(o);
    if (clean) out[id] = clean;
  }
  return out;
}

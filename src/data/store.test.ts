import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOverrideStore, exportOverrides, parseOverridesExport, sanitizeOverride } from './store';

let n = 0;
const fresh = () => createOverrideStore(`test-${n++}`);

describe('override store', () => {
  let store: ReturnType<typeof createOverrideStore>;
  beforeEach(() => {
    store = fresh();
  });

  it('starts empty', async () => {
    expect(await store.loadAll()).toEqual({});
  });

  it('saves, loads, resets', async () => {
    await store.save('tofo', { notes: 'surf' });
    await store.save('harare', { lat: -17.8, lng: 31 });
    expect(await store.loadAll()).toEqual({ tofo: { notes: 'surf' }, harare: { lat: -17.8, lng: 31 } });
    await store.reset('tofo');
    expect(await store.loadAll()).toEqual({ harare: { lat: -17.8, lng: 31 } });
  });

  it('saving an empty override deletes the key', async () => {
    await store.save('tofo', { notes: 'x' });
    await store.save('tofo', {});
    expect(await store.loadAll()).toEqual({});
  });

  it('replaceAll clears then writes', async () => {
    await store.save('a', { name: 'A' });
    await store.replaceAll({ b: { name: 'B' } });
    expect(await store.loadAll()).toEqual({ b: { name: 'B' } });
  });
});

describe('sanitizeOverride', () => {
  it('drops unknown fields and wrong types', () => {
    expect(sanitizeOverride({ name: 'x', lat: 'nope', type: 'border', extra: 1 })).toEqual({ name: 'x' });
    expect(sanitizeOverride({ lat: NaN })).toBeNull();
    expect(sanitizeOverride(null)).toBeNull();
  });
});

describe('export / import', () => {
  it('round-trips', () => {
    const o = { tofo: { notes: 'hi' }, chimoio: { lat: -19.1, lng: 33.4 } };
    expect(parseOverridesExport(exportOverrides(o))).toEqual(o);
  });

  it('rejects foreign JSON', () => {
    expect(() => parseOverridesExport('{"foo":1}')).toThrow(/Not a zim-moz/);
  });
});

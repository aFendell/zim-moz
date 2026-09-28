/**
 * Cache API storage for the offline basemap. One full PMTiles file, keyed by URL + version.
 * DOM-free except for `caches`/`fetch`; no map or UI knowledge.
 */
const CACHE_NAME = 'zim-moz-basemap';
export const BASEMAP_CACHE_EVENT = 'basemap-cache-changed';

export function cacheKey(url: string, version: number): string {
  const u = new URL(url, globalThis.location?.href ?? 'http://localhost/');
  u.searchParams.set('v', String(version));
  return u.toString();
}

export type BasemapCacheState =
  | { kind: 'missing' }
  | { kind: 'ready'; bytes: number }
  | { kind: 'stale' }
  | { kind: 'error'; message: string };

export async function getCachedBlob(url: string, version: number): Promise<Blob | null> {
  if (!('caches' in globalThis)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey(url, version));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

export async function getBasemapCacheState(url: string, version: number): Promise<BasemapCacheState> {
  if (!('caches' in globalThis)) return { kind: 'error', message: 'Cache API unavailable' };
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey(url, version));
    if (hit) return { kind: 'ready', bytes: (await hit.blob()).size };
    const path = new URL(cacheKey(url, version)).pathname;
    const older = (await cache.keys()).some((k) => new URL(k.url).pathname === path);
    return older ? { kind: 'stale' } : { kind: 'missing' };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function downloadBasemap(
  url: string,
  version: number,
  onProgress: (received: number, total: number | null) => void,
): Promise<number> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || null;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  const blob = new Blob(chunks, { type: 'application/octet-stream' });
  const cache = await caches.open(CACHE_NAME);
  // Drop older versions of this same file (other files in the cache are untouched).
  const path = new URL(cacheKey(url, version)).pathname;
  for (const k of await cache.keys()) if (new URL(k.url).pathname === path) await cache.delete(k);
  await cache.put(
    cacheKey(url, version),
    new Response(blob, {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) },
    }),
  );
  if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
  globalThis.dispatchEvent(new CustomEvent(BASEMAP_CACHE_EVENT));
  return blob.size;
}

export async function deleteBasemap(url: string, version: number): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const path = new URL(cacheKey(url, version)).pathname;
  for (const k of await cache.keys()) if (new URL(k.url).pathname === path) await cache.delete(k);
  globalThis.dispatchEvent(new CustomEvent(BASEMAP_CACHE_EVENT));
}

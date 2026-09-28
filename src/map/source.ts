import type { RangeResponse, Source } from 'pmtiles';
import { BASEMAP_CACHE_EVENT, getCachedBlob } from '../data/basemapCache';

/**
 * PMTiles source that serves byte ranges from the Cache API copy when present,
 * falling back to HTTP range requests. Re-checks the cache when it changes.
 */
export class CachedRangeSource implements Source {
  private blob: Blob | null | undefined; // undefined = not yet checked
  private pending: Promise<Blob | null> | null = null;

  constructor(
    private url: string,
    private version: number,
  ) {
    globalThis.addEventListener(BASEMAP_CACHE_EVENT, () => {
      this.blob = undefined;
      this.pending = null;
    });
  }

  getKey(): string {
    return this.url;
  }

  private async cached(): Promise<Blob | null> {
    if (this.blob !== undefined) return this.blob;
    if (!this.pending) {
      this.pending = getCachedBlob(this.url, this.version).then((b) => {
        this.blob = b;
        return b;
      });
    }
    return this.pending;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const blob = await this.cached();
    if (blob) {
      const data = await blob.slice(offset, offset + length).arrayBuffer();
      return { data };
    }
    const res = await fetch(this.url, {
      signal,
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`Basemap fetch failed (${res.status})`);
    }
    const data = await res.arrayBuffer();
    return {
      data: res.status === 200 ? data.slice(offset, offset + length) : data,
      etag: res.headers.get('ETag') ?? undefined,
      cacheControl: res.headers.get('Cache-Control') ?? undefined,
      expires: res.headers.get('Expires') ?? undefined,
    };
  }
}

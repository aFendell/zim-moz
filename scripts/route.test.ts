import { describe, expect, it, vi } from 'vitest';
import { routeAll, routeLeg, simplify } from './route';
import type { Location } from '../src/data/types';

const loc = (id: string, lat: number, lng: number, via?: [number, number][]): Location => ({
  id,
  type: 'stop',
  name: id,
  lat,
  lng,
  description: '',
  notes: '',
  ...(via ? { via } : {}),
});

const ok = (distance: number) =>
  new Response(
    JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance,
          geometry: {
            coordinates: [
              [31.0, -17.8],
              [31.5, -18.0],
              [31.5, -18.0],
              [32.0, -19.0],
            ],
          },
        },
      ],
    }),
    { status: 200 },
  );

describe('routeLeg', () => {
  it('builds OSRM url with via waypoints and parses distance + geometry', async () => {
    const fetchMock = vi.fn(async () => ok(123456));
    const leg = await routeLeg(
      loc('a', -17.8, 31.0),
      loc('b', -19.0, 32.0, [[31.5, -18.0]]),
      fetchMock as unknown as typeof fetch,
    );
    const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain('/route/v1/driving/31,-17.8;31.5,-18;32,-19?');
    expect(leg).toMatchObject({ fromId: 'a', toId: 'b', distanceKm: 123.5 });
    expect(leg.geometry).toHaveLength(3); // duplicate dropped
  });

  it('starts routing at routeExit and prepends a straight stub from the pin', async () => {
    const fetchMock = vi.fn(async () => ok(100000));
    const from = { ...loc('a', -17.8, 31.0), routeExit: [31.0, -17.7] as [number, number] };
    const leg = await routeLeg(from, loc('b', -19.0, 32.0), fetchMock as unknown as typeof fetch);
    const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain('/route/v1/driving/31,-17.7;32,-19?');
    expect(leg.geometry[0]).toEqual([31.0, -17.8]); // pin first
    expect(leg.distanceKm).toBeGreaterThan(100); // 100 km + ~11 km stub
    expect(leg.distanceKm).toBeLessThan(112);
  });

  it('throws on non-Ok code', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ code: 'NoRoute', message: 'x' }), { status: 200 }),
    );
    await expect(
      routeLeg(loc('a', 0, 0), loc('b', 1, 1), fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/NoRoute/);
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 429 }));
    await expect(
      routeLeg(loc('a', 0, 0), loc('b', 1, 1), fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/429/);
  });
});

describe('routeAll', () => {
  it('routes n-1 legs in order and aborts on first failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(1000))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 }));
    await expect(
      routeAll(
        [loc('a', 0, 0), loc('b', 1, 1), loc('c', 2, 2)],
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/b -> c/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('simplify', () => {
  it('rounds and dedupes', () => {
    expect(
      simplify(
        [
          [1.123456789, 2.1],
          [1.123457, 2.1],
          [1.2, 2.2],
        ],
        5,
      ),
    ).toEqual([
      [1.12346, 2.1],
      [1.2, 2.2],
    ]);
  });
});

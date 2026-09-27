import { describe, expect, it } from 'vitest';
import { parseHash, toHash } from './router';

describe('router hash', () => {
  it('parses empty', () => {
    expect(parseHash('')).toEqual({ locationId: null, edit: false });
    expect(parseHash('#')).toEqual({ locationId: null, edit: false });
  });

  it('parses id and edit', () => {
    expect(parseHash('#tofo')).toEqual({ locationId: 'tofo', edit: false });
    expect(parseHash('#tofo/edit')).toEqual({ locationId: 'tofo', edit: true });
    expect(parseHash('#tofo/other')).toEqual({ locationId: 'tofo', edit: false });
  });

  it('round-trips', () => {
    for (const r of [
      { locationId: null, edit: false },
      { locationId: 'a-b', edit: false },
      { locationId: 'a b', edit: true },
    ]) {
      expect(parseHash(toHash(r))).toEqual(r);
    }
  });
});

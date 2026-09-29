import { describe, expect, it } from 'vitest';
import { prefixExpr } from './style';

describe('prefixExpr', () => {
  it('prefixes plain strings and wraps opaque expressions', () => {
    expect(prefixExpr('fuel', 'dark:')).toBe('dark:fuel');
    expect(prefixExpr(['get', 'kind'], 'dark:')).toEqual(['concat', 'dark:', ['get', 'kind']]);
    expect(prefixExpr(['concat', 'shield-', ['get', 'n']], 'dark:')).toEqual([
      'concat',
      'dark:',
      ['concat', 'shield-', ['get', 'n']],
    ]);
  });

  it('keeps zoom-driven step at top level and prefixes branch outputs', () => {
    expect(prefixExpr(['step', ['zoom'], 'a', 10, ['get', 'k'], 14, 'b'], 'x:')).toEqual([
      'step',
      ['zoom'],
      'x:a',
      10,
      ['concat', 'x:', ['get', 'k']],
      14,
      'x:b',
    ]);
  });

  it('handles case, match and coalesce outputs', () => {
    expect(prefixExpr(['case', ['has', 'p'], 'a', 'b'], 'x:')).toEqual(['case', ['has', 'p'], 'x:a', 'x:b']);
    expect(prefixExpr(['match', ['get', 'k'], 'fuel', 'f', 'z'], 'x:')).toEqual([
      'match',
      ['get', 'k'],
      'fuel',
      'x:f',
      'x:z',
    ]);
    expect(prefixExpr(['coalesce', ['get', 'a'], 'b'], 'x:')).toEqual([
      'coalesce',
      ['concat', 'x:', ['get', 'a']],
      'x:b',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { drawMany, nextRandom } from './rng.js';

describe('rng', () => {
  it('is deterministic for a seed and returns values in [0, 1)', () => {
    const [a, seedA] = nextRandom(42);
    const [b, seedB] = nextRandom(42);
    expect(a).toBe(b);
    expect(seedA).toBe(seedB);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('threads the seed so successive draws differ', () => {
    const [a, s1] = nextRandom(1);
    const [b] = nextRandom(s1);
    expect(a).not.toBe(b);
  });

  it('drawMany matches repeated nextRandom', () => {
    const [values, seed] = drawMany(7, 3);
    const [v0, s0] = nextRandom(7);
    const [v1, s1] = nextRandom(s0);
    const [v2, s2] = nextRandom(s1);
    expect(values).toEqual([v0, v1, v2]);
    expect(seed).toBe(s2);
  });

  it('is roughly uniform', () => {
    const [values] = drawMany(99, 2000);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

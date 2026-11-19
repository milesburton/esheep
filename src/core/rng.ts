/**
 * Seeded, immutable PRNG (mulberry32). `nextRandom` returns the value and the *next seed*, so
 * state can be threaded through pure functions and every run replays exactly from its seed.
 */
export const nextRandom = (seed: number): readonly [value: number, nextSeed: number] => {
  const s = (seed + 0x6d2b79f5) >>> 0;
  const a = Math.imul(s ^ (s >>> 15), s | 1);
  const b = a ^ (a + Math.imul(a ^ (a >>> 7), a | 61));
  return [((b ^ (b >>> 14)) >>> 0) / 4294967296, s];
};

/** Draw `n` values, returning them with the advanced seed. */
export const drawMany = (
  seed: number,
  n: number,
): readonly [values: readonly number[], nextSeed: number] =>
  Array.from({ length: n }).reduce<readonly [readonly number[], number]>(
    ([values, s]) => {
      const [v, next] = nextRandom(s);
      return [[...values, v], next];
    },
    [[], seed],
  );

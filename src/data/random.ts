/** Small seeded PRNG (mulberry32) so generated seed data is the same on every run. */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Float in [0, 1). */
    next,
    /** Integer in [min, max], inclusive. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Roughly normal noise with the given spread (sum of uniforms). */
    jitter(spread: number): number {
      return (next() + next() + next() - 1.5) * (2 / 3) * spread;
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
  };
}

export type Random = ReturnType<typeof createRandom>;

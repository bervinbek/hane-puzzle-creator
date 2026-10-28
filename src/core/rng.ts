/** Returns floats in [0, 1). */
export type Rng = () => number;

/**
 * Small seeded PRNG (mulberry32). Every random choice in the puzzle pipeline must come from
 * one of these so the same drawing, settings and seed always give the same puzzle.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

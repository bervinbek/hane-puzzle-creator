import { mulberry32 } from '../rng';

/** How far a piece has got: 0 white, 1 tan, 2 gold. */
export type Tone = 0 | 1 | 2;

/**
 * The order the Puzzle step upgrades the pieces in. Every piece appears twice: the first time it
 * goes white to tan, the second time tan to gold. The order is shuffled by the seed, so the same
 * puzzle always plays the same way, and a piece is never gold before it has been tan.
 */
export function revealOrder(count: number, seed: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < count; i++) order.push(i, i);
  const rng = mulberry32(Math.imul(seed + 1, 0x9e3779b1) ^ count);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** The colour of every piece after the first `step` upgrades of `order`. */
export function tonesAfter(order: readonly number[], count: number, step: number): Tone[] {
  const tones = new Array<Tone>(count).fill(0);
  for (let i = 0; i < Math.min(step, order.length); i++) {
    const piece = order[i]!;
    tones[piece] = Math.min(2, tones[piece]! + 1) as Tone;
  }
  return tones;
}

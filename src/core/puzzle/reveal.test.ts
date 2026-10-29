import { describe, expect, it } from 'vitest';
import { revealOrder, tonesAfter } from './reveal';

describe('revealOrder', () => {
  it('lists every piece twice', () => {
    const order = revealOrder(12, 3);
    expect(order).toHaveLength(24);
    for (let id = 0; id < 12; id++) expect(order.filter((p) => p === id)).toHaveLength(2);
  });

  it('is the same for the same seed, and different for another', () => {
    expect(revealOrder(12, 3)).toEqual(revealOrder(12, 3));
    expect(revealOrder(12, 3)).not.toEqual(revealOrder(12, 4));
  });
});

describe('tonesAfter', () => {
  const order = revealOrder(8, 5);

  it('starts all white and ends all gold', () => {
    expect(tonesAfter(order, 8, 0)).toEqual(new Array(8).fill(0));
    expect(tonesAfter(order, 8, order.length)).toEqual(new Array(8).fill(2));
    expect(tonesAfter(order, 8, order.length + 5)).toEqual(new Array(8).fill(2));
  });

  it('upgrades exactly one piece by one colour at every step', () => {
    for (let step = 1; step <= order.length; step++) {
      const before = tonesAfter(order, 8, step - 1);
      const after = tonesAfter(order, 8, step);
      const changed = after.filter((t, i) => t !== before[i]);
      expect(changed).toHaveLength(1);
      expect(
        after.reduce<number>((a, t) => a + t, 0) - before.reduce<number>((a, t) => a + t, 0),
      ).toBe(1);
    }
  });
});

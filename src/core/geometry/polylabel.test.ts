import { describe, expect, it } from 'vitest';
import type { Vec2 } from './polygon';
import { poleOfInaccessibility, signedDistance } from './polylabel';

const square = (s: number): Vec2[] => [
  [0, 0],
  [s, 0],
  [s, s],
  [0, s],
];

describe('signedDistance', () => {
  it('is positive inside, negative outside, and the distance to the nearest edge', () => {
    expect(signedDistance(5, 5, square(10))).toBeCloseTo(5, 9);
    expect(signedDistance(1, 5, square(10))).toBeCloseTo(1, 9);
    expect(signedDistance(-2, 5, square(10))).toBeCloseTo(-2, 9);
  });
});

describe('poleOfInaccessibility', () => {
  it('finds the middle of a square', () => {
    const p = poleOfInaccessibility(square(10));
    expect(p.x).toBeCloseTo(5, 1);
    expect(p.y).toBeCloseTo(5, 1);
    expect(p.distance).toBeCloseTo(5, 1);
  });

  it('finds the fat part of an L, not its middle', () => {
    const l: Vec2[] = [
      [0, 0],
      [30, 0],
      [30, 6],
      [10, 6],
      [10, 30],
      [0, 30],
    ];
    const p = poleOfInaccessibility(l);
    expect(p.distance).toBeCloseTo(5, 0);
    expect(signedDistance(p.x, p.y, l)).toBeCloseTo(p.distance, 6);
  });

  it('is the same every time, and says 0 for a flat shape', () => {
    const star: Vec2[] = [
      [0, 0],
      [20, 3],
      [40, 0],
      [37, 20],
      [40, 40],
      [20, 37],
      [0, 40],
      [3, 20],
    ];
    expect(poleOfInaccessibility(star)).toEqual(poleOfInaccessibility(star));
    expect(
      poleOfInaccessibility([
        [0, 0],
        [5, 0],
        [10, 0],
      ]).distance,
    ).toBe(0);
  });
});

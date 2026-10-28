import { describe, expect, it } from 'vitest';
import {
  difference,
  intersect,
  largest,
  offset,
  outers,
  totalArea,
  union,
  type Poly,
} from './clip';
import { signedArea } from './polyline';

const square = (x: number, y: number, s: number): Poly => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

describe('clip wrapper', () => {
  it('returns counter-clockwise outer rings with correct areas', () => {
    const [u] = union([square(0, 0, 10)], [square(5, 0, 10)]);
    expect(signedArea(u!)).toBeCloseTo(150, 3);
    expect(totalArea(intersect([square(0, 0, 10)], [square(5, 0, 10)]))).toBeCloseTo(50, 3);
    expect(totalArea(difference([square(0, 0, 10)], [square(5, 0, 10)]))).toBeCloseTo(50, 3);
  });

  it('keeps a hole as a negative ring', () => {
    const ring = difference([square(0, 0, 10)], [square(3, 3, 4)]);
    expect(outers(ring)).toHaveLength(1);
    expect(totalArea(ring)).toBeCloseTo(100 - 16, 3);
  });

  it('shrinks and grows by the requested distance', () => {
    const shrunk = largest(offset([square(0, 0, 10)], -1))!;
    expect(signedArea(shrunk)).toBeCloseTo(64, 2);
    const grown = largest(offset([square(0, 0, 10)], 1))!;
    // Rounded corners: 100 + 4*10*1 + pi*1^2
    expect(signedArea(grown)).toBeCloseTo(100 + 40 + Math.PI, 1);
  });

  it('removes a shape thinner than twice the inset', () => {
    expect(
      offset(
        [
          [
            [0, 0],
            [20, 0],
            [20, 0.4],
            [0, 0.4],
          ],
        ],
        -0.3,
      ),
    ).toHaveLength(0);
  });
});

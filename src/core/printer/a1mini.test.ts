import { describe, expect, it } from 'vitest';
import { A1_MINI, PUZZLE_THICKNESS_MM, usablePlateSize } from './a1mini';

describe('a1mini constants', () => {
  it('defaults to a 170 mm usable plate (180 mm minus 5 mm margins)', () => {
    expect(usablePlateSize()).toBe(170);
  });

  it('never returns a negative size for oversized margins', () => {
    expect(usablePlateSize(200)).toBe(0);
  });

  it('puzzle thickness is a whole number of layers', () => {
    expect(PUZZLE_THICKNESS_MM / A1_MINI.layerHeight).toBeCloseTo(15, 10);
  });
});

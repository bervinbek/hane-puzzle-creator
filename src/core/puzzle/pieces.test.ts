import { describe, expect, it } from 'vitest';
import { difference, intersect, totalArea, type Poly } from '../geometry/clip';
import { isSimple } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';
import { mulberry32 } from '../rng';
import { cutIntoPieces, uncoveredArea } from './cells';
import { addTabs, sharedEdges } from './tabs';
import { validatePuzzle } from './validate';

const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A U shape: two 20 wide arms 100 tall joined by a 20 tall base. */
const U: Poly = [
  [0, 0],
  [100, 0],
  [100, 100],
  [80, 100],
  [80, 20],
  [20, 20],
  [20, 100],
  [0, 100],
];

describe('cutIntoPieces on a concave shape', () => {
  it('never returns a piece in two parts when a cell is split by the shape', () => {
    // The right arm tip is nearer the left seed than the bottom seed, but not connected to it.
    const pieces = cutIntoPieces(
      U,
      [
        [10, 90],
        [50, 10],
      ],
      5,
    );
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    for (const p of pieces) expect(isSimple(p)).toBe(true);
    // Rounding to whole micrometres can leave hairlines worth about a square millimetre.
    expect(uncoveredArea(U, pieces)).toBeLessThan(2);
    const total = pieces.reduce((s, p) => s + signedArea(p), 0);
    expect(Math.abs(total - signedArea(U))).toBeLessThan(2);
  });

  it('merges pieces smaller than the minimum into a neighbour', () => {
    const pieces = cutIntoPieces(
      rect(0, 0, 100, 40),
      [
        [10, 20],
        [14, 20],
        [70, 20],
      ],
      600,
    );
    expect(pieces.length).toBeLessThan(3);
    expect(uncoveredArea(rect(0, 0, 100, 40), pieces)).toBeLessThan(2);
  });
});

describe('addTabs', () => {
  const left = rect(0, 0, 40, 30);
  const right = rect(40, 0, 80, 30);

  it('finds the straight border two pieces share', () => {
    const edges = sharedEdges(left, right);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.length).toBeCloseTo(30, 1);
  });

  it('moves a tab from one piece into the other without changing the combined shape', () => {
    const { pieces, tabCount } = addTabs([left, right], mulberry32(1));
    expect(tabCount).toBe(1);
    const [a, b] = pieces as [Poly, Poly];
    expect(isSimple(a)).toBe(true);
    expect(isSimple(b)).toBe(true);
    expect(signedArea(a) + signedArea(b)).toBeCloseTo(2400, 1);
    expect(totalArea(intersect([a], [b]))).toBeLessThan(0.01);
    expect(Math.abs(signedArea(a) - signedArea(b))).toBeGreaterThan(10);
    expect(totalArea(difference([rect(0, 0, 80, 30)], pieces))).toBeLessThan(0.01);
  });

  it('skips edges that are too short for a tab', () => {
    const shortA = rect(0, 0, 40, 8);
    const shortB = rect(40, 0, 80, 8);
    expect(addTabs([shortA, shortB], mulberry32(1)).tabCount).toBe(0);
  });

  it('adds two tabs, one each way, on a long edge', () => {
    const tallA = rect(0, 0, 40, 70);
    const tallB = rect(40, 0, 80, 70);
    const { pieces, tabCount } = addTabs([tallA, tallB], mulberry32(1));
    expect(tabCount).toBe(2);
    // One tab each way leaves the two pieces with equal area.
    expect(signedArea(pieces[0]!)).toBeCloseTo(signedArea(pieces[1]!), 0);
  });
});

describe('validatePuzzle', () => {
  const limits = {
    clearance: 0.3,
    minFeature: 1.2,
    minPieceArea: 60,
    plateSize: 170,
    requested: 2,
  };

  it('accepts two pieces with the intended gap', () => {
    expect(validatePuzzle([rect(0, 0, 40, 30), rect(40.3, 0, 80, 30)], limits)).toEqual([]);
  });

  it('flags overlap, too small a gap, and a piece off the plate', () => {
    const kinds = (pieces: Poly[]): string[] => validatePuzzle(pieces, limits).map((i) => i.kind);
    expect(kinds([rect(0, 0, 40, 30), rect(39, 0, 80, 30)])).toContain('overlap');
    expect(kinds([rect(0, 0, 40, 30), rect(40.1, 0, 80, 30)])).toContain('gap-too-small');
    expect(kinds([rect(0, 0, 40, 30), rect(100, 0, 140, 30)])).toContain('outside-plate');
  });

  it('warns about thin parts and about getting fewer pieces than asked', () => {
    const kinds = validatePuzzle([rect(-30, 0, 30, 0.6)], { ...limits, requested: 3 }).map(
      (i) => i.kind,
    );
    expect(kinds).toContain('thin-feature');
    expect(kinds).toContain('fewer-pieces');
  });
});

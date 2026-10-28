import { describe, expect, it } from 'vitest';
import { largest, offset, totalArea, union, type Poly } from '../src/core/geometry/clip';
import { isSimple, type Vec2 } from '../src/core/geometry/polygon';
import { fitToPlate, signedArea } from '../src/core/geometry/polyline';
import { DEFAULT_TIDY, OutlineExtractor } from '../src/core/outline';
import { uncoveredArea } from '../src/core/puzzle/cells';
import { DEFAULT_PUZZLE, generatePuzzle, type PuzzleParams } from '../src/core/puzzle/generate';
import { FISH_OUTLINE } from '../src/core/samples/fish';
import { circleAt, fishAt, renderDrawing, spiderAt } from './fixtures/synth';

const PLATE = DEFAULT_PUZZLE.plateSize;

const toMm = (poly: Vec2[]): Poly => fitToPlate(poly, PLATE).points;
const ellipse = (): Poly => toMm(circleAt(0, 0, 100).map(([x, y]) => [x * 1.8, y] as Vec2));
const lShape = (): Poly =>
  toMm([
    [0, 0],
    [120, 0],
    [120, 40],
    [40, 40],
    [40, 120],
    [0, 120],
  ]);
const tracedFish = (): Poly =>
  new OutlineExtractor(renderDrawing({ shape: fishAt(225, 169, 340) })).run(DEFAULT_TIDY).outlineMm;

const SHAPES: Record<string, () => Poly> = {
  fish: () => toMm([...FISH_OUTLINE]),
  'thin legs': () => toMm(spiderAt(225, 169, 55)),
  ellipse,
  'L shape': lShape,
  'traced photo': tracedFish,
};

const params = (count: number, seed: number): PuzzleParams => ({ ...DEFAULT_PUZZLE, count, seed });

describe('puzzle generation: every shape, piece count and seed', () => {
  for (const [name, make] of Object.entries(SHAPES)) {
    const outline = make();
    const outlineArea = signedArea(outline);

    for (const count of [2, 3, 5, 8, 12, 20, 32, 48, 60]) {
      for (const seed of count <= 12 ? [1, 2, 3] : [1]) {
        it(`${name}, ${count} pieces, seed ${seed}`, () => {
          const puzzle = generatePuzzle(outline, params(count, seed));

          const errors = puzzle.issues.filter((i) => i.severity === 'error');
          expect(errors, errors.map((e) => e.message).join('; ')).toEqual([]);
          expect(puzzle.pieces.length).toBeGreaterThanOrEqual(1);
          expect(puzzle.pieces.length).toBeLessThanOrEqual(count);

          for (const piece of puzzle.pieces) {
            expect(signedArea(piece.polygon)).toBeGreaterThan(0); // counter-clockwise
            expect(isSimple(piece.polygon)).toBe(true);
          }

          // The pieces before the gap tile the (slightly grown) outline exactly.
          const grown = largest(offset([outline], DEFAULT_PUZZLE.clearance / 2))!;
          expect(uncoveredArea(grown, puzzle.cut)).toBeLessThan(2);
          const cutArea = puzzle.cut.reduce((s, p) => s + signedArea(p), 0);
          expect(Math.abs(cutArea - signedArea(grown)) / signedArea(grown)).toBeLessThan(0.005);

          // After the gap: a little smaller than the outline, never bigger.
          const total = puzzle.pieces.reduce((s, p) => s + p.areaMm2, 0);
          expect(total).toBeLessThanOrEqual(outlineArea * 1.001);
          expect(total).toBeGreaterThan(outlineArea * 0.9);
        });
      }
    }
  }
});

describe('puzzle generation: behaviour', () => {
  const fish = SHAPES.fish!();

  it('gives the number of pieces asked for when they are big enough', () => {
    for (const count of [2, 6, 12, 24]) {
      expect(generatePuzzle(fish, params(count, 1)).pieces).toHaveLength(count);
    }
  });

  it('is deterministic for a seed and different for another', () => {
    const a = generatePuzzle(fish, params(12, 7));
    const b = generatePuzzle(fish, params(12, 7));
    const c = generatePuzzle(fish, params(12, 8));
    expect(a.pieces.map((p) => p.polygon)).toEqual(b.pieces.map((p) => p.polygon));
    expect(a.pieces.map((p) => p.polygon)).not.toEqual(c.pieces.map((p) => p.polygon));
  });

  it('adds tabs on the longer shared edges', () => {
    expect(generatePuzzle(fish, params(12, 1)).tabCount).toBeGreaterThanOrEqual(8);
    expect(generatePuzzle(fish, params(2, 1)).tabCount).toBeGreaterThanOrEqual(1);
  });

  it('keeps the outer silhouette true to the drawing', () => {
    const puzzle = generatePuzzle(fish, params(12, 1));
    const all = union(
      puzzle.pieces.map((p) => p.polygon),
      [],
    );
    const regrown = offset(all, DEFAULT_PUZZLE.clearance / 2 + 0.05);
    const covered = totalArea(regrown);
    expect(covered).toBeGreaterThan(signedArea(fish) * 0.99);
    expect(covered).toBeLessThan(signedArea(fish) * 1.03);
  });

  it('reports fewer pieces when the request is too many for the shape', () => {
    const tiny = toMm(circleAt(0, 0, 10)).map(([x, y]) => [x * 0.25, y * 0.25] as Vec2);
    const puzzle = generatePuzzle(tiny, params(40, 1));
    expect(puzzle.pieces.length).toBeLessThan(40);
    expect(puzzle.issues.some((i) => i.kind === 'fewer-pieces')).toBe(true);
  });

  it('opens up a wider gap when asked', () => {
    const wide = generatePuzzle(fish, { ...params(12, 1), clearance: 0.6 });
    const tight = generatePuzzle(fish, params(12, 1));
    const area = (p: typeof wide): number => p.pieces.reduce((s, x) => s + x.areaMm2, 0);
    expect(area(wide)).toBeLessThan(area(tight));
    expect(wide.ok).toBe(true);
  });
});

describe('speed', () => {
  it('cuts a 24 piece puzzle fast enough to feel live', () => {
    const fish = SHAPES.fish!();
    const t0 = performance.now();
    generatePuzzle(fish, params(24, 1));
    const t1 = performance.now();
    generatePuzzle(fish, params(60, 1));
    const t2 = performance.now();
    console.log(`24 pieces: ${Math.round(t1 - t0)} ms, 60 pieces: ${Math.round(t2 - t1)} ms`);
    expect(t1 - t0).toBeLessThan(3000);
  });
});

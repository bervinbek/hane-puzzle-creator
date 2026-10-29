import { describe, expect, it } from 'vitest';
import { puzzleMeshes, puzzleStl } from '../src/core/export/bundle';
import type { Poly } from '../src/core/geometry/clip';
import { signedDistance } from '../src/core/geometry/polylabel';
import { fitToPlate } from '../src/core/geometry/polyline';
import { checkMesh, extrudePolygon } from '../src/core/mesh/extrude';
import { toleranceCoupons, toleranceStl } from '../src/core/puzzle/coupon';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import { DEFAULT_MAGNET, MAGNET, MIN_FLOOR_MM } from '../src/core/puzzle/magnets';
import { printReport } from '../src/core/puzzle/report';
import { FISH_OUTLINE } from '../src/core/samples/fish';
import { circleAt, spiderAt } from './fixtures/synth';

const PLATE = DEFAULT_PUZZLE.plateSize;
const SHAPES: Record<string, Poly> = {
  fish: fitToPlate([...FISH_OUTLINE], PLATE).points,
  spider: fitToPlate(spiderAt(225, 169, 55), PLATE).points,
  ellipse: fitToPlate(
    circleAt(0, 0, 100).map(([x, y]) => [x * 1.8, y] as [number, number]),
    PLATE,
  ).points,
};
const make = (outline: Poly, count: number, seed: number, magnet = DEFAULT_PUZZLE.magnet) =>
  generatePuzzle(outline, { ...DEFAULT_PUZZLE, count, seed, magnet });

const SQUARE: Poly = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
];

describe('a pocket in an extruded piece', () => {
  const pocket = { x: 10, y: 10, radius: 3.1, depth: 2.2 };
  // The rim is a 48-sided polygon, so the hole is a little smaller than a true circle.
  const hole = 0.5 * 48 * pocket.radius ** 2 * Math.sin((2 * Math.PI) / 48) * pocket.depth;

  it('is a closed solid that has lost exactly the pocket from its volume', () => {
    const plain = checkMesh(extrudePolygon(SQUARE, 3));
    const hollow = checkMesh(extrudePolygon(SQUARE, 3, undefined, pocket));
    expect(hollow.watertight).toBe(true);
    expect(hollow.volume).toBeCloseTo(plain.volume - hole, 3);
  });

  it('stays closed with the bottom edge relief as well', () => {
    const relief = { inset: 0.3, height: 0.2 };
    const mesh = extrudePolygon(SQUARE, 3, relief, pocket);
    const check = checkMesh(mesh);
    expect(check.watertight).toBe(true);
    expect(check.volume).toBeCloseTo(checkMesh(extrudePolygon(SQUARE, 3, relief)).volume - hole, 3);
  });

  it('leaves the floor under it solid and the pocket open at the top', () => {
    const mesh = extrudePolygon(SQUARE, 3, undefined, pocket);
    const zs = new Set<number>();
    for (let i = 0; i < mesh.positions.length; i += 3) zs.add(+mesh.positions[i + 2]!.toFixed(4));
    expect([...zs].sort()).toEqual([0, 0.8, 3]);
  });
});

describe('the pockets in a whole puzzle', () => {
  for (const [name, outline] of Object.entries(SHAPES)) {
    for (const count of [6, 12, 24]) {
      for (const seed of [1, 2, 3]) {
        it(`${name}, ${count} pieces, seed ${seed}: valid, closed, every pocket inside with its wall`, () => {
          const puzzle = make(outline, count, seed);
          expect(puzzle.ok).toBe(true);
          const meshes = puzzleMeshes(puzzle);
          puzzle.pieces.forEach((piece, i) => {
            const check = checkMesh(meshes[i]!);
            expect(check.watertight).toBe(true);
            expect(check.volume).toBeGreaterThan(0);
            const p = piece.pocket;
            if (!p) return;
            // The whole pocket is inside the piece with at least the wall to spare.
            expect(signedDistance(p.x, p.y, piece.polygon)).toBeGreaterThanOrEqual(
              p.radius + DEFAULT_MAGNET.minWall - 0.01,
            );
            expect(p.radius * 2).toBeCloseTo(MAGNET.diameterMm + DEFAULT_MAGNET.fit, 9);
            // A floor of plastic is left under it.
            expect(3 - p.depth).toBeGreaterThanOrEqual(MIN_FLOOR_MM);
          });
        });
      }
    }
  }

  it('gives every piece a pocket when the pieces are big, and says so in the report', () => {
    const puzzle = make(SHAPES.fish!, 6, 1);
    expect(puzzle.pieces.every((p) => p.pocket)).toBe(true);
    expect(puzzle.issues.some((i) => i.kind === 'no-magnet-room')).toBe(false);
    const report = printReport(puzzle);
    expect(report.magnetCount).toBe(6);
    expect(report.totalMagnets).toBe(18);
  });

  it('skips a piece that is too small, with a warning, and keeps the puzzle printable', () => {
    const puzzle = make(SHAPES.fish!, 60, 1);
    const small = puzzle.pieces.filter((p) => !p.pocket);
    expect(small.length).toBeGreaterThan(0);
    const warned = puzzle.issues.filter((i) => i.kind === 'no-magnet-room');
    expect(warned.map((i) => i.piece).sort()).toEqual(small.map((p) => p.id).sort());
    expect(warned.every((i) => i.severity === 'warning')).toBe(true);
    expect(puzzle.ok).toBe(true);
    expect(printReport(puzzle).magnetCount).toBe(puzzle.pieces.length - small.length);
  });

  it('makes a puzzle with no pockets when magnets are off, and the STL is smaller', () => {
    const without = make(SHAPES.fish!, 12, 1, null);
    expect(without.pieces.every((p) => p.pocket === null)).toBe(true);
    expect(without.issues.some((i) => i.kind === 'no-magnet-room')).toBe(false);
    expect(puzzleStl(make(SHAPES.fish!, 12, 1)).length).toBeGreaterThan(puzzleStl(without).length);
  });

  it('is the same bytes every time, and a wider fit changes them', () => {
    const a = puzzleStl(make(SHAPES.fish!, 12, 1));
    expect(puzzleStl(make(SHAPES.fish!, 12, 1))).toEqual(a);
    const wider = make(SHAPES.fish!, 12, 1, { ...DEFAULT_MAGNET, fit: 0.4 });
    expect(puzzleStl(wider)).not.toEqual(a);
  });

  it('leaves out the pocket when the puzzle is too thin to leave a floor', () => {
    const puzzle = make(SHAPES.fish!, 6, 1);
    const thin = checkMesh(puzzleMeshes(puzzle, 2.5)[0]!).volume;
    const plain = checkMesh(extrudePolygon(puzzle.pieces[0]!.polygon, 2.5)).volume;
    expect(thin).toBeCloseTo(plain, 6);
  });
});

describe('the gap test print', () => {
  it('has a pocket in each of its six pieces, inside the moved piece', () => {
    const { combined } = toleranceCoupons();
    expect(combined.pieces).toHaveLength(6);
    for (const piece of combined.pieces) {
      expect(piece.pocket).not.toBeNull();
      const p = piece.pocket!;
      expect(signedDistance(p.x, p.y, piece.polygon)).toBeGreaterThanOrEqual(p.radius);
    }
  });

  it('changes with the magnet fit', () => {
    expect(toleranceStl(undefined, undefined, { ...DEFAULT_MAGNET, fit: 0.4 })).not.toEqual(
      toleranceStl(),
    );
  });
});

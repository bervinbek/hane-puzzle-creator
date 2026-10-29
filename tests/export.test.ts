import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { puzzleMeshes, puzzleStl, safeName } from '../src/core/export/bundle';
import type { Poly } from '../src/core/geometry/clip';
import { fitToPlate, signedArea } from '../src/core/geometry/polyline';
import { checkMesh, extrudePolygon, mergeMeshes } from '../src/core/mesh/extrude';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import { formatDuration, printReport } from '../src/core/puzzle/report';
import { FISH_OUTLINE } from '../src/core/samples/fish';
import { circleAt, spiderAt } from './fixtures/synth';

const PLATE = DEFAULT_PUZZLE.plateSize;
const fish = fitToPlate([...FISH_OUTLINE], PLATE).points;
const spider = fitToPlate(spiderAt(225, 169, 55), PLATE).points;
const ellipse = fitToPlate(
  circleAt(0, 0, 100).map(([x, y]) => [x * 1.8, y] as [number, number]),
  PLATE,
).points;
const puzzleOf = (outline: Poly, count: number, seed = 1) =>
  generatePuzzle(outline, { ...DEFAULT_PUZZLE, count, seed });

/** Reads a binary STL back into triangles. */
function readStl(bytes: Uint8Array): { header: string; triangles: number[][] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  expect(bytes.length).toBe(84 + count * 50);
  const triangles: number[][] = [];
  for (let t = 0; t < count; t++) {
    const o = 84 + t * 50;
    triangles.push(Array.from({ length: 12 }, (_, k) => view.getFloat32(o + k * 4, true)));
  }
  return { header: new TextDecoder().decode(bytes.subarray(0, 80)), triangles };
}

describe('extrudePolygon', () => {
  it('makes a closed box from a square', () => {
    const mesh = extrudePolygon(
      [
        [0, 0],
        [10, 0],
        [10, 20],
        [0, 20],
      ],
      3,
    );
    const check = checkMesh(mesh);
    expect(mesh.positions.length / 3).toBe(8);
    expect(mesh.indices.length / 3).toBe(12);
    expect(check.watertight).toBe(true);
    expect(check.volume).toBeCloseTo(600, 3);
  });

  it('accepts clockwise input and repeated points', () => {
    const mesh = extrudePolygon(
      [
        [0, 0],
        [0, 20],
        [0, 20],
        [10, 20],
        [10, 0],
        [0, 0],
      ],
      3,
    );
    expect(checkMesh(mesh).watertight).toBe(true);
    expect(checkMesh(mesh).volume).toBeCloseTo(600, 3);
  });

  it('handles a concave polygon', () => {
    const l: Poly = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 30],
      [0, 30],
    ];
    const check = checkMesh(extrudePolygon(l, 3));
    expect(check.watertight).toBe(true);
    expect(check.volume).toBeCloseTo(signedArea(l) * 3, 3);
  });

  it('rejects a polygon with fewer than three corners', () => {
    expect(() =>
      extrudePolygon(
        [
          [0, 0],
          [1, 1],
        ],
        3,
      ),
    ).toThrow();
  });
});

describe('every piece of every puzzle prints without repair', () => {
  const cases: [string, Poly][] = [
    ['fish', fish],
    ['thin legs', spider],
    ['ellipse', ellipse],
  ];
  for (const [name, outline] of cases) {
    for (const count of [2, 6, 12, 24, 48]) {
      it(`${name}, ${count} pieces`, () => {
        const puzzle = puzzleOf(outline, count);
        const meshes = puzzleMeshes(puzzle);
        expect(meshes).toHaveLength(puzzle.pieces.length);
        meshes.forEach((mesh, i) => {
          const check = checkMesh(mesh);
          expect(check, `piece ${i + 1}`).toMatchObject({
            watertight: true,
            openEdges: 0,
            badEdges: 0,
            degenerate: 0,
          });
          // Float32 positions cost a little precision; the volume is still within 0.1%.
          const expected = puzzle.pieces[i]!.areaMm2 * 3;
          expect(Math.abs(check.volume - expected) / expected).toBeLessThan(1e-3);
        });
      });
    }
  }
});

describe('binary STL', () => {
  const puzzle = puzzleOf(fish, 12);
  const { header, triangles } = readStl(puzzleStl(puzzle));

  it('has a plain header and the right number of triangles', () => {
    expect(header.startsWith('Hane Puzzle Generator')).toBe(true);
    const expected = puzzleMeshes(puzzle).reduce((s, m) => s + m.indices.length / 3, 0);
    expect(triangles.length).toBe(expected);
  });

  it('is 3 mm tall, sits on the plate and stays inside it', () => {
    const zs = triangles.flatMap((t) => [t[5]!, t[8]!, t[11]!]);
    const xs = triangles.flatMap((t) => [t[3]!, t[6]!, t[9]!]);
    const ys = triangles.flatMap((t) => [t[4]!, t[7]!, t[10]!]);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBeCloseTo(3, 5);
    for (const v of [...xs, ...ys]) expect(Math.abs(v)).toBeLessThanOrEqual(PLATE / 2);
  });

  it('has unit normals that point out of the solid', () => {
    let up = 0;
    let down = 0;
    for (const t of triangles) {
      expect(Math.hypot(t[0]!, t[1]!, t[2]!)).toBeCloseTo(1, 4);
      if (t[2]! > 0.999) up++;
      if (t[2]! < -0.999) down++;
    }
    expect(up).toBe(down);
    expect(up).toBeGreaterThan(0);
  });

  it('combined shells have the same total volume as the separate pieces', () => {
    const merged = mergeMeshes(puzzleMeshes(puzzle));
    const separate = puzzleMeshes(puzzle).reduce((s, m) => s + checkMesh(m).volume, 0);
    expect(checkMesh(merged).watertight).toBe(true);
    expect(checkMesh(merged).volume).toBeCloseTo(separate, 3);
  });

  it('is the same bytes every time', () => {
    expect(puzzleStl(puzzleOf(fish, 12))).toEqual(puzzleStl(puzzleOf(fish, 12)));
    expect(puzzleStl(puzzleOf(fish, 12, 2))).not.toEqual(puzzleStl(puzzleOf(fish, 12, 1)));
  });
});

describe('golden file', () => {
  // If this fails after you changed the cutting or export code on purpose, check the new puzzle
  // looks right, then replace the two numbers below with the ones in the failure message.
  const GOLDEN = {
    sha256: 'a485b53af2707de2ab509d18cbc9e63e07c971958264e52fdf8cdadc7afe8f31',
    bytes: 349884,
  };

  it('fish, 12 pieces, seed 1 gives the same STL as when it was last checked', () => {
    const stl = puzzleStl(puzzleOf(fish, 12, 1));
    const sha256 = createHash('sha256').update(stl).digest('hex');
    expect({ sha256, bytes: stl.length }).toEqual(GOLDEN);
  });
});

describe('print report', () => {
  const puzzle = puzzleOf(fish, 12);
  const report = printReport(puzzle);

  it('counts three prints: plastic and time for one, and in all', () => {
    expect(report.sets).toBe(3);
    expect(report.totalGramsAtMost).toBeCloseTo(report.gramsAtMost * 3, 9);
    expect(report.totalMinutes).toBe(report.minutes * 3);
    expect(printReport(puzzle, undefined, 1).totalMinutes).toBe(report.minutes);
  });

  it('adds up size, volume, filament and layers', () => {
    expect(report.pieceCount).toBe(12);
    expect(report.layers).toBe(15);
    expect(report.widthMm).toBeGreaterThan(160);
    expect(report.widthMm).toBeLessThanOrEqual(170);
    expect(report.volumeMm3).toBeCloseTo(report.areaMm2 * 3, 6);
    expect(report.gramsAtMost).toBeCloseTo((report.volumeMm3 / 1000) * 1.24, 6);
  });

  it('estimates a plausible time in whole five-minute steps, longer for bigger puzzles', () => {
    expect(report.minutes % 5).toBe(0);
    expect(report.minutes).toBeGreaterThan(20);
    expect(report.minutes).toBeLessThan(180);
    const small = printReport(puzzleOf(fitToPlate([...FISH_OUTLINE], 90).points, 6));
    expect(small.minutes).toBeLessThan(report.minutes);
  });

  it('writes durations in words', () => {
    expect(formatDuration(45)).toBe('about 45 min');
    expect(formatDuration(60)).toBe('about 1 h');
    expect(formatDuration(95)).toBe('about 1 h 35 min');
  });
});

describe('safeName', () => {
  it('keeps file names simple', () => {
    expect(safeName(['Hane Puzzle', 'Yellow', 12, 'pieces'])).toBe('hane-puzzle-yellow-12-pieces');
    expect(safeName(['  Team / One?? '])).toBe('team-one');
  });
});

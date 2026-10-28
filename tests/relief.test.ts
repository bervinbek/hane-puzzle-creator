import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { piecesZip, puzzleMeshes, puzzleStl } from '../src/core/export/bundle';
import { offset, totalArea } from '../src/core/geometry/clip';
import type { Vec2 } from '../src/core/geometry/polygon';
import { fitToPlate, signedArea } from '../src/core/geometry/polyline';
import { checkMesh, extrudePolygon, type Relief } from '../src/core/mesh/extrude';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import {
  DEFAULT_TEACHER,
  RELIEF_AMOUNTS,
  isDefaultTeacher,
  reliefFor,
  sanitiseTeacher,
} from '../src/core/puzzle/settings';
import { toleranceStl } from '../src/core/puzzle/coupon';
import { FISH_OUTLINE } from '../src/core/samples/fish';

const SMALL: Relief = { inset: 0.2, height: 0.2 };
const MEDIUM: Relief = { inset: 0.3, height: 0.2 };

const rect: Vec2[] = [
  [-20, -10],
  [20, -10],
  [20, 10],
  [-20, 10],
];

/** Lowest and highest corners of a mesh, to compare floor and roof. */
const levels = (
  positions: Float32Array,
  z: number,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2]! - z) < 1e-6) {
      xs.push(positions[i]!);
      ys.push(positions[i + 1]!);
    }
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

describe('a piece with first-layer relief', () => {
  for (const [name, relief] of [
    ['small', SMALL],
    ['medium', MEDIUM],
  ] as const) {
    it(`is still one closed solid (${name})`, () => {
      const mesh = extrudePolygon(rect, 3, relief);
      const check = checkMesh(mesh);
      expect(check.watertight).toBe(true);
      expect(check.volume).toBeGreaterThan(0);
    });

    it(`is pulled in at the floor and full size from one layer up (${name})`, () => {
      const mesh = extrudePolygon(rect, 3, relief);
      const floor = levels(mesh.positions, 0);
      expect(floor.minX).toBeCloseTo(-20 + relief.inset, 2);
      expect(floor.maxX).toBeCloseTo(20 - relief.inset, 2);
      expect(floor.minY).toBeCloseTo(-10 + relief.inset, 2);
      expect(floor.maxY).toBeCloseTo(10 - relief.inset, 2);
      for (const z of [relief.height, 3]) {
        const level = levels(mesh.positions, z);
        expect(level.minX).toBeCloseTo(-20, 3);
        expect(level.maxX).toBeCloseTo(20, 3);
        expect(level.minY).toBeCloseTo(-10, 3);
        expect(level.maxY).toBeCloseTo(10, 3);
      }
    });

    it(`has the volume of the plain piece less the thin ledge (${name})`, () => {
      const plain = checkMesh(extrudePolygon(rect, 3)).volume;
      const stepped = checkMesh(extrudePolygon(rect, 3, relief)).volume;
      const ledge = (signedArea(rect) - totalArea(offset([rect], -relief.inset))) * relief.height;
      expect(plain - stepped).toBeCloseTo(ledge, 2);
      expect(ledge).toBeGreaterThan(0);
    });
  }

  it('gives the same file as before when there is no relief', () => {
    const a = extrudePolygon(rect, 3);
    const b = extrudePolygon(rect, 3, undefined);
    expect([...a.positions]).toEqual([...b.positions]);
    expect([...a.indices]).toEqual([...b.indices]);
  });

  it('is left plain when it is too thin to pull in, rather than broken', () => {
    const strip: Vec2[] = [
      [-20, -0.25],
      [20, -0.25],
      [20, 0.25],
      [-20, 0.25],
    ];
    const mesh = extrudePolygon(strip, 3, MEDIUM);
    expect(checkMesh(mesh).watertight).toBe(true);
    expect([...mesh.indices]).toEqual([...extrudePolygon(strip, 3).indices]);
  });

  it('works for every piece of real puzzles, tabs and all', () => {
    const outline = fitToPlate([...FISH_OUTLINE], 170).points;
    for (const count of [6, 12, 24]) {
      const puzzle = generatePuzzle(outline, { ...DEFAULT_PUZZLE, count, seed: 2 });
      for (const relief of [SMALL, MEDIUM]) {
        let pulledIn = 0;
        puzzleMeshes(puzzle, 3, relief).forEach((mesh, i) => {
          const check = checkMesh(mesh);
          expect(check.watertight, `${count} pieces, piece ${i}`).toBe(true);
          const plain = checkMesh(extrudePolygon(puzzle.pieces[i]!.polygon, 3)).volume;
          expect(check.volume).toBeLessThan(plain);
          expect(check.volume).toBeGreaterThan(plain * 0.9);
          pulledIn++;
        });
        expect(pulledIn).toBe(puzzle.pieces.length);
      }
    }
  });
});

describe('relief in the files', () => {
  const outline = fitToPlate([...FISH_OUTLINE], 170).points;
  const puzzle = generatePuzzle(outline, { ...DEFAULT_PUZZLE, count: 12, seed: 1 });
  const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

  it('changes the STL, is the same every time, and off gives the same bytes as always', () => {
    const off = hash(puzzleStl(puzzle));
    expect(hash(puzzleStl(puzzle, undefined, undefined))).toBe(off);
    const small = hash(puzzleStl(puzzle, undefined, SMALL));
    expect(small).not.toBe(off);
    expect(hash(puzzleStl(puzzle, undefined, SMALL))).toBe(small);
    expect(hash(puzzleStl(puzzle, undefined, MEDIUM))).not.toBe(small);
  });

  it('reaches the zip of single pieces and the gap test', () => {
    expect(
      Buffer.from(piecesZip(puzzle, 'a', undefined, SMALL)).equals(
        Buffer.from(piecesZip(puzzle, 'a')),
      ),
    ).toBe(false);
    expect(Buffer.from(toleranceStl(undefined, SMALL)).equals(Buffer.from(toleranceStl()))).toBe(
      false,
    );
  });
});

describe('the relief setting', () => {
  it('is off by default, and each amount gives a one-layer step', () => {
    expect(DEFAULT_TEACHER.relief).toBe('off');
    expect(isDefaultTeacher(DEFAULT_TEACHER)).toBe(true);
    expect(reliefFor(DEFAULT_TEACHER)).toBeUndefined();
    expect(reliefFor({ ...DEFAULT_TEACHER, relief: 'small' })).toEqual({ inset: 0.2, height: 0.2 });
    expect(reliefFor({ ...DEFAULT_TEACHER, relief: 'medium' })).toEqual({
      inset: 0.3,
      height: 0.2,
    });
    expect([...RELIEF_AMOUNTS]).toEqual(['off', 'small', 'medium']);
  });

  it('falls back to off for anything that is not an amount', () => {
    expect(sanitiseTeacher({ relief: 'huge' }).relief).toBe('off');
    expect(sanitiseTeacher({ relief: 3 }).relief).toBe('off');
    expect(sanitiseTeacher({ relief: 'medium' }).relief).toBe('medium');
    expect(sanitiseTeacher({}).relief).toBe('off');
  });
});

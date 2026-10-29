import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { puzzleStl } from '../src/core/export/bundle';
import type { Poly } from '../src/core/geometry/clip';
import { isSimple, type Vec2 } from '../src/core/geometry/polygon';
import { fitToPlate, signedArea } from '../src/core/geometry/polyline';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import {
  CLEARANCE_MM,
  DEFAULT_TEACHER,
  MAGNET_FIT_MM,
  SIZE_MM,
  TAB_AMOUNTS,
  isDefaultTeacher,
  sanitiseTeacher,
  scaleToMax,
  teacherParams,
  type TabAmount,
  type TeacherSettings,
} from '../src/core/puzzle/settings';
import { FISH_OUTLINE } from '../src/core/samples/fish';
import { circleAt, spiderAt } from './fixtures/synth';

const toMm = (poly: Vec2[], size = DEFAULT_PUZZLE.plateSize): Poly => fitToPlate(poly, size).points;

const SHAPES: Record<string, () => Poly> = {
  fish: () => toMm([...FISH_OUTLINE]),
  'thin legs': () => toMm(spiderAt(225, 169, 55)),
  ellipse: () => toMm(circleAt(0, 0, 100).map(([x, y]) => [x * 1.8, y] as Vec2)),
};

const make = (outline: Poly, count: number, seed: number, t: TeacherSettings) =>
  generatePuzzle(outline, { ...DEFAULT_PUZZLE, count, seed, ...teacherParams(t) });

describe('teacher settings: defaults', () => {
  it('standard settings are exactly what everyone else gets', () => {
    expect(isDefaultTeacher(DEFAULT_TEACHER)).toBe(true);
    const fish = SHAPES.fish!();
    const plain = generatePuzzle(fish, { ...DEFAULT_PUZZLE, count: 12, seed: 4 });
    const standard = make(fish, 12, 4, DEFAULT_TEACHER);
    const hash = (p: typeof plain): string =>
      createHash('sha256').update(puzzleStl(p)).digest('hex');
    expect(hash(standard)).toBe(hash(plain));
  });

  it('changing any one setting is noticed', () => {
    expect(isDefaultTeacher({ ...DEFAULT_TEACHER, clearance: 0.35 })).toBe(false);
    expect(isDefaultTeacher({ ...DEFAULT_TEACHER, tabAmount: 'more' })).toBe(false);
    expect(isDefaultTeacher({ ...DEFAULT_TEACHER, maxSizeMm: 120 })).toBe(false);
    expect(isDefaultTeacher({ ...DEFAULT_TEACHER, relief: 'small' })).toBe(false);
  });
});

describe('sanitiseTeacher', () => {
  it('falls back to the defaults for anything that is not a setting', () => {
    for (const junk of [undefined, null, 'x', 5, [], {}, { clearance: 'wide', tabAmount: 7 }]) {
      expect(sanitiseTeacher(junk)).toEqual(DEFAULT_TEACHER);
    }
    expect(sanitiseTeacher({ clearance: NaN, maxSizeMm: Infinity })).toEqual(DEFAULT_TEACHER);
  });

  it('clamps numbers into range and snaps them to the slider steps', () => {
    expect(sanitiseTeacher({ clearance: 9 }).clearance).toBe(CLEARANCE_MM.max);
    expect(sanitiseTeacher({ clearance: -1 }).clearance).toBe(CLEARANCE_MM.min);
    expect(sanitiseTeacher({ clearance: 0.32 }).clearance).toBe(0.3);
    expect(sanitiseTeacher({ clearance: 0.1 + 0.1 }).clearance).toBe(0.2);
    expect(sanitiseTeacher({ maxSizeMm: 5000 }).maxSizeMm).toBe(SIZE_MM.max);
    expect(sanitiseTeacher({ maxSizeMm: 3 }).maxSizeMm).toBe(SIZE_MM.min);
    expect(sanitiseTeacher({ maxSizeMm: 122 }).maxSizeMm).toBe(120);
  });

  it('keeps good settings as they are', () => {
    const good: TeacherSettings = {
      clearance: 0.45,
      tabAmount: 'fewer',
      maxSizeMm: 100,
      relief: 'medium',
      magnetFit: 0.35,
    };
    expect(sanitiseTeacher(good)).toEqual(good);
  });
});

describe('scaleToMax', () => {
  it('scales a big outline down, never a small one up', () => {
    const square: Vec2[] = [
      [-50, -25],
      [50, -25],
      [50, 25],
      [-50, 25],
    ];
    const smaller = scaleToMax(square, 100, 60);
    expect(smaller.factor).toBeCloseTo(0.6, 9);
    expect(smaller.points[1]).toEqual([30, -15]);
    expect(scaleToMax(square, 100, 170)).toEqual({ points: square, factor: 1 });
    expect(scaleToMax(square, 100, 100).factor).toBe(1);
  });
});

describe('tab amounts', () => {
  it('give fewer tabs, the standard number, or more tabs', () => {
    const fish = SHAPES.fish!();
    const tabs = (a: TabAmount): number =>
      make(fish, 12, 1, { ...DEFAULT_TEACHER, tabAmount: a }).tabCount;
    expect(tabs('fewer')).toBeLessThan(tabs('standard'));
    expect(tabs('more')).toBeGreaterThan(tabs('standard'));
  });
});

describe('magnet fit', () => {
  it('is kept in range and on its step', () => {
    expect(sanitiseTeacher({ magnetFit: 5 }).magnetFit).toBe(MAGNET_FIT_MM.max);
    expect(sanitiseTeacher({ magnetFit: -1 }).magnetFit).toBe(MAGNET_FIT_MM.min);
    expect(sanitiseTeacher({ magnetFit: 'wide' }).magnetFit).toBe(DEFAULT_TEACHER.magnetFit);
    expect(sanitiseTeacher({ magnetFit: 0.27 }).magnetFit).toBe(0.25);
  });

  it('reaches the pocket: a looser fit makes a wider pocket', () => {
    const tight = teacherParams({ ...DEFAULT_TEACHER, magnetFit: 0.1 }).magnet!;
    const loose = teacherParams({ ...DEFAULT_TEACHER, magnetFit: 0.4 }).magnet!;
    expect(loose.fit).toBeGreaterThan(tight.fit);
    expect(isDefaultTeacher({ ...DEFAULT_TEACHER, magnetFit: 0.4 })).toBe(false);
  });
});

describe('every setting still gives a valid puzzle', () => {
  const settings: TeacherSettings[] = [];
  for (const tabAmount of TAB_AMOUNTS) {
    for (const clearance of [CLEARANCE_MM.min, 0.3, CLEARANCE_MM.max]) {
      settings.push({
        clearance,
        tabAmount,
        maxSizeMm: SIZE_MM.max,
        relief: 'off',
        magnetFit: 0.2,
      });
    }
  }

  for (const [name, shape] of Object.entries(SHAPES)) {
    for (const t of settings) {
      for (const count of [3, 12, 32]) {
        it(`${name}, ${count} pieces, ${t.tabAmount} tabs, gap ${t.clearance}`, () => {
          const puzzle = make(shape(), count, 2, t);
          const errors = puzzle.issues.filter((i) => i.severity === 'error');
          expect(errors, errors.map((e) => e.message).join('; ')).toEqual([]);
          for (const piece of puzzle.pieces) {
            expect(signedArea(piece.polygon)).toBeGreaterThan(0);
            expect(isSimple(piece.polygon)).toBe(true);
          }
        });
      }
    }
  }

  for (const maxSizeMm of [SIZE_MM.min, 100, 140]) {
    for (const [name, shape] of Object.entries(SHAPES)) {
      it(`${name} scaled down to ${maxSizeMm} mm stays valid, at that size`, () => {
        const outline = shape();
        const wide = Math.max(...outline.map(([x]) => x)) - Math.min(...outline.map(([x]) => x));
        const tall =
          Math.max(...outline.map(([, y]) => y)) - Math.min(...outline.map(([, y]) => y));
        const small = scaleToMax(outline, Math.max(wide, tall), maxSizeMm).points as Poly;
        const puzzle = make(small, 8, 1, { ...DEFAULT_TEACHER, maxSizeMm });
        expect(puzzle.issues.filter((i) => i.severity === 'error')).toEqual([]);
        const xs = puzzle.pieces.flatMap((p) => p.polygon.map(([x]) => x));
        const ys = puzzle.pieces.flatMap((p) => p.polygon.map(([, y]) => y));
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(maxSizeMm + 0.01);
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(maxSizeMm + 0.01);
      });
    }
  }
});

describe('settings change the STL, and only when they are changed', () => {
  it('a wider gap gives a different file; the same settings give the same file', () => {
    const fish = SHAPES.fish!();
    const bytes = (t: TeacherSettings): Buffer => Buffer.from(puzzleStl(make(fish, 8, 3, t)));
    const standard = bytes(DEFAULT_TEACHER);
    expect(bytes({ ...DEFAULT_TEACHER }).equals(standard)).toBe(true);
    expect(bytes({ ...DEFAULT_TEACHER, clearance: 0.5 }).equals(standard)).toBe(false);
    expect(bytes({ ...DEFAULT_TEACHER, tabAmount: 'more' }).equals(standard)).toBe(false);
  });
});

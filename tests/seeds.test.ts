import { describe, expect, it } from 'vitest';
import { fitToPlate, signedArea } from '../src/core/geometry/polyline';
import type { Vec2 } from '../src/core/geometry/polygon';
import { pointInPolygon } from '../src/core/geometry/polygon';
import {
  parseProject,
  puzzleForProject,
  serializeProject,
  type Project,
} from '../src/core/project';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import { DEFAULT_TEACHER } from '../src/core/puzzle/settings';
import { puzzleStl } from '../src/core/export/bundle';
import { mulberry32 } from '../src/core/rng';
import { FISH_OUTLINE } from '../src/core/samples/fish';

const fish = fitToPlate([...FISH_OUTLINE], 170).points;
const box: Vec2[] = [
  [-50, -30],
  [50, -30],
  [50, 30],
  [-50, 30],
];
const area = (p: { polygon: Vec2[] }): number => signedArea(p.polygon);

describe('cut points given to the cutter', () => {
  it('are used as they are: one piece for each, and they come back in the result', () => {
    const seeds: Vec2[] = [
      [-25, 0],
      [25, 0],
    ];
    const puzzle = generatePuzzle(box, { ...DEFAULT_PUZZLE, count: 99, seed: 1, seeds });
    expect(puzzle.seeds).toEqual(seeds);
    expect(puzzle.pieces).toHaveLength(2);
    expect(puzzle.requested).toBe(2);
    // Automatic placement also reports the points it chose.
    const auto = generatePuzzle(fish, { ...DEFAULT_PUZZLE, count: 8, seed: 2 });
    expect(auto.seeds).toHaveLength(8);
    for (const [x, y] of auto.seeds) expect(pointInPolygon(x, y, fish)).toBe(true);
  });

  it('move the cut when they move: a point pushed right makes the left piece bigger', () => {
    const cutArea = (rightX: number): number => {
      const p = generatePuzzle(box, {
        ...DEFAULT_PUZZLE,
        count: 2,
        seed: 1,
        seeds: [
          [-25, 0],
          [rightX, 0],
        ],
      });
      return Math.max(...p.pieces.map(area));
    };
    // The cut sits halfway between the two points, so it moves 15 mm when one point moves 30.
    const middle = generatePuzzle(box, {
      ...DEFAULT_PUZZLE,
      count: 2,
      seed: 1,
      seeds: [
        [-25, 0],
        [25, 0],
      ],
    });
    const left = (p: typeof middle): number =>
      area(p.pieces.find((q) => Math.min(...q.polygon.map(([x]) => x)) < -49)!);
    const moved = generatePuzzle(box, {
      ...DEFAULT_PUZZLE,
      count: 2,
      seed: 1,
      seeds: [
        [-25, 0],
        [55, 0],
      ],
    });
    expect(left(moved) - left(middle)).toBeGreaterThan(15 * 60 * 0.9);
    expect(left(moved) - left(middle)).toBeLessThan(15 * 60 * 1.1);
    expect(cutArea(25)).toBeGreaterThan(0);
  });

  it('keep the puzzle valid wherever they are put inside the shape', () => {
    const rng = mulberry32(7);
    const inside = (): Vec2 => {
      for (;;) {
        const p: Vec2 = [(rng() - 0.5) * 170, (rng() - 0.5) * 90];
        if (pointInPolygon(p[0], p[1], fish)) return p;
      }
    };
    for (let trial = 0; trial < 25; trial++) {
      const count = 3 + (trial % 8) * 3;
      const seeds = Array.from({ length: count }, inside);
      const puzzle = generatePuzzle(fish, { ...DEFAULT_PUZZLE, count, seed: 1, seeds });
      const errors = puzzle.issues.filter((i) => i.severity === 'error');
      expect(errors, `trial ${trial}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
      expect(puzzle.pieces.length).toBeGreaterThanOrEqual(1);
      for (const piece of puzzle.pieces) expect(area(piece)).toBeGreaterThan(0);
    }
  });
});

describe('projects with cut points', () => {
  const seeds: Vec2[] = [
    [-50, 0],
    [0, 10],
    [50, -5],
    [30, 20],
  ];
  const project: Project = {
    outline: fish,
    pieces: 4,
    seed: 3,
    team: 'tan',
    settings: DEFAULT_TEACHER,
    seeds,
  };

  it('are saved, opened, and give the same STL', () => {
    const opened = parseProject(serializeProject(project));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.project.seeds).toEqual(seeds);
    const a = puzzleStl(puzzleForProject(project));
    const b = puzzleStl(puzzleForProject(opened.project));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(puzzleForProject(project).seeds).toEqual(seeds);
  });

  it('are scaled with the drawing when the size is capped', () => {
    const small = puzzleForProject({ ...project, settings: { ...DEFAULT_TEACHER, maxSizeMm: 85 } });
    const factor = 85 / 170;
    small.seeds.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(seeds[i]![0] * factor, 6);
      expect(y).toBeCloseTo(seeds[i]![1] * factor, 6);
    });
  });

  it('are refused when there is not one for every piece, or one is wild', () => {
    const edited = (change: (d: Record<string, unknown>) => void): string => {
      const d = JSON.parse(serializeProject(project)) as Record<string, unknown>;
      change(d);
      return JSON.stringify(d);
    };
    expect(parseProject(edited((d) => (d.seeds = []))).ok).toBe(false);
    expect(parseProject(edited((d) => (d.seeds = [[0, 0]]))).ok).toBe(false);
    expect(parseProject(edited((d) => (d.seeds = 'here'))).ok).toBe(false);
    expect(
      parseProject(
        edited(
          (d) =>
            (d.seeds = [
              [0, 0],
              [1, 1],
              [2, 2],
              [9999, 0],
            ]),
        ),
      ).ok,
    ).toBe(false);
    expect(
      parseProject(
        edited(
          (d) =>
            (d.seeds = [
              [0, 0],
              [1, 1],
              [2, 2],
              ['a', 0],
            ]),
        ),
      ).ok,
    ).toBe(false);
  });

  it('are left out of the file when the cuts are automatic', () => {
    const automatic: Project = { ...project };
    delete automatic.seeds;
    expect(JSON.parse(serializeProject(automatic))).not.toHaveProperty('seeds');
  });
});

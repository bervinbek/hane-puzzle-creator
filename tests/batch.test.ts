import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_BATCH, batchNames, batchZip } from '../src/core/export/batch';
import { puzzleStl } from '../src/core/export/bundle';
import { fitToPlate } from '../src/core/geometry/polyline';
import {
  parseProject,
  puzzleForProject,
  serializeProject,
  type Project,
} from '../src/core/project';
import { DEFAULT_TEACHER } from '../src/core/puzzle/settings';
import { FISH_EYE, FISH_OUTLINE } from '../src/core/samples/fish';

const fit = fitToPlate([...FISH_OUTLINE], 170);
const project = (over: Partial<Project> = {}): Project => ({
  outline: fit.points,
  eye: fit.toMm(FISH_EYE),
  pieces: 6,
  seed: 1,
  name: 'fish',
  settings: DEFAULT_TEACHER,
  ...over,
});

describe('puzzleForProject', () => {
  it('makes the puzzle the Print step makes, and a smaller one when the size is capped', () => {
    const big = puzzleForProject(project());
    const small = puzzleForProject(project({ settings: { ...DEFAULT_TEACHER, maxSizeMm: 100 } }));
    const width = (p: typeof big): number => {
      const xs = p.pieces.flatMap((q) => q.polygon.map(([x]) => x));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(big)).toBeGreaterThan(150);
    expect(width(small)).toBeLessThanOrEqual(100.01);
    expect(width(small)).toBeGreaterThan(95);
  });
});

describe('batchNames', () => {
  it('names a puzzle by its animal and pieces, and numbers repeats', () => {
    const projects = [project(), project({ name: 'dog', pieces: 12 }), project()];
    expect(batchNames(projects, 'hane-puzzle')).toEqual([
      'hane-puzzle-fish-6-pieces',
      'hane-puzzle-dog-12-pieces',
      'hane-puzzle-fish-6-pieces-2',
    ]);
    expect(batchNames(projects, 'Class 5B')).toContain('class-5b-dog-12-pieces');
  });
});

describe('batchZip', () => {
  const projects = [project(), project({ name: 'dog', pieces: 8, seed: 3 }), project()];
  const result = batchZip(projects);
  const files = unzipSync(result.bytes);

  it('holds a puzzle file and a project file for every puzzle, and a readme', () => {
    expect(result.skipped).toEqual([]);
    expect(Object.keys(files).sort()).toEqual(
      [
        'README.txt',
        'hane-puzzle-dog-8-pieces.stl',
        'hane-puzzle-fish-6-pieces-2.stl',
        'hane-puzzle-fish-6-pieces.stl',
        'projects/hane-puzzle-dog-8-pieces.json',
        'projects/hane-puzzle-fish-6-pieces-2.json',
        'projects/hane-puzzle-fish-6-pieces.json',
      ].sort(),
    );
    expect(result.included).toEqual([
      'hane-puzzle-fish-6-pieces',
      'hane-puzzle-dog-8-pieces',
      'hane-puzzle-fish-6-pieces-2',
    ]);
  });

  it('gives each puzzle the same file it would have downloaded on its own', () => {
    expect(
      Buffer.from(files['hane-puzzle-dog-8-pieces.stl']!).equals(
        Buffer.from(puzzleStl(puzzleForProject(projects[1]!))),
      ),
    ).toBe(true);
  });

  it('keeps projects that can be opened again', () => {
    const text = new TextDecoder().decode(files['projects/hane-puzzle-dog-8-pieces.json']!);
    const opened = parseProject(text);
    expect(opened.ok && opened.project.name).toBe('dog');
    expect(text).toBe(serializeProject(projects[1]!));
  });

  it('is the same zip every time', () => {
    expect(Buffer.from(batchZip(projects).bytes).equals(Buffer.from(result.bytes))).toBe(true);
  });

  it('leaves out a puzzle that cannot be made, and says which and why', () => {
    // A bow-tie has no inside, and a straight line has no area: neither can be printed.
    const bowtie = project({
      name: 'bowtie',
      outline: [
        [0, 0],
        [100, 100],
        [100, 0],
        [0, 100],
      ],
      pieces: 4,
    });
    const line = project({
      name: 'line',
      outline: [
        [0, 0],
        [50, 0],
        [100, 0],
      ],
      pieces: 4,
    });
    const out = batchZip([project(), bowtie, line]);
    const names = Object.keys(unzipSync(out.bytes));
    expect(out.included).toEqual(['hane-puzzle-fish-6-pieces']);
    expect(out.skipped.map((s) => s.name)).toEqual([
      'hane-puzzle-bowtie-4-pieces',
      'hane-puzzle-line-4-pieces',
    ]);
    for (const s of out.skipped) expect(s.reason.length).toBeGreaterThan(5);
    expect(names.some((n) => n.includes('bowtie'))).toBe(false);
  });
  it('has a limit that fits a class', () => {
    expect(MAX_BATCH).toBeGreaterThanOrEqual(10);
  });
});

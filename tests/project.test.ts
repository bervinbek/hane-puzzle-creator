import { describe, expect, it } from 'vitest';
import { puzzleStl } from '../src/core/export/bundle';
import { fitToPlate } from '../src/core/geometry/polyline';
import {
  MAX_PROJECT_BYTES,
  MAX_NAME,
  PROJECT_APP,
  parseProject,
  projectErrorMessage,
  serializeProject,
  type Project,
} from '../src/core/project';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import { DEFAULT_TEACHER, teacherParams, type TeacherSettings } from '../src/core/puzzle/settings';
import { FISH_EYE, FISH_OUTLINE } from '../src/core/samples/fish';

const fit = fitToPlate([...FISH_OUTLINE], 170);
const project: Project = {
  outline: fit.points,
  eye: fit.toMm(FISH_EYE),
  pieces: 8,
  seed: 3,
  name: 'Fish',
  settings: { clearance: 0.4, tabAmount: 'more', maxSizeMm: 120, relief: 'small' },
};

const stlOf = (p: Project): Uint8Array =>
  puzzleStl(
    generatePuzzle(p.outline, {
      ...DEFAULT_PUZZLE,
      count: p.pieces,
      seed: p.seed,
      ...teacherParams(p.settings),
    }),
  );

/** A project file with one thing changed. */
const edited = (change: (d: Record<string, unknown>) => void): string => {
  const d = JSON.parse(serializeProject(project)) as Record<string, unknown>;
  change(d);
  return JSON.stringify(d);
};

describe('saving and opening a project', () => {
  it('gives back exactly what was saved, and the same STL', () => {
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // JSON cannot hold a negative zero, so it comes back as a plain zero: the same number.
    const plain = (pts: readonly (readonly [number, number])[]) =>
      pts.map(([x, y]) => [x + 0, y + 0]);
    expect(result.project.outline).toEqual(plain(project.outline));
    expect(result.project).toMatchObject({
      pieces: 8,
      seed: 3,
      name: 'Fish',
      settings: project.settings,
    });
    expect(Buffer.from(stlOf(result.project)).equals(Buffer.from(stlOf(project)))).toBe(true);
  });

  it('saves the outline, the cut and the animal name, and nothing that identifies a child or a photo', () => {
    const d = JSON.parse(serializeProject(project)) as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(
      ['app', 'eye', 'outline', 'pieces', 'seed', 'name', 'settings', 'version'].sort(),
    );
    expect(d.app).toBe(PROJECT_APP);
  });

  it('opens a version 1 file: the old team colour is ignored and the name is empty', () => {
    const old = { ...(JSON.parse(serializeProject(project)) as Record<string, unknown>) };
    delete old.name;
    old.version = 1;
    old.team = 'red';
    const result = parseProject(JSON.stringify(old));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.name).toBe('');
      expect(result.project).not.toHaveProperty('team');
    }
  });

  it('keeps a trimmed, capped animal name and drops one that is not text', () => {
    const base = JSON.parse(serializeProject(project)) as Record<string, unknown>;
    const nameOf = (name: unknown): string | undefined => {
      const r = parseProject(JSON.stringify({ ...base, name }));
      return r.ok ? r.project.name : undefined;
    };
    expect(nameOf('  Fish  ')).toBe('Fish');
    expect(nameOf('x'.repeat(100))).toHaveLength(MAX_NAME);
    expect(nameOf(5)).toBe('');
  });

  it('works without an eye', () => {
    const plain: Project = { ...project };
    delete plain.eye;
    const result = parseProject(serializeProject(plain));
    expect(result.ok && result.project.eye).toBeFalsy();
    expect(result.ok).toBe(true);
  });

  it('opens a file saved without print settings using the standard ones', () => {
    const result = parseProject(edited((d) => delete d.settings));
    expect(result.ok && result.project.settings).toEqual(DEFAULT_TEACHER);
  });

  it('puts print settings that are out of range back in range', () => {
    const wild = edited((d) => (d.settings = { clearance: 50, tabAmount: 'lots', maxSizeMm: -5 }));
    const result = parseProject(wild);
    const expected: TeacherSettings = {
      clearance: 0.6,
      tabAmount: 'standard',
      maxSizeMm: 60,
      relief: 'off',
    };
    expect(result.ok && result.project.settings).toEqual(expected);
  });

  it('ignores extra fields, so a later version can add to the file', () => {
    expect(parseProject(edited((d) => (d.future = { anything: true }))).ok).toBe(true);
  });
});

describe('files that are not a project', () => {
  const problem = (text: string) => {
    const r = parseProject(text);
    return r.ok ? 'ok' : r.problem;
  };

  it('says what is wrong instead of throwing', () => {
    expect(problem('not json at all')).toBe('not-json');
    expect(problem('')).toBe('not-json');
    expect(problem('[1, 2, 3]')).toBe('not-ours');
    expect(problem('null')).toBe('not-ours');
    expect(problem(edited((d) => (d.app = 'something-else')))).toBe('not-ours');
    expect(problem(edited((d) => (d.version = 99)))).toBe('too-new');
    expect(problem(edited((d) => (d.version = 'one')))).toBe('damaged');
    expect(problem('x'.repeat(MAX_PROJECT_BYTES + 1))).toBe('too-large');
  });

  it('refuses outlines that are broken, empty or bigger than the plate', () => {
    expect(problem(edited((d) => (d.outline = [])))).toBe('damaged');
    expect(
      problem(
        edited(
          (d) =>
            (d.outline = [
              [0, 0],
              [1, 1],
            ]),
        ),
      ),
    ).toBe('damaged');
    expect(
      problem(
        edited(
          (d) =>
            (d.outline = [
              [0, 0],
              [10, 0],
              ['a', 3],
            ]),
        ),
      ),
    ).toBe('damaged');
    expect(
      problem(
        edited(
          (d) =>
            (d.outline = [
              [0, 0],
              [1, 0],
              [0, 1],
            ]),
        ),
      ),
    ).toBe('damaged');
    expect(
      problem(
        edited(
          (d) =>
            (d.outline = [
              [0, 0],
              [400, 0],
              [400, 400],
              [0, 400],
            ]),
        ),
      ),
    ).toBe('too-big');
    expect(problem(edited((d) => (d.outline = 'a fish')))).toBe('damaged');
  });

  it('refuses nonsense numbers and names', () => {
    expect(problem(edited((d) => (d.pieces = 0)))).toBe('damaged');
    expect(problem(edited((d) => (d.pieces = 7.5)))).toBe('damaged');
    expect(problem(edited((d) => (d.pieces = '8')))).toBe('damaged');
    expect(problem(edited((d) => (d.seed = -1)))).toBe('damaged');
    expect(problem(edited((d) => (d.seed = Number.MAX_SAFE_INTEGER)))).toBe('damaged');
    expect(problem(edited((d) => (d.eye = [1])))).toBe('damaged');
    expect(problem(edited((d) => (d.settings = 'wide')))).toBe('damaged');
    expect(problem(edited((d) => (d.settings = null)))).toBe('damaged');
  });

  it('has a plain sentence for every problem', () => {
    for (const p of [
      'too-large',
      'not-json',
      'not-ours',
      'too-new',
      'damaged',
      'too-big',
    ] as const) {
      expect(projectErrorMessage(p).length).toBeGreaterThan(20);
    }
  });
});

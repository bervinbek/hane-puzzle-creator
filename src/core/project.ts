import { bounds, type Vec2 } from './geometry/polygon';
import { signedArea } from './geometry/polyline';
import { A1_MINI } from './printer/a1mini';
import { DEFAULT_PUZZLE, generatePuzzle, type Puzzle } from './puzzle/generate';
import {
  sanitiseTeacher,
  scaleToMax,
  teacherParams,
  type TeacherSettings,
} from './puzzle/settings';

/**
 * A saved project: just enough to get the same puzzle back. It holds the cleaned outline (never
 * the photo or drawing it came from: those are of children and stay on the device), the number of
 * pieces, the cut (seed), the animal's name and the print settings. The same project always makes
 * the same STL.
 */
export const PROJECT_APP = 'hane-puzzle-generator';
/** Version 2 dropped the team colour and added the optional animal name. Version 1 still opens. */
export const PROJECT_VERSION = 2;

/** Longest animal name we keep. */
export const MAX_NAME = 30;

/** Largest file we will read (bytes) and the most outline points we will accept. */
export const MAX_PROJECT_BYTES = 2_000_000;
const MAX_POINTS = 20_000;
/** Smaller than this is not a shape (mm squared). */
const MIN_AREA_MM2 = 100;

export interface Project {
  /** Outline in millimetres: centred, y up, counter-clockwise. */
  outline: Vec2[];
  /** Where to draw the sample fish's eye (only the built-in fish has one). */
  eye?: Vec2;
  pieces: number;
  seed: number;
  /** What the student calls their animal, e.g. "Fish". Empty when not given. */
  name: string;
  /** Print gap, tab amount and size cap. Files saved without them open with the standard ones. */
  settings: TeacherSettings;
  /**
   * Cut points the user moved, one for each piece, in the outline's own millimetres (before any
   * size cap). Left out when the cuts are automatic.
   */
  seeds?: Vec2[];
}

export type ProjectProblem =
  'too-large' | 'not-json' | 'not-ours' | 'too-new' | 'damaged' | 'too-big';

export type ProjectResult = { ok: true; project: Project } | { ok: false; problem: ProjectProblem };

/** The sentence shown for each way opening a project can fail. */
export function projectErrorMessage(problem: ProjectProblem): string {
  switch (problem) {
    case 'too-large':
      return 'That file is too big to be a puzzle project.';
    case 'not-json':
    case 'not-ours':
      return 'That file is not a Hane puzzle project. Look for one that ends in .json.';
    case 'too-new':
      return 'That project was saved by a newer version of this page. Reload the page and try again.';
    case 'too-big':
      return 'That project is bigger than the printer plate, so I cannot open it.';
    case 'damaged':
      return 'That project file looks damaged, so I cannot open it.';
  }
}

export function serializeProject(project: Project): string {
  return (
    JSON.stringify({
      app: PROJECT_APP,
      version: PROJECT_VERSION,
      ...(project.name ? { name: project.name } : {}),
      pieces: project.pieces,
      seed: project.seed,
      outline: project.outline,
      settings: project.settings,
      ...(project.seeds ? { seeds: project.seeds } : {}),
      ...(project.eye ? { eye: project.eye } : {}),
    }) + '\n'
  );
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function asPoint(v: unknown): Vec2 | null {
  return Array.isArray(v) && v.length === 2 && isNumber(v[0]) && isNumber(v[1])
    ? [v[0], v[1]]
    : null;
}

/** Reads a project from text. Never throws: it says what is wrong instead. */
export function parseProject(text: string): ProjectResult {
  if (text.length > MAX_PROJECT_BYTES) return { ok: false, problem: 'too-large' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not-json' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, problem: 'not-ours' };
  const d = data as Record<string, unknown>;
  if (d.app !== PROJECT_APP) return { ok: false, problem: 'not-ours' };
  if (!isNumber(d.version) || d.version < 1) return { ok: false, problem: 'damaged' };
  if (d.version > PROJECT_VERSION) return { ok: false, problem: 'too-new' };

  const raw = d.outline;
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_POINTS) {
    return { ok: false, problem: 'damaged' };
  }
  const outline: Vec2[] = [];
  for (const p of raw) {
    const point = asPoint(p);
    if (!point) return { ok: false, problem: 'damaged' };
    outline.push(point);
  }
  const b = bounds(outline);
  if (Math.max(b.maxX - b.minX, b.maxY - b.minY) > A1_MINI.buildVolume.x) {
    return { ok: false, problem: 'too-big' };
  }
  if (Math.abs(signedArea(outline)) < MIN_AREA_MM2) return { ok: false, problem: 'damaged' };

  const { pieces, seed } = d;
  if (!Number.isInteger(pieces) || (pieces as number) < 1 || (pieces as number) > 500) {
    return { ok: false, problem: 'damaged' };
  }
  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 2 ** 31) {
    return { ok: false, problem: 'damaged' };
  }
  if (d.settings !== undefined && (typeof d.settings !== 'object' || d.settings === null)) {
    return { ok: false, problem: 'damaged' };
  }
  let seeds: Vec2[] | undefined;
  if (d.seeds !== undefined) {
    // One cut point for every piece, all inside the plate-sized box the outline lives in.
    if (!Array.isArray(d.seeds) || d.seeds.length !== pieces)
      return { ok: false, problem: 'damaged' };
    seeds = [];
    for (const raw of d.seeds) {
      const point = asPoint(raw);
      if (
        !point ||
        Math.abs(point[0]) > A1_MINI.buildVolume.x ||
        Math.abs(point[1]) > A1_MINI.buildVolume.y
      ) {
        return { ok: false, problem: 'damaged' };
      }
      seeds.push(point);
    }
  }
  const eye = d.eye === undefined ? undefined : asPoint(d.eye);
  if (d.eye !== undefined && !eye) return { ok: false, problem: 'damaged' };

  return {
    ok: true,
    project: {
      outline,
      ...(eye ? { eye } : {}),
      pieces: pieces as number,
      seed: seed as number,
      name: typeof d.name === 'string' ? d.name.trim().slice(0, MAX_NAME) : '',
      settings: sanitiseTeacher(d.settings),
      ...(seeds ? { seeds } : {}),
    },
  };
}

/**
 * The puzzle a project makes, exactly as the Print step makes it: the outline is scaled down to
 * the size limit if it is bigger, then cut with the saved piece count, seed and print settings.
 */
export function puzzleForProject(project: Project): Puzzle {
  const b = bounds(project.outline);
  const longest = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const { points, factor } = scaleToMax(project.outline, longest, project.settings.maxSizeMm);
  return generatePuzzle(points, {
    ...DEFAULT_PUZZLE,
    count: project.pieces,
    seed: project.seed,
    ...teacherParams(project.settings),
    ...(project.seeds
      ? { seeds: project.seeds.map(([x, y]): Vec2 => [x * factor, y * factor]) }
      : {}),
  });
}

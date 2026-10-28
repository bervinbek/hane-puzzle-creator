import { bounds, type Vec2 } from './geometry/polygon';
import { signedArea } from './geometry/polyline';
import { A1_MINI } from './printer/a1mini';
import { sanitiseTeacher, type TeacherSettings } from './puzzle/settings';

/**
 * A saved project: just enough to get the same puzzle back. It holds the cleaned outline (never
 * the photo or drawing it came from: those are of children and stay on the device), the number of
 * pieces, the cut (seed), the team colour and the print settings. The same project always makes
 * the same STL.
 */
export const PROJECT_APP = 'hane-puzzle-generator';
export const PROJECT_VERSION = 1;

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
  /** Team id, e.g. "yellow". Checked by the app, which knows the teams. */
  team: string;
  /** Print gap, tab amount and size cap. Files saved without them open with the standard ones. */
  settings: TeacherSettings;
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
      team: project.team,
      pieces: project.pieces,
      seed: project.seed,
      outline: project.outline,
      settings: project.settings,
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

  const { pieces, seed, team } = d;
  if (!Number.isInteger(pieces) || (pieces as number) < 1 || (pieces as number) > 500) {
    return { ok: false, problem: 'damaged' };
  }
  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 2 ** 31) {
    return { ok: false, problem: 'damaged' };
  }
  if (typeof team !== 'string' || team.length === 0 || team.length > 30) {
    return { ok: false, problem: 'damaged' };
  }
  if (d.settings !== undefined && (typeof d.settings !== 'object' || d.settings === null)) {
    return { ok: false, problem: 'damaged' };
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
      team,
      settings: sanitiseTeacher(d.settings),
    },
  };
}

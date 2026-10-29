import type { Vec2 } from '../core/geometry/polygon';

/** The drawing pad is a fixed square, whatever size it is shown at, so the trace is the same everywhere. */
export const PAD_SIZE = 800;

/** Line width in pad pixels (the pad is 800 wide), so 10 is a line about as thick as a felt pen. */
export const PEN_WIDTH = 10;

/** Points closer together than this (pad pixels) add nothing to a stroke. */
export const MIN_STEP = 1.5;

export interface Stroke {
  width: number;
  points: Vec2[];
}

/** Adds a point to a stroke unless it is too close to the last one. Returns whether it was added. */
export function addPoint(points: Vec2[], p: Vec2, minStep: number = MIN_STEP): boolean {
  const last = points[points.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < minStep) return false;
  points.push(p);
  return true;
}

export interface CurveStep {
  control: Vec2;
  to: Vec2;
}

const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * A smooth line through the points: quadratic curves that end at the middle of each pair, with
 * the points themselves as controls. Hand wobble is rounded off and the curve never leaves the
 * outline of the points. One point gives no steps (the pad draws a dot).
 */
export function smoothStroke(points: readonly Vec2[]): { start: Vec2; steps: CurveStep[] } {
  const n = points.length;
  const start = points[0] ?? [0, 0];
  if (n < 2) return { start, steps: [] };
  const steps: CurveStep[] = [];
  let at: Vec2 = start;
  for (let i = 1; i < n - 1; i++) {
    const to = mid(points[i]!, points[i + 1]!);
    steps.push({ control: points[i]!, to });
    at = to;
  }
  const end = points[n - 1]!;
  steps.push({ control: mid(at, end), to: end });
  return { start, steps };
}

/**
 * The straight line that closes an open drawing, for the picture that goes to the outline finder.
 * Only a single stroke is closed (its last point joined to its first, when they are further apart
 * than the pen is wide): with several strokes it is a guess which ends belong together, and the
 * outline finder bridges those. The strokes themselves, Undo and the picture the student sees are
 * never changed.
 */
export function closingSegments(strokes: readonly Stroke[]): [Vec2, Vec2][] {
  const only = strokes.length === 1 ? strokes[0]! : null;
  if (!only || only.points.length < 3) return [];
  const first = only.points[0]!;
  const last = only.points[only.points.length - 1]!;
  const apart = Math.hypot(first[0] - last[0], first[1] - last[1]);
  return apart > only.width ? [[last, first]] : [];
}

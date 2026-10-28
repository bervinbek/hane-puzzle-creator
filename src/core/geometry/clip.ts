import ClipperLib from 'clipper-lib';
import type { Vec2 } from './polygon';
import { signedArea, simplifyClosed } from './polyline';

/** A simple polygon in millimetres. Outer rings are counter-clockwise. */
export type Poly = Vec2[];

/** Clipper works on integers: one unit is a micrometre. */
const SCALE = 1000;
/** Maximum distance (mm) between a true arc and the straight pieces that approximate it. */
const ARC_TOLERANCE_MM = 0.005;

type IntPath = { X: number; Y: number }[];

const toInt = (poly: readonly Vec2[]): IntPath =>
  poly.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));

const fromInt = (path: IntPath): Poly => path.map((p) => [p.X / SCALE, p.Y / SCALE]);

function boolean(type: number, subject: readonly Poly[], clip: readonly Poly[]): Poly[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject.map(toInt), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clip.map(toInt), ClipperLib.PolyType.ptClip, true);
  const solution = new ClipperLib.Paths();
  c.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return solution.map(fromInt);
}

export const intersect = (a: readonly Poly[], b: readonly Poly[]): Poly[] =>
  boolean(ClipperLib.ClipType.ctIntersection, a, b);
export const union = (a: readonly Poly[], b: readonly Poly[]): Poly[] =>
  boolean(ClipperLib.ClipType.ctUnion, a, b);
export const difference = (a: readonly Poly[], b: readonly Poly[]): Poly[] =>
  boolean(ClipperLib.ClipType.ctDifference, a, b);

/** Grows (delta > 0) or shrinks (delta < 0) polygons by `delta` mm with rounded corners. */
export function offset(polys: readonly Poly[], delta: number): Poly[] {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE_MM * SCALE);
  co.AddPaths(polys.map(toInt), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const solution = new ClipperLib.Paths();
  co.Execute(solution, delta * SCALE);
  return solution.map(fromInt);
}

/** Outer rings only (counter-clockwise), dropping holes and zero-area dust. */
export function outers(polys: readonly Poly[], minArea = 1e-6): Poly[] {
  return polys.filter((p) => signedArea(p) > minArea);
}

/** Total area of the outer rings minus the holes. */
export function totalArea(polys: readonly Poly[]): number {
  return polys.reduce((sum, p) => sum + signedArea(p), 0);
}

/** The biggest outer ring, or null when there is none. */
export function largest(polys: readonly Poly[]): Poly | null {
  let best: Poly | null = null;
  let bestArea = 0;
  for (const p of outers(polys)) {
    const a = signedArea(p);
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  return best;
}

/**
 * Removes the micrometre-scale zigzags that integer rounding leaves at sharp tips, then lets
 * Clipper resolve anything that still touches itself. Returns the biggest resulting ring.
 */
export function clean(poly: Poly, epsMm = 0.01): Poly | null {
  return largest(union([simplifyClosed(poly, epsMm)], []));
}

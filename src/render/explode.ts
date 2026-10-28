import type { Vec2 } from '../core/geometry/polygon';

/** How far a piece travels when fully pulled apart, as a fraction of its distance from the centre. */
export const MAX_SPREAD = 0.5;
/** How high pieces lift (mm) when fully pulled apart, so shadows show the separation. */
export const MAX_LIFT_MM = 8;

export interface Offset {
  x: number;
  y: number;
  z: number;
}

/**
 * Where each piece moves when the puzzle is pulled apart by `amount` (0 = together, 1 = fully
 * apart). Pieces slide away from the middle of the puzzle in the plate's plane and lift a little.
 * Coordinates are the core's: millimetres, z up.
 */
export function explodeOffsets(centres: readonly Vec2[], amount: number): Offset[] {
  const t = Math.min(1, Math.max(0, amount));
  if (centres.length === 0) return [];
  const mx = centres.reduce((s, c) => s + c[0], 0) / centres.length;
  const my = centres.reduce((s, c) => s + c[1], 0) / centres.length;
  return centres.map(([x, y]) => ({
    // `+ 0` turns a negative zero into a plain zero.
    x: (x - mx) * MAX_SPREAD * t + 0,
    y: (y - my) * MAX_SPREAD * t + 0,
    z: MAX_LIFT_MM * t,
  }));
}

/** Camera distance (mm) at which a sphere of `radius` fits a view with the given aspect ratio. */
export function fitDistance(radius: number, verticalFovDeg: number, aspect: number): number {
  const vertical = (verticalFovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return radius / Math.sin(Math.min(vertical, horizontal) / 2);
}

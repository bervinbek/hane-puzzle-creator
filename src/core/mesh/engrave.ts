import type { Vec2 } from '../geometry/polygon';
import { extrudePolygon, type Mesh } from './extrude';

/** Thickness that must stay under a groove so the piece is still a solid slab (mm). */
export const MIN_ENGRAVE_FLOOR_MM = 1.2;

/**
 * Extrudes a simple polygon upward from z = 0 to z = `height`, with shallow grooves cut into the
 * top face, `depth` deep and flat on the floor. Still one closed shell. The rings' nesting says
 * what they are (see `TopCut`); every ring must lie wholly inside the piece and rings must not
 * cross or touch each other or the piece's edge, so the caller keeps them clear of both.
 *
 * Pieces of a puzzle go through `extrudePolygon`, which also takes the magnet pocket and the
 * bottom-edge relief; this is the plain form for a piece with grooves only.
 */
export function extrudeEngraved(
  poly: readonly Vec2[],
  height: number,
  grooves: readonly (readonly Vec2[])[],
  depth: number,
): Mesh {
  if (!(depth > 0) || height - depth < MIN_ENGRAVE_FLOOR_MM) {
    throw new Error('An engraving this deep leaves too little under it');
  }
  return extrudePolygon(poly, height, undefined, undefined, { rings: grooves, depth });
}

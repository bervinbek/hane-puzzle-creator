import { poleOfInaccessibility } from '../geometry/polylabel';
import type { Vec2 } from '../geometry/polygon';
import type { Pocket } from '../mesh/extrude';

/**
 * Each piece has one blind pocket in its top face for a disc magnet, pressed in by hand after
 * printing. The magnet is 6 mm across and 2 mm thick. The pocket is a little bigger so the
 * magnet goes in, and the starting sizes are guesses: they are meant to be tuned on a real print
 * (docs/DECISIONS.md D-039).
 */
export const MAGNET = { diameterMm: 6, thicknessMm: 2 } as const;

export interface MagnetParams {
  /** How much wider than the magnet the pocket is (mm). A Teacher option. */
  fit: number;
  /** How much deeper than the magnet is thick (mm): the magnet sits just under the surface. */
  extraDepth: number;
  /** The thinnest wall left between the pocket and the edge of the piece (mm). */
  minWall: number;
}

export const DEFAULT_MAGNET: MagnetParams = { fit: 0.2, extraDepth: 0.2, minWall: 1.2 };

/** The smallest floor under a pocket that still prints as a solid skin (mm). */
export const MIN_FLOOR_MM = 0.6;

/** A pocket this deep leaves this much plastic under it, for a puzzle of the given thickness. */
export const pocketDepth = (params: MagnetParams): number => MAGNET.thicknessMm + params.extraDepth;

/**
 * Where the magnet pocket goes in a piece: at the point farthest from the edge (so clear of the
 * tabs), as long as a circle of the pocket's size fits there with `minWall` to spare. Otherwise
 * null: the piece is too small to hold a magnet.
 */
export function magnetPocket(polygon: readonly Vec2[], params: MagnetParams): Pocket | null {
  const radius = (MAGNET.diameterMm + params.fit) / 2;
  const pole = poleOfInaccessibility(polygon);
  if (pole.distance < radius + params.minWall) return null;
  return { x: pole.x, y: pole.y, radius, depth: pocketDepth(params) };
}

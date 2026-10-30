import type { Vec2 } from '../geometry/polygon';
import { extrudeEngraved } from '../mesh/engrave';
import { mergeMeshes, type Mesh } from '../mesh/extrude';
import { meshesToStl } from '../mesh/stl';
import { PUZZLE_THICKNESS_MM } from '../printer/a1mini';

/**
 * A test print for engraving a drawing into the top of a piece (M18). Six small slabs side by
 * side, each 3 mm thick like a real piece:
 *
 * - The first five (left to right) have grooves 0.2, 0.4, 0.6, 0.8 and 1.0 mm deep. Each has six
 *   straight grooves, from the widest at the back (2.0 mm) to the narrowest at the front (0.4 mm).
 *   Print it, look at which grooves are really cut and read clearly in your filament, and note the
 *   narrowest and shallowest that still look good.
 * - The sixth is a small face: eyes with a pupil left standing in the ring, a nose, a smile and two
 *   cheek marks, 1.2 mm wide and 0.6 mm deep. It checks that rings, islands and curves print.
 *
 * Every groove stays clear of the slab's edge, as the real pieces will (the groove never reaches a
 * cut, a tab or the magnet pocket).
 */

export const COUPON_DEPTHS: readonly number[] = [0.2, 0.4, 0.6, 0.8, 1.0];
/** Groove widths from the back of the slab to the front (mm). */
export const COUPON_WIDTHS: readonly number[] = [2.0, 1.5, 1.0, 0.8, 0.6, 0.4];

const TILE_WIDTH = 20;
const TILE_HEIGHT = 52;
const FACE_SIZE = 40;
const GAP = 4;
const EDGE = 3;
const PITCH = 8;
const FACE_WIDTH = 1.2;
const FACE_DEPTH = 0.6;

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const circle = (cx: number, cy: number, r: number, steps = 40): Vec2[] =>
  Array.from({ length: steps }, (_, i): Vec2 => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

/** A curved band of constant width: the part of a ring between two angles (radians). */
function arcBand(cx: number, cy: number, radius: number, width: number, a0: number, a1: number) {
  const steps = 24;
  const at = (r: number, t: number): Vec2 => [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  const outer = Array.from({ length: steps + 1 }, (_, i) =>
    at(radius + width / 2, a0 + ((a1 - a0) * i) / steps),
  );
  const inner = Array.from({ length: steps + 1 }, (_, i) =>
    at(radius - width / 2, a1 - ((a1 - a0) * i) / steps),
  );
  return [...outer, ...inner];
}

/** A straight mark of the given length and width, turned by `angle` radians about its middle. */
function mark(cx: number, cy: number, length: number, width: number, angle: number): Vec2[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return rect(-length / 2, -width / 2, length / 2, width / 2).map(([x, y]): Vec2 => [
    cx + x * c - y * s,
    cy + x * s + y * c,
  ]);
}

export interface CouponTile {
  /** The slab, centred on the origin. */
  slab: Vec2[];
  grooves: Vec2[][];
  depth: number;
}

/** The six slabs, each centred on the origin. */
export function engraveCouponTiles(): CouponTile[] {
  const lineTiles = COUPON_DEPTHS.map((depth): CouponTile => {
    const grooves = COUPON_WIDTHS.map((w, k) => {
      const y = ((COUPON_WIDTHS.length - 1) / 2 - k) * PITCH;
      return rect(-TILE_WIDTH / 2 + EDGE, y - w / 2, TILE_WIDTH / 2 - EDGE, y + w / 2);
    });
    return {
      slab: rect(-TILE_WIDTH / 2, -TILE_HEIGHT / 2, TILE_WIDTH / 2, TILE_HEIGHT / 2),
      grooves,
      depth,
    };
  });
  const face: CouponTile = {
    slab: rect(-FACE_SIZE / 2, -FACE_SIZE / 2, FACE_SIZE / 2, FACE_SIZE / 2),
    grooves: [
      // Two eyes: a ring of groove round a pupil of top face left standing.
      circle(-9, 7, 5.5),
      circle(-9, 7, 5.5 - FACE_WIDTH - 0.6),
      circle(9, 7, 5.5),
      circle(9, 7, 5.5 - FACE_WIDTH - 0.6),
      // A nose dot, a smile, and two cheek marks.
      circle(0, 0, 1.4),
      arcBand(0, 6, 12, FACE_WIDTH, (225 * Math.PI) / 180, (315 * Math.PI) / 180),
      mark(-12, -11, 8, FACE_WIDTH, (20 * Math.PI) / 180),
      mark(12, -11, 8, FACE_WIDTH, (-20 * Math.PI) / 180),
    ],
    depth: FACE_DEPTH,
  };
  return [...lineTiles, face];
}

const moved = (poly: readonly Vec2[], dx: number): Vec2[] =>
  poly.map(([x, y]): Vec2 => [x + dx, y]);

/** The six slabs as closed solids, laid in a row on the plate with a gap between them. */
export function engraveCouponMeshes(thicknessMm: number = PUZZLE_THICKNESS_MM): Mesh[] {
  const tiles = engraveCouponTiles();
  const widths = tiles.map((t) => Math.max(...t.slab.map((p) => p[0])) * 2);
  const total = widths.reduce((s, w) => s + w, 0) + GAP * (tiles.length - 1);
  let left = -total / 2;
  return tiles.map((tile, i) => {
    const centre = left + widths[i]! / 2;
    left += widths[i]! + GAP;
    return extrudeEngraved(
      moved(tile.slab, centre),
      thicknessMm,
      tile.grooves.map((g) => moved(g, centre)),
      tile.depth,
    );
  });
}

/** The test print as one binary STL. */
export function engraveCouponStl(): Uint8Array {
  return meshesToStl([mergeMeshes(engraveCouponMeshes())]);
}

import { puzzleStl } from '../export/bundle';
import type { Relief } from '../mesh/extrude';
import type { Poly } from '../geometry/clip';
import type { Vec2 } from '../geometry/polygon';
import { DEFAULT_PUZZLE, generatePuzzle, type Puzzle } from './generate';
import { DEFAULT_MAGNET, type MagnetParams } from './magnets';
import { DEFAULT_TABS, type TabParams } from './tabs';

/**
 * A tolerance test print: three small two-piece puzzles side by side, each cut with the real tab
 * code but with a different gap between its pieces. Print it, see which one goes together by hand
 * and comes apart again without force, and set that gap in the Teacher options. Each coupon says
 * which gap it has by the number of small notches in the edge of its left piece (1, 2 or 3).
 */

/** The gaps tested, in order from the left (mm). */
export const COUPON_GAPS: readonly number[] = [0.2, 0.3, 0.4];

export const COUPON_WIDTH = 40;
export const COUPON_HEIGHT = 26;
/** Space between one coupon and the next (mm). */
const SPACING = 12;
const NOTCH_RADIUS = 1.6;
const NOTCH_PITCH = 4.2;
const NOTCH_FIRST = 6;
const NOTCH_STEPS = 8;

/** A rectangle, with `notches` small half-round bites out of the middle of its bottom edge's left half. */
export function couponOutline(notches: number): Vec2[] {
  const hw = COUPON_WIDTH / 2;
  const hh = COUPON_HEIGHT / 2;
  const points: Vec2[] = [[-hw, -hh]];
  for (let k = 0; k < notches; k++) {
    const cx = -hw + NOTCH_FIRST + k * NOTCH_PITCH;
    points.push([cx - NOTCH_RADIUS, -hh]);
    for (let i = 1; i < NOTCH_STEPS; i++) {
      const t = Math.PI - (i / NOTCH_STEPS) * Math.PI;
      points.push([cx + NOTCH_RADIUS * Math.cos(t), -hh + NOTCH_RADIUS * Math.sin(t)]);
    }
    points.push([cx + NOTCH_RADIUS, -hh]);
  }
  points.push([hw, -hh], [hw, hh], [-hw, hh]);
  return points;
}

export interface Coupon {
  /** The gap between this coupon's pieces (mm). */
  gap: number;
  /** How many notches mark it. */
  notches: number;
  puzzle: Puzzle;
}

const moved = (poly: Poly, dx: number): Poly => poly.map(([x, y]): Vec2 => [x + dx, y]);

/** The three coupons, each its own puzzle centred on the origin, and all of them as one puzzle in print position. */
export function toleranceCoupons(
  tabs: TabParams = DEFAULT_TABS,
  gaps: readonly number[] = COUPON_GAPS,
  magnet: MagnetParams | null = DEFAULT_MAGNET,
): { coupons: Coupon[]; combined: Puzzle } {
  const coupons: Coupon[] = gaps.map((gap, i) => ({
    gap,
    notches: i + 1,
    // Two cut points, left and right of the middle, so the cut runs straight down the middle.
    puzzle: generatePuzzle(couponOutline(i + 1), {
      ...DEFAULT_PUZZLE,
      count: 2,
      seed: 1,
      clearance: gap,
      tabs,
      magnet,
      seeds: [
        [-COUPON_WIDTH / 4, 0],
        [COUPON_WIDTH / 4, 0],
      ],
    }),
  }));

  const pitch = COUPON_WIDTH + SPACING;
  const first = (-(coupons.length - 1) * pitch) / 2;
  const combined: Puzzle = {
    pieces: [],
    requested: 0,
    tabCount: 0,
    seeds: [],
    neighbours: [],
    issues: [],
    ok: true,
    cut: [],
  };
  coupons.forEach(({ puzzle }, c) => {
    const dx = first + c * pitch;
    const base = combined.pieces.length;
    for (const piece of puzzle.pieces) {
      combined.pieces.push({
        ...piece,
        id: base + piece.id,
        polygon: moved(piece.polygon, dx),
        pocket: piece.pocket && { ...piece.pocket, x: piece.pocket.x + dx },
      });
    }
    combined.requested += puzzle.requested;
    combined.tabCount += puzzle.tabCount;
    combined.seeds.push(...puzzle.seeds.map(([x, y]): Vec2 => [x + dx, y]));
    combined.neighbours.push(...puzzle.neighbours.map((list) => list.map((n) => n + base)));
    combined.issues.push(...puzzle.issues);
    combined.cut.push(...puzzle.cut.map((p) => moved(p, dx)));
    combined.ok &&= puzzle.ok;
  });
  return { coupons, combined };
}

/** The test print as one STL: six pieces, 3 mm thick, in place. */
export function toleranceStl(
  tabs: TabParams = DEFAULT_TABS,
  relief?: Relief,
  magnet: MagnetParams | null = DEFAULT_MAGNET,
): Uint8Array {
  return puzzleStl(toleranceCoupons(tabs, COUPON_GAPS, magnet).combined, undefined, relief);
}

/** What to do with the printed coupons, in a few plain sentences. */
export function couponInstructions(gaps: readonly number[] = COUPON_GAPS): string {
  const list = gaps
    .map((g, i) => `${i + 1} notch${i === 0 ? '' : 'es'}: ${g.toFixed(2)} mm`)
    .join(', ');
  return `Print it like any puzzle. Each little puzzle has two pieces, and each piece has a pocket: try a 6 × 2 mm magnet in it too. Count the notches on the left piece (${list}). Lift the pieces apart and put them back together by hand. Pick the smallest gap that goes together without force and comes apart again, then set it in Teacher options.`;
}

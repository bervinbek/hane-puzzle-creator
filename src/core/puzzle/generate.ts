import { clean, intersect, largest, offset, totalArea, type Poly } from '../geometry/clip';
import { bounds, type Vec2 } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';
import { usablePlateSize } from '../printer/a1mini';
import { mulberry32 } from '../rng';
import { cutIntoPieces } from './cells';
import { DEFAULT_MAGNET, magnetPocket, type MagnetParams } from './magnets';
import type { Pocket } from '../mesh/extrude';
import { placeSeeds } from './seeds';
import { DEFAULT_TABS, addTabs, type TabParams } from './tabs';
import { validatePuzzle, type Issue } from './validate';

export interface PuzzleParams {
  /** Number of pieces asked for. The result can have fewer when pieces would be too small. */
  count: number;
  /** Same outline + params + seed always gives the same puzzle. */
  seed: number;
  /** Total gap between neighbouring pieces (mm). 0.3 is a starting point; see Q12. */
  clearance: number;
  /** Smallest piece worth making (mm squared). */
  minPieceArea: number;
  /** Thinnest part that prints reliably (mm). */
  minFeature: number;
  /** Side of the square the puzzle must fit in (mm). */
  plateSize: number;
  tabs: TabParams;
  /** The magnet pocket in every piece, or null for none. */
  magnet: MagnetParams | null;
  /**
   * Where to cut: one point inside the outline for each piece. Leave out for automatic placement.
   * When given, the number of pieces asked for is the number of points.
   */
  seeds?: readonly Vec2[];
}

export const DEFAULT_PUZZLE: Omit<PuzzleParams, 'count' | 'seed'> = {
  clearance: 0.3,
  minPieceArea: 60,
  minFeature: 1.2,
  plateSize: usablePlateSize(),
  tabs: DEFAULT_TABS,
  magnet: DEFAULT_MAGNET,
};

export interface Piece {
  /** Position in `pieces`. */
  id: number;
  /** Counter-clockwise polygon in millimetres, y up, centred like the outline. */
  polygon: Vec2[];
  areaMm2: number;
  /** Where the magnet goes, or null when the piece is too small to hold one. */
  pocket: Pocket | null;
}

export interface Puzzle {
  pieces: Piece[];
  requested: number;
  tabCount: number;
  /** The cut points used: one for each piece asked for, automatic or given. */
  seeds: Vec2[];
  /** neighbours[i] lists the pieces that sit next to piece i. */
  neighbours: number[][];
  issues: Issue[];
  /** True when there is nothing that makes the puzzle unprintable (warnings are fine). */
  ok: boolean;
  /** The pieces before the clearance gap was applied (they tile the outline exactly). */
  cut: Poly[];
}

/**
 * Cuts an outline (millimetres, y up, counter-clockwise) into interlocking pieces ready to print.
 *
 * 1. Grow the outline by half the clearance so the finished silhouette matches the drawing.
 * 2. Place seeds and cut Voronoi cells; merge stray fragments and tiny pieces into neighbours.
 * 3. Add jigsaw tabs along the longer shared edges.
 * 4. Shrink every piece by half the clearance, which opens the gap between neighbours.
 * 5. Check the result.
 */
/** Pieces whose outlines come within a few clearances of each other. */
function findNeighbours(pieces: readonly Poly[], reach: number): number[][] {
  const boxes = pieces.map((p) => bounds(p));
  const grown = pieces.map((p) => offset([p], reach));
  const out: number[][] = pieces.map(() => []);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.maxX + reach < b.minX || b.maxX + reach < a.minX) continue;
      if (a.maxY + reach < b.minY || b.maxY + reach < a.minY) continue;
      if (totalArea(intersect(grown[i]!, [pieces[j]!])) > 0.01) {
        out[i]!.push(j);
        out[j]!.push(i);
      }
    }
  }
  return out;
}

export function generatePuzzle(outline: readonly Vec2[], params: PuzzleParams): Puzzle {
  const half = params.clearance / 2;
  const grown = largest(offset([[...outline]], half)) ?? [...outline];

  const given = params.seeds && params.seeds.length > 0 ? params.seeds : null;
  const requested = given ? given.length : params.count;
  const seeds = given ? [...given] : placeSeeds(grown, params.count, mulberry32(params.seed));
  const cut = cutIntoPieces(grown, seeds, params.minPieceArea);
  const { pieces: tabbed, tabCount } = addTabs(
    cut,
    mulberry32(params.seed ^ 0x9e3779b9),
    params.tabs,
  );

  const finished: Poly[] = [];
  for (const p of tabbed) {
    const inset = largest(offset([p], -half));
    const tidy = inset ? clean(inset) : null;
    if (tidy) finished.push(tidy);
  }

  const issues = validatePuzzle(finished, {
    clearance: params.clearance,
    minFeature: params.minFeature,
    minPieceArea: params.minPieceArea,
    plateSize: params.plateSize,
    requested,
  });

  const pieces: Piece[] = finished.map((polygon, id) => ({
    id,
    polygon,
    areaMm2: signedArea(polygon),
    pocket: params.magnet ? magnetPocket(polygon, params.magnet) : null,
  }));
  if (params.magnet) {
    for (const piece of pieces) {
      if (piece.pocket) continue;
      issues.push({
        kind: 'no-magnet-room',
        severity: 'warning',
        piece: piece.id,
        message: `Piece ${piece.id + 1} is too small for a magnet.`,
      });
    }
  }

  return {
    pieces,
    requested,
    tabCount,
    seeds,
    neighbours: findNeighbours(finished, params.clearance * 2),
    issues,
    ok: !issues.some((i) => i.severity === 'error'),
    cut,
  };
}

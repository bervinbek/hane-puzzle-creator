import { Delaunay } from 'd3-delaunay';
import {
  difference,
  intersect,
  largest,
  offset,
  outers,
  totalArea,
  union,
  type Poly,
} from '../geometry/clip';
import { bounds, type Vec2 } from '../geometry/polygon';
import { signedArea, simplifyClosed } from '../geometry/polyline';

/** Vertices closer than this to the straight line through their neighbours are dropped. */
const SIMPLIFY_MM = 0.01;
/** How far a region is grown when measuring how much border it shares with another. */
const PROBE_MM = 0.05;
/** Overlap added before merging two regions so rounding cannot leave a hairline between them. */
const WELD_MM = 0.02;
/** Pieces of the outline smaller than this are specks from clipping, not real pieces. */
const DUST_MM2 = 0.05;
const MAX_MERGES = 2000;

/** Voronoi cells of the seeds, as polygons, each cut down to the outline. */
function cutCells(outline: Poly, seeds: readonly Vec2[]): Poly[][] {
  const b = bounds(outline);
  const delaunay = Delaunay.from(seeds as Vec2[] as [number, number][]);
  const voronoi = delaunay.voronoi([b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1]);
  return seeds.map((_, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return [];
    const ring: Poly = cell.slice(0, -1).map(([x, y]) => [x, y]);
    if (signedArea(ring) < 0) ring.reverse();
    return outers(intersect([ring], [outline]), DUST_MM2);
  });
}

/** Length of border two regions share, estimated from the area of one grown to touch the other. */
function sharedLength(a: Poly, b: Poly): number {
  const grown = offset([a], PROBE_MM);
  return totalArea(intersect(grown, [b])) / PROBE_MM;
}

function bestNeighbour(region: Poly, pieces: readonly Poly[], skip: number): number {
  let best = -1;
  let bestLength = 0.5;
  pieces.forEach((p, i) => {
    if (i === skip) return;
    const len = sharedLength(region, p);
    if (len > bestLength) {
      bestLength = len;
      best = i;
    }
  });
  return best;
}

/** Joins two touching regions into one polygon (or several, if they only just touch). */
function merge(a: Poly, b: Poly, outline: Poly): Poly[] {
  const welded = union(offset([a], WELD_MM), offset([b], WELD_MM));
  return outers(intersect(offset(welded, -WELD_MM), [outline]), DUST_MM2);
}

/**
 * Cuts the outline into one piece per seed using Voronoi cells.
 * A cell can come out in several disconnected parts on a concave shape (a thin leg or tail), so
 * the extra parts are merged into whichever neighbour they share the longest border with. Pieces
 * smaller than `minArea` are merged the same way, so the result can have fewer pieces than seeds.
 * Every returned piece is a single simple polygon.
 */
export function cutIntoPieces(outline: Poly, seeds: readonly Vec2[], minArea: number): Poly[] {
  const pieces: Poly[] = [];
  const loose: Poly[] = [];
  for (const parts of cutCells(outline, seeds)) {
    const main = largest(parts);
    if (!main) continue;
    pieces.push(main);
    for (const p of parts) if (p !== main) loose.push(p);
  }

  let guard = MAX_MERGES;
  const absorb = (region: Poly, into: number): void => {
    const [first, ...rest] = merge(pieces[into]!, region, outline).sort(
      (x, y) => signedArea(y) - signedArea(x),
    );
    if (first) pieces[into] = first;
    loose.push(...rest);
  };

  while (loose.length > 0 && guard-- > 0) {
    const region = loose.pop()!;
    const into = bestNeighbour(region, pieces, -1);
    if (into >= 0) absorb(region, into);
    // A fragment that touches nothing is dust left by rounding; drop it.
  }

  while (pieces.length > 1 && guard-- > 0) {
    let smallest = -1;
    let smallestArea = minArea;
    pieces.forEach((p, i) => {
      const a = signedArea(p);
      if (a < smallestArea) {
        smallestArea = a;
        smallest = i;
      }
    });
    if (smallest < 0) break;
    const region = pieces[smallest]!;
    const into = bestNeighbour(region, pieces, smallest);
    pieces.splice(smallest, 1);
    if (into < 0) continue;
    absorb(region, into < smallest ? into : into - 1);
    while (loose.length > 0 && guard-- > 0) {
      const frag = loose.pop()!;
      const target = bestNeighbour(frag, pieces, -1);
      if (target >= 0) absorb(frag, target);
    }
  }

  return pieces.map((p) => simplifyClosed(p, SIMPLIFY_MM));
}

/** Area left over when the pieces are taken away from the outline. Zero means a perfect tiling. */
export function uncoveredArea(outline: Poly, pieces: readonly Poly[]): number {
  return totalArea(difference([outline], pieces));
}

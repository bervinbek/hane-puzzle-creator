import { Delaunay } from 'd3-delaunay';
import { bounds, pointInPolygon, type Vec2 } from '../geometry/polygon';
import type { Rng } from '../rng';

const CANDIDATES_PER_SEED = 12;
const SAMPLE_COLUMNS = 70;

/** Random point inside the polygon; gives up after many misses (degenerate outline). */
function randomInside(poly: readonly Vec2[], rng: Rng): Vec2 {
  const b = bounds(poly);
  for (let i = 0; i < 10_000; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    if (pointInPolygon(x, y, poly)) return [x, y];
  }
  throw new Error('Could not place a point inside the outline');
}

/** Evenly spaced grid of sample points inside the polygon, used to estimate cell areas. */
function sampleGrid(poly: readonly Vec2[]): Vec2[] {
  const b = bounds(poly);
  const step = Math.max(b.maxX - b.minX, b.maxY - b.minY) / SAMPLE_COLUMNS;
  const points: Vec2[] = [];
  for (let y = b.minY + step / 2; y < b.maxY; y += step) {
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      if (pointInPolygon(x, y, poly)) points.push([x, y]);
    }
  }
  return points;
}

/**
 * Chooses `count` seed points inside the outline for the Voronoi partition.
 * Best-candidate sampling spreads them out, then Lloyd relaxation evens out cell areas.
 * Deterministic for a given rng seed. See docs/ARCHITECTURE.md section 5.2.
 */
export function placeSeeds(
  outline: readonly Vec2[],
  count: number,
  rng: Rng,
  relaxSteps = 4,
): Vec2[] {
  if (count < 1) return [];

  const seeds: Vec2[] = [randomInside(outline, rng)];
  while (seeds.length < count) {
    let best: Vec2 = randomInside(outline, rng);
    let bestDist = -1;
    for (let c = 0; c < CANDIDATES_PER_SEED; c++) {
      const cand = randomInside(outline, rng);
      let nearest = Infinity;
      for (const s of seeds)
        nearest = Math.min(nearest, (s[0] - cand[0]) ** 2 + (s[1] - cand[1]) ** 2);
      if (nearest > bestDist) {
        bestDist = nearest;
        best = cand;
      }
    }
    seeds.push(best);
  }

  if (count === 1) return seeds;

  const samples = sampleGrid(outline);
  for (let step = 0; step < relaxSteps; step++) {
    const delaunay = Delaunay.from(seeds as Vec2[] as [number, number][]);
    const sumX = new Float64Array(count);
    const sumY = new Float64Array(count);
    const hits = new Uint32Array(count);
    const owner = new Uint32Array(samples.length);
    let last = 0;
    samples.forEach(([x, y], i) => {
      last = delaunay.find(x, y, last);
      owner[i] = last;
      sumX[last]! += x;
      sumY[last]! += y;
      hits[last]!++;
    });
    for (let k = 0; k < count; k++) {
      const n = hits[k]!;
      if (n === 0) continue;
      const mx = sumX[k]! / n;
      const my = sumY[k]! / n;
      if (pointInPolygon(mx, my, outline)) {
        seeds[k] = [mx, my];
        continue;
      }
      // The centroid of a concave cell can fall outside the outline: use the closest owned sample.
      let bestD = Infinity;
      let bestPoint: Vec2 = seeds[k]!;
      samples.forEach((p, i) => {
        if (owner[i] !== k) return;
        const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2;
        if (d < bestD) {
          bestD = d;
          bestPoint = p;
        }
      });
      seeds[k] = bestPoint;
    }
  }
  return seeds;
}

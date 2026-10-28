import { bounds, type Vec2 } from './polygon';

/** Signed area of a closed polygon: positive when counter-clockwise (y up). */
export function signedArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += poly[j]![0] * poly[i]![1] - poly[i]![0] * poly[j]![1];
  }
  return sum / 2;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker on an open run of points (iterative). Returns indices to keep. */
function rdpIndices(pts: readonly Vec2[], eps: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    let worst = -1;
    let worstDist = eps;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(pts[i]!, pts[lo]!, pts[hi]!);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  return pts.map((_, i) => i).filter((i) => keep[i]);
}

/** Simplifies a closed polygon, dropping points closer than `eps` to the simplified shape. */
export function simplifyClosed(poly: readonly Vec2[], eps: number): Vec2[] {
  if (poly.length < 4) return [...poly];
  // Split the ring at the point farthest from the first so both runs are well-behaved.
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i]![0] - poly[0]![0], poly[i]![1] - poly[0]![1]);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const a = poly.slice(0, far + 1);
  const b = [...poly.slice(far), poly[0]!];
  const keepA = rdpIndices(a, eps).map((i) => a[i]!);
  const keepB = rdpIndices(b, eps).map((i) => b[i]!);
  return [...keepA.slice(0, -1), ...keepB.slice(0, -1)];
}

/** Evenly spaced points along a closed polygon (spacing is approximate: the loop is divided evenly). */
export function resampleClosed(poly: readonly Vec2[], spacing: number): Vec2[] {
  const n = poly.length;
  const lengths: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    lengths.push(lengths[i]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[n]!;
  const count = Math.max(8, Math.round(total / spacing));
  const out: Vec2[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (seg < n - 1 && lengths[seg + 1]! < target) seg++;
    const a = poly[seg]!;
    const b = poly[(seg + 1) % n]!;
    const span = lengths[seg + 1]! - lengths[seg]!;
    const t = span === 0 ? 0 : (target - lengths[seg]!) / span;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

export interface Fit {
  /** Outline in millimetres: centred on the origin, y up, counter-clockwise. */
  points: Vec2[];
  /** Millimetres per source unit. */
  scale: number;
  /** Maps a point from the source (pixel, y down) space into the same millimetre space. */
  toMm: (p: Vec2) => Vec2;
}

/**
 * Scales an outline from image pixels (y down) so its longest side is `sizeMm`, centres it on the
 * origin and flips y so it matches the puzzle's coordinates (y up, counter-clockwise).
 */
export function fitToPlate(poly: readonly Vec2[], sizeMm: number): Fit {
  const b = bounds(poly);
  const scale = sizeMm / Math.max(b.maxX - b.minX, b.maxY - b.minY, 1e-9);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const toMm = (p: Vec2): Vec2 => [(p[0] - cx) * scale, -(p[1] - cy) * scale];
  let points = poly.map(toMm);
  if (signedArea(points) < 0) points = points.reverse();
  return { points, scale, toMm };
}

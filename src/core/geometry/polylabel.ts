import type { Vec2 } from './polygon';

/** Distance from a point to a closed polygon: positive inside, negative outside. */
export function signedDistance(x: number, y: number, ring: readonly Vec2[]): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[j]!;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return inside ? best : -best;
}

interface Cell {
  x: number;
  y: number;
  /** Half the cell's side. */
  h: number;
  /** Signed distance from the cell's centre to the polygon's edge. */
  d: number;
  /** The best distance any point in the cell could have. */
  max: number;
}

const cell = (x: number, y: number, h: number, ring: readonly Vec2[]): Cell => {
  const d = signedDistance(x, y, ring);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
};

/**
 * The point inside a polygon that is farthest from its edge (the "pole of inaccessibility"), and
 * how far that is: the radius of the biggest circle that fits. Found by splitting the bounding
 * box into cells and only refining the ones that could still beat the best so far. The same
 * polygon always gives the same answer.
 */
export function poleOfInaccessibility(
  ring: readonly Vec2[],
  precision = 0.05,
): { x: number; y: number; distance: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = Math.min(maxX - minX, maxY - minY);
  if (!(size > 0)) return { x: minX, y: minY, distance: 0 };

  let h = size / 2;
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) queue.push(cell(x + h, y + h, h, ring));
  }
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  let best = cell(sx / ring.length, sy / ring.length, 0, ring);
  for (const c of queue) if (c.d > best.d) best = c;

  while (queue.length > 0) {
    // Take the most promising cell (ties go to the one added first, so the answer is stable).
    let k = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.max > queue[k]!.max) k = i;
    const c = queue.splice(k, 1)[0]!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    queue.push(
      cell(c.x - h, c.y - h, h, ring),
      cell(c.x + h, c.y - h, h, ring),
      cell(c.x - h, c.y + h, h, ring),
      cell(c.x + h, c.y + h, h, ring),
    );
  }
  return { x: best.x, y: best.y, distance: best.d };
}

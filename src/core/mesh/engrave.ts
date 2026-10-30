import { pointInPolygon, type Vec2 } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';
import { fillRegion, withoutRepeats, type Mesh } from './extrude';

/** Thickness that must stay under a groove so the piece is still a solid slab (mm). */
export const MIN_ENGRAVE_FLOOR_MM = 1.2;

/**
 * Extrudes a simple polygon upward from z = 0 to z = `height`, with shallow grooves cut into the
 * top face, `depth` deep and flat on the floor. Still one closed shell: the grooves share vertices
 * with their walls, so every edge is used by exactly two triangles.
 *
 * `grooves` are rings in millimetres, and their nesting says what they are: a ring inside the
 * piece is a groove, a ring inside that is an island of top face left standing in it, a ring
 * inside that is a groove again, and so on. Every ring must lie wholly inside the piece, and rings
 * must not cross or touch each other or the piece's edge; the caller keeps them clear of both.
 */
export function extrudeEngraved(
  poly: readonly Vec2[],
  height: number,
  grooves: readonly (readonly Vec2[])[],
  depth: number,
): Mesh {
  let ring = withoutRepeats(poly);
  if (ring.length < 3) throw new Error('A piece needs at least three corners');
  if (signedArea(ring) < 0) ring = ring.reverse();
  if (!(depth > 0) || height - depth < MIN_ENGRAVE_FLOOR_MM) {
    throw new Error('An engraving this deep leaves too little under it');
  }

  const rings = grooves
    .map((g) => withoutRepeats(g))
    .filter((g) => g.length >= 3 && Math.abs(signedArea(g)) > 1e-6)
    .map((g) => (signedArea(g) < 0 ? g.reverse() : g));

  // Nesting level of every ring, and the ring it sits directly in (-1 for the piece itself).
  const level = rings.map(() => 0);
  const parent = rings.map(() => -1);
  rings.forEach((r, i) => {
    const [px, py] = r[0]!;
    rings.forEach((other, j) => {
      if (i !== j && pointInPolygon(px, py, other)) {
        level[i]!++;
        if (parent[i] === -1 || level[j]! > level[parent[i]!]!) parent[i] = j;
      }
    });
  });

  // Vertices: the piece at the floor and the roof, then each ring at the roof and at the groove floor.
  const n = ring.length;
  let total = 2 * n;
  const start = rings.map((r) => {
    const at = total;
    total += 2 * r.length;
    return at;
  });
  const positions = new Float32Array(total * 3);
  ring.forEach(([x, y], i) => {
    positions.set([x, y, 0], i * 3);
    positions.set([x, y, height], (n + i) * 3);
  });
  rings.forEach((r, k) => {
    r.forEach(([x, y], i) => {
      positions.set([x, y, height], (start[k]! + i) * 3);
      positions.set([x, y, height - depth], (start[k]! + r.length + i) * 3);
    });
  });
  const roof = (k: number, i: number) => start[k]! + i;
  const floor = (k: number, i: number) => start[k]! + rings[k]!.length + i;
  const childrenOf = (k: number) => rings.map((_, j) => j).filter((j) => parent[j] === k);

  const indices: number[] = [];
  fillRegion([ring], (_r, i) => i, 'down', indices);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, j + n, i, j + n, i + n); // piece wall, facing outward
  }
  // The top face with the grooves cut out of it.
  const top = childrenOf(-1);
  fillRegion(
    [ring, ...top.map((k) => rings[k]!)],
    (r, i) => (r === 0 ? n + i : roof(top[r - 1]!, i)),
    'up',
    indices,
  );

  rings.forEach((r, k) => {
    const m = r.length;
    const inside = childrenOf(k);
    const groove = level[k]! % 2 === 0;
    // A groove has a floor with its islands cut out; an island has a roof with its grooves cut out.
    fillRegion(
      [r, ...inside.map((c) => rings[c]!)],
      (q, i) => {
        const owner = q === 0 ? k : inside[q - 1]!;
        return groove ? floor(owner, i) : roof(owner, i);
      },
      'up',
      indices,
    );
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      if (groove) {
        // The material is outside the ring, so the wall faces in toward the groove.
        indices.push(floor(k, i), roof(k, j), floor(k, j), floor(k, i), roof(k, i), roof(k, j));
      } else {
        // An island stands up out of the groove, so its wall faces out.
        indices.push(floor(k, i), floor(k, j), roof(k, j), floor(k, i), roof(k, j), roof(k, i));
      }
    }
  });
  return { positions, indices: Uint32Array.from(indices) };
}

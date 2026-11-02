import earcut from 'earcut';
import { offset, outers } from '../geometry/clip';
import type { Vec2 } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';

/** Indexed triangle mesh. Z is up; units are millimetres; triangles wind counter-clockwise seen from outside. */
export interface Mesh {
  /** x, y, z for each vertex. */
  positions: Float32Array;
  /** Three vertex numbers per triangle. */
  indices: Uint32Array;
}

/** Drops points that repeat the previous one, which would create zero-area triangles. */
function withoutRepeats(poly: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    first &&
    last &&
    out.length > 1 &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6
  ) {
    out.pop();
  }
  return out;
}

/**
 * "Elephant foot" relief: the first layer is pulled in by `inset` all round, so the squash at the
 * bottom edge of a print does not swell into the gap between pieces. `height` is how tall the
 * pulled-in part is (one layer).
 */
export interface Relief {
  inset: number;
  height: number;
}

/**
 * A blind round hole in the top face (z = the piece's height), `depth` deep, with a flat floor.
 * `x`, `y` and `radius` are in the piece's own millimetres.
 */
export interface Pocket {
  x: number;
  y: number;
  radius: number;
  depth: number;
}

/** Sides of the circle a pocket is cut with. */
const POCKET_STEPS = 48;

/** The pocket's rim, counter-clockwise seen from above. */
function pocketRing(pocket: Pocket): Vec2[] {
  return Array.from({ length: POCKET_STEPS }, (_, i): Vec2 => {
    const a = (i / POCKET_STEPS) * Math.PI * 2;
    return [pocket.x + pocket.radius * Math.cos(a), pocket.y + pocket.radius * Math.sin(a)];
  });
}

/**
 * Writes the pocket's rim at the roof and at its floor into `positions` from vertex `base`
 * (rim first, then floor), and returns what the triangles need.
 */
function writePocket(
  pocket: Pocket,
  height: number,
  positions: Float32Array,
  base: number,
): { ring: Vec2[]; rim: number; floor: number } {
  const ring = pocketRing(pocket);
  const m = ring.length;
  ring.forEach(([x, y], i) => {
    positions.set([x, y, height], (base + i) * 3);
    positions.set([x, y, height - pocket.depth], (base + m + i) * 3);
  });
  return { ring, rim: base, floor: base + m };
}

/** The pocket's inward-facing wall and its floor (facing up). The roof around it is the caller's. */
function pocketTriangles(p: { ring: Vec2[]; rim: number; floor: number }, indices: number[]): void {
  const m = p.ring.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    // The material is outside the hole, so the wall faces the hole's axis.
    indices.push(p.floor + i, p.rim + j, p.floor + j, p.floor + i, p.rim + i, p.rim + j);
  }
  fillRegion([p.ring], (_r, i) => p.floor + i, 'up', indices);
}

/** Triangles that fill a flat region (an outer ring, and optionally one hole), facing up or down. */
function fillRegion(
  rings: readonly (readonly Vec2[])[],
  indexOf: (ring: number, point: number) => number,
  facing: 'up' | 'down',
  out: number[],
): void {
  const flat: number[] = [];
  const holes: number[] = [];
  const order: [number, number][] = [];
  rings.forEach((ring, r) => {
    if (r > 0) holes.push(flat.length / 2);
    ring.forEach(([x, y], i) => {
      flat.push(x, y);
      order.push([r, i]);
    });
  });
  const tris = earcut(flat, holes);
  for (let t = 0; t < tris.length; t += 3) {
    const ids = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    const pts = ids.map((k) => [flat[k * 2]!, flat[k * 2 + 1]!] as const);
    const cross =
      (pts[1]![0] - pts[0]![0]) * (pts[2]![1] - pts[0]![1]) -
      (pts[1]![1] - pts[0]![1]) * (pts[2]![0] - pts[0]![0]);
    const [a, b, c] = ids.map((k) => indexOf(order[k]![0], order[k]![1])) as [
      number,
      number,
      number,
    ];
    // Counter-clockwise from above faces up; the other way faces down.
    if (cross > 0 === (facing === 'up')) out.push(a, b, c);
    else out.push(a, c, b);
  }
}

/**
 * The same solid with its first `relief.height` mm pulled in by `relief.inset`: a floor, a short
 * inner wall, a narrow ledge facing down, then the full wall up to the roof. Still one closed shell.
 * Returns null when the piece is too thin to pull in (the inside would vanish or split).
 */
function extrudeWithRelief(
  ring: Vec2[],
  height: number,
  relief: Relief,
  pocket?: Pocket,
): Mesh | null {
  const inside = outers(offset([ring], -relief.inset), 0.5);
  if (inside.length !== 1) return null;
  let inner = withoutRepeats(inside[0]!);
  if (inner.length < 3) return null;
  if (signedArea(inner) < 0) inner = inner.reverse();
  const n = ring.length;
  const m = inner.length;
  const h = relief.height;

  // Vertices: the full outline at z = h, then at the roof; the pulled-in outline at the floor, then at z = h.
  const extra = pocket ? 2 * POCKET_STEPS : 0;
  const positions = new Float32Array((2 * n + 2 * m + extra) * 3);
  ring.forEach(([x, y], i) => {
    positions.set([x, y, h], i * 3);
    positions.set([x, y, height], (n + i) * 3);
  });
  inner.forEach(([x, y], i) => {
    positions.set([x, y, 0], (2 * n + i) * 3);
    positions.set([x, y, h], (2 * n + m + i) * 3);
  });

  const indices: number[] = [];
  // Roof: the full outline at the top, with the pocket (if any) cut out of it.
  const hole = pocket ? writePocket(pocket, height, positions, 2 * n + 2 * m) : null;
  if (hole) {
    fillRegion([ring, hole.ring], (r, i) => (r === 0 ? n + i : hole.rim + i), 'up', indices);
    pocketTriangles(hole, indices);
  } else {
    fillRegion([ring], (_r, i) => n + i, 'up', indices);
  }
  // Ledge: the full outline at z = h with the pulled-in outline cut out, facing down.
  fillRegion([ring, inner], (r, i) => (r === 0 ? i : 2 * n + m + i), 'down', indices);
  // Floor: the pulled-in outline at z = 0, facing down.
  fillRegion([inner], (_r, i) => 2 * n + i, 'down', indices);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, j + n, i, j + n, i + n); // upper wall, facing outward
  }
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const lo = 2 * n;
    const hi = 2 * n + m;
    indices.push(lo + i, lo + j, hi + j, lo + i, hi + j, hi + i); // lower wall, facing outward
  }
  return { positions, indices: Uint32Array.from(indices) };
}

/**
 * Extrudes a simple polygon upward from z = 0 to z = `height`, giving a closed solid:
 * a floor, a roof and one wall per edge. The roof and floor share vertices with the walls, so
 * every edge is used by exactly two triangles.
 */
export function extrudePolygon(
  poly: readonly Vec2[],
  height: number,
  relief?: Relief,
  pocket?: Pocket,
): Mesh {
  let ring = withoutRepeats(poly);
  if (ring.length < 3) throw new Error('A piece needs at least three corners');
  if (signedArea(ring) < 0) ring = ring.reverse();
  if (relief && relief.inset > 0 && relief.height > 0 && relief.height < height) {
    const stepped = extrudeWithRelief(ring, height, relief, pocket);
    // A piece too thin to pull in is made plain rather than broken.
    if (stepped) return stepped;
  }
  const n = ring.length;

  const positions = new Float32Array((n * 2 + (pocket ? 2 * POCKET_STEPS : 0)) * 3);
  ring.forEach(([x, y], i) => {
    positions.set([x, y, 0], i * 3);
    positions.set([x, y, height], (n + i) * 3);
  });
  if (pocket) {
    // A pocket needs the roof cut around it, so the roof and the floor are filled separately.
    const hole = writePocket(pocket, height, positions, 2 * n);
    const indices: number[] = [];
    fillRegion([ring, hole.ring], (r, i) => (r === 0 ? n + i : hole.rim + i), 'up', indices);
    fillRegion([ring], (_r, i) => i, 'down', indices);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(i, j, j + n, i, j + n, i + n);
    }
    pocketTriangles(hole, indices);
    return { positions, indices: Uint32Array.from(indices) };
  }

  const flat = ring.flatMap(([x, y]) => [x, y]);
  const tris = earcut(flat);
  const indices: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    let a = tris[t]!;
    let b = tris[t + 1]!;
    const c = tris[t + 2]!;
    const [ax, ay] = ring[a]!;
    const [bx, by] = ring[b]!;
    const [cx, cy] = ring[c]!;
    // Make the triangle counter-clockwise seen from above (the roof faces up).
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) [a, b] = [b, a];
    indices.push(a + n, b + n, c + n); // roof, facing up
    indices.push(a, c, b); // floor, facing down
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, j + n, i, j + n, i + n); // wall facing outward
  }
  return { positions, indices: Uint32Array.from(indices) };
}

export interface MeshCheck {
  /** Closed, consistently oriented, every edge shared by exactly two triangles. */
  watertight: boolean;
  /** Edges with no matching neighbour (holes in the surface). */
  openEdges: number;
  /** Edges used by more than two triangles, or twice in the same direction. */
  badEdges: number;
  /** Triangles with (almost) no area. */
  degenerate: number;
  /** Enclosed volume in cubic millimetres; positive when the triangles face outward. */
  volume: number;
}

/** The checks a slicer makes before it accepts a mesh without repair. */
export function checkMesh(mesh: Mesh): MeshCheck {
  const vertexCount = mesh.positions.length / 3;
  const directed = new Map<number, number>();
  let degenerate = 0;
  let volume = 0;
  const p = mesh.positions;

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const tri = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!] as const;
    for (let k = 0; k < 3; k++) {
      const key = tri[k]! * vertexCount + tri[(k + 1) % 3]!;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
    const [a, b, c] = tri;
    const ax = p[a * 3]!,
      ay = p[a * 3 + 1]!,
      az = p[a * 3 + 2]!;
    const bx = p[b * 3]!,
      by = p[b * 3 + 1]!,
      bz = p[b * 3 + 2]!;
    const cx = p[c * 3]!,
      cy = p[c * 3 + 1]!,
      cz = p[c * 3 + 2]!;
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area2 < 1e-9) degenerate++;
  }

  let openEdges = 0;
  let badEdges = 0;
  for (const [key, count] of directed) {
    const a = Math.floor(key / vertexCount);
    const b = key % vertexCount;
    if (count > 1) badEdges++;
    if (!directed.has(b * vertexCount + a)) openEdges++;
  }
  return {
    watertight: openEdges === 0 && badEdges === 0 && degenerate === 0,
    openEdges,
    badEdges,
    degenerate,
    volume,
  };
}

/** Joins meshes into one, keeping each as its own closed shell. */
export function mergeMeshes(meshes: readonly Mesh[]): Mesh {
  const vertexTotal = meshes.reduce((s, m) => s + m.positions.length / 3, 0);
  const indexTotal = meshes.reduce((s, m) => s + m.indices.length, 0);
  const positions = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);
  let vOffset = 0;
  let iOffset = 0;
  for (const m of meshes) {
    positions.set(m.positions, vOffset * 3);
    m.indices.forEach((idx, k) => (indices[iOffset + k] = idx + vOffset));
    vOffset += m.positions.length / 3;
    iOffset += m.indices.length;
  }
  return { positions, indices };
}

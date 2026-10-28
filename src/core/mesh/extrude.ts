import earcut from 'earcut';
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
 * Extrudes a simple polygon upward from z = 0 to z = `height`, giving a closed solid:
 * a floor, a roof and one wall per edge. The roof and floor share vertices with the walls, so
 * every edge is used by exactly two triangles.
 */
export function extrudePolygon(poly: readonly Vec2[], height: number): Mesh {
  let ring = withoutRepeats(poly);
  if (ring.length < 3) throw new Error('A piece needs at least three corners');
  if (signedArea(ring) < 0) ring = ring.reverse();
  const n = ring.length;

  const positions = new Float32Array(n * 2 * 3);
  ring.forEach(([x, y], i) => {
    positions.set([x, y, 0], i * 3);
    positions.set([x, y, height], (n + i) * 3);
  });

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

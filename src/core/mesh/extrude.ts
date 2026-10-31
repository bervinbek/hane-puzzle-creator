import earcut from 'earcut';
import { offset, outers } from '../geometry/clip';
import { pointInPolygon, type Vec2 } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';

/** Indexed triangle mesh. Z is up; units are millimetres; triangles wind counter-clockwise seen from outside. */
export interface Mesh {
  /** x, y, z for each vertex. */
  positions: Float32Array;
  /** Three vertex numbers per triangle. */
  indices: Uint32Array;
}

/** Drops points that repeat the previous one, which would create zero-area triangles. */
export function withoutRepeats(poly: readonly Vec2[]): Vec2[] {
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
export function pocketRing(pocket: Pocket): Vec2[] {
  return Array.from({ length: POCKET_STEPS }, (_, i): Vec2 => {
    const a = (i / POCKET_STEPS) * Math.PI * 2;
    return [pocket.x + pocket.radius * Math.cos(a), pocket.y + pocket.radius * Math.sin(a)];
  });
}

/** Triangles that fill a flat region (an outer ring, and optionally one hole), facing up or down. */
export function fillRegion(
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
 * Shallow cuts into the top face, all `depth` deep with a flat floor. The rings' nesting says
 * what they are: a ring on the top face is a hole, a ring inside that is an island left standing
 * in it, a ring inside that is a hole again, and so on. Rings must lie wholly inside the piece
 * and must not cross or touch each other or the piece's edge.
 */
export interface TopCut {
  rings: readonly (readonly Vec2[])[];
  depth: number;
}

/** One ring of a cut, with how deep it is nested and which ring it sits directly in. */
interface CutRing {
  points: Vec2[];
  depth: number;
  level: number;
  parent: number;
}

/** Every ring of every cut, counter-clockwise, with its nesting worked out within its own cut. */
function placeCutRings(cuts: readonly TopCut[]): CutRing[] {
  const placed: CutRing[] = [];
  for (const cut of cuts) {
    const rings = cut.rings
      .map((r) => withoutRepeats(r))
      .filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1e-6)
      .map((r) => (signedArea(r) < 0 ? r.reverse() : r));
    const base = placed.length;
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
    rings.forEach((points, i) => {
      placed.push({
        points,
        depth: cut.depth,
        level: level[i]!,
        parent: parent[i] === -1 ? -1 : base + parent[i]!,
      });
    });
  }
  return placed;
}

/** The first `height` mm pulled in to `inner`: a floor, a short wall, a down-facing ledge. */
interface Step {
  inner: Vec2[];
  height: number;
}

/**
 * The one closed solid every piece is made from: a floor, a roof and a wall per edge, with
 * optionally the pulled-in first layer and any shallow cuts in the roof. Every ring shares its
 * vertices with the walls beside it, so each edge is used by exactly two triangles.
 */
function buildSolid(
  ring: Vec2[],
  height: number,
  cuts: readonly TopCut[],
  step: Step | null,
): Mesh {
  const n = ring.length;
  const placed = placeCutRings(cuts);
  const m = step ? step.inner.length : 0;

  // Vertices: the full outline low (z = 0, or the top of the pulled-in layer) and at the roof, the
  // pulled-in outline at the floor and at the top of that layer, then each cut ring at the roof
  // and at its floor.
  let total = 2 * n + 2 * m;
  const start = placed.map((r) => {
    const at = total;
    total += 2 * r.points.length;
    return at;
  });
  const positions = new Float32Array(total * 3);
  const lowZ = step ? step.height : 0;
  ring.forEach(([x, y], i) => {
    positions.set([x, y, lowZ], i * 3);
    positions.set([x, y, height], (n + i) * 3);
  });
  if (step) {
    step.inner.forEach(([x, y], i) => {
      positions.set([x, y, 0], (2 * n + i) * 3);
      positions.set([x, y, step.height], (2 * n + m + i) * 3);
    });
  }
  placed.forEach((r, k) => {
    r.points.forEach(([x, y], i) => {
      positions.set([x, y, height], (start[k]! + i) * 3);
      positions.set([x, y, height - r.depth], (start[k]! + r.points.length + i) * 3);
    });
  });
  const roof = (k: number, i: number) => start[k]! + i;
  const floor = (k: number, i: number) => start[k]! + placed[k]!.points.length + i;
  const childrenOf = (k: number) => placed.map((_, j) => j).filter((j) => placed[j]!.parent === k);

  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, j + n, i, j + n, i + n); // outer wall, facing outward
  }
  if (step) {
    const lo = 2 * n;
    const hi = 2 * n + m;
    // Ledge: the full outline with the pulled-in outline cut out, then the floor, both facing down.
    fillRegion([ring, step.inner], (r, i) => (r === 0 ? i : hi + i), 'down', indices);
    fillRegion([step.inner], (_r, i) => lo + i, 'down', indices);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      indices.push(lo + i, lo + j, hi + j, lo + i, hi + j, hi + i); // lower wall, facing outward
    }
  } else {
    fillRegion([ring], (_r, i) => i, 'down', indices);
  }

  // The roof, with the outermost ring of every cut taken out of it.
  const top = placed.map((_, k) => k).filter((k) => placed[k]!.parent === -1);
  fillRegion(
    [ring, ...top.map((k) => placed[k]!.points)],
    (r, i) => (r === 0 ? n + i : roof(top[r - 1]!, i)),
    'up',
    indices,
  );

  placed.forEach((r, k) => {
    const len = r.points.length;
    const inside = childrenOf(k);
    const hole = r.level % 2 === 0;
    // A hole has a floor with its islands cut out; an island has a roof with its holes cut out.
    fillRegion(
      [r.points, ...inside.map((c) => placed[c]!.points)],
      (q, i) => {
        const owner = q === 0 ? k : inside[q - 1]!;
        return hole ? floor(owner, i) : roof(owner, i);
      },
      'up',
      indices,
    );
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % len;
      if (hole) {
        // The material is outside the ring, so the wall faces in toward the hole.
        indices.push(floor(k, i), roof(k, j), floor(k, j), floor(k, i), roof(k, i), roof(k, j));
      } else {
        // An island stands up out of the hole, so its wall faces out.
        indices.push(floor(k, i), floor(k, j), roof(k, j), floor(k, i), roof(k, j), roof(k, i));
      }
    }
  });
  return { positions, indices: Uint32Array.from(indices) };
}

/** The outline pulled in by `relief.inset`, or null when the piece is too thin for that. */
function pulledIn(ring: Vec2[], relief: Relief): Vec2[] | null {
  const inside = outers(offset([ring], -relief.inset), 0.5);
  if (inside.length !== 1) return null;
  let inner = withoutRepeats(inside[0]!);
  if (inner.length < 3) return null;
  if (signedArea(inner) < 0) inner = inner.reverse();
  return inner;
}

/**
 * Extrudes a simple polygon upward from z = 0 to z = `height`, giving a closed solid. Optional:
 * `relief` pulls the first layer in (a piece too thin for that is made plain rather than broken),
 * `pocket` is the blind round hole for a magnet, and `engraving` is a set of shallow grooves.
 */
export function extrudePolygon(
  poly: readonly Vec2[],
  height: number,
  relief?: Relief,
  pocket?: Pocket,
  engraving?: TopCut,
): Mesh {
  let ring = withoutRepeats(poly);
  if (ring.length < 3) throw new Error('A piece needs at least three corners');
  if (signedArea(ring) < 0) ring = ring.reverse();
  const cuts: TopCut[] = [];
  if (pocket) cuts.push({ rings: [pocketRing(pocket)], depth: pocket.depth });
  if (engraving && engraving.rings.length > 0) cuts.push(engraving);
  const inner =
    relief && relief.inset > 0 && relief.height > 0 && relief.height < height
      ? pulledIn(ring, relief)
      : null;
  return buildSolid(ring, height, cuts, inner && relief ? { inner, height: relief.height } : null);
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

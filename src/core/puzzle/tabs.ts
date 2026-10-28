import {
  difference,
  intersect,
  offset,
  outers,
  totalArea,
  union,
  type Poly,
} from '../geometry/clip';
import { bounds, pointInPolygon, type Vec2 } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';
import type { Rng } from '../rng';

export interface TabParams {
  /** Shortest shared edge that gets a tab (mm). */
  minEdge: number;
  /** Thinnest wall allowed between a tab and anything else (mm). */
  minWall: number;
  /** Radius used to round the inside corners where the neck meets the head (mm). */
  fillet: number;
}

export const DEFAULT_TABS: TabParams = { minEdge: 12, minWall: 1.4, fillet: 0.8 };

/** A straight stretch of border shared by two pieces. */
interface Edge {
  a: Vec2;
  b: Vec2;
  length: number;
}

const COLLINEAR_MM = 0.02;
const MIN_OVERLAP_MM = 0.5;
const JOIN_MM = 0.05;
/** Tolerance on dust when comparing areas (mm squared). */
const AREA_EPS = 0.02;

const sub = (p: Vec2, q: Vec2): Vec2 => [p[0] - q[0], p[1] - q[1]];
const len = (v: Vec2): number => Math.hypot(v[0], v[1]);

/** Straight borders shared by pieces a and b, merged along their length. */
export function sharedEdges(a: Poly, b: Poly): Edge[] {
  const found: { index: number; from: number; to: number; p: Vec2; u: Vec2; length: number }[] = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = a[(i + 1) % a.length]!;
    const d = sub(q, p);
    const length = len(d);
    if (length < MIN_OVERLAP_MM) continue;
    const u: Vec2 = [d[0] / length, d[1] / length];
    for (let j = 0; j < b.length; j++) {
      const r = sub(b[j]!, p);
      const s = sub(b[(j + 1) % b.length]!, p);
      if (Math.abs(r[0] * u[1] - r[1] * u[0]) > COLLINEAR_MM) continue;
      if (Math.abs(s[0] * u[1] - s[1] * u[0]) > COLLINEAR_MM) continue;
      const tr = r[0] * u[0] + r[1] * u[1];
      const ts = s[0] * u[0] + s[1] * u[1];
      const from = Math.max(0, Math.min(tr, ts));
      const to = Math.min(length, Math.max(tr, ts));
      if (to - from >= MIN_OVERLAP_MM) found.push({ index: i, from, to, p, u, length });
    }
  }
  found.sort((x, y) => x.index - y.index || x.from - y.from);

  // Chain stretches that continue each other in a straight line into one longer edge.
  const edges: Edge[] = [];
  for (const f of found) {
    const start: Vec2 = [f.p[0] + f.u[0] * f.from, f.p[1] + f.u[1] * f.from];
    const end: Vec2 = [f.p[0] + f.u[0] * f.to, f.p[1] + f.u[1] * f.to];
    const last = edges[edges.length - 1];
    if (last) {
      const gap = len(sub(start, last.b));
      const dir = sub(last.b, last.a);
      const cross = Math.abs(dir[0] * f.u[1] - dir[1] * f.u[0]) / (len(dir) || 1);
      if (gap <= JOIN_MM && cross < 0.02) {
        last.b = end;
        last.length = len(sub(last.b, last.a));
        continue;
      }
    }
    edges.push({ a: start, b: end, length: f.to - f.from });
  }
  return edges;
}

const ccw = (poly: Poly): Poly => (signedArea(poly) < 0 ? [...poly].reverse() : poly);

interface KnobShape {
  neck: number;
  headRadius: number;
}

/** Neck and head sizes for an edge of the given length. */
function knobShape(edgeLength: number, scale: number): KnobShape {
  const neck = Math.min(5.2, Math.max(3.2, 0.22 * edgeLength)) * scale;
  return { neck, headRadius: neck * 0.72 };
}

/**
 * A mushroom-shaped tab. Local axes: x along the edge, y pointing from the owner into the
 * receiver. The base sits slightly inside the owner so the tab always fuses with it.
 */
function buildKnob(at: Vec2, u: Vec2, n: Vec2, shape: KnobShape, fillet: number): Poly | null {
  const { neck, headRadius: r } = shape;
  const half = neck / 2;
  const base = -0.6;
  const neckLength = neck * 0.55;
  const centre = neckLength + Math.sqrt(r * r - half * half);
  const toWorld = (x: number, y: number): Vec2 => [
    at[0] + u[0] * x + n[0] * y,
    at[1] + u[1] * x + n[1] * y,
  ];
  const rect: Poly = [
    toWorld(-half, base),
    toWorld(half, base),
    toWorld(half, neckLength),
    toWorld(-half, neckLength),
  ];
  const circle: Poly = Array.from({ length: 40 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2;
    return toWorld(Math.cos(t) * r, centre + Math.sin(t) * r);
  });
  // Mirrored frames flip the winding, so make both shapes counter-clockwise first.
  const joined = union([ccw(rect)], [ccw(circle)]);
  // Closing (grow then shrink) rounds the inside corners where the neck meets the head.
  const rounded = outers(offset(offset(joined, fillet), -fillet));
  return rounded.length === 1 ? rounded[0]! : null;
}

/** Positions along an edge (as fractions) for the tabs it gets. */
function slots(length: number): number[] {
  return length > 45 ? [0.3, 0.7] : [0.5];
}

const TRIES: readonly { shift: number; scale: number }[] = [
  { shift: 0, scale: 1 },
  { shift: -0.1, scale: 0.9 },
  { shift: 0.1, scale: 0.9 },
  { shift: 0, scale: 0.78 },
];

function singleOuter(polys: readonly Poly[]): Poly | null {
  const o = outers(polys, AREA_EPS);
  return o.length === 1 ? o[0]! : null;
}

/**
 * Adds interlocking tabs between neighbouring pieces. Each shared straight edge that is long
 * enough gets a mushroom-shaped tab that grows out of one piece and fits into a matching hole in
 * the other, so the two always match exactly. A tab is skipped when it would leave the two pieces,
 * come closer than `minWall` to anything else, or split either piece in two.
 */
export function addTabs(
  input: readonly Poly[],
  rng: Rng,
  params: TabParams = DEFAULT_TABS,
  stats: Record<string, number> = {},
): { pieces: Poly[]; tabCount: number } {
  const count = (k: string): void => void (stats[k] = (stats[k] ?? 0) + 1);
  const pieces = input.map((p) => [...p]);
  const boxes = pieces.map((p) => bounds(p));
  let tabCount = 0;

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const bi = boxes[i]!;
      const bj = boxes[j]!;
      if (bi.maxX < bj.minX - 0.1 || bj.maxX < bi.minX - 0.1) continue;
      if (bi.maxY < bj.minY - 0.1 || bj.maxY < bi.minY - 0.1) continue;

      for (const edge of sharedEdges(pieces[i]!, pieces[j]!)) {
        const ownerFirst = rng() < 0.5;
        if (edge.length < params.minEdge) continue;
        const d = sub(edge.b, edge.a);
        const u: Vec2 = [d[0] / edge.length, d[1] / edge.length];

        slots(edge.length).forEach((fraction, slot) => {
          const ownerIsI = (slot % 2 === 0) === ownerFirst;
          const ownerIdx = ownerIsI ? i : j;
          const receiverIdx = ownerIsI ? j : i;

          for (const attempt of TRIES) {
            const t = Math.min(0.85, Math.max(0.15, fraction + attempt.shift));
            const at: Vec2 = [edge.a[0] + d[0] * t, edge.a[1] + d[1] * t];
            let n: Vec2 = [-u[1], u[0]];
            if (!pointInPolygon(at[0] + n[0] * 0.4, at[1] + n[1] * 0.4, pieces[receiverIdx]!)) {
              n = [u[1], -u[0]];
            }
            const knob = buildKnob(at, u, n, knobShape(edge.length, attempt.scale), params.fillet);
            if (!knob) {
              count('knob-shape');
              continue;
            }

            // The tab and a wall of `minWall` around it must lie inside the two pieces together.
            const both = union([pieces[ownerIdx]!], [pieces[receiverIdx]!]);
            const spill = difference(offset([knob], params.minWall), both);
            if (totalArea(spill) > AREA_EPS) {
              count('wall');
              continue;
            }

            const owner = singleOuter(union([pieces[ownerIdx]!], [knob]));
            const receiver = singleOuter(difference([pieces[receiverIdx]!], [knob]));
            if (!owner || !receiver) {
              count('split');
              continue;
            }
            // The tab must really cross into the receiver (not be swallowed by rounding).
            if (totalArea(intersect([pieces[receiverIdx]!], [knob])) < 1) {
              count('not-crossing');
              continue;
            }

            pieces[ownerIdx] = owner;
            pieces[receiverIdx] = receiver;
            boxes[ownerIdx] = bounds(owner);
            boxes[receiverIdx] = bounds(receiver);
            tabCount++;
            break;
          }
        });
      }
    }
  }
  return { pieces, tabCount };
}

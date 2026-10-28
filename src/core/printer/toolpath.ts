import { offset, outers, type Poly } from '../geometry/clip';
import type { Vec2 } from '../geometry/polygon';
import { centroid, simplifyClosed } from '../geometry/polyline';
import type { Puzzle } from '../puzzle/generate';
import { A1_MINI, PUZZLE_THICKNESS_MM } from './a1mini';

/**
 * A plausible toolpath for the puzzle, used to animate the print. It is NOT a slicer: real slicing
 * happens in Bambu Studio. It shows what printing looks like: two walls around every piece, then
 * solid zig-zag fill that turns 90 degrees each layer, one layer at a time.
 */

/** What a move is. Travel moves do not lay down plastic. */
export const MOVE = { TRAVEL: 0, OUTER: 1, INNER: 2, INFILL: 3 } as const;

/** Floats per move in `Layer.moves`: x0, y0, x1, y1, kind. */
export const MOVE_STRIDE = 5;

export interface Layer {
  index: number;
  /** Height of the top of this layer above the plate (mm). */
  zTop: number;
  moves: Float32Array;
  /** Which piece each move belongs to (an index into `puzzle.pieces`). */
  owner: Uint16Array;
  /** Time at which each move ends, counted from the start of the layer (seconds). */
  endTimes: Float32Array;
  seconds: number;
  /** Length of plastic path laid down in this layer (mm). */
  extrudedMm: number;
}

export interface Toolpath {
  layers: Layer[];
  layerHeight: number;
  lineWidth: number;
  /** Where each layer starts, counted from the start of the print (seconds). */
  layerStart: number[];
  totalSeconds: number;
  totalExtrudedMm: number;
}

export interface ToolpathOptions {
  layerHeight: number;
  lineWidth: number;
  thickness: number;
}

export const DEFAULT_TOOLPATH: ToolpathOptions = {
  layerHeight: A1_MINI.layerHeight,
  lineWidth: 0.42,
  thickness: PUZZLE_THICKNESS_MM,
};

/** Speeds in mm per second. The first layer runs at half speed, as slicers do. */
const SPEED = {
  [MOVE.TRAVEL]: 300,
  [MOVE.OUTER]: 60,
  [MOVE.INNER]: 100,
  [MOVE.INFILL]: 150,
} as const;
const FIRST_LAYER_FACTOR = 0.5;
/** Pause at the start of each layer (seconds): the head settles and the arm steps up. */
const LAYER_PAUSE = 1;
/** Fill line ends closer than this many line widths are joined instead of lifting the nozzle. */
const JOIN_LINES = 2.2;

interface Builder {
  data: number[];
  owner: number[];
  piece: number;
  x: number;
  y: number;
}

function travelTo(b: Builder, x: number, y: number): void {
  if (Math.hypot(x - b.x, y - b.y) > 1e-6) {
    b.data.push(b.x, b.y, x, y, MOVE.TRAVEL);
    b.owner.push(b.piece);
  }
  b.x = x;
  b.y = y;
}

function extrudeTo(b: Builder, x: number, y: number, kind: number): void {
  if (Math.hypot(x - b.x, y - b.y) > 1e-6) {
    b.data.push(b.x, b.y, x, y, kind);
    b.owner.push(b.piece);
  }
  b.x = x;
  b.y = y;
}

/** A closed loop starting from the point nearest to where the nozzle is now. */
function loopFrom(ring: Poly, x: number, y: number): Vec2[] {
  let best = 0;
  let bestD = Infinity;
  ring.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return [...ring.slice(best), ...ring.slice(0, best), ring[best]!];
}

type Line = [Vec2, Vec2][];

/** Parallel fill lines at `spacing`, turned by `angle`, clipped to the rings (even-odd). */
function scanFill(rings: readonly Poly[], angle: number, spacing: number): Line[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = rings.map((r) =>
    r.map(([x, y]): Vec2 => [x * cos + y * sin, -x * sin + y * cos]),
  );
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rotated) {
    for (const [, y] of r) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const lines: Line[] = [];
  for (let y = minY + spacing / 2; y < maxY; y += spacing) {
    const xs: number[] = [];
    for (const r of rotated) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i]!;
        const [xj, yj] = r[j]!;
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
    }
    xs.sort((a, b) => a - b);
    const segments: Line = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1]! - xs[k]! < 0.05) continue;
      segments.push([
        [xs[k]! * cos - y * sin, xs[k]! * sin + y * cos],
        [xs[k + 1]! * cos - y * sin, xs[k + 1]! * sin + y * cos],
      ]);
    }
    if (segments.length > 0) lines.push(segments);
  }
  return lines;
}

interface PieceGeometry {
  index: number;
  outer: Poly[];
  inner: Poly[];
  fill: Poly[];
  centre: Vec2;
}

function pieceGeometry(polygon: Poly, w: number, index: number): PieceGeometry {
  const rings = (inset: number): Poly[] =>
    outers(offset([polygon], -inset)).map((r) => simplifyClosed(r, 0.02));
  return {
    index,
    outer: rings(w / 2),
    inner: rings(w * 1.5),
    fill: rings(w * 2),
    centre: centroid(polygon),
  };
}

/** Pieces in a snaking order so the nozzle travels as little as possible. */
function orderPieces(pieces: readonly PieceGeometry[]): PieceGeometry[] {
  const left = [...pieces];
  const order: PieceGeometry[] = [];
  let x = -90;
  let y = -90;
  while (left.length > 0) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((p, i) => {
      const d = (p.centre[0] - x) ** 2 + (p.centre[1] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const [next] = left.splice(best, 1);
    order.push(next!);
    [x, y] = next!.centre;
  }
  return order;
}

/** All moves for one layer's worth of walls and fill, for one fill direction. */
function layerBody(
  pieces: readonly PieceGeometry[],
  angle: number,
  w: number,
  from: Vec2,
): { moves: Float32Array; owner: Uint16Array } {
  const b: Builder = { data: [], owner: [], piece: 0, x: from[0], y: from[1] };
  for (const piece of pieces) {
    b.piece = piece.index;
    for (const [rings, kind] of [
      [piece.inner, MOVE.INNER],
      [piece.outer, MOVE.OUTER],
    ] as const) {
      for (const ring of rings) {
        const loop = loopFrom(ring, b.x, b.y);
        travelTo(b, loop[0]![0], loop[0]![1]);
        for (const [x, y] of loop.slice(1)) extrudeTo(b, x, y, kind);
      }
    }
    const lines = scanFill(piece.fill, angle, w);
    lines.forEach((segments, i) => {
      const ordered =
        i % 2 === 0 ? segments : [...segments].reverse().map(([p, q]): [Vec2, Vec2] => [q, p]);
      for (const [start, end] of ordered) {
        if (Math.hypot(start[0] - b.x, start[1] - b.y) <= w * JOIN_LINES && b.data.length > 0) {
          extrudeTo(b, start[0], start[1], MOVE.INFILL);
        } else {
          travelTo(b, start[0], start[1]);
        }
        extrudeTo(b, end[0], end[1], MOVE.INFILL);
      }
    });
  }
  return { moves: Float32Array.from(b.data), owner: Uint16Array.from(b.owner) };
}

function timeline(
  moves: Float32Array,
  firstLayer: boolean,
): { endTimes: Float32Array; seconds: number; extruded: number } {
  const count = moves.length / MOVE_STRIDE;
  const endTimes = new Float32Array(count);
  let t = LAYER_PAUSE;
  let extruded = 0;
  for (let i = 0; i < count; i++) {
    const o = i * MOVE_STRIDE;
    const kind = moves[o + 4]! as 0 | 1 | 2 | 3;
    const length = Math.hypot(moves[o + 2]! - moves[o]!, moves[o + 3]! - moves[o + 1]!);
    const speed = SPEED[kind] * (firstLayer && kind !== MOVE.TRAVEL ? FIRST_LAYER_FACTOR : 1);
    t += length / speed;
    if (kind !== MOVE.TRAVEL) extruded += length;
    endTimes[i] = t;
  }
  return { endTimes, seconds: t, extruded };
}

/** Builds the toolpath for a puzzle, layer by layer. */
export function buildToolpath(
  puzzle: Puzzle,
  options: ToolpathOptions = DEFAULT_TOOLPATH,
): Toolpath {
  const w = options.lineWidth;
  const geometry = orderPieces(puzzle.pieces.map((p, i) => pieceGeometry(p.polygon, w, i)));
  const layerCount = Math.max(1, Math.round(options.thickness / options.layerHeight));

  // Two fill directions, one for odd layers and one for even: both bodies start where the last one ended.
  const layers: Layer[] = [];
  const layerStart: number[] = [];
  let clock = 0;
  let total = 0;
  let at: Vec2 = [0, 0];
  for (let k = 0; k < layerCount; k++) {
    const angle = k % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
    const { moves, owner } = layerBody(geometry, angle, w, at);
    const { endTimes, seconds, extruded } = timeline(moves, k === 0);
    layerStart.push(clock);
    layers.push({
      index: k,
      zTop: (k + 1) * options.layerHeight,
      moves,
      owner,
      endTimes,
      seconds,
      extrudedMm: extruded,
    });
    clock += seconds;
    total += extruded;
    const n = moves.length / MOVE_STRIDE;
    at = n > 0 ? [moves[(n - 1) * MOVE_STRIDE + 2]!, moves[(n - 1) * MOVE_STRIDE + 3]!] : at;
  }
  return {
    layers,
    layerHeight: options.layerHeight,
    lineWidth: w,
    layerStart,
    totalSeconds: clock,
    totalExtrudedMm: total,
  };
}

export interface ToolpathState {
  layer: number;
  move: number;
  /** Nozzle position over the plate (mm) and its height above it. */
  x: number;
  y: number;
  z: number;
  /** True while plastic is coming out. */
  extruding: boolean;
  /** Path length laid down so far (mm), roughly. */
  extrudedMm: number;
}

/** Where the nozzle is `seconds` into the print. Clamps to the start and the end. */
export function stateAt(path: Toolpath, seconds: number): ToolpathState {
  const t = Math.min(path.totalSeconds, Math.max(0, seconds));
  let lo = 0;
  let hi = path.layers.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.layerStart[mid]! <= t) lo = mid;
    else hi = mid - 1;
  }
  const layer = path.layers[lo]!;
  const local = t - path.layerStart[lo]!;
  const count = layer.moves.length / MOVE_STRIDE;
  let a = 0;
  let b = Math.max(0, count - 1);
  while (a < b) {
    const mid = (a + b) >> 1;
    if (layer.endTimes[mid]! >= local) b = mid;
    else a = mid + 1;
  }
  const o = a * MOVE_STRIDE;
  const before = layer.extrudedMm * Math.min(1, local / Math.max(layer.seconds, 1e-9));
  const prior = path.layers.slice(0, lo).reduce((s, l) => s + l.extrudedMm, 0);
  if (count === 0)
    return { layer: lo, move: 0, x: 0, y: 0, z: layer.zTop, extruding: false, extrudedMm: prior };
  const start = a === 0 ? LAYER_PAUSE : layer.endTimes[a - 1]!;
  const span = Math.max(layer.endTimes[a]! - start, 1e-9);
  const f = Math.min(1, Math.max(0, (local - start) / span));
  return {
    layer: lo,
    move: a,
    x: layer.moves[o]! + (layer.moves[o + 2]! - layer.moves[o]!) * f,
    y: layer.moves[o + 1]! + (layer.moves[o + 3]! - layer.moves[o + 1]!) * f,
    z: layer.zTop,
    extruding: layer.moves[o + 4]! !== MOVE.TRAVEL,
    extrudedMm: prior + before,
  };
}

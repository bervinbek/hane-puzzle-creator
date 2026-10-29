import { labelComponents } from './morphology';

/** Smallest and biggest x and y of the set pixels, widened by one pixel (so neighbours exist). */
function maskBox(mask: Uint8Array, w: number, h: number): [number, number, number, number] | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return [
    Math.max(1, minX - 1),
    Math.max(1, minY - 1),
    Math.min(w - 2, maxX + 1),
    Math.min(h - 2, maxY + 1),
  ];
}

/**
 * True when pixel `i` is the loose end of a thin line: its neighbours form one short unbroken run.
 * (Counting neighbours alone misses the tip of a stair-stepped diagonal, which has two.)
 */
function isEnd(mask: Uint8Array, w: number, i: number): boolean {
  // The ring of neighbours clockwise from the one above.
  const ring = [
    mask[i - w]!,
    mask[i - w + 1]!,
    mask[i + 1]!,
    mask[i + w + 1]!,
    mask[i + w]!,
    mask[i + w - 1]!,
    mask[i - 1]!,
    mask[i - w - 1]!,
  ];
  let count = 0;
  let runs = 0;
  for (let k = 0; k < 8; k++) {
    count += ring[k]!;
    if (ring[k] === 0 && ring[(k + 1) % 8] === 1) runs++;
  }
  return runs === 1 && count >= 1 && count <= 3;
}

/**
 * Thins a 0/1 mask to a skeleton one pixel wide (Zhang-Suen). A thick pen line becomes the line
 * through its middle, whose loose ends are where the line stops.
 */
export function thin(mask: Uint8Array, w: number, h: number): Uint8Array {
  const img = Uint8Array.from(mask);
  const box = maskBox(img, w, h);
  if (!box) return img;
  const [x0, y0, x1, y1] = box;
  const remove: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      remove.length = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          // The neighbours clockwise from the one above: p2 .. p9.
          const p2 = img[i - w]!;
          const p3 = img[i - w + 1]!;
          const p4 = img[i + 1]!;
          const p5 = img[i + w + 1]!;
          const p6 = img[i + w]!;
          const p7 = img[i + w - 1]!;
          const p8 = img[i - 1]!;
          const p9 = img[i - w - 1]!;
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (a !== 1) continue;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) {
            continue;
          }
          remove.push(i);
        }
      }
      for (const i of remove) img[i] = 0;
      if (remove.length > 0) changed = true;
    }
  }
  return img;
}

/** The pixels at the loose ends of a skeleton, after nibbling off short spurs. */
export function skeletonEnds(skeleton: Uint8Array, w: number, h: number, spur: number): number[] {
  const skel = Uint8Array.from(skeleton);
  const box = maskBox(skel, w, h);
  if (!box) return [];
  const [x0, y0, x1, y1] = box;
  const ends = (): number[] => {
    const found: number[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (skel[i] && isEnd(skel, w, i)) found.push(i);
      }
    }
    return found;
  };
  // A spur is a short side branch left by the pen's wobble: each round takes one pixel off
  // every end, so branches shorter than `spur` vanish and the real line only gets a bit shorter.
  for (let k = 0; k < spur; k++) {
    const found = ends();
    if (found.length === 0) break;
    for (const i of found) skel[i] = 0;
  }
  return ends();
}

/** Sets a line of round dots between two pixels (indexes), `radius` pixels either side. */
function drawLine(
  mask: Uint8Array,
  w: number,
  h: number,
  a: number,
  b: number,
  radius: number,
): void {
  const ax = a % w;
  const ay = Math.floor(a / w);
  const bx = b % w;
  const by = Math.floor(b / w);
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  for (let s = 0; s <= steps; s++) {
    const cx = Math.round(ax + ((bx - ax) * s) / steps);
    const cy = Math.round(ay + ((by - ay) * s) / steps);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (dx * dx + dy * dy <= radius * radius && x >= 0 && y >= 0 && x < w && y < h) {
          mask[y * w + x] = 1;
        }
      }
    }
  }
}

/** A piece of line smaller than this share of the biggest piece is a stray mark, not the drawing. */
const MAIN_SHARE = 0.25;

/**
 * Closes a line drawing that does not enclose anything: finds where the line stops, and joins
 * the two nearest loose ends with a straight bridge of ink.
 *
 * The drawing may be several pieces of line (one gap splits a closed shape in two arcs when there
 * are two gaps), so ends of different pieces are paired first: that is what a gap is. Only when
 * all the ends belong to one piece are two of its own ends joined. Stray marks much smaller than
 * the main drawing are left alone. Returns a copy of the ink with the bridge, or null when there
 * are not two ends to join. Deterministic and pure.
 */
export function bridgeNearestEnds(
  ink: Uint8Array,
  w: number,
  h: number,
  spur: number,
): Uint8Array | null {
  const ends = skeletonEnds(thin(ink, w, h), w, h, spur);
  if (ends.length < 2) return null;

  const { labels, areas } = labelComponents(ink, w, h);
  const biggest = Math.max(0, ...areas);
  const pool = ends.filter((i) => areas[labels[i]!]! >= MAIN_SHARE * biggest);
  if (pool.length < 2) return null;

  const distance = (a: number, b: number): number =>
    Math.hypot((a % w) - (b % w), Math.floor(a / w) - Math.floor(b / w));
  let best = Infinity;
  let pair: [number, number] | null = null;
  // First pass: ends of different pieces. Second pass: two ends of the same piece.
  for (const acrossPieces of [true, false]) {
    for (let p = 0; p < pool.length; p++) {
      for (let q = p + 1; q < pool.length; q++) {
        const a = pool[p]!;
        const b = pool[q]!;
        if ((labels[a] !== labels[b]) !== acrossPieces) continue;
        const d = distance(a, b);
        if (d < best) {
          best = d;
          pair = [a, b];
        }
      }
    }
    if (pair) break;
  }
  if (!pair) return null;

  const out = Uint8Array.from(ink);
  // A bridge a few pixels wide: thin enough to look like a pen line, wide enough to seal the shape.
  drawLine(out, w, h, pair[0], pair[1], 2);
  return out;
}

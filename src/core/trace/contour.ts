import type { Vec2 } from '../geometry/polygon';

/**
 * Marching squares with linear interpolation. Finds the closed curves where the field crosses
 * `level` (inside is >= level). The field is treated as 0 outside the image so every curve closes.
 * Point coordinates are in pixel units, with sample (x, y) at the pixel centre (x + 0.5, y + 0.5).
 */
export function contourLoops(field: Float32Array, w: number, h: number, level = 0.5): Vec2[][] {
  const val = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]!;
  const hId = (x: number, y: number): number => ((y + 1) * (w + 2) + (x + 1)) * 2;
  const vId = (x: number, y: number): number => hId(x, y) + 1;

  const pos = new Map<number, Vec2>();
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };

  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = val(x, y);
      const tr = val(x + 1, y);
      const br = val(x + 1, y + 1);
      const bl = val(x, y + 1);
      const idx =
        (tl >= level ? 8 : 0) |
        (tr >= level ? 4 : 0) |
        (br >= level ? 2 : 0) |
        (bl >= level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;

      const top = hId(x, y);
      const bottom = hId(x, y + 1);
      const left = vId(x, y);
      const right = vId(x + 1, y);
      const t = (a: number, b: number): number => (level - a) / (b - a);
      if (!pos.has(top) && tl >= level !== tr >= level) pos.set(top, [x + t(tl, tr), y]);
      if (!pos.has(bottom) && bl >= level !== br >= level) pos.set(bottom, [x + t(bl, br), y + 1]);
      if (!pos.has(left) && tl >= level !== bl >= level) pos.set(left, [x, y + t(tl, bl)]);
      if (!pos.has(right) && tr >= level !== br >= level) pos.set(right, [x + 1, y + t(tr, br)]);

      const centreHigh = (tl + tr + br + bl) / 4 >= level;
      switch (idx) {
        case 1:
        case 14:
          link(left, bottom);
          break;
        case 2:
        case 13:
          link(bottom, right);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 4:
        case 11:
          link(top, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 7:
        case 8:
          link(top, left);
          break;
        case 5:
          if (centreHigh) {
            link(top, left);
            link(right, bottom);
          } else {
            link(top, right);
            link(left, bottom);
          }
          break;
        case 10:
          if (centreHigh) {
            link(top, right);
            link(left, bottom);
          } else {
            link(top, left);
            link(right, bottom);
          }
          break;
      }
    }
  }

  const loops: Vec2[][] = [];
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: Vec2[] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      seen.add(cur);
      const p = pos.get(cur)!;
      loop.push([p[0] + 0.5, p[1] + 0.5]);
      const next = adj.get(cur)!.find((n) => n !== prev && (n !== start || loop.length > 2));
      if (next === undefined || next === start || seen.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** One running-sum box blur pass along one axis, replicating edge pixels. O(n) for any radius. */
function boxPass(
  src: Float32Array,
  dst: Float32Array,
  length: number,
  lines: number,
  step: number,
  lineStep: number,
  r: number,
): void {
  const size = 2 * r + 1;
  const last = length - 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    const at = (i: number): number => src[base + Math.min(last, Math.max(0, i)) * step]!;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += at(k);
    for (let i = 0; i < length; i++) {
      dst[base + i * step] = acc / size;
      acc += at(i + r + 1) - at(i - r);
    }
  }
}

/** Radii of three box blurs that together approximate a Gaussian of the given sigma. */
function boxRadii(sigma: number): number[] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const m = Math.round(
    (12 * sigma * sigma - n * lower * lower - 4 * n * lower - 3 * n) / (-4 * lower - 4),
  );
  return Array.from({ length: n }, (_, i) => ((i < m ? lower : upper) - 1) / 2);
}

/** Gaussian blur (three box passes per axis). Returns a new array; the input is untouched. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const a = Float32Array.from(src);
  if (sigma < 0.5) return a;
  const b = new Float32Array(src.length);
  for (const r of boxRadii(sigma)) {
    if (r <= 0) continue;
    boxPass(a, b, w, h, 1, w, r); // along x
    boxPass(b, a, h, w, w, 1, r); // along y
  }
  return a;
}

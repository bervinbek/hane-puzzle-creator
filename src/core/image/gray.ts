export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row by row (same layout as canvas ImageData). */
  readonly data: Uint8ClampedArray | Uint8Array;
}

/**
 * Brightness per pixel in 0..255 where ink is dark and paper is light.
 * Uses the darkest colour channel, so coloured pens (blue, red, green) read as dark as black ones.
 * Transparent pixels count as white paper.
 */
export function toInkGray(img: RgbaImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = d[p + 3]! / 255;
    const r = d[p]! * a + 255 * (1 - a);
    const g = d[p + 1]! * a + 255 * (1 - a);
    const b = d[p + 2]! * a + 255 * (1 - a);
    out[i] = Math.min(r, g, b);
  }
  return out;
}

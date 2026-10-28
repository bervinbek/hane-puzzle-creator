import type { Vec2 } from '../geometry/polygon';
import type { RgbaImage } from './gray';

/**
 * Straightening a photo of a page or whiteboard that was taken at an angle. The user marks the
 * four corners of the page; the part of the photo inside them becomes a flat, upright picture.
 */

/** Four corners in the photo, in pixels, going round: top left, top right, bottom right, bottom left. */
export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];

/** Longest side of the straightened picture, so tracing stays quick. */
export const STRAIGHT_MAX_SIDE = 800;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Twice the signed area of the triangle a, b, c: positive when it turns clockwise on screen (y down). */
const turn = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/**
 * True when the four corners make a proper four-sided box going round the same way at every
 * corner (no crossed sides, no corner pushed inside), and it is not a sliver.
 */
export function isUsableQuad(quad: Quad, minArea = 0): boolean {
  const signs = quad.map((p, i) => Math.sign(turn(p, quad[(i + 1) % 4]!, quad[(i + 2) % 4]!)));
  if (signs.some((s) => s === 0) || signs.some((s) => s !== signs[0])) return false;
  const area =
    Math.abs(quad.reduce((sum, p, i) => sum + turn([0, 0], p, quad[(i + 1) % 4]!), 0)) / 2;
  return area >= minArea;
}

/** The size the straightened picture should have: the longer of each pair of opposite sides. */
export function straightSize(
  quad: Quad,
  maxSide: number = STRAIGHT_MAX_SIDE,
): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(dist(tl, tr), dist(bl, br));
  const height = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxSide / Math.max(width, height, 1e-9));
  return {
    width: Math.max(8, Math.round(width * scale)),
    height: Math.max(8, Math.round(height * scale)),
  };
}

/**
 * Where the unit square lands in the photo: maps (u, v) in 0..1 (u across, v down) to a point in
 * the photo, so (0, 0) is the top left corner and (1, 1) the bottom right. A projective map, so
 * straight lines stay straight (Heckbert, "Fundamentals of Texture Mapping", 1989).
 */
export function unitSquareToQuad(quad: Quad): (u: number, v: number) => Vec2 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const det = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w];
  };
}

/**
 * The part of the photo inside the four corners, made flat and upright. Anything the corners
 * reach outside the photo is white paper. The picture is opaque.
 */
export function straighten(
  image: RgbaImage,
  quad: Quad,
  maxSide: number = STRAIGHT_MAX_SIDE,
): RgbaImage {
  const { width, height } = straightSize(quad, maxSide);
  const at = unitSquareToQuad(quad);
  const out = new Uint8ClampedArray(width * height * 4);
  const { width: w, height: h, data } = image;

  /** One colour channel of the photo at a fractional position, blending the four pixels around it. */
  const sample = (x: number, y: number, channel: number): number => {
    const fx = Math.floor(x - 0.5);
    const fy = Math.floor(y - 0.5);
    const tx = x - 0.5 - fx;
    const ty = y - 0.5 - fy;
    const pixel = (px: number, py: number): number => {
      if (px < 0 || py < 0 || px >= w || py >= h) return 255;
      const i = (py * w + px) * 4;
      // Transparent pixels count as white paper, as everywhere else.
      const a = data[i + 3]! / 255;
      return data[i + channel]! * a + 255 * (1 - a);
    };
    return (
      pixel(fx, fy) * (1 - tx) * (1 - ty) +
      pixel(fx + 1, fy) * tx * (1 - ty) +
      pixel(fx, fy + 1) * (1 - tx) * ty +
      pixel(fx + 1, fy + 1) * tx * ty
    );
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = at((x + 0.5) / width, (y + 0.5) / height);
      const o = (y * width + x) * 4;
      out[o] = sample(sx, sy, 0);
      out[o + 1] = sample(sx, sy, 1);
      out[o + 2] = sample(sx, sy, 2);
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

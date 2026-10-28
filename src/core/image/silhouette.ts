import { squaredEdt } from './edt';
import { floodExterior, keepLargest, labelComponents, largestArea } from './morphology';

export interface Silhouette {
  /** Filled shape (1 inside), only the biggest piece. */
  mask: Uint8Array;
  /** True when the line was found to enclose a shape of sensible size. */
  closed: boolean;
  /** Gap closing that was needed, in pixels (0 when the line was already closed). */
  closeRadius: number;
}

/** The enclosed area must cover at least this fraction of the drawing's bounding box. */
const MIN_ENCLOSED_FRACTION = 0.1;

function inkBounds(ink: Uint8Array, w: number, h: number): number {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!ink[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
}

/**
 * Turns an ink drawing into a filled silhouette.
 * For each candidate radius (smallest first) the ink is thickened to seal small gaps, the outside
 * is flood-filled from the border, and everything not outside counts as inside. The first radius
 * that encloses a big enough area wins. Interior details (eyes, spots) end up filled.
 */
export function buildSilhouette(
  ink: Uint8Array,
  w: number,
  h: number,
  radii: readonly number[],
): Silhouette {
  const n = w * h;
  const bbox = inkBounds(ink, w, h);
  const inkDist = squaredEdt(ink, w, h);
  const blocked = new Uint8Array(n);

  let chosen = radii[radii.length - 1] ?? 0;
  let exterior: Uint8Array = new Uint8Array(n);
  let closed = false;

  for (const r of radii) {
    const r2 = r * r;
    for (let i = 0; i < n; i++) blocked[i] = inkDist[i]! <= r2 ? 1 : 0;
    exterior = floodExterior(blocked, w, h);

    const enclosed = new Uint8Array(n);
    for (let i = 0; i < n; i++) enclosed[i] = !exterior[i] && !blocked[i] ? 1 : 0;
    const area = largestArea(labelComponents(enclosed, w, h).areas);

    chosen = r;
    if (bbox > 0 && area >= MIN_ENCLOSED_FRACTION * bbox) {
      closed = true;
      break;
    }
  }

  // Everything not outside is inside; then undo the thickening so the edge sits on the line.
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) filled[i] = exterior[i] ? 0 : 1;

  let result: Uint8Array = filled;
  if (chosen > 0) {
    const outsideDist = squaredEdt(exterior, w, h);
    const r2 = chosen * chosen;
    result = new Uint8Array(n);
    for (let i = 0; i < n; i++) result[i] = filled[i] && outsideDist[i]! > r2 ? 1 : 0;
  }

  return { mask: keepLargest(result, w, h), closed, closeRadius: chosen };
}

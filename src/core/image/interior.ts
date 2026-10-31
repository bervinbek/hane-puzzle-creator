import { signedArea, simplifyClosed } from '../geometry/polyline';
import type { Vec2 } from '../geometry/polygon';
import { ENGRAVE } from '../printer/a1mini';
import { contourLoops } from '../trace/contour';
import { gaussianBlur } from './blur';
import { squaredEdt } from './edt';
import { removeSmall } from './morphology';

/**
 * The marks drawn inside the animal (eyes, nose, stripes, spots), as rings in image pixels.
 *
 * The outline's own line lies within one pen width of the silhouette's edge, so the marks are the
 * ink that is deeper inside than that (a little more, `ENGRAVE.penMargin` pen widths). A stripe
 * that runs into the outline therefore stops short of it, which is also where a groove has to
 * stop. Each ring is traced like the outline: a blurred mask, marching squares, simplified.
 *
 * `ink` and `silhouette` are the masks the outline finder already made (1 where set), `penPx` is
 * how wide the pen was in this picture.
 */
export function interiorMarks(
  ink: Uint8Array,
  silhouette: Uint8Array,
  w: number,
  h: number,
  penPx: number,
): Vec2[][] {
  const n = w * h;
  const outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) outside[i] = silhouette[i] ? 0 : 1;
  const far = squaredEdt(outside, w, h);
  const margin = ENGRAVE.penMargin * penPx;
  const limit = margin * margin;
  let inner: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) inner[i] = ink[i] && far[i]! > limit ? 1 : 0;
  inner = removeSmall(inner, w, h, 0.25 * penPx * penPx);

  const field = gaussianBlur(Float32Array.from(inner), w, h, 1);
  return contourLoops(field, w, h, 0.5)
    .filter((loop) => Math.abs(signedArea(loop)) > 0.1 * penPx * penPx)
    .map((loop) => simplifyClosed(loop, 0.25));
}

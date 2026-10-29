import { gaussianBlur } from './image/blur';
import { bridgeNearestEnds } from './image/bridge';
import { toInkGray, type RgbaImage } from './image/gray';
import { removeSmall } from './image/morphology';
import { buildSilhouette } from './image/silhouette';
import { inkMask, normaliseIllumination, otsu } from './image/threshold';
import { fitToPlate, resampleClosed, signedArea, simplifyClosed } from './geometry/polyline';
import type { Vec2 } from './geometry/polygon';
import { usablePlateSize } from './printer/a1mini';
import { contourLoops } from './trace/contour';

export type CloseGaps = 'auto' | 'small' | 'big';

/** The three controls a student or teacher can change. See docs/ARCHITECTURE.md section 5.1. */
export interface TidyParams {
  /** 0-100. Higher picks up fainter lines. */
  lineStrength: number;
  /** How hard to try to join gaps in the line. */
  closeGaps: CloseGaps;
  /** 0-100. Higher rounds off more wobbles. */
  smoothness: number;
}

export const DEFAULT_TIDY: TidyParams = { lineStrength: 50, closeGaps: 'auto', smoothness: 35 };

/** Drawn on screen: the strokes are already clean, so only the wobble of a hand needs smoothing. */
export const DRAWN_TIDY: TidyParams = { ...DEFAULT_TIDY, smoothness: 100 };

/** There is no 'open' problem: a line with a gap is closed for the student, never reported. */
export type OutlineProblem = 'blank' | 'tiny';

export interface OutlineResult {
  /** True when a closed shape of sensible size was found. */
  ok: boolean;
  problem: OutlineProblem | null;
  /** Outline in image pixels (y down), for drawing over the photo. Empty when nothing was found. */
  outlinePx: Vec2[];
  /** Outline in millimetres (centred, y up, counter-clockwise), scaled to fit the plate. */
  outlineMm: Vec2[];
  widthMm: number;
  heightMm: number;
  /** Gap closing that was applied, in pixels. */
  closeRadius: number;
  /** How many straight bridges were added between loose ends of the line (0 for a closed line). */
  bridges: number;
}

/**
 * Gap-closing radii as a fraction of the image's longer side, tried smallest first. Each setting
 * starts where it says, then carries on with the same wider radii, so a line with a bigger gap is
 * still closed instead of being given up on (the first radius that closes it wins).
 */
const WIDER = [0.01, 0.02, 0.035, 0.05, 0.07];
const RADII: Record<CloseGaps, readonly number[]> = {
  auto: [0, 0.004, ...WIDER],
  small: [0.01, ...WIDER.filter((f) => f > 0.01)],
  big: [0.04, ...WIDER.filter((f) => f > 0.04)],
};

/** Most bridges added to one drawing, and the length of pen wobble ignored when looking for ends. */
const MAX_BRIDGES = 4;
const SPUR_FRACTION = 0.012;
const MIN_INK_FRACTION = 0.0005;
const MIN_SHAPE_FRACTION = 0.02;
const SPECK_FRACTION = 0.00025;
const OUTLINE_SPACING_MM = 0.5;

const EMPTY: Omit<OutlineResult, 'ok' | 'problem'> = {
  outlinePx: [],
  outlineMm: [],
  widthMm: 0,
  heightMm: 0,
  closeRadius: 0,
  bridges: 0,
};

/**
 * Turns a photo or scan of a line drawing into a clean outline.
 * Construct once per picture (the slow lighting correction happens here), then call `run` each
 * time a control changes. Expects an image already scaled so its longer side is about 900 px.
 */
export class OutlineExtractor {
  private readonly norm: Float32Array;
  private readonly otsuThreshold: number;

  constructor(private readonly image: RgbaImage) {
    this.norm = normaliseIllumination(toInkGray(image), image.width, image.height);
    this.otsuThreshold = Math.min(0.85, Math.max(0.3, otsu(this.norm)));
  }

  run(params: TidyParams, maxSizeMm: number = usablePlateSize()): OutlineResult {
    const { width: w, height: h } = this.image;
    const n = w * h;
    const long = Math.max(w, h);

    const offset = ((params.lineStrength - 50) / 50) * 0.2;
    const threshold = Math.min(0.95, Math.max(0.2, this.otsuThreshold + offset));
    let ink = inkMask(this.norm, threshold);

    let inkCount = 0;
    for (let i = 0; i < n; i++) inkCount += ink[i]!;
    if (inkCount < MIN_INK_FRACTION * n) return { ...EMPTY, ok: false, problem: 'blank' };

    ink = removeSmall(ink, w, h, Math.max(12, SPECK_FRACTION * n));

    const radii = RADII[params.closeGaps].map((f) => Math.round(f * long));
    let silhouette = buildSilhouette(ink, w, h, radii);
    // The line still does not close: join its two nearest loose ends with a straight bridge, and
    // look again (a drawing with several gaps gets one bridge for each).
    let bridges = 0;
    const spur = Math.max(6, Math.round(SPUR_FRACTION * long));
    while (!silhouette.closed && bridges < MAX_BRIDGES) {
      const bridged = bridgeNearestEnds(ink, w, h, spur);
      if (!bridged) break;
      ink = bridged;
      bridges++;
      silhouette = buildSilhouette(ink, w, h, radii);
    }
    // No loose ends to join either: there is no loop to close, so there is no drawing.
    if (!silhouette.closed) {
      return { ...EMPTY, ok: false, problem: 'blank', closeRadius: silhouette.closeRadius };
    }

    // Blur the filled shape and trace where it crosses one half: smooth, sub-pixel contours.
    const sigma = 0.6 + (params.smoothness / 100) * 0.012 * long;
    const field = gaussianBlur(Float32Array.from(silhouette.mask), w, h, sigma);
    const loops = contourLoops(field, w, h, 0.5);
    let loop: Vec2[] | null = null;
    let loopArea = 0;
    for (const candidate of loops) {
      const area = Math.abs(signedArea(candidate));
      if (area > loopArea) {
        loopArea = area;
        loop = candidate;
      }
    }
    if (!loop)
      return { ...EMPTY, ok: false, problem: 'blank', closeRadius: silhouette.closeRadius };

    const outlinePx = simplifyClosed(loop, 0.25);
    if (loopArea < MIN_SHAPE_FRACTION * n) {
      return {
        ...EMPTY,
        ok: false,
        problem: 'tiny',
        outlinePx,
        closeRadius: silhouette.closeRadius,
      };
    }

    const fit = fitToPlate(outlinePx, maxSizeMm);
    const outlineMm = resampleClosed(fit.points, OUTLINE_SPACING_MM);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of outlineMm) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    return {
      ok: true,
      problem: null,
      outlinePx,
      outlineMm,
      widthMm: maxX - minX,
      heightMm: maxY - minY,
      closeRadius: silhouette.closeRadius,
      bridges,
    };
  }
}

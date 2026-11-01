/** Bambu Lab A1 mini constants. All lengths in millimetres. The only place these live. */
export const A1_MINI = {
  /** Build volume (W × D × H). */
  buildVolume: { x: 180, y: 180, z: 180 },
  /** Stock nozzle diameter. */
  nozzleDiameter: 0.4,
  /** Default layer height; first layer uses the same value. */
  layerHeight: 0.2,
  /** Margin kept free on every side of the plate by default. */
  plateMargin: 5,
} as const;

/** Puzzle thickness required by the product (15 layers at 0.2 mm). */
export const PUZZLE_THICKNESS_MM = 3;

/** Largest square the assembled puzzle may occupy by default. */
export function usablePlateSize(margin: number = A1_MINI.plateMargin): number {
  const side = Math.min(A1_MINI.buildVolume.x, A1_MINI.buildVolume.y) - 2 * margin;
  return Math.max(0, side);
}

/**
 * Engraving a drawing's inner lines into the top of a piece (M18, docs/DECISIONS.md D-053). These
 * are starting guesses until `docs/spikes/engrave-test.stl` has been printed on the A1 mini.
 */
export const ENGRAVE = {
  /** Width every groove is made, whatever the pen was after the drawing was scaled up (mm). */
  widthMm: 1.2,
  /** Narrowest groove or sliver of top face left standing: two nozzle widths (mm). */
  minWidthMm: 0.8,
  /** Depth of a groove: three layers, and the least and most allowed (mm). */
  depthMm: 0.6,
  minDepthMm: 0.4,
  maxDepthMm: 1.0,
  /** How far a groove keeps from a piece's edge (so from tabs and cuts) and from a magnet pocket (mm). */
  edgeMarginMm: 0.8,
  pocketMarginMm: 0.8,
  /**
   * Smaller marks than this are specks and are dropped (mm squared). A round dot (an eye) made one
   * groove wide is about 1.1, so this stays well under that.
   */
  minAreaMm2: 0.6,
  /** A mark counts as inside the drawing this many pen widths in from the outline's edge. */
  penMargin: 1.25,
} as const;

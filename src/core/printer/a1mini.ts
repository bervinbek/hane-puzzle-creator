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

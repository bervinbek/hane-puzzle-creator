/**
 * Measurements and motion limits of the printer model. All lengths are millimetres in the core's
 * convention: x to the right, y to the back, z up, with the origin at the middle of the build
 * plate's top surface when the bed is centred. See docs/PRINTER_MODEL.md for where these come from.
 */

export interface Pose {
  /** Nozzle position over the plate, in plate coordinates (0 = plate centre). */
  x: number;
  y: number;
  /** Nozzle height above the plate's top surface. */
  z: number;
}

/** Published outside size of the A1 mini (Bambu Lab store listing), used to check the model. */
export const OVERALL_SIZE = { x: 347, y: 315, z: 365 } as const;

export const PLATE_SIZE_MM = 180;

/**
 * How far each axis may move. The toolhead stops just short of the column's carriage on the
 * right and of the arm's end bracket on the left, so it can reach nearly all of the plate.
 */
export const LIMITS = {
  x: [-96, 90],
  y: [-100, 100],
  z: [0, 180],
} as const;

/** Where the toolhead waits when nothing is printing: raised, beside the column. */
export const PARK_POSE: Pose = { x: 88, y: 0, z: 150 };

/** Pose used when checking the model's outside size. */
export const HOME_POSE: Pose = { x: 0, y: 0, z: 0 };

const clamp = (v: number, [lo, hi]: readonly [number, number]): number =>
  Math.min(hi, Math.max(lo, v));

/** Keeps a pose inside what the machine can reach. */
export function clampPose(p: Pose): Pose {
  return { x: clamp(p.x, LIMITS.x), y: clamp(p.y, LIMITS.y), z: clamp(p.z, LIMITS.z) };
}

/**
 * The bed is what moves in y: to put the nozzle over plate point `y`, the bed slides the opposite
 * way. Returns the bed's offset from its centred position.
 */
export function bedOffsetY(poseY: number): number {
  return -clamp(poseY, LIMITS.y);
}

/** Positions of the main parts, so the model and its tests agree on them. */
export const LAYOUT = {
  /** Main body of the base, and the lower block at the front right that carries the screen. */
  base: { x: [-112, 192], y: [-125, 130], z: [-85, -30] },
  frontBlock: { x: [10, 192], y: [-185, -112], z: [-85, -48] },
  feetZ: [-88, -85],
  carriage: { half: 75, z: [-30, -14] },
  heatbedZ: [-11.5, -1.5],
  peiZ: [-1.5, 0],
  column: { x: [130, 180], y: [28, 80], z: [-30, 247] },
  /** Dark housing on top of the column. */
  cap: { x: [127, 183], y: [24, 86], z: [247, 277] },
  /** Gantry parts, relative to the nozzle tip (z = 0). */
  carriageBlock: { x: [122, 197], y: [22, 92], z: [10, 64] },
  arm: { x: [-140, 125], y: [30, 56], z: [26, 54] },
  endBracket: { x: [-151, -129], y: [30, 58], z: [4, 54] },
  endModule: { x: [-151, -125], y: [26, 50], z: [-2, 14] },
  /** Toolhead parts, relative to the nozzle tip and to the toolhead's own x. */
  head: { x: [-30, 30], y: [-20, 30], z: [20, 100] },
  sideModule: { x: [30, 42], y: [-6, 18], z: [44, 92] },
  fanDuct: { x: [-22, 22], y: [-19, 19], z: [4, 20] },
  nozzleHeight: 5,
} as const;

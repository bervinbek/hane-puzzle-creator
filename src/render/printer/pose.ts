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

/** How far each axis may move. Slightly past the plate edge in x and y, as the real machine can. */
export const LIMITS = {
  x: [-100, 118],
  y: [-100, 100],
  z: [0, 180],
} as const;

/** Where the toolhead waits when nothing is printing: clear of the plate, raised. */
export const PARK_POSE: Pose = { x: 116, y: 0, z: 150 };

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
  base: { x: [-125, 196], y: [-185, 130], z: [-85, -30] },
  feetZ: [-88, -85],
  carriage: { half: 75, z: [-30, -14] },
  heatbedZ: [-11.5, -1.5],
  peiZ: [-1.5, 0],
  column: { x: [150, 190], y: [30, 82], z: [-30, 259] },
  cap: { z: [259, 277] },
  /** Gantry parts, relative to the nozzle tip (z = 0). */
  arm: { x: [-140, 150], y: [30, 56], z: [26, 54] },
  carriageBlock: { x: [146, 194], y: [26, 86], z: [14, 66] },
  endBracket: { x: [-151, -129], y: [30, 58], z: [4, 54] },
  /** Toolhead parts, relative to the nozzle tip and to the toolhead's own x. */
  head: { x: [-25, 25], y: [-18, 28], z: [16, 72] },
  fanDuct: { x: [-19, 19], y: [-17, 17], z: [5, 17] },
  nozzleHeight: 5,
  /** Gap kept between the arm and anything the bed carries, as a sanity margin. */
  clearanceAboveBed: 20,
} as const;

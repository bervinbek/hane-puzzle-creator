import type { Vec2 } from '../geometry/polygon';

/** Size of the sample fish's coordinate space (arbitrary units; scaled to mm later). */
export const FISH_SIZE = { width: 240, height: 160 } as const;

/** Where the eye goes on the sample fish. */
export const FISH_EYE: Vec2 = [56, 68];

type Cubic = readonly [Vec2, Vec2, Vec2, Vec2];

/** Points along a cubic Bezier, excluding the start point and including the end point. */
function sampleCubic([p0, p1, p2, p3]: Cubic, steps: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ]);
  }
  return out;
}

/** A simple fish silhouette (nose, back, tail, belly) used for the built-in example. */
export const FISH_OUTLINE: readonly Vec2[] = [
  [20, 80],
  ...sampleCubic(
    [
      [20, 80],
      [50, 20],
      [150, 10],
      [190, 60],
    ],
    16,
  ),
  [232, 30],
  [224, 80],
  [232, 130],
  [190, 100],
  ...sampleCubic(
    [
      [190, 100],
      [150, 150],
      [50, 140],
      [20, 80],
    ],
    16,
  ).slice(0, -1),
];

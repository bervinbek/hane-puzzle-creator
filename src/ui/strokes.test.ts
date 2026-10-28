import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../core/geometry/polygon';
import { MIN_STEP, PEN_WIDTH, addPoint, smoothStroke } from './strokes';

describe('addPoint', () => {
  it('keeps points that are far enough apart and skips the ones on top of each other', () => {
    const points: Vec2[] = [];
    expect(addPoint(points, [0, 0])).toBe(true);
    expect(addPoint(points, [0.5, 0.5])).toBe(false);
    expect(addPoint(points, [MIN_STEP, 0])).toBe(true);
    expect(points).toEqual([
      [0, 0],
      [MIN_STEP, 0],
    ]);
  });
});

describe('smoothStroke', () => {
  const wiggle: Vec2[] = [
    [0, 0],
    [10, 8],
    [20, -4],
    [30, 6],
    [40, 0],
  ];

  it('draws nothing for a single dot', () => {
    expect(smoothStroke([[5, 5]])).toEqual({ start: [5, 5], steps: [] });
  });

  it('starts at the first point and ends exactly at the last', () => {
    const { start, steps } = smoothStroke(wiggle);
    expect(start).toEqual([0, 0]);
    expect(steps.at(-1)!.to).toEqual([40, 0]);
  });

  it('draws a straight line for two points', () => {
    const { steps } = smoothStroke([
      [0, 0],
      [10, 0],
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.control[1]).toBe(0);
    expect(steps[0]!.to).toEqual([10, 0]);
  });

  it('stays inside the box around the points, so smoothing never overshoots', () => {
    const { steps } = smoothStroke(wiggle);
    for (const s of steps) {
      for (const [x, y] of [s.control, s.to]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(40);
        expect(y).toBeGreaterThanOrEqual(-4);
        expect(y).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('pens', () => {
  it('get thicker from thin to thick', () => {
    expect(PEN_WIDTH.thin).toBeLessThan(PEN_WIDTH.medium);
    expect(PEN_WIDTH.medium).toBeLessThan(PEN_WIDTH.thick);
  });
});

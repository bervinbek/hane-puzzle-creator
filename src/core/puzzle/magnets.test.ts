import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/polygon';
import { DEFAULT_MAGNET, MAGNET, magnetPocket, pocketDepth } from './magnets';

const rect = (w: number, h: number): Vec2[] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];

describe('magnetPocket', () => {
  it('puts a pocket in the middle of a roomy piece, a little wider and deeper than the magnet', () => {
    const p = magnetPocket(rect(30, 20), DEFAULT_MAGNET)!;
    expect(p.y).toBeCloseTo(10, 0);
    expect(p.radius * 2).toBeCloseTo(MAGNET.diameterMm + DEFAULT_MAGNET.fit, 9);
    expect(p.depth).toBeCloseTo(pocketDepth(DEFAULT_MAGNET), 9);
    expect(p.depth).toBeGreaterThan(MAGNET.thicknessMm);
  });

  it('leaves at least the minimum wall all round', () => {
    const p = magnetPocket(rect(30, 20), DEFAULT_MAGNET)!;
    const gap = Math.min(p.x, 30 - p.x, p.y, 20 - p.y) - p.radius;
    expect(gap).toBeGreaterThanOrEqual(DEFAULT_MAGNET.minWall);
  });

  it('says no when the piece is too small, and yes just above that', () => {
    const need = (MAGNET.diameterMm + DEFAULT_MAGNET.fit) / 2 + DEFAULT_MAGNET.minWall;
    expect(magnetPocket(rect(2 * need - 0.5, 40), DEFAULT_MAGNET)).toBeNull();
    expect(magnetPocket(rect(2 * need + 0.5, 40), DEFAULT_MAGNET)).not.toBeNull();
  });

  it('gets a wider pocket with a looser fit', () => {
    const tight = magnetPocket(rect(30, 30), { ...DEFAULT_MAGNET, fit: 0.1 })!;
    const loose = magnetPocket(rect(30, 30), { ...DEFAULT_MAGNET, fit: 0.4 })!;
    expect(loose.radius).toBeGreaterThan(tight.radius);
  });
});

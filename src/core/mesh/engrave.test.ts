import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/polygon';
import { extrudeEngraved } from './engrave';
import { checkMesh } from './extrude';

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const circle = (cx: number, cy: number, r: number, n = 32): Vec2[] =>
  Array.from({ length: n }, (_, i): Vec2 => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
const area = (p: readonly Vec2[]): number => {
  let sum = 0;
  p.forEach(([x, y], i) => {
    const [nx, ny] = p[(i + 1) % p.length]!;
    sum += x * ny - nx * y;
  });
  return Math.abs(sum) / 2;
};

describe('extrudeEngraved', () => {
  const slab = rect(0, 0, 40, 30);

  it('is a closed solid with no grooves', () => {
    const c = checkMesh(extrudeEngraved(slab, 3, [], 0.6));
    expect(c.watertight).toBe(true);
    expect(c.volume).toBeCloseTo(40 * 30 * 3, 3);
  });

  it('cuts a groove: closed, and the volume loses exactly the groove', () => {
    const c = checkMesh(extrudeEngraved(slab, 3, [rect(5, 10, 35, 12)], 0.6));
    expect(c.watertight).toBe(true);
    expect(c.volume).toBeCloseTo(40 * 30 * 3 - 30 * 2 * 0.6, 3);
  });

  it('keeps an island standing inside a ring-shaped groove', () => {
    const outer = circle(20, 15, 8);
    const island = circle(20, 15, 4);
    const c = checkMesh(extrudeEngraved(slab, 3, [outer, island], 0.4));
    expect(c.watertight).toBe(true);
    expect(c.volume).toBeCloseTo(40 * 30 * 3 - (area(outer) - area(island)) * 0.4, 3);
  });

  it('copes with a groove inside an island inside a groove', () => {
    const rings = [circle(20, 15, 12), circle(20, 15, 8), circle(20, 15, 4)];
    const c = checkMesh(extrudeEngraved(slab, 3, rings, 0.6));
    expect(c.watertight).toBe(true);
    const cut = area(rings[0]!) - area(rings[1]!) + area(rings[2]!);
    expect(c.volume).toBeCloseTo(40 * 30 * 3 - cut * 0.6, 3);
  });

  it('does not care which way round the rings are listed', () => {
    const mesh = extrudeEngraved(slab.slice().reverse(), 3, [rect(5, 10, 35, 12).reverse()], 0.6);
    expect(checkMesh(mesh).watertight).toBe(true);
  });

  it('puts the groove floor at the depth asked for and nothing above the piece', () => {
    const mesh = extrudeEngraved(slab, 3, [rect(5, 10, 35, 12)], 0.8);
    const heights = new Set<number>();
    for (let i = 2; i < mesh.positions.length; i += 3) {
      heights.add(Math.round(mesh.positions[i]! * 1000) / 1000);
    }
    expect([...heights].sort()).toEqual([0, 2.2, 3]);
  });

  it('refuses a groove that would leave the slab too thin', () => {
    expect(() => extrudeEngraved(slab, 3, [rect(5, 10, 35, 12)], 2)).toThrow();
    expect(() => extrudeEngraved(slab, 3, [rect(5, 10, 35, 12)], 0)).toThrow();
  });
});

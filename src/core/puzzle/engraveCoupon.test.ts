import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bounds } from '../geometry/polygon';
import { checkMesh } from '../mesh/extrude';
import { A1_MINI } from '../printer/a1mini';
import {
  COUPON_DEPTHS,
  COUPON_WIDTHS,
  engraveCouponMeshes,
  engraveCouponStl,
  engraveCouponTiles,
} from './engraveCoupon';

describe('the engraving test print', () => {
  it('has a slab for each depth and a face', () => {
    expect(engraveCouponTiles()).toHaveLength(COUPON_DEPTHS.length + 1);
    expect(engraveCouponTiles()[0]!.grooves).toHaveLength(COUPON_WIDTHS.length);
  });

  it('makes every slab a closed solid', () => {
    for (const mesh of engraveCouponMeshes()) expect(checkMesh(mesh).watertight).toBe(true);
  });

  it('keeps every groove at least 2.5 mm from the edge of its slab', () => {
    for (const { slab, grooves } of engraveCouponTiles()) {
      const s = bounds(slab);
      for (const g of grooves) {
        const b = bounds(g);
        expect(b.minX - s.minX).toBeGreaterThanOrEqual(2.5);
        expect(s.maxX - b.maxX).toBeGreaterThanOrEqual(2.5);
        expect(b.minY - s.minY).toBeGreaterThanOrEqual(2.5);
        expect(s.maxY - b.maxY).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it('fits the plate', () => {
    const stl = engraveCouponStl();
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    const triangles = view.getUint32(80, true);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let t = 0; t < triangles; t++) {
      for (let v = 0; v < 3; v++) {
        const at = 84 + t * 50 + 12 + v * 12;
        minX = Math.min(minX, view.getFloat32(at, true));
        maxX = Math.max(maxX, view.getFloat32(at, true));
        maxZ = Math.max(maxZ, view.getFloat32(at + 8, true));
      }
    }
    expect(maxX - minX).toBeLessThan(A1_MINI.buildVolume.x - 2 * A1_MINI.plateMargin);
    expect(maxZ).toBeCloseTo(3, 6);
  });

  it('is the same bytes every time', () => {
    expect(Buffer.from(engraveCouponStl()).equals(Buffer.from(engraveCouponStl()))).toBe(true);
  });

  // Run with WRITE_ENGRAVE_TEST=1 to write the file to print (docs/spikes/engrave-test.stl).
  it.runIf(process.env.WRITE_ENGRAVE_TEST === '1')('writes the file to print', () => {
    mkdirSync('docs/spikes', { recursive: true });
    writeFileSync('docs/spikes/engrave-test.stl', engraveCouponStl());
  });
});

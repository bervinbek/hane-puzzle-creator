import { describe, expect, it } from 'vitest';
import type { Poly } from '../src/core/geometry/clip';
import { isSimple, type Vec2 } from '../src/core/geometry/polygon';
import { signedArea } from '../src/core/geometry/polyline';
import { checkMesh, extrudePolygon } from '../src/core/mesh/extrude';
import { usablePlateSize } from '../src/core/printer/a1mini';
import {
  COUPON_GAPS,
  COUPON_HEIGHT,
  COUPON_WIDTH,
  couponInstructions,
  couponOutline,
  toleranceCoupons,
  toleranceStl,
} from '../src/core/puzzle/coupon';
import { DEFAULT_TEACHER, teacherParams } from '../src/core/puzzle/settings';

/** Shortest distance from any corner of one piece to the other piece's outline, and back. */
function gapBetween(a: Poly, b: Poly): number {
  const toSegment = (p: Vec2, s: Vec2, e: Vec2): number => {
    const dx = e[0] - s[0];
    const dy = e[1] - s[1];
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(p[0] - (s[0] + t * dx), p[1] - (s[1] + t * dy));
  };
  const oneWay = (from: Poly, to: Poly): number => {
    let best = Infinity;
    for (const p of from) {
      for (let i = 0; i < to.length; i++)
        best = Math.min(best, toSegment(p, to[i]!, to[(i + 1) % to.length]!));
    }
    return best;
  };
  return Math.min(oneWay(a, b), oneWay(b, a));
}

describe('tolerance coupons', () => {
  const { coupons, combined } = toleranceCoupons();

  it('are three little two-piece puzzles with gaps of 0.20, 0.30 and 0.40 mm', () => {
    expect(coupons.map((c) => c.gap)).toEqual([...COUPON_GAPS]);
    expect(coupons.map((c) => c.notches)).toEqual([1, 2, 3]);
    for (const c of coupons) {
      expect(c.puzzle.pieces).toHaveLength(2);
      const errors = c.puzzle.issues.filter((i) => i.severity === 'error');
      expect(errors, errors.map((e) => e.message).join('; ')).toEqual([]);
      expect(c.puzzle.tabCount).toBeGreaterThanOrEqual(1);
    }
    expect(combined.pieces).toHaveLength(6);
    expect(combined.ok).toBe(true);
  });

  it('really have the gap they say between their two pieces', () => {
    for (const c of coupons) {
      const [a, b] = c.puzzle.pieces;
      expect(gapBetween(a!.polygon, b!.polygon)).toBeCloseTo(c.gap, 1);
      expect(Math.abs(gapBetween(a!.polygon, b!.polygon) - c.gap)).toBeLessThan(0.02);
    }
  });

  it('say which is which with notches in the edge of one piece', () => {
    const lengths = [1, 2, 3].map((k) => couponOutline(k).length);
    // Four corners, and nine points for each notch.
    expect(lengths).toEqual([13, 22, 31]);
    // Every notch takes a bite out of the outline, so more notches mean less area.
    const areas = [0, 1, 2, 3].map((k) => signedArea(couponOutline(k)));
    expect(areas[0]).toBeCloseTo(COUPON_WIDTH * COUPON_HEIGHT, 6);
    for (let k = 1; k <= 3; k++) {
      expect(areas[k - 1]! - areas[k]!).toBeGreaterThan(3.5);
      expect(areas[k - 1]! - areas[k]!).toBeLessThan(4.5);
      expect(isSimple(couponOutline(k))).toBe(true);
    }
  });

  it('sit side by side on the plate with room round them', () => {
    const xs = combined.pieces.flatMap((p) => p.polygon.map(([x]) => x));
    const ys = combined.pieces.flatMap((p) => p.polygon.map(([, y]) => y));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(usablePlateSize());
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(COUPON_HEIGHT + 0.1);
  });

  it('print as closed solids, and are the same file every time', () => {
    for (const piece of combined.pieces) {
      const check = checkMesh(extrudePolygon(piece.polygon, 3));
      expect(check.watertight).toBe(true);
    }
    expect(Buffer.from(toleranceStl()).equals(Buffer.from(toleranceStl()))).toBe(true);
  });

  it('use the tab amount the teacher has chosen', () => {
    const standard = toleranceCoupons(teacherParams(DEFAULT_TEACHER).tabs).combined.tabCount;
    const more = toleranceCoupons(teacherParams({ ...DEFAULT_TEACHER, tabAmount: 'more' }).tabs)
      .combined.tabCount;
    expect(more).toBeGreaterThanOrEqual(standard);
  });

  it('come with instructions that name every gap', () => {
    const text = couponInstructions();
    for (const gap of ['0.20', '0.30', '0.40']) expect(text).toContain(gap);
    expect(text).toContain('Teacher options');
  });
});

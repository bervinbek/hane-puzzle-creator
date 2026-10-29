import { describe, expect, it } from 'vitest';
import { bridgeNearestEnds, skeletonEnds, thin } from '../src/core/image/bridge';

const W = 120;
const H = 100;

/** A ring of thick line (about 7 px) with a gap, as a 0/1 mask. */
function ring(gapDegrees: number): Uint8Array {
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - 60;
      const dy = y - 50;
      const d = Math.hypot(dx, dy);
      if (Math.abs(d - 35) > 3.5) continue;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (gapDegrees > 0 && Math.abs(angle) < gapDegrees / 2) continue;
      mask[y * W + x] = 1;
    }
  }
  return mask;
}

const count = (m: Uint8Array): number => m.reduce((a, v) => a + v, 0);

describe('thin', () => {
  it('leaves a line about one pixel wide, inside the original', () => {
    const mask = ring(0);
    const skeleton = thin(mask, W, H);
    expect(count(skeleton)).toBeGreaterThan(100);
    expect(count(skeleton)).toBeLessThan(count(mask) / 4);
    for (let i = 0; i < mask.length; i++) if (skeleton[i]) expect(mask[i]).toBe(1);
  });

  it('does not change the mask it was given', () => {
    const mask = ring(40);
    const before = Uint8Array.from(mask);
    thin(mask, W, H);
    expect(Array.from(mask)).toEqual(Array.from(before));
  });
});

describe('skeletonEnds', () => {
  it('finds none on a closed ring and two on a ring with a gap', () => {
    expect(skeletonEnds(thin(ring(0), W, H), W, H, 3)).toHaveLength(0);
    expect(skeletonEnds(thin(ring(40), W, H), W, H, 3)).toHaveLength(2);
  });
});

describe('bridgeNearestEnds', () => {
  it('adds a bridge across the gap that closes the ring', () => {
    const open = ring(60);
    const bridged = bridgeNearestEnds(open, W, H, 3)!;
    expect(bridged).not.toBeNull();
    expect(count(bridged)).toBeGreaterThan(count(open));
    // Closed now: no loose ends are left to find.
    expect(skeletonEnds(thin(bridged, W, H), W, H, 3)).toHaveLength(0);
    // Nothing was taken away.
    for (let i = 0; i < open.length; i++) if (open[i]) expect(bridged[i]).toBe(1);
  });

  it('gives nothing when there is no loose end, and never changes its input', () => {
    const closed = ring(0);
    const before = Uint8Array.from(closed);
    expect(bridgeNearestEnds(closed, W, H, 3)).toBeNull();
    expect(Array.from(closed)).toEqual(Array.from(before));
  });

  it('is the same every time', () => {
    const a = bridgeNearestEnds(ring(60), W, H, 3)!;
    const b = bridgeNearestEnds(ring(60), W, H, 3)!;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

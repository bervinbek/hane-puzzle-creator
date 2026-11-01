import { describe, expect, it } from 'vitest';
import { DRAWN_TIDY, OutlineExtractor } from '../src/core/outline';
import { SAMPLES } from '../src/ui/testSamples';

/** TEMPORARY, with src/ui/testSamples.ts: every example is traced whole, tail and all. */
const SIZE = 800;
const PEN = 10;

function paint(strokes: readonly (readonly (readonly [number, number])[])[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4).fill(255);
  for (const stroke of strokes) {
    for (let i = 0; i < Math.max(1, stroke.length - 1); i++) {
      const a = stroke[i]!;
      const b = stroke[Math.min(i + 1, stroke.length - 1)]!;
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy || 1;
      for (
        let y = Math.max(0, Math.floor(Math.min(a[1], b[1]) - PEN));
        y <= Math.min(SIZE - 1, Math.ceil(Math.max(a[1], b[1]) + PEN));
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(Math.min(a[0], b[0]) - PEN));
          x <= Math.min(SIZE - 1, Math.ceil(Math.max(a[0], b[0]) + PEN));
          x++
        ) {
          const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / len2));
          if (Math.hypot(x - (a[0] + t * vx), y - (a[1] + t * vy)) <= PEN / 2) {
            const at = (y * SIZE + x) * 4;
            data[at] = data[at + 1] = data[at + 2] = 0;
          }
        }
      }
    }
  }
  return data;
}

describe('the example drawings', () => {
  for (const sample of SAMPLES) {
    it(`${sample.name}: the outline reaches the outermost stroke`, () => {
      const data = paint(sample.strokes);
      const result = new OutlineExtractor({ width: SIZE, height: SIZE, data }, PEN).run(DRAWN_TIDY);
      expect(result.ok).toBe(true);
      // The first stroke is the body; the outline must also reach any stroke that sticks out of it
      // (the bunny's tail), so it is as wide as the whole drawing.
      let maxX = 0;
      for (const stroke of sample.strokes) for (const [x] of stroke) maxX = Math.max(maxX, x);
      const xs = result.outlinePx.map(([x]) => x);
      expect(Math.max(...xs)).toBeGreaterThan(maxX - 2 * PEN);
    });
  }
});

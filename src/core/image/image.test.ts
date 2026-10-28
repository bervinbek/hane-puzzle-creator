import { describe, expect, it } from 'vitest';
import { gaussianBlur } from './blur';
import { squaredEdt } from './edt';
import { floodExterior, keepLargest, labelComponents, removeSmall } from './morphology';
import { otsu } from './threshold';

describe('gaussianBlur', () => {
  it('keeps a flat image flat and spreads a spike without losing mass', () => {
    const w = 31;
    const h = 31;
    const flat = new Float32Array(w * h).fill(0.7);
    for (const v of gaussianBlur(flat, w, h, 3)) expect(v).toBeCloseTo(0.7, 4);

    const spike = new Float32Array(w * h);
    spike[15 * w + 15] = 100;
    const blurred = gaussianBlur(spike, w, h, 2);
    expect(blurred[15 * w + 15]).toBeLessThan(100);
    expect(blurred.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });
});

describe('squaredEdt', () => {
  it('gives exact squared distances to the nearest feature pixel', () => {
    const w = 9;
    const h = 7;
    const feature = new Uint8Array(w * h);
    feature[3 * w + 4] = 1;
    const d = squaredEdt(feature, w, h);
    expect(d[3 * w + 4]).toBe(0);
    expect(d[3 * w + 7]).toBe(9);
    expect(d[0]).toBe(4 * 4 + 3 * 3);
  });
});

describe('morphology', () => {
  // 7x5 picture: a ring of blocked pixels with one pixel inside, and one stray pixel.
  const w = 7;
  const h = 5;
  const ring = new Uint8Array(w * h);
  for (let x = 1; x <= 5; x++) for (const y of [0, 2]) ring[y * w + x] = 1;
  ring[1 * w + 1] = 1;
  ring[1 * w + 5] = 1;

  it('flood fill stops at the ring and leaves the inside unreached', () => {
    const outside = floodExterior(ring, w, h);
    expect(outside[1 * w + 3]).toBe(0);
    expect(outside[4 * w + 3]).toBe(1);
  });

  it('labels components, keeps the largest and drops specks', () => {
    const mask = new Uint8Array(w * h);
    for (let x = 0; x < 5; x++) mask[x] = 1;
    mask[4 * w + 6] = 1;
    expect(labelComponents(mask, w, h).areas.slice(1)).toEqual([5, 1]);
    expect(keepLargest(mask, w, h).reduce((a, b) => a + b, 0)).toBe(5);
    expect(removeSmall(mask, w, h, 2).reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('otsu', () => {
  it('splits two brightness groups between them', () => {
    const v = new Float32Array(200);
    for (let i = 0; i < 200; i++) v[i] = i < 40 ? 0.2 : 0.95;
    const t = otsu(v);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.95);
  });
});

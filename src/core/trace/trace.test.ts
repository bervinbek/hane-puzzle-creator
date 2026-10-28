import { describe, expect, it } from 'vitest';
import { isSimple } from '../geometry/polygon';
import { resampleClosed, signedArea, simplifyClosed, fitToPlate } from '../geometry/polyline';
import { contourLoops } from './contour';

describe('contourLoops', () => {
  it('traces one closed loop around a filled square with the right area', () => {
    const w = 20;
    const h = 20;
    const field = new Float32Array(w * h);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) field[y * w + x] = 1;
    const loops = contourLoops(field, w, h, 0.5);
    expect(loops).toHaveLength(1);
    expect(Math.abs(Math.abs(signedArea(loops[0]!)) - 100)).toBeLessThan(1);
    expect(isSimple(loops[0]!)).toBe(true);
  });

  it('finds separate loops for separate shapes and for holes', () => {
    const w = 30;
    const h = 12;
    const field = new Float32Array(w * h);
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) field[y * w + x] = 1;
    field[5 * w + 5] = 0; // a hole
    for (let y = 3; y < 8; y++) for (let x = 18; x < 26; x++) field[y * w + x] = 1;
    expect(contourLoops(field, w, h, 0.5)).toHaveLength(3);
  });
});

describe('polyline helpers', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('simplifies away collinear points but keeps corners', () => {
    const dense: [number, number][] = [];
    for (let i = 0; i < 10; i++) dense.push([i, 0]);
    for (let i = 0; i < 10; i++) dense.push([10, i]);
    for (let i = 0; i < 10; i++) dense.push([10 - i, 10]);
    for (let i = 0; i < 10; i++) dense.push([0, 10 - i]);
    const simple = simplifyClosed(dense, 0.1);
    expect(simple.length).toBeLessThanOrEqual(8);
    expect(Math.abs(signedArea(simple))).toBeCloseTo(100, 0);
  });

  it('resamples evenly around the whole loop', () => {
    const pts = resampleClosed(square, 1);
    expect(pts).toHaveLength(40);
    expect(Math.abs(signedArea(pts))).toBeCloseTo(100, 0);
  });

  it('fits to the plate, centred, y up, counter-clockwise', () => {
    // A picture-space (y down) shape whose apex is at the top.
    const tri: [number, number][] = [
      [50, 0],
      [100, 100],
      [0, 100],
    ];
    const fit = fitToPlate(tri, 170);
    expect(signedArea(fit.points)).toBeGreaterThan(0);
    const ys = fit.points.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(170, 5);
    expect(fit.toMm([50, 0])[1]).toBeCloseTo(85, 5);
  });
});

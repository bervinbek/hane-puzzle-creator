import { describe, expect, it } from 'vitest';
import type { Poly } from '../src/core/geometry/clip';
import { pointInPolygon } from '../src/core/geometry/polygon';
import { fitToPlate } from '../src/core/geometry/polyline';
import { MOVE, MOVE_STRIDE, buildToolpath, stateAt } from '../src/core/printer/toolpath';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import { FISH_OUTLINE } from '../src/core/samples/fish';
import { spiderAt } from './fixtures/synth';

const fish = fitToPlate([...FISH_OUTLINE], 170).points;
const spider = fitToPlate(spiderAt(225, 169, 55), 170).points;
const puzzleOf = (outline: Poly, count: number) =>
  generatePuzzle(outline, { ...DEFAULT_PUZZLE, count, seed: 1 });

describe('toolpath for the fish in 12 pieces', () => {
  const puzzle = puzzleOf(fish, 12);
  const path = buildToolpath(puzzle);

  it('has 15 layers of 0.2 mm, so the top is 3 mm', () => {
    expect(path.layers).toHaveLength(15);
    expect(path.layers[0]!.zTop).toBeCloseTo(0.2, 9);
    expect(path.layers[14]!.zTop).toBeCloseTo(3, 9);
  });

  it('only lays plastic down inside the pieces', () => {
    const polygons = puzzle.pieces.map((p) => p.polygon);
    const inside = (x: number, y: number): boolean =>
      polygons.some((poly) => pointInPolygon(x, y, poly));
    let checked = 0;
    for (const layer of path.layers) {
      for (let i = 0; i < layer.moves.length; i += MOVE_STRIDE) {
        if (layer.moves[i + 4] === MOVE.TRAVEL) continue;
        const [x0, y0, x1, y1] = [
          layer.moves[i]!,
          layer.moves[i + 1]!,
          layer.moves[i + 2]!,
          layer.moves[i + 3]!,
        ];
        expect(
          inside(x0, y0) && inside(x1, y1),
          `layer ${layer.index} move ${i / MOVE_STRIDE}`,
        ).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('covers the pieces with about as much plastic as their area', () => {
    const area = puzzle.pieces.reduce((s, p) => s + p.areaMm2, 0);
    for (const layer of path.layers) {
      const laid = layer.extrudedMm * path.lineWidth;
      expect(laid / area).toBeGreaterThan(0.85);
      expect(laid / area).toBeLessThan(1.15);
    }
  });

  it('is continuous: every move starts where the last one ended', () => {
    let x = 0;
    let y = 0;
    for (const layer of path.layers) {
      for (let i = 0; i < layer.moves.length; i += MOVE_STRIDE) {
        expect(Math.hypot(layer.moves[i]! - x, layer.moves[i + 1]! - y)).toBeLessThan(1e-3);
        x = layer.moves[i + 2]!;
        y = layer.moves[i + 3]!;
      }
    }
  });

  it('turns the fill 90 degrees from one layer to the next', () => {
    // Fill at +45 and -45 degrees has opposite sin(2 angle), so the sign flips each layer.
    const turn = (k: number): number => {
      const layer = path.layers[k]!;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < layer.moves.length; i += MOVE_STRIDE) {
        if (layer.moves[i + 4] !== MOVE.INFILL) continue;
        const dx = layer.moves[i + 2]! - layer.moves[i]!;
        const dy = layer.moves[i + 3]! - layer.moves[i + 1]!;
        if (Math.hypot(dx, dy) < 2) continue;
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI;
        sum += Math.sin(2 * angle);
        count++;
      }
      return sum / count;
    };
    expect(turn(0) * turn(1)).toBeLessThan(0);
    expect(turn(0) * turn(2)).toBeGreaterThan(0);
  });

  it('takes a believable time, and the first layer is the slowest', () => {
    expect(path.totalSeconds).toBeGreaterThan(900);
    expect(path.totalSeconds).toBeLessThan(5400);
    expect(path.layers[0]!.seconds).toBeGreaterThan(path.layers[1]!.seconds);
  });
});

describe('stateAt', () => {
  const path = buildToolpath(puzzleOf(fish, 6));

  it('starts at the first layer and ends at the last', () => {
    expect(stateAt(path, 0).layer).toBe(0);
    expect(stateAt(path, path.totalSeconds).layer).toBe(14);
    expect(stateAt(path, 1e9).layer).toBe(14);
    expect(stateAt(path, -5).layer).toBe(0);
  });

  it('moves up layer by layer and keeps the nozzle on the latest layer', () => {
    let last = -1;
    for (let t = 0; t <= path.totalSeconds; t += path.totalSeconds / 400) {
      const s = stateAt(path, t);
      expect(s.layer).toBeGreaterThanOrEqual(last);
      expect(s.z).toBeCloseTo((s.layer + 1) * 0.2, 9);
      last = s.layer;
    }
  });

  it('is extruding for most of the print and counts plastic as it goes', () => {
    let extruding = 0;
    let samples = 0;
    let previous = -1;
    for (let t = 1; t < path.totalSeconds; t += path.totalSeconds / 300) {
      const s = stateAt(path, t);
      samples++;
      if (s.extruding) extruding++;
      expect(s.extrudedMm).toBeGreaterThanOrEqual(previous);
      previous = s.extrudedMm;
    }
    expect(extruding / samples).toBeGreaterThan(0.6);
    expect(previous).toBeGreaterThan(path.totalExtrudedMm * 0.9);
  });
});

describe('other shapes and speed', () => {
  it('builds a toolpath for the thin-legged shape', () => {
    const puzzle = puzzleOf(spider, 8);
    const path = buildToolpath(puzzle);
    expect(path.layers).toHaveLength(15);
    expect(path.totalExtrudedMm).toBeGreaterThan(1000);
  });

  it('builds quickly enough to start a watch-it-print preview', () => {
    const puzzle = puzzleOf(fish, 24);
    const t0 = performance.now();
    buildToolpath(puzzle);
    const ms = performance.now() - t0;
    console.log(`toolpath for 24 pieces: ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(5000);
  });
});

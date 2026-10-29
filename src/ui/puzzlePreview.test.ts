import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../core/geometry/polygon';
import { sampleFishShape, getPuzzle, glintSpot, piecePaths, allGold } from './puzzlePreview';

const puzzle = getPuzzle(sampleFishShape(), 6, 1);

describe('glintSpot', () => {
  it('is inside its piece, the same every time, and gentle in pace', () => {
    for (const piece of puzzle.pieces) {
      const g = glintSpot(piece);
      expect(pointInPolygon(g.at[0], g.at[1], piece.polygon)).toBe(true);
      expect(glintSpot(piece)).toEqual(g);
      // Each glint swells over a whole cycle of at least three seconds: never faster than 3 a second.
      expect(g.period).toBeGreaterThanOrEqual(3);
      expect(g.phase).toBeLessThan(g.period);
    }
  });

  it('is not the same moment on every piece, so the pieces do not blink together', () => {
    const phases = new Set(puzzle.pieces.map((p) => glintSpot(p).phase.toFixed(3)));
    expect(phases.size).toBe(puzzle.pieces.length);
  });
});

describe('piecePaths', () => {
  const count = (svg: string, what: string): number => svg.split(what).length - 1;

  it('draws gold pieces with the silk gradient and one glint each, hidden from screen readers', () => {
    const svg = piecePaths(puzzle, allGold(6));
    expect(count(svg, 'data-tone="gold"')).toBe(6);
    expect(count(svg, 'fill="url(#gold-silk)"')).toBe(6);
    expect(count(svg, 'class="glint"')).toBe(6);
    expect(count(svg, 'aria-hidden="true"')).toBe(6);
  });

  it('gives white and tan pieces no glint', () => {
    const svg = piecePaths(puzzle, [0, 0, 1, 1, 0, 1]);
    expect(count(svg, 'class="glint"')).toBe(0);
    expect(count(svg, 'data-tone="white"')).toBe(3);
    expect(count(svg, 'data-tone="tan"')).toBe(3);
  });
});

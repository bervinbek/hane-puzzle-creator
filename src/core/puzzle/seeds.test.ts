import { Delaunay } from 'd3-delaunay';
import { describe, expect, it } from 'vitest';
import { pointInPolygon, type Vec2 } from '../geometry/polygon';
import { mulberry32 } from '../rng';
import { FISH_OUTLINE } from '../samples/fish';
import { greedyColouring } from './colouring';
import { placeSeeds } from './seeds';

const SQUARE: Vec2[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

describe('placeSeeds', () => {
  it('returns the requested number of seeds, all inside the outline', () => {
    for (const outline of [SQUARE, FISH_OUTLINE]) {
      for (const n of [1, 2, 6, 24, 60]) {
        const seeds = placeSeeds(outline, n, mulberry32(3));
        expect(seeds).toHaveLength(n);
        for (const [x, y] of seeds) expect(pointInPolygon(x, y, outline)).toBe(true);
      }
    }
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(placeSeeds(FISH_OUTLINE, 12, mulberry32(5))).toEqual(
      placeSeeds(FISH_OUTLINE, 12, mulberry32(5)),
    );
    expect(placeSeeds(FISH_OUTLINE, 12, mulberry32(5))).not.toEqual(
      placeSeeds(FISH_OUTLINE, 12, mulberry32(6)),
    );
  });

  it('gives cells of roughly even area on a square', () => {
    const n = 16;
    const seeds = placeSeeds(SQUARE, n, mulberry32(11));
    const delaunay = Delaunay.from(seeds as [number, number][]);
    const areas = new Array<number>(n).fill(0);
    for (let y = 0.5; y < 100; y++) {
      for (let x = 0.5; x < 100; x++) areas[delaunay.find(x, y)]!++;
    }
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(2.5);
  });
});

describe('greedyColouring', () => {
  it('never gives touching pieces the same colour on a Voronoi layout', () => {
    for (const n of [6, 12, 24, 48]) {
      const seeds = placeSeeds(SQUARE, n, mulberry32(n));
      const delaunay = Delaunay.from(seeds as [number, number][]);
      const voronoi = delaunay.voronoi([0, 0, 100, 100]);
      const neighbours = seeds.map((_, i) => [...voronoi.neighbors(i)]);
      const colours = greedyColouring(neighbours, 6);
      neighbours.forEach((adjacent, i) => {
        for (const j of adjacent) expect(colours[j]).not.toBe(colours[i]);
      });
    }
  });

  it('wraps around instead of failing when the palette is too small', () => {
    const triangle = [
      [1, 2],
      [0, 2],
      [0, 1],
    ];
    expect(greedyColouring(triangle, 2)).toHaveLength(3);
  });
});

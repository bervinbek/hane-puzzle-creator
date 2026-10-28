import { Delaunay } from 'd3-delaunay';
import { bounds, type Vec2 } from '../core/geometry/polygon';
import { fitToPlate } from '../core/geometry/polyline';
import { greedyColouring } from '../core/puzzle/colouring';
import { placeSeeds } from '../core/puzzle/seeds';
import { usablePlateSize } from '../core/printer/a1mini';
import { mulberry32 } from '../core/rng';
import { FISH_EYE, FISH_OUTLINE } from '../core/samples/fish';

/** Sketchbook pastels for the piece preview. Neighbouring pieces never share one. */
export const PASTELS = ['#ffadad', '#fff1a8', '#9bf6ff', '#bdb2ff', '#caffbf', '#ffd6a5'] as const;

export type PreviewMode = 'outline' | 'pieces' | 'print';

/** An outline in millimetres (centred, y up) that the puzzle is cut from. */
export interface PuzzleShape {
  /** Changes whenever the outline changes, so cached cuts are not reused. */
  id: number;
  points: readonly Vec2[];
  /** Where to draw an eye (only the built-in fish has one). */
  eye?: Vec2;
  widthMm: number;
  heightMm: number;
}

let nextId = 1;

export function makeShape(points: readonly Vec2[], eye?: Vec2): PuzzleShape {
  const b = bounds(points);
  return {
    id: nextId++,
    points,
    eye,
    widthMm: b.maxX - b.minX,
    heightMm: b.maxY - b.minY,
  };
}

let sample: PuzzleShape | null = null;

/** The built-in example fish, scaled to fill the plate. */
export function sampleFishShape(): PuzzleShape {
  if (!sample) {
    const fit = fitToPlate(FISH_OUTLINE, usablePlateSize());
    sample = makeShape(fit.points, fit.toMm(FISH_EYE));
  }
  return sample;
}

interface Cell {
  d: string;
  colour: number;
}

let cached: { key: string; cells: Cell[] } | null = null;

/** Example cut: seeds + Voronoi cells for the shape. Real tabs arrive in M2. */
function cellsFor(shape: PuzzleShape, count: number, seed: number): Cell[] {
  const key = `${shape.id}:${count}:${seed}`;
  if (cached?.key === key) return cached.cells;

  const b = bounds(shape.points);
  const seeds = placeSeeds(shape.points, count, mulberry32(seed));
  const delaunay = Delaunay.from(seeds as [number, number][]);
  const voronoi = delaunay.voronoi([b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1]);
  const neighbours = seeds.map((_, i) => [...delaunay.neighbors(i)]);
  const colours = greedyColouring(neighbours, PASTELS.length);
  const cells = seeds.map((_, i) => ({ d: voronoi.renderCell(i), colour: colours[i] ?? 0 }));

  cached = { key, cells };
  return cells;
}

const toPoints = (pts: readonly Vec2[]): string =>
  pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/**
 * SVG of a puzzle shape. `outline` is the plain shape, `pieces` the pastel cut,
 * `print` the same cut in the team's filament colour. Shape coordinates are y up, so the
 * drawing group is flipped.
 */
export function shapeSvg(
  shape: PuzzleShape,
  mode: PreviewMode,
  count: number,
  seed: number,
  teamHex: string,
): string {
  const b = bounds(shape.points);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = size * 0.03;
  const outer = size / 110;
  const inner = size / 150;
  const label =
    mode === 'outline'
      ? 'Your drawing as a shape'
      : `Your drawing cut into ${count} pieces${mode === 'print' ? ', in your team colour' : ''}`;
  const open = `<svg class="shape" viewBox="${(b.minX - pad).toFixed(2)} ${(-b.maxY - pad).toFixed(2)} ${(b.maxX - b.minX + 2 * pad).toFixed(2)} ${(b.maxY - b.minY + 2 * pad).toFixed(2)}" role="img" aria-label="${label}"><g transform="scale(1 -1)">`;
  const points = toPoints(shape.points);

  const eye = shape.eye
    ? `<circle cx="${shape.eye[0].toFixed(2)}" cy="${shape.eye[1].toFixed(2)}" r="${(size / 37).toFixed(2)}" fill="#fff" stroke="#2b2d42" stroke-width="${(inner * 0.7).toFixed(2)}"/>
       <circle cx="${(shape.eye[0] + size / 160).toFixed(2)}" cy="${shape.eye[1].toFixed(2)}" r="${(size / 80).toFixed(2)}" fill="#2b2d42"/>`
    : '';

  if (mode === 'outline') {
    return `${open}
      <polygon points="${points}" fill="#fff" stroke="#2b2d42" stroke-width="${outer.toFixed(2)}" stroke-linejoin="round"/>
      ${eye}</g></svg>`;
  }

  const cells = cellsFor(shape, count, seed);
  const fill = (c: Cell): string => (mode === 'print' ? teamHex : PASTELS[c.colour]!);
  const line = mode === 'print' ? '#fffbef' : '#2b2d42';
  return `${open}
    <defs><clipPath id="shape-clip"><polygon points="${points}"/></clipPath></defs>
    <g clip-path="url(#shape-clip)" stroke="${line}" stroke-width="${inner.toFixed(2)}" stroke-linejoin="round">
      ${cells.map((c) => `<path d="${c.d}" fill="${fill(c)}"/>`).join('')}
    </g>
    <polygon points="${points}" fill="none" stroke="#2b2d42" stroke-width="${outer.toFixed(2)}" stroke-linejoin="round"/>
    ${mode === 'pieces' ? eye : ''}</g></svg>`;
}

/** The student's photo with the traced outline laid over it (pixel coordinates, y down). */
export function photoSvg(
  url: string,
  width: number,
  height: number,
  outlinePx: readonly Vec2[] | null,
): string {
  const stroke = Math.max(width, height) / 190;
  const overlay = outlinePx
    ? `<polygon points="${toPoints(outlinePx)}" fill="rgba(47,91,234,.16)" stroke="#2f5bea" stroke-width="${stroke.toFixed(2)}" stroke-linejoin="round"/>`
    : '';
  return `<svg class="photo" viewBox="0 0 ${width} ${height}" role="img" aria-label="${
    outlinePx ? 'Your photo with a blue line around the animal' : 'Your photo'
  }"><image href="${url}" width="${width}" height="${height}"/>${overlay}</svg>`;
}

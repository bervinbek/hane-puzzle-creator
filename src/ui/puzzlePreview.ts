import { Delaunay } from 'd3-delaunay';
import { greedyColouring } from '../core/puzzle/colouring';
import { placeSeeds } from '../core/puzzle/seeds';
import { mulberry32 } from '../core/rng';
import { FISH_EYE, FISH_OUTLINE, FISH_SIZE } from '../core/samples/fish';

/** Sketchbook pastels for the piece preview. Neighbouring pieces never share one. */
export const PASTELS = ['#ffadad', '#fff1a8', '#9bf6ff', '#bdb2ff', '#caffbf', '#ffd6a5'] as const;

export type PreviewMode = 'outline' | 'pieces' | 'print';

interface Cell {
  d: string;
  colour: number;
}

let cached: { key: string; cells: Cell[] } | null = null;

/** Example cut: seeds + Voronoi cells for the sample fish. Real tabs arrive in M2. */
function cellsFor(count: number, seed: number): Cell[] {
  const key = `${count}:${seed}`;
  if (cached?.key === key) return cached.cells;

  const seeds = placeSeeds(FISH_OUTLINE, count, mulberry32(seed));
  const delaunay = Delaunay.from(seeds as [number, number][]);
  const voronoi = delaunay.voronoi([0, 0, FISH_SIZE.width, FISH_SIZE.height]);
  const neighbours = seeds.map((_, i) => [...delaunay.neighbors(i)]);
  const colours = greedyColouring(neighbours, PASTELS.length);
  const cells = seeds.map((_, i) => ({ d: voronoi.renderCell(i), colour: colours[i] ?? 0 }));

  cached = { key, cells };
  return cells;
}

const points = FISH_OUTLINE.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

const eye = `
  <circle cx="${FISH_EYE[0]}" cy="${FISH_EYE[1]}" r="6.5" fill="#fff" stroke="#2b2d42" stroke-width="1.6"/>
  <circle cx="${FISH_EYE[0] + 1.5}" cy="${FISH_EYE[1]}" r="3" fill="#2b2d42"/>`;

/**
 * SVG of the sample fish. `outline` is the picked drawing, `pieces` the pastel cut,
 * `print` the same cut in the team's filament colour.
 */
export function fishSvg(mode: PreviewMode, count: number, seed: number, teamHex: string): string {
  const label =
    mode === 'outline'
      ? 'Sample fish drawing'
      : `Sample fish cut into ${count} pieces${mode === 'print' ? ', in your team colour' : ''}`;
  const open = `<svg class="fish" viewBox="-6 -6 ${FISH_SIZE.width + 12} ${FISH_SIZE.height + 12}" role="img" aria-label="${label}">`;

  if (mode === 'outline') {
    return `${open}
      <polygon points="${points}" fill="#fff" stroke="#2b2d42" stroke-width="3" stroke-linejoin="round"/>
      ${eye}</svg>`;
  }

  const cells = cellsFor(count, seed);
  const fill = (c: Cell): string => (mode === 'print' ? teamHex : PASTELS[c.colour]!);
  const line = mode === 'print' ? '#fffbef' : '#2b2d42';
  return `${open}
    <defs><clipPath id="fish-clip"><polygon points="${points}"/></clipPath></defs>
    <g clip-path="url(#fish-clip)" stroke="${line}" stroke-width="2.4" stroke-linejoin="round">
      ${cells.map((c) => `<path d="${c.d}" fill="${fill(c)}"/>`).join('')}
    </g>
    <polygon points="${points}" fill="none" stroke="#2b2d42" stroke-width="3" stroke-linejoin="round"/>
    ${mode === 'pieces' ? eye : ''}</svg>`;
}

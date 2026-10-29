import { bounds, type Vec2 } from '../core/geometry/polygon';
import { fitToPlate } from '../core/geometry/polyline';
import { DEFAULT_PUZZLE, generatePuzzle, type Puzzle } from '../core/puzzle/generate';
import type { Tone } from '../core/puzzle/reveal';
import { usablePlateSize } from '../core/printer/a1mini';
import {
  DEFAULT_TEACHER,
  scaleToMax,
  teacherParams,
  type TeacherSettings,
} from '../core/puzzle/settings';
import { FISH_EYE, FISH_OUTLINE } from '../core/samples/fish';
import { FILAMENTS } from './presets';

/** The three plastics, by how far a piece has got: white, tan, gold (the same order as `Tone`). */
export const TONE_FILL: readonly string[] = [
  FILAMENTS[2]!.hex,
  FILAMENTS[1]!.hex,
  FILAMENTS[0]!.hex,
];
/** The words for each tone: colour is never the only signal. */
export const TONE_NAME: readonly string[] = ['White', 'Tan', 'Gold'];

/** The three prints, in the order they are printed: white, then tan, then gold. */
export const PRINT_COLOURS: readonly string[] = TONE_FILL;

/** Every piece gold: the finished puzzle. */
export const allGold = (count: number): Tone[] => new Array<Tone>(count).fill(2);

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
  /** How much smaller than the drawing this is (1 unless the teacher capped the size). */
  scale: number;
}

let nextId = 1;

export function makeShape(points: readonly Vec2[], eye?: Vec2, scale = 1): PuzzleShape {
  const b = bounds(points);
  return {
    id: nextId++,
    points,
    eye,
    widthMm: b.maxX - b.minX,
    heightMm: b.maxY - b.minY,
    scale,
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

const sized = new WeakMap<PuzzleShape, Map<number, PuzzleShape>>();

/** The shape at the teacher's size cap: scaled down if it is bigger, never scaled up. */
export function sizedShape(shape: PuzzleShape, maxMm: number): PuzzleShape {
  const longest = Math.max(shape.widthMm, shape.heightMm);
  if (longest <= maxMm + 1e-9) return shape;
  let byCap = sized.get(shape);
  if (!byCap) sized.set(shape, (byCap = new Map()));
  let out = byCap.get(maxMm);
  if (!out) {
    const { points, factor } = scaleToMax(shape.points, longest, maxMm);
    out = makeShape(points, shape.eye && [shape.eye[0] * factor, shape.eye[1] * factor], factor);
    byCap.set(maxMm, out);
  }
  return out;
}

let cached: { key: string; puzzle: Puzzle } | null = null;

/** The real puzzle (tabs and clearance included) for a shape. Remembers the last one asked for. */
export function getPuzzle(
  shape: PuzzleShape,
  count: number,
  seed: number,
  teacher: TeacherSettings = DEFAULT_TEACHER,
  seeds?: readonly Vec2[],
): Puzzle {
  const where = seeds ? seeds.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(';') : '';
  const key = `${shape.id}:${count}:${seed}:${teacher.clearance}:${teacher.tabAmount}:${where}`;
  if (cached?.key !== key) {
    const params = {
      ...DEFAULT_PUZZLE,
      count,
      seed,
      ...teacherParams(teacher),
      ...(seeds ? { seeds } : {}),
    };
    cached = { key, puzzle: generatePuzzle(shape.points, params) };
  }
  return cached.puzzle;
}

const toPoints = (pts: readonly Vec2[]): string =>
  pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

const toPath = (pts: readonly Vec2[]): string =>
  `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

/** Width of the picture `shapeSvg` makes, in the shape's own millimetres (the shape plus its margin). */
export function previewWidthMm(shape: PuzzleShape): number {
  const b = bounds(shape.points);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return b.maxX - b.minX + 2 * size * 0.03;
}

/**
 * The pieces as SVG paths, each in the colour of its tone. Tan pieces also carry stripes, so the
 * state shows without colour.
 */
export function piecePaths(puzzle: Puzzle, tones: readonly Tone[]): string {
  return puzzle.pieces
    .map((p) => {
      const tone = tones[p.id] ?? 2;
      const d = toPath(p.polygon);
      return (
        `<path d="${d}" fill="${TONE_FILL[tone]}" data-tone="${TONE_NAME[tone]!.toLowerCase()}"/>` +
        (tone === 1 ? `<path d="${d}" fill="url(#tan-stripes)" stroke="none"/>` : '')
      );
    })
    .join('');
}

/** Dots on the cut points that can be dragged, with a radius in the shape's millimetres. */
export interface CutHandles {
  radius: number;
}

/**
 * SVG of a puzzle shape. `outline` is the plain shape, `pieces` the cut puzzle in the given
 * tones, `print` the same pieces all gold. Shape coordinates are y up, so the
 * drawing group is flipped.
 */
export function shapeSvg(
  shape: PuzzleShape,
  mode: PreviewMode,
  count: number,
  seed: number,
  tones: readonly Tone[] | undefined,
  teacher: TeacherSettings = DEFAULT_TEACHER,
  seeds?: readonly Vec2[],
  handles?: CutHandles,
): string {
  const b = bounds(shape.points);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = size * 0.03;
  const outer = size / 110;
  const inner = size / 150;

  const puzzle = mode === 'outline' ? null : getPuzzle(shape, count, seed, teacher, seeds);
  const label =
    mode === 'outline'
      ? 'Your drawing as a shape'
      : `Your drawing cut into ${puzzle!.pieces.length} pieces${mode === 'print' ? ', in gold' : ''}`;
  const open = `<svg class="shape" viewBox="${(b.minX - pad).toFixed(2)} ${(-b.maxY - pad).toFixed(2)} ${(b.maxX - b.minX + 2 * pad).toFixed(2)} ${(b.maxY - b.minY + 2 * pad).toFixed(2)}" role="img" aria-label="${label}"><g transform="scale(1 -1)">`;

  const eye = shape.eye
    ? `<circle cx="${shape.eye[0].toFixed(2)}" cy="${shape.eye[1].toFixed(2)}" r="${(size / 37).toFixed(2)}" fill="#fff" stroke="#2b2d42" stroke-width="${(inner * 0.7).toFixed(2)}"/>
       <circle cx="${(shape.eye[0] + size / 160).toFixed(2)}" cy="${shape.eye[1].toFixed(2)}" r="${(size / 80).toFixed(2)}" fill="#2b2d42"/>`
    : '';

  if (mode === 'outline') {
    return `${open}
      <polygon points="${toPoints(shape.points)}" fill="#fff" stroke="#2b2d42" stroke-width="${outer.toFixed(2)}" stroke-linejoin="round"/>
      ${eye}</g></svg>`;
  }

  const dots = handles
    ? `<g class="cut-handles">${puzzle!.seeds
        .map(
          ([x, y], i) =>
            `<circle class="cut-dot" data-seed="${i}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${handles.radius.toFixed(2)}" tabindex="0" role="button" aria-label="Cut point ${i + 1} of ${puzzle!.seeds.length}. Drag it, or use the arrow keys."/>`,
        )
        .join('')}</g>`
    : '';
  const stripe = size / 90;
  const defs = `<defs><pattern id="tan-stripes" width="${stripe.toFixed(2)}" height="${stripe.toFixed(2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${(stripe * 0.28).toFixed(2)}" height="${stripe.toFixed(2)}" fill="#8a6a4a" fill-opacity=".55"/></pattern></defs>`;
  return `${open}${defs}
    <g class="cut-pieces" stroke="#2b2d42" stroke-width="${inner.toFixed(2)}" stroke-linejoin="round">
      ${piecePaths(puzzle!, mode === 'print' || !tones ? allGold(puzzle!.pieces.length) : tones)}
    </g>
    ${mode === 'pieces' ? eye : ''}${dots}</g></svg>`;
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

import { bounds, pointInPolygon, type Vec2 } from '../core/geometry/polygon';
import { centroid, fitToPlate } from '../core/geometry/polyline';
import { mulberry32 } from '../core/rng';
import { DEFAULT_PUZZLE, generatePuzzle, type Piece, type Puzzle } from '../core/puzzle/generate';
import { driftVector, type Tone } from '../core/puzzle/reveal';
import { usablePlateSize } from '../core/printer/a1mini';
import {
  DEFAULT_TEACHER,
  scaleToMax,
  teacherParams,
  type TeacherSettings,
} from '../core/puzzle/settings';
import { FISH_EYE, FISH_OUTLINE } from '../core/samples/fish';
import { FILAMENTS } from './presets';

/**
 * Silk gold: a warm highlight, the filament's own gold, and a deeper amber shadow, laid across
 * each piece corner to corner (the numbers are in docs/DESIGN.md). Keep in step with `--gold-*`
 * in tokens.css and the 3D finish in render/finish.ts.
 */
const GOLD_SILK =
  '<linearGradient id="gold-silk" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#ffe9a6"/><stop offset=".3" stop-color="#f0bf45"/>' +
  '<stop offset=".55" stop-color="#e0a82e"/><stop offset=".82" stop-color="#b87a10"/>' +
  '<stop offset="1" stop-color="#f1c658"/></linearGradient>';

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
): Puzzle {
  const key = `${shape.id}:${count}:${seed}:${teacher.clearance}:${teacher.tabAmount}:${teacher.magnetFit}`;
  if (cached?.key !== key) {
    const params = {
      ...DEFAULT_PUZZLE,
      count,
      seed,
      ...teacherParams(teacher),
    };
    cached = { key, puzzle: generatePuzzle(shape.points, params) };
  }
  return cached.puzzle;
}

const toPoints = (pts: readonly Vec2[]): string =>
  pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

const toPath = (pts: readonly Vec2[]): string =>
  `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

/**
 * Where a piece's glint sits: near the middle of the piece, moved a little by a seed made from
 * the piece, and always inside it. `r` is the glint's size.
 */
export function glintSpot(piece: Piece): { at: Vec2; r: number; phase: number; period: number } {
  const b = bounds(piece.polygon);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  const rng = mulberry32(Math.imul(piece.id + 1, 0x9e3779b1) ^ 0x51ed);
  const middle = centroid(piece.polygon);
  let at = middle;
  for (let i = 0; i < 6; i++) {
    const guess: Vec2 = [
      middle[0] + (rng() - 0.5) * width * 0.4,
      middle[1] + (rng() - 0.5) * height * 0.4,
    ];
    if (pointInPolygon(guess[0], guess[1], piece.polygon)) {
      at = guess;
      break;
    }
  }
  const period = 3 + rng() * 1.6;
  return { at, r: Math.max(1.6, Math.min(width, height) * 0.12), phase: rng() * period, period };
}

/** A four-point star of "radius" r, centred on the origin. */
const starPath = (r: number): string => {
  const k = r * 0.14;
  return `M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}Z`;
};

/**
 * One gold piece: a silk-gold gradient across the piece, a soft rim light just inside its edge, the
 * dark outline on top, and a glint that twinkles (see `.glint` in app.css). Only the fill carries
 * `data-tone`. The glint is decoration: a screen reader gets the picture's own label.
 */
function goldPiece(p: Piece, d: string, stroke: number): string {
  const glint = glintSpot(p);
  return (
    `<clipPath id="gold-clip-${p.id}"><path d="${d}"/></clipPath>` +
    `<path d="${d}" fill="url(#gold-silk)" stroke="none" data-tone="gold"/>` +
    `<path d="${d}" fill="none" stroke="#fff4c4" stroke-opacity=".6" stroke-width="${(stroke * 3).toFixed(2)}" clip-path="url(#gold-clip-${p.id})"/>` +
    `<path d="${d}" fill="none"/>` +
    `<g transform="translate(${glint.at[0].toFixed(2)} ${glint.at[1].toFixed(2)})" aria-hidden="true">` +
    `<path class="glint" d="${starPath(glint.r)}" fill="#fffdf0" stroke="none" style="animation-duration:${glint.period.toFixed(2)}s;animation-delay:-${glint.phase.toFixed(2)}s"/></g>`
  );
}

/**
 * The pieces as SVG paths, each in the colour of its tone. Tan pieces also carry stripes, so the
 * state shows without colour. Gold pieces get the silk-gold look and a glint.
 */
export function piecePaths(puzzle: Puzzle, tones: readonly Tone[], drift?: PieceDrift): string {
  const stroke = strokeWidth(puzzle);
  const draw = (p: Piece): string => {
    const tone = tones[p.id] ?? 2;
    const d = toPath(p.polygon);
    if (tone === 2) return goldPiece(p, d, stroke);
    return (
      `<path d="${d}" fill="${TONE_FILL[tone]}" data-tone="${TONE_NAME[tone]!.toLowerCase()}"/>` +
      (tone === 1 ? `<path d="${d}" fill="url(#tan-stripes)" stroke="none"/>` : '')
    );
  };
  const moving = drift ? puzzle.pieces.find((p) => p.id === drift.id) : undefined;
  if (!drift || !moving) return puzzle.pieces.map(draw).join('');
  // The drifting piece is drawn last so it slides over its neighbours, not under them.
  const [dx, dy] = driftOf(puzzle, moving);
  return (
    puzzle.pieces
      .filter((p) => p !== moving)
      .map(draw)
      .join('') +
    `<g class="drift" style="--dx:${dx.toFixed(2)};--dy:${dy.toFixed(2)};animation-duration:${Math.round(drift.ms)}ms">${draw(moving)}</g>`
  );
}

/** The width of a piece's outline: the same as `shapeSvg` draws between pieces. */
function strokeWidth(puzzle: Puzzle): number {
  const b = bounds(puzzle.pieces.flatMap((p) => p.polygon));
  return Math.max(b.maxX - b.minX, b.maxY - b.minY) / 150;
}

/** The piece that is being upgraded right now, and how long its drift takes. */
export interface PieceDrift {
  id: number;
  ms: number;
}

/** Where a piece drifts to: away from the middle of the puzzle by about 5% of its width. */
function driftOf(puzzle: Puzzle, piece: Piece): Vec2 {
  const all = bounds(puzzle.pieces.flatMap((p) => p.polygon));
  const mine = bounds(piece.polygon);
  const diagonal = Math.hypot(all.maxX - all.minX, all.maxY - all.minY);
  return driftVector(
    [(all.minX + all.maxX) / 2, (all.minY + all.maxY) / 2],
    [(mine.minX + mine.maxX) / 2, (mine.minY + mine.maxY) / 2],
    Math.max(2, diagonal * 0.05),
  );
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
): string {
  const b = bounds(shape.points);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = size * 0.03;
  const outer = size / 110;
  const inner = size / 150;

  const puzzle = mode === 'outline' ? null : getPuzzle(shape, count, seed, teacher);
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

  const stripe = size / 90;
  const defs = `<defs><pattern id="tan-stripes" width="${stripe.toFixed(2)}" height="${stripe.toFixed(2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${(stripe * 0.28).toFixed(2)}" height="${stripe.toFixed(2)}" fill="#8a6a4a" fill-opacity=".55"/></pattern>${GOLD_SILK}</defs>`;
  return `${open}${defs}
    <g class="cut-pieces" stroke="#2b2d42" stroke-width="${inner.toFixed(2)}" stroke-linejoin="round">
      ${piecePaths(puzzle!, mode === 'print' || !tones ? allGold(puzzle!.pieces.length) : tones)}
    </g>
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
